import type { MetricSnapshot } from "../sources/metric-source";
import type {
    MetricUnavailableReport,
    SourceMetricValueMetadata,
    SourceClient,
} from "../sources/source-client";
import { BackoffPolicy } from "../sources/backoff-policy";
import type { PlannedCollectorGroup } from "./collector-group-planner";
import { logger } from "../../logging/node-logger";
import { monotonicNowMilliseconds } from "../../shared/clock";
import {
    DefaultCollectorGroupNoDataObserver,
    type CollectorGroupNoDataObserver,
} from "./collector-group-no-data-observer";
import {
    formatCollectorGroupIngestDiagnosticContext,
    MetricStoreIngestDiagnostics,
} from "./metric-store-ingest-diagnostics";
import type { MetricStoreIngestReport } from "../metric-store";

/** Result status for one collector group runner refresh attempt. */
export type CollectorGroupRefreshStatus =
    /** The runner completed a source read and ingested the snapshot. */
    | "refreshed"

    /** The source read threw and the runner recorded failure backoff. */
    | "failed"

    /** The runner did not read because retry backoff blocked the attempt. */
    | "skippedBackoff"

    /** The runner did not read because another refresh was already in flight. */
    | "skippedPending"

    /** The runner read completed after its collector group generation changed. */
    | "skippedSuperseded"

    /** The runner was stopped before the attempt could produce usable data. */
    | "stopped";

export interface CollectorGroupRefreshResult {
    readonly status: CollectorGroupRefreshStatus;
    readonly backoffDelayMilliseconds?: number;
    readonly error?: unknown;

    /**
     * Present on refreshed results: whether the snapshot carried every
     * requested metric key. Computed from the same snapshot the no-data
     * observer sees. Carried on the result rather than kept as runner state so
     * failed/skipped refreshes can never be misread as last cycle's coverage.
     */
    readonly hasAllRequestedMetrics?: boolean;
}

export interface CollectorGroupSnapshotStore {
    ingest(
        sourceScopeId: string,
        snapshot: MetricSnapshot,
        sourceMetadata?: {
            readonly valueMetadata?: readonly SourceMetricValueMetadata[];
            readonly unavailableMetrics?: readonly MetricUnavailableReport[];
        },
    ): MetricStoreIngestReport;
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
    readonly monotonicNow?: () => number;
    readonly collectorGroupNoDataObserver?: CollectorGroupNoDataObserver;
    readonly metricStoreIngestDiagnostics?: MetricStoreIngestDiagnostics;
    readonly onRefreshResult?: (
        collectorGroup: PlannedCollectorGroup,
        result: CollectorGroupRefreshResult,
    ) => void;
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
    private readonly collectorGroupNoDataObserver: CollectorGroupNoDataObserver;
    private readonly metricStoreIngestDiagnostics: MetricStoreIngestDiagnostics;
    private readonly onRefreshResult?: (
        collectorGroup: PlannedCollectorGroup,
        result: CollectorGroupRefreshResult,
    ) => void;
    private readonly monotonicNow: () => number;
    private timerHandle: unknown | null = null;
    private scheduledRefreshFireAtMonotonicMilliseconds: number | null = null;
    private pendingRefreshPromise: Promise<CollectorGroupRefreshResult> | null = null;
    private shouldRefreshAfterPendingUpdate = false;
    private recoveryTriggerAtMonotonicMilliseconds: number | null = null;
    private generation = 0;
    private isRunningLoop = false;
    private isStopped = false;

    constructor(options: CollectorGroupRunnerOptions) {
        this.collectorGroup = options.collectorGroup;
        this.sourceClient = options.sourceClient;
        this.snapshotStore = options.snapshotStore;
        this.backoffPolicy = options.backoffPolicy;
        this.timer = options.timer ?? defaultTimer;
        this.monotonicNow = options.monotonicNow ?? monotonicNowMilliseconds;
        this.collectorGroupNoDataObserver = options.collectorGroupNoDataObserver
            ?? new DefaultCollectorGroupNoDataObserver();
        this.metricStoreIngestDiagnostics = options.metricStoreIngestDiagnostics
            ?? new MetricStoreIngestDiagnostics();
        this.onRefreshResult = options.onRefreshResult;
    }

