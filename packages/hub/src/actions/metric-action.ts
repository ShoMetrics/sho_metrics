import streamDeck, {
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
    DidReceiveSettingsEvent,
    type DialDownEvent,
    KeyDownEvent,
    PropertyInspectorDidAppearEvent,
    type SendToPluginEvent,
} from "@elgato/streamdeck";
import { metricStore, type MetricStoreReader, type MetricWidgetDataReadResult } from "../runtime/metric-store";
import {
    listMetricReadPlanKeys,
    normalizeMetricReadPlan,
    selectMetricReadRouteSourceCandidates,
    type MetricReadPlan,
} from "../runtime/source-routing/metric-read-plan";
import { buildMetricReadPlanFromSourcePolicy } from "../runtime/source-routing/metric-read-plan-builder";
import {
    clearMetricViewState,
    setMetricViewPollingInterval,
    type MetricViewOptions,
} from "../view-updates/runner";
import { logger } from "../logging/logger";
import { formatMetricKeyFieldsForLog } from "../logging/log-format";
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
    readPropertyInspectorDiagnosticMessage,
    type PropertyInspectorDiagnosticLevel,
} from "../property-inspector/diagnostic-messages";
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
import {
    isBatteryMetricKey,
    isVendorHidBatteryMetricKey,
} from "../runtime/metric-keys";
import {
    SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS,
    VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECONDS,
} from "../settings/polling-frequency-options";

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

/** Tracks one manual refresh acknowledgement badge until the request settles and the badge is readable. */
interface ManualRefreshFeedbackState {
    minimumVisibleTimer: ReturnType<typeof setTimeout> | undefined;
    requestSettled: boolean;
    minimumVisibleElapsed: boolean;
}

/** Live background collection subscription owned by one rendered action. */
export interface MetricCollectionBinding {
    refresh(options: BackgroundCollectionBindingRefreshOptions): void;
    dispose(): void;
}

const MANUAL_REFRESH_FEEDBACK_MINIMUM_VISIBLE_MILLISECONDS = 300;

/**
 * Base class for all metric view actions.
 * Handles metric collection subscription lifecycle and real-time settings updates.
 * Subclasses implement `onMetricsUpdate` which is called on every tick.
 */
