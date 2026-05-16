import { expect, test } from "@playwright/test";
import {
    buildDefaultAppearanceOverride,
    NETWORK_DUAL_CHANNEL_WIDGET_DATA,
    NETWORK_NO_DATA_WIDGET_DATA,
    renderDualMetricWidgetPngBuffer,
    type DualMetricVisualTestCase,
} from "./widget-visual-test-support";

const DUAL_BASELINE_VISUAL_TEST_CASES: readonly DualMetricVisualTestCase[] = [
    {
        snapshotName: "first-visual-baseline-dual-circular-value-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "circular",
            circleStyle: "value",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        graphicType: "circular",
        centerContent: "value",
        circleStyle: "value",
    },
    {
        snapshotName: "first-visual-baseline-dual-circular-minimal-icon-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "circular",
            circleStyle: "compact",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        graphicType: "circular",
        centerContent: "icon",
        circleStyle: "compact",
    },
    {
        snapshotName: "first-visual-baseline-dual-circular-gauge-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "circular",
            circleStyle: "gauge",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        graphicType: "circular",
        centerContent: "icon-value-unit",
        circleStyle: "gauge",
    },
    {
        snapshotName: "first-visual-baseline-dual-text-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "text",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        graphicType: "text",
    },
    {
        snapshotName: "first-visual-baseline-dual-sparkline-overlay-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        graphicType: "sparkline",
        chartMode: "overlay",
    },
    {
        snapshotName: "first-visual-baseline-dual-sparkline-mirrored-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        graphicType: "sparkline",
        chartMode: "mirrored",
    },
    {
        snapshotName: "first-visual-baseline-dual-sparkline-overlay-network-throughput-no-data-placeholder",
        appearance: buildDefaultAppearanceOverride({
            graphicType: "sparkline",
            colorMode: "multi-color",
        }),
        data: NETWORK_NO_DATA_WIDGET_DATA,
        graphicType: "sparkline",
        chartMode: "overlay",
    },
];

for (const testCase of DUAL_BASELINE_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderDualMetricWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}
