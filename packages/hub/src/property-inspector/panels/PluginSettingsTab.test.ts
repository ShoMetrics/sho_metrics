import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ResolvedGlobalSettings } from "../../settings/resolved-settings";
import { PluginSettingsTab } from "./PluginSettingsTab";

test("plugin appearance override uses the same dynamic color controls as widget settings", () => {
    const markup = renderToStaticMarkup(createElement(PluginSettingsTab, {
        resolvedSettings: buildGlobalSettings(),
        onSettingsPatch: () => undefined,
    }));

    assert.match(markup, /Override appearance/);
    assert.match(markup, /Color Mode:/);
    assert.match(markup, /Low Ends At:/);
    assert.match(markup, /High Starts At:/);
    assert.match(markup, /Low Color:/);
    assert.match(markup, /Medium Color:/);
    assert.match(markup, /High Color:/);
    assert.doesNotMatch(markup, /Tint/);
});

function buildGlobalSettings(): ResolvedGlobalSettings {
    return {
        defaults: {
            network: {
                scaleMode: "auto",
                maximumDownloadSpeedMegabitsPerSecond: undefined,
                maximumUploadSpeedMegabitsPerSecond: undefined,
                unitBase: "byte",
            },
            diskThroughput: {
                scaleMode: "auto",
                maximumReadThroughputMebibytesPerSecond: undefined,
                maximumWriteThroughputMebibytesPerSecond: undefined,
            },
        },
        appearanceOverride: {
            viewLayout: "circular",
            circleStyle: "value",
            theme: "flat",
            colors: {
                solidColor: "#3b82f6",
                lowColor: "#22c55e",
                mediumColor: "#eab308",
                highColor: "#ef4444",
            },
            colorMode: "threshold",
            lowColorThresholdPercent: 30,
            highColorThresholdPercent: 70,
        },
        sourceProfiles: [],
        defaultSourceProfileId: undefined,
    };
}
