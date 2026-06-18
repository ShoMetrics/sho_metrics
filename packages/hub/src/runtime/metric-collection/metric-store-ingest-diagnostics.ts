import { resolveProductionLogThrottleMilliseconds } from "../../logging/log-throttle";
import { logger, type ScopedLogger } from "../../logging/logger";
import { monotonicNowMilliseconds } from "../../shared/clock";
import type {
    MetricStoreIngestRejection,
    MetricStoreIngestRejectionReason,
    MetricStoreIngestReport,
} from "../metric-store";
import type { PlannedCollectorGroup } from "./collector-group-planner";

const log = logger.for("MetricStoreIngestDiagnostics");
const INVALID_VALUES_LOG_INTERVAL_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60_000);
const MAX_SAMPLE_REJECTIONS = 8;

/** Identifies the source boundary that owns one MetricStore ingest call. */
export interface MetricStoreIngestDiagnosticContext {
    readonly sourceId: string;
    readonly sourceScopeId?: string;
    readonly groupKind?: PlannedCollectorGroup["groupKind"] | "runtimeOptionRefresh";
    readonly groupId?: string;
    readonly intervalMilliseconds?: number;
}

/** Bounded production log payload for invalid values dropped by MetricStore. */
export interface MetricStoreInvalidValuesLogEntry {
    readonly sourceId: string;
    readonly sourceScopeId: string | undefined;
    readonly groupKind: string | undefined;
    readonly groupId: string | undefined;
    readonly rejectedCount: number;
    readonly uniqueMetricCount: number;
    readonly topReasons: readonly MetricStoreInvalidValueReasonCount[];
    readonly sampleRejections: readonly MetricStoreIngestRejection[];
    readonly intervalMilliseconds: number | undefined;
}

export interface MetricStoreInvalidValueReasonCount {
    readonly reason: MetricStoreIngestRejectionReason;
    readonly count: number;
}

interface MetricStoreIngestDiagnosticsOptions {
    readonly logWriter?: MetricStoreIngestDiagnosticsLogWriter;
    readonly nowMilliseconds?: () => number;
    readonly throttleMilliseconds?: number;
}

interface MetricStoreIngestDiagnosticsLogWriter {
    write(entry: MetricStoreInvalidValuesLogEntry): void;
}

interface PendingInvalidValuesBucket {
    readonly metricKeys: Set<string>;
    readonly reasonCounts: Map<MetricStoreIngestRejectionReason, number>;
    readonly sampleRejections: MetricStoreIngestRejection[];
    rejectedCount: number;
    lastLogMilliseconds: number | undefined;
}

/**
 * Aggregates MetricStore ingest rejections into low-frequency source summaries.
 *
 * This class is deliberately downstream of MetricStore. MetricStore remains the
 * single owner of "accepted vs dropped" rules; diagnostics only groups the
 * returned report by source/group so production logs can explain bad source
 * output without logging every sample.
 */
export class MetricStoreIngestDiagnostics {
    private readonly logWriter: MetricStoreIngestDiagnosticsLogWriter;
    private readonly nowMilliseconds: () => number;
    private readonly throttleMilliseconds: number;
    private readonly bucketsByKey = new Map<string, PendingInvalidValuesBucket>();

    constructor(options: MetricStoreIngestDiagnosticsOptions = {}) {
        this.logWriter = options.logWriter ?? new LoggerMetricStoreIngestDiagnosticsLogWriter(log);
        this.nowMilliseconds = options.nowMilliseconds ?? monotonicNowMilliseconds;
        this.throttleMilliseconds = options.throttleMilliseconds ?? INVALID_VALUES_LOG_INTERVAL_MILLISECONDS;
    }

    record(context: MetricStoreIngestDiagnosticContext, report: MetricStoreIngestReport): void {
        if (report.rejectedCount === 0) {
            return;
        }

        const bucketKey = buildDiagnosticsBucketKey(context);
        const bucket = this.readOrCreateBucket(bucketKey);

        for (const rejection of report.rejections) {
            bucket.rejectedCount += 1;
            bucket.metricKeys.add(rejection.metricKey);
            bucket.reasonCounts.set(
                rejection.reason,
                (bucket.reasonCounts.get(rejection.reason) ?? 0) + 1,
            );

            if (bucket.sampleRejections.length < MAX_SAMPLE_REJECTIONS) {
                bucket.sampleRejections.push(rejection);
            }
        }

        const nowMilliseconds = this.nowMilliseconds();
        if (
            bucket.lastLogMilliseconds !== undefined
            && nowMilliseconds - bucket.lastLogMilliseconds < this.throttleMilliseconds
        ) {
            return;
        }

