import path from "node:path";
import { expect, test } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { renderMetricFrame } from "../../src/rendering/metric-frame";
import { renderSingleMetricBodyView } from "../../src/rendering/single-metric-view";
import { WIDGET_LOGICAL_SIZE, type KeySize, type WidgetData } from "../../src/rendering/widget-data";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import { buildDefaultAppearanceSettings } from "../../src/settings/default-appearance-settings";
import { buildMetricRenderAppearance } from "../../src/settings/visual-adapter";

const INTER_FONT_FILE = path.resolve(process.cwd(), "assets", "fonts", "inter", "InterVariable.ttf");

const COLOR_FILLED_VISUAL_TEST_COLORS = {
    left: "#55ff7f",
    right: "#55aaff",
    bottom: "#ff557f",
    solidBackground: "#55aaff",
} as const;

const CPU_USAGE_WIDGET_DATA: WidgetData = {
    current: 40,
    progress: 0.4,
    history: [12, 18, 28, 34, 40, 52, 48, 60, 55, 68, 62, 74, 70],
    unit: "%",
    label: "CPU",
    displayValue: "40",
    sampleTimestampMilliseconds: 1,
};

interface VisualWidgetTestCase {
    readonly snapshotName: string;
    readonly appearance: ResolvedAppearanceSettingsOverride;
    readonly data: WidgetData;
}

const VISUAL_WIDGET_TEST_CASES: readonly VisualWidgetTestCase[] = [
    {
        snapshotName: "color-filled-single-circular-value-color-mix-soft-triangle-gradient",
        appearance: buildColorFilledAppearanceOverride({
            graphType: "circular",
            colorMode: "multi-color",
            isGradientEnabled: true,
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "color-filled-single-circular-value-color-mix-soft-triangle-flat",
        appearance: buildColorFilledAppearanceOverride({
            graphType: "circular",
            colorMode: "multi-color",
            isGradientEnabled: false,
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "color-filled-single-circular-value-solid-background-gradient",
        appearance: buildColorFilledAppearanceOverride({
            graphType: "circular",
            colorMode: "solid",
            isGradientEnabled: true,
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "color-filled-single-circular-value-solid-background-flat",
        appearance: buildColorFilledAppearanceOverride({
            graphType: "circular",
            colorMode: "solid",
            isGradientEnabled: false,
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "color-filled-single-text-color-mix-soft-triangle-gradient",
        appearance: buildColorFilledAppearanceOverride({
            graphType: "text",
            colorMode: "multi-color",
            isGradientEnabled: true,
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "color-filled-single-linear-progress-color-mix-soft-triangle-gradient",
        appearance: buildColorFilledAppearanceOverride({
            graphType: "linear",
            colorMode: "multi-color",
            isGradientEnabled: true,
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "color-filled-single-sparkline-color-mix-soft-triangle-gradient",
        appearance: buildColorFilledAppearanceOverride({
            graphType: "sparkline",
            colorMode: "multi-color",
            isGradientEnabled: true,
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "flat-single-circular-value-black-white",
        appearance: {
            graph: {
                viewLayout: "circular",
                circleStyle: "value",
            },
            theme: {
                selectedTheme: "flat",
            },
            paint: {
                metric: {
                    colorMode: "black-white",
                },
            },
        },
        data: CPU_USAGE_WIDGET_DATA,
    },
];

for (const testCase of VISUAL_WIDGET_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const svg = renderSingleMetricWidgetSvg({
            appearance: testCase.appearance,
            data: testCase.data,
            keySize: WIDGET_LOGICAL_SIZE,
        });
        const pngBuffer = renderSvgToPngBuffer(svg, WIDGET_LOGICAL_SIZE);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}

function buildColorFilledAppearanceOverride(options: {
    graphType: "circular" | "text" | "linear" | "sparkline";
    colorMode: "multi-color" | "solid";
    isGradientEnabled: boolean;
}): ResolvedAppearanceSettingsOverride {
    const colorFilledPaint = options.colorMode === "solid"
        ? {
            colorMode: "solid" as const,
            solid: {
                color: COLOR_FILLED_VISUAL_TEST_COLORS.solidBackground,
                isGradientEnabled: options.isGradientEnabled,
            },
        }
        : {
            colorMode: "multi-color" as const,
            multiColor: {
                colors: {
                    lowColor: COLOR_FILLED_VISUAL_TEST_COLORS.left,
                    mediumColor: COLOR_FILLED_VISUAL_TEST_COLORS.right,
                    highColor: COLOR_FILLED_VISUAL_TEST_COLORS.bottom,
                },
                isGradientEnabled: options.isGradientEnabled,
            },
        };

    return {
        graph: {
            viewLayout: options.graphType,
            circleStyle: "value",
        },
        theme: {
            selectedTheme: "color-filled",
        },
        paint: {
            colorFilled: colorFilledPaint,
        },
    };
}

function renderSingleMetricWidgetSvg(options: {
    appearance: ResolvedAppearanceSettingsOverride;
    data: WidgetData;
    keySize: KeySize;
}): string {
    const visualSettings = buildMetricRenderAppearance(buildDefaultAppearanceSettings(options.appearance));
    const body = renderSingleMetricBodyView({
        data: options.data,
        visual: visualSettings,
        renderSize: options.keySize,
        centerIcon: "",
        circleStyle: visualSettings.circleStyle,
    });

    return renderMetricFrame({
        body,
        graphicStyle: visualSettings.graphicStyle,
        muted: false,
        paints: visualSettings.paints,
        size: options.keySize,
    });
}

function renderSvgToPngBuffer(svg: string, keySize: KeySize): Buffer {
    const renderedImage = new Resvg(svg, {
        fitTo: {
            mode: "width",
            value: keySize.width,
        },
        font: {
            loadSystemFonts: false,
            fontFiles: [INTER_FONT_FILE],
            defaultFontFamily: "Inter",
            sansSerifFamily: "Inter",
        },
    }).render();

    return Buffer.from(renderedImage.asPng());
}
