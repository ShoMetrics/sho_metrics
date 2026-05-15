import path from "node:path";
import { expect, test } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { renderMetricFrame } from "../../src/rendering/metric-frame";
import { renderSingleMetricBodyView } from "../../src/rendering/single-metric-view";
import { WIDGET_LOGICAL_SIZE, type KeySize, type WidgetData } from "../../src/rendering/widget-data";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import { buildDefaultAppearanceSettings } from "../../src/settings/default-appearance-settings";
import { buildMetricRenderAppearance } from "../../src/settings/render-appearance-builder";
import { getHardwareIconFragment } from "../../src/widgets/icons/hardware-icons";

const INTER_FONT_FILE = path.resolve(process.cwd(), "assets", "fonts", "inter", "InterVariable.ttf");
const CPU_ICON_FRAGMENT = getHardwareIconFragment("cpu");

const CPU_USAGE_WIDGET_DATA: WidgetData = {
    current: 40,
    progress: 0.4,
    history: [12, 18, 28, 34, 40, 52, 48, 60, 55, 68, 62, 74, 70],
    unit: "%",
    label: "CPU",
    displayValue: "40",
    sampleTimestampMilliseconds: 1,
};

interface DefaultThemeVisualWidgetTestCase {
    readonly snapshotName: string;
    readonly appearance: ResolvedAppearanceSettingsOverride;
    readonly data: WidgetData;
    readonly centerIcon?: string;
    readonly footerIcon?: string;
    readonly linearIcon?: string;
}

const DEFAULT_THEME_VISUAL_TEST_CASES: readonly DefaultThemeVisualWidgetTestCase[] = [
    {
        snapshotName: "default-theme-single-circular-minimal-icon-cpu-usage-multi-color",
        appearance: buildDefaultThemeAppearanceOverride({
            graphType: "circular",
            circleStyle: "compact",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "default-theme-single-circular-gauge-cpu-usage-multi-color",
        appearance: buildDefaultThemeAppearanceOverride({
            graphType: "circular",
            circleStyle: "gauge",
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "default-theme-single-linear-progress-cpu-usage-multi-color",
        appearance: buildDefaultThemeAppearanceOverride({
            graphType: "linear",
            circleStyle: "value",
        }),
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            linearLabel: "CPU Load",
            secondaryDisplayValue: "OK",
        },
        centerIcon: CPU_ICON_FRAGMENT,
        linearIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "default-theme-single-sparkline-cpu-usage-multi-color",
        appearance: buildDefaultThemeAppearanceOverride({
            graphType: "sparkline",
            circleStyle: "value",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_ICON_FRAGMENT,
        linearIcon: CPU_ICON_FRAGMENT,
    },
];

for (const testCase of DEFAULT_THEME_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const svg = renderSingleMetricWidgetSvg({
            appearance: testCase.appearance,
            data: testCase.data,
            centerIcon: testCase.centerIcon ?? "",
            footerIcon: testCase.footerIcon,
            linearIcon: testCase.linearIcon,
            keySize: WIDGET_LOGICAL_SIZE,
        });
        const pngBuffer = renderSvgToPngBuffer(svg, WIDGET_LOGICAL_SIZE);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}

function buildDefaultThemeAppearanceOverride(options: {
    graphType: "circular" | "text" | "linear" | "sparkline";
    circleStyle: "value" | "compact" | "gauge";
}): ResolvedAppearanceSettingsOverride {
    return {
        graph: {
            viewLayout: options.graphType,
            circleStyle: options.circleStyle,
        },
    };
}

function renderSingleMetricWidgetSvg(options: {
    appearance: ResolvedAppearanceSettingsOverride;
    data: WidgetData;
    centerIcon: string;
    footerIcon?: string;
    linearIcon?: string;
    keySize: KeySize;
}): string {
    const visualSettings = buildMetricRenderAppearance(buildDefaultAppearanceSettings(options.appearance));
    const body = renderSingleMetricBodyView({
        data: options.data,
        visual: visualSettings,
        renderSize: options.keySize,
        centerIcon: options.centerIcon,
        footerIcon: options.footerIcon,
        linearIcon: options.linearIcon,
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
