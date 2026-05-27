import { Resvg } from "@resvg/resvg-js";
import type { KeySize } from "./widget-data";
import { logger } from "../logging/logger";
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

/**
 * Rasterize an SVG string to a Base64-encoded PNG data URL.
 * Uses @resvg/resvg-js (Rust N-API) for pixel-perfect, cross-platform rendering.
 */
export function rasterizeSvgToPngDataUrl(svgString: string, renderSize: KeySize): string {
    const rasterizeStartTimestampMilliseconds = wallClockNowMilliseconds();
    const svgByteLength = Buffer.byteLength(svgString, "utf8");

    try {
        const fontOptions = resolveResvgFontOptions(svgString);
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
            fontFileCount: fontOptions.fontFiles?.length ?? 0,
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
            fontFileCount: 0,
            pngByteLength: null,
            constructMilliseconds: 0,
            renderMilliseconds: 0,
            asPngMilliseconds: 0,
            base64Milliseconds: 0,
            totalMilliseconds: failureTimestampMilliseconds - rasterizeStartTimestampMilliseconds,
        });
        log.error(() => `SVG render failed: ${error}`);
        return "";
    }
}

function recordRasterizerPerformanceSample(sample: RasterizerPerformanceSample): void {
    const summary = rasterizerPerformanceStats.record(sample);

    if (summary) {
        if (shouldWarnRasterizerPerformanceSummary(summary)) {
            log.atWarn()
                .everyMs("rasterizer-performance-warning", 60000)
                .log(() => formatRasterizerPerformanceSummary(summary));
            return;
        }

        log.debug(() => formatRasterizerPerformanceSummary(summary));
    }
}
