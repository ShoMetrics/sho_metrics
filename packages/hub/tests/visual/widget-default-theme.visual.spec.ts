import path from "node:path";
import { expect, test } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { renderMetricFrame } from "../../src/view-rendering/frame/metric-frame";
import { renderSingleMetricBodyView } from "../../src/view-rendering/views/single-metric-view";
import {
    TOUCH_STRIP_LOGICAL_SIZE,
    WIDGET_LOGICAL_SIZE,
    type KeySize,
    type WidgetData,
} from "../../src/view-rendering/widget-data";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import { buildDefaultAppearanceSettings } from "../../src/settings/default-appearance-settings";
import { buildMetricRenderAppearance } from "../../src/settings/render-appearance-builder";
import { getHardwareIconFragment } from "../../src/widgets/icons/hardware-icons";
import { renderNetworkDirectionIconFragment } from "../../src/widgets/icons/catalog/network";

const INTER_FONT_FILE = path.resolve(process.cwd(), "assets", "fonts", "inter", "InterVariable.ttf");
const CPU_ICON_FRAGMENT = getHardwareIconFragment("cpu");
const BATTERY_ICON_FRAGMENT = getHardwareIconFragment("battery");
const NETWORK_UPLOAD_ICON_FRAGMENT = renderNetworkDirectionIconFragment({
    direction: "upload",
    color: "#F97316",
    size: 30,
});

const CPU_USAGE_WIDGET_DATA: WidgetData = {
    current: 40,
    progress: 0.4,
    history: [12, 18, 28, 34, 40, 52, 48, 60, 55, 68, 62, 74, 70],
    unit: "%",
    label: "CPU",
    displayValue: "40",
    sampleTimestampMilliseconds: 1,
};

const GPU_TEMPERATURE_WIDGET_DATA: WidgetData = {
    current: 38,
    progress: 0.38,
    history: [30, 32, 35, 38],
    unit: "°C",
    label: "GPU",
    displayValue: "38",
    sampleTimestampMilliseconds: 1,
};

interface DefaultThemeVisualWidgetTestCase {
    readonly snapshotName: string;
    readonly appearance: ResolvedAppearanceSettingsOverride;
    readonly data: WidgetData;
    readonly keySize?: KeySize;
    readonly centerIcon?: string;
    readonly footerIcon?: string;
    readonly topIcon?: string;
}

const DEFAULT_THEME_VISUAL_TEST_CASES: readonly DefaultThemeVisualWidgetTestCase[] = [
    {
        snapshotName: "default-theme-single-circle-minimal-icon-cpu-usage-multi-color",
        appearance: buildDefaultThemeAppearanceOverride({
            selectedView: "circle",
            circleVariant: "minimal",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "default-theme-single-circle-gauge-cpu-usage-multi-color",
        appearance: buildDefaultThemeAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "default-theme-single-circle-gauge-gpu-temperature-multi-color",
        appearance: buildDefaultThemeAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: GPU_TEMPERATURE_WIDGET_DATA,
    },
    {
        snapshotName: "default-theme-single-progress-bar-cpu-usage-multi-color",
        appearance: buildDefaultThemeAppearanceOverride({
            selectedView: "bar",
            circleVariant: "full-ring",
        }),
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            barLabel: "CPU Load",
            secondaryDisplayValue: "OK",
        },
        centerIcon: CPU_ICON_FRAGMENT,
        topIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "default-theme-touchstrip-single-progress-bar-long-main-label",
        appearance: buildDefaultThemeAppearanceOverride({
            selectedView: "bar",
            circleVariant: "full-ring",
        }),
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            barLabel: "Battery",
            barDisplayValue: "100",
            barUnit: "%",
            secondaryDisplayValue: "MX Master 4",
        },
        keySize: TOUCH_STRIP_LOGICAL_SIZE,
        centerIcon: BATTERY_ICON_FRAGMENT,
        topIcon: BATTERY_ICON_FRAGMENT,
    },
    {
        snapshotName: "default-theme-touchstrip-single-progress-bar-full-custom-label",
        appearance: buildDefaultThemeAppearanceOverride({
            selectedView: "bar",
            circleVariant: "full-ring",
        }),
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            barLabel: "BATT",
            barDisplayValue: "75",
            barUnit: "%",
            secondaryDisplayValue: "123456789012345678901234",
        },
        keySize: TOUCH_STRIP_LOGICAL_SIZE,
        centerIcon: BATTERY_ICON_FRAGMENT,
        topIcon: BATTERY_ICON_FRAGMENT,
    },
    {
        snapshotName: "default-theme-touchstrip-single-progress-bar-extreme-network-rate",
        appearance: buildDefaultThemeAppearanceOverride({
            selectedView: "bar",
            circleVariant: "full-ring",
        }),
        data: {
            current: 123.4,
            progress: 0.82,
            history: [18, 28, 44, 62, 88, 104, 123],
            unit: "MB/s",
            label: "UP",
            displayValue: "123.4",
            barLabel: "Net Speed",
            barDisplayValue: "123.4",
            barUnit: "MB/s",
            barValueIconFragment: NETWORK_UPLOAD_ICON_FRAGMENT,
            barValueIconColor: "#F97316",
            secondaryDisplayValue: "Office Fiber Upload",
            sampleTimestampMilliseconds: 1,
        },
        keySize: TOUCH_STRIP_LOGICAL_SIZE,
        centerIcon: CPU_ICON_FRAGMENT,
        topIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "default-theme-single-sparkline-cpu-usage-multi-color",
        appearance: buildDefaultThemeAppearanceOverride({
            selectedView: "line",
            circleVariant: "full-ring",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_ICON_FRAGMENT,
        topIcon: CPU_ICON_FRAGMENT,
    },
];

for (const testCase of DEFAULT_THEME_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const svg = renderSingleMetricWidgetSvg({
            appearance: testCase.appearance,
            data: testCase.data,
            centerIcon: testCase.centerIcon ?? "",
            footerIcon: testCase.footerIcon,
            topIcon: testCase.topIcon,
            keySize: testCase.keySize ?? WIDGET_LOGICAL_SIZE,
        });
        const pngBuffer = renderSvgToPngBuffer(svg, testCase.keySize ?? WIDGET_LOGICAL_SIZE);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}

function buildDefaultThemeAppearanceOverride(options: {
    selectedView: "circle" | "text" | "bar" | "line";
    circleVariant: "full-ring" | "minimal" | "gauge";
}): ResolvedAppearanceSettingsOverride {
    return {
        view: {
            selectedView: options.selectedView,
            circleVariant: options.circleVariant,
        },
    };
}

function renderSingleMetricWidgetSvg(options: {
    appearance: ResolvedAppearanceSettingsOverride;
    data: WidgetData;
    centerIcon: string;
    footerIcon?: string;
    topIcon?: string;
    keySize: KeySize;
}): string {
    const visualSettings = buildMetricRenderAppearance(buildDefaultAppearanceSettings(options.appearance));
    const body = renderSingleMetricBodyView({
        data: options.data,
        visual: visualSettings,
        renderSize: options.keySize,
        centerIcon: options.centerIcon,
        footerIcon: options.footerIcon,
        topIcon: options.topIcon,
        circleVariant: visualSettings.circleVariant,
    });

    return renderMetricFrame({
        bodies: [{ svg: body, muted: false }],
        themePreset: visualSettings.themePreset,
        themePaints: visualSettings.paints,
        themeChromeOpacity: visualSettings.transparentSurface.backgroundOpacity,
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
