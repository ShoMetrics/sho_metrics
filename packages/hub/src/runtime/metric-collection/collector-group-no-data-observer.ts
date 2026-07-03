import { resolveProductionLogThrottleMilliseconds } from "../../logging/log-throttle";
import { logger, type LogLevel, type ScopedLogger } from "../../logging/node-logger";
import {
    STATUS_EDGE_PRODUCTION_LOG_INTERVAL_MILLISECONDS,
    StatusEdgeDetector,
    resolveSustainedStatusEdgeMilliseconds,
    type StatusEdgeDetectorEvent,
    type StatusEdgeState,
} from "../../logging/status-edge-detector";
import type { PlannedCollectorGroup } from "./collector-group-planner";

const log = logger.for("CollectorGroupNoData");
const MAX_SAMPLE_METRIC_KEYS = 8;
const SUSTAINED_NO_DATA_WARNING_LOG_INTERVAL_MILLISECONDS = resolveProductionLogThrottleMilliseconds(600_000);

/** Observes whether a refreshed collector group produced any requested key. */
export interface CollectorGroupNoDataObserver {
    observe(collectorGroup: PlannedCollectorGroup, state: StatusEdgeState, nowMilliseconds: number): void;
    clear(collectorGroupKey: string): void;
}

/**
 * Emits source/group-level no-data diagnostics for successful refreshes.
 *
 * This is the coarse root-cause signal that complements per-action displayed
 * no-data logs; it does not run for failed or skipped refresh statuses.
 */
export class DefaultCollectorGroupNoDataObserver implements CollectorGroupNoDataObserver {
    private readonly detector: StatusEdgeDetector;
    private readonly logWriter: CollectorGroupNoDataLogWriter;

    constructor(options: {
        readonly detector?: StatusEdgeDetector;
        readonly logWriter?: CollectorGroupNoDataLogWriter;
    } = {}) {
        this.detector = options.detector ?? new StatusEdgeDetector();
        this.logWriter = options.logWriter ?? new LoggerCollectorGroupNoDataLogWriter(log);
    }

    observe(collectorGroup: PlannedCollectorGroup, state: StatusEdgeState, nowMilliseconds: number): void {
        const sustainedAfterMilliseconds = resolveCollectorGroupSustainedNoDataMilliseconds(
            collectorGroup.intervalMilliseconds,
        );

        this.detector.observe({
            key: collectorGroup.collectorGroupKey,
            state,
            nowMilliseconds,
            sustainedAfterMilliseconds,
            sustainedLogIntervalMilliseconds: resolveProductionLogThrottleMilliseconds(
                Math.max(sustainedAfterMilliseconds, STATUS_EDGE_PRODUCTION_LOG_INTERVAL_MILLISECONDS),
            ),
            logEnter: event => this.writeLog("collectorGroupNoDataEntered", collectorGroup, event),
            logSustained: event => this.writeLog("collectorGroupNoDataSustained", collectorGroup, event),
            logRecover: event => this.writeLog("collectorGroupNoDataRecovered", collectorGroup, event),
        });
    }

    clear(collectorGroupKey: string): void {
        this.detector.delete(collectorGroupKey);
    }

    private writeLog(
        eventName: CollectorGroupNoDataLogEntry["event"],
        collectorGroup: PlannedCollectorGroup,
        event: StatusEdgeDetectorEvent,
    ): void {
        this.logWriter.write({
            event: eventName,
            sourceId: collectorGroup.sourceId,
            sourceScopeId: collectorGroup.sourceScopeId,
            groupKind: collectorGroup.groupKind,
            groupId: formatCollectorGroupNoDataGroupId(collectorGroup),
            metricCount: collectorGroup.metricKeys.length,
            subscriberCount: collectorGroup.subscriberIds.length,
            intervalMilliseconds: collectorGroup.intervalMilliseconds,
            sampleMetricKeys: collectorGroup.metricKeys.slice(0, MAX_SAMPLE_METRIC_KEYS),
            sustainedMilliseconds: event.sustainedMilliseconds,
        });
    }
}

/** Bounded production log payload for one collector group no-data event. */
export interface CollectorGroupNoDataLogEntry {
    readonly event:
        | "collectorGroupNoDataEntered"
        | "collectorGroupNoDataSustained"
        | "collectorGroupNoDataRecovered";
    readonly sourceId: string;
    readonly sourceScopeId: string;
    readonly groupKind: PlannedCollectorGroup["groupKind"];
    readonly groupId: string;
    readonly metricCount: number;
    readonly subscriberCount: number;
    readonly intervalMilliseconds: number;
    readonly sampleMetricKeys: readonly string[];
    readonly sustainedMilliseconds: number;
}

interface CollectorGroupNoDataLogWriter {
    write(entry: CollectorGroupNoDataLogEntry): void;
}

function resolveCollectorGroupSustainedNoDataMilliseconds(intervalMilliseconds: number): number {
    return resolveSustainedStatusEdgeMilliseconds(intervalMilliseconds);
}

function formatCollectorGroupNoDataGroupId(collectorGroup: PlannedCollectorGroup): string {
    return collectorGroup.groupKind === "sourceDeclared"
        ? collectorGroup.pollingGroupId
        : collectorGroup.isolatedMetricKey;
}

class LoggerCollectorGroupNoDataLogWriter implements CollectorGroupNoDataLogWriter {
    constructor(private readonly scopedLogger: ScopedLogger) {}

    write(entry: CollectorGroupNoDataLogEntry): void {
        const logAtLevel = resolveCollectorGroupNoDataLogLevel(entry.event) === "warn"
            ? this.scopedLogger.atWarn()
            : this.scopedLogger.atInfo();

        logAtLevel
            .everyMs(
                `collector-group-no-data:${entry.event}:${entry.sourceId}:${entry.groupId}`,
                resolveCollectorGroupNoDataLogIntervalMilliseconds(entry),
            )
            .log(() => [
                entry.event,
                `sourceId=${entry.sourceId}`,
                `sourceScopeId=${entry.sourceScopeId}`,
                `groupKind=${entry.groupKind}`,
                `groupId=${entry.groupId}`,
                `metricCount=${entry.metricCount}`,
                `subscriberCount=${entry.subscriberCount}`,
                `intervalMs=${entry.intervalMilliseconds}`,
                `sampleMetricKeys=${entry.sampleMetricKeys.join(",")}`,
                `sustainedMs=${entry.sustainedMilliseconds}`,
            ].join(" "));
    }
}

function resolveCollectorGroupNoDataLogIntervalMilliseconds(entry: CollectorGroupNoDataLogEntry): number {
    return entry.event === "collectorGroupNoDataSustained"
        && resolveCollectorGroupNoDataLogLevel(entry.event) === "warn"
        ? SUSTAINED_NO_DATA_WARNING_LOG_INTERVAL_MILLISECONDS
        : resolveProductionLogThrottleMilliseconds(STATUS_EDGE_PRODUCTION_LOG_INTERVAL_MILLISECONDS);
}

/** Keeps recovery out of WARN so transient source gaps do not count as active failures. */
export function resolveCollectorGroupNoDataLogLevel(
    eventName: CollectorGroupNoDataLogEntry["event"],
): LogLevel {
    return eventName === "collectorGroupNoDataRecovered" ? "info" : "warn";
}
