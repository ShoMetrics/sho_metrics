import assert from "node:assert/strict";
import { test } from "vitest";
import {
    customHttpPollingFrequencyOptionList,
    isCpuHardwareSummarySupportedOnPlatform,
    isGpuHardwareSummarySupportedOnPlatform,
    pollingFrequencyOptionList,
} from "./setting-options";

test("Custom HTTP polling options extend ordinary widget polling up to 24 hours", () => {
    assert.equal(pollingFrequencyOptionList.at(-1)?.value, 60);
    assert.deepEqual(
        customHttpPollingFrequencyOptionList.slice(-6).map(option => option.value),
        [3600, 7200, 10800, 21600, 43200, 86400],
    );
    assert.deepEqual(
        customHttpPollingFrequencyOptionList.slice(-6).map(option => option.label),
        ["1h", "2h", "3h", "6h", "12h", "24h"],
    );
});

test("hardware summary options require every default reading to be supported", () => {
    assert.equal(isCpuHardwareSummarySupportedOnPlatform("win32"), true);
    assert.equal(isCpuHardwareSummarySupportedOnPlatform("darwin"), false);

    assert.equal(isGpuHardwareSummarySupportedOnPlatform("win32"), true);
    assert.equal(isGpuHardwareSummarySupportedOnPlatform("darwin"), false);
});
