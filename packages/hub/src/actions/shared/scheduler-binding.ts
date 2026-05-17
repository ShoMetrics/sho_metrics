import { scheduler } from "../../runtime/scheduler";
import {
    buildMetricReadPlanKey,
    type MetricReadPlan,
} from "../../runtime/sources/metric-read-plan";

export interface SchedulerBindingRefreshOptions {
    readonly readPlan: MetricReadPlan;
    readonly pollingIntervalMilliseconds: number;
    readonly onTick: () => void;
}

export class SchedulerBinding {
    private cleanup: (() => void) | null = null;
    private readPlanSignature: string | null = null;
    private pollingIntervalMilliseconds: number | null = null;

    refresh(options: SchedulerBindingRefreshOptions): void {
        const nextReadPlanSignature = buildMetricReadPlanKey(options.readPlan);

        if (
            this.readPlanSignature === nextReadPlanSignature
            && this.pollingIntervalMilliseconds === options.pollingIntervalMilliseconds
        ) {
            return;
        }

        this.dispose();
        this.cleanup = scheduler.subscribe(options.onTick, {
            readPlan: options.readPlan,
            pollingIntervalMilliseconds: options.pollingIntervalMilliseconds,
        });
        this.readPlanSignature = nextReadPlanSignature;
        this.pollingIntervalMilliseconds = options.pollingIntervalMilliseconds;
    }

    dispose(): void {
        this.cleanup?.();
        this.cleanup = null;
        this.readPlanSignature = null;
        this.pollingIntervalMilliseconds = null;
    }
}
