import streamDeck, {
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
    DidReceiveSettingsEvent,
    PropertyInspectorDidAppearEvent,
} from "@elgato/streamdeck";
import { scheduler } from "../runtime/scheduler";
import { clearMetricDisplayState } from "../metric-view-runner/runner";
import { logger } from "../logging/logger";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import { resolveActionSettings } from "./settings/action-settings-resolver";
import type { ActionKind, ResolvedWidgetSettings } from "../settings/widget-settings";
import {
    emptyWidgetRuntimeCache,
    mergeWidgetRuntimeCache,
    WIDGET_RUNTIME_CACHE_MESSAGE_TYPE,
    type WidgetRuntimeCache,
    type WidgetRuntimeCacheMessage,
    type WidgetRuntimeCachePatch,
} from "../runtime/widget-runtime-cache";

const log = logger.for("MetricAction");

interface ActiveMetricAction {
    cleanup: () => void;
    subscriptionKeySignature: string;
    pollingIntervalMilliseconds: number;
}

interface ActiveActionState {
    event: WillAppearEvent;
    rawSettings: unknown;
    runtimeCache: WidgetRuntimeCache;
}

/**
 * Base class for all metric-display actions.
 * Handles scheduler subscription lifecycle and real-time settings updates.
 * Subclasses implement `onMetricsUpdate` which is called on every tick.
 */
export abstract class MetricAction extends SingletonAction {
    private activeActionStates = new Map<string, ActiveActionState>();
    private activeMetricActions = new Map<string, ActiveMetricAction>();

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
        const activeActionState = {
            event,
            rawSettings: event.payload.settings,
            runtimeCache: { ...emptyWidgetRuntimeCache },
        };

