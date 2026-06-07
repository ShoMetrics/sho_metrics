import { expect, test } from "@playwright/test";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import type { DenseMetricWidgetData } from "../../src/actions/dense-multi-metric/row-data";
import {
    buildColorFilledAppearanceOverride,
    buildDefaultAppearanceOverride,
    renderDenseMetricWidgetPngBuffer,
    type DenseMetricVisualTestCase,
} from "./widget-visual-test-support";

const DENSE_SQUARE_SIX_ROW_DATA = buildDenseMetricWidgetData([
    ["DSK", 90, 0.9],
    ["GPU", 13, 0.13],
    ["RAM", 49, 0.49],
    ["RAM", 49, 0.49],
    ["RAM", 49, 0.49],
    ["RAM", 49, 0.49],
]);

const DENSE_TOUCH_STRIP_FIVE_ROW_DATA = buildDenseMetricWidgetData([
    ["CPU", 12, 0.12],
    ["GPU", 5, 0.05],
    ["RAM", 49, 0.49],
    ["RAM", 49, 0.49],
    ["RAM", 49, 0.49],
]);

const DENSE_TOUCH_STRIP_SIX_ROW_DATA = buildDenseMetricWidgetData([
    ["CPU", 12, 0.12],
    ["GPU", 5, 0.05],
    ["RAM", 49, 0.49],
    ["RAM", 49, 0.49],
    ["RAM", 49, 0.49],
    ["RAM", 49, 0.49],
]);

const PIXEL_WINDOW_DENSE_APPEARANCE: ResolvedAppearanceSettingsOverride = {
    view: {
        selectedView: "bar",
    },
    theme: {
        selectedTheme: "pixel-window",
    },
};

const CUPERTINO_GLASS_DENSE_APPEARANCE: ResolvedAppearanceSettingsOverride = {
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

const DENSE_VISUAL_TEST_CASES: readonly DenseMetricVisualTestCase[] = [
    {
        snapshotName: "dense-multi-metric-square-two-rows-default-multi-color",
        appearance: buildDenseFlatAppearance("multi-color"),
        data: buildDenseMetricWidgetData([
            ["CPU", 29, 0.29],
            ["GPU", 5, 0.05],
        ]),
    },
    {
        snapshotName: "dense-multi-metric-square-six-rows-default-multi-color",
        appearance: buildDenseFlatAppearance("multi-color"),
        data: DENSE_SQUARE_SIX_ROW_DATA,
    },
    {
        snapshotName: "dense-multi-metric-square-six-rows-cupertino-glass-multi-color",
        appearance: CUPERTINO_GLASS_DENSE_APPEARANCE,
        data: DENSE_SQUARE_SIX_ROW_DATA,
    },
    {
        snapshotName: "dense-multi-metric-square-six-rows-color-filled-multi-color",
        appearance: buildColorFilledAppearanceOverride({
            selectedView: "bar",
            colorMode: "multi-color",
            isGradientEnabled: true,
        }),
        data: DENSE_SQUARE_SIX_ROW_DATA,
    },
    {
        snapshotName: "dense-multi-metric-square-six-rows-terminal-clean",
        appearance: buildTerminalDenseAppearance("clean"),
        data: DENSE_SQUARE_SIX_ROW_DATA,
    },
    {
        snapshotName: "dense-multi-metric-square-six-rows-terminal-vintage",
        appearance: buildTerminalDenseAppearance("vintage"),
        data: DENSE_SQUARE_SIX_ROW_DATA,
    },
    {
        snapshotName: "dense-multi-metric-touch-strip-five-rows-default-multi-color",
        appearance: buildDenseFlatAppearance("multi-color"),
        data: DENSE_TOUCH_STRIP_FIVE_ROW_DATA,
        renderTarget: "touch-strip",
    },
    {
        snapshotName: "dense-multi-metric-touch-strip-six-rows-default-multi-color",
        appearance: buildDenseFlatAppearance("multi-color"),
        data: DENSE_TOUCH_STRIP_SIX_ROW_DATA,
        renderTarget: "touch-strip",
    },
    {
        snapshotName: "dense-multi-metric-pixel-window-square-six-rows",
        appearance: PIXEL_WINDOW_DENSE_APPEARANCE,
        data: DENSE_SQUARE_SIX_ROW_DATA,
    },
    {
        snapshotName: "dense-multi-metric-pixel-window-touch-strip-six-rows",
        appearance: PIXEL_WINDOW_DENSE_APPEARANCE,
        data: DENSE_TOUCH_STRIP_SIX_ROW_DATA,
        renderTarget: "touch-strip",
    },
];

for (const testCase of DENSE_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderDenseMetricWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}

function buildDenseFlatAppearance(
    colorMode: "multi-color" | "solid" | "black-white",
): ResolvedAppearanceSettingsOverride {
    return buildDefaultAppearanceOverride({
        selectedView: "bar",
        colorMode,
    });
}

function buildTerminalDenseAppearance(variant: "clean" | "vintage"): ResolvedAppearanceSettingsOverride {
    return {
        view: {
            selectedView: "bar",
        },
        theme: {
            selectedTheme: "terminal",
            terminal: {
                variant,
            },
        },
    };
}

function buildDenseMetricWidgetData(rows: readonly (readonly [string, number, number])[]): DenseMetricWidgetData {
    return {
        rows: rows.map(([label, displayValue, progress], index) => ({
            rowKind: "configured",
            slotId: `dense-visual-slot-${index}`,
            metricKey: `dense-visual-metric-${index}`,
            widgetData: {
                current: displayValue,
                progress,
                history: [],
                unit: "%",
                label,
                displayValue: displayValue.toString(),
                sampleTimestampMilliseconds: 1,
            },
        })),
    };
}
