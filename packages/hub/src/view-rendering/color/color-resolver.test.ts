import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildGradientStops,
    resolveColorForThresholdValue,
    type ColorConfig,
} from "./color-resolver";

const thresholdConfig: ColorConfig = {
    mode: "threshold",
    solidColor: "#000000",
    thresholds: [
        { min: 0, max: 50, color: "#00ff00" },
        { min: 50, max: 80, color: "#ffff00" },
        { min: 80, max: 101, color: "#ff0000" },
    ],
    isGradientEnabled: true,
};

test("solid color mode ignores thresholds", () => {
    const color = resolveColorForThresholdValue(95, {
        ...thresholdConfig,
        mode: "solid",
        solidColor: "#123456",
    });

    assert.equal(color, "#123456");
});

test("threshold color mode uses inclusive lower and exclusive upper bounds", () => {
    assert.equal(resolveColorForThresholdValue(49.9, thresholdConfig), "#00ff00");
    assert.equal(resolveColorForThresholdValue(50, thresholdConfig), "#ffff00");
    assert.equal(resolveColorForThresholdValue(80, thresholdConfig), "#ff0000");
});

test("threshold color mode falls back to the last threshold color", () => {
    const highColor = resolveColorForThresholdValue(200, thresholdConfig);
    const emptyThresholdColor = resolveColorForThresholdValue(200, {
        mode: "threshold",
        solidColor: "#123456",
        thresholds: [],
        isGradientEnabled: true,
    });

    assert.equal(highColor, "#ff0000");
    assert.equal(emptyThresholdColor, "#123456");
});

test("gradient stops produce paired stops at threshold transitions", () => {
    const gradientStops = buildGradientStops([10, 60, 90], thresholdConfig);

    assert.deepEqual(gradientStops, [
        { offset: 0, color: "#00ff00" },
        { offset: 0.5, color: "#00ff00" },
        { offset: 0.5, color: "#ffff00" },
        { offset: 1, color: "#ffff00" },
        { offset: 1, color: "#ff0000" },
        { offset: 1, color: "#ff0000" },
    ]);
});

test("disabled gradient stops use the latest threshold color as a flat paint", () => {
    const gradientStops = buildGradientStops([10, 60, 90], {
        ...thresholdConfig,
        isGradientEnabled: false,
    });

    assert.deepEqual(gradientStops, [
        { offset: 0, color: "#ff0000" },
        { offset: 1, color: "#ff0000" },
    ]);
});

test("solid gradient stops span the whole graph", () => {
    const solidGradientStops = buildGradientStops([10, 60], {
        ...thresholdConfig,
        mode: "solid",
        solidColor: "#abcdef",
    });
    const emptyGradientStops = buildGradientStops([], thresholdConfig);

    assert.deepEqual(solidGradientStops, [
        { offset: 0, color: "#abcdef" },
        { offset: 1, color: "#abcdef" },
    ]);
    assert.deepEqual(emptyGradientStops, []);
});
