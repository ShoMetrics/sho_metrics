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

test("default smoothing removes most high-frequency jitter", () => {
    const jitteredValues = buildAlternatingValues({
        centerValue: 30,
        amplitude: 2,
        valueCount: 60,
    });
    const smoothedValues = smoothSparklineValues(jitteredValues, 75);

    assert.ok(
        calculateAverageStep(smoothedValues) < calculateAverageStep(jitteredValues) * 0.32,
        "Expected default smoothing to substantially reduce alternating jitter.",
    );
});

test("stronger smoothing produces a calmer line than default smoothing", () => {
    const jitteredValues = buildAlternatingValues({
        centerValue: 30,
        amplitude: 2,
        valueCount: 60,
    });
    const defaultSmoothedValues = smoothSparklineValues(jitteredValues, 75);
    const maximumSmoothedValues = smoothSparklineValues(jitteredValues, 100);

    assert.ok(
        calculateAverageStep(maximumSmoothedValues) < calculateAverageStep(defaultSmoothedValues),
        "Expected 100 smoothing to reduce movement more than 75 smoothing.",
    );
});

test("default smoothing preserves broad trends", () => {
    const trendValues = buildRange(60).map((valueIndex) =>
        20 + valueIndex * 0.5 + (valueIndex % 2 === 0 ? 0.8 : -0.8));
    const smoothedValues = smoothSparklineValues(trendValues, 75);

    assert.ok(smoothedValues[smoothedValues.length - 1] > smoothedValues[0] + 20);
});

test("very high smoothing spreads a single impulse into a rounded hill", () => {
    const impulseValues = buildImpulseValues({
        valueCount: 61,
        impulseIndex: 30,
        impulseValue: 100,
    });
    const smoothedValues = smoothSparklineValues(impulseValues, 95);
    const peakIndex = findPeakIndex(smoothedValues);
    const peakValue = smoothedValues[peakIndex];

    assert.ok(smoothedValues[peakIndex - 1] > peakValue * 0.95);
    assert.ok(smoothedValues[peakIndex + 1] > peakValue * 0.95);
    assert.ok(countValuesAbove(smoothedValues, peakValue * 0.75) >= 9);
});

test("maximum smoothing creates a wider impulse hill than very high smoothing", () => {
    const impulseValues = buildImpulseValues({
        valueCount: 61,
        impulseIndex: 30,
        impulseValue: 100,
    });
    const highSmoothedValues = smoothSparklineValues(impulseValues, 95);
    const maximumSmoothedValues = smoothSparklineValues(impulseValues, 100);

    assert.ok(
        calculateEffectiveWidth(maximumSmoothedValues) > calculateEffectiveWidth(highSmoothedValues),
        "Expected 100 smoothing to produce a wider rounded hill than 95 smoothing.",
    );
});

test("default smoothing suppresses needle-like impulses", () => {
    const impulseValues = buildImpulseValues({
        valueCount: 61,
        impulseIndex: 30,
        impulseValue: 100,
    });
    const smoothedValues = smoothSparklineValues(impulseValues, 75);
    const peakIndex = findPeakIndex(smoothedValues);
    const peakValue = smoothedValues[peakIndex];

    assert.ok(smoothedValues[peakIndex - 1] > peakValue * 0.75);
    assert.ok(smoothedValues[peakIndex + 1] > peakValue * 0.75);
    assert.ok(countValuesAbove(smoothedValues, peakValue * 0.75) >= 9);
});

test("default smoothing fully enters rounded impulse mode", () => {
    const impulseValues = buildImpulseValues({
        valueCount: 61,
        impulseIndex: 30,
        impulseValue: 100,
    });
    const defaultSmoothedValues = smoothSparklineValues(impulseValues, 75);
    const higherSmoothedValues = smoothSparklineValues(impulseValues, 80);

    assert.ok(
        Math.abs(calculateEffectiveWidth(defaultSmoothedValues) - calculateEffectiveWidth(higherSmoothedValues)) <= 2,
        "Expected 75 smoothing to look close to the rounded impulse behavior at 80.",
    );
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

function calculateEffectiveWidth(values: readonly number[]): number {
    const peakValue = Math.max(...values);

    return countValuesAbove(values, peakValue * 0.75);
}

function countValuesAbove(values: readonly number[], threshold: number): number {
    return values.filter((value) => value >= threshold).length;
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
