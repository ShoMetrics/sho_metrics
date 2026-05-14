import assert from "node:assert/strict";
import test from "node:test";
import { resolveColorForThresholdValue } from "./color-resolver";
import { renderDualMetricBodyView } from "./dual-metric-view";
import { renderMetricFrame } from "./metric-frame";
import { renderSingleMetricBodyView } from "./single-metric-view";
import {
    scanChromaticSvgPaintValues,
} from "./svg-paint-scanner";
import type { DualChannelWidgetData, WidgetData } from "./widget-data";
import { WIDGET_LOGICAL_SIZE } from "./widget-data";
import type { ResolvedAppearanceSettings } from "../settings/resolved-settings";
import { buildSampleResolvedAppearanceSettings } from "../settings/sample-appearance-settings";
import {
    buildMetricVisualSettings,
    type ResolvedMetricVisualSettings,
} from "../settings/visual-adapter";
import type { ArcGaugeStatusIcon } from "../widgets/primitives/arc-gauge";
import { getHardwareIconFragment } from "../widgets/icons/hardware-icons";
import { getMetricStatusIcon } from "../widgets/icons/metric-status-icons";
import { renderNetworkDirectionIconFragment } from "../widgets/icons/catalog/network";

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
            name: "flat circular compact icon",
            svg: renderSingleFinalSvg({
                viewLayout: "circular",
                theme: "flat",
                circleStyle: "compact",
                centerIcon: getHardwareIconFragment("cpu"),
                statusIcon: getMetricStatusIcon("percentage"),
            }),
        },
        {
            name: "cupertino glass text",
            svg: renderSingleFinalSvg({
                viewLayout: "text",
                theme: "cupertino-glass",
                data: buildWidgetData({ secondaryDisplayValue: "Peak 91%" }),
            }),
        },
        {
            name: "flat linear",
            svg: renderSingleFinalSvg({
                viewLayout: "linear",
                theme: "flat",
                linearIcon: getHardwareIconFragment("memory"),
                data: buildWidgetData({ secondaryDisplayValue: "12.8 GB used" }),
            }),
        },
        {
            name: "cupertino glass sparkline",
            svg: renderSingleFinalSvg({
                viewLayout: "sparkline",
                theme: "cupertino-glass",
                linearIcon: getHardwareIconFragment("gpu"),
                gridLineType: "vertical",
            }),
        },
        {
            name: "flat dual circular gauge",
            svg: renderDualFinalSvg({
                theme: "flat",
                graphicType: "circular",
                circleStyle: "gauge",
            }),
        },
        {
            name: "cupertino glass dual sparkline",
            svg: renderDualFinalSvg({
                theme: "cupertino-glass",
                graphicType: "sparkline",
            }),
        },
    ];

    for (const testCase of testCases) {
        assert.deepEqual(scanChromaticSvgPaintValues(testCase.svg), [], testCase.name);
    }
});

function renderSingleFinalSvg(options: {
    viewLayout: ResolvedAppearanceSettings["viewLayout"];
    theme: ResolvedAppearanceSettings["theme"];
    circleStyle?: ResolvedAppearanceSettings["circleStyle"];
    gridLineType?: ResolvedAppearanceSettings["gridLineType"];
    data?: WidgetData;
    centerIcon?: string;
    footerIcon?: string;
    linearIcon?: string;
    statusIcon?: ArcGaugeStatusIcon;
}): string {
    const visualSettings = buildBlackWhiteVisualSettings({
        viewLayout: options.viewLayout,
        theme: options.theme,
        circleStyle: options.circleStyle ?? "value",
        gridLineType: options.gridLineType ?? "horizontal",
    });
    const body = renderSingleMetricBodyView({
        data: options.data ?? buildWidgetData(),
        visual: visualSettings,
        renderSize: WIDGET_LOGICAL_SIZE,
        centerIcon: options.centerIcon ?? "",
        footerIcon: options.footerIcon,
        linearIcon: options.linearIcon,
        statusIcon: options.statusIcon,
        circleStyle: visualSettings.circleStyle,
    });

    return renderMetricFrame({
        body,
        graphicStyle: visualSettings.graphicStyle,
        muted: false,
        paints: visualSettings.paints,
        size: WIDGET_LOGICAL_SIZE,
    });
}

function renderDualFinalSvg(options: {
    theme: ResolvedAppearanceSettings["theme"];
    graphicType: "circular" | "text" | "sparkline";
    circleStyle?: ResolvedAppearanceSettings["circleStyle"];
}): string {
    const visualSettings = buildBlackWhiteVisualSettings({
        viewLayout: options.graphicType === "text" ? "text" : options.graphicType,
        theme: options.theme,
        circleStyle: options.circleStyle ?? "value",
    });
    const channelColor = resolveColorForThresholdValue(50, visualSettings.paints.primaryMetric);
    const body = renderDualMetricBodyView({
        data: buildDualChannelData(),
        visual: visualSettings,
        graphicType: options.graphicType,
        renderSize: WIDGET_LOGICAL_SIZE,
        titleText: "NETWORK",
        chartMode: "overlay",
        centerContent: "value",
        circleStyle: visualSettings.circleStyle,
        topIcon: getHardwareIconFragment("disk"),
        positive: {
            color: channelColor,
            colorConfig: visualSettings.paints.primaryMetric,
            icon: renderNetworkDirectionIconFragment({
                direction: "upload",
                color: channelColor,
                size: 30,
            }),
        },
        negative: {
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
        body,
        graphicStyle: visualSettings.graphicStyle,
        muted: false,
        paints: visualSettings.paints,
        size: WIDGET_LOGICAL_SIZE,
    });
}

function buildBlackWhiteVisualSettings(
    overrides: Partial<ResolvedAppearanceSettings>,
): ResolvedMetricVisualSettings {
    return buildMetricVisualSettings(buildSampleResolvedAppearanceSettings({
        ...overrides,
        colorMode: "black-white",
    }));
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
