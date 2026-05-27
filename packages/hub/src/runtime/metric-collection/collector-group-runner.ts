import type { MetricSnapshot } from "../sources/metric-source";
import type {
    MetricUnavailableReport,
    MetricValueAttribution,
    SourceClient,
} from "../sources/source-client";
import { BackoffPolicy } from "../sources/backoff-policy";
import type { PlannedCollectorGroup } from "./collector-group-planner";
import { logger } from "../../logging/logger";
import { monotonicNowMilliseconds } from "../../shared/clock";

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
    ingest(
        sourceScopeId: string,
        snapshot: MetricSnapshot,
        sourceMetadata?: {
            readonly valueAttributions?: readonly MetricValueAttribution[];
            readonly unavailableMetrics?: readonly MetricUnavailableReport[];
        },
    ): void;
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

const log = logger.for("CollectorGroupRunner");
const REFRESH_SUCCESS_LOG_INTERVAL_MILLISECONDS = 30000;
const REFRESH_WARNING_LOG_INTERVAL_MILLISECONDS = 30000;
const REFRESH_DEBUG_LOG_INTERVAL_MILLISECONDS = 5000;

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
        const refreshStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();

        if (this.isStopped) {
            return this.recordRefreshResult(
                { status: "stopped" },
                refreshStartedAtMonotonicMilliseconds,
            );
        }

        if (this.pendingRefreshPromise !== null) {
            return this.recordRefreshResult(
                { status: "skippedPending" },
                refreshStartedAtMonotonicMilliseconds,
            );
        }

        if (!this.backoffPolicy.canAttempt()) {
            return this.recordRefreshResult(
                { status: "skippedBackoff" },
                refreshStartedAtMonotonicMilliseconds,
            );
        }

        const refreshGeneration = this.generation;

        this.pendingRefreshPromise = this.refresh(refreshGeneration)
            .then(result => this.recordRefreshResult(result, refreshStartedAtMonotonicMilliseconds))
            .finally(() => {
                this.pendingRefreshPromise = null;
            });

        return this.pendingRefreshPromise;
    }

    private async refresh(refreshGeneration: number): Promise<CollectorGroupRefreshResult> {
        try {
            const readResult = await this.sourceClient.readSnapshot(this.collectorGroup.metricKeys);

            if (this.isStopped || refreshGeneration !== this.generation) {
                return { status: this.isStopped ? "stopped" : "skippedSuperseded" };
            }

            // Background samples stay scoped to the source/profile that
            // produced them. Read-time fallback composes those scoped samples
            // into the action's logical source scope later.
            this.snapshotStore.ingest(this.collectorGroup.sourceId, readResult.snapshot, {
                valueAttributions: readResult.valueAttributions,
                unavailableMetrics: readResult.unavailableMetrics,
            });
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

    private recordRefreshResult(
        result: CollectorGroupRefreshResult,
        refreshStartedAtMonotonicMilliseconds: number,
    ): CollectorGroupRefreshResult {
        const durationMilliseconds = monotonicNowMilliseconds() - refreshStartedAtMonotonicMilliseconds;
        const logMessage = () => [
            "collectorGroupRefresh",
            `status=${result.status}`,
            `sourceId=${this.collectorGroup.sourceId}`,
            `sourceScopeId=${this.collectorGroup.sourceScopeId}`,
            `groupKind=${this.collectorGroup.groupKind}`,
            `groupId=${formatCollectorGroupId(this.collectorGroup)}`,
            `metricCount=${this.collectorGroup.metricKeys.length}`,
            `subscriberCount=${this.collectorGroup.subscriberIds.length}`,
            `durationMs=${durationMilliseconds}`,
            `backoffDelayMs=${result.backoffDelayMilliseconds ?? 0}`,
            `error=${result.error == null ? "" : String(result.error)}`,
        ].join(" ");

        if (result.status === "failed") {
            log.atWarn()
                .everyMs(this.buildLogThrottleKey(result.status), REFRESH_WARNING_LOG_INTERVAL_MILLISECONDS)
                .log(logMessage);
            return result;
        }

        if (result.status === "refreshed") {
            log.atDebug()
                .everyMs(this.buildLogThrottleKey(result.status), REFRESH_SUCCESS_LOG_INTERVAL_MILLISECONDS)
                .log(logMessage);
            return result;
        }

        log.atDebug()
            .everyMs(this.buildLogThrottleKey(result.status), REFRESH_DEBUG_LOG_INTERVAL_MILLISECONDS)
            .log(logMessage);
        return result;
    }

    private buildLogThrottleKey(status: CollectorGroupRefreshStatus): string {
        return [
            "collectorGroupRefresh",
            status,
            this.collectorGroup.collectorGroupKey,
        ].join(":");
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

function formatCollectorGroupId(collectorGroup: PlannedCollectorGroup): string {
    return collectorGroup.groupKind === "sourceDeclared"
        ? collectorGroup.pollingGroupId
        : collectorGroup.isolatedMetricKey;
}
