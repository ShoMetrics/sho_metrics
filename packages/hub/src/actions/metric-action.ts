import { SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { scheduler } from "../runtime/scheduler";
import { clearMetricDisplayState } from "./metric-display-runner";
import { logger } from "../logging/logger";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import { resolveActionSettings } from "./action-settings-resolver";
import { readWidgetSettings, writeWidgetSettings } from "../settings/codec";
import type { ActionKind, ResolvedWidgetSettings, WidgetStoredSettings } from "../settings/widget-settings";
import { mergeWidgetSettingsPatch, type RuntimeStatePatch } from "../settings/updates";

const log = logger.for("MetricAction");

interface ActiveMetricAction {
    cleanup: () => void;
    subscriptionKeySignature: string;
    pollingIntervalMilliseconds: number;
}

interface ActiveActionState {
    event: WillAppearEvent;
    rawSettings: unknown;
}

/**
 * Base class for all metric-display actions.
 * Handles scheduler subscription lifecycle and real-time settings updates.
 * Subclasses implement `onMetricsUpdate` which is called on every tick.
 */
export abstract class MetricAction extends SingletonAction {
    /** Track active action state per action instance ID without mutating SDK event payloads. */
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
        };

        this.activeActionStates.set(event.action.id, activeActionState);
        this.subscribeAction(activeActionState);
        this.onMetricsUpdate(event);
    }

    override onDidReceiveSettings(event: DidReceiveSettingsEvent): void {
        const activeActionState = this.activeActionStates.get(event.action.id);
        if (activeActionState) {
            const previousSettings = this.resolveSettings(activeActionState.event);
            const nextSettings = this.resolveRawSettings(event.payload.settings);

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
        return this.resolveRawSettings(this.activeActionStates.get(event.action.id)!.rawSettings);
    }

    protected updateRuntimeCache(event: WillAppearEvent, patch: RuntimeStatePatch): Promise<void> {
        return this.updateStoredSettings(event, storedSettings => {
            if (isRuntimeCachePatchUnchanged(storedSettings.runtimeCache, patch)) {
                return storedSettings;
            }

            return mergeWidgetSettingsPatch(storedSettings, { runtimeCache: patch });
        });
    }

    private updateStoredSettings(
        event: WillAppearEvent,
        update: (storedSettings: WidgetStoredSettings) => WidgetStoredSettings,
    ): Promise<void> {
        const activeActionState = this.activeActionStates.get(event.action.id)!;
        const currentSettings = readWidgetSettings(activeActionState.rawSettings);
        const nextSettings = update(currentSettings);

        if (nextSettings === currentSettings) {
            return Promise.resolve();
        }

        const rawSettings = writeWidgetSettings(nextSettings);

        activeActionState.rawSettings = rawSettings;

        return event.action.setSettings(rawSettings);
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

    private resolveRawSettings(rawSettings: unknown): ResolvedWidgetSettings {
        return resolveActionSettings(rawSettings, this.actionKind);
    }
}

function resolvePollingIntervalMilliseconds(pollingFrequencySeconds: number): number {
    if (ALLOWED_POLLING_FREQUENCY_SECONDS.has(pollingFrequencySeconds)) {
        return pollingFrequencySeconds * 1000;
    }

    return DEFAULT_POLLING_FREQUENCY_SECONDS * 1000;
}

const DEFAULT_POLLING_FREQUENCY_SECONDS = 1;
const ALLOWED_POLLING_FREQUENCY_SECONDS = new Set([1, 2, 3, 5, 10, 15, 30, 60]);

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
    runtimeCache: WidgetStoredSettings["runtimeCache"],
    patch: RuntimeStatePatch,
): boolean {
    for (const key of Object.keys(patch) as Array<keyof RuntimeStatePatch>) {
        const currentValue = runtimeCache?.[key];
        const nextValue = patch[key];

        if (Array.isArray(currentValue) || Array.isArray(nextValue)) {
            // TODO(settings-contract): Temporary pre-proto/pre-Zod deep compare. Move this to the codec/schema layer
            // when persisted settings get a real contract.
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
