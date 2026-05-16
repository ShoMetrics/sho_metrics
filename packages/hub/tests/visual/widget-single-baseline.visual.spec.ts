import { expect, test } from "@playwright/test";
import { TOUCH_STRIP_LOGICAL_SIZE } from "../../src/rendering/widget-data";
import {
    buildColorFilledAppearanceOverride,
    buildDefaultAppearanceOverride,
    CPU_CENTER_ICON_FRAGMENT,
    CPU_USAGE_LINEAR_CHANNEL_WIDGET_DATA,
    CPU_USAGE_NO_DATA_WIDGET_DATA,
    CPU_USAGE_SWINGING_HISTORY_WIDGET_DATA,
    CPU_USAGE_TOUCH_STRIP_WIDGET_DATA,
    CPU_USAGE_WIDGET_DATA,
    renderSingleMetricWidgetPngBuffer,
    type SingleMetricVisualTestCase,
} from "./widget-visual-test-support";

const SINGLE_BASELINE_VISUAL_TEST_CASES: readonly SingleMetricVisualTestCase[] = [
    {
        snapshotName: "first-visual-baseline-single-circular-value-cpu-usage-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "circular",
            circleStyle: "value",
            colorMode: "multi-color",
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "first-visual-baseline-single-circular-minimal-icon-cpu-usage-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "circular",
            circleStyle: "compact",
            colorMode: "multi-color",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-circular-gauge-cpu-usage-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "circular",
            circleStyle: "gauge",
            colorMode: "multi-color",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-text-cpu-usage-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "text",
            colorMode: "multi-color",
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "first-visual-baseline-single-linear-progress-cpu-usage-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "linear",
            colorMode: "multi-color",
        }),
        data: CPU_USAGE_LINEAR_CHANNEL_WIDGET_DATA,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-sparkline-cpu-usage-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "multi-color",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-circular-value-cpu-usage-default-solid-blue",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "circular",
            circleStyle: "value",
            colorMode: "solid",
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "first-visual-baseline-single-linear-progress-cpu-usage-default-black-white",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "linear",
            colorMode: "black-white",
        }),
        data: CPU_USAGE_LINEAR_CHANNEL_WIDGET_DATA,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-sparkline-cpu-usage-default-grid-vertical",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "multi-color",
            gridLineType: "vertical",
            gridLineVisibility: "always",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-sparkline-cpu-usage-swinging-history-default-solid-blue-no-grid-smoothing-0",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "solid",
            gridLineVisibility: "none",
            lineSmoothingPercent: 0,
        }),
        data: CPU_USAGE_SWINGING_HISTORY_WIDGET_DATA,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-sparkline-cpu-usage-swinging-history-default-solid-blue-no-grid-smoothing-35",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "solid",
            gridLineVisibility: "none",
            lineSmoothingPercent: 35,
        }),
        data: CPU_USAGE_SWINGING_HISTORY_WIDGET_DATA,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-sparkline-cpu-usage-swinging-history-default-solid-blue-no-grid-smoothing-75",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "solid",
            gridLineVisibility: "none",
            lineSmoothingPercent: 75,
        }),
        data: CPU_USAGE_SWINGING_HISTORY_WIDGET_DATA,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-sparkline-cpu-usage-swinging-history-default-solid-blue-no-grid-smoothing-100",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "solid",
            gridLineVisibility: "none",
            lineSmoothingPercent: 100,
        }),
        data: CPU_USAGE_SWINGING_HISTORY_WIDGET_DATA,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-text-cpu-usage-no-data-placeholder",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "text",
            colorMode: "multi-color",
        }),
        data: CPU_USAGE_NO_DATA_WIDGET_DATA,
    },
    {
        snapshotName: "first-visual-baseline-single-linear-progress-touchstrip-cpu-usage-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "linear",
            colorMode: "multi-color",
        }),
        data: CPU_USAGE_TOUCH_STRIP_WIDGET_DATA,
        keySize: TOUCH_STRIP_LOGICAL_SIZE,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-sparkline-touchstrip-cpu-usage-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "multi-color",
        }),
        data: CPU_USAGE_TOUCH_STRIP_WIDGET_DATA,
        keySize: TOUCH_STRIP_LOGICAL_SIZE,
        linearIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "first-visual-baseline-single-circular-value-color-filled-black-white",
        appearance: buildColorFilledAppearanceOverride({
            graphicType: "circular",
            colorMode: "black-white",
            isGradientEnabled: false,
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
];

for (const testCase of SINGLE_BASELINE_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderSingleMetricWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}
