import { resolveProductionLogThrottleMilliseconds } from "../../logging/log-throttle";
import { logger, type LogLevel, type ScopedLogger } from "../../logging/node-logger";
import {
    STATUS_EDGE_PRODUCTION_LOG_INTERVAL_MILLISECONDS,
    StatusEdgeDetector,
    resolveSustainedStatusEdgeMilliseconds,
    type StatusEdgeDetectorEvent,
} from "../../logging/status-edge-detector";
import type {
    DisplayedMetricReadOutcome,
} from "../../runtime/widget-runtime-cache";
import type { SourceClientStatus } from "../../runtime/sources/source-client";

const log = logger.for("DisplayedMetricNoData");
const SUSTAINED_NO_DATA_WARNING_LOG_INTERVAL_MILLISECONDS = resolveProductionLogThrottleMilliseconds(600_000);

/** Render-path trace sample for the primary metric shown by one action. */
export interface DisplayedMetricNoDataObservation {
    readonly actionId: string;
    readonly metricKey: string;
    /** First source route in the action read plan, before fallback selection. */
    readonly preferredSourceId: string | undefined;
    /** Source route that actually produced the displayed value, if any. */
    readonly selectedSourceId: string | undefined;
    readonly preferredSourceStatus: SourceClientStatus | undefined;
    readonly outcome: DisplayedMetricReadOutcome | undefined;
    /** Wall-clock activation timestamp used only for first-read grace. */
    readonly actionAppearedAtTimestampMilliseconds: number;
    readonly nowMilliseconds: number;
    readonly pollingIntervalMilliseconds: number;
}

/** Observes per-action displayed metric no-data edges without changing rendering. */
export interface DisplayedMetricNoDataObserver {
    observe(observation: DisplayedMetricNoDataObservation): void;
    clearAction(actionId: string): void;
}

interface DisplayedMetricNoDataObserverOptions {
    readonly detector?: StatusEdgeDetector;
    readonly logWriter?: DisplayedMetricNoDataLogWriter;
}

interface DisplayedMetricNoDataLogWriter {
    write(entry: DisplayedMetricNoDataLogEntry): void;
}

/** Bounded production log payload for one displayed metric no-data event. */
export interface DisplayedMetricNoDataLogEntry {
    readonly event:
        | "displayedMetricNoDataEntered"
        | "displayedMetricNoDataSustained"
        | "displayedMetricNoDataRecovered";
    readonly level: LogLevel;
    readonly actionId: string;
    readonly metricKey: string;
    readonly preferredSourceId: string | undefined;
    readonly selectedSourceId: string | undefined;
    readonly preferredSourceState: string | undefined;
    readonly preferredSourceReason: string | undefined;
    readonly unavailableReason: string | undefined;
    readonly lastValueAgeMilliseconds: number | undefined;
    readonly pollingIntervalMilliseconds: number;
    readonly sustainedMilliseconds: number;
}

/**
 * Emits low-frequency diagnostics for the primary metric rendered by an action.
 *
 * It intentionally tracks one active detector key per action because the
 * runtime cache also exposes one displayed metric read trace per action.
 */
export class DefaultDisplayedMetricNoDataObserver implements DisplayedMetricNoDataObserver {
    private readonly detector: StatusEdgeDetector;
    private readonly logWriter: DisplayedMetricNoDataLogWriter;
    private readonly activeDetectorKeyByActionId = new Map<string, string>();

    constructor(options: DisplayedMetricNoDataObserverOptions = {}) {
        this.detector = options.detector ?? new StatusEdgeDetector();
        this.logWriter = options.logWriter ?? new LoggerDisplayedMetricNoDataLogWriter(log);
    }