        // The first invalid value for a bucket is written immediately so a
        // support log shows the failure without waiting for another poll.
        // Later invalid values are coalesced until the next invalid sample
        // after the throttle window; there is no timer that wakes only to log.
        this.logWriter.write({
            sourceId: context.sourceId,
            sourceScopeId: context.sourceScopeId,
            groupKind: context.groupKind,
            groupId: context.groupId,
            rejectedCount: bucket.rejectedCount,
            uniqueMetricCount: bucket.metricKeys.size,
            topReasons: formatReasonCounts(bucket.reasonCounts),
            sampleRejections: [...bucket.sampleRejections],
            intervalMilliseconds: context.intervalMilliseconds,
        });
        bucket.rejectedCount = 0;
        bucket.metricKeys.clear();
        bucket.reasonCounts.clear();
        bucket.sampleRejections.length = 0;
        bucket.lastLogMilliseconds = nowMilliseconds;
    }

    private readOrCreateBucket(bucketKey: string): PendingInvalidValuesBucket {
        let bucket = this.bucketsByKey.get(bucketKey);
        if (bucket) {
            return bucket;
        }

        bucket = {
            rejectedCount: 0,
            metricKeys: new Set<string>(),
            reasonCounts: new Map<MetricStoreIngestRejectionReason, number>(),
            sampleRejections: [],
            lastLogMilliseconds: undefined,
        };
        this.bucketsByKey.set(bucketKey, bucket);
        return bucket;
    }
}

/** Builds the diagnostics identity for a scheduled collector-group refresh. */
export function formatCollectorGroupIngestDiagnosticContext(
    collectorGroup: PlannedCollectorGroup,
): MetricStoreIngestDiagnosticContext {
    return {
        sourceId: collectorGroup.sourceId,
        sourceScopeId: collectorGroup.sourceScopeId,
        groupKind: collectorGroup.groupKind,
        groupId: formatCollectorGroupId(collectorGroup),
        intervalMilliseconds: collectorGroup.intervalMilliseconds,
    };
}

function buildDiagnosticsBucketKey(context: MetricStoreIngestDiagnosticContext): string {
    // Bucket by logical source/group, not individual metric key. One broken
    // source can drop many values in one poll; the log should stay source-wide
    // while sampleRejections shows representative metric keys.
    return JSON.stringify([
        context.sourceId,
        context.sourceScopeId ?? "",
        context.groupKind ?? "",
        context.groupId ?? "",
    ]);
}

function formatReasonCounts(
    reasonCounts: ReadonlyMap<MetricStoreIngestRejectionReason, number>,
): readonly MetricStoreInvalidValueReasonCount[] {
    return Array.from(reasonCounts.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((first, second) => second.count - first.count || first.reason.localeCompare(second.reason));
}

function formatCollectorGroupId(collectorGroup: PlannedCollectorGroup): string {
    return collectorGroup.groupKind === "sourceDeclared"
        ? collectorGroup.pollingGroupId
        : collectorGroup.isolatedMetricKey;
}

class LoggerMetricStoreIngestDiagnosticsLogWriter implements MetricStoreIngestDiagnosticsLogWriter {
    constructor(private readonly scopedLogger: ScopedLogger) {}

    write(entry: MetricStoreInvalidValuesLogEntry): void {
        this.scopedLogger.warn(() => [
            "metricStoreInvalidValuesDropped",
            `sourceId=${entry.sourceId}`,
            `sourceScopeId=${entry.sourceScopeId ?? ""}`,
            `groupKind=${entry.groupKind ?? ""}`,
            `groupId=${entry.groupId ?? ""}`,
            `rejectedCount=${entry.rejectedCount}`,
            `uniqueMetricCount=${entry.uniqueMetricCount}`,
            `topReasons=${formatReasonCountsForLog(entry.topReasons)}`,
            `sampleRejections=${formatSampleRejectionsForLog(entry.sampleRejections)}`,
            `intervalMs=${entry.intervalMilliseconds ?? ""}`,
        ].join(" "));
    }
}

function formatReasonCountsForLog(reasonCounts: readonly MetricStoreInvalidValueReasonCount[]): string {
    return reasonCounts.map(reasonCount => `${reasonCount.reason}:${reasonCount.count}`).join(",");
}

function formatSampleRejectionsForLog(rejections: readonly MetricStoreIngestRejection[]): string {
    return rejections.map(rejection => `${rejection.metricKey}(${rejection.reason})`).join(",");
}
