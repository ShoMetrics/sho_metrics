type MetricViewPerformanceReason = "settings-change" | "metric-tick";
export type MetricViewPerformanceActionKind = "key" | "dial" | "unknown";
export type MetricViewPerformanceOutcome = "rendered" | "skipped" | "failed";

export interface MetricViewPerformanceSample {
    requestReason: MetricViewPerformanceReason;
    actionKind: MetricViewPerformanceActionKind;
    outcome: MetricViewPerformanceOutcome;
    queuedMilliseconds: number | null;
    composeMilliseconds: number;
    rasterizeMilliseconds: number | null;
    sdkPromiseMilliseconds: number | null;
    totalMilliseconds: number;
    queueLength: number;
    activeActionCount: number;
    titleClearRequested: boolean;
}

export interface DurationSummary {
    count: number;
    averageMilliseconds: number | null;
    maximumMilliseconds: number | null;
}

export interface MetricViewPerformanceSummary {
    windowMilliseconds: number;
    requestCount: number;
    renderedCount: number;
    skippedCount: number;
    failedCount: number;
    settingsChangeCount: number;
    metricTickCount: number;
    keyCount: number;
    dialCount: number;
    titleClearRequestCount: number;
    maximumQueueLength: number;
    maximumActiveActionCount: number;
    queuedDuration: DurationSummary;
    composeDuration: DurationSummary;
    rasterizeDuration: DurationSummary;
    sdkPromiseDuration: DurationSummary;
    totalDuration: DurationSummary;
}

const METRIC_VIEW_PERFORMANCE_WARNING_MAXIMUM_QUEUED_MILLISECONDS = 500;
const METRIC_VIEW_PERFORMANCE_WARNING_AVERAGE_QUEUED_MILLISECONDS = 250;
const METRIC_VIEW_PERFORMANCE_WARNING_MAXIMUM_TOTAL_MILLISECONDS = 1000;

interface DurationAccumulator {
    count: number;
    totalMilliseconds: number;
    maximumMilliseconds: number;
}

interface MetricViewPerformanceWindow {
    startTimestampMilliseconds: number;
    requestCount: number;
    renderedCount: number;
    skippedCount: number;
    failedCount: number;
    settingsChangeCount: number;
    metricTickCount: number;
    keyCount: number;
    dialCount: number;
    titleClearRequestCount: number;
    maximumQueueLength: number;
    maximumActiveActionCount: number;
    queuedDuration: DurationAccumulator;
    composeDuration: DurationAccumulator;
    rasterizeDuration: DurationAccumulator;
    sdkPromiseDuration: DurationAccumulator;
    totalDuration: DurationAccumulator;
}

/**
 * Aggregates high-frequency metric view render timings into low-frequency summaries.
 *
 * The metric view path can execute dozens of times per second on large Stream Deck
 * profiles. Aggregating keeps production diagnostics useful without turning the
 * log itself into a performance bottleneck.
 */
export class MetricViewPerformanceStats {
    private performanceWindow: MetricViewPerformanceWindow | null = null;

    constructor(private readonly summaryIntervalMilliseconds = 5000) {}

    record(
        sample: MetricViewPerformanceSample,
        timestampMilliseconds = Date.now(),
    ): MetricViewPerformanceSummary | null {
        const performanceWindow = this.performanceWindow
            ?? createMetricViewPerformanceWindow(timestampMilliseconds);

        this.performanceWindow = performanceWindow;
        addMetricViewPerformanceSample(performanceWindow, sample);

        if (timestampMilliseconds - performanceWindow.startTimestampMilliseconds < this.summaryIntervalMilliseconds) {
            return null;
        }

        const summary = buildMetricViewPerformanceSummary(performanceWindow, timestampMilliseconds);
        this.performanceWindow = null;
        return summary;
    }
}