        this.activeActionStates.set(event.action.id, activeActionState);
        this.subscribeAction(activeActionState);
        this.onMetricsUpdate(event);
    }

    override onDidReceiveSettings(event: DidReceiveSettingsEvent): void {
        const activeActionState = this.activeActionStates.get(event.action.id);
        if (activeActionState) {
            const previousSettings = this.resolveSettings(activeActionState.event);
            const nextSettings = this.resolveRawSettings(event.payload.settings, activeActionState.runtimeCache);

            log.info(() => [
                "settingsReceived",
                `actionId=${event.action.id}`,
                `previousGraphicType=${formatSettingValue(previousSettings.appearance.graphicType)}`,
                `nextGraphicType=${formatSettingValue(nextSettings.appearance.graphicType)}`,
                `previousPollingFrequencySeconds=${formatSettingValue(previousSettings.local.pollingFrequencySeconds)}`,
                `nextPollingFrequencySeconds=${formatSettingValue(nextSettings.local.pollingFrequencySeconds)}`,
            ].join(" "));

            activeActionState.rawSettings = event.payload.settings;
            this.resubscribeActionIfFrequencyChanged(activeActionState);
            // Force an immediate update for snappy UI feedback.
            this.onMetricsUpdate(activeActionState.event);
        }
    }

    override onWillDisappear(event: WillDisappearEvent): void {
        this.activeMetricActions.get(event.action.id)?.cleanup();
        this.activeMetricActions.delete(event.action.id);
        this.activeActionStates.delete(event.action.id);
        clearMetricDisplayState(event.action.id);
    }

    override onPropertyInspectorDidAppear(event: PropertyInspectorDidAppearEvent): void {
        const activeActionState = this.activeActionStates.get(event.action.id);
        if (!activeActionState) {
            return;
        }

        this.sendRuntimeCachePatchToPropertyInspector(event, activeActionState.runtimeCache).catch(error => {
            log.error(() => `Failed to publish runtime cache to Property Inspector: ${String(error)}`);
        });
    }

    /**
     * Called on every scheduler tick. Actions query MetricStore themselves
     * for the specific WidgetData they need.
     */
    protected abstract onMetricsUpdate(event: WillAppearEvent): void;

    protected getMetricSubscriptionKeys(event: WillAppearEvent): readonly string[] {
        void event;
        return [];
    }

    protected resolveSettings(event: WillAppearEvent): ResolvedWidgetSettings {
        const activeActionState = this.activeActionStates.get(event.action.id);
        if (!activeActionState) {
            throw new Error(`Action ${event.action.id} is not active; cannot resolve settings.`);
        }

        return this.resolveRawSettings(activeActionState.rawSettings, activeActionState.runtimeCache);
    }

    protected updateRuntimeCache(event: WillAppearEvent, patch: WidgetRuntimeCachePatch): Promise<void> {
        const activeActionState = this.activeActionStates.get(event.action.id);
        if (!activeActionState) {
            throw new Error(`Action ${event.action.id} is not active; cannot update runtime cache.`);
        }

        if (isRuntimeCachePatchUnchanged(activeActionState.runtimeCache, patch)) {
            return Promise.resolve();
        }

        activeActionState.runtimeCache = mergeWidgetRuntimeCache(activeActionState.runtimeCache, patch);

        return this.sendRuntimeCachePatchToPropertyInspector(event, patch);
    }

    private subscribeAction(activeActionState: ActiveActionState): void {
        const { event } = activeActionState;
        const pollingIntervalMilliseconds = resolvePollingIntervalMilliseconds(
            this.resolveSettings(event).local.pollingFrequencySeconds,
        );
        const subscriptionKeys = normalizeMetricSubscriptionKeys(this.getMetricSubscriptionKeys(event));
        const subscriptionKeySignature = subscriptionKeys.join(",");
        const cleanup = scheduler.subscribe(() => {
            const currentActionState = this.activeActionStates.get(event.action.id);

            if (currentActionState) {
                this.onMetricsUpdate(currentActionState.event);
            }
        }, {
            metricKeys: subscriptionKeys,
            pollingIntervalMilliseconds,
        });

        this.activeMetricActions.set(event.action.id, {
            cleanup,
            subscriptionKeySignature,
            pollingIntervalMilliseconds,
        });
    }

    private resubscribeActionIfFrequencyChanged(activeActionState: ActiveActionState): void {
        const { event } = activeActionState;
        const activeMetricAction = this.activeMetricActions.get(event.action.id);
        const nextPollingIntervalMilliseconds = resolvePollingIntervalMilliseconds(
            this.resolveSettings(event).local.pollingFrequencySeconds,
        );
        const nextSubscriptionKeys = normalizeMetricSubscriptionKeys(this.getMetricSubscriptionKeys(event));
        const nextSubscriptionKeySignature = nextSubscriptionKeys.join(",");

        if (
            activeMetricAction?.pollingIntervalMilliseconds === nextPollingIntervalMilliseconds
            && activeMetricAction.subscriptionKeySignature === nextSubscriptionKeySignature
        ) {
            return;
        }

        activeMetricAction?.cleanup();
        this.subscribeAction(activeActionState);
    }

    private resubscribeAllActions(): void {
        for (const activeActionState of this.activeActionStates.values()) {
            const { event } = activeActionState;
            this.activeMetricActions.get(event.action.id)?.cleanup();
            this.activeMetricActions.delete(event.action.id);
            this.subscribeAction(activeActionState);
        }
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

    private resolveRawSettings(rawSettings: unknown, runtimeCache: WidgetRuntimeCache): ResolvedWidgetSettings {
        return resolveActionSettings(rawSettings, this.actionKind, runtimeCache);
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

function normalizeMetricSubscriptionKeys(subscriptionKeys: readonly string[]): readonly string[] {
    return Array.from(new Set(subscriptionKeys)).sort();
}

function formatSettingValue(value: unknown): string {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    return "unset";
}

function isRuntimeCachePatchUnchanged(
    runtimeCache: WidgetRuntimeCache,
    patch: WidgetRuntimeCachePatch,
): boolean {
    for (const key of Object.keys(patch) as Array<keyof WidgetRuntimeCachePatch>) {
        const currentValue = runtimeCache[key];
        const nextValue = patch[key];

        if (Array.isArray(currentValue) || Array.isArray(nextValue)) {
            // Runtime cache is ephemeral; this only avoids sending duplicate
            // Property Inspector messages for unchanged option lists.
            if (JSON.stringify(currentValue ?? []) !== JSON.stringify(nextValue ?? [])) {
                return false;
            }

            continue;
        }

        if (currentValue !== nextValue) {
            return false;
        }
    }

    return true;
}
