import streamDeck, {
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
    DidReceiveSettingsEvent,
    PropertyInspectorDidAppearEvent,
    type SendToPluginEvent,
} from "@elgato/streamdeck";
import { metricStore, type MetricStoreReader, type MetricWidgetDataReadResult } from "../runtime/metric-store";
import {
    normalizeMetricReadPlan,
    selectMetricReadRouteSourceCandidates,
    type MetricReadPlan,
} from "../runtime/source-routing/metric-read-plan";
import { buildMetricReadPlanFromSourcePolicy } from "../runtime/source-routing/metric-read-plan-builder";
import {
    clearMetricViewState,
    setMetricViewPollingInterval,
} from "../view-updates/runner";
import { logger } from "../logging/logger";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    resolveActionSettings,
    resolveInitialActionSettings,
} from "./settings/action-settings-resolver";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import type { ActionKind } from "../shared/stream-deck-actions";
import {
    emptyWidgetRuntimeCache,
    WIDGET_RUNTIME_CACHE_MESSAGE_TYPE,
    type WidgetRuntimeCache,
    type WidgetRuntimeCacheMessage,
    type WidgetRuntimeCachePatch,
    type DisplayedMetricReadOutcome,
    type DisplayedRawSensorIdentity,
    WidgetRuntimeCacheStore,
} from "../runtime/widget-runtime-cache";
import {
    clearColorCompensationActionPreview,
    handleColorCompensationPluginMessage,
} from "../color-compensation/plugin-controller";
import {
    BackgroundCollectionBinding,
    type BackgroundCollectionBindingRefreshOptions,
} from "./shared/background-collection-binding";
import {
    DefaultDisplayedMetricNoDataObserver,
    type DisplayedMetricNoDataObserver,
} from "./shared/displayed-metric-no-data-observer";
import { createFallbackMetricStoreReader } from "../runtime/metric-collection/fallback-composer";
import { backgroundMetricCollection } from "../runtime/metric-collection/background-metric-collection";
import type { MetricSubscription } from "../runtime/metric-collection/metric-subscription-registry";
import {
    type RawSensorIdentity,
    type SourceClientStatus,
} from "../runtime/sources/source-client";
import { wallClockNowMilliseconds } from "../shared/clock";

const log = logger.for("MetricAction");

interface ActiveActionState {
    event: WillAppearEvent;
    rawSettings: unknown;
    resolvedSettings: ResolvedWidgetSettings;
    runtimeCacheStore: WidgetRuntimeCacheStore;
    /** Start point for suppressing no-data logs during the initial read gap. */
    appearedAtTimestampMilliseconds: number;
}
interface MetricActionOptions {
    readonly displayedMetricNoDataObserver?: DisplayedMetricNoDataObserver;
}

export interface MetricCollectionBinding {
    refresh(options: BackgroundCollectionBindingRefreshOptions): void;
    dispose(): void;
}

/**
 * Base class for all metric view actions.
 * Handles metric collection subscription lifecycle and real-time settings updates.
 * Subclasses implement `onMetricsUpdate` which is called on every tick.
 */
export abstract class MetricAction extends SingletonAction {
    private activeActionStates = new Map<string, ActiveActionState>();
    private metricCollectionBindings = new Map<string, MetricCollectionBinding>();
    private readonly displayedMetricNoDataObserver: DisplayedMetricNoDataObserver;

    protected abstract readonly actionKind: ActionKind;

    constructor(options: MetricActionOptions = {}) {
        super();
        this.displayedMetricNoDataObserver = options.displayedMetricNoDataObserver
            ?? new DefaultDisplayedMetricNoDataObserver();
        pluginGlobalSettingsStore.subscribe(() => {
            this.resubscribeAllActions();
            for (const activeActionState of this.activeActionStates.values()) {
                this.refreshMetricView(activeActionState.event);
            }
        });
    }