    observe(observation: DisplayedMetricNoDataObservation): void {
        const sustainedAfterMilliseconds = resolveSustainedNoDataMilliseconds(
            observation.pollingIntervalMilliseconds,
        );
        const detectorKey = buildActionDetectorKey(observation);
        const previousDetectorKey = this.activeDetectorKeyByActionId.get(observation.actionId);
        if (previousDetectorKey !== undefined && previousDetectorKey !== detectorKey) {
            this.detector.delete(previousDetectorKey);
        }
        this.activeDetectorKeyByActionId.set(observation.actionId, detectorKey);

        const state = resolveDisplayedMetricNoDataState(observation, sustainedAfterMilliseconds);

        if (state === "pendingFirstRead") {
            // Keep the active key mapping fresh while avoiding false warnings
            // before the initial immediate collector refresh has had a chance.
            return;
        }

        const sustainedLogIntervalMilliseconds = resolveProductionLogThrottleMilliseconds(
            Math.max(sustainedAfterMilliseconds, STATUS_EDGE_PRODUCTION_LOG_INTERVAL_MILLISECONDS),
        );

        this.detector.observe({
            key: detectorKey,
            state: state === "ok" ? "ok" : "noData",
            nowMilliseconds: observation.nowMilliseconds,
            sustainedAfterMilliseconds,
            sustainedLogIntervalMilliseconds,
            logEnter: event => this.writeLog("displayedMetricNoDataEntered", observation, event),
            logSustained: event => this.writeLog("displayedMetricNoDataSustained", observation, event),
            logRecover: event => this.writeLog("displayedMetricNoDataRecovered", observation, event),
        });
    }

    clearAction(actionId: string): void {
        // A single action can change its displayed metric over time; prefix
        // cleanup is cheaper and safer than relying on the last known key only.
        this.detector.deleteByPrefix(buildActionDetectorKeyPrefix(actionId));
        this.activeDetectorKeyByActionId.delete(actionId);
    }

    private writeLog(
        eventName: DisplayedMetricNoDataLogEntry["event"],
        observation: DisplayedMetricNoDataObservation,
        event: StatusEdgeDetectorEvent,
    ): void {
        this.logWriter.write({
            event: eventName,
            level: resolveDisplayedMetricNoDataLogLevel(eventName, observation),
            actionId: observation.actionId,
            metricKey: observation.metricKey,
            preferredSourceId: observation.preferredSourceId,
            selectedSourceId: observation.selectedSourceId,
            preferredSourceState: observation.preferredSourceStatus?.state,
            preferredSourceReason: observation.preferredSourceStatus?.reason,
            unavailableReason: observation.outcome?.kind === "unavailable"
                ? observation.outcome.reason
                : observation.outcome === undefined
                    ? "noFreshSource"
                    : undefined,
            lastValueAgeMilliseconds: resolveLastValueAgeMilliseconds(observation),
            pollingIntervalMilliseconds: observation.pollingIntervalMilliseconds,
            // This is wall-clock state duration. If the action entered no-data
            // before sleep and recovers after wake, sustainedMs can include the
            // time the system was suspended.
            sustainedMilliseconds: event.sustainedMilliseconds,
        });
    }
}

function resolveDisplayedMetricNoDataState(
    observation: DisplayedMetricNoDataObservation,
    sustainedAfterMilliseconds: number,
): "ok" | "noData" | "pendingFirstRead" {
    if (observation.outcome?.kind === "value") {
        return "ok";
    }

    if (observation.outcome?.kind === "unavailable") {
        // Unavailable is an explicit source/read result, not a startup gap.
        return "noData";
    }

    return observation.nowMilliseconds - observation.actionAppearedAtTimestampMilliseconds >= sustainedAfterMilliseconds
        ? "noData"
        : "pendingFirstRead";
}

function resolveDisplayedMetricNoDataLogLevel(
    eventName: DisplayedMetricNoDataLogEntry["event"],
    observation: DisplayedMetricNoDataObservation,
): LogLevel {
    if (eventName === "displayedMetricNoDataRecovered") {
        return "info";
    }

    if (observation.outcome === undefined) {
        return eventName === "displayedMetricNoDataSustained" ? "warn" : "info";
    }

    if (observation.outcome.kind === "unavailable") {
        if (
            observation.outcome.reason === "invalidValue"
            || observation.outcome.reason === "expired"
            || observation.outcome.reason === "unknown"
            || observation.preferredSourceStatus?.state === "unavailable"
        ) {
            return "warn";
        }

        return "info";
    }

    return "info";
}

