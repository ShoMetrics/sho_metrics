import type { WillAppearEvent } from "@elgato/streamdeck";
import { logger } from "../logging/logger";
import { resolveProductionLogThrottleMilliseconds } from "../logging/log-throttle";
import {
    MetricViewPerformanceStats,
    formatMetricViewPerformanceSummary,
    shouldWarnMetricViewPerformanceSummary,
    type MetricViewPerformanceActionKind,
    type MetricViewPerformanceOutcome,
    type MetricViewPerformanceRenderContext,
} from "./performance-stats";
import type { MetricViewUpdatePriority } from "./update-queue";

const log = logger.for("MetricViewUpdateRunner");
const metricViewPerformanceStats = new MetricViewPerformanceStats();
const METRIC_VIEW_PERFORMANCE_WARNING_LOG_THROTTLE_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60000);

function resolveMetricViewPerformanceActionKind(event: WillAppearEvent): MetricViewPerformanceActionKind {
    if (event.action.isKey()) {
        return "key";
    }

    if (event.action.isDial()) {
        return "dial";
    }

    return "unknown";
}

export function recordMetricViewPerformanceSample(options: {
    event: WillAppearEvent;
    updateReason: MetricViewUpdatePriority;
    outcome: MetricViewPerformanceOutcome;
    renderContext: MetricViewPerformanceRenderContext;
    titleClearRequested: boolean;
    updateTimestampMilliseconds: number | null;
    renderStartTimestampMilliseconds: number;
    composeEndTimestampMilliseconds: number;
    rasterizeEndTimestampMilliseconds: number | null;
    updateStartTimestampMilliseconds: number | null;
    updateEndTimestampMilliseconds: number;
    queueLength: number;
    activeActionCount: number;
}): void {
    const summary = metricViewPerformanceStats.record({
        requestReason: options.updateReason,
        actionKind: resolveMetricViewPerformanceActionKind(options.event),
        outcome: options.outcome,
        renderContext: options.renderContext,
        queuedMilliseconds: calculateElapsedMilliseconds(
            options.updateTimestampMilliseconds,
            options.renderStartTimestampMilliseconds,
        ),
        composeMilliseconds: options.composeEndTimestampMilliseconds - options.renderStartTimestampMilliseconds,
        rasterizeMilliseconds: calculateStepMilliseconds(
            options.composeEndTimestampMilliseconds,
            options.rasterizeEndTimestampMilliseconds,
        ),
        sdkPromiseMilliseconds: calculateStepMilliseconds(
            options.updateStartTimestampMilliseconds,
            options.updateEndTimestampMilliseconds,
        ),
        totalMilliseconds: calculateElapsedMilliseconds(
            options.updateTimestampMilliseconds,
            options.updateEndTimestampMilliseconds,
        ) ?? Math.max(0, options.updateEndTimestampMilliseconds - options.renderStartTimestampMilliseconds),
        queueLength: options.queueLength,
        activeActionCount: options.activeActionCount,
        titleClearRequested: options.titleClearRequested,
    }, options.updateEndTimestampMilliseconds);

    if (!summary) {
        return;
    }

    if (shouldWarnMetricViewPerformanceSummary(summary)) {
        log.atWarn()
            .everyMs("metric-view-performance-warning", METRIC_VIEW_PERFORMANCE_WARNING_LOG_THROTTLE_MILLISECONDS)
            .log(() => formatMetricViewPerformanceSummary(summary));
        return;
    }

    log.debug(() => formatMetricViewPerformanceSummary(summary));
}

function calculateElapsedMilliseconds(
    startTimestampMilliseconds: number | null,
    endTimestampMilliseconds: number,
): number | null {
    if (startTimestampMilliseconds == null) {
        return null;
    }

    return Math.max(0, endTimestampMilliseconds - startTimestampMilliseconds);
}

function calculateStepMilliseconds(
    startTimestampMilliseconds: number | null,
    endTimestampMilliseconds: number | null,
): number | null {
    if (startTimestampMilliseconds == null || endTimestampMilliseconds == null) {
        return null;
    }

    return Math.max(0, endTimestampMilliseconds - startTimestampMilliseconds);
}
