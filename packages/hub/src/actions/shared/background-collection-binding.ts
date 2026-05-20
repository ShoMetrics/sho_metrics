import { logger } from "../../logging/logger";
import { backgroundMetricCollection } from "../../runtime/metric-collection/background-metric-collection";
import {
    buildMetricReadPlanKey,
} from "../../runtime/sources/metric-read-plan";
// TODO(Phase 5c Slice 6): Replace this shared migration shape when
// SchedulerBinding is removed or renamed to the final action collection handle.
import type { SchedulerBindingRefreshOptions } from "./scheduler-binding";

const log = logger.for("BackgroundCollectionBinding");

type BackgroundCollectionRegistration = (
    options: Pick<
        SchedulerBindingRefreshOptions,
        "subscriberId" | "readPlan"
    > & { readonly intervalMilliseconds: number },
) => () => void;

export interface BackgroundCollectionBindingTimer {
    set(callback: () => void, intervalMilliseconds: number): unknown;
    clear(handle: unknown): void;
}

const defaultTimer: BackgroundCollectionBindingTimer = {
    set: (callback, intervalMilliseconds) => setInterval(callback, intervalMilliseconds),
    clear: handle => clearInterval(handle as NodeJS.Timeout),
};

/**
 * Binds one action to background collection plus an action-owned render cadence.
 *
 * Background collection keeps MetricStore fresh. The render cadence only calls
 * the action's existing tick callback; it never polls sources itself.
 */
export class BackgroundCollectionBinding {
    private cleanupCollection: (() => void) | null = null;
    private timerHandle: unknown | null = null;
    private readPlanSignature: string | null = null;
    private pollingIntervalMilliseconds: number | null = null;
    private subscriberId: string | null = null;

    constructor(
        private readonly registerCollection: BackgroundCollectionRegistration
            = options => backgroundMetricCollection.registerReadPlanBridgeSubscription(options),
        private readonly timer: BackgroundCollectionBindingTimer = defaultTimer,
    ) {}

    refresh(options: SchedulerBindingRefreshOptions): void {
        const nextReadPlanSignature = buildMetricReadPlanKey(options.readPlan);

        if (
            this.readPlanSignature === nextReadPlanSignature
            && this.pollingIntervalMilliseconds === options.pollingIntervalMilliseconds
            && this.subscriberId === options.subscriberId
        ) {
            return;
        }

        this.dispose();
        this.cleanupCollection = this.registerCollection({
            subscriberId: options.subscriberId,
            readPlan: options.readPlan,
            intervalMilliseconds: options.pollingIntervalMilliseconds,
        });
        this.timerHandle = this.timer.set(options.onTick, options.pollingIntervalMilliseconds);
        this.readPlanSignature = nextReadPlanSignature;
        this.pollingIntervalMilliseconds = options.pollingIntervalMilliseconds;
        this.subscriberId = options.subscriberId;

        log.debug(() => [
            "backgroundRenderCadenceStarted",
            `subscriberId=${options.subscriberId}`,
            `sourceScopeId=${options.readPlan.sourceScopeId}`,
            `intervalMs=${options.pollingIntervalMilliseconds}`,
            `metricCount=${options.readPlan.metricKeys.length}`,
        ].join(" "));
    }

    dispose(): void {
        if (this.timerHandle !== null) {
            this.timer.clear(this.timerHandle);
            this.timerHandle = null;
        }

        this.cleanupCollection?.();
        if (this.subscriberId) {
            log.debug(() => [
                "backgroundRenderCadenceStopped",
                `subscriberId=${this.subscriberId}`,
            ].join(" "));
        }

        this.cleanupCollection = null;
        this.readPlanSignature = null;
        this.pollingIntervalMilliseconds = null;
        this.subscriberId = null;
    }
}
