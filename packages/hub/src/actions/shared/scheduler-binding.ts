import { scheduler } from "../../runtime/scheduler";
import {
    buildMetricReadPlanKey,
    type MetricReadPlan,
} from "../../runtime/sources/metric-read-plan";
import {
    metricSubscriptionRegistry,
    type MetricReadPlanSubscriptionBridgeWriter,
} from "../../runtime/metric-collection/metric-subscription-registry";

export interface SchedulerBindingRefreshOptions {
    readonly subscriberId: string;
    readonly readPlan: MetricReadPlan;
    readonly pollingIntervalMilliseconds: number;
    readonly onTick: () => void;
}

export class SchedulerBinding {
    private cleanup: (() => void) | null = null;
    private readPlanSignature: string | null = null;
    private pollingIntervalMilliseconds: number | null = null;
    private subscriberId: string | null = null;

    constructor(
        private readonly metricSubscriptions: MetricReadPlanSubscriptionBridgeWriter = metricSubscriptionRegistry,
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
        const cleanup = scheduler.subscribe(options.onTick, {
            readPlan: options.readPlan,
            pollingIntervalMilliseconds: options.pollingIntervalMilliseconds,
        });
        this.metricSubscriptions.registerReadPlanBridge({
            subscriberId: options.subscriberId,
            readPlan: options.readPlan,
            intervalMilliseconds: options.pollingIntervalMilliseconds,
        });
        this.cleanup = cleanup;
        this.readPlanSignature = nextReadPlanSignature;
        this.pollingIntervalMilliseconds = options.pollingIntervalMilliseconds;
        this.subscriberId = options.subscriberId;
    }

    dispose(): void {
        this.cleanup?.();
        if (this.subscriberId) {
            this.metricSubscriptions.unregister(this.subscriberId);
        }
        this.cleanup = null;
        this.readPlanSignature = null;
        this.pollingIntervalMilliseconds = null;
        this.subscriberId = null;
    }
}