    start(): void {
        if (this.timerHandle !== null || (!this.isStopped && this.pendingRefreshPromise !== null)) {
            return;
        }

        this.isRunningLoop = true;
        this.isStopped = false;
        // "Start" here means runner start, not process launch: a widget's
        // first appearance and collector group rebuilds arrive here too, which
        // is wanted (a freshly configured device reaches its first value fast).
        this.armRecoverySchedule();
        this.scheduleNextRefresh(0);
    }

    stop(): void {
        this.isRunningLoop = false;
        this.isStopped = true;
        this.generation += 1;
        this.shouldRefreshAfterPendingUpdate = false;
        this.recoveryTriggerAtMonotonicMilliseconds = null;
        this.collectorGroupNoDataObserver.clear(this.collectorGroup.collectorGroupKey);

        this.clearScheduledRefresh();
    }

    updateCollectorGroup(collectorGroup: PlannedCollectorGroup): void {
        const shouldRefreshImmediately = !areCollectorGroupsRefreshEquivalent(this.collectorGroup, collectorGroup);
        if (collectorGroup.collectorGroupKey !== this.collectorGroup.collectorGroupKey) {
            this.collectorGroupNoDataObserver.clear(this.collectorGroup.collectorGroupKey);
        }
        this.collectorGroup = collectorGroup;

        if (shouldRefreshImmediately) {
            this.generation += 1;
            this.scheduleImmediateRefresh();
        }
    }

