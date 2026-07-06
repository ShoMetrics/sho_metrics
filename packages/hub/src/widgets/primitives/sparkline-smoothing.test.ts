import assert from "node:assert/strict";
import { test } from "vitest";
import { smoothSparklineValues } from "./sparkline-smoothing";

test("zero smoothing keeps the original value sequence", () => {
    const values = [10, 14, 12, 16, 11];

    assert.equal(smoothSparklineValues(values, 0), values);
});

test("short histories are not smoothed", () => {
    const values = [10, 14];

    assert.equal(smoothSparklineValues(values, 100), values);
});

// The head sample is the only part of the line that reports "now". The old
// cascade filter averaged it against up to 18 past samples, so a CPU jump to
// 100% needed ~10 real seconds to reach the top of the chart. The bounded
// window must keep the newest sample exactly raw.
test("the newest sample renders raw at any smoothing so the live edge has no lag", () => {
    const stepValues = [...Array<number>(40).fill(5), 100];

    for (const smoothingPercent of [25, 50, 75, 100]) {
        const smoothedValues = smoothSparklineValues(stepValues, smoothingPercent);

        assert.equal(smoothedValues[smoothedValues.length - 1], 100);
    }
});

test("a sustained plateau reads its exact value once the window is inside it", () => {
    const plateauValues = [...Array<number>(40).fill(5), ...Array<number>(20).fill(100)];
    const smoothedValues = smoothSparklineValues(plateauValues, 100);

    // The +-3 window is fully inside the plateau for the last handful of
    // samples, so maximum smoothing must not understate a sustained 100%.
    for (const value of smoothedValues.slice(-8)) {
        assert.equal(value, 100);
    }
});

test("maximum smoothing removes alternating jitter without moving the center", () => {
    const jitteredValues = buildAlternatingValues({
        centerValue: 30,
        amplitude: 2,
        valueCount: 60,
    });
    const smoothedValues = smoothSparklineValues(jitteredValues, 100);

    assert.ok(
        calculateAverageStep(smoothedValues) < calculateAverageStep(jitteredValues) * 0.2,
        "Expected maximum smoothing to substantially reduce alternating jitter.",
    );
    for (const value of smoothedValues.slice(3, -3)) {
        assert.ok(Math.abs(value - 30) < 0.75, "Expected smoothing to stay centered on the signal.");
    }
});

test("stronger smoothing produces a calmer line", () => {
    const jitteredValues = buildAlternatingValues({
        centerValue: 30,
        amplitude: 2,
        valueCount: 60,
    });
    const halfSmoothedValues = smoothSparklineValues(jitteredValues, 50);
    const maximumSmoothedValues = smoothSparklineValues(jitteredValues, 100);

    assert.ok(
        calculateAverageStep(maximumSmoothedValues) < calculateAverageStep(halfSmoothedValues),
        "Expected 100 smoothing to reduce movement more than 50 smoothing.",
    );
});

test("smoothing preserves broad trends", () => {
    const trendValues = buildRange(60).map((valueIndex) =>
        20 + valueIndex * 0.5 + (valueIndex % 2 === 0 ? 0.8 : -0.8));
    const smoothedValues = smoothSparklineValues(trendValues, 100);

    assert.ok(smoothedValues[smoothedValues.length - 1] > smoothedValues[0] + 20);
});

// Guards against the old "leaning peak" bug: the hand-rolled Catmull-Rom path
// (and any asymmetric filter) could shift a spike's apex off its sample. The
// symmetric window must keep the apex on the impulse index with mirrored
// shoulders, leaving no value-domain contribution to a tilted peak.
test("an isolated spike keeps its apex centered and symmetric", () => {
    const impulseValues = buildImpulseValues({
        valueCount: 61,
        impulseIndex: 30,
        impulseValue: 100,
    });
    const smoothedValues = smoothSparklineValues(impulseValues, 100);

    assert.equal(findPeakIndex(smoothedValues), 30);
    for (let offset = 1; offset <= 4; offset++) {
        assert.equal(smoothedValues[30 - offset], smoothedValues[30 + offset]);
    }
});

// Honesty floor the old cascade violated: at the 75% default it flattened an
// isolated 100 spike to ~7% of its height. The single +-3 triangular window
// keeps the center weight at 4/16, so at least a quarter of the spike survives.
test("maximum smoothing keeps at least a quarter of an isolated spike's height", () => {
    const impulseValues = buildImpulseValues({
        valueCount: 61,
        impulseIndex: 30,
        impulseValue: 100,
    });
    const smoothedValues = smoothSparklineValues(impulseValues, 100);

    assert.ok(Math.max(...smoothedValues) >= 25);
});

function buildAlternatingValues(options: {
    centerValue: number;
    amplitude: number;
    valueCount: number;
}): readonly number[] {
    return buildRange(options.valueCount).map((valueIndex) =>
        options.centerValue + (valueIndex % 2 === 0 ? options.amplitude : -options.amplitude));
}

function buildRange(valueCount: number): readonly number[] {
    return Array.from(Array(valueCount).keys());
}

function buildImpulseValues(options: {
    valueCount: number;
    impulseIndex: number;
    impulseValue: number;
}): readonly number[] {
    return buildRange(options.valueCount).map((valueIndex) =>
        valueIndex === options.impulseIndex ? options.impulseValue : 0);
}

function calculateAverageStep(values: readonly number[]): number {
    if (values.length <= 1) {
        return 0;
    }

    let totalStep = 0;

    for (let valueIndex = 1; valueIndex < values.length; valueIndex++) {
        totalStep += Math.abs(values[valueIndex] - values[valueIndex - 1]);
    }

    return totalStep / (values.length - 1);
}

function findPeakIndex(values: readonly number[]): number {
    let peakIndex = 0;

    for (let valueIndex = 1; valueIndex < values.length; valueIndex++) {
        if (values[valueIndex] > values[peakIndex]) {
            peakIndex = valueIndex;
        }
    }

    return peakIndex;
}
