import assert from "node:assert/strict";
import { test } from "vitest";
import {
    resolveThresholdColorForProgress,
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
    const color = resolveThresholdColorForProgress(0.95, {
        ...thresholdConfig,
        mode: "solid",
        solidColor: "#123456",
    });

    assert.equal(color, "#123456");
});

test("threshold bands use inclusive lower and exclusive upper percent bounds", () => {
    assert.equal(resolveThresholdColorForProgress(0.499, thresholdConfig), "#00ff00");
    assert.equal(resolveThresholdColorForProgress(0.5, thresholdConfig), "#ffff00");
    assert.equal(resolveThresholdColorForProgress(0.8, thresholdConfig), "#ff0000");
});

test("progress outside 0-1 clamps into the percent band domain", () => {
    // A raw source-unit value accidentally passed as progress must not fall
    // past every band; it saturates at the top band instead.
    assert.equal(resolveThresholdColorForProgress(2, thresholdConfig), "#ff0000");
    assert.equal(resolveThresholdColorForProgress(-1, thresholdConfig), "#00ff00");
    assert.equal(resolveThresholdColorForProgress(Number.NaN, thresholdConfig), "#00ff00");
});

test("empty threshold bands fall back to the solid color", () => {
    const emptyThresholdColor = resolveThresholdColorForProgress(1, {
        mode: "threshold",
        solidColor: "#123456",
        thresholds: [],
        isGradientEnabled: true,
    });

    assert.equal(emptyThresholdColor, "#123456");
});
