import { SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { scheduler } from "../runtime/scheduler";
import { clearSingleMetricDisplayState } from "./single-metric-display";
import { logger } from "../logging/logger";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";

type MetricActionSettings = Record<string, unknown>;

const log = logger.for("MetricAction");

interface ActiveMetricAction {
    cleanup: () => void;
    metricKeySignature: string;
    pollingIntervalMilliseconds: number;
}

/**
 * Base class for all metric-display actions.
 * Handles scheduler subscription lifecycle and real-time settings updates.
 * Subclasses implement `onMetricsUpdate` which is called on every tick.
 */
export abstract class MetricAction extends SingletonAction {
    /** Track active events per action instance ID to ensure settings are always current. */
    private activeEvents = new Map<string, WillAppearEvent>();
    private activeMetricActions = new Map<string, ActiveMetricAction>();

    constructor() {
        super();
        pluginGlobalSettingsStore.subscribe(() => {
            this.resubscribeAllActions();
            for (const activeEvent of this.activeEvents.values()) {
                this.onMetricsUpdate(activeEvent);
            }
        });
    }

    override onWillAppear(event: WillAppearEvent): void {
        this.activeEvents.set(event.action.id, event);
        this.subscribeAction(event);
        this.onMetricsUpdate(event);
    }

    override onDidReceiveSettings(event: DidReceiveSettingsEvent): void {
        const activeEvent = this.activeEvents.get(event.action.id);
        if (activeEvent) {
            const previousSettings = activeEvent.payload.settings as MetricActionSettings;
            const nextSettings = event.payload.settings as MetricActionSettings;

            log.info(() => [
                "settingsReceived",
                `actionId=${event.action.id}`,
                `previousGraphicType=${formatSettingValue(previousSettings.graphicType)}`,
                `nextGraphicType=${formatSettingValue(nextSettings.graphicType)}`,
                `previousPollingFrequencySeconds=${formatSettingValue(previousSettings.pollingFrequencySeconds)}`,
                `nextPollingFrequencySeconds=${formatSettingValue(nextSettings.pollingFrequencySeconds)}`,
            ].join(" "));

            // Update the settings in the active event so the polling loop sees them.
            activeEvent.payload.settings = event.payload.settings;
            this.resubscribeActionIfFrequencyChanged(activeEvent);
            // Force an immediate update for snappy UI feedback.
            this.onMetricsUpdate(activeEvent);
        }
    }

    override onWillDisappear(event: WillDisappearEvent): void {
        this.activeMetricActions.get(event.action.id)?.cleanup();
        this.activeMetricActions.delete(event.action.id);
        this.activeEvents.delete(event.action.id);
        clearSingleMetricDisplayState(event.action.id);
    }

    /**
     * Called on every scheduler tick. Actions query MetricStore themselves
     * for the specific WidgetData they need.
     */
    protected abstract onMetricsUpdate(event: WillAppearEvent): void;

    protected getMetricKeys(event: WillAppearEvent): readonly string[] {
        void event;
        return [];
    }

    protected getDefaultPollingFrequencySeconds(event: WillAppearEvent): number {
        void event;
        return DEFAULT_POLLING_FREQUENCY_SECONDS;
    }

    private subscribeAction(event: WillAppearEvent): void {
        const pollingIntervalMilliseconds = resolvePollingIntervalMilliseconds(
            event.payload.settings as MetricActionSettings,
            this.getDefaultPollingFrequencySeconds(event),
        );
        const metricKeys = normalizeMetricKeys(this.getMetricKeys(event));
        const metricKeySignature = metricKeys.join(",");
        const cleanup = scheduler.subscribe(() => {
            const currentEvent = this.activeEvents.get(event.action.id);

            if (currentEvent) {
                this.onMetricsUpdate(currentEvent);
            }
        }, {
            metricKeys,
            pollingIntervalMilliseconds,
        });

        this.activeMetricActions.set(event.action.id, {
            cleanup,
            metricKeySignature,
            pollingIntervalMilliseconds,
        });
    }

    private resubscribeActionIfFrequencyChanged(event: WillAppearEvent): void {
        const activeMetricAction = this.activeMetricActions.get(event.action.id);
        const nextPollingIntervalMilliseconds = resolvePollingIntervalMilliseconds(
            event.payload.settings as MetricActionSettings,
            this.getDefaultPollingFrequencySeconds(event),
        );
        const nextMetricKeys = normalizeMetricKeys(this.getMetricKeys(event));
        const nextMetricKeySignature = nextMetricKeys.join(",");

        if (
            activeMetricAction?.pollingIntervalMilliseconds === nextPollingIntervalMilliseconds
            && activeMetricAction.metricKeySignature === nextMetricKeySignature
        ) {
            return;
        }

        activeMetricAction?.cleanup();
        this.subscribeAction(event);
    }

    private resubscribeAllActions(): void {
        for (const event of this.activeEvents.values()) {
            this.activeMetricActions.get(event.action.id)?.cleanup();
            this.activeMetricActions.delete(event.action.id);
            this.subscribeAction(event);
        }
    }
}

function resolvePollingIntervalMilliseconds(settings: MetricActionSettings, defaultPollingFrequencySeconds: number): number {
    const pollingFrequencySeconds = Number(settings.pollingFrequencySeconds);
    const resolvedDefaultPollingFrequencySeconds = ALLOWED_POLLING_FREQUENCY_SECONDS.has(defaultPollingFrequencySeconds)
        ? defaultPollingFrequencySeconds
        : DEFAULT_POLLING_FREQUENCY_SECONDS;

    if (ALLOWED_POLLING_FREQUENCY_SECONDS.has(pollingFrequencySeconds)) {
        return pollingFrequencySeconds * 1000;
    }

    return resolvedDefaultPollingFrequencySeconds * 1000;
}

const DEFAULT_POLLING_FREQUENCY_SECONDS = 1;
const ALLOWED_POLLING_FREQUENCY_SECONDS = new Set([1, 2, 3, 5, 10, 15, 30, 60]);

function normalizeMetricKeys(metricKeys: readonly string[]): readonly string[] {
    return Array.from(new Set(metricKeys)).sort();
}

function formatSettingValue(value: unknown): string {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    return "unset";
}
