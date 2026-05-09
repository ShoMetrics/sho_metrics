import assert from "node:assert/strict";
import test from "node:test";
import {
    normalizeWidgetStoredSettings,
    type SettingsContext,
} from "../settings/widget-settings";
import {
    findWidgetSettingBinding,
    updateWidgetStoredSettings,
} from "./widget-setting-bindings";

const defaultContext: SettingsContext = {
    actionKind: "cpu-usage",
    isWindows: false,
};

test("widget setting binding writes appearance overrides only", () => {
    const settings = writeSetting("solidColor", "#123456", defaultContext);

    assert.deepEqual(settings.appearanceOverrides, { solidColor: "#123456" });
    assert.equal(settings.networkOverrides, undefined);
});

test("network maximum binding switches scale to custom", () => {
    const settings = writeSetting("maximumDownloadSpeedMbps", "500", {
        actionKind: "net-speed",
        isWindows: false,
    });

    assert.equal(settings.networkOverrides?.networkScaleMode, "custom");
    assert.equal(settings.networkOverrides?.maximumDownloadSpeedMbps, 500);
});

test("graphic type binding writes the selected appearance override", () => {
    const settings = writeSetting("graphicType", "linear", defaultContext);

    assert.equal(settings.appearanceOverrides?.graphicType, "linear");
});

test("threshold bindings keep stored thresholds ordered", () => {
    const lowSettings = writeSetting("lowThreshold", "90", defaultContext);

    assert.equal(lowSettings.appearanceOverrides?.lowThreshold, 90);
    assert.equal(lowSettings.appearanceOverrides?.highThreshold, 90);
});

test("disk metric kind binding writes only the selected metric kind", () => {
    const settings = writeSetting("diskMetricKind", "throughput", {
        actionKind: "disk",
        isWindows: false,
    });

    assert.equal(settings.metric?.diskMetricKind, "throughput");
    assert.equal(settings.local, undefined);
});

test("disk metric kind binding does not apply platform context to stored settings", () => {
    const settings = writeSetting("diskMetricKind", "throughput", {
        actionKind: "disk",
        isWindows: true,
    });

    assert.equal(settings.metric?.diskMetricKind, "throughput");
    assert.equal(settings.local, undefined);
});

function writeSetting(
    bindingId: string,
    value: string,
    context: SettingsContext,
) {
    const binding = findWidgetSettingBinding(bindingId);

    assert.ok(binding);

    return updateWidgetStoredSettings({
        storedSettings: normalizeWidgetStoredSettings({}),
        binding,
        value,
        context,
    });
}
