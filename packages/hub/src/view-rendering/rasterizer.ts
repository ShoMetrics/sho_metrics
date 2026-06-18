import { Resvg } from "@resvg/resvg-js";
import type { KeySize } from "./widget-data";
import { logger } from "../logging/logger";
import { resolveProductionLogThrottleMilliseconds } from "../logging/log-throttle";
import { wallClockNowMilliseconds } from "../shared/clock";
import {
    RasterizerPerformanceStats,
    formatRasterizerPerformanceSummary,
    shouldWarnRasterizerPerformanceSummary,
    type RasterizerPerformanceSample,
} from "./rasterizer-performance-stats";
import { resolveResvgFontOptions } from "./resvg-font-options";

const log = logger.for("Rasterizer");
const rasterizerPerformanceStats = new RasterizerPerformanceStats();
const REPEATED_RASTERIZER_FAILURE_LOG_THROTTLE_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60000);
const RASTERIZER_PERFORMANCE_WARNING_LOG_THROTTLE_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60000);

/**
 * Rasterize an SVG string to a Base64-encoded PNG data URL.
 * Uses @resvg/resvg-js (Rust N-API) for pixel-perfect, cross-platform rendering.
 */
export function rasterizeSvgToPngDataUrl(svgString: string, renderSize: KeySize): string {
    const rasterizeStartTimestampMilliseconds = wallClockNowMilliseconds();
    const svgByteLength = Buffer.byteLength(svgString, "utf8");
    let fontFileCount = 0;

    try {
        const fontOptions = resolveResvgFontOptions(svgString);
        fontFileCount = fontOptions.fontFiles?.length ?? 0;
        const resvgInstance = new Resvg(svgString, {
            fitTo: { mode: "width" as const, value: renderSize.width },
            font: fontOptions,
        });
        const constructEndTimestampMilliseconds = wallClockNowMilliseconds();
        const rendered = resvgInstance.render();
        const renderEndTimestampMilliseconds = wallClockNowMilliseconds();
        const pngBuffer = rendered.asPng();
        const asPngEndTimestampMilliseconds = wallClockNowMilliseconds();
        const base64 = Buffer.from(pngBuffer).toString("base64");
        const base64EndTimestampMilliseconds = wallClockNowMilliseconds();

        recordRasterizerPerformanceSample({
            success: true,
            renderWidth: renderSize.width,
            renderHeight: renderSize.height,
            svgByteLength,
            fontFileCount,
            pngByteLength: pngBuffer.length,
            constructMilliseconds: constructEndTimestampMilliseconds - rasterizeStartTimestampMilliseconds,
            renderMilliseconds: renderEndTimestampMilliseconds - constructEndTimestampMilliseconds,
            asPngMilliseconds: asPngEndTimestampMilliseconds - renderEndTimestampMilliseconds,
            base64Milliseconds: base64EndTimestampMilliseconds - asPngEndTimestampMilliseconds,
            totalMilliseconds: base64EndTimestampMilliseconds - rasterizeStartTimestampMilliseconds,
        });
        return `data:image/png;base64,${base64}`;
    } catch (error) {
        const failureTimestampMilliseconds = wallClockNowMilliseconds();
        recordRasterizerPerformanceSample({
            success: false,
            renderWidth: renderSize.width,
            renderHeight: renderSize.height,
            svgByteLength,
            fontFileCount,
            pngByteLength: null,
            constructMilliseconds: 0,
            renderMilliseconds: 0,
            asPngMilliseconds: 0,
            base64Milliseconds: 0,
            totalMilliseconds: failureTimestampMilliseconds - rasterizeStartTimestampMilliseconds,
        });
        log.atError()
            .everyMs("svg-render-failed", REPEATED_RASTERIZER_FAILURE_LOG_THROTTLE_MILLISECONDS)
            .log(() => [
                "SVG render failed",
                `renderWidth=${renderSize.width}`,
                `renderHeight=${renderSize.height}`,
                `svgByteLength=${svgByteLength}`,
                `fontFileCount=${fontFileCount}`,
                `error=${String(error)}`,
            ].join(" "));
        return "";
    }
}

function recordRasterizerPerformanceSample(sample: RasterizerPerformanceSample): void {
    const summary = rasterizerPerformanceStats.record(sample);

    if (summary) {
        if (shouldWarnRasterizerPerformanceSummary(summary)) {
            log.atWarn()
                .everyMs("rasterizer-performance-warning", RASTERIZER_PERFORMANCE_WARNING_LOG_THROTTLE_MILLISECONDS)
                .log(() => formatRasterizerPerformanceSummary(summary));
            return;
        }

        log.debug(() => formatRasterizerPerformanceSummary(summary));
    }
}
