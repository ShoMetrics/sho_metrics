import assert from "node:assert/strict";
import test from "node:test";
import {
    resolveSparklineGridLineOpacity,
    type SparklineGridLineLayout,
    type SparklineGridLinePoint,
    type SparklineGridLineType,
    type SparklineGridLineVisibility,
} from "./sparkline-grid-lines";

const plotLayout: SparklineGridLineLayout = {
    xCoordinate: 0,
    yCoordinate: 10,
    width: 100,
    height: 50,
};

test("none visibility returns no grid metrics", () => {
    const metrics = resolveMetrics({
        gridLineVisibility: "none",
        gridLineType: "horizontal",
        progressList: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
    });

    assert.equal(metrics, undefined);
});

test("always visibility uses fixed horizontal opacity and skips adaptive activity", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "always",
        gridLineType: "horizontal",
        progressList: [0, 1, 0, 1, 0, 1, 0, 1],
    });

    assert.equal(metrics.opacity, 1);
    assert.equal(metrics.activity, 0);
    assert.equal(metrics.verticalRange, 0);
    assert.equal(metrics.averageStep, 0);
    assert.equal(metrics.pointCount, 8);
});

test("always visibility uses fixed vertical opacity", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "always",
        gridLineType: "vertical",
        progressList: [0, 1, 0, 1, 0, 1, 0, 1],
    });

    assert.equal(metrics.opacity, 1);
    assert.equal(metrics.pointCount, 8);
});

test("adaptive horizontal treats a steady full history as maximally supported", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
        progressList: Array.from({ length: 60 }, () => 0.43),
    });

    assert.equal(metrics.opacity, 0.75);
    assert.equal(metrics.activity, 0);
    assert.equal(metrics.verticalRange, 0);
    assert.equal(metrics.averageStep, 0);
    assert.equal(metrics.pointCount, 60);
});

test("adaptive horizontal treats insufficient samples as steady", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
        progressList: [0.43, 0.43],
    });

    assert.equal(metrics.opacity, 0.75);
    assert.equal(metrics.activity, 0);
    assert.equal(metrics.pointCount, 2);
});

test("adaptive horizontal makes highly active charts quiet", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
        progressList: [0, 1, 0, 1, 0, 1, 0, 1],
    });

    assertApproximatelyEqual(metrics.opacity, 0.32);
    assert.equal(metrics.activity, 1);
    assert.equal(metrics.verticalRange, 1);
    assert.equal(metrics.averageStep, 1);
});

test("adaptive horizontal smoothly interpolates for moderate activity", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
        progressList: [0.2, 0.23, 0.26, 0.29, 0.32, 0.35, 0.38, 0.41],
    });

    assert.ok(metrics.activity > 0.06, `Expected activity above steady threshold, got ${metrics.activity}.`);
    assert.ok(metrics.activity < 0.32, `Expected activity below active threshold, got ${metrics.activity}.`);
    assert.ok(metrics.opacity > 0.32, `Expected opacity above active opacity, got ${metrics.opacity}.`);
    assert.ok(metrics.opacity < 0.75, `Expected opacity below steady opacity, got ${metrics.opacity}.`);
});

test("adaptive vertical uses vertical opacity range for steady charts", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "vertical",
        progressList: Array.from({ length: 12 }, () => 0.43),
    });

    assert.equal(metrics.opacity, 0.75);
    assert.equal(metrics.activity, 0);
});

test("adaptive vertical uses vertical opacity range for active charts", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "vertical",
        progressList: [0, 1, 0, 1, 0, 1, 0, 1],
    });

    assertApproximatelyEqual(metrics.opacity, 0.32);
    assert.equal(metrics.activity, 1);
});

test("adaptive vertical treats insufficient samples as steady", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "vertical",
        progressList: [0.43, 0.43],
    });

    assert.equal(metrics.opacity, 0.75);
    assert.equal(metrics.pointCount, 2);
});

test("adaptive handles empty histories as steady instead of producing NaN", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
        progressList: [],
    });

    assert.equal(metrics.opacity, 0.75);
    assert.equal(metrics.activity, 0);
    assert.equal(metrics.verticalRange, 0);
    assert.equal(metrics.averageStep, 0);
    assert.equal(metrics.pointCount, 0);
});

test("adaptive handles invalid plot height as steady instead of producing NaN", () => {
    const metrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
        progressList: [0.2, 0.8],
        plotLayoutOverride: { ...plotLayout, height: 0 },
    });

    assert.equal(metrics.opacity, 0.75);
    assert.equal(metrics.activity, 0);
    assert.equal(metrics.verticalRange, 0);
    assert.equal(metrics.averageStep, 0);
    assert.equal(metrics.pointCount, 2);
});

test("activity is based on chart-space movement, not raw sample labels", () => {
    const lowAmplitudeMetrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
        progressList: [0.49, 0.5, 0.51, 0.5, 0.49, 0.5, 0.51, 0.5],
    });
    const highAmplitudeMetrics = resolveRequiredMetrics({
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
        progressList: [0.1, 0.8, 0.15, 0.75, 0.2, 0.7, 0.25, 0.65],
    });

    assert.ok(highAmplitudeMetrics.activity > lowAmplitudeMetrics.activity);
    assert.ok(highAmplitudeMetrics.opacity < lowAmplitudeMetrics.opacity);
});

function resolveRequiredMetrics(options: {
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
    progressList: readonly number[];
    plotLayoutOverride?: SparklineGridLineLayout;
}): NonNullable<ReturnType<typeof resolveMetrics>> {
    const metrics = resolveMetrics(options);

    if (!metrics) {
        assert.fail("Expected grid line metrics.");
    }

    return metrics;
}

function resolveMetrics(options: {
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
    progressList: readonly number[];
    plotLayoutOverride?: SparklineGridLineLayout;
}): ReturnType<typeof resolveSparklineGridLineOpacity> {
    const layout = options.plotLayoutOverride ?? plotLayout;

    return resolveSparklineGridLineOpacity({
        gridLineVisibility: options.gridLineVisibility,
        gridLineType: options.gridLineType,
        points: buildPoints(options.progressList, layout),
        plotLayout: layout,
    });
}

function buildPoints(
    progressList: readonly number[],
    layout: SparklineGridLineLayout,
): readonly SparklineGridLinePoint[] {
    return progressList.map((progress, progressIndex) => ({
        xCoordinate: layout.xCoordinate + progressIndex,
        yCoordinate: layout.yCoordinate + layout.height * (1 - progress),
    }));
}

function assertApproximatelyEqual(actualValue: number, expectedValue: number): void {
    assert.ok(
        Math.abs(actualValue - expectedValue) < 0.000001,
        `Expected ${actualValue} to approximately equal ${expectedValue}.`,
    );
}
