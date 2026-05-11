import assert from "node:assert/strict";
import test from "node:test";
import type { GlobalSettings, WidgetStoredSettings } from "./widget-settings";
import { resolveGlobalSettings, resolveWidgetSettings } from "./resolver";

test("stored widget settings stay sparse and do not expand globalizable fields", () => {
    const storedSettings: WidgetStoredSettings = {
        metric: {
            networkDirection: "download",
        },
    };

    assert.deepEqual(storedSettings, {
        metric: {
            networkDirection: "download",
        },
    });
});

test("resolver cascades domain defaults, metric defaults, and widget overrides", () => {
    const globalSettings: GlobalSettings = {
        appearanceDefaults: {
            graphicType: "linear",
            usageColors: {
                solidColor: "#111111",
            },
        },
        networkDefaults: {
            networkUnitBase: "bit",
            maximumDownloadSpeedMbps: 250,
        },
    };
    const storedSettings: WidgetStoredSettings = {
        appearanceOverrides: {
            usageColors: {
                solidColor: "#222222",
            },
        },
        networkOverrides: {
            maximumUploadSpeedMbps: 50,
        },
    };

    const resolvedSettings = resolveWidgetSettings({
        storedSettings,
        globalSettings,
        context: {
            actionKind: "net-speed",
            isWindows: false,
        },
    });

    assert.equal(resolvedSettings.appearance.graphicType, "circular");
    assert.equal(resolvedSettings.appearance.usageColors.solidColor, "#222222");
    assert.equal(resolvedSettings.network.networkUnitBase, "bit");
    assert.equal(resolvedSettings.network.maximumDownloadSpeedMbps, 250);
    assert.equal(resolvedSettings.network.maximumUploadSpeedMbps, 50);
});

test("global appearance settings affect widgets only when override is enabled", () => {
    const storedSettings: WidgetStoredSettings = {};
    const globalSettings: GlobalSettings = {
        appearanceDefaults: {
            graphicType: "linear",
            usageColors: {
                solidColor: "#111111",
            },
        },
    };

    const resolvedSettings = resolveWidgetSettings({
        storedSettings,
        globalSettings,
        context: {
            actionKind: "cpu-usage",
            isWindows: false,
        },
    });

    assert.equal(resolvedSettings.appearance.graphicType, "circular");
    assert.equal(resolvedSettings.appearance.usageColors.solidColor, "#3b82f6");
});

test("global appearance override wins without mutating widget overrides", () => {
    const storedSettings: WidgetStoredSettings = {
        appearanceOverrides: {
            graphicType: "linear",
            usageColors: {
                solidColor: "#222222",
            },
        },
    };
    const globalSettings: GlobalSettings = {
        overrideWidgetAppearance: true,
        appearanceDefaults: {
            graphicType: "circular",
            circleStyle: "gauge",
            usageColors: {
                solidColor: "#93c5fd",
            },
        },
    };

    const resolvedSettings = resolveWidgetSettings({
        storedSettings,
        globalSettings,
        context: {
            actionKind: "cpu-usage",
            isWindows: false,
        },
    });

    assert.equal(resolvedSettings.appearance.graphicType, "circular");
    assert.equal(resolvedSettings.appearance.circleStyle, "gauge");
    assert.equal(resolvedSettings.appearance.usageColors.solidColor, "#93c5fd");
    assert.equal(storedSettings.appearanceOverrides?.graphicType, "linear");
    assert.equal(storedSettings.appearanceOverrides?.usageColors?.solidColor, "#222222");
});

test("runtime cache participates only in auto scale resolution", () => {
    const globalSettings: GlobalSettings = {
        networkDefaults: {
            networkScaleMode: "auto",
            maximumDownloadSpeedMbps: 100,
        },
    };
    const autoStoredSettings: WidgetStoredSettings = {
        runtimeCache: {
            learnedMaximumDownloadSpeedMbps: 800,
        },
    };
    const customStoredSettings: WidgetStoredSettings = {
        networkOverrides: {
            networkScaleMode: "custom",
            maximumDownloadSpeedMbps: 300,
        },
        runtimeCache: {
            learnedMaximumDownloadSpeedMbps: 800,
        },
    };

    const autoResolvedSettings = resolveWidgetSettings({
        storedSettings: autoStoredSettings,
        globalSettings,
        context: {
            actionKind: "net-speed",
            isWindows: false,
        },
    });
    const customResolvedSettings = resolveWidgetSettings({
        storedSettings: customStoredSettings,
        globalSettings,
        context: {
            actionKind: "net-speed",
            isWindows: false,
        },
    });

    assert.equal(autoResolvedSettings.network.maximumDownloadSpeedMbps, 800);
    assert.equal(customResolvedSettings.network.maximumDownloadSpeedMbps, 300);
});

test("disk usage resolved settings default to slow polling", () => {
    const storedSettings: WidgetStoredSettings = {
        metric: {
            diskMetricKind: "usage",
        },
    };
    const resolvedSettings = resolveWidgetSettings({
        storedSettings,
        globalSettings: {},
        context: {
            actionKind: "disk",
            isWindows: false,
        },
    });

    assert.equal(storedSettings.local, undefined);
    assert.equal(resolvedSettings.local.pollingFrequencySeconds, 60);
});

test("disk throughput resolved settings default to fast polling", () => {
    const storedSettings: WidgetStoredSettings = {
        metric: {
            diskMetricKind: "throughput",
        },
    };
    const resolvedSettings = resolveWidgetSettings({
        storedSettings,
        globalSettings: {},
        context: {
            actionKind: "disk",
            isWindows: false,
        },
    });

    assert.equal(storedSettings.local, undefined);
    assert.equal(resolvedSettings.local.pollingFrequencySeconds, 1);
});

test("Windows resolves disk throughput metric identity back to usage", () => {
    const storedSettings: WidgetStoredSettings = {
        metric: {
            diskMetricKind: "throughput",
        },
    };
    const resolvedSettings = resolveWidgetSettings({
        storedSettings,
        globalSettings: {},
        context: {
            actionKind: "disk",
            isWindows: true,
        },
    });

    assert.equal(storedSettings.metric?.diskMetricKind, "throughput");
    assert.equal(resolvedSettings.metric.diskMetricKind, "usage");
});

test("global settings resolve sparse storage into complete runtime defaults", () => {
    const resolvedSettings = resolveGlobalSettings({
        appearanceDefaults: {
            graphicType: "linear",
            usageColors: {
                solidColor: "#111111",
            },
        },
        networkDefaults: {
            networkUnitBase: "bit",
        },
    });

    assert.equal(resolvedSettings.overrideWidgetAppearance, false);
    assert.equal(resolvedSettings.appearanceDefaults.graphicType, "linear");
    assert.equal(resolvedSettings.appearanceDefaults.colorMode, "solid");
    assert.equal(resolvedSettings.appearanceDefaults.usageColors.solidColor, "#111111");
    assert.equal(resolvedSettings.appearanceDefaults.usageColors.lowColor, "#22c55e");
    assert.equal(resolvedSettings.networkDefaults.networkUnitBase, "bit");
    assert.equal(resolvedSettings.networkDefaults.networkScaleMode, "auto");
});
