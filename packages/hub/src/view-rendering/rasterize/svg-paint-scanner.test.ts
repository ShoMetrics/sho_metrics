import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveThresholdColorForProgress } from "../color/color-resolver";
import { renderDualMetricBodyView } from "../views/dual-metric-view";
import { renderMetricFrame } from "../frame/metric-frame";
import { DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS, type MetricRenderAppearance } from "../color/render-appearance";
import { DEFAULT_RENDER_THEME_EFFECT_TOKENS } from "./render-svg-effects";
import { DEFAULT_RENDER_TEXT_STYLES } from "./render-text-style";
import { renderSingleMetricBodyView } from "../views/single-metric-view";
import {
    scanChromaticSvgPaintValues,
} from "../../../tests/testing/svg-paint-scanner";
import type { DualChannelWidgetData, WidgetData } from "../widget-data";
import { WIDGET_LOGICAL_SIZE } from "../widget-data";
import type { ProgressCircleStatusIcon } from "../../widgets/primitives/progress-circle";
import { getHardwareIconFragment } from "../../widgets/icons/hardware-icons";
import { getMetricStatusIcon } from "../../widgets/icons/metric-status-icons";
import { renderNetworkDirectionIconFragment } from "../../widgets/icons/catalog/network";

type TestCircleVariant = MetricRenderAppearance["circleVariant"];
type TestThemePreset = MetricRenderAppearance["themePreset"];
type TestGridLineType = MetricRenderAppearance["gridLineType"];
type TestRenderPrimitive = MetricRenderAppearance["renderPrimitive"];

test("SVG paint scanner rejects chromatic paint values without scanning SVG ids", () => {
    const findings = scanChromaticSvgPaintValues(`
        <svg>
            <defs>
                <linearGradient id="accent-#3b82f6">
                    <stop offset="0%" stop-color="rgba(30,30,50,0.65)" />
                </linearGradient>
            </defs>
            <rect id="tile-#22c55e" fill="#3b82f6" />
            <path stroke="url(#accent-#3b82f6)" d="M0 0 L1 1" />
            <g style="fill: url(#accent-#3b82f6); stroke: #22c55e; color: rgb(64,64,64);"></g>
        </svg>
    `);

    assert.deepEqual(findings, [
        { paintName: "stop-color", value: "rgba(30,30,50,0.65)" },
        { paintName: "fill", value: "#3b82f6" },
        { paintName: "stroke", value: "#22c55e" },
    ]);
});

test("SVG paint scanner accepts neutral CSS paint syntax", () => {
    const findings = scanChromaticSvgPaintValues(`
        <svg color="currentColor">
            <path fill="rgb(1.0, 1, 01)" stroke="rgb(128 128 128 / 50%)" />
            <path fill="rgb(50%, 50%, 50%)" stroke="#aaaa" />
            <path style="fill: inherit; stroke: unset; stop-color: initial; color: rgb(50% 50% 50%);" />
        </svg>
    `);

    assert.deepEqual(findings, []);
});

test("SVG paint scanner rejects invalid hex paint values", () => {
    const findings = scanChromaticSvgPaintValues(`<path fill="#xyz" stroke="#12" />`);

    assert.deepEqual(findings, [
        { paintName: "fill", value: "#xyz" },
        { paintName: "stroke", value: "#12" },
    ]);
});

test("SVG paint scanner rejects malformed rgb paint values", () => {
    const findings = scanChromaticSvgPaintValues(`<path fill="rgb(128,,128,128)" />`);

    assert.deepEqual(findings, [
        { paintName: "fill", value: "rgb(128,,128,128)" },
    ]);
});