    override onWillAppear(event: WillAppearEvent): void {
        const initialSettings = resolveInitialActionSettings(
            event.payload.settings,
            this.actionKind,
            emptyWidgetRuntimeCache,
        );
        const activeActionState = {
            event,
            rawSettings: initialSettings.rawSettings,
            resolvedSettings: initialSettings.resolvedSettings,
            runtimeCacheStore: new WidgetRuntimeCacheStore(),
            appearedAtTimestampMilliseconds: this.currentTimestampMilliseconds(),
        };

        this.activeActionStates.set(event.action.id, activeActionState);
        if (initialSettings.settingsJsonToPersist) {
            event.action.setSettings(initialSettings.settingsJsonToPersist).catch(error => {
                log.error(() => `Failed to persist quick-start widget settings: ${String(error)}`);
            });
        }
        this.onResolvedSettingsChanged(event, initialSettings.resolvedSettings);
        this.refreshSubscription(activeActionState);
        this.refreshMetricView(event);
    }

    override onDidReceiveSettings(event: DidReceiveSettingsEvent): void {
        const activeActionState = this.activeActionStates.get(event.action.id);
        if (activeActionState) {
            const previousSettings = this.resolveSettings(activeActionState.event);
            const nextInitialSettings = resolveInitialActionSettings(
                event.payload.settings,
                this.actionKind,
                activeActionState.runtimeCacheStore.current(),
            );
            const nextSettings = nextInitialSettings.resolvedSettings;

            log.info(() => [
                "settingsReceived",
                `actionId=${event.action.id}`,
                `previousWidget=${formatResolvedWidgetForLog(previousSettings)}`,
                `nextWidget=${formatResolvedWidgetForLog(nextSettings)}`,
                `previousPollingFrequencySeconds=${formatSettingValue(previousSettings.preferences.pollingFrequencySeconds)}`,
                `nextPollingFrequencySeconds=${formatSettingValue(nextSettings.preferences.pollingFrequencySeconds)}`,
            ].join(" "));

            activeActionState.rawSettings = nextInitialSettings.rawSettings;
            activeActionState.resolvedSettings = nextSettings;
            if (nextInitialSettings.settingsJsonToPersist) {
                event.action.setSettings(nextInitialSettings.settingsJsonToPersist).catch(error => {
                    log.error(() => `Failed to persist quick-start widget settings: ${String(error)}`);
                });
            }
            // Settings can change the displayed metric/source identity even
            // before the next render tick publishes a fresh read trace.
            this.displayedMetricNoDataObserver.clearAction(event.action.id);
            this.onResolvedSettingsChanged(activeActionState.event, nextSettings);
            this.refreshSubscription(activeActionState);
            // Force an immediate update for snappy UI feedback.
            this.refreshMetricView(activeActionState.event);
        }
    }

    override onWillDisappear(event: WillDisappearEvent): void {
        this.onActionWillDisappear(event);
        this.metricCollectionBindings.get(event.action.id)?.dispose();
        this.metricCollectionBindings.delete(event.action.id);
        this.displayedMetricNoDataObserver.clearAction(event.action.id);
        this.activeActionStates.delete(event.action.id);
        clearColorCompensationActionPreview(event.action.id);
        clearMetricViewState(event.action.id);
    }

    override onSendToPlugin(event: SendToPluginEvent<never, Record<string, never>>): void {
        const activeActionState = this.activeActionStates.get(event.action.id);

        handleColorCompensationPluginMessage({
            event,
            activeActionEvent: activeActionState?.event,
            refreshActiveAction: () => {
                if (activeActionState) {
                    this.refreshMetricView(activeActionState.event);
                }
            },
        });
    }

    override onPropertyInspectorDidAppear(event: PropertyInspectorDidAppearEvent): void {
        const activeActionState = this.activeActionStates.get(event.action.id);
        if (!activeActionState) {
            return;
        }

        this.sendRuntimeCachePatchToPropertyInspector(event, activeActionState.runtimeCacheStore.current())
            .catch(error => {
                log.error(() => `Failed to publish runtime cache to Property Inspector: ${String(error)}`);
            })
            .finally(() => {
                this.refreshRuntimeCacheForPropertyInspector(event);
            });
    }

    /**
     * Called on every action render interval or forced refresh. Actions query
     * MetricStore themselves for the specific WidgetData they need.
     */
    protected abstract onMetricsUpdate(event: WillAppearEvent): void;

