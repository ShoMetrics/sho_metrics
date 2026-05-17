import {
    addDurationSample,
    createDurationAccumulator,
    summarizeDuration,
    type DurationAccumulator,
    type DurationSummary,
} from "../shared/duration-accumulator";

export interface RasterizerPerformanceSample {
    success: boolean;
    renderWidth: number;
    renderHeight: number;
    svgByteLength: number;
    fontFileCount: number;
    pngByteLength: number | null;
    constructMilliseconds: number;
    renderMilliseconds: number;
    asPngMilliseconds: number;
    base64Milliseconds: number;
    totalMilliseconds: number;
}

export type RasterizerDurationSummary = DurationSummary;

export interface RasterizerPerformanceSummary {
    windowMilliseconds: number;
    sampleCount: number;
    successCount: number;
    failureCount: number;
    maximumSvgByteLength: number;
    maximumPngByteLength: number;
    maximumFontFileCount: number;
    maximumRenderWidth: number;
    maximumRenderHeight: number;
    constructDuration: RasterizerDurationSummary;
    renderDuration: RasterizerDurationSummary;
    asPngDuration: RasterizerDurationSummary;
    base64Duration: RasterizerDurationSummary;
    totalDuration: RasterizerDurationSummary;
}

const RASTERIZER_WARNING_TOTAL_MILLISECONDS = 100;
const RASTERIZER_WARNING_AVERAGE_TOTAL_MILLISECONDS = 40;

interface RasterizerPerformanceWindow {
    startTimestampMilliseconds: number;
    sampleCount: number;
    successCount: number;
    failureCount: number;
    maximumSvgByteLength: number;
    maximumPngByteLength: number;
    maximumFontFileCount: number;
    maximumRenderWidth: number;
    maximumRenderHeight: number;
    constructDuration: DurationAccumulator;
    renderDuration: DurationAccumulator;
    asPngDuration: DurationAccumulator;
    base64Duration: DurationAccumulator;
    totalDuration: DurationAccumulator;
}

/**
 * Aggregates rasterizer timings into periodic summaries.
 *
 * Rasterization is synchronous and can dominate the metric view update path, so the
 * breakdown separates resvg setup, SVG rendering, PNG encoding, and base64 work.
 */
export class RasterizerPerformanceStats {
    private performanceWindow: RasterizerPerformanceWindow | null = null;

    constructor(private readonly summaryIntervalMilliseconds = 5000) {}

    record(
        sample: RasterizerPerformanceSample,
        timestampMilliseconds = Date.now(),
    ): RasterizerPerformanceSummary | null {
        const performanceWindow = this.performanceWindow
            ?? createRasterizerPerformanceWindow(timestampMilliseconds);

        this.performanceWindow = performanceWindow;
        addRasterizerPerformanceSample(performanceWindow, sample);

        if (timestampMilliseconds - performanceWindow.startTimestampMilliseconds < this.summaryIntervalMilliseconds) {
            return null;
        }

        const summary = buildRasterizerPerformanceSummary(performanceWindow, timestampMilliseconds);
        this.performanceWindow = null;
        return summary;
    }
}

export function formatRasterizerPerformanceSummary(summary: RasterizerPerformanceSummary): string {
    return [
        "rasterizerPerfSummary",
        `windowMs=${summary.windowMilliseconds}`,
        `samples=${summary.sampleCount}`,
        `successes=${summary.successCount}`,
        `failures=${summary.failureCount}`,
        `maxSvgBytes=${summary.maximumSvgByteLength}`,
        `maxPngBytes=${summary.maximumPngByteLength}`,
        `maxFontFiles=${summary.maximumFontFileCount}`,
        `maxRenderSize=${summary.maximumRenderWidth}x${summary.maximumRenderHeight}`,
        `avgConstructMs=${formatAverageDuration(summary.constructDuration)}`,
        `maxConstructMs=${formatMaximumDuration(summary.constructDuration)}`,
        `avgRenderMs=${formatAverageDuration(summary.renderDuration)}`,
        `maxRenderMs=${formatMaximumDuration(summary.renderDuration)}`,
        `avgAsPngMs=${formatAverageDuration(summary.asPngDuration)}`,
        `maxAsPngMs=${formatMaximumDuration(summary.asPngDuration)}`,
        `avgBase64Ms=${formatAverageDuration(summary.base64Duration)}`,
        `maxBase64Ms=${formatMaximumDuration(summary.base64Duration)}`,
        `avgTotalMs=${formatAverageDuration(summary.totalDuration)}`,
        `maxTotalMs=${formatMaximumDuration(summary.totalDuration)}`,
    ].join(" ");
}

