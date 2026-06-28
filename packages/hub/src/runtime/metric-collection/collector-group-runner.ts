import type { MetricSnapshot } from "../sources/metric-source";
import type {
    MetricUnavailableReport,
    SourceMetricValueMetadata,
    SourceClient,
} from "../sources/source-client";
import { BackoffPolicy } from "../sources/backoff-policy";
import type { PlannedCollectorGroup } from "./collector-group-planner";
import { logger } from "../../logging/logger";
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
    private timerHandle: unknown | null = null;
    private scheduledRefreshFireAtMonotonicMilliseconds: number | null = null;
    private pendingRefreshPromise: Promise<CollectorGroupRefreshResult> | null = null;
    private shouldRefreshAfterPendingUpdate = false;
    private generation = 0;
    private isRunningLoop = false;
    private isStopped = false;

    constructor(options: CollectorGroupRunnerOptions) {
        this.collectorGroup = options.collectorGroup;
        this.sourceClient = options.sourceClient;
        this.snapshotStore = options.snapshotStore;
        this.backoffPolicy = options.backoffPolicy;
        this.timer = options.timer ?? defaultTimer;
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
        this.scheduleNextRefresh(0);
    }

    stop(): void {
        this.isRunningLoop = false;
        this.isStopped = true;
        this.generation += 1;
        this.shouldRefreshAfterPendingUpdate = false;
        this.collectorGroupNoDataObserver.clear(this.collectorGroup.collectorGroupKey);

        this.clearScheduledRefresh();
    }

    updateCollectorGroup(collectorGroup: PlannedCollectorGroup): void {
        const shouldRefreshImmediately = !areCollectorGroupsRefreshEquivalent(this.collectorGroup, collectorGroup);
        if (collectorGroup.collectorGroupKey !== this.collectorGroup.collectorGroupKey) {
            this.collectorGroupNoDataObserver.clear(this.collectorGroup.collectorGroupKey);
        }
        this.collectorGroup = collectorGroup;
        this.generation += 1;

        if (shouldRefreshImmediately) {
            this.scheduleImmediateRefresh();
        }
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

        try {
            return await this.refreshNow();
        } finally {
            if (this.isRunningLoop && !this.isStopped) {
                this.scheduleNextRefresh(this.collectorGroup.intervalMilliseconds);
            }
        }
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
            this.recordCollectorGroupNoDataState(readResult.snapshot);
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

        this.onRefreshResult?.(this.collectorGroup, result);

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

    private recordCollectorGroupNoDataState(snapshot: MetricSnapshot): void {
        const snapshotMetricKeys = new Set(Object.keys(snapshot.metrics));
        const hasAnyRequestedMetric = this.collectorGroup.metricKeys.some(metricKey => snapshotMetricKeys.has(metricKey));

        this.collectorGroupNoDataObserver.observe(
            this.collectorGroup,
            hasAnyRequestedMetric ? "ok" : "noData",
            monotonicNowMilliseconds(),
        );
    }

    private scheduleNextRefresh(delayMilliseconds: number): void {
        const scheduledRefreshFireAtMonotonicMilliseconds = monotonicNowMilliseconds() + delayMilliseconds;
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
                        this.scheduleNextRefresh(this.collectorGroup.intervalMilliseconds);
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