export abstract class MetricAction extends SingletonAction {
    private activeActionStates = new Map<string, ActiveActionState>();
    private metricCollectionBindings = new Map<string, MetricCollectionBinding>();
    private manualRefreshFeedbackStates = new Map<string, ManualRefreshFeedbackState>();
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
        this.clearManualRefreshFeedback(event.action.id, { refreshMetricView: false });
        this.displayedMetricNoDataObserver.clearAction(event.action.id);
        this.activeActionStates.delete(event.action.id);
        clearColorCompensationActionPreview(event.action.id);
        clearMetricViewState(event.action.id);
    }

    override onKeyDown(event: KeyDownEvent): void {
        this.requestManualRefreshFromInteraction(event.action.id);
    }

    override onDialDown(event: DialDownEvent): void {
        this.requestManualRefreshFromInteraction(event.action.id);
    }

    override onSendToPlugin(event: SendToPluginEvent<never, Record<string, never>>): void {
        const diagnosticMessage = readPropertyInspectorDiagnosticMessage(event.payload);
        if (diagnosticMessage !== null) {
            writePropertyInspectorDiagnosticLog(diagnosticMessage.level, diagnosticMessage.message);
            return;
        }

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
            log.warn(() => [
                "propertyInspectorDidAppearMissingAction",
                `actionId=${event.action.id}`,
                `actionKind=${this.actionKind}`,
            ].join(" "));
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
     * Returns the metric key used for no-data and source diagnostics.
     *
     * The default uses the first subscribed metric. Multi-metric actions should
     * return the primary diagnostic key, not every rendered metric.
     */
    protected getSourceDiagnosticMetricKey(event: WillAppearEvent): string | undefined {
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
        const fallbackReadingFreshnessBudgetMilliseconds = resolveFallbackReadingFreshnessBudgetMilliseconds({
            actionKind: this.actionKind,
            pollingFrequencySeconds: this.resolveSettings(event).preferences.pollingFrequencySeconds,
            metricKeys: listMetricReadPlanKeys(readPlan),
        });

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
        const metricKeys = this.getMetricKeys(event);

        if (metricKeys.length === 0) {
            this.metricCollectionBindings.get(event.action.id)?.dispose();
            this.metricCollectionBindings.delete(event.action.id);
            return;
        }

        const pollingIntervalMilliseconds = resolvePollingIntervalMilliseconds({
            actionKind: this.actionKind,
            pollingFrequencySeconds,
            metricKeys,
        });
        if (pollingIntervalMilliseconds !== pollingFrequencySeconds * 1000) {
            log.warn(() => [
                "pollingFrequencyRejected",
                `actionId=${event.action.id}`,
                `actionKind=${this.actionKind}`,
                `pollingFrequencySeconds=${pollingFrequencySeconds}`,
                `fallbackIntervalMs=${pollingIntervalMilliseconds}`,
                ...formatMetricKeyFieldsForLog(metricKeys),
            ].join(" "));
        }
        setMetricViewPollingInterval(event.action.id, pollingIntervalMilliseconds);
        const maximumSampleAgeMilliseconds = resolveFallbackReadingFreshnessBudgetMilliseconds({
            actionKind: this.actionKind,
            pollingFrequencySeconds,
            metricKeys,
        });
        const readPlan = this.buildMetricCollectionReadPlan(event, metricKeys);
        const metricCollectionBinding = this.getOrCreateMetricCollectionBinding(event.action.id);

        log.info(() => [
            "metricCollectionSubscriptionResolved",
            `actionId=${event.action.id}`,
            `actionKind=${this.actionKind}`,
            `pollingFrequencySeconds=${pollingFrequencySeconds}`,
            `pollingIntervalMs=${pollingIntervalMilliseconds}`,
            ...formatMetricKeyFieldsForLog(metricKeys),
        ].join(" "));

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

    /**
     * Adds the transient manual refresh acknowledgement badge to a render pass.
     *
     * This badge means the interaction was accepted and a refresh request was
     * sent. It is not a data freshness guarantee; the collector runner still
     * owns pending/backoff/skip decisions.
     */
    protected withManualRefreshIndicator<TOptions extends MetricViewOptions>(
        event: WillAppearEvent,
        viewOptions: TOptions,
    ): TOptions {
        if (this.manualRefreshFeedbackStates.has(event.action.id)) {
            return {
                ...viewOptions,
                refreshIndicator: "visible",
            };
        }

        return viewOptions;
    }

    /** Whether the action is currently showing its manual refresh request feedback. */
    protected isManualRefreshFeedbackVisible(actionId: string): boolean {
        return this.manualRefreshFeedbackStates.has(actionId);
    }

    /** Requests an immediate collection refresh for this action subscriber. */
    protected requestSubscriberRefresh(actionId: string): Promise<void> {
        return backgroundMetricCollection.requestSubscriberRefresh(actionId, "manualInteraction")
            .then(() => undefined);
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

    private requestManualRefreshFromInteraction(actionId: string): void {
        if (!this.activeActionStates.has(actionId)) {
            return;
        }

        if (this.manualRefreshFeedbackStates.has(actionId)) {
            return;
        }

        const requestPromise = this.requestSubscriberRefresh(actionId)
            .catch(error => {
                log.warn(() => `Manual refresh request failed: ${String(error)}`);
            });
        const feedbackState: ManualRefreshFeedbackState = {
            requestSettled: false,
            minimumVisibleElapsed: false,
            minimumVisibleTimer: undefined,
        };
        feedbackState.minimumVisibleTimer = setTimeout(() => {
            feedbackState.minimumVisibleElapsed = true;
            this.clearSettledManualRefreshFeedback(actionId, feedbackState);
        }, MANUAL_REFRESH_FEEDBACK_MINIMUM_VISIBLE_MILLISECONDS);

        this.manualRefreshFeedbackStates.set(actionId, feedbackState);
        this.refreshMetricViewForAction(actionId);
        void requestPromise.finally(() => {
            feedbackState.requestSettled = true;
            this.clearSettledManualRefreshFeedback(actionId, feedbackState);
        });
    }

    private clearSettledManualRefreshFeedback(
        actionId: string,
        feedbackState: ManualRefreshFeedbackState,
    ): void {
        if (this.manualRefreshFeedbackStates.get(actionId) !== feedbackState) {
            return;
        }

        if (!feedbackState.requestSettled || !feedbackState.minimumVisibleElapsed) {
            return;
        }

        this.clearManualRefreshFeedback(actionId, { refreshMetricView: true });
    }

    private clearManualRefreshFeedback(
        actionId: string,
        options: { readonly refreshMetricView: boolean },
    ): void {
        const feedbackState = this.manualRefreshFeedbackStates.get(actionId);
        if (feedbackState === undefined) {
            return;
        }

        if (feedbackState.minimumVisibleTimer !== undefined) {
            clearTimeout(feedbackState.minimumVisibleTimer);
        }
        this.manualRefreshFeedbackStates.delete(actionId);
        if (options.refreshMetricView) {
            this.refreshMetricViewForAction(actionId);
        }
    }

    private publishDisplayedMetricReadTrace(event: WillAppearEvent): void {
        const sourceDiagnosticMetricKey = this.getSourceDiagnosticMetricKey(event);
        if (sourceDiagnosticMetricKey === undefined) {
            // Actions without a diagnostic metric should not retain older
            // diagnostics from a previous configuration of the same instance.
            this.displayedMetricNoDataObserver.clearAction(event.action.id);
            return;
        }

        const readPlan = this.resolveMetricReadPlan(event);
        const sourceDiagnosticMetric = normalizeMetricReadPlan(readPlan).metrics
            .find(metric => metric.metricKey === sourceDiagnosticMetricKey);
        if (sourceDiagnosticMetric === undefined) {
            // A diagnostic key outside the normalized read plan is not a valid
            // source diagnostic target for this tick.
            this.displayedMetricNoDataObserver.clearAction(event.action.id);
            return;
        }

        const preferredSourceId = selectMetricReadRouteSourceCandidates(sourceDiagnosticMetric)[0]?.sourceId;
        const preferredSourceStatus = preferredSourceId === undefined
            ? undefined
            : this.readCachedSourceStatus(preferredSourceId);
        const readResult = this.getMetricReader(event).getWidgetDataReadResult(
            sourceDiagnosticMetricKey,
            "",
            "",
        );
        const outcome = buildDisplayedMetricReadOutcome(readResult);
        const activeActionState = this.activeActionStates.get(event.action.id);
        const settings = activeActionState?.resolvedSettings ?? this.resolveSettings(event);
        const pollingIntervalMilliseconds = resolvePollingIntervalMilliseconds({
            actionKind: this.actionKind,
            pollingFrequencySeconds: settings.preferences.pollingFrequencySeconds,
            metricKeys: listMetricReadPlanKeys(readPlan),
        });

        if (activeActionState) {
            // The observer is event-fed by render ticks; no-data sustained and
            // recovery logs depend on this path continuing to run for N/A keys.
            this.displayedMetricNoDataObserver.observe({
                actionId: event.action.id,
                metricKey: sourceDiagnosticMetricKey,
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
                metricKey: sourceDiagnosticMetricKey,
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
const SYSTEM_BATTERY_POLLING_FREQUENCY_SECOND_SET: ReadonlySet<number>
    = new Set(SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS);
const VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECOND_SET: ReadonlySet<number>
    = new Set(VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECONDS);
const SYSTEM_BATTERY_MINIMUM_POLLING_INTERVAL_MILLISECONDS = SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS[0] * 1000;
const VENDOR_HID_BATTERY_MINIMUM_POLLING_INTERVAL_MILLISECONDS
    = VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECONDS[0] * 1000;
// Gives the background collector one missed interval before fallback render treats its reading as expired.
const FALLBACK_READING_FRESHNESS_GRACE_MILLISECONDS = 5000;
/**
 * Resolves a stored polling frequency into an actual interval, clamping illegal
 * values instead of throwing so a bad persisted setting cannot brick a widget.
 *
 * Checks run in priority order: a vendor HID battery key forces the slowest
 * floor (shared device queue), then any value already in the system-battery set
 * is honored regardless of metric kind, then a plain battery key gets the 60s
 * floor, then the standard fast set, then the 1s default. The unconditional
 * system-battery acceptance is deliberate: a Dense/Stacked widget that dropped
 * its battery slot keeps the saved slow value, mirroring the PI rule that
 * removing a slow slot does not auto-restore a faster interval. Callers should
 * `log.warn` when the returned interval differs from the requested one.
 */
function resolvePollingIntervalMilliseconds(options: {
    readonly actionKind: ActionKind;
    readonly pollingFrequencySeconds: number;
    readonly metricKeys: readonly string[];
}): number {
    if (
        options.actionKind === "customMetric"
        && Number.isInteger(options.pollingFrequencySeconds)
        && options.pollingFrequencySeconds >= 1
        && options.pollingFrequencySeconds <= CUSTOM_METRIC_MAX_POLLING_FREQUENCY_SECONDS
    ) {
        return options.pollingFrequencySeconds * 1000;
    }

    if (options.metricKeys.some(isVendorHidBatteryMetricKey)) {
        return VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECOND_SET.has(options.pollingFrequencySeconds)
            ? options.pollingFrequencySeconds * 1000
            : VENDOR_HID_BATTERY_MINIMUM_POLLING_INTERVAL_MILLISECONDS;
    }

    if (SYSTEM_BATTERY_POLLING_FREQUENCY_SECOND_SET.has(options.pollingFrequencySeconds)) {
        return options.pollingFrequencySeconds * 1000;
    }

    if (options.metricKeys.some(isBatteryMetricKey)) {
        return SYSTEM_BATTERY_MINIMUM_POLLING_INTERVAL_MILLISECONDS;
    }

    if (ALLOWED_POLLING_FREQUENCY_SECONDS.has(options.pollingFrequencySeconds)) {
        return options.pollingFrequencySeconds * 1000;
    }

    return DEFAULT_POLLING_INTERVAL_MILLISECONDS;
}

function resolveFallbackReadingFreshnessBudgetMilliseconds(options: {
    readonly actionKind: ActionKind;
    readonly pollingFrequencySeconds: number;
    readonly metricKeys: readonly string[];
}): number {
    return resolvePollingIntervalMilliseconds(options)
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
        case "hardwareSummary":
            return `hardwareSummary:${settings.widget.target.domain}`;
    }
}

function writePropertyInspectorDiagnosticLog(level: PropertyInspectorDiagnosticLevel, message: string): void {
    switch (level) {
        case "error":
            log.atError()
                .everyMs("property-inspector-diagnostic-error", 10_000)
                .log(() => message);
            return;
        case "warn":
            log.atWarn()
                .everyMs("property-inspector-diagnostic-warn", 10_000)
                .log(() => message);
            return;
    }
}
