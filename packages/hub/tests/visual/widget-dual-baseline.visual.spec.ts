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
        snapshotName: "first-visual-baseline-dual-circle-full-ring-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "full-ring",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        selectedView: "circle",
        centerContent: "value",
        circleVariant: "full-ring",
    },
    {
        snapshotName: "first-visual-baseline-dual-circle-full-ring-network-throughput-low-traffic",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "full-ring",
            colorMode: "multi-color",
        }),
        data: {
            positive: {
                ...NETWORK_DUAL_CHANNEL_WIDGET_DATA.positive,
                current: 1,
                progress: 0.001,
                unit: "KB/s",
                displayValue: "1",
            },
            negative: {
                ...NETWORK_DUAL_CHANNEL_WIDGET_DATA.negative,
                current: 0,
                progress: 0.001,
                unit: "KB/s",
                displayValue: "0",
            },
        },
        selectedView: "circle",
        centerContent: "value",
        circleVariant: "full-ring",
    },
    {
        snapshotName: "first-visual-baseline-dual-circle-minimal-icon-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "minimal",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        selectedView: "circle",
        centerContent: "icon",
        circleVariant: "minimal",
    },
    {
        snapshotName: "first-visual-baseline-dual-circle-gauge-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        selectedView: "circle",
        centerContent: "icon-value-unit",
        circleVariant: "gauge",
    },
    {
        snapshotName: "first-visual-baseline-dual-text-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "text",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        selectedView: "text",
    },
    {
        snapshotName: "first-visual-baseline-dual-sparkline-overlay-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "line",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        selectedView: "line",
        chartMode: "overlay",
    },
    {
        snapshotName: "first-visual-baseline-dual-sparkline-mirrored-network-throughput-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "line",
            colorMode: "multi-color",
        }),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        selectedView: "line",
        chartMode: "mirrored",
    },
    {
        snapshotName: "first-visual-baseline-dual-sparkline-overlay-network-throughput-no-data-placeholder",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "line",
            colorMode: "multi-color",
        }),
        data: NETWORK_NO_DATA_WIDGET_DATA,
        selectedView: "line",
        chartMode: "overlay",
    },
];

for (const testCase of DUAL_BASELINE_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderDualMetricWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}