    async refreshNow(): Promise<CollectorGroupRefreshResult> {
        const refreshStartedAtMonotonicMilliseconds = this.monotonicNow();

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
                if (this.shouldRefreshAfterPendingUpdate && !this.isStopped) {
                    this.shouldRefreshAfterPendingUpdate = false;
                    this.scheduleNextRefresh(0);
                }
            });

        return this.pendingRefreshPromise;
    }

    /**
     * Requests an immediate pull while preserving runner-owned scheduling rules.
     *
     * Trigger causes are owned by subscriber fan-out. This runner remains
     * reason-independent because it owns only timer state, single-flight
     * suppression, backoff, generation guards, and normal timer rescheduling.
     */
    async requestOnDemandRefresh(): Promise<CollectorGroupRefreshResult> {
        if (this.isStopped || this.pendingRefreshPromise !== null || !this.backoffPolicy.canAttempt()) {
            return this.refreshNow();
        }

        this.clearScheduledRefresh();

        let refreshResult: CollectorGroupRefreshResult | undefined;
        try {
            refreshResult = await this.refreshNow();
            return refreshResult;
        } finally {
            if (this.isRunningLoop && !this.isStopped) {
                this.scheduleNextRefresh(this.resolveNextRefreshDelayMilliseconds(refreshResult));
            }
        }
    }

    /**
     * Requests the refresh appropriate after a process-recovery event.
     *
     * A runner without a recovery schedule reads immediately (returning that
     * refresh). A runner with one does not read at all: its sources are the
     * ones whose devices are still waking up, so an immediate read is a wasted
     * attempt whose miss would cost a full slow interval. Instead the schedule
     * is re-armed from now and the first attempt lands at the first offset.
     * Repeated calls only push that first attempt out again, so a burst of
     * resume events produces zero extra reads; the first offset doubles as the
     * debounce window.
     */
    requestRecoveryRefresh(): Promise<CollectorGroupRefreshResult> | undefined {
        const recoveryRetryOffsetsMilliseconds = this.recoveryRetryOffsetsMilliseconds();
        if (recoveryRetryOffsetsMilliseconds.length === 0) {
            return this.requestOnDemandRefresh();
        }

        if (this.isStopped) {
            return undefined;
        }

        // A read that started before this trigger describes the pre-sleep
        // world. Left alone, its late result would ingest pre-sleep samples
        // into the post-resume store and, if it happened to carry full
        // coverage, unload the schedule that was just armed, leaving the
        // remaining offsets unwalked. Bumping the generation makes it resolve
        // skippedSuperseded through the existing in-flight guard, which also
        // skips its store write and its scheduling influence entirely.
        this.generation += 1;
        this.armRecoverySchedule();
        // scheduleNextRefresh keeps an existing earlier timer, and a pre-sleep
        // overdue timer is exactly that: it would fire the moment the process
        // resumes, which is the read this schedule exists to delay. Replace it.
        this.clearScheduledRefresh();
        this.scheduleNextRefresh(recoveryRetryOffsetsMilliseconds[0]);
        return undefined;
    }

    /** Whether this runner currently backs the given subscriber id. */
    hasSubscriber(subscriberId: string): boolean {
        return this.collectorGroup.subscriberIds.includes(subscriberId);
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
            const ingestReport = this.snapshotStore.ingest(this.collectorGroup.sourceId, readResult.snapshot, {
                valueMetadata: readResult.valueMetadata,
                unavailableMetrics: readResult.unavailableMetrics,
            });
            // MetricStore owns value validation. The runner owns the polling
            // source/group context needed to make dropped-value diagnostics
            // actionable without coupling source adapters to store internals.
            this.metricStoreIngestDiagnostics.record(
                formatCollectorGroupIngestDiagnosticContext(this.collectorGroup),
                ingestReport,
            );
            // Only a successful source read can answer "refreshed but produced
            // none of the requested keys"; failed/skipped states are logged by
            // the refresh status path below.
            const snapshotMetricKeys = new Set(Object.keys(readResult.snapshot.metrics));
            this.recordCollectorGroupNoDataState(snapshotMetricKeys);
            this.backoffPolicy.recordSuccess();

            return {
                status: "refreshed",
                hasAllRequestedMetrics: this.collectorGroup.metricKeys
                    .every(metricKey => snapshotMetricKeys.has(metricKey)),
            };
        } catch (error) {
            // Same guard as the success path, for the same reason. A read whose
            // generation has moved on describes a world this runner has left:
            // after a resume it is the pre-sleep read, and rejecting is exactly
            // what it is most likely to do once the pipe or device is gone.
            // Recording that as a failure would arm a cooldown able to swallow
            // the first recovery attempt, and log it as if the current epoch
            // had failed.
            if (this.isStopped || refreshGeneration !== this.generation) {
                return { status: this.isStopped ? "stopped" : "skippedSuperseded" };
            }

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
        // If a source read starts before system sleep and returns after wake,
        // this elapsed duration can include suspended time. Treat unusually
        // large values near processResumeDetected as diagnostic noise first.
        const durationMilliseconds = this.monotonicNow() - refreshStartedAtMonotonicMilliseconds;
        const logMessage = () => [
            "collectorGroupRefresh",
            `status=${result.status}`,
            `sourceId=${this.collectorGroup.sourceId}`,
            `sourceScopeId=${this.collectorGroup.sourceScopeId}`,
            `groupKind=${this.collectorGroup.groupKind}`,
            `groupId=${formatCollectorGroupId(this.collectorGroup)}`,
            `metricCount=${this.collectorGroup.metricKeys.length}`,
            `subscriberCount=${this.collectorGroup.subscriberIds.length}`,
            `intervalMs=${this.collectorGroup.intervalMilliseconds}`,
            `durationMs=${durationMilliseconds}`,
            `backoffDelayMs=${result.backoffDelayMilliseconds ?? 0}`,
            `error=${result.error == null ? "" : String(result.error)}`,
        ].join(" ");

        this.onRefreshResult?.(this.collectorGroup, result);

        if (result.status === "failed") {
            log.atWarn()
                .everyMs(this.buildLogThrottleKey(result.status), REFRESH_WARNING_LOG_INTERVAL_MILLISECONDS)
                .log(logMessage);
            return result;
        }

        if (result.status === "refreshed") {
            if (durationMilliseconds > this.collectorGroup.intervalMilliseconds) {
                log.atInfo()
                    .everyMs(
                        this.buildLogThrottleKey("slowRefreshed"),
                        REFRESH_SUCCESS_LOG_INTERVAL_MILLISECONDS,
                    )
                    .log(logMessage);
                return result;
            }

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

    private buildLogThrottleKey(status: CollectorGroupRefreshStatus | "slowRefreshed"): string {
        return [
            "collectorGroupRefresh",
            status,
            this.collectorGroup.collectorGroupKey,
        ].join(":");
    }

    private recordCollectorGroupNoDataState(snapshotMetricKeys: ReadonlySet<string>): void {
        const hasAnyRequestedMetric = this.collectorGroup.metricKeys.some(metricKey => snapshotMetricKeys.has(metricKey));

        this.collectorGroupNoDataObserver.observe(
            this.collectorGroup,
            hasAnyRequestedMetric ? "ok" : "noData",
            this.monotonicNow(),
        );
    }

    // The offsets live on the planned group because the source declares them
    // for its own polling group; this runner only executes what was declared.
    private recoveryRetryOffsetsMilliseconds(): readonly number[] {
        return this.collectorGroup.recoveryRetryOffsetsMilliseconds ?? [];
    }

    private armRecoverySchedule(): void {
        if (this.recoveryRetryOffsetsMilliseconds().length > 0) {
            this.recoveryTriggerAtMonotonicMilliseconds = this.monotonicNow();
            this.logRecoveryEvent("recoveryScheduleArmed");
        }
    }

    /**
     * Traces the recovery schedule's own decisions.
     *
     * This mechanism fails silently: a widget simply shows no data longer than
     * it should, with no error anywhere, so the refresh log alone cannot say
     * whether the schedule armed, which offset it is on, or why it stopped.
     * Debug rather than info because that question is only asked while
     * diagnosing, and unthrottled because the schedule is already bounded per
     * trigger to one armed line, up to one line per offset, and one terminal
     * line; a throttle would drop the middle of the very sequence being read.
     */
    private logRecoveryEvent(event: string, detail: string = ""): void {
        log.debug(() => [
            event,
            `sourceId=${this.collectorGroup.sourceId}`,
            `groupId=${formatCollectorGroupId(this.collectorGroup)}`,
            `intervalMs=${this.collectorGroup.intervalMilliseconds}`,
            detail,
        ].filter(part => part !== "").join(" "));
    }

    /**
     * Resolves the delay before the next scheduled refresh.
     *
     * While the recovery schedule is armed and refreshes have not yet covered
     * every requested metric, the next attempt lands on the next offset that
     * is still in the future, measured from the arming trigger. There is
     * deliberately no attempt counter: any completion (a pre-trigger read
     * finishing late, an on-demand refresh, a skipped attempt) merely causes
     * this recomputation, so nothing can be miscounted as a consumed attempt.
     * Once the offsets are exhausted the schedule disarms and only a new
     * trigger (runner start or recovery request) re-arms it; an ordinary
     * failure never does.
     */
    private resolveNextRefreshDelayMilliseconds(result?: CollectorGroupRefreshResult): number {
        const intervalMilliseconds = this.collectorGroup.intervalMilliseconds;
        const recoveryTriggerAtMonotonicMilliseconds = this.recoveryTriggerAtMonotonicMilliseconds;

        if (recoveryTriggerAtMonotonicMilliseconds === null) {
            return intervalMilliseconds;
        }

        if (result?.status === "refreshed" && result.hasAllRequestedMetrics === true) {
            this.recoveryTriggerAtMonotonicMilliseconds = null;
            this.logRecoveryEvent("recoveryScheduleCompleted");
            return intervalMilliseconds;
        }

        const nowMilliseconds = this.monotonicNow();
        for (const offsetMilliseconds of this.recoveryRetryOffsetsMilliseconds()) {
            const fireAtMonotonicMilliseconds = recoveryTriggerAtMonotonicMilliseconds + offsetMilliseconds;
            if (fireAtMonotonicMilliseconds > nowMilliseconds) {
                const delayMilliseconds = fireAtMonotonicMilliseconds - nowMilliseconds;
                this.logRecoveryEvent("recoveryRetryScheduled", [
                    `offsetMs=${offsetMilliseconds}`,
                    `delayMs=${Math.round(delayMilliseconds)}`,
                    `lastStatus=${result?.status ?? "none"}`,
                ].join(" "));
                return delayMilliseconds;
            }
        }

        this.recoveryTriggerAtMonotonicMilliseconds = null;
        this.logRecoveryEvent("recoveryScheduleExhausted");
        return intervalMilliseconds;
    }

    private scheduleNextRefresh(delayMilliseconds: number): void {
        const scheduledRefreshFireAtMonotonicMilliseconds = this.monotonicNow() + delayMilliseconds;
        if (
            this.timerHandle !== null
            && this.scheduledRefreshFireAtMonotonicMilliseconds !== null
            && this.scheduledRefreshFireAtMonotonicMilliseconds <= scheduledRefreshFireAtMonotonicMilliseconds
        ) {
            return;
        }

        this.clearScheduledRefresh();
        const timerHandle = this.timer.set(() => {
            if (this.timerHandle === timerHandle) {
                this.timerHandle = null;
                this.scheduledRefreshFireAtMonotonicMilliseconds = null;
            }
            this.refreshNow()
                .then(result => {
                    if (!this.isStopped && result.status !== "skippedSuperseded") {
                        this.scheduleNextRefresh(this.resolveNextRefreshDelayMilliseconds(result));
                    }
                })
                .catch(error => {
                    this.logRefreshLoopError(error);
                    if (!this.isStopped) {
                        this.scheduleNextRefresh(this.collectorGroup.intervalMilliseconds);
                    }
                });
        }, delayMilliseconds);
        this.timerHandle = timerHandle;
        this.scheduledRefreshFireAtMonotonicMilliseconds = scheduledRefreshFireAtMonotonicMilliseconds;
    }

    private scheduleImmediateRefresh(): void {
        if (this.isStopped || !this.isRunningLoop) {
            return;
        }

        this.clearScheduledRefresh();

        if (this.pendingRefreshPromise !== null) {
            this.shouldRefreshAfterPendingUpdate = true;
            return;
        }

        this.scheduleNextRefresh(0);
    }

    private clearScheduledRefresh(): void {
        if (this.timerHandle === null) {
            this.scheduledRefreshFireAtMonotonicMilliseconds = null;
            return;
        }

        this.timer.clear(this.timerHandle);
        this.timerHandle = null;
        this.scheduledRefreshFireAtMonotonicMilliseconds = null;
    }

    private logRefreshLoopError(error: unknown): void {
        log.atWarn()
            .everyMs("collectorGroupRefreshLoopError", REFRESH_WARNING_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "collectorGroupRefreshLoopError",
                `sourceId=${this.collectorGroup.sourceId}`,
                `sourceScopeId=${this.collectorGroup.sourceScopeId}`,
                `groupKind=${this.collectorGroup.groupKind}`,
                `groupId=${formatCollectorGroupId(this.collectorGroup)}`,
                `error=${String(error)}`,
            ].join(" "));
    }
}

function formatCollectorGroupId(collectorGroup: PlannedCollectorGroup): string {
    return collectorGroup.groupKind === "sourceDeclared"
        ? collectorGroup.pollingGroupId
        : collectorGroup.isolatedMetricKey;
}

// This comparison gates generation supersession. In-place updates arrive only
// for the same collectorGroupKey, which already fixes sourceScopeId, sourceId,
// groupKind, and group id. Any future PlannedCollectorGroup field that can
// vary under that same key and affects whether an in-flight read remains valid
// must be included here.
function areCollectorGroupsRefreshEquivalent(
    left: PlannedCollectorGroup,
    right: PlannedCollectorGroup,
): boolean {
    return left.intervalMilliseconds === right.intervalMilliseconds
        && compareStringSets(left.metricKeys, right.metricKeys)
        && compareStringSets(left.subscriberIds, right.subscriberIds);
}

function compareStringSets(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }

    const rightValues = new Set(right);
    return left.every(value => rightValues.has(value));
}
