import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MetricTheme, MetricView, ResolvedGlobalSettings } from "../../settings/resolved-settings";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import {
    DEFAULT_APPEARANCE_SETTINGS,
    DEFAULT_GLOBAL_TRANSPARENT_SURFACE_SETTINGS,
} from "../../settings/default-appearance-settings";
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
    assert.match(markup, /Transparent Surface Override/);
    assert.match(markup, /Override transparent surface/);
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

test("global override renders transparent surface controls when its subsection is enabled", () => {
    const markup = renderToStaticMarkup(createElement(GlobalSettingsTab, {
        resolvedSettings: {
            ...buildGlobalSettings(),
            transparentSurfaceOverride: {
                transparentSurface: DEFAULT_GLOBAL_TRANSPARENT_SURFACE_SETTINGS,
            },
        },
        colorCompensationProfile: DEFAULT_COLOR_COMPENSATION_PROFILE,
        onSettingsPatch: () => undefined,
        onOpenColorCompensation: () => undefined,
    }));

    assert.match(markup, /Transparent Surface Override/);
    assert.doesNotMatch(markup, /Transparent background/);
    assert.match(markup, /Background Opacity:/);
    assert.match(markup, /Text Outline:/);
    assert.match(markup, /Shape Outline:/);
    assert.doesNotMatch(markup, /saved per theme/);
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
    assert.match(markup, /custom-select-preview/);
    assert.match(markup, /Color Override/);
    assert.match(markup, /Phosphor:/);
    assert.match(markup, /Green/);
    assert.doesNotMatch(markup, /Color Mode:/);
});

test("global override hides ordinary color controls for pixel window theme", () => {
    const markup = renderToStaticMarkup(createElement(GlobalSettingsTab, {
        resolvedSettings: buildGlobalSettings("pixel-window"),
        colorCompensationProfile: DEFAULT_COLOR_COMPENSATION_PROFILE,
        onSettingsPatch: () => undefined,
        onOpenColorCompensation: () => undefined,
    }));

    assert.match(markup, /Pixel Window/);
    assert.match(markup, /Color Override/);
    assert.doesNotMatch(markup, /Theme Variant:/);
    assert.doesNotMatch(markup, /Color Mode:/);
    assert.doesNotMatch(markup, /Phosphor:/);
});

test("global override renders text view variant controls for text view", () => {
    const markup = renderToStaticMarkup(createElement(GlobalSettingsTab, {
        resolvedSettings: buildGlobalSettings("flat", "text"),
        colorCompensationProfile: DEFAULT_COLOR_COMPENSATION_PROFILE,
        onSettingsPatch: () => undefined,
        onOpenColorCompensation: () => undefined,
    }));

    assert.match(markup, /View Variant:/);
    assert.match(markup, /Centered/);
    assert.match(markup, /custom-select-preview/);
    assert.doesNotMatch(markup, /Full Ring/);
});

test("global override hides view variant controls for views without variants", () => {
    const markup = renderToStaticMarkup(createElement(GlobalSettingsTab, {
        resolvedSettings: buildGlobalSettings("flat", "bar"),
        colorCompensationProfile: DEFAULT_COLOR_COMPENSATION_PROFILE,
        onSettingsPatch: () => undefined,
        onOpenColorCompensation: () => undefined,
    }));

    assert.match(markup, previewOptionLabelPattern("Bar"));
    assert.doesNotMatch(markup, /View Variant:/);
    assert.doesNotMatch(markup, /Full Ring/);
    assert.doesNotMatch(markup, /Centered/);
});

function previewOptionLabelPattern(text: string): RegExp {
    return new RegExp(`<span class="preview-option-label">${text}</span>`);
}

function buildGlobalSettings(selectedTheme: MetricTheme = "flat", selectedView: MetricView = "circle"): ResolvedGlobalSettings {
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
                selectedView,
                circleVariant: "full-ring",
                textVariant: "centered",
            },
        },
        themeOverride: {
            theme: {
                ...DEFAULT_APPEARANCE_SETTINGS.theme,
                selectedTheme,
            },
        },
        transparentSurfaceOverride: undefined,
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
        customHttpCredentials: [],
        system: {
            experimentalVendorHidBatteryEnabled: true,
        },
    };
}