test("black-white representative final SVG outputs contain no chromatic paint", () => {
    const testCases = [
        {
            name: "flat circle minimal icon",
            svg: renderSingleFinalSvg({
                renderPrimitive: "circle",
                theme: "flat",
                circleVariant: "minimal",
                centerIcon: getHardwareIconFragment("cpu"),
                statusIcon: getMetricStatusIcon("percentage"),
            }),
        },
        {
            name: "cupertino glass text",
            svg: renderSingleFinalSvg({
                renderPrimitive: "text",
                theme: "cupertino-glass",
                data: buildWidgetData({ secondaryDisplayValue: "Peak 91%" }),
            }),
        },
        {
            name: "flat bar",
            svg: renderSingleFinalSvg({
                renderPrimitive: "bar",
                theme: "flat",
                topIcon: getHardwareIconFragment("memory"),
                data: buildWidgetData({ secondaryDisplayValue: "12.8 GB used" }),
            }),
        },
        {
            name: "cupertino glass sparkline",
            svg: renderSingleFinalSvg({
                renderPrimitive: "sparkline",
                theme: "cupertino-glass",
                topIcon: getHardwareIconFragment("gpu"),
                gridLineType: "vertical",
            }),
        },
        {
            name: "color filled soft triangle",
            svg: renderSingleFinalSvg({
                renderPrimitive: "circle",
                theme: "color-filled",
                centerIcon: getHardwareIconFragment("cpu"),
            }),
        },
        {
            name: "terminal circle value",
            svg: renderSingleFinalSvg({
                renderPrimitive: "circle",
                theme: "terminal-clean",
            }),
        },
        {
            name: "flat dual circle gauge",
            svg: renderDualFinalSvg({
                theme: "flat",
                renderPrimitive: "circle",
                circleVariant: "gauge",
            }),
        },
        {
            name: "cupertino glass dual sparkline",
            svg: renderDualFinalSvg({
                theme: "cupertino-glass",
                renderPrimitive: "sparkline",
            }),
        },
    ];

    for (const testCase of testCases) {
        assert.deepEqual(scanChromaticSvgPaintValues(testCase.svg), [], testCase.name);
    }
});

function renderSingleFinalSvg(options: {
    renderPrimitive: TestRenderPrimitive;
    theme: TestThemePreset;
    circleVariant?: TestCircleVariant;
    gridLineType?: TestGridLineType;
    data?: WidgetData;
    centerIcon?: string;
    footerIcon?: string;
    topIcon?: string;
    statusIcon?: ProgressCircleStatusIcon;
}): string {
    const visualSettings = buildBlackWhiteRenderAppearance({
        renderPrimitive: options.renderPrimitive,
        themePreset: options.theme,
        circleVariant: options.circleVariant ?? "full-ring",
        gridLineType: options.gridLineType ?? "horizontal",
    });
    const body = renderSingleMetricBodyView({
        data: options.data ?? buildWidgetData(),
        visual: visualSettings,
        renderSize: WIDGET_LOGICAL_SIZE,
        centerIcon: options.centerIcon ?? "",
        footerIcon: options.footerIcon,
        topIcon: options.topIcon,
        statusIcon: options.statusIcon,
        circleVariant: visualSettings.circleVariant,
    });

    return renderMetricFrame({
        bodies: [{ svg: body, muted: false }],
        themePreset: visualSettings.themePreset,
        themePaints: visualSettings.paints,
        themeChromeOpacity: visualSettings.transparentSurface.backgroundOpacity,
        size: WIDGET_LOGICAL_SIZE,
    });
}