    protected abstract getMetricKeys(event: WillAppearEvent): readonly string[];

    /**
     * Runs after stored settings resolve but before subscriptions refresh.
     *
     * Source-backed subclasses use this hook to publish runtime-only metadata
     * that read plans need without teaching MetricAction about the source.
     */
    protected onResolvedSettingsChanged(event: WillAppearEvent, settings: ResolvedWidgetSettings): void {
        void event;
        void settings;
    }

    /** Runs before MetricAction removes per-action runtime state. */
    protected onActionWillDisappear(event: WillDisappearEvent): void {
        void event;
    }

    /**
     * Returns the primary metric used for PI source diagnostics.
     *
     * The default treats the first subscribed metric as the widget's displayed
     * value. Multi-metric actions should keep their displayed value first or
     * override this method.
     */
    protected getDisplayedMetricKey(event: WillAppearEvent): string | undefined {
        return this.getMetricKeys(event)[0];
    }

    protected buildMetricCollectionReadPlan(
        event: WillAppearEvent,
        metricKeys: readonly string[],
    ): MetricReadPlan {
        return this.buildReadPlanForMetricKeys(event, metricKeys);
    }

    protected getMetricReader(event: WillAppearEvent): MetricStoreReader {
        const readPlan = this.resolveMetricReadPlan(event);
        const fallbackReadingFreshnessBudgetMilliseconds = resolveFallbackReadingFreshnessBudgetMilliseconds(
            this.actionKind,
            this.resolveSettings(event).preferences.pollingFrequencySeconds,
        );

        return createFallbackMetricStoreReader(metricStore, readPlan, {
            now: () => this.currentTimestampMilliseconds(),
            maximumSampleAgeMilliseconds: fallbackReadingFreshnessBudgetMilliseconds,
        });
    }

    protected refreshMetricKeys(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        metricKeys: readonly string[],
    ): Promise<void> {
        return backgroundMetricCollection.refreshReadPlanOnce(this.buildReadPlanForMetricKeys(event, metricKeys))
            .then(() => undefined);
    }

    protected resolveSettings(event: WillAppearEvent | PropertyInspectorDidAppearEvent): ResolvedWidgetSettings {
        return this.resolveSettingsForAction(event.action.id);
    }

    protected resolveSettingsForAction(actionId: string): ResolvedWidgetSettings {
        const activeActionState = this.activeActionStates.get(actionId);
        if (!activeActionState) {
            throw new Error(`Action ${actionId} is not active; cannot resolve settings.`);
        }

        return activeActionState.resolvedSettings;
    }

    protected updateRuntimeCache(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        patch: WidgetRuntimeCachePatch,
    ): Promise<void> {
        const activeActionState = this.activeActionStates.get(event.action.id);
        if (!activeActionState) {
            throw new Error(`Action ${event.action.id} is not active; cannot update runtime cache.`);
        }

        if (!activeActionState.runtimeCacheStore.update(patch)) {
            return Promise.resolve();
        }

        activeActionState.resolvedSettings = this.resolveRawSettings(
            activeActionState.rawSettings,
            activeActionState.runtimeCacheStore.current(),
        );

        return this.sendRuntimeCachePatchToPropertyInspector(event, patch);
    }

