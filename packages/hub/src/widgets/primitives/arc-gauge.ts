import type { WidgetData, KeySize } from "../../rendering/widget-data";
import { resolveColor } from "../../rendering/color-resolver";
import { adjustHexColorBrightness, clamp, escapeSvgText } from "../../rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget.interface";

export interface ArcGaugeConfig extends WidgetBaseConfig {
    trackColor: string;
    strokeWidth: number;
    labelTextColor: string;
    valueTextColor: string;
    unitTextColor: string;
    innerTextScale: number;
    centerContent: "value" | "icon";
    centerIconFragment?: string;
}

export const DEFAULT_ARC_GAUGE_CONFIG: ArcGaugeConfig = {
    colorConfig: { mode: "threshold", solidColor: "#3b82f6", thresholds: [
        { min: 0, max: 50, color: "#22c55e" },
        { min: 50, max: 80, color: "#eab308" },
        { min: 80, max: 101, color: "#ef4444" },
    ]},
    trackColor: "rgba(255,255,255,0.14)",
    strokeWidth: 11,
    labelTextColor: "rgba(255,255,255,0.78)",
    valueTextColor: "white",
    unitTextColor: "rgba(255,255,255,0.74)",
    gradientHeadAdjustmentPercent: -42,
    innerTextScale: 1,
    centerContent: "value",
};

/**
 * Circular progress bar. Full circle = 100%.
 * A circle visual fits one-way single-value data, such as CPU usage, GPU usage,
 * VRAM usage, RAM usage, upload speed, or download speed.
 * Combined bidirectional data, such as upload and download together, needs a
 * different graph that can represent two values at the same time.
 * Renders a background track circle + a colored progress arc + centered value text.
 */
export const arcGauge: Widget<ArcGaugeConfig> = {
    widgetId: "arc-gauge",

    render(data: WidgetData, config: ArcGaugeConfig, keySize: KeySize): string {
        const centerXCoordinate = keySize.width / 2;
        const centerYCoordinate = keySize.height / 2;
        const outerMargin = 7;
        const radius = Math.max(20, Math.min(keySize.width, keySize.height) / 2 - outerMargin - config.strokeWidth / 2);
        const circumference = 2 * Math.PI * radius;
        const dashOffset = circumference * (1 - clamp(data.progress, 0, 1));
        const arcColor = resolveColor(data.current, config.colorConfig);
        const arcHeadColor = adjustHexColorBrightness(arcColor, config.gradientHeadAdjustmentPercent ?? -15);
        const arcMidColor = adjustHexColorBrightness(arcColor, 34);
        const gradientId = `circular-progress-${Math.round(data.current * 10)}-${keySize.width}-${keySize.height}`;

        const valueText = `${data.current.toFixed(0)}`;
        const unitText = data.unit;
        const labelText = data.label;
        const innerTextScale = config.innerTextScale;
        const labelFontSize = 19 * innerTextScale;
        const valueFontSize = 48 * innerTextScale;
        const unitFontSize = 19 * innerTextScale;
        const labelYCoordinate = centerYCoordinate - 30;
        const valueYCoordinate = centerYCoordinate + 17;
        const unitYCoordinate = centerYCoordinate + 13;
        const valueTextWidth = valueText.length * valueFontSize * 0.56;
        const unitTextWidth = unitText.length * unitFontSize * 0.58;
        const valueUnitGap = 5;
        const valueGroupWidth = valueTextWidth + valueUnitGap + unitTextWidth;
        const valueXCoordinate = centerXCoordinate - valueGroupWidth / 2 + valueTextWidth / 2;
        const unitXCoordinate = centerXCoordinate - valueGroupWidth / 2 + valueTextWidth + valueUnitGap;

        const centerContentFragment = config.centerContent === "icon"
            ? renderCenterIcon(config.centerIconFragment, centerXCoordinate, centerYCoordinate)
            : renderCenterValue({
                centerXCoordinate,
                labelYCoordinate,
                labelFontSize,
                labelText,
                valueXCoordinate,
                valueYCoordinate,
                valueFontSize,
                valueText,
                unitXCoordinate,
                unitYCoordinate,
                unitFontSize,
                unitText,
                config,
            });

        return `
            <defs>
                <linearGradient id="${gradientId}" x1="5%" y1="95%" x2="95%" y2="5%">
                    <stop offset="0%" stop-color="${arcColor}" />
                    <stop offset="50%" stop-color="${arcMidColor}" />
                    <stop offset="100%" stop-color="${arcHeadColor}" />
                </linearGradient>
            </defs>
            <!-- Arc Gauge: track -->
            <circle cx="${centerXCoordinate}" cy="${centerYCoordinate}" r="${radius}"
                fill="none" stroke="${config.trackColor}" stroke-width="${config.strokeWidth}" />
            <!-- Arc Gauge: progress arc -->
            <circle cx="${centerXCoordinate}" cy="${centerYCoordinate}" r="${radius}"
                fill="none" stroke="url(#${gradientId})" stroke-width="${config.strokeWidth}"
                stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                stroke-linecap="round"
                transform="rotate(-90 ${centerXCoordinate} ${centerYCoordinate})"
                style="transition: stroke-dashoffset 0.3s ease;" />
            ${centerContentFragment}
        `;
    },
};

function renderCenterIcon(
    centerIconFragment: string | undefined,
    centerXCoordinate: number,
    centerYCoordinate: number,
): string {
    if (!centerIconFragment) {
        return "";
    }

    return `<g transform="translate(${centerXCoordinate} ${centerYCoordinate})">${centerIconFragment}</g>`;
}

function renderCenterValue(options: {
    centerXCoordinate: number;
    labelYCoordinate: number;
    labelFontSize: number;
    labelText: string;
    valueXCoordinate: number;
    valueYCoordinate: number;
    valueFontSize: number;
    valueText: string;
    unitXCoordinate: number;
    unitYCoordinate: number;
    unitFontSize: number;
    unitText: string;
    config: ArcGaugeConfig;
}): string {
    return `
        <text x="${options.centerXCoordinate}" y="${options.labelYCoordinate}" text-anchor="middle"
            font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
            font-size="${options.labelFontSize}" font-weight="800" fill="${options.config.labelTextColor}">${escapeSvgText(options.labelText)}</text>
        <text x="${options.valueXCoordinate}" y="${options.valueYCoordinate}" text-anchor="middle" dominant-baseline="auto"
            font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
            font-size="${options.valueFontSize}" font-weight="900" fill="${options.config.valueTextColor}">${escapeSvgText(options.valueText)}</text>
        <text x="${options.unitXCoordinate}" y="${options.unitYCoordinate}" text-anchor="start" dominant-baseline="auto"
            font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
            font-size="${options.unitFontSize}" font-weight="800" fill="${options.config.unitTextColor}">${escapeSvgText(options.unitText)}</text>
    `;
}
