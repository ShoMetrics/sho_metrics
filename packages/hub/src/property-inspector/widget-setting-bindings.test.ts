import assert from "node:assert/strict";
import test from "node:test";
import {
    sanitizeWidgetSettings,
    type SettingsContext,
} from "../settings/widget-settings";
import type { InspectorControlValue, InspectorSettingTarget } from "./types";
import {
    buildInspectorBindingContext,
    readInspectorControlValue,
    updateWidgetStoredSettings,
} from "./widget-setting-bindings";

const defaultContext: SettingsContext = {
    actionKind: "cpu-usage",
    isWindows: false,
};

test("widget setting binding writes appearance overrides only", () => {
    const settings = writeSetting(usageSolidColorBinding, "#123456", defaultContext);

    assert.deepEqual(settings.appearanceOverrides, {
        usageColors: {
            solidColor: "#123456",
        },
    });
    assert.equal(settings.networkOverrides, undefined);
});

test("widget setting binding reads resolved values", () => {
    const context = buildContext(sanitizeWidgetSettings({
        appearanceOverrides: {
            graphicType: "linear",
        },
    }), defaultContext);

    assert.equal(readInspectorControlValue(context, "graphicType"), "linear");
    assert.equal(readInspectorControlValue(context, "maximumGpuPowerWatts"), "");
});

test("channel color bindings read and write nested color ramps", () => {
    const storedSettings = writeSetting(downloadHighColorBinding, "#60a5fa", {
        actionKind: "net-speed",
        isWindows: false,
    });
    const context = buildContext(storedSettings, {
        actionKind: "net-speed",
        isWindows: false,
    });

    assert.deepEqual(storedSettings.appearanceOverrides?.downloadColors, {
        highColor: "#60a5fa",
    });
    assert.equal(readInspectorControlValue(context, downloadHighColorBinding), "#60a5fa");
});

test("network maximum binding switches scale to custom", () => {
    const settings = writeSetting("maximumDownloadSpeedMbps", 500, {
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
    const lowSettings = writeSetting("lowThreshold", 90, defaultContext);

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
    target: InspectorSettingTarget,
    value: InspectorControlValue,
    context: SettingsContext,
) {
    const storedSettings = sanitizeWidgetSettings({});

    return updateWidgetStoredSettings({
        storedSettings,
        target,
        value,
        context: buildContext(storedSettings, context),
    });
}

function buildContext(
    storedSettings: ReturnType<typeof sanitizeWidgetSettings>,
    context: SettingsContext,
) {
    return buildInspectorBindingContext({
        storedSettings,
        globalSettings: {},
        actionKind: context.actionKind,
        isWindows: context.isWindows,
    });
}

const usageSolidColorBinding = {
    rampKey: "usageColors",
    colorKey: "solidColor",
} as const;

const downloadHighColorBinding = {
    rampKey: "downloadColors",
    colorKey: "highColor",
} as const;
