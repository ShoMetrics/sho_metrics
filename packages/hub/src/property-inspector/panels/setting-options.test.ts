import assert from "node:assert/strict";
import { test } from "vitest";
import { formatMessage } from "../../i18n/format";
import type { HubLocale } from "../../i18n/types";
import {
    buildCustomHttpPollingFrequencyOptionList,
    buildPollingFrequencyOptionList,
    formatDurationOptionLabel,
    isCpuHardwareSummarySupportedOnPlatform,
    isGpuHardwareSummarySupportedOnPlatform,
    type OptionLabelFormatter,
} from "./setting-options";
import { STANDARD_POLLING_FREQUENCY_SECONDS } from "../../settings/polling-frequency-options";

test("Custom HTTP polling options extend ordinary widget polling up to 24 hours", () => {
    const pollingFrequencyOptionList = buildPollingFrequencyOptionList(formatEnglishOptionLabel);
    const customHttpPollingFrequencyOptionList = buildCustomHttpPollingFrequencyOptionList(formatEnglishOptionLabel);

    assert.deepEqual(
        pollingFrequencyOptionList.map(option => option.value),
        [...STANDARD_POLLING_FREQUENCY_SECONDS],
    );
    assert.deepEqual(
        pollingFrequencyOptionList.map(option => option.label),
        [
            "1 second",
            "2 seconds",
            "3 seconds",
            "5 seconds",
            "10 seconds",
            "15 seconds",
            "30 seconds",
            "1 minute",
        ],
    );
    assert.deepEqual(
        customHttpPollingFrequencyOptionList.slice(-6).map(option => option.value),
        [3600, 7200, 10800, 21600, 43200, 86400],
    );
    assert.deepEqual(
        customHttpPollingFrequencyOptionList.slice(-6).map(option => option.label),
        ["1 hour", "2 hours", "3 hours", "6 hours", "12 hours", "24 hours"],
    );
});

test("polling frequency option labels are localized", () => {
    assert.equal(formatDurationOptionLabel(formatLocaleOptionLabel("zh_CN"), 60), "1分钟");
    assert.equal(formatDurationOptionLabel(formatLocaleOptionLabel("zh_CN"), 3600), "1小时");
    assert.equal(formatDurationOptionLabel(formatLocaleOptionLabel("ja"), 60), "1分");
    assert.equal(formatDurationOptionLabel(formatLocaleOptionLabel("ja"), 3600), "1時間");
});

test("hardware summary options require every default reading to be supported", () => {
    assert.equal(isCpuHardwareSummarySupportedOnPlatform("win32"), true);
    assert.equal(isCpuHardwareSummarySupportedOnPlatform("darwin"), false);

    assert.equal(isGpuHardwareSummarySupportedOnPlatform("win32"), true);
    assert.equal(isGpuHardwareSummarySupportedOnPlatform("darwin"), false);
});

const formatEnglishOptionLabel = formatLocaleOptionLabel("en");

function formatLocaleOptionLabel(locale: HubLocale): OptionLabelFormatter {
    return (message, values) => formatMessage(locale, message, values);
}