function renderDualFinalSvg(options: {
    theme: TestThemePreset;
    renderPrimitive: "circle" | "text" | "sparkline";
    circleVariant?: TestCircleVariant;
}): string {
    const visualSettings = buildBlackWhiteRenderAppearance({
        renderPrimitive: options.renderPrimitive,
        themePreset: options.theme,
        circleVariant: options.circleVariant ?? "full-ring",
    });
    const channelColor = resolveThresholdColorForProgress(0.5, visualSettings.paints.primaryMetric);
    const body = renderDualMetricBodyView({
        data: buildDualChannelData(),
        visual: visualSettings,
        renderPrimitive: options.renderPrimitive,
        renderSize: WIDGET_LOGICAL_SIZE,
        titleText: "NETWORK",
        chartMode: "overlay",
        centerContent: "value",
        circleVariant: visualSettings.circleVariant,
        topIcon: getHardwareIconFragment("disk"),
        positive: {
            labelText: "UP",
            unitText: "M",
            color: channelColor,
            colorConfig: visualSettings.paints.primaryMetric,
            icon: renderNetworkDirectionIconFragment({
                direction: "upload",
                color: channelColor,
                size: 30,
            }),
        },
        negative: {
            labelText: "DN",
            unitText: "M",
            color: channelColor,
            colorConfig: visualSettings.paints.primaryMetric,
            icon: renderNetworkDirectionIconFragment({
                direction: "download",
                color: channelColor,
                size: 30,
            }),
        },
    });

    return renderMetricFrame({
        bodies: [{ svg: body, muted: false }],
        themePreset: visualSettings.themePreset,
        themePaints: visualSettings.paints,
        themeChromeOpacity: visualSettings.transparentSurface.backgroundOpacity,
        size: WIDGET_LOGICAL_SIZE,
    });
}

function buildBlackWhiteRenderAppearance(options: {
    renderPrimitive: TestRenderPrimitive;
    themePreset: TestThemePreset;
    circleVariant: TestCircleVariant;
    gridLineType?: TestGridLineType | undefined;
}): MetricRenderAppearance {
    return {
        renderPrimitive: options.renderPrimitive,
        circleVariant: options.circleVariant,
        textVariant: "centered",
        themePreset: options.themePreset,
        paintConstraint: "black-white",
        paints: {
            background: "#0f0f0f",
            backgroundFill: options.themePreset === "color-filled"
                ? {
                    fillKind: "soft-triangle",
                    lowColor: "#161616",
                    mediumColor: "#2c2c2c",
                    highColor: "#444444",
                    isGradientEnabled: true,
                }
                : undefined,
            surface: "rgba(255,255,255,0.08)",
            primaryText: "rgba(255,255,255,0.94)",
            secondaryText: "rgba(255,255,255,0.72)",
            mutedText: "rgba(255,255,255,0.48)",
            icon: "rgba(255,255,255,0.88)",
            barTitleText: "rgba(255,255,255,0.88)",
            metricValueText: "white",
            barValueText: "white",
            barUnitText: "rgba(255,255,255,0.76)",
            barSecondaryText: "rgba(255,255,255,0.78)",
            primaryMetric: {
                mode: "solid",
                solidColor: "#e6e6e6",
                thresholds: [],
                isGradientEnabled: false,
            },
            track: "rgba(255,255,255,0.14)",
            grid: "rgba(255,255,255,0.18)",
            divider: "rgba(255,255,255,0.18)",
        },
        textStyles: DEFAULT_RENDER_TEXT_STYLES,
        themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
        transparentSurface: DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS,
        lineSmoothingPercent: 75,
        gridLineVisibility: "adaptive",
        gridLineType: options.gridLineType ?? "horizontal",
    };
}

function buildDualChannelData(): DualChannelWidgetData {
    return {
        positive: buildWidgetData({
            label: "UP",
            current: 42,
            progress: 0.42,
            history: [12, 18, 31, 42],
            displayValue: "42",
            unit: "MB/s",
        }),
        negative: buildWidgetData({
            label: "DOWN",
            current: 76,
            progress: 0.76,
            history: [20, 32, 58, 76],
            displayValue: "76",
            unit: "MB/s",
        }),
    };
}

function buildWidgetData(overrides: Partial<WidgetData> = {}): WidgetData {
    return {
        current: overrides.current ?? 68,
        progress: overrides.progress ?? 0.68,
        history: overrides.history ?? [18, 24, 21, 36, 31, 47, 42, 58, 53, 69, 62, 76, 68],
        unit: overrides.unit ?? "%",
        label: overrides.label ?? "CPU",
        displayValue: overrides.displayValue ?? "68",
        secondaryDisplayValue: overrides.secondaryDisplayValue,
        sampleTimestampMilliseconds: overrides.sampleTimestampMilliseconds ?? 1000,
    };
}
