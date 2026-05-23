import assert from "node:assert/strict";
import test from "node:test";
import { renderMetricFrame } from "../../view-rendering/metric-frame";
import { renderSingleMetricBodyView } from "../../view-rendering/single-metric-view";
import type { WidgetData } from "../../view-rendering/widget-data";
import { buildDiskUsageWidgetData, buildMemoryUsageWidgetData } from "../../metrics/storage-widget-data";
import { buildCpuUsageWidgetData } from "../cpu";
import { buildGpuUsageWidgetData, buildGpuVramWidgetData } from "../gpu";
import { buildDefaultAppearanceSettings } from "../../settings/default-appearance-settings";
import { buildMetricRenderAppearance } from "../../settings/render-appearance-builder";

test("percentage metric builders expose integer display values for compact widgets", () => {
    const testCases: ReadonlyArray<{
        name: string;
        widgetData: WidgetData;
    }> = [
        {
            name: "CPU usage",
            widgetData: buildCpuUsageWidgetData(buildWidgetData({ current: 1, progress: 0.01 })),
        },
        {
            name: "GPU usage",
            widgetData: buildGpuUsageWidgetData(buildWidgetData({ current: 1, progress: 0.01, label: "GPU" })),
        },
        {
            name: "RAM usage",
            widgetData: buildMemoryUsageWidgetData({
                usedBytesWidgetData: buildWidgetData({ current: 1, history: [0, 1], label: "RAM", unit: "B" }),
                totalBytes: 100,
                label: "RAM",
            }),
        },
        {
            name: "Disk usage",
            widgetData: buildDiskUsageWidgetData({
                usedBytesWidgetData: buildWidgetData({ current: 1, history: [0, 1], label: "DISK", unit: "B" }),
                totalBytes: 100,
                availableBytes: 99,
                displayMode: "percentage",
                label: "DISK",
            }),
        },
        {
            name: "GPU VRAM",
            widgetData: buildGpuVramWidgetData(
                buildWidgetData({ current: 1, history: [0, 1], label: "VRAM", unit: "MB" }),
                100,
            ),
        },
    ];

    for (const testCase of testCases) {
        assert.equal(testCase.widgetData.displayValue, "1", testCase.name);
        assert.deepEqual(testCase.widgetData.sparklineScale, {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: 100,
        }, testCase.name);
    }
});

test("percentage action display values are honored by line view rendering", () => {
    const visualSettings = buildMetricRenderAppearance(buildDefaultAppearanceSettings({
        view: { selectedView: "line" },
        theme: {
            flat: {
                paint: { colorMode: "solid" },
            },
        },
    }));
    const body = renderSingleMetricBodyView({
        data: buildGpuUsageWidgetData(buildWidgetData({
            current: 1,
            progress: 0.01,
            history: [0, 1],
            label: "GPU",
        })),
        visual: visualSettings,
        renderSize: { width: 144, height: 144 },
        centerIcon: "",
        circleVariant: "full-ring",
    });
    const svg = renderMetricFrame({
        body,
        themePreset: "flat",
        muted: false,
        paints: visualSettings.paints,
        size: { width: 144, height: 144 },
    });

    assert.match(svg, />1</);
    assert.doesNotMatch(svg, />1\.0</);
});

function buildWidgetData(options: Partial<WidgetData> = {}): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        unit: options.unit ?? "%",
        label: options.label ?? "CPU",
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds ?? 1000,
    };
}
