import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionKind } from "../inspector/settings-types";
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";
import { WidgetSettingsTab } from "./WidgetSettingsTab";

test("disk usage linear settings render label controls without usage-mode controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: {
            appearanceOverrides: {
                graphicType: "linear",
            },
            metric: {
                diskMetricKind: "usage",
            },
        },
    });

    assert.match(markup, /Volume:/);
    assert.match(markup, /Custom Label:/);
    assert.match(markup, /Detected Label/);
    assert.doesNotMatch(markup, /Usage Display:/);
});

test("disk usage circular settings render usage display controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: {
            appearanceOverrides: {
                graphicType: "circular",
            },
            metric: {
                diskMetricKind: "usage",
            },
        },
    });

    assert.match(markup, /Usage Display:/);
    assert.doesNotMatch(markup, /Custom Label:/);
});

test("windows disk settings use usage controls when throughput is unavailable", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        isWindows: true,
        settings: {
            appearanceOverrides: {
                graphicType: "linear",
            },
            metric: {
                diskMetricKind: "throughput",
            },
        },
    });

    assert.match(markup, /Disk Metric:/);
    assert.doesNotMatch(markup, /Direction:/);
    assert.doesNotMatch(markup, /Read Max/);
    assert.doesNotMatch(markup, /Write Max/);
});

test("network dual-channel settings render channel colors instead of usage colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "net-speed",
        settings: {
            appearanceOverrides: {
                colorMode: "solid",
            },
            metric: {
                networkDirection: "both",
            },
        },
    });

    assert.match(markup, /Color - Download/);
    assert.match(markup, /Color - Upload/);
});

test("network single-channel settings render standard usage colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "net-speed",
        settings: {
            appearanceOverrides: {
                colorMode: "solid",
            },
            metric: {
                networkDirection: "download",
            },
        },
    });

    assert.match(markup, /Solid Color:/);
    assert.doesNotMatch(markup, /Color - Download/);
    assert.doesNotMatch(markup, /Color - Upload/);
});

test("network mirrored trend disables grid controls in the panel", () => {
    const markup = renderWidgetSettings({
        actionKind: "net-speed",
        settings: {
            appearanceOverrides: {
                graphicType: "dashed-line",
            },
            metric: {
                networkDirection: "both",
            },
            local: {
                networkTrafficDisplayMode: "mirrored",
            },
        },
    });

    assert.match(markup, /Traffic Graph:/);
    assert.match(markup, /Grid Line Visibility:/);
    assert.match(markup, /Grid Line Type:/);
    assert.match(markup, /Grid line settings are not supported/);
});

test("disk throughput linear settings use standard colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: {
            appearanceOverrides: {
                colorMode: "solid",
                graphicType: "linear",
            },
            metric: {
                diskMetricKind: "throughput",
                diskThroughputDirection: "both",
            },
        },
    });

    assert.match(markup, /Solid Color:/);
    assert.doesNotMatch(markup, sectionHeadingPattern("Read"));
    assert.doesNotMatch(markup, sectionHeadingPattern("Write"));
});

test("disk throughput dual-channel settings render read/write colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: {
            appearanceOverrides: {
                colorMode: "solid",
                graphicType: "circular",
            },
            metric: {
                diskMetricKind: "throughput",
                diskThroughputDirection: "both",
            },
        },
    });

    assert.match(markup, sectionHeadingPattern("Read"));
    assert.match(markup, sectionHeadingPattern("Write"));
});

function renderWidgetSettings(options: {
    actionKind: ActionKind;
    isWindows?: boolean;
    settings?: InspectorTestSettings;
}): string {
    return renderToStaticMarkup(createElement(WidgetSettingsTab, {
        actionKind: options.actionKind,
        context: buildVisibilityContext({
            actionKind: options.actionKind,
            isWindows: options.isWindows,
            settings: options.settings,
        }),
        isGlobalAppearanceOverrideEnabled: false,
        onSettingsPatch: () => undefined,
        onResetWidgetSettings: () => undefined,
    }));
}

function sectionHeadingPattern(text: string): RegExp {
    return new RegExp(`class="section-heading"[^>]*>${text}<`);
}
