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
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";
import { WidgetSettingsTab } from "./WidgetSettingsTab";

test("disk usage linear settings render label controls without usage-mode controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                viewLayout: "linear",
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

test("disk usage circular settings render usage display controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                viewLayout: "circular",
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
                viewLayout: "linear",
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
                colorMode: "solid",
            },
            network: {
                direction: "both",
            },
        }),
    });

    assert.match(markup, /Color - Download/);
    assert.match(markup, /Color - Upload/);
});

test("network settings render from empty quick-start settings", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
    });

    assert.match(markup, /Network Metric/);
    assert.match(markup, /Network Interface/);
});

test("network single-channel settings render standard usage colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                colorMode: "solid",
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

test("network mirrored trend disables grid controls in the panel", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                viewLayout: "sparkline",
            },
            network: {
                direction: "both",
                trafficDisplayMode: "mirrored",
            },
        }),
    });

    assert.match(markup, /Traffic Graph:/);
    assert.match(markup, /Grid Line Visibility:/);
    assert.match(markup, /Grid Line Type:/);
    assert.match(markup, /Grid line settings are not supported/);
});

test("disk throughput linear settings use standard colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                colorMode: "solid",
                viewLayout: "linear",
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
                colorMode: "solid",
                viewLayout: "circular",
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
        isGlobalAppearanceOverrideEnabled: false,
    });

    assert.match(markup, /GPU Metric:/);
    assert.doesNotMatch(markup, /Some settings are disabled/);
});

test("widget settings renders mismatch recovery before global settings load", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalAppearanceOverrideEnabled: false,
        settings: buildWidgetSettings("cpu", {}),
    });

    assert.match(markup, /Stored metric settings do not match this action/);
    assert.doesNotMatch(markup, /Some settings are disabled/);
});

test("widget settings renders normally after global settings load without override", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalAppearanceOverrideEnabled: false,
    });

    assert.match(markup, /GPU Metric:/);
    assert.doesNotMatch(markup, /Some settings are disabled/);
});

test("widget settings keep warnings first and reset in advanced controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalAppearanceOverrideEnabled: true,
    });

    assertTextOrder(markup, "Some settings are disabled", "GPU Metric:");
    assertTextOrder(markup, "GPU Metric:", "Layout");
    assertTextOrder(markup, "Polling Frequency", "Advanced");
    assertTextOrder(markup, "Advanced", "Reset Widget Settings");
});

function renderWidgetSettings(options: {
    actionKind: ActionKind;
    isWindows?: boolean;
    isGlobalAppearanceOverrideEnabled?: boolean;
    settings?: InspectorTestSettings;
}): string {
    return renderToStaticMarkup(createElement(WidgetSettingsTab, {
        context: buildVisibilityContext({
            actionKind: options.actionKind,
            isWindows: options.isWindows,
            settings: options.settings,
        }),
        isGlobalAppearanceOverrideEnabled: options.isGlobalAppearanceOverrideEnabled ?? false,
        onSettingsPatch: () => undefined,
        onResetWidgetSettings: () => undefined,
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
