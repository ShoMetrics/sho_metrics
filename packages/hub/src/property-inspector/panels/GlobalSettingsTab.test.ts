import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MetricTheme, ResolvedGlobalSettings } from "../../settings/resolved-settings";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import { DEFAULT_APPEARANCE_SETTINGS } from "../../settings/default-appearance-settings";
import { GlobalSettingsTab } from "./GlobalSettingsTab";

test("global override groups view theme and color controls under the master switch", () => {
    const markup = renderToStaticMarkup(createElement(GlobalSettingsTab, {
        resolvedSettings: buildGlobalSettings(),
        colorCompensationProfile: DEFAULT_COLOR_COMPENSATION_PROFILE,
        onSettingsPatch: () => undefined,
        onOpenColorCompensation: () => undefined,
    }));

    assert.match(markup, /Global override/);
    assert.match(markup, /View Override/);
    assert.match(markup, /Override view/);
    assert.match(markup, /Theme Override/);
    assert.match(markup, /Override theme/);
    assert.match(markup, /Color Override/);
    assert.match(markup, /Override color/);
    assert.doesNotMatch(markup, /Global Color Mode:/);
    assert.match(markup, /Color Mode:/);
    assert.match(markup, /Range Colors/);
    assert.match(markup, /Low Ends At:/);
    assert.match(markup, /High Starts At:/);
    assert.match(markup, /Low Color:/);
    assert.match(markup, /Medium Color:/);
    assert.match(markup, /High Color:/);
    assert.doesNotMatch(markup, /Tint/);
    assert.match(markup, /Advanced/);
    assert.match(markup, /Color Compensation/);
});

test("global override renders terminal palette controls for terminal theme", () => {
    const markup = renderToStaticMarkup(createElement(GlobalSettingsTab, {
        resolvedSettings: buildGlobalSettings("terminal"),
        colorCompensationProfile: DEFAULT_COLOR_COMPENSATION_PROFILE,
        onSettingsPatch: () => undefined,
        onOpenColorCompensation: () => undefined,
    }));

    assert.match(markup, /Terminal/);
    assert.match(markup, /Theme Variant:/);
    assert.match(markup, /Clean/);
    assert.match(markup, /Vintage/);
    assert.match(markup, /Color Override/);
    assert.match(markup, /Phosphor:/);
    assert.match(markup, /Green/);
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
        viewOverride: {
            view: {
                selectedView: "circle",
                circleVariant: "full-ring",
            },
        },
        themeOverride: {
            theme: {
                ...DEFAULT_APPEARANCE_SETTINGS.theme,
                selectedTheme,
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
            terminal: {
                preset: "green",
            },
        },
        sourceProfiles: [],
        defaultSourceProfileId: undefined,
    };
}
