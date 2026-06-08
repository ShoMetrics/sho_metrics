import { expect, test } from "@playwright/test";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import {
    buildColorFilledAppearanceOverride,
    buildDefaultAppearanceOverride,
    CPU_USAGE_TOUCH_STRIP_WIDGET_DATA,
    CPU_USAGE_WIDGET_DATA,
    renderStackedMetricWidgetPngBuffer,
    type StackedMetricVisualTestCase,
} from "./widget-visual-test-support";

const STACKED_INDICATOR = {
    currentIndex: 2,
    totalCount: 3,
} as const;

const STACKED_PIXEL_WINDOW_APPEARANCE: ResolvedAppearanceSettingsOverride = {
    view: {
        selectedView: "bar",
    },
    theme: {
        selectedTheme: "pixel-window",
    },
};

const STACKED_TERMINAL_APPEARANCE: ResolvedAppearanceSettingsOverride = {
    view: {
        selectedView: "bar",
    },
    theme: {
        selectedTheme: "terminal",
        terminal: {
            variant: "clean",
        },
    },
};

const STACKED_CUPERTINO_GLASS_APPEARANCE: ResolvedAppearanceSettingsOverride = {
    view: {
        selectedView: "bar",
    },
    theme: {
        selectedTheme: "cupertino-glass",
        cupertinoGlass: {
            paint: {
                colorMode: "multi-color",
            },
        },
    },
};

const STACKED_VISUAL_TEST_CASES: readonly StackedMetricVisualTestCase[] = [
    {
        snapshotName: "stacked-metric-square-bar-no-indicator",
        appearance: buildStackedFlatAppearance("bar"),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "stacked-metric-square-bar-indicator-flat",
        appearance: buildStackedFlatAppearance("bar"),
        data: CPU_USAGE_WIDGET_DATA,
        indicator: STACKED_INDICATOR,
    },
    {
        snapshotName: "stacked-metric-square-circle-indicator-flat",
        appearance: buildStackedFlatAppearance("circle"),
        data: CPU_USAGE_WIDGET_DATA,
        indicator: STACKED_INDICATOR,
    },
    {
        snapshotName: "stacked-metric-square-text-indicator-flat",
        appearance: buildStackedFlatAppearance("text"),
        data: CPU_USAGE_WIDGET_DATA,
        indicator: STACKED_INDICATOR,
    },
    {
        snapshotName: "stacked-metric-square-line-indicator-flat",
        appearance: buildStackedFlatAppearance("line"),
        data: CPU_USAGE_WIDGET_DATA,
        indicator: STACKED_INDICATOR,
    },
    {
        snapshotName: "stacked-metric-touch-strip-bar-indicator-flat",
        appearance: buildStackedFlatAppearance("bar"),
        data: CPU_USAGE_TOUCH_STRIP_WIDGET_DATA,
        indicator: STACKED_INDICATOR,
        renderTarget: "touch-strip",
    },
    {
        snapshotName: "stacked-metric-square-bar-indicator-color-filled",
        appearance: buildColorFilledAppearanceOverride({
            selectedView: "bar",
            colorMode: "multi-color",
            isGradientEnabled: true,
        }),
        data: CPU_USAGE_WIDGET_DATA,
        indicator: STACKED_INDICATOR,
    },
    {
        snapshotName: "stacked-metric-square-bar-indicator-cupertino-glass",
        appearance: STACKED_CUPERTINO_GLASS_APPEARANCE,
        data: CPU_USAGE_WIDGET_DATA,
        indicator: STACKED_INDICATOR,
    },
    {
        snapshotName: "stacked-metric-square-bar-indicator-terminal-clean",
        appearance: STACKED_TERMINAL_APPEARANCE,
        data: CPU_USAGE_WIDGET_DATA,
        indicator: STACKED_INDICATOR,
    },
    {
        snapshotName: "stacked-metric-square-bar-indicator-pixel-window",
        appearance: STACKED_PIXEL_WINDOW_APPEARANCE,
        data: CPU_USAGE_WIDGET_DATA,
        indicator: STACKED_INDICATOR,
    },
];

for (const testCase of STACKED_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderStackedMetricWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}

function buildStackedFlatAppearance(selectedView: "circle" | "text" | "bar" | "line"): ResolvedAppearanceSettingsOverride {
    return buildDefaultAppearanceOverride({
        selectedView,
        colorMode: "multi-color",
    });
}
