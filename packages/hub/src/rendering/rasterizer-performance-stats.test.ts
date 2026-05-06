import assert from "node:assert/strict";
import test from "node:test";
import { RasterizerPerformanceStats, formatRasterizerPerformanceSummary } from "./rasterizer-performance-stats";

test("rasterizer performance stats aggregates breakdown windows", () => {
    const stats = new RasterizerPerformanceStats(5000);

    const firstSummary = stats.record({
        success: true,
        renderWidth: 144,
        renderHeight: 144,
        svgByteLength: 1000,
        fontFileCount: 2,
        pngByteLength: 2000,
        constructMilliseconds: 5,
        renderMilliseconds: 40,
        asPngMilliseconds: 70,
        base64Milliseconds: 1,
        totalMilliseconds: 116,
    }, 1000);

    const secondSummary = stats.record({
        success: false,
        renderWidth: 200,
        renderHeight: 100,
        svgByteLength: 3000,
        fontFileCount: 5,
        pngByteLength: null,
        constructMilliseconds: 2,
        renderMilliseconds: 0,
        asPngMilliseconds: 0,
        base64Milliseconds: 0,
        totalMilliseconds: 2,
    }, 6000);

    assert.equal(firstSummary, null);
    assert.ok(secondSummary);
    assert.equal(secondSummary.sampleCount, 2);
    assert.equal(secondSummary.successCount, 1);
    assert.equal(secondSummary.failureCount, 1);
    assert.equal(secondSummary.maximumSvgByteLength, 3000);
    assert.equal(secondSummary.maximumPngByteLength, 2000);
    assert.equal(secondSummary.maximumFontFileCount, 5);
    assert.equal(secondSummary.maximumRenderWidth, 200);
    assert.equal(secondSummary.maximumRenderHeight, 144);
    assert.equal(secondSummary.constructDuration.averageMilliseconds, 3.5);
    assert.equal(secondSummary.asPngDuration.maximumMilliseconds, 70);
});

test("rasterizer performance summary is log-friendly", () => {
    const stats = new RasterizerPerformanceStats(0);
    const summary = stats.record({
        success: true,
        renderWidth: 144,
        renderHeight: 144,
        svgByteLength: 1000,
        fontFileCount: 2,
        pngByteLength: 2000,
        constructMilliseconds: 5,
        renderMilliseconds: 40,
        asPngMilliseconds: 70,
        base64Milliseconds: 1,
        totalMilliseconds: 116,
    }, 2000);

    assert.ok(summary);
    assert.equal(
        formatRasterizerPerformanceSummary(summary),
        [
            "rasterizerPerfSummary",
            "windowMs=0",
            "samples=1",
            "successes=1",
            "failures=0",
            "maxSvgBytes=1000",
            "maxPngBytes=2000",
            "maxFontFiles=2",
            "maxRenderSize=144x144",
            "avgConstructMs=5.0",
            "maxConstructMs=5",
            "avgRenderMs=40.0",
            "maxRenderMs=40",
            "avgAsPngMs=70.0",
            "maxAsPngMs=70",
            "avgBase64Ms=1.0",
            "maxBase64Ms=1",
            "avgTotalMs=116.0",
            "maxTotalMs=116",
        ].join(" "),
    );
});
