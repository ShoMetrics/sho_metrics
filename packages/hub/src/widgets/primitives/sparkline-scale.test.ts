import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveSparklineScaleBounds } from "./sparkline-scale";

test("missing sparkline scale uses deterministic fixed bounds", () => {
    assert.deepEqual(resolveSparklineScaleBounds([2, 4], undefined), {
        minimumValue: 0,
        maximumValue: 100,
    });
});

test("fit-to-data sparkline scale fits positive history only when explicitly requested", () => {
    const bounds = resolveSparklineScaleBounds([10, 20], { mode: "fitToData", minimumValue: 0 });

    assert.equal(bounds.minimumValue, 0);
    assert.ok(Math.abs(bounds.maximumValue - 23.6) < 0.0001);
});

test("fit-to-data sparkline scale preserves an unknown negative data range", () => {
    assert.deepEqual(resolveSparklineScaleBounds([-12.2, -11.8], { mode: "fitToData" }), {
        minimumValue: -12.2,
        maximumValue: -11.2,
    });
});
