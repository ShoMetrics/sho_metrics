import type { WillAppearEvent } from "@elgato/streamdeck";
import { logger } from "../logging/logger";
import {
    DisplayPerformanceStats,
    formatDisplayPerformanceSummary,
    shouldWarnDisplayPerformanceSummary,
    type DisplayPerformanceKind,
    type DisplayPerformanceOutcome,
} from "./performance-stats";
import type { DisplayUpdatePriority } from "./update-queue";

const log = logger.for("MetricDisplayRunner");
const displayPerformanceStats = new DisplayPerformanceStats();

function resolveDisplayPerformanceKind(event: WillAppearEvent): DisplayPerformanceKind {
    if (event.action.isKey()) {
        return "key";
    }

    if (event.action.isDial()) {
        return "dial";
    }

    return "unknown";
}

export function recordDisplayPerformanceSample(options: {
    event: WillAppearEvent;
    updateReason: DisplayUpdatePriority;
    outcome: DisplayPerformanceOutcome;
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
    const summary = displayPerformanceStats.record({
        requestReason: options.updateReason,
        displayKind: resolveDisplayPerformanceKind(options.event),
        outcome: options.outcome,
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

    if (shouldWarnDisplayPerformanceSummary(summary)) {
        log.atWarn()
            .everyMs("display-performance-warning", 60000)
            .log(() => formatDisplayPerformanceSummary(summary));
        return;
    }

    log.debug(() => formatDisplayPerformanceSummary(summary));
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
