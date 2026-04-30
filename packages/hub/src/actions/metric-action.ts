import { SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { scheduler } from "../runtime/scheduler";

/**
 * Base class for all metric-display actions.
 * Handles scheduler subscription lifecycle and real-time settings updates.
 * Subclasses implement `onMetricsUpdate` which is called on every tick.
 */
export abstract class MetricAction extends SingletonAction {
    /** Track active events per action instance ID to ensure settings are always current. */
    private activeEvents = new Map<string, WillAppearEvent>();
    private cleanupMap = new Map<string, () => void>();

    override onWillAppear(event: WillAppearEvent): void {
        this.activeEvents.set(event.action.id, event);

        const cleanup = scheduler.subscribe(() => {
            const currentEvent = this.activeEvents.get(event.action.id);
            if (currentEvent) {
                this.onMetricsUpdate(currentEvent);
            }
        });
        this.cleanupMap.set(event.action.id, cleanup);
    }

    override onDidReceiveSettings(event: DidReceiveSettingsEvent): void {
        const activeEvent = this.activeEvents.get(event.action.id);
        if (activeEvent) {
            // Update the settings in the active event so the polling loop sees them.
            activeEvent.payload.settings = event.payload.settings;
            // Force an immediate update for snappy UI feedback.
            this.onMetricsUpdate(activeEvent);
        }
    }

    override onWillDisappear(event: WillDisappearEvent): void {
        this.cleanupMap.get(event.action.id)?.();
        this.cleanupMap.delete(event.action.id);
        this.activeEvents.delete(event.action.id);
    }

    /**
     * Called on every scheduler tick. Actions query MetricStore themselves
     * for the specific WidgetData they need.
     */
    protected abstract onMetricsUpdate(event: WillAppearEvent): void;
}
