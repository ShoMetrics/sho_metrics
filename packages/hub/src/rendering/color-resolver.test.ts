import assert from "node:assert/strict";
import test from "node:test";
import {
    buildGradientStops,
    resolveColor,
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
};

test("solid color mode ignores thresholds", () => {
    assert.equal(resolveColor(95, {
        ...thresholdConfig,
        mode: "solid",
        solidColor: "#123456",
    }), "#123456");
});

test("threshold color mode uses inclusive lower and exclusive upper bounds", () => {
    assert.equal(resolveColor(49.9, thresholdConfig), "#00ff00");
    assert.equal(resolveColor(50, thresholdConfig), "#ffff00");
    assert.equal(resolveColor(80, thresholdConfig), "#ff0000");
});

test("threshold color mode falls back to the last threshold color", () => {
    assert.equal(resolveColor(200, thresholdConfig), "#ff0000");
    assert.equal(resolveColor(200, { mode: "threshold", solidColor: "#123456", thresholds: [] }), "#123456");
});

test("gradient stops produce paired stops at threshold transitions", () => {
    assert.deepEqual(buildGradientStops([10, 60, 90], thresholdConfig), [
        { offset: 0, color: "#00ff00" },
        { offset: 0.5, color: "#00ff00" },
        { offset: 0.5, color: "#ffff00" },
        { offset: 1, color: "#ffff00" },
        { offset: 1, color: "#ff0000" },
        { offset: 1, color: "#ff0000" },
    ]);
});

test("solid gradient stops span the whole graph", () => {
    assert.deepEqual(buildGradientStops([10, 60], {
        ...thresholdConfig,
        mode: "solid",
        solidColor: "#abcdef",
    }), [
        { offset: 0, color: "#abcdef" },
        { offset: 1, color: "#abcdef" },
    ]);
    assert.deepEqual(buildGradientStops([], thresholdConfig), []);
});
