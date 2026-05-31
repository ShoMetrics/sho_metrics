import assert from "node:assert/strict";
import test from "node:test";
import {
    buildCpuMetricKindOptionList,
    buildGpuMetricKindOptionList,
} from "./setting-options";

test("platform-filtered CPU options show the complete Windows list", () => {
    assert.deepEqual(buildCpuMetricKindOptionList("win32"), [
        { value: "usage", label: "Usage" },
        { value: "temperature", label: "Temperature" },
        { value: "power", label: "Power" },
    ]);
});

test("platform-filtered CPU options show only supported macOS choices", () => {
    assert.deepEqual(buildCpuMetricKindOptionList("darwin"), [
        { value: "usage", label: "Usage" },
    ]);
});

test("platform-filtered CPU options keep unsupported current values switchable", () => {
    assert.deepEqual(buildCpuMetricKindOptionList("darwin", "temperature"), [
        { value: "usage", label: "Usage" },
        { value: "temperature", label: "Temperature (not supported)", disabled: true },
    ]);
});

test("platform-filtered GPU options show the complete Windows list", () => {
    assert.deepEqual(buildGpuMetricKindOptionList("win32"), [
        { value: "usage", label: "Usage" },
        { value: "temperature", label: "Temperature" },
        { value: "vram", label: "VRAM" },
        { value: "power", label: "Power" },
    ]);
});

test("platform-filtered GPU options show only supported macOS choices", () => {
    assert.deepEqual(buildGpuMetricKindOptionList("darwin"), [
        { value: "usage", label: "Usage" },
    ]);
});

test("platform-filtered GPU options keep unsupported current values switchable", () => {
    assert.deepEqual(buildGpuMetricKindOptionList("darwin", "temperature"), [
        { value: "usage", label: "Usage" },
        { value: "temperature", label: "Temperature (not supported)", disabled: true },
    ]);
});
