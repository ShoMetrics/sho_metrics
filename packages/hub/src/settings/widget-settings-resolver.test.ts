import assert from "node:assert/strict";
import test from "node:test";
import {
    defaultPluginGlobalSettings,
    normalizePluginGlobalSettings,
    normalizeWidgetStoredSettings,
    resolveWidgetSettings,
} from "./widget-settings";

test("stored widget settings stay sparse and do not expand globalizable fields", () => {
    const storedSettings = normalizeWidgetStoredSettings({
        metric: {
            networkDirection: "download",
        },
    }, {
        actionKind: "net-speed",
        isWindows: false,
    });

    assert.equal(storedSettings.metric.networkDirection, "download");
    assert.deepEqual(storedSettings.appearanceOverrides, {});
    assert.deepEqual(storedSettings.networkOverrides, {});
    assert.deepEqual(storedSettings.diskThroughputOverrides, {});
});

test("resolver cascades domain defaults, metric defaults, and widget overrides", () => {
    const globalSettings = normalizePluginGlobalSettings({
        appearanceDefaults: {
            graphicType: "linear",
            solidColor: "#111111",
        },
        networkDefaults: {
            networkUnitBase: "bit",
            maximumDownloadSpeedMbps: 250,
        },
    });
    const storedSettings = normalizeWidgetStoredSettings({
        appearanceOverrides: {
            solidColor: "#222222",
        },
        networkOverrides: {
            maximumUploadSpeedMbps: 50,
        },
    }, {
        actionKind: "net-speed",
        isWindows: false,
    });

    const resolvedSettings = resolveWidgetSettings({
        actionKind: "net-speed",
        isWindows: false,
        storedSettings,
        globalSettings,
    });

    assert.equal(resolvedSettings.appearance.graphicType, "circular");
    assert.equal(resolvedSettings.appearance.solidColor, "#222222");
    assert.equal(resolvedSettings.network.networkUnitBase, "bit");
    assert.equal(resolvedSettings.network.maximumDownloadSpeedMbps, 250);
    assert.equal(resolvedSettings.network.maximumUploadSpeedMbps, 50);
});

test("global appearance settings affect widgets only when override is enabled", () => {
    const storedSettings = normalizeWidgetStoredSettings({}, {
        actionKind: "cpu-usage",
        isWindows: false,
    });
    const globalSettings = normalizePluginGlobalSettings({
        appearanceDefaults: {
            graphicType: "linear",
            solidColor: "#111111",
        },
    });

    const resolvedSettings = resolveWidgetSettings({
        actionKind: "cpu-usage",
        isWindows: false,
        storedSettings,
        globalSettings,
    });

    assert.equal(resolvedSettings.appearance.graphicType, "circular");
    assert.equal(resolvedSettings.appearance.solidColor, "#3b82f6");
});

test("global appearance override wins without mutating widget overrides", () => {
    const storedSettings = normalizeWidgetStoredSettings({
        appearanceOverrides: {
            graphicType: "linear",
            solidColor: "#222222",
        },
    }, {
        actionKind: "cpu-usage",
        isWindows: false,
    });
    const globalSettings = normalizePluginGlobalSettings({
        overrideWidgetAppearance: true,
        appearanceDefaults: {
            graphicType: "circular",
            circleStyle: "gauge",
            solidColor: "#93c5fd",
        },
    });

    const resolvedSettings = resolveWidgetSettings({
        actionKind: "cpu-usage",
        isWindows: false,
        storedSettings,
        globalSettings,
    });

    assert.equal(resolvedSettings.appearance.graphicType, "circular");
    assert.equal(resolvedSettings.appearance.circleStyle, "gauge");
    assert.equal(resolvedSettings.appearance.solidColor, "#93c5fd");
    assert.equal(storedSettings.appearanceOverrides.graphicType, "linear");
    assert.equal(storedSettings.appearanceOverrides.solidColor, "#222222");
});

test("runtime cache participates only in auto scale resolution", () => {
    const globalSettings = normalizePluginGlobalSettings({
        networkDefaults: {
            networkScaleMode: "auto",
            maximumDownloadSpeedMbps: 100,
        },
    });
    const autoStoredSettings = normalizeWidgetStoredSettings({
        runtimeCache: {
            learnedMaximumDownloadSpeedMbps: 800,
        },
    }, {
        actionKind: "net-speed",
        isWindows: false,
    });
    const customStoredSettings = normalizeWidgetStoredSettings({
        networkOverrides: {
            networkScaleMode: "custom",
            maximumDownloadSpeedMbps: 300,
        },
        runtimeCache: {
            learnedMaximumDownloadSpeedMbps: 800,
        },
    }, {
        actionKind: "net-speed",
        isWindows: false,
    });

    assert.equal(resolveWidgetSettings({
        actionKind: "net-speed",
        isWindows: false,
        storedSettings: autoStoredSettings,
        globalSettings,
    }).network.maximumDownloadSpeedMbps, 800);
    assert.equal(resolveWidgetSettings({
        actionKind: "net-speed",
        isWindows: false,
        storedSettings: customStoredSettings,
        globalSettings,
    }).network.maximumDownloadSpeedMbps, 300);
});

test("disk usage stored settings default to slow polling", () => {
    const storedSettings = normalizeWidgetStoredSettings({
        metric: {
            diskMetricKind: "usage",
        },
    }, {
        actionKind: "disk",
        isWindows: false,
    });

    assert.equal(storedSettings.local.pollingFrequencySeconds, 60);
});

test("disk throughput stored settings default to fast polling", () => {
    const storedSettings = normalizeWidgetStoredSettings({
        metric: {
            diskMetricKind: "throughput",
        },
    }, {
        actionKind: "disk",
        isWindows: false,
    });

    assert.equal(storedSettings.local.pollingFrequencySeconds, 1);
});

test("Windows normalizes disk throughput metric identity back to usage", () => {
    const storedSettings = normalizeWidgetStoredSettings({
        metric: {
            diskMetricKind: "throughput",
        },
    }, {
        actionKind: "disk",
        isWindows: true,
    });
    const resolvedSettings = resolveWidgetSettings({
        actionKind: "disk",
        isWindows: true,
        storedSettings,
        globalSettings: defaultPluginGlobalSettings,
    });

    assert.equal(storedSettings.metric.diskMetricKind, "usage");
    assert.equal(resolvedSettings.metric.diskMetricKind, "usage");
});
