type DisplayPerformanceReason = "settings-change" | "metric-tick";
export type DisplayPerformanceKind = "key" | "dial" | "unknown";
export type DisplayPerformanceOutcome = "rendered" | "skipped" | "failed";

export interface DisplayPerformanceSample {
    requestReason: DisplayPerformanceReason;
    displayKind: DisplayPerformanceKind;
    outcome: DisplayPerformanceOutcome;
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

export interface DisplayPerformanceSummary {
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

const DISPLAY_WARNING_MAXIMUM_QUEUED_MILLISECONDS = 500;
const DISPLAY_WARNING_AVERAGE_QUEUED_MILLISECONDS = 250;
const DISPLAY_WARNING_MAXIMUM_TOTAL_MILLISECONDS = 1000;

interface DurationAccumulator {
    count: number;
    totalMilliseconds: number;
    maximumMilliseconds: number;
}

interface DisplayPerformanceWindow {
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
 * Aggregates high-frequency display render timings into low-frequency summaries.
 *
 * The display path can execute dozens of times per second on large Stream Deck
 * profiles. Aggregating keeps production diagnostics useful without turning the
 * log itself into a performance bottleneck.
 */
export class DisplayPerformanceStats {
    private performanceWindow: DisplayPerformanceWindow | null = null;

    public constructor(private readonly summaryIntervalMilliseconds = 5000) {}

    public record(
        sample: DisplayPerformanceSample,
        timestampMilliseconds = Date.now(),
    ): DisplayPerformanceSummary | null {
        const performanceWindow = this.performanceWindow
            ?? createDisplayPerformanceWindow(timestampMilliseconds);

        this.performanceWindow = performanceWindow;
        addDisplayPerformanceSample(performanceWindow, sample);

        if (timestampMilliseconds - performanceWindow.startTimestampMilliseconds < this.summaryIntervalMilliseconds) {
            return null;
        }

        const summary = buildDisplayPerformanceSummary(performanceWindow, timestampMilliseconds);
        this.performanceWindow = null;
        return summary;
    }
}

export function formatDisplayPerformanceSummary(summary: DisplayPerformanceSummary): string {
    return [
        "displayPerfSummary",
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

export function shouldWarnDisplayPerformanceSummary(summary: DisplayPerformanceSummary): boolean {
    return summary.failedCount > 0
        || exceedsDuration(summary.queuedDuration.maximumMilliseconds, DISPLAY_WARNING_MAXIMUM_QUEUED_MILLISECONDS)
        || exceedsDuration(summary.queuedDuration.averageMilliseconds, DISPLAY_WARNING_AVERAGE_QUEUED_MILLISECONDS)
        || exceedsDuration(summary.totalDuration.maximumMilliseconds, DISPLAY_WARNING_MAXIMUM_TOTAL_MILLISECONDS);
}

function createDisplayPerformanceWindow(startTimestampMilliseconds: number): DisplayPerformanceWindow {
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

function addDisplayPerformanceSample(
    performanceWindow: DisplayPerformanceWindow,
    sample: DisplayPerformanceSample,
): void {
    performanceWindow.requestCount += 1;
    performanceWindow.renderedCount += sample.outcome === "rendered" ? 1 : 0;
    performanceWindow.skippedCount += sample.outcome === "skipped" ? 1 : 0;
    performanceWindow.failedCount += sample.outcome === "failed" ? 1 : 0;
    performanceWindow.settingsChangeCount += sample.requestReason === "settings-change" ? 1 : 0;
    performanceWindow.metricTickCount += sample.requestReason === "metric-tick" ? 1 : 0;
    performanceWindow.keyCount += sample.displayKind === "key" ? 1 : 0;
    performanceWindow.dialCount += sample.displayKind === "dial" ? 1 : 0;
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

function buildDisplayPerformanceSummary(
    performanceWindow: DisplayPerformanceWindow,
    endTimestampMilliseconds: number,
): DisplayPerformanceSummary {
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
