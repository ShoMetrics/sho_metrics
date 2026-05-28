import { existsSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { renderDualMetricBodyView } from "../../src/view-rendering/dual-metric-view";
import { renderMetricFrame } from "../../src/view-rendering/metric-frame";
import {
    composeMetricViewFrame,
    type MetricRenderTarget,
} from "../../src/view-rendering/metric-view-frame";
import { resolveResvgFontOptions } from "../../src/view-rendering/resvg-font-options";
import { renderSingleMetricBodyView } from "../../src/view-rendering/single-metric-view";
import type { TextMetricVariant } from "../../src/view-rendering/render-appearance";
import type { ColorConfig } from "../../src/view-rendering/color-resolver";
import { resolveColorForThresholdValue } from "../../src/view-rendering/color-resolver";
import type {
    DualChannelWidgetData,
    KeySize,
    WidgetData,
} from "../../src/view-rendering/widget-data";
import { WIDGET_LOGICAL_SIZE } from "../../src/view-rendering/widget-data";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import { buildDefaultAppearanceSettings } from "../../src/settings/default-appearance-settings";
import { buildMetricRenderAppearance } from "../../src/settings/render-appearance-builder";
import { buildColorConfigFromAppearance } from "../../src/settings/render-paint-resolver";
import { getDiskIconFragment, getHardwareIconFragment } from "../../src/widgets/icons/hardware-icons";
import {
    getNetworkDirectionStatusIcon,
    renderNetworkDirectionIconFragment,
} from "../../src/widgets/icons/catalog/network";
import type { ProgressCircleStatusIcon, CircleVariant } from "../../src/widgets/primitives/progress-circle";
import type { DualChannelProgressCircleCenterContent } from "../../src/widgets/primitives/dual-channel-progress-circle";
import type { DualChannelSparklineMode } from "../../src/widgets/primitives/dual-channel-sparkline";
import { getMetricStatusIcon } from "../../src/widgets/icons/metric-status-icons";

const VISUAL_TEST_INTER_FONT_FILE = path.resolve(process.cwd(), "assets", "fonts", "inter", "InterVariable.ttf");
const VISUAL_TEST_SHARE_TECH_MONO_FONT_FILE = path.resolve(
    process.cwd(),
    "assets",
    "fonts",
    "share-tech-mono",
    "ShareTechMono-Regular.ttf",
);
const VISUAL_TEST_DOT_GOTHIC_16_FONT_FILE = path.resolve(
    process.cwd(),
    "assets",
    "fonts",
    "dotgothic16",
    "DotGothic16-Regular.ttf",
);
const VISUAL_TEST_BIZ_UDP_MINCHO_FONT_FILE = path.resolve(
    process.cwd(),
    "assets",
    "fonts",
    "biz-udpmincho",
    "BIZUDPMincho-Regular.ttf",
);
const NETWORK_DIRECTION_ICON_SIZE = 30;

type VisualMetricView = "circle" | "text" | "bar" | "line";
type DualVisualMetricView = "circle" | "text" | "line";

export const VISUAL_TEST_COLORS = {
    colorFilledLeft: "#55ff7f",
    colorFilledRight: "#55aaff",
    colorFilledBottom: "#ff557f",
    colorFilledSolidBackground: "#55aaff",
    networkUpload: "#F97316",
    networkDownload: "#2563EB",
} as const;

export const CPU_USAGE_WIDGET_DATA: WidgetData = {
    current: 40,
    progress: 0.4,
    history: [12, 18, 28, 34, 40, 52, 48, 60, 55, 68, 62, 74, 70],
    unit: "%",
    label: "CPU",
    displayValue: "40",
    sampleTimestampMilliseconds: 1,
};

export const CPU_USAGE_NO_DATA_WIDGET_DATA: WidgetData = {
    current: 0,
    progress: 0,
    history: [],
    unit: "",
    label: "CPU",
    displayValue: "N/A",
};

export const CPU_USAGE_BAR_WIDGET_DATA: WidgetData = {
    ...CPU_USAGE_WIDGET_DATA,
    barLabel: "CPU Load",
    barDisplayValue: "40",
    barUnit: "%",
};

export const CPU_USAGE_TOUCH_STRIP_WIDGET_DATA: WidgetData = {
    ...CPU_USAGE_BAR_WIDGET_DATA,
    history: [18, 22, 28, 38, 44, 42, 40, 46, 51, 48, 43, 40],
};

export const CPU_USAGE_SWINGING_HISTORY_WIDGET_DATA: WidgetData = {
    current: 86,
    progress: 0.86,
    history: [12, 88, 18, 82, 22, 78, 16, 84, 24, 76, 20, 80, 14, 86],
    unit: "%",
    label: "CPU",
    displayValue: "86",
    sampleTimestampMilliseconds: 1,
};

export const NETWORK_DOWNLOAD_WIDGET_DATA: WidgetData = {
    current: 87.4,
    progress: 0.68,
    history: [18, 22, 34, 48, 55, 68, 72, 64, 83, 77, 88, 81, 87],
    unit: "MB/s",
    label: "DOWN",
    displayValue: "87.4",
    sampleTimestampMilliseconds: 1,
};

export const NETWORK_UPLOAD_WIDGET_DATA: WidgetData = {
    current: 16.2,
    progress: 0.34,
    history: [4, 6, 9, 14, 12, 16, 18, 15, 21, 19, 17, 15, 16],
    unit: "MB/s",
    label: "UP",
    displayValue: "16.2",
    sampleTimestampMilliseconds: 1,
};

export const NETWORK_NO_DATA_WIDGET_DATA: DualChannelWidgetData = {
    positive: {
        ...NETWORK_UPLOAD_WIDGET_DATA,
        current: 0,
        progress: 0,
        history: [],
        displayValue: "N/A",
        unit: "",
        sampleTimestampMilliseconds: undefined,
    },
    negative: {
        ...NETWORK_DOWNLOAD_WIDGET_DATA,
        current: 0,
        progress: 0,
        history: [],
        displayValue: "N/A",
        unit: "",
        sampleTimestampMilliseconds: undefined,
    },
};

export const NETWORK_DUAL_CHANNEL_WIDGET_DATA: DualChannelWidgetData = {
    positive: NETWORK_UPLOAD_WIDGET_DATA,
    negative: NETWORK_DOWNLOAD_WIDGET_DATA,
};

export const CPU_CENTER_ICON_FRAGMENT = getHardwareIconFragment("cpu");
export const NETWORK_CENTER_ICON_FRAGMENT = getDiskIconFragment("network");
export const NETWORK_DOWNLOAD_ICON_FRAGMENT = renderNetworkDirectionIconFragment({
    direction: "download",
    color: VISUAL_TEST_COLORS.networkDownload,
    size: NETWORK_DIRECTION_ICON_SIZE,
});
export const NETWORK_UPLOAD_ICON_FRAGMENT = renderNetworkDirectionIconFragment({
    direction: "upload",
    color: VISUAL_TEST_COLORS.networkUpload,
    size: NETWORK_DIRECTION_ICON_SIZE,
});
export const NETWORK_DOWNLOAD_STATUS_ICON = getNetworkDirectionStatusIcon({
    direction: "download",
    color: VISUAL_TEST_COLORS.networkDownload,
});
export const NETWORK_UPLOAD_STATUS_ICON = getNetworkDirectionStatusIcon({
    direction: "upload",
    color: VISUAL_TEST_COLORS.networkUpload,
});

export interface SingleMetricVisualTestCase {
    readonly snapshotName: string;
    readonly appearance: ResolvedAppearanceSettingsOverride;
    readonly data: WidgetData;
    readonly renderTarget?: MetricRenderTarget;
    readonly keySize?: KeySize;
    readonly centerIcon?: string;
    readonly footerIcon?: string;
    readonly topIcon?: string;
    readonly statusIcon?: ProgressCircleStatusIcon;
    readonly muted?: boolean;
}

export interface DualMetricVisualTestCase {
    readonly snapshotName: string;
    readonly appearance: ResolvedAppearanceSettingsOverride;
    readonly data: DualChannelWidgetData;
    readonly selectedView: DualVisualMetricView;
    readonly renderTarget?: MetricRenderTarget;
    readonly keySize?: KeySize;
    readonly chartMode?: DualChannelSparklineMode;
    readonly centerContent?: DualChannelProgressCircleCenterContent;
    readonly circleVariant?: CircleVariant;
    readonly muted?: boolean;
}

export function buildDefaultAppearanceOverride(options: {
    selectedView: VisualMetricView;
    circleVariant?: CircleVariant;
    colorMode?: "multi-color" | "solid" | "black-white";
    isGradientEnabled?: boolean;
    textVariant?: TextMetricVariant;
    gridLineType?: "horizontal" | "vertical";
    gridLineVisibility?: "adaptive" | "always" | "none";
    lineSmoothingPercent?: number;
}): ResolvedAppearanceSettingsOverride {
    const line: NonNullable<ResolvedAppearanceSettingsOverride["line"]> = {};

    if (options.gridLineType !== undefined) {
        line.gridLineType = options.gridLineType;
    }

    if (options.gridLineVisibility !== undefined) {
        line.gridLineVisibility = options.gridLineVisibility;
    }

    if (options.lineSmoothingPercent !== undefined) {
        line.lineSmoothingPercent = options.lineSmoothingPercent;
    }

    return {
        view: {
            selectedView: options.selectedView,
            circleVariant: options.circleVariant ?? "full-ring",
            textVariant: options.textVariant,
        },
        theme: {
            selectedTheme: "flat",
            flat: {
                paint: {
                    colorMode: options.colorMode ?? "multi-color",
                    solid: {
                        isGradientEnabled: options.isGradientEnabled ?? true,
                    },
                },
            },
        },
        line,
    };
}

export function buildColorFilledAppearanceOverride(options: {
    selectedView: VisualMetricView;
    colorMode: "multi-color" | "solid" | "black-white";
    circleVariant?: CircleVariant;
    isGradientEnabled: boolean;
}): ResolvedAppearanceSettingsOverride {
    const colorFilledPaint = options.colorMode === "solid"
        ? {
            colorMode: "solid" as const,
            solid: {
                color: VISUAL_TEST_COLORS.colorFilledSolidBackground,
                isGradientEnabled: options.isGradientEnabled,
            },
        }
        : options.colorMode === "black-white"
            ? {
                colorMode: "black-white" as const,
            }
            : {
                colorMode: "multi-color" as const,
                multiColor: {
                    colors: {
                        lowColor: VISUAL_TEST_COLORS.colorFilledLeft,
                        mediumColor: VISUAL_TEST_COLORS.colorFilledRight,
                        highColor: VISUAL_TEST_COLORS.colorFilledBottom,
                    },
                    isGradientEnabled: options.isGradientEnabled,
                },
            };

    return {
        view: {
            selectedView: options.selectedView,
            circleVariant: options.circleVariant ?? "full-ring",
        },
        theme: {
            selectedTheme: "color-filled",
            colorFilled: {
                paint: colorFilledPaint,
            },
        },
    };
}

export function renderSingleMetricWidgetPngBuffer(testCase: SingleMetricVisualTestCase): Buffer {
    if (testCase.renderTarget) {
        return renderSingleMetricFramePngBuffer(testCase);
    }

    const keySize = testCase.keySize ?? WIDGET_LOGICAL_SIZE;
    const visualSettings = buildMetricRenderAppearance(buildDefaultAppearanceSettings(testCase.appearance));
    const body = renderSingleMetricBodyView({
        data: testCase.data,
        visual: visualSettings,
        renderSize: keySize,
        centerIcon: testCase.centerIcon ?? "",
        footerIcon: testCase.footerIcon,
        topIcon: testCase.topIcon,
        statusIcon: testCase.statusIcon,
        circleVariant: visualSettings.circleVariant,
    });

    return renderSvgToPngBuffer(renderMetricFrame({
        bodies: [
            {
                svg: body,
                muted: testCase.muted ?? false,
            },
        ],
        themePreset: visualSettings.themePreset,
        paints: visualSettings.paints,
        size: keySize,
    }), keySize);
}

export function renderDualMetricWidgetPngBuffer(testCase: DualMetricVisualTestCase): Buffer {
    if (testCase.renderTarget) {
        return renderDualMetricFramePngBuffer(testCase);
    }

    const keySize = testCase.keySize ?? WIDGET_LOGICAL_SIZE;
    const visualSettings = buildMetricRenderAppearance(buildDefaultAppearanceSettings(testCase.appearance));
    const positiveColorConfig = buildSolidColorConfig(VISUAL_TEST_COLORS.networkUpload);
    const negativeColorConfig = buildSolidColorConfig(VISUAL_TEST_COLORS.networkDownload);
    const body = renderDualMetricBodyView({
        data: testCase.data,
        visual: visualSettings,
        renderPrimitive: toDualRenderPrimitive(testCase.selectedView),
        renderSize: keySize,
        titleText: testCase.selectedView === "text" ? "NET" : "NETWORK",
        chartMode: testCase.chartMode ?? "overlay",
        centerContent: testCase.centerContent ?? "value",
        circleVariant: testCase.circleVariant ?? visualSettings.circleVariant,
        topIcon: NETWORK_CENTER_ICON_FRAGMENT,
        positive: {
            labelText: "UP",
            unitText: "M",
            color: VISUAL_TEST_COLORS.networkUpload,
            colorConfig: positiveColorConfig,
            icon: NETWORK_UPLOAD_ICON_FRAGMENT,
            statusIcon: NETWORK_UPLOAD_STATUS_ICON,
        },
        negative: {
            labelText: "DN",
            unitText: "M",
            color: VISUAL_TEST_COLORS.networkDownload,
            colorConfig: negativeColorConfig,
            icon: NETWORK_DOWNLOAD_ICON_FRAGMENT,
            statusIcon: NETWORK_DOWNLOAD_STATUS_ICON,
        },
    });

    return renderSvgToPngBuffer(renderMetricFrame({
        bodies: [
            {
                svg: body,
                muted: testCase.muted ?? false,
            },
        ],
        themePreset: visualSettings.themePreset,
        paints: visualSettings.paints,
        size: keySize,
    }), keySize);
}

export function renderSvgToPngBuffer(svg: string, keySize: KeySize): Buffer {
    const renderedImage = new Resvg(svg, {
        fitTo: {
            mode: "width",
            value: keySize.width,
        },
        font: resolveResvgFontOptions(svg, {
            platform: process.platform,
            fileExists: existsSync,
            bundledInterFontFile: VISUAL_TEST_INTER_FONT_FILE,
            bundledShareTechMonoFontFile: VISUAL_TEST_SHARE_TECH_MONO_FONT_FILE,
            bundledDotGothic16FontFile: VISUAL_TEST_DOT_GOTHIC_16_FONT_FILE,
            bundledJapaneseSerifFontFile: VISUAL_TEST_BIZ_UDP_MINCHO_FONT_FILE,
            preferBundledJapaneseSerifFont: true,
        }),
    }).render();

    return Buffer.from(renderedImage.asPng());
}

function renderSingleMetricFramePngBuffer(testCase: SingleMetricVisualTestCase): Buffer {
    const resolvedSettings = buildDefaultAppearanceSettings(testCase.appearance);
    const frame = composeMetricViewFrame({
        renderTarget: testCase.renderTarget ?? "key",
        viewOptions: {
            resolvedSettings,
            widgetData: testCase.data,
            centerIconFragment: testCase.centerIcon ?? "",
            footerIconFragment: testCase.footerIcon,
            topIconFragment: testCase.topIcon,
            statusIcon: testCase.statusIcon ?? getMetricStatusIcon("percentage"),
            circleVariantOverride: resolvedSettings.view.circleVariant,
        },
    });

    return renderSvgToPngBuffer(frame.svg, frame.renderPlan.pngSize);
}

function renderDualMetricFramePngBuffer(testCase: DualMetricVisualTestCase): Buffer {
    const resolvedSettings = buildDefaultAppearanceSettings(testCase.appearance);
    const positiveColorConfig = buildColorConfigFromAppearance(resolvedSettings, "upload");
    const negativeColorConfig = buildColorConfigFromAppearance(resolvedSettings, "download");
    const positiveColor = resolveColorForThresholdValue(testCase.data.positive.progress * 100, positiveColorConfig);
    const negativeColor = resolveColorForThresholdValue(testCase.data.negative.progress * 100, negativeColorConfig);
    const frame = composeMetricViewFrame({
        renderTarget: testCase.renderTarget ?? "key",
        viewOptions: {
            resolvedSettings,
            widgetData: testCase.data,
            titleText: testCase.selectedView === "text" ? "NET" : "NETWORK",
            dualRenderPrimitive: toDualRenderPrimitive(testCase.selectedView),
            chartMode: testCase.chartMode,
            centerIconFragment: NETWORK_CENTER_ICON_FRAGMENT,
            statusIcon: NETWORK_UPLOAD_STATUS_ICON,
            circleVariantOverride: resolvedSettings.view.circleVariant,
            positiveColor,
            negativeColor,
            positiveColorConfig,
            negativeColorConfig,
            positiveLabelText: "UP",
            negativeLabelText: "DN",
            positiveIconFragment: renderNetworkDirectionIconFragment({
                direction: "upload",
                color: positiveColor,
                size: NETWORK_DIRECTION_ICON_SIZE,
            }),
            negativeIconFragment: renderNetworkDirectionIconFragment({
                direction: "download",
                color: negativeColor,
                size: NETWORK_DIRECTION_ICON_SIZE,
            }),
            positiveStatusIcon: getNetworkDirectionStatusIcon({
                direction: "upload",
                color: positiveColor,
            }),
            negativeStatusIcon: getNetworkDirectionStatusIcon({
                direction: "download",
                color: negativeColor,
            }),
        },
    });

    return renderSvgToPngBuffer(frame.svg, frame.renderPlan.pngSize);
}

function buildSolidColorConfig(color: string): ColorConfig {
    return {
        mode: "solid",
        solidColor: color,
        thresholds: [],
        isGradientEnabled: true,
    };
}

function toDualRenderPrimitive(selectedView: DualVisualMetricView) {
    return selectedView === "line" ? "sparkline" : selectedView;
}
