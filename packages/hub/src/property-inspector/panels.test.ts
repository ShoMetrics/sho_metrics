import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetSettingsTab } from "./panels/WidgetSettingsTab";
import type { ActionKind } from "./settings";
import { buildVisibilityContext, type InspectorTestSettings } from "./test-context";

test("disk usage linear settings render label controls without usage-mode controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: {
            graphicType: "linear",
            diskMetricKind: "usage",
        },
    });
    const targetNameList = readTargetNames(markup);

    assert.ok(targetNameList.includes("diskVolumeId"));
    assert.ok(targetNameList.includes("diskLinearLabel"));
    assert.ok(!targetNameList.includes("diskUsageDisplayMode"));
    assert.match(markup, /Detected Label/);
});

test("disk usage circular settings render usage display controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: {
            graphicType: "circular",
            diskMetricKind: "usage",
        },
    });
    const targetNameList = readTargetNames(markup);

    assert.ok(targetNameList.includes("diskUsageDisplayMode"));
    assert.ok(!targetNameList.includes("diskLinearLabel"));
});

test("windows disk settings use usage controls when throughput is unavailable", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        isWindows: true,
        settings: {
            graphicType: "linear",
            diskMetricKind: "throughput",
        },
    });
    const targetNameList = readTargetNames(markup);

    assert.ok(targetNameList.includes("diskMetricKind"));
    assert.ok(!targetNameList.includes("diskThroughputDirection"));
    assert.ok(!targetNameList.includes("maximumDiskReadThroughputMebibytesPerSecond"));
    assert.ok(!targetNameList.includes("maximumDiskWriteThroughputMebibytesPerSecond"));
});

test("network dual-channel settings render channel colors instead of usage colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "net-speed",
        settings: {
            colorMode: "solid",
            networkDirection: "both",
        },
    });
    const targetNameList = readTargetNames(markup);

    assert.ok(targetNameList.includes("downloadColors.solidColor"));
    assert.ok(targetNameList.includes("uploadColors.solidColor"));
    assert.ok(!targetNameList.includes("usageColors.solidColor"));
});

test("network single-channel settings render standard usage colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "net-speed",
        settings: {
            colorMode: "solid",
            networkDirection: "download",
        },
    });
    const targetNameList = readTargetNames(markup);

    assert.ok(targetNameList.includes("usageColors.solidColor"));
    assert.ok(!targetNameList.includes("downloadColors.solidColor"));
    assert.ok(!targetNameList.includes("uploadColors.solidColor"));
});

test("network mirrored trend disables grid controls in the panel", () => {
    const markup = renderWidgetSettings({
        actionKind: "net-speed",
        settings: {
            graphicType: "dashed-line",
            networkDirection: "both",
            networkTrafficDisplayMode: "mirrored",
        },
    });
    const targetNameList = readTargetNames(markup);

    assert.ok(targetNameList.includes("networkTrafficDisplayMode"));
    assert.ok(targetNameList.includes("gridLineVisibility"));
    assert.ok(targetNameList.includes("gridLineType"));
    assert.match(markup, /Grid line settings are not supported/);
});

test("disk throughput linear settings use standard colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: {
            colorMode: "solid",
            diskMetricKind: "throughput",
            diskThroughputDirection: "both",
            graphicType: "linear",
        },
    });
    const targetNameList = readTargetNames(markup);

    assert.ok(targetNameList.includes("usageColors.solidColor"));
    assert.ok(!targetNameList.includes("diskReadColors.solidColor"));
    assert.ok(!targetNameList.includes("diskWriteColors.solidColor"));
});

test("disk throughput dual-channel settings render read/write colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: {
            colorMode: "solid",
            diskMetricKind: "throughput",
            diskThroughputDirection: "both",
            graphicType: "circular",
        },
    });
    const targetNameList = readTargetNames(markup);

    assert.ok(targetNameList.includes("diskReadColors.solidColor"));
    assert.ok(targetNameList.includes("diskWriteColors.solidColor"));
    assert.ok(!targetNameList.includes("usageColors.solidColor"));
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
        onSettingChange: () => undefined,
        onResetWidgetSettings: () => undefined,
    }));
}

function readTargetNames(markup: string): string[] {
    return [...markup.matchAll(/data-setting-target="([^"]+)"/g)]
        .map(match => match[1]);
}
