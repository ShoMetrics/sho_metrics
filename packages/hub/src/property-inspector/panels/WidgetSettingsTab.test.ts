import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionKind } from "../inspector/settings-types";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../settings/storage/widget-settings-patch";
import type { WidgetRuntimeCachePatch } from "../../runtime/widget-runtime-cache";
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";
import { WidgetSettingsTab } from "./WidgetSettingsTab";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import {
    BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../../runtime/sources/source-ids";

test("disk usage bar view settings render label controls without usage-mode controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "bar" },
            },
            disk: {
                kind: "usage",
            },
        }),
    });

    assert.match(markup, /Volume:/);
    assert.match(markup, /Custom Label:/);
    assert.match(markup, /Detected Label/);
    assert.doesNotMatch(markup, /Usage Display:/);
});

test("disk usage circle view settings render usage display controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "circle" },
            },
            disk: {
                kind: "usage",
            },
        }),
    });

    assert.match(markup, /Usage Display:/);
    assert.doesNotMatch(markup, /Custom Label:/);
});

test("disk usage settings preserve selected unavailable volume", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            disk: {
                kind: "usage",
                volumeId: "E:\\",
            },
        }),
    });

    assert.match(markup, /E: \(Unavailable\)/);
});

test("windows disk settings use usage controls when throughput is unavailable", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        isWindows: true,
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "bar" },
            },
            disk: {
                kind: "throughput",
            },
        }),
    });

    assert.match(markup, /Disk Metric:/);
    assert.doesNotMatch(markup, /Direction:/);
    assert.doesNotMatch(markup, /Read Max/);
    assert.doesNotMatch(markup, /Write Max/);
});

test("network dual-channel settings render channel colors instead of usage colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            network: {
                direction: "both",
            },
        }),
    });

    assert.match(markup, /Color - Upload/);
    assert.match(markup, /Color - Download/);
    assertTextOrder(markup, "Color - Upload", "Color - Download");
});

test("network black-white dual-channel settings hide channel colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: { flat: { paint: { colorMode: "black-white" } } },
            },
            network: {
                direction: "both",
            },
        }),
    });

    assert.match(markup, /Color Mode:/);
    assert.doesNotMatch(markup, /Color - Download/);
    assert.doesNotMatch(markup, /Color - Upload/);
});

test("network settings render from empty quick-start settings", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
    });

    assert.match(markup, /Network Metric/);
    assert.match(markup, /Network Interface/);
    assert.match(markup, /Color - Upload/);
    assert.match(markup, /Color - Download/);
    assertTextOrder(markup, "Color - Upload", "Color - Download");
});

test("network single-channel settings render standard usage colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            network: {
                direction: "download",
            },
        }),
    });

    assert.match(markup, /Solid Color:/);
    assert.doesNotMatch(markup, /Color - Download/);
    assert.doesNotMatch(markup, /Color - Upload/);
});

test("color filled theme renders color mix without range controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: {
                    selectedTheme: "color-filled",
                    colorFilled: {
                        paint: { colorMode: "multi-color" },
                    },
                },
            },
            network: {
                direction: "download",
            },
        }),
    });

    assert.match(markup, /Color Filled/);
    assert.match(markup, /Color Mix/);
    assert.match(markup, /Left Color:/);
    assert.match(markup, /Right Color:/);
    assert.match(markup, /Bottom Color:/);
    assert.doesNotMatch(markup, /Low Ends At:/);
    assert.doesNotMatch(markup, /High Starts At:/);
});

test("terminal theme renders palette controls without metric color controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: { selectedTheme: "terminal" },
            },
            network: {
                direction: "both",
            },
        }),
    });

    assert.match(markup, /Terminal/);
    assert.match(markup, /Theme Variant:/);
    assert.match(markup, /Clean/);
    assert.match(markup, /Vintage/);
    assert.match(markup, /Phosphor:/);
    assert.match(markup, /Green/);
    assert.doesNotMatch(markup, /Color Mode:/);
    assert.doesNotMatch(markup, /Color - Download/);
    assert.doesNotMatch(markup, /Color - Upload/);
});

test("network mirrored trend disables grid controls in the panel", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                view: { selectedView: "line" },
            },
            network: {
                direction: "both",
                trafficDisplayMode: "mirrored",
            },
        }),
    });

    assert.match(markup, /Traffic Mode:/);
    assert.match(markup, /Grid Line Visibility:/);
    assert.match(markup, /Grid Line Type:/);
    assert.match(markup, /Grid line settings are not supported/);
});

test("disk throughput bar view settings use standard colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "bar" },
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            disk: {
                kind: "throughput",
                throughputDirection: "both",
            },
        }),
    });

    assert.match(markup, /Solid Color:/);
    assert.doesNotMatch(markup, sectionHeadingPattern("Read"));
    assert.doesNotMatch(markup, sectionHeadingPattern("Write"));
});

