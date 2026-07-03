import { resolveProductionLogThrottleMilliseconds } from "../../logging/log-throttle";
import { logger, type ScopedLogger } from "../../logging/node-logger";
import { monotonicNowMilliseconds } from "../../shared/clock";
import type {
    MetricStoreAcceptedScalarDiagnosticSample,
    MetricStoreIngestRejection,
    MetricStoreIngestRejectionReason,
    MetricStoreIngestReport,
} from "../metric-store";
import { CUSTOM_HTTP_SOURCE_ID } from "../sources/source-ids";
import type { PlannedCollectorGroup } from "./collector-group-planner";

const log = logger.for("MetricStoreIngestDiagnostics");
const INVALID_VALUES_LOG_INTERVAL_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60_000);
const MAX_SAMPLE_REJECTIONS = 8;
const MAX_FIRST_SCALAR_DIAGNOSTIC_SAMPLES = 8;

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

export interface MetricStoreFirstScalarDiagnosticSamplesLogEntry {
    readonly sourceId: string;
    readonly sourceScopeId: string | undefined;
    readonly groupKind: string | undefined;
    readonly groupId: string | undefined;
    readonly sampleCount: number;
    readonly deferredSampleCount: number;
    readonly samples: readonly MetricStoreAcceptedScalarDiagnosticSample[];
    readonly intervalMilliseconds: number | undefined;
}

interface MetricStoreIngestDiagnosticsOptions {
    readonly logWriter?: MetricStoreIngestDiagnosticsLogWriter;
    readonly nowMilliseconds?: () => number;
    readonly throttleMilliseconds?: number;
}

interface MetricStoreIngestDiagnosticsLogWriter {
    writeFirstScalarDiagnosticSamples(entry: MetricStoreFirstScalarDiagnosticSamplesLogEntry): void;
    write(entry: MetricStoreInvalidValuesLogEntry): void;
}

interface PendingInvalidValuesBucket {
    readonly metricKeys: Set<string>;
    readonly reasonCounts: Map<MetricStoreIngestRejectionReason, number>;
    readonly sampleRejections: MetricStoreIngestRejection[];
    readonly sampleRejectionKeys: Set<string>;
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
    private readonly loggedFirstScalarDiagnosticSampleKeys = new Set<string>();

    constructor(options: MetricStoreIngestDiagnosticsOptions = {}) {
        this.logWriter = options.logWriter ?? new LoggerMetricStoreIngestDiagnosticsLogWriter(log);
        this.nowMilliseconds = options.nowMilliseconds ?? monotonicNowMilliseconds;
        this.throttleMilliseconds = options.throttleMilliseconds ?? INVALID_VALUES_LOG_INTERVAL_MILLISECONDS;
    }

    record(context: MetricStoreIngestDiagnosticContext, report: MetricStoreIngestReport): void {
        this.recordFirstScalarDiagnosticSamples(context, report);

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

            const sampleRejectionKey = `${rejection.metricKey}:${rejection.reason}`;
            if (
                bucket.sampleRejections.length < MAX_SAMPLE_REJECTIONS
                && !bucket.sampleRejectionKeys.has(sampleRejectionKey)
            ) {
                bucket.sampleRejections.push(rejection);
                bucket.sampleRejectionKeys.add(sampleRejectionKey);
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
        bucket.sampleRejectionKeys.clear();
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
            sampleRejectionKeys: new Set<string>(),
            lastLogMilliseconds: undefined,
        };
        this.bucketsByKey.set(bucketKey, bucket);
        return bucket;
    }

    private recordFirstScalarDiagnosticSamples(
        context: MetricStoreIngestDiagnosticContext,
        report: MetricStoreIngestReport,
    ): void {
        if (context.sourceId === CUSTOM_HTTP_SOURCE_ID) {
            return;
        }

        const unloggedSamples = report.acceptedScalarDiagnosticSamples.filter(sample => (
            !this.loggedFirstScalarDiagnosticSampleKeys.has(
                buildFirstScalarDiagnosticSampleKey(context, sample.metricKey),
            )
        ));
        const samplesToWrite = unloggedSamples.slice(0, MAX_FIRST_SCALAR_DIAGNOSTIC_SAMPLES);

        for (const sample of samplesToWrite) {
            const sampleKey = buildFirstScalarDiagnosticSampleKey(context, sample.metricKey);
            this.loggedFirstScalarDiagnosticSampleKeys.add(sampleKey);
        }

        if (samplesToWrite.length === 0) {
            return;
        }

        this.logWriter.writeFirstScalarDiagnosticSamples({
            sourceId: context.sourceId,
            sourceScopeId: context.sourceScopeId,
            groupKind: context.groupKind,
            groupId: context.groupId,
            sampleCount: samplesToWrite.length,
            deferredSampleCount: Math.max(unloggedSamples.length - MAX_FIRST_SCALAR_DIAGNOSTIC_SAMPLES, 0),
            samples: samplesToWrite,
            intervalMilliseconds: context.intervalMilliseconds,
        });
    }
}

/** Carries collector ownership into MetricStore rejection logs without teaching sources store rules. */
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

function buildFirstScalarDiagnosticSampleKey(context: MetricStoreIngestDiagnosticContext, metricKey: string): string {
    return JSON.stringify([
        context.sourceId,
        context.sourceScopeId ?? "",
        metricKey,
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

    writeFirstScalarDiagnosticSamples(entry: MetricStoreFirstScalarDiagnosticSamplesLogEntry): void {
        this.scopedLogger.info(() => [
            "metricStoreFirstScalarDiagnosticSamples",
            `sourceId=${entry.sourceId}`,
            `sourceScopeId=${entry.sourceScopeId ?? ""}`,
            `groupKind=${entry.groupKind ?? ""}`,
            `groupId=${entry.groupId ?? ""}`,
            `sampleCount=${entry.sampleCount}`,
            `deferredSampleCount=${entry.deferredSampleCount}`,
            `samples=${formatFirstScalarDiagnosticSamplesForLog(entry.samples)}`,
            `intervalMs=${entry.intervalMilliseconds ?? ""}`,
        ].join(" "));
    }

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

function formatFirstScalarDiagnosticSamplesForLog(samples: readonly MetricStoreAcceptedScalarDiagnosticSample[]): string {
    return samples
        .map(sample => `${sample.metricKey}=${formatScalarDiagnosticSampleValue(sample.value)}:${sample.unit}`)
        .join(",");
}

function formatScalarDiagnosticSampleValue(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toPrecision(6);
}
