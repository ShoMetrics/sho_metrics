export type StatusEdgeState = "ok" | "noData";

const MIN_SUSTAINED_STATUS_EDGE_MILLISECONDS = 10_000;
const MAX_SUSTAINED_STATUS_EDGE_MILLISECONDS = 60_000;

export const STATUS_EDGE_PRODUCTION_LOG_INTERVAL_MILLISECONDS = 60_000;

/** One event-fed status sample for a single diagnostic identity. */
export interface StatusEdgeDetectorObservation {
    /** Stable identity for the thing whose status is being observed. */
    readonly key: string;
    readonly state: StatusEdgeState;
    readonly nowMilliseconds: number;
    /** How long a no-data state must persist before sustained diagnostics fire. */
    readonly sustainedAfterMilliseconds: number;
    /** Minimum gap between sustained callbacks for the same key. */
    readonly sustainedLogIntervalMilliseconds: number;
    readonly logEnter: (event: StatusEdgeDetectorEvent) => void;
    readonly logSustained: (event: StatusEdgeDetectorEvent) => void;
    readonly logRecover: (event: StatusEdgeDetectorEvent) => void;
}

/** Edge transition context shared by enter, sustained, and recovery callbacks. */
export interface StatusEdgeDetectorEvent {
    readonly key: string;
    readonly nowMilliseconds: number;
    readonly noDataSinceMilliseconds: number;
    readonly sustainedMilliseconds: number;
}

interface StatusEdgeDetectorEntry {
    readonly state: StatusEdgeState;
    readonly noDataSinceMilliseconds?: number;
    readonly lastSustainedLogMilliseconds?: number;
}

/**
 * Tracks ok/no-data edges without owning timers or log sinks.
 *
 * Callers must keep feeding observations while a status remains interesting.
 * Sustained and recovery callbacks are therefore computed on the next observe()
 * call, not from background timer work inside this detector.
 */
export class StatusEdgeDetector {
    private readonly entriesByKey = new Map<string, StatusEdgeDetectorEntry>();

    observe(observation: StatusEdgeDetectorObservation): void {
        const previousEntry = this.entriesByKey.get(observation.key);

        if (observation.state === "ok") {
            this.observeOk(observation, previousEntry);
            return;
        }

        this.observeNoData(observation, previousEntry);
    }

    delete(key: string): void {
        this.entriesByKey.delete(key);
    }

    /** Removes all entries owned by a lifecycle scope, such as one action id. */
    deleteByPrefix(prefix: string): void {
        for (const key of this.entriesByKey.keys()) {
            if (key.startsWith(prefix)) {
                this.entriesByKey.delete(key);
            }
        }
    }

    has(key: string): boolean {
        return this.entriesByKey.has(key);
    }

    private observeOk(
        observation: StatusEdgeDetectorObservation,
        previousEntry: StatusEdgeDetectorEntry | undefined,
    ): void {
        if (previousEntry?.state === "noData" && previousEntry.noDataSinceMilliseconds !== undefined) {
            observation.logRecover(this.buildEvent(observation, previousEntry.noDataSinceMilliseconds));
        }

        this.entriesByKey.set(observation.key, { state: "ok" });
    }

    private observeNoData(
        observation: StatusEdgeDetectorObservation,
        previousEntry: StatusEdgeDetectorEntry | undefined,
    ): void {
        if (previousEntry?.state !== "noData" || previousEntry.noDataSinceMilliseconds === undefined) {
            observation.logEnter(this.buildEvent(observation, observation.nowMilliseconds));
            this.entriesByKey.set(observation.key, {
                state: "noData",
                noDataSinceMilliseconds: observation.nowMilliseconds,
            });
            return;
        }

        const sustainedMilliseconds = observation.nowMilliseconds - previousEntry.noDataSinceMilliseconds;
        const shouldLogSustained = sustainedMilliseconds >= observation.sustainedAfterMilliseconds
            && (
                previousEntry.lastSustainedLogMilliseconds === undefined
                || observation.nowMilliseconds - previousEntry.lastSustainedLogMilliseconds
                    >= observation.sustainedLogIntervalMilliseconds
            );

        if (shouldLogSustained) {
            observation.logSustained(this.buildEvent(observation, previousEntry.noDataSinceMilliseconds));
            this.entriesByKey.set(observation.key, {
                state: "noData",
                noDataSinceMilliseconds: previousEntry.noDataSinceMilliseconds,
                lastSustainedLogMilliseconds: observation.nowMilliseconds,
            });
        }
    }

    private buildEvent(
        observation: StatusEdgeDetectorObservation,
        noDataSinceMilliseconds: number,
    ): StatusEdgeDetectorEvent {
        return {
            key: observation.key,
            nowMilliseconds: observation.nowMilliseconds,
            noDataSinceMilliseconds,
            sustainedMilliseconds: observation.nowMilliseconds - noDataSinceMilliseconds,
        };
    }
}

/** Resolves the shared sustained threshold used by no-data diagnostics. */
export function resolveSustainedStatusEdgeMilliseconds(intervalMilliseconds: number): number {
    return Math.min(
        Math.max(intervalMilliseconds * 2, MIN_SUSTAINED_STATUS_EDGE_MILLISECONDS),
        MAX_SUSTAINED_STATUS_EDGE_MILLISECONDS,
    );
}