test("disk throughput dual-channel settings render read/write colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "circle" },
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            disk: {
                kind: "throughput",
                throughputDirection: "both",
            },
        }),
    });

    assert.match(markup, sectionHeadingPattern("Read"));
    assert.match(markup, sectionHeadingPattern("Write"));
});

test("GPU settings panel renders from the GPU domain action", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
    });

    assert.match(markup, /GPU Metric:/);
    assert.match(markup, /Polling Frequency/);
});

test("windows CPU settings panel renders helper-owned metric options", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: true,
    });

    assert.match(markup, /CPU Metric:/);
    assert.match(markup, /Usage/);
    assert.doesNotMatch(markup, /Source: Helper only/);
});

test("windows CPU temperature settings render helper-only source text and temperature scale", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: true,
        settings: buildWidgetSettings("cpu", {
            cpu: {
                kind: "temperature",
                temperatureUnit: "fahrenheit",
                maximumTemperatureCelsius: 95,
            },
        }),
    });

    assert.match(markup, /Source: Helper only/);
    assert.match(markup, /Unit:/);
    assert.match(markup, /Max Temp \(C\):/);
    assert.doesNotMatch(markup, /Max Power/);
    assert.doesNotMatch(markup, /Source:<\/label>/);
});

test("windows CPU power settings render helper-only source text and power scale", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: true,
        settings: buildWidgetSettings("cpu", {
            cpu: {
                kind: "power",
                maximumPowerWatts: 180,
            },
        }),
    });

    assert.match(markup, /Source: Helper only/);
    assert.match(markup, /Max Power \(W\):/);
    assert.doesNotMatch(markup, /Max Temp/);
});

test("non-windows CPU settings hide helper-owned metric options", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: false,
    });

    assert.match(markup, /CPU Metric:/);
    assert.match(markup, /Usage/);
    assert.doesNotMatch(markup, /Temperature/);
    assert.doesNotMatch(markup, /Power/);
    assert.doesNotMatch(markup, /Source: Helper only/);
});

test("windows GPU settings panel renders source preference controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: true,
    });

    assert.match(markup, /Source:/);
    assert.match(markup, /Auto \(Recommended\)/);
});

test("windows GPU settings panel reflects helper source preference", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: true,
        settings: buildWidgetSettings("gpu", {
            source: {
                primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
                fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
                failureMode: "useFallback",
            },
        }),
    });

    assert.match(markup, /Source:/);
    assert.match(markup, /Prefer Helper/);
});

test("non-windows GPU settings panel hides source preference controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: false,
    });

    assert.doesNotMatch(markup, /Source:/);
    assert.doesNotMatch(markup, /nvidia-smi/);
});

test("GPU source preference control preserves custom source selections", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: true,
        settings: buildWidgetSettings("gpu", {
            source: {
                primarySourceProfileId: "source-profile:gpu-lab",
                fallbackSourceProfileIds: [],
                failureMode: "showUnavailable",
            },
        }),
    });

    assert.match(markup, /Custom Source/);
});

test("widget advanced controls render current metric source attribution", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "cpu.usage_percent",
                preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                selectedSourceId: NODE_SYSTEM_SOURCE_ID,
                sampleTimestampMilliseconds: Date.now(),
            },
        },
    });

    assert.match(markup, /Current source: Built-in/);
    assert.match(markup, /Preferred source: Built-in/);
    assert.match(markup, /Last sample age:/);
});

test("widget advanced controls report fallback source attribution", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "gpu.temp",
                preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
                selectedSourceId: NODE_SYSTEM_SOURCE_ID,
                sampleTimestampMilliseconds: Date.now(),
            },
        },
    });

    assert.match(markup, /Current source: Built-in \(nvidia-smi\)/);
    assert.match(markup, /Preferred source: Helper/);
    assert.match(markup, /Using fallback; preferred source has no fresh data/);
});

test("widget advanced controls report helper source status", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "cpu.temp",
                preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
                preferredSourceStatus: {
                    state: "unavailable",
                    reason: "pipeMissing",
                },
                selectedSourceId: undefined,
                sampleTimestampMilliseconds: undefined,
            },
        },
    });

    assert.match(markup, /Current source: No fresh source/);
    assert.match(markup, /Preferred source: Helper/);
    assert.match(markup, /Helper status: Required/);
});

test("domain action does not render a mismatched stored target panel", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        settings: buildWidgetSettings("cpu", {}),
    });

    assert.match(markup, /Stored metric settings do not match this action/);
    assert.doesNotMatch(markup, /GPU Metric:/);
});

