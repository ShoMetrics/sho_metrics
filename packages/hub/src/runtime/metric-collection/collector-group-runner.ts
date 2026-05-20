import type { MetricSnapshot } from "../sources/metric-source";
import type { SourceClient } from "../sources/source-client";
import { BackoffPolicy } from "../sources/backoff-policy";
import type { PlannedCollectorGroup } from "./collector-group-planner";

export type CollectorGroupRefreshStatus =
    | "refreshed"
    | "failed"
    | "skippedBackoff"
    | "skippedPending"
    | "skippedSuperseded"
    | "stopped";

export interface CollectorGroupRefreshResult {
    readonly status: CollectorGroupRefreshStatus;
    readonly backoffDelayMilliseconds?: number;
    readonly error?: unknown;
}

export interface CollectorGroupSnapshotStore {
    ingest(sourceScopeId: string, snapshot: MetricSnapshot): void;
}

export interface CollectorGroupRunnerTimer {
    set(callback: () => void, delayMilliseconds: number): unknown;
    clear(handle: unknown): void;
}

export interface CollectorGroupRunnerOptions {
    readonly collectorGroup: PlannedCollectorGroup;
    readonly sourceClient: Pick<SourceClient, "readSnapshot">;
    readonly snapshotStore: CollectorGroupSnapshotStore;
    readonly backoffPolicy: BackoffPolicy;
    readonly timer?: CollectorGroupRunnerTimer;
}

const defaultTimer: CollectorGroupRunnerTimer = {
    set: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
    clear: handle => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * Runs one background refresh loop for one planned collector group.
 *
 * It owns timer state, in-flight suppression, retry backoff, and the generation
 * guard that prevents stopped or superseded refreshes from writing samples.
 */
export class CollectorGroupRunner {
    private collectorGroup: PlannedCollectorGroup;
    private readonly sourceClient: Pick<SourceClient, "readSnapshot">;
    private readonly snapshotStore: CollectorGroupSnapshotStore;
    private readonly backoffPolicy: BackoffPolicy;
    private readonly timer: CollectorGroupRunnerTimer;
    private timerHandle: unknown | null = null;
    private pendingRefreshPromise: Promise<CollectorGroupRefreshResult> | null = null;
    private generation = 0;
    private isStopped = false;

    constructor(options: CollectorGroupRunnerOptions) {
        this.collectorGroup = options.collectorGroup;
        this.sourceClient = options.sourceClient;
        this.snapshotStore = options.snapshotStore;
        this.backoffPolicy = options.backoffPolicy;
        this.timer = options.timer ?? defaultTimer;
    }

    start(): void {
        if (this.timerHandle !== null || (!this.isStopped && this.pendingRefreshPromise !== null)) {
            return;
        }

        this.isStopped = false;
        this.scheduleNextRefresh(0);
    }

    stop(): void {
        this.isStopped = true;
        this.generation += 1;

        if (this.timerHandle !== null) {
            this.timer.clear(this.timerHandle);
            this.timerHandle = null;
        }
    }

    updateCollectorGroup(collectorGroup: PlannedCollectorGroup): void {
        this.collectorGroup = collectorGroup;
        this.generation += 1;
    }

    async refreshNow(): Promise<CollectorGroupRefreshResult> {
        if (this.isStopped) {
            return { status: "stopped" };
        }

        if (this.pendingRefreshPromise !== null) {
            return { status: "skippedPending" };
        }

        if (!this.backoffPolicy.canAttempt()) {
            return { status: "skippedBackoff" };
        }

        const refreshGeneration = this.generation;

        this.pendingRefreshPromise = this.refresh(refreshGeneration)
            .finally(() => {
                this.pendingRefreshPromise = null;
            });

        return this.pendingRefreshPromise;
    }

    private async refresh(refreshGeneration: number): Promise<CollectorGroupRefreshResult> {
        try {
            const snapshot = await this.sourceClient.readSnapshot(this.collectorGroup.metricKeys);

            if (this.isStopped || refreshGeneration !== this.generation) {
                return { status: this.isStopped ? "stopped" : "skippedSuperseded" };
            }

            this.snapshotStore.ingest(this.collectorGroup.sourceScopeId, snapshot);
            this.backoffPolicy.recordSuccess();

            return { status: "refreshed" };
        } catch (error) {
            const backoffDelayMilliseconds = this.backoffPolicy.recordFailure();

            return {
                status: "failed",
                backoffDelayMilliseconds,
                error,
            };
        }
    }

    private scheduleNextRefresh(delayMilliseconds: number): void {
        this.timerHandle = this.timer.set(() => {
            this.timerHandle = null;
            this.refreshNow()
                .finally(() => {
                    if (!this.isStopped) {
                        this.scheduleNextRefresh(this.collectorGroup.intervalMilliseconds);
                    }
                });
        }, delayMilliseconds);
    }
}