export function shouldWarnRasterizerPerformanceSummary(summary: RasterizerPerformanceSummary): boolean {
    return summary.failureCount > 0
        || exceedsDuration(summary.totalDuration.maximumMilliseconds, RASTERIZER_WARNING_TOTAL_MILLISECONDS)
        || exceedsDuration(summary.totalDuration.averageMilliseconds, RASTERIZER_WARNING_AVERAGE_TOTAL_MILLISECONDS);
}

function createRasterizerPerformanceWindow(startTimestampMilliseconds: number): RasterizerPerformanceWindow {
    return {
        startTimestampMilliseconds,
        sampleCount: 0,
        successCount: 0,
        failureCount: 0,
        maximumSvgByteLength: 0,
        maximumPngByteLength: 0,
        maximumFontFileCount: 0,
        maximumRenderWidth: 0,
        maximumRenderHeight: 0,
        constructDuration: createDurationAccumulator(),
        renderDuration: createDurationAccumulator(),
        asPngDuration: createDurationAccumulator(),
        base64Duration: createDurationAccumulator(),
        totalDuration: createDurationAccumulator(),
    };
}

function addRasterizerPerformanceSample(
    performanceWindow: RasterizerPerformanceWindow,
    sample: RasterizerPerformanceSample,
): void {
    performanceWindow.sampleCount += 1;
    performanceWindow.successCount += sample.success ? 1 : 0;
    performanceWindow.failureCount += sample.success ? 0 : 1;
    performanceWindow.maximumSvgByteLength = Math.max(performanceWindow.maximumSvgByteLength, sample.svgByteLength);
    performanceWindow.maximumPngByteLength = Math.max(
        performanceWindow.maximumPngByteLength,
        sample.pngByteLength ?? 0,
    );
    performanceWindow.maximumFontFileCount = Math.max(performanceWindow.maximumFontFileCount, sample.fontFileCount);
    performanceWindow.maximumRenderWidth = Math.max(performanceWindow.maximumRenderWidth, sample.renderWidth);
    performanceWindow.maximumRenderHeight = Math.max(performanceWindow.maximumRenderHeight, sample.renderHeight);

    addDurationSample(performanceWindow.constructDuration, sample.constructMilliseconds);
    addDurationSample(performanceWindow.renderDuration, sample.renderMilliseconds);
    addDurationSample(performanceWindow.asPngDuration, sample.asPngMilliseconds);
    addDurationSample(performanceWindow.base64Duration, sample.base64Milliseconds);
    addDurationSample(performanceWindow.totalDuration, sample.totalMilliseconds);
}

function buildRasterizerPerformanceSummary(
    performanceWindow: RasterizerPerformanceWindow,
    endTimestampMilliseconds: number,
): RasterizerPerformanceSummary {
    return {
        windowMilliseconds: Math.max(0, endTimestampMilliseconds - performanceWindow.startTimestampMilliseconds),
        sampleCount: performanceWindow.sampleCount,
        successCount: performanceWindow.successCount,
        failureCount: performanceWindow.failureCount,
        maximumSvgByteLength: performanceWindow.maximumSvgByteLength,
        maximumPngByteLength: performanceWindow.maximumPngByteLength,
        maximumFontFileCount: performanceWindow.maximumFontFileCount,
        maximumRenderWidth: performanceWindow.maximumRenderWidth,
        maximumRenderHeight: performanceWindow.maximumRenderHeight,
        constructDuration: summarizeDuration(performanceWindow.constructDuration),
        renderDuration: summarizeDuration(performanceWindow.renderDuration),
        asPngDuration: summarizeDuration(performanceWindow.asPngDuration),
        base64Duration: summarizeDuration(performanceWindow.base64Duration),
        totalDuration: summarizeDuration(performanceWindow.totalDuration),
    };
}

function formatAverageDuration(summary: RasterizerDurationSummary): string {
    if (summary.averageMilliseconds == null) {
        return "unknown";
    }

    return summary.averageMilliseconds.toFixed(1);
}

function formatMaximumDuration(summary: RasterizerDurationSummary): string {
    if (summary.maximumMilliseconds == null) {
        return "unknown";
    }

    return summary.maximumMilliseconds.toFixed(0);
}

function exceedsDuration(durationMilliseconds: number | null, thresholdMilliseconds: number): boolean {
    return durationMilliseconds != null && durationMilliseconds >= thresholdMilliseconds;
}