test("widget settings waits for action kind before rendering recovery UI", () => {
    const markup = renderWidgetSettings({
        actionKind: "unknown",
    });

    assert.equal(markup, "");
});

test("widget settings renders widget controls before global settings load", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalViewOverrideEnabled: false,
        isGlobalThemeOverrideEnabled: false,
        isGlobalPaintOverrideEnabled: false,
    });

    assert.match(markup, /GPU Metric:/);
    assert.doesNotMatch(markup, /Some settings are disabled/);
});

test("widget settings renders mismatch recovery before global settings load", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalViewOverrideEnabled: false,
        isGlobalThemeOverrideEnabled: false,
        isGlobalPaintOverrideEnabled: false,
        settings: buildWidgetSettings("cpu", {}),
    });

    assert.match(markup, /Stored metric settings do not match this action/);
    assert.doesNotMatch(markup, /Some settings are disabled/);
});

test("widget settings renders normally after global settings load without override", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalViewOverrideEnabled: false,
        isGlobalThemeOverrideEnabled: false,
        isGlobalPaintOverrideEnabled: false,
    });

    assert.match(markup, /GPU Metric:/);
    assert.doesNotMatch(markup, /Some settings are disabled/);
});

test("widget settings keep warnings first and reset in advanced controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalViewOverrideEnabled: true,
    });

    assertTextOrder(markup, "Some settings are disabled", "GPU Metric:");
    assertTextOrder(markup, "GPU Metric:", "Appearance");
    assertTextOrder(markup, "Polling Frequency", "Advanced");
    assertTextOrder(markup, "Advanced", "Color Compensation");
    assertTextOrder(markup, "Color Compensation", "Reset Widget Settings");
    assertTextOrder(markup, "Advanced", "Reset Widget Settings");
    assertTextOrder(markup, "Reset Widget Settings", "DEBUG");
    assertTextOrder(markup, "DEBUG", "Show debug");
});

test("widget view controls keep view before theme order", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        settings: buildWidgetSettings("gpu", {
            appearance: {
                view: { selectedView: "circle" },
                theme: { selectedTheme: "terminal" },
            },
        }),
    });

    assertTextOrder(markup, "View:", "View Variant:");
    assertTextOrder(markup, "View Variant:", "Theme:");
    assertTextOrder(markup, "Theme:", "Theme Variant:");
    assert.match(markup, /Theme Variant:/);
});

test("widget text view renders text variant controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        settings: buildWidgetSettings("gpu", {
            appearance: {
                view: { selectedView: "text" },
            },
        }),
    });

    assertTextOrder(markup, "View:", "View Variant:");
    assertTextOrder(markup, "View Variant:", "Theme:");
    assert.match(markup, /Centered/);
    assert.match(markup, /Title Card/);
    assert.doesNotMatch(markup, /Full Ring/);
});

function renderWidgetSettings(options: {
    actionKind: ActionKind;
    isWindows?: boolean;
    isGlobalViewOverrideEnabled?: boolean;
    isGlobalThemeOverrideEnabled?: boolean;
    isGlobalPaintOverrideEnabled?: boolean;
    settings?: InspectorTestSettings;
    runtimeCache?: WidgetRuntimeCachePatch;
}): string {
    return renderToStaticMarkup(createElement(WidgetSettingsTab, {
        context: buildVisibilityContext({
            actionKind: options.actionKind,
            isWindows: options.isWindows,
            settings: options.settings,
            runtimeCache: options.runtimeCache,
        }),
        isGlobalViewOverrideEnabled: options.isGlobalViewOverrideEnabled ?? false,
        isGlobalThemeOverrideEnabled: options.isGlobalThemeOverrideEnabled ?? false,
        isGlobalPaintOverrideEnabled: options.isGlobalPaintOverrideEnabled ?? false,
        colorCompensationProfile: DEFAULT_COLOR_COMPENSATION_PROFILE,
        onSettingsPatch: () => undefined,
        onResetWidgetSettings: () => undefined,
        onOpenColorCompensation: () => undefined,
    }));
}

function assertTextOrder(markup: string, earlierText: string, laterText: string): void {
    const earlierIndex = markup.indexOf(earlierText);
    const laterIndex = markup.indexOf(laterText);

    assert.notEqual(earlierIndex, -1, earlierText);
    assert.notEqual(laterIndex, -1, laterText);
    assert.equal(earlierIndex < laterIndex, true, `${earlierText} should appear before ${laterText}`);
}

function sectionHeadingPattern(text: string): RegExp {
    return new RegExp(`class="section-heading"[^>]*>${text}<`);
}

function buildWidgetSettings(
    actionKind: ActionKind,
    patch: StoredWidgetSettingsPatch,
): InspectorTestSettings {
    return writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, actionKind).rawSettings,
        patch,
    );
}
