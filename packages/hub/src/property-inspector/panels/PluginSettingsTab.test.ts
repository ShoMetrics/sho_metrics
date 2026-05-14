import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ResolvedGlobalSettings } from "../../settings/resolved-settings";
import { PluginSettingsTab } from "./PluginSettingsTab";

test("plugin global override groups layout style and color controls under the master switch", () => {
    const markup = renderToStaticMarkup(createElement(PluginSettingsTab, {
        resolvedSettings: buildGlobalSettings(),
        onSettingsPatch: () => undefined,
    }));

    assert.match(markup, /Global override/);
    assert.match(markup, /Layout &amp; Style Override/);
    assert.match(markup, /Override layout and style/);
    assert.match(markup, /Color Override/);
    assert.match(markup, /Override color/);
    assert.doesNotMatch(markup, /Global Color Mode:/);
    assert.match(markup, /B&amp;W/);
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
        globalOverrideEnabled: true,
        layoutStyleOverride: {
            viewLayout: "circular",
            circleStyle: "value",
            theme: "flat",
        },
        colorOverride: {
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