export function formatMetricViewPerformanceSummary(summary: MetricViewPerformanceSummary): string {
    return [
        "metricViewPerfSummary",
        `windowMs=${summary.windowMilliseconds}`,
        `requests=${summary.requestCount}`,
        `rendered=${summary.renderedCount}`,
        `skipped=${summary.skippedCount}`,
        `failed=${summary.failedCount}`,
        `settings=${summary.settingsChangeCount}`,
        `metricTicks=${summary.metricTickCount}`,
        `keys=${summary.keyCount}`,
        `dials=${summary.dialCount}`,
        `titleClearRequests=${summary.titleClearRequestCount}`,
        `maxQueueLength=${summary.maximumQueueLength}`,
        `maxActiveActions=${summary.maximumActiveActionCount}`,
        `avgQueuedMs=${formatAverageDuration(summary.queuedDuration)}`,
        `maxQueuedMs=${formatMaximumDuration(summary.queuedDuration)}`,
        `avgComposeMs=${formatAverageDuration(summary.composeDuration)}`,
        `maxComposeMs=${formatMaximumDuration(summary.composeDuration)}`,
        `avgRasterizeMs=${formatAverageDuration(summary.rasterizeDuration)}`,
        `maxRasterizeMs=${formatMaximumDuration(summary.rasterizeDuration)}`,
        `avgSdkPromiseMs=${formatAverageDuration(summary.sdkPromiseDuration)}`,
        `maxSdkPromiseMs=${formatMaximumDuration(summary.sdkPromiseDuration)}`,
        `avgTotalMs=${formatAverageDuration(summary.totalDuration)}`,
        `maxTotalMs=${formatMaximumDuration(summary.totalDuration)}`,
    ].join(" ");
}

export function shouldWarnMetricViewPerformanceSummary(summary: MetricViewPerformanceSummary): boolean {
    return summary.failedCount > 0
        || exceedsDuration(
            summary.queuedDuration.maximumMilliseconds,
            METRIC_VIEW_PERFORMANCE_WARNING_MAXIMUM_QUEUED_MILLISECONDS,
        )
        || exceedsDuration(
            summary.queuedDuration.averageMilliseconds,
            METRIC_VIEW_PERFORMANCE_WARNING_AVERAGE_QUEUED_MILLISECONDS,
        )
        || exceedsDuration(summary.totalDuration.maximumMilliseconds, METRIC_VIEW_PERFORMANCE_WARNING_MAXIMUM_TOTAL_MILLISECONDS);
}

function createMetricViewPerformanceWindow(startTimestampMilliseconds: number): MetricViewPerformanceWindow {
    return {
        startTimestampMilliseconds,
        requestCount: 0,
        renderedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        settingsChangeCount: 0,
        metricTickCount: 0,
        keyCount: 0,
        dialCount: 0,
        titleClearRequestCount: 0,
        maximumQueueLength: 0,
        maximumActiveActionCount: 0,
        queuedDuration: createDurationAccumulator(),
        composeDuration: createDurationAccumulator(),
        rasterizeDuration: createDurationAccumulator(),
        sdkPromiseDuration: createDurationAccumulator(),
        totalDuration: createDurationAccumulator(),
    };
}