function resolveSustainedNoDataMilliseconds(pollingIntervalMilliseconds: number): number {
    return resolveSustainedStatusEdgeMilliseconds(pollingIntervalMilliseconds);
}

function resolveLastValueAgeMilliseconds(
    observation: DisplayedMetricNoDataObservation,
): number | undefined {
    if (observation.outcome?.kind !== "unavailable") {
        return undefined;
    }

    const lastValueTimestampMilliseconds = observation.outcome.lastValueTimestampMilliseconds;
    return lastValueTimestampMilliseconds === undefined
        ? undefined
        : observation.nowMilliseconds - lastValueTimestampMilliseconds;
}

function buildActionDetectorKey(observation: DisplayedMetricNoDataObservation): string {
    return [
        buildActionDetectorKeyPrefix(observation.actionId),
        observation.metricKey,
        observation.preferredSourceId ?? "",
    ].join(":");
}

function buildActionDetectorKeyPrefix(actionId: string): string {
    return `action:${actionId}:`;
}

class LoggerDisplayedMetricNoDataLogWriter implements DisplayedMetricNoDataLogWriter {
    constructor(private readonly scopedLogger: ScopedLogger) {}

    write(entry: DisplayedMetricNoDataLogEntry): void {
        const message = () => [
            entry.event,
            `actionId=${entry.actionId}`,
            `metricKey=${entry.metricKey}`,
            `preferredSourceId=${entry.preferredSourceId ?? ""}`,
            `selectedSourceId=${entry.selectedSourceId ?? ""}`,
            `preferredSourceState=${entry.preferredSourceState ?? ""}`,
            `preferredSourceReason=${entry.preferredSourceReason ?? ""}`,
            `unavailableReason=${entry.unavailableReason ?? ""}`,
            `lastValueAgeMs=${entry.lastValueAgeMilliseconds ?? ""}`,
            `pollingIntervalMs=${entry.pollingIntervalMilliseconds}`,
            `sustainedMs=${entry.sustainedMilliseconds}`,
        ].join(" ");

        if (entry.level === "warn") {
            this.scopedLogger.atWarn()
                .everyMs(
                    buildDisplayedMetricNoDataThrottleKey(entry),
                    resolveDisplayedMetricNoDataLogIntervalMilliseconds(entry),
                )
                .log(message);
            return;
        }

        this.scopedLogger.atInfo()
            .everyMs(
                buildDisplayedMetricNoDataThrottleKey(entry),
                resolveDisplayedMetricNoDataLogIntervalMilliseconds(entry),
            )
            .log(message);
    }
}

function resolveDisplayedMetricNoDataLogIntervalMilliseconds(entry: DisplayedMetricNoDataLogEntry): number {
    return entry.event === "displayedMetricNoDataSustained" && entry.level === "warn"
        ? SUSTAINED_NO_DATA_WARNING_LOG_INTERVAL_MILLISECONDS
        : resolveProductionLogThrottleMilliseconds(STATUS_EDGE_PRODUCTION_LOG_INTERVAL_MILLISECONDS);
}

/** Preserves per-key enter/recover trace details while collapsing sustained source outages. */
export function buildDisplayedMetricNoDataThrottleKey(entry: DisplayedMetricNoDataLogEntry): string {
    if (entry.event !== "displayedMetricNoDataSustained") {
        return `displayed-metric-no-data:${entry.event}:${entry.actionId}:${entry.metricKey}`;
    }

    // Sustained no-data can fan out across every visible key when one source is
    // down. The collector-level log carries the source/group root cause; this
    // source-scoped key keeps per-action sustained logs from repeating it 64x.
    return [
        "displayed-metric-no-data",
        entry.event,
        entry.preferredSourceId ?? "",
        entry.unavailableReason ?? "",
        entry.pollingIntervalMilliseconds,
    ].join(":");
}
