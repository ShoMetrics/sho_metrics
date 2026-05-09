import assert from "node:assert/strict";
import test from "node:test";
import { updateWidgetRuntimeCache, updateWidgetSettingsBranch } from "./updates";
import type { WidgetSettings } from "./model";

test("updating runtime state preserves user preferences and overrides", () => {
    const settings: WidgetSettings = {
        metric: {
            networkDirection: "download",
        },
        local: {
            networkTrafficDisplayMode: "overlay",
        },
        appearanceOverrides: {
            usageColors: {
                solidColor: "#123456",
            },
        },
        networkOverrides: {
            networkUnitBase: "bit",
        },
    };

    const nextSettings = updateWidgetRuntimeCache(settings, {
        availableNetworkInterfaces: [{
            id: "eth0",
            name: "Ethernet",
            type: "wired",
            isDefault: true,
            speedMegabitsPerSecond: 1000,
        }],
        learnedMaximumDownloadSpeedMbps: 900,
    });

    assert.deepEqual(nextSettings.metric, settings.metric);
    assert.deepEqual(nextSettings.local, settings.local);
    assert.deepEqual(nextSettings.appearanceOverrides, settings.appearanceOverrides);
    assert.deepEqual(nextSettings.networkOverrides, settings.networkOverrides);
    assert.deepEqual(nextSettings.runtimeCache, {
        availableNetworkInterfaces: [{
            id: "eth0",
            name: "Ethernet",
            type: "wired",
            isDefault: true,
            speedMegabitsPerSecond: 1000,
        }],
        learnedMaximumDownloadSpeedMbps: 900,
    });
});

test("updating appearance writes sparse overrides only", () => {
    const nextSettings = updateWidgetSettingsBranch({}, "appearanceOverrides", {
        usageColors: {
            solidColor: "#123456",
        },
    });

    assert.deepEqual(nextSettings, {
        appearanceOverrides: {
            usageColors: {
                solidColor: "#123456",
            },
        },
    });
});