    protected refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        void event;
    }

    protected sendRuntimeCachePatchToPropertyInspector(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        patch: WidgetRuntimeCachePatch,
    ): Promise<void> {
        if (streamDeck.ui.action?.id !== event.action.id) {
            return Promise.resolve();
        }

        const message: WidgetRuntimeCacheMessage = {
            type: WIDGET_RUNTIME_CACHE_MESSAGE_TYPE,
            patch,
        };

        return streamDeck.ui.sendToPropertyInspector(
            message as unknown as Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0],
        );
    }

    private refreshSubscription(activeActionState: ActiveActionState): void {
        const { event } = activeActionState;
        const pollingFrequencySeconds = this.resolveSettings(event).preferences.pollingFrequencySeconds;
        const pollingIntervalMilliseconds = resolvePollingIntervalMilliseconds(this.actionKind, pollingFrequencySeconds);
        setMetricViewPollingInterval(event.action.id, pollingIntervalMilliseconds);
        const maximumSampleAgeMilliseconds = resolveFallbackReadingFreshnessBudgetMilliseconds(
            this.actionKind,
            pollingFrequencySeconds,
        );
        const metricKeys = this.getMetricKeys(event);

        if (metricKeys.length === 0) {
            this.metricCollectionBindings.get(event.action.id)?.dispose();
            this.metricCollectionBindings.delete(event.action.id);
            return;
        }

        const readPlan = this.buildMetricCollectionReadPlan(event, metricKeys);
        const metricCollectionBinding = this.getOrCreateMetricCollectionBinding(event.action.id);

        metricCollectionBinding.refresh({
            subscriberId: event.action.id,
            readPlan,
            metricSubscriptions: buildMetricSubscriptions({
                subscriberId: event.action.id,
                readPlan,
                intervalMilliseconds: pollingIntervalMilliseconds,
            }),
            pollingIntervalMilliseconds,
            maximumSampleAgeMilliseconds,
            onTick: () => {
                const currentActionState = this.activeActionStates.get(event.action.id);

                if (currentActionState) {
                    this.refreshMetricView(currentActionState.event);
                }
            },
        });
    }

    private getOrCreateMetricCollectionBinding(actionId: string): MetricCollectionBinding {
        const existingBinding = this.metricCollectionBindings.get(actionId);

        if (existingBinding) {
            return existingBinding;
        }

        const binding = this.createMetricCollectionBinding();
        this.metricCollectionBindings.set(actionId, binding);
        return binding;
    }

    protected createMetricCollectionBinding(): MetricCollectionBinding {
        return new BackgroundCollectionBinding();
    }

    protected currentTimestampMilliseconds(): number {
        return wallClockNowMilliseconds();
    }

    protected readCachedSourceStatus(sourceId: string): SourceClientStatus | undefined {
        return backgroundMetricCollection.readCachedSourceStatus(sourceId);
    }

    protected currentPlatform(): NodeJS.Platform {
        return process.platform;
    }

    protected refreshActiveMetricView(event: WillAppearEvent | PropertyInspectorDidAppearEvent): void {
        this.refreshMetricViewForAction(event.action.id);
    }

    protected refreshMetricViewForAction(actionId: string): void {
        const activeActionState = this.activeActionStates.get(actionId);

        if (activeActionState) {
            this.refreshMetricView(activeActionState.event);
        }
    }

    private refreshMetricView(event: WillAppearEvent): void {
        this.onMetricsUpdate(event);
        this.publishDisplayedMetricReadTrace(event);
    }

    private publishDisplayedMetricReadTrace(event: WillAppearEvent): void {
        const displayedMetricKey = this.getDisplayedMetricKey(event);
        if (displayedMetricKey === undefined) {
            // Actions without a displayed metric should not retain older
            // diagnostics from a previous configuration of the same instance.
            this.displayedMetricNoDataObserver.clearAction(event.action.id);
            return;
        }

        const readPlan = this.resolveMetricReadPlan(event);
        const displayedMetric = normalizeMetricReadPlan(readPlan).metrics
            .find(metric => metric.metricKey === displayedMetricKey);
        if (displayedMetric === undefined) {
            // A displayed key outside the normalized read plan is not a valid
            // source diagnostic target for this tick.
            this.displayedMetricNoDataObserver.clearAction(event.action.id);
            return;
        }

        const preferredSourceId = selectMetricReadRouteSourceCandidates(displayedMetric)[0]?.sourceId;
        const preferredSourceStatus = preferredSourceId === undefined
            ? undefined
            : this.readCachedSourceStatus(preferredSourceId);
        const readResult = this.getMetricReader(event).getWidgetDataReadResult(
            displayedMetricKey,
            "",
            "",
        );
        const outcome = buildDisplayedMetricReadOutcome(readResult);
        const activeActionState = this.activeActionStates.get(event.action.id);
        const settings = activeActionState?.resolvedSettings ?? this.resolveSettings(event);
        const pollingIntervalMilliseconds = resolvePollingIntervalMilliseconds(
            this.actionKind,
            settings.preferences.pollingFrequencySeconds,
        );

        if (activeActionState) {
            // The observer is event-fed by render ticks; no-data sustained and
            // recovery logs depend on this path continuing to run for N/A keys.
            this.displayedMetricNoDataObserver.observe({
                actionId: event.action.id,
                metricKey: displayedMetricKey,
                preferredSourceId,
                selectedSourceId: readResult.selectedSourceId,
                preferredSourceStatus,
                outcome,
                actionAppearedAtTimestampMilliseconds: activeActionState.appearedAtTimestampMilliseconds,
                nowMilliseconds: this.currentTimestampMilliseconds(),
                pollingIntervalMilliseconds,
            });
        }

        this.updateRuntimeCache(event, {
            displayedMetricReadTrace: {
                metricKey: displayedMetricKey,
                routing: {
                    preferredSourceId,
                    selectedSourceId: readResult.selectedSourceId,
                },
                ...(preferredSourceStatus ? { preferredSourceStatus } : {}),
                outcome,
            },
        }).catch(error => {
            log.error(() => `Failed to publish displayed metric read trace: ${String(error)}`);
        });
    }

    private resubscribeAllActions(): void {
        for (const activeActionState of this.activeActionStates.values()) {
            const { event } = activeActionState;
            activeActionState.resolvedSettings = this.resolveRawSettings(
                activeActionState.rawSettings,
                activeActionState.runtimeCacheStore.current(),
            );
            // Force a fresh subscribe even when the read plan and polling
            // interval are unchanged. Global settings can affect downstream
            // source resolution without changing this action's plan signature.
            this.metricCollectionBindings.get(event.action.id)?.dispose();
            this.metricCollectionBindings.delete(event.action.id);
            // Global source changes can move the preferred route for the same
            // metric key, so old no-data state must not survive resubscribe.
            this.displayedMetricNoDataObserver.clearAction(event.action.id);
            this.refreshSubscription(activeActionState);
        }
    }

    private resolveRawSettings(rawSettings: unknown, runtimeCache: WidgetRuntimeCache): ResolvedWidgetSettings {
        return resolveActionSettings(rawSettings, runtimeCache);
    }

    private resolveMetricReadPlan(event: WillAppearEvent): MetricReadPlan {
        return this.buildMetricCollectionReadPlan(event, this.getMetricKeys(event));
    }

    private buildReadPlanForMetricKeys(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        metricKeys: readonly string[],
    ): MetricReadPlan {
        if (metricKeys.length === 0) {
            throw new Error(`Action ${this.actionKind} returned no metric keys.`);
        }

        const settings = this.resolveSettings(event);
        const widget = requireResolvedSingleMetricWidget(settings);

        return buildMetricReadPlanFromSourcePolicy({
            metricKeys,
            sourcePolicy: widget.slot.metric.source,
            defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
            platform: this.currentPlatform(),
        });
    }
}

