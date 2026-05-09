import assert from "node:assert/strict";
import test from "node:test";
import { updateWidgetAppearance, updateWidgetRuntimeCache } from "./updates";
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
            solidColor: "#123456",
        },
        networkOverrides: {
            networkUnitBase: "bit",
        },
    };

    const nextSettings = updateWidgetRuntimeCache(settings, {
        availableNetworkInterfaces: "[{\"id\":\"eth0\"}]",
        learnedMaximumDownloadSpeedMbps: 900,
    });

    assert.deepEqual(nextSettings.metric, settings.metric);
    assert.deepEqual(nextSettings.local, settings.local);
    assert.deepEqual(nextSettings.appearanceOverrides, settings.appearanceOverrides);
    assert.deepEqual(nextSettings.networkOverrides, settings.networkOverrides);
    assert.deepEqual(nextSettings.runtimeCache, {
        availableNetworkInterfaces: "[{\"id\":\"eth0\"}]",
        learnedMaximumDownloadSpeedMbps: 900,
    });
});

test("updating appearance writes sparse overrides only", () => {
    const nextSettings = updateWidgetAppearance({}, {
        solidColor: "#123456",
    });

    assert.deepEqual(nextSettings, {
        appearanceOverrides: {
            solidColor: "#123456",
        },
    });
});
