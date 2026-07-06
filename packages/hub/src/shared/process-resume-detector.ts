import { logger } from "../logging/node-logger";
import { resolveProductionLogThrottleMilliseconds } from "../logging/log-throttle";
import { wallClockNowMilliseconds } from "./clock";

const log = logger.for("ProcessResumeDetector");

export const PROCESS_RESUME_GAP_THRESHOLD_MILLISECONDS = 90_000;
const PROCESS_RESUME_LOG_THROTTLE_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60_000);

export interface ProcessResumeEvent {
    readonly owner: string;
    readonly gapMilliseconds: number;
    readonly observedAtTimestampMilliseconds: number;
    readonly previousObservedAtTimestampMilliseconds: number;
}

export type ProcessResumeListener = (event: ProcessResumeEvent) => void;

/**
 * Detects large wall-clock gaps while the plugin is otherwise active.
 *
 * Stream Deck exposes a system wake event for normal host-delivered wake
 * recovery. This detector is the passive fallback for missed wake events,
 * process suspension, and other long gaps that only become observable when the
 * plugin starts doing useful work again.
 *
 * TODO: Wire Stream Deck SDK onSystemDidWakeUp into the same recovery path so
 * normal host-delivered wake events do not have to wait for the next hot-path
 * activity gap.
 */
export class ProcessResumeDetector {
    private readonly listeners = new Set<ProcessResumeListener>();
    private lastObservedTimestampMilliseconds: number | null = null;

    constructor(private readonly gapThresholdMilliseconds = PROCESS_RESUME_GAP_THRESHOLD_MILLISECONDS) {}

    observe(owner: string, observedAtTimestampMilliseconds = wallClockNowMilliseconds()): ProcessResumeEvent | undefined {
        const previousObservedAtTimestampMilliseconds = this.lastObservedTimestampMilliseconds;
        this.lastObservedTimestampMilliseconds = observedAtTimestampMilliseconds;

        if (previousObservedAtTimestampMilliseconds === null) {
            return undefined;
        }

        const gapMilliseconds = observedAtTimestampMilliseconds - previousObservedAtTimestampMilliseconds;

        if (gapMilliseconds < this.gapThresholdMilliseconds) {
            return undefined;
        }

        const event: ProcessResumeEvent = {
            owner,
            gapMilliseconds,
            observedAtTimestampMilliseconds,
            previousObservedAtTimestampMilliseconds,
        };

        log.atInfo()
            .everyMs("process-resume-detected", PROCESS_RESUME_LOG_THROTTLE_MILLISECONDS)
            .log(() => [
                "processResumeDetected",
                `owner=${owner}`,
                `gapMs=${gapMilliseconds}`,
                `listenerCount=${this.listeners.size}`,
            ].join(" "));

        for (const listener of this.listeners) {
            listener(event);
        }

        return event;
    }

    subscribe(listener: ProcessResumeListener): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }
}

export const processResumeDetector = new ProcessResumeDetector();

/** Observes process activity through the shared process resume detector. */
export function observeProcessActivity(
    owner: string,
    observedAtTimestampMilliseconds = wallClockNowMilliseconds(),
): ProcessResumeEvent | undefined {
    return processResumeDetector.observe(owner, observedAtTimestampMilliseconds);
}

/** Subscribes to process resume events detected by existing plugin activity. */
export function subscribeProcessResume(listener: ProcessResumeListener): () => void {
    return processResumeDetector.subscribe(listener);
}