const DEFAULT_POLLING_INTERVAL_MILLISECONDS = 1000;
const ALLOWED_POLLING_FREQUENCY_SECONDS = new Set([1, 2, 3, 5, 10, 15, 30, 60]);
const CUSTOM_METRIC_MAX_POLLING_FREQUENCY_SECONDS = 86400;
const SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS = new Set([60, 180, 300, 600, 1200, 1800, 3600]);
// Gives the background collector one missed interval before fallback render treats its reading as expired.
const FALLBACK_READING_FRESHNESS_GRACE_MILLISECONDS = 5000;

function resolvePollingIntervalMilliseconds(actionKind: ActionKind, pollingFrequencySeconds: number): number {
    if (
        actionKind === "customMetric"
        && Number.isInteger(pollingFrequencySeconds)
        && pollingFrequencySeconds >= 1
        && pollingFrequencySeconds <= CUSTOM_METRIC_MAX_POLLING_FREQUENCY_SECONDS
    ) {
        return pollingFrequencySeconds * 1000;
    }

    if (
        actionKind === "system"
        && SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS.has(pollingFrequencySeconds)
    ) {
        return pollingFrequencySeconds * 1000;
    }

    if (ALLOWED_POLLING_FREQUENCY_SECONDS.has(pollingFrequencySeconds)) {
        return pollingFrequencySeconds * 1000;
    }

    return DEFAULT_POLLING_INTERVAL_MILLISECONDS;
}

