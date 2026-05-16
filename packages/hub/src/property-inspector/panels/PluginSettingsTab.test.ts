import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MetricTheme, ResolvedGlobalSettings } from "../../settings/resolved-settings";
import { PluginSettingsTab } from "./PluginSettingsTab";

test("plugin global override groups graph theme and color controls under the master switch", () => {
    const markup = renderToStaticMarkup(createElement(PluginSettingsTab, {
        resolvedSettings: buildGlobalSettings(),
        onSettingsPatch: () => undefined,
    }));

    assert.match(markup, /Global override/);
    assert.match(markup, /Graph Override/);
    assert.match(markup, /Override graph/);
    assert.match(markup, /Theme Override/);
    assert.match(markup, /Override theme/);
    assert.match(markup, /Color Override/);
    assert.match(markup, /Override color/);
    assert.doesNotMatch(markup, /Global Color Mode:/);
    assert.match(markup, /Black &amp; White/);
    assert.match(markup, /Color Mode:/);
    assert.match(markup, /Low Ends At:/);
    assert.match(markup, /High Starts At:/);
    assert.match(markup, /Low Color:/);
    assert.match(markup, /Medium Color:/);
    assert.match(markup, /High Color:/);
    assert.doesNotMatch(markup, /Tint/);
});

test("plugin global override hides color controls for terminal theme", () => {
    const markup = renderToStaticMarkup(createElement(PluginSettingsTab, {
        resolvedSettings: buildGlobalSettings("terminal"),
        onSettingsPatch: () => undefined,
    }));

    assert.match(markup, /Terminal/);
    assert.match(markup, /Theme Variant:/);
    assert.match(markup, /Clean/);
    assert.match(markup, /Vintage/);
    assert.doesNotMatch(markup, /Color Override/);
    assert.doesNotMatch(markup, /Color Mode:/);
});

function buildGlobalSettings(selectedTheme: MetricTheme = "flat"): ResolvedGlobalSettings {
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
        graphOverride: {
            graph: {
                viewLayout: "circular",
                circleStyle: "value",
            },
        },
        themeOverride: {
            theme: {
                selectedTheme,
                terminal: {
                    variant: "clean",
                },
            },
        },
        paintOverride: {
            metric: {
                colorMode: "multi-color",
                solid: {
                    color: "#3b82f6",
                    isGradientEnabled: true,
                },
                multiColor: {
                    colors: {
                        lowColor: "#22c55e",
                        mediumColor: "#eab308",
                        highColor: "#ef4444",
                    },
                    lowThresholdPercent: 30,
                    highThresholdPercent: 70,
                    isGradientEnabled: true,
                },
            },
            colorFilled: {
                colorMode: "multi-color",
                solid: {
                    color: "#3b82f6",
                    isGradientEnabled: true,
                },
                multiColor: {
                    colors: {
                        lowColor: "#22c55e",
                        mediumColor: "#eab308",
                        highColor: "#ef4444",
                    },
                    isGradientEnabled: true,
                },
            },
        },
        sourceProfiles: [],
        defaultSourceProfileId: undefined,
    };
}