function addMetricViewPerformanceSample(
    performanceWindow: MetricViewPerformanceWindow,
    sample: MetricViewPerformanceSample,
): void {
    performanceWindow.requestCount += 1;
    performanceWindow.renderedCount += sample.outcome === "rendered" ? 1 : 0;
    performanceWindow.skippedCount += sample.outcome === "skipped" ? 1 : 0;
    performanceWindow.failedCount += sample.outcome === "failed" ? 1 : 0;
    performanceWindow.settingsChangeCount += sample.requestReason === "settings-change" ? 1 : 0;
    performanceWindow.metricTickCount += sample.requestReason === "metric-tick" ? 1 : 0;
    performanceWindow.keyCount += sample.actionKind === "key" ? 1 : 0;
    performanceWindow.dialCount += sample.actionKind === "dial" ? 1 : 0;
    performanceWindow.titleClearRequestCount += sample.titleClearRequested ? 1 : 0;
    performanceWindow.maximumQueueLength = Math.max(performanceWindow.maximumQueueLength, sample.queueLength);
    performanceWindow.maximumActiveActionCount = Math.max(
        performanceWindow.maximumActiveActionCount,
        sample.activeActionCount,
    );

    addDuration(performanceWindow.queuedDuration, sample.queuedMilliseconds);
    addDuration(performanceWindow.composeDuration, sample.composeMilliseconds);
    addDuration(performanceWindow.rasterizeDuration, sample.rasterizeMilliseconds);
    addDuration(performanceWindow.sdkPromiseDuration, sample.sdkPromiseMilliseconds);
    addDuration(performanceWindow.totalDuration, sample.totalMilliseconds);
}

function buildMetricViewPerformanceSummary(
    performanceWindow: MetricViewPerformanceWindow,
    endTimestampMilliseconds: number,
): MetricViewPerformanceSummary {
    return {
        windowMilliseconds: Math.max(0, endTimestampMilliseconds - performanceWindow.startTimestampMilliseconds),
        requestCount: performanceWindow.requestCount,
        renderedCount: performanceWindow.renderedCount,
        skippedCount: performanceWindow.skippedCount,
        failedCount: performanceWindow.failedCount,
        settingsChangeCount: performanceWindow.settingsChangeCount,
        metricTickCount: performanceWindow.metricTickCount,
        keyCount: performanceWindow.keyCount,
        dialCount: performanceWindow.dialCount,
        titleClearRequestCount: performanceWindow.titleClearRequestCount,
        maximumQueueLength: performanceWindow.maximumQueueLength,
        maximumActiveActionCount: performanceWindow.maximumActiveActionCount,
        queuedDuration: summarizeDuration(performanceWindow.queuedDuration),
        composeDuration: summarizeDuration(performanceWindow.composeDuration),
        rasterizeDuration: summarizeDuration(performanceWindow.rasterizeDuration),
        sdkPromiseDuration: summarizeDuration(performanceWindow.sdkPromiseDuration),
        totalDuration: summarizeDuration(performanceWindow.totalDuration),
    };
}

function createDurationAccumulator(): DurationAccumulator {
    return {
        count: 0,
        totalMilliseconds: 0,
        maximumMilliseconds: 0,
    };
}

function addDuration(durationAccumulator: DurationAccumulator, durationMilliseconds: number | null): void {
    if (durationMilliseconds == null) {
        return;
    }

    durationAccumulator.count += 1;
    durationAccumulator.totalMilliseconds += durationMilliseconds;
    durationAccumulator.maximumMilliseconds = Math.max(
        durationAccumulator.maximumMilliseconds,
        durationMilliseconds,
    );
}

function summarizeDuration(durationAccumulator: DurationAccumulator): DurationSummary {
    if (durationAccumulator.count === 0) {
        return {
            count: 0,
            averageMilliseconds: null,
            maximumMilliseconds: null,
        };
    }

    return {
        count: durationAccumulator.count,
        averageMilliseconds: durationAccumulator.totalMilliseconds / durationAccumulator.count,
        maximumMilliseconds: durationAccumulator.maximumMilliseconds,
    };
}

function formatAverageDuration(summary: DurationSummary): string {
    if (summary.averageMilliseconds == null) {
        return "unknown";
    }

    return summary.averageMilliseconds.toFixed(1);
}

function formatMaximumDuration(summary: DurationSummary): string {
    if (summary.maximumMilliseconds == null) {
        return "unknown";
    }

    return summary.maximumMilliseconds.toFixed(0);
}

function exceedsDuration(durationMilliseconds: number | null, thresholdMilliseconds: number): boolean {
    return durationMilliseconds != null && durationMilliseconds >= thresholdMilliseconds;
}