function resolveFallbackReadingFreshnessBudgetMilliseconds(
    actionKind: ActionKind,
    pollingFrequencySeconds: number,
): number {
    return resolvePollingIntervalMilliseconds(actionKind, pollingFrequencySeconds)
        + FALLBACK_READING_FRESHNESS_GRACE_MILLISECONDS;
}

function buildMetricSubscriptions(options: {
    readonly subscriberId: string;
    readonly readPlan: MetricReadPlan;
    readonly intervalMilliseconds: number;
}): readonly MetricSubscription[] {
    const readPlan = normalizeMetricReadPlan(options.readPlan);

    return readPlan.metrics.map(metric => ({
        subscriberId: options.subscriberId,
        metricKey: metric.metricKey,
        sourceScopeId: metric.sourceScopeId,
        sourceCandidates: metric.sourceCandidates,
        failureMode: metric.failureMode,
        intervalMilliseconds: options.intervalMilliseconds,
    }));
}

function buildDisplayedMetricReadOutcome(readResult: MetricWidgetDataReadResult): DisplayedMetricReadOutcome | undefined {
    if (readResult.unavailableMetric !== undefined) {
        return {
            kind: "unavailable",
            reason: readResult.unavailableMetric.reason,
            lastValueTimestampMilliseconds: readResult.widgetData.sampleTimestampMilliseconds,
            ...(readResult.unavailableMetric.rawSensorIdentity === undefined
                ? {}
                : { rawSensorIdentity: pickDisplayedRawSensorIdentity(readResult.unavailableMetric.rawSensorIdentity) }),
        };
    }

    const valueTimestampMilliseconds = readResult.widgetData.sampleTimestampMilliseconds;
    if (valueTimestampMilliseconds === undefined) {
        return undefined;
    }

    return {
        kind: "value",
        valueTimestampMilliseconds,
        freshness: readResult.valueMetadata?.valueFreshness ?? "fresh",
        ...(readResult.valueMetadata?.valueFreshness === "retained"
            && readResult.valueMetadata.retainedAgeMilliseconds !== undefined
            ? { retainedAgeMilliseconds: readResult.valueMetadata.retainedAgeMilliseconds }
            : {}),
        ...(readResult.valueMetadata?.rawSensorIdentity === undefined
            ? {}
            : { rawSensorIdentity: pickDisplayedRawSensorIdentity(readResult.valueMetadata.rawSensorIdentity) }),
    };
}

function pickDisplayedRawSensorIdentity(rawSensorIdentity: RawSensorIdentity): DisplayedRawSensorIdentity {
    const displayedRawSensorIdentity = {
        ...(rawSensorIdentity.sourceSensorId.length === 0
            ? {}
            : { sourceSensorId: rawSensorIdentity.sourceSensorId }),
        ...(rawSensorIdentity.hardwareId.length === 0
            ? {}
            : { hardwareId: rawSensorIdentity.hardwareId }),
        ...(rawSensorIdentity.sensorName.length === 0
            ? {}
            : { sensorName: rawSensorIdentity.sensorName }),
        ...(rawSensorIdentity.hardwareName.length === 0
            ? {}
            : { hardwareName: rawSensorIdentity.hardwareName }),
    };

    return displayedRawSensorIdentity;
}

function formatSettingValue(value: unknown): string {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    return "unset";
}

function formatResolvedWidgetForLog(settings: ResolvedWidgetSettings): string {
    switch (settings.widget.widgetKind) {
        case "singleMetric":
            return `singleMetric:${settings.widget.slot.appearance.view.selectedView}`;
        case "denseMultiMetric":
            return `denseMultiMetric:${settings.widget.slots.length}`;
        case "stackedMetric":
            return `stackedMetric:${settings.widget.slots.length}`;
    }
}
