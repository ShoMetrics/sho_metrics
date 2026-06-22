import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveMaximumGpuPowerWatts } from "./gpu-power-widget-data";

test("GPU power maximum uses custom setting before automatic telemetry", () => {
    const maximumPowerWatts = resolveMaximumGpuPowerWatts({
        customMaximumPowerWatts: 450,
        automaticMaximumPowerWatts: 320,
    });

    assert.equal(maximumPowerWatts, 450);
});

test("GPU power maximum uses automatic telemetry when custom setting is absent", () => {
    const maximumPowerWatts = resolveMaximumGpuPowerWatts({
        customMaximumPowerWatts: undefined,
        automaticMaximumPowerWatts: 320,
    });

    assert.equal(maximumPowerWatts, 320);
});

test("GPU power maximum falls back when custom and automatic values are unusable", () => {
    const maximumPowerWatts = resolveMaximumGpuPowerWatts({
        customMaximumPowerWatts: 0,
        automaticMaximumPowerWatts: 0,
    });

    assert.equal(maximumPowerWatts, 300);
});
