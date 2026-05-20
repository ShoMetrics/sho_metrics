import streamDeck, {
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
    DidReceiveSettingsEvent,
    PropertyInspectorDidAppearEvent,
    type SendToPluginEvent,
} from "@elgato/streamdeck";
import { metricStore, type MetricStoreReader } from "../runtime/metric-store";
import type { MetricReadPlan } from "../runtime/sources/metric-read-plan";
import { buildMetricReadPlanFromSourcePolicy } from "../runtime/sources/metric-read-plan-builder";
import { clearMetricViewState } from "../view-updates/runner";
import { logger } from "../logging/logger";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    resolveActionSettings,
    resolveInitialActionSettings,
} from "./settings/action-settings-resolver";
import type { ResolvedWidgetSettings } from "../settings/resolved-settings";
import type { ActionKind } from "../shared/stream-deck-actions";
import {
    emptyWidgetRuntimeCache,
    WIDGET_RUNTIME_CACHE_MESSAGE_TYPE,
    type WidgetRuntimeCache,
    type WidgetRuntimeCacheMessage,
    type WidgetRuntimeCachePatch,
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
import { createFallbackMetricStoreReader } from "../runtime/metric-collection/fallback-composer";
import { backgroundMetricCollection } from "../runtime/metric-collection/background-metric-collection";

const log = logger.for("MetricAction");

interface ActiveActionState {
    event: WillAppearEvent;
    rawSettings: unknown;
    resolvedSettings: ResolvedWidgetSettings;
    runtimeCacheStore: WidgetRuntimeCacheStore;
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

    protected abstract readonly actionKind: ActionKind;

    constructor() {
        super();
        pluginGlobalSettingsStore.subscribe(() => {
            this.resubscribeAllActions();
            for (const activeActionState of this.activeActionStates.values()) {
                this.onMetricsUpdate(activeActionState.event);
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
        };

        this.activeActionStates.set(event.action.id, activeActionState);
        if (initialSettings.settingsJsonToPersist) {
            event.action.setSettings(initialSettings.settingsJsonToPersist).catch(error => {
                log.error(() => `Failed to persist quick-start widget settings: ${String(error)}`);
            });
        }
        this.refreshSubscription(activeActionState);
        this.onMetricsUpdate(event);
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
                `previousSelectedView=${formatSettingValue(previousSettings.widget.slot.appearance.view.selectedView)}`,
                `nextSelectedView=${formatSettingValue(nextSettings.widget.slot.appearance.view.selectedView)}`,
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
            this.refreshSubscription(activeActionState);
            // Force an immediate update for snappy UI feedback.
            this.onMetricsUpdate(activeActionState.event);
        }
    }

    override onWillDisappear(event: WillDisappearEvent): void {
        this.metricCollectionBindings.get(event.action.id)?.dispose();
        this.metricCollectionBindings.delete(event.action.id);
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
                    this.onMetricsUpdate(activeActionState.event);
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
     * Called on every scheduler tick. Actions query MetricStore themselves
     * for the specific WidgetData they need.
     */
    protected abstract onMetricsUpdate(event: WillAppearEvent): void;

    protected abstract getMetricKeys(event: WillAppearEvent): readonly string[];

    protected buildMetricCollectionReadPlan(
        event: WillAppearEvent,
        metricKeys: readonly string[],
    ): MetricReadPlan {
        return this.buildMetricReadPlanForMetricKeys(event, metricKeys);
    }

    protected getMetricReader(event: WillAppearEvent): MetricStoreReader {
        const readPlan = this.resolveMetricReadPlan(event);

        return createFallbackMetricStoreReader(metricStore, readPlan);
    }

    protected refreshMetricKeys(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        metricKeys: readonly string[],
    ): Promise<void> {
        return backgroundMetricCollection.refreshReadPlanOnce(this.buildMetricReadPlanForMetricKeys(event, metricKeys))
            .then(() => undefined);
    }

    protected resolveSettings(event: WillAppearEvent | PropertyInspectorDidAppearEvent): ResolvedWidgetSettings {
        const activeActionState = this.activeActionStates.get(event.action.id);
        if (!activeActionState) {
            throw new Error(`Action ${event.action.id} is not active; cannot resolve settings.`);
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
        const pollingIntervalMilliseconds = resolvePollingIntervalMilliseconds(
            this.resolveSettings(event).preferences.pollingFrequencySeconds,
        );
        const metricKeys = this.getMetricKeys(event);
        const readPlan = this.buildMetricCollectionReadPlan(event, metricKeys);
        const metricCollectionBinding = this.getOrCreateMetricCollectionBinding(event.action.id);

        metricCollectionBinding.refresh({
            subscriberId: event.action.id,
            readPlan,
            pollingIntervalMilliseconds,
            onTick: () => {
                const currentActionState = this.activeActionStates.get(event.action.id);

                if (currentActionState) {
                    this.onMetricsUpdate(currentActionState.event);
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
            this.refreshSubscription(activeActionState);
        }
    }

    private resolveRawSettings(rawSettings: unknown, runtimeCache: WidgetRuntimeCache): ResolvedWidgetSettings {
        return resolveActionSettings(rawSettings, runtimeCache);
    }

    private resolveMetricReadPlan(event: WillAppearEvent): MetricReadPlan {
        return this.buildMetricCollectionReadPlan(event, this.getMetricKeys(event));
    }

    private buildMetricReadPlanForMetricKeys(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        metricKeys: readonly string[],
    ): MetricReadPlan {
        if (metricKeys.length === 0) {
            throw new Error(`Action ${this.actionKind} returned no metric keys.`);
        }

        const settings = this.resolveSettings(event);

        return buildMetricReadPlanFromSourcePolicy({
            metricKeys,
            sourcePolicy: settings.widget.slot.metric.source,
            defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
        });
    }
}

const DEFAULT_POLLING_INTERVAL_MILLISECONDS = 1000;
const ALLOWED_POLLING_FREQUENCY_SECONDS = new Set([1, 2, 3, 5, 10, 15, 30, 60]);

function resolvePollingIntervalMilliseconds(pollingFrequencySeconds: number): number {
    if (ALLOWED_POLLING_FREQUENCY_SECONDS.has(pollingFrequencySeconds)) {
        return pollingFrequencySeconds * 1000;
    }

    return DEFAULT_POLLING_INTERVAL_MILLISECONDS;
}

function formatSettingValue(value: unknown): string {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    return "unset";
}
