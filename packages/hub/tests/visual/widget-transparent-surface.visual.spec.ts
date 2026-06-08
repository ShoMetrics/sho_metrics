import { expect, test } from "@playwright/test";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import {
    buildColorFilledAppearanceOverride,
    buildDefaultAppearanceOverride,
    CPU_CENTER_ICON_FRAGMENT,
    CPU_USAGE_BAR_WIDGET_DATA,
    CPU_USAGE_WIDGET_DATA,
    NETWORK_DUAL_CHANNEL_WIDGET_DATA,
    renderDualMetricWidgetPngBuffer,
    renderSingleMetricWidgetPngBuffer,
    type DualMetricVisualTestCase,
    type SingleMetricVisualTestCase,
} from "./widget-visual-test-support";

const FLAT_TRANSPARENT_SURFACE = {
    enabled: true,
    backgroundOpacityPercent: 20,
    textOutlinePercent: 70,
    shapeOutlinePercent: 30,
} as const;

const NON_FLAT_TRANSPARENT_SURFACE = {
    enabled: true,
    backgroundOpacityPercent: 50,
    textOutlinePercent: 70,
    shapeOutlinePercent: 30,
} as const;

const SINGLE_TRANSPARENT_SURFACE_CASES: readonly SingleMetricVisualTestCase[] = [
    {
        snapshotName: "transparent-surface-flat-single-circle-full-ring",
        appearance: enableFlatTransparentSurface(buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "full-ring",
            colorMode: "multi-color",
        })),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "transparent-surface-color-filled-single-progress-bar",
        appearance: enableColorFilledTransparentSurface(buildColorFilledAppearanceOverride({
            selectedView: "bar",
            colorMode: "solid",
            isGradientEnabled: true,
        })),
        data: CPU_USAGE_BAR_WIDGET_DATA,
        topIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        snapshotName: "transparent-surface-pixel-window-single-sparkline",
        appearance: enablePixelWindowTransparentSurface({
            view: {
                selectedView: "line",
            },
            theme: {
                selectedTheme: "pixel-window",
            },
            line: {
                gridLineType: "vertical",
                gridLineVisibility: "always",
            },
        }),
        data: CPU_USAGE_WIDGET_DATA,
        topIcon: CPU_CENTER_ICON_FRAGMENT,
    },
];

const DUAL_TRANSPARENT_SURFACE_CASES: readonly DualMetricVisualTestCase[] = [
    {
        snapshotName: "transparent-surface-flat-dual-sparkline-overlay",
        appearance: enableFlatTransparentSurface(buildDefaultAppearanceOverride({
            selectedView: "line",
            colorMode: "multi-color",
        })),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        selectedView: "line",
        chartMode: "overlay",
    },
    {
        snapshotName: "transparent-surface-flat-dual-circle-gauge",
        appearance: enableFlatTransparentSurface(buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
            colorMode: "multi-color",
        })),
        data: NETWORK_DUAL_CHANNEL_WIDGET_DATA,
        selectedView: "circle",
        circleVariant: "gauge",
    },
];

for (const testCase of SINGLE_TRANSPARENT_SURFACE_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderSingleMetricWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}

for (const testCase of DUAL_TRANSPARENT_SURFACE_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderDualMetricWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}

function enableFlatTransparentSurface(
    appearance: ResolvedAppearanceSettingsOverride,
): ResolvedAppearanceSettingsOverride {
    return {
        ...appearance,
        transparentSurface: FLAT_TRANSPARENT_SURFACE,
        theme: {
            ...appearance.theme,
            selectedTheme: "flat",
        },
    };
}

function enableColorFilledTransparentSurface(
    appearance: ResolvedAppearanceSettingsOverride,
): ResolvedAppearanceSettingsOverride {
    return {
        ...appearance,
        transparentSurface: NON_FLAT_TRANSPARENT_SURFACE,
        theme: {
            ...appearance.theme,
            selectedTheme: "color-filled",
        },
    };
}

function enablePixelWindowTransparentSurface(
    appearance: ResolvedAppearanceSettingsOverride,
): ResolvedAppearanceSettingsOverride {
    return {
        ...appearance,
        transparentSurface: NON_FLAT_TRANSPARENT_SURFACE,
        theme: {
            ...appearance.theme,
            selectedTheme: "pixel-window",
        },
    };
}
