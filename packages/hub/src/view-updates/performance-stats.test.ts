import assert from "node:assert/strict";
import test from "node:test";
import {
    MetricViewPerformanceStats,
    formatMetricViewPerformanceSummary,
    shouldWarnMetricViewPerformanceSummary,
} from "./performance-stats";

// These tests use synthetic durations. Real performance baselines belong in
// platform-specific benchmarks, not hermetic unit tests.
test("metric view performance stats aggregates render windows", () => {
    const stats = new MetricViewPerformanceStats(5000);
    const renderContext = buildRenderContext();

    const firstSummary = stats.record({
        requestReason: "metric-tick",
        actionKind: "key",
        outcome: "rendered",
        renderContext,
        queuedMilliseconds: 100,
        composeMilliseconds: 2,
        rasterizeMilliseconds: 120,
        sdkPromiseMilliseconds: 1,
        totalMilliseconds: 223,
        queueLength: 9,
        activeActionCount: 1,
        titleClearRequested: true,
    }, 1000);

    const secondSummary = stats.record({
        requestReason: "settings-change",
        actionKind: "dial",
        outcome: "skipped",
        renderContext,
        queuedMilliseconds: 0,
        composeMilliseconds: 1,
        rasterizeMilliseconds: null,
        sdkPromiseMilliseconds: null,
        totalMilliseconds: 1,
        queueLength: 4,
        activeActionCount: 1,
        titleClearRequested: false,
    }, 6000);

    assert.equal(firstSummary, null);
    assert.ok(secondSummary);
    assert.equal(secondSummary.requestCount, 2);
    assert.equal(secondSummary.renderedCount, 1);
    assert.equal(secondSummary.skippedCount, 1);
    assert.equal(secondSummary.settingsChangeCount, 1);
    assert.equal(secondSummary.metricTickCount, 1);
    assert.equal(secondSummary.keyCount, 1);
    assert.equal(secondSummary.dialCount, 1);
    assert.equal(secondSummary.titleClearRequestCount, 1);
    assert.equal(secondSummary.maximumQueueLength, 9);
    assert.equal(secondSummary.queuedDuration.averageMilliseconds, 50);
    assert.equal(secondSummary.rasterizeDuration.count, 1);
    assert.equal(secondSummary.rasterizeDuration.maximumMilliseconds, 120);
    assert.deepEqual(secondSummary.slowestRasterizeSample, {
        renderContext,
        rasterizeMilliseconds: 120,
        totalMilliseconds: 223,
        queuedMilliseconds: 100,
        sdkPromiseMilliseconds: 1,
    });
});

test("metric view performance summary is log-friendly", () => {
    const stats = new MetricViewPerformanceStats(0);
    const summary = stats.record({
        requestReason: "metric-tick",
        actionKind: "key",
        outcome: "failed",
        renderContext: buildRenderContext(),
        queuedMilliseconds: 3,
        composeMilliseconds: 2,
        rasterizeMilliseconds: null,
        sdkPromiseMilliseconds: null,
        totalMilliseconds: 5,
        queueLength: 2,
        activeActionCount: 1,
        titleClearRequested: true,
    }, 2);

    assert.ok(summary);
    assert.equal(
        formatMetricViewPerformanceSummary(summary),
        [
            "metricViewPerfSummary",
            "windowMs=0",
            "requests=1",
            "rendered=0",
            "skipped=0",
            "failed=1",
            "settings=0",
            "metricTicks=1",
            "keys=1",
            "dials=0",
            "titleClearRequests=1",
            "maxQueueLength=2",
            "maxActiveActions=1",
            "avgQueuedMs=3.0",
            "maxQueuedMs=3",
            "avgComposeMs=2.0",
            "maxComposeMs=2",
            "avgRasterizeMs=unknown",
            "maxRasterizeMs=unknown",
            "avgSdkPromiseMs=unknown",
            "maxSdkPromiseMs=unknown",
            "avgTotalMs=5.0",
            "maxTotalMs=5",
        ].join(" "),
    );
});

test("metric view performance summary warns only on degraded view update windows", () => {
    const fastSummary = new MetricViewPerformanceStats(0).record({
        requestReason: "metric-tick",
        actionKind: "key",
        outcome: "rendered",
        renderContext: buildRenderContext(),
        queuedMilliseconds: 3,
        composeMilliseconds: 2,
        rasterizeMilliseconds: 5,
        sdkPromiseMilliseconds: 1,
        totalMilliseconds: 11,
        queueLength: 1,
        activeActionCount: 1,
        titleClearRequested: false,
    }, 2000);
    const queuedSummary = new MetricViewPerformanceStats(0).record({
        requestReason: "metric-tick",
        actionKind: "key",
        outcome: "rendered",
        renderContext: buildRenderContext(),
        queuedMilliseconds: 501,
        composeMilliseconds: 2,
        rasterizeMilliseconds: 5,
        sdkPromiseMilliseconds: 1,
        totalMilliseconds: 509,
        queueLength: 12,
        activeActionCount: 48,
        titleClearRequested: false,
    }, 2000);
    const failedSummary = new MetricViewPerformanceStats(0).record({
        requestReason: "metric-tick",
        actionKind: "key",
        outcome: "failed",
        renderContext: buildRenderContext(),
        queuedMilliseconds: 3,
        composeMilliseconds: 2,
        rasterizeMilliseconds: null,
        sdkPromiseMilliseconds: null,
        totalMilliseconds: 5,
        queueLength: 1,
        activeActionCount: 1,
        titleClearRequested: false,
    }, 2000);

    assert.ok(fastSummary);
    assert.ok(queuedSummary);
    assert.ok(failedSummary);
    assert.equal(shouldWarnMetricViewPerformanceSummary(fastSummary), false);
    assert.equal(shouldWarnMetricViewPerformanceSummary(queuedSummary), true);
    assert.equal(shouldWarnMetricViewPerformanceSummary(failedSummary), true);
});

function buildRenderContext() {
    return {
        metricFamily: "cpu",
        metricRenderKind: "singleMetric" as const,
        renderPrimitive: "circle" as const,
        renderVariant: "full-ring",
        themePreset: "flat" as const,
    };
}
