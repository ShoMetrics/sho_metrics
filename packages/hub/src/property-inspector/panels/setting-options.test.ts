import assert from "node:assert/strict";
import { test } from "vitest";
import {
    customHttpPollingFrequencyOptionList,
    isCpuHardwareSummarySupportedOnPlatform,
    isGpuHardwareSummarySupportedOnPlatform,
    pollingFrequencyOptionList,
} from "./setting-options";
import { STANDARD_POLLING_FREQUENCY_SECONDS } from "../../settings/polling-frequency-options";

test("Custom HTTP polling options extend ordinary widget polling up to 24 hours", () => {
    assert.deepEqual(
        pollingFrequencyOptionList.map(option => option.value),
        [...STANDARD_POLLING_FREQUENCY_SECONDS],
    );
    assert.deepEqual(
        pollingFrequencyOptionList.map(option => option.label),
        STANDARD_POLLING_FREQUENCY_SECONDS.map(value => `${value}s`),
    );
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
