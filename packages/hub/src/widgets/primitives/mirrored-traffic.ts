import type { DualChannelWidgetData, KeySize } from "../../rendering/widget-data";
import { buildGradientStops, type ColorConfig } from "../../rendering/color-resolver";
import {
    buildSvgFilterAttributes,
    DEFAULT_RENDER_FOREGROUND_EFFECT_TOKENS,
    type RenderForegroundEffectTokens,
} from "../../rendering/render-foreground-effects";
import {
    DEFAULT_RENDER_TYPOGRAPHY_TOKENS,
    type RenderTypographyTokens,
} from "../../rendering/render-typography";
import { escapeSvgText } from "../../rendering/svg-utils";

export interface MirroredTrafficConfig {
    positiveColorConfig: ColorConfig;
    negativeColorConfig: ColorConfig;
    lineWidth: number;
    fillOpacity: number;
    labelTextColor: string;
    dividerColor: string;
    typography: RenderTypographyTokens;
    foregroundEffects: RenderForegroundEffectTokens;
}

export const DEFAULT_MIRRORED_TRAFFIC_CONFIG: MirroredTrafficConfig = {
    positiveColorConfig: { mode: "solid", solidColor: "#22c55e", thresholds: [], isGradientEnabled: true },
    negativeColorConfig: { mode: "solid", solidColor: "#ef4444", thresholds: [], isGradientEnabled: true },
    lineWidth: 2,
    fillOpacity: 0.2,
    labelTextColor: "rgba(255,255,255,0.5)",
    dividerColor: "rgba(255,255,255,0.15)",
    typography: DEFAULT_RENDER_TYPOGRAPHY_TOKENS,
    foregroundEffects: DEFAULT_RENDER_FOREGROUND_EFFECT_TOKENS,
};

/**
 * Mirrored traffic graph for bidirectional data (net down/up, disk read/write).
 * Positive channel renders above center line, negative channel renders below.
 */
export function renderMirroredTraffic(
    data: DualChannelWidgetData,
    config: MirroredTrafficConfig,
    keySize: KeySize,
): string {
    const padding = { top: 28, right: 8, bottom: 14, left: 8 };
    const chartWidth = keySize.width - padding.left - padding.right;
    const halfHeight = (keySize.height - padding.top - padding.bottom) / 2;
    const centerY = padding.top + halfHeight;

    const renderChannel = (
        values: readonly number[],
        colorConfig: ColorConfig,
        direction: "up" | "down",
        channelId: string,
    ): string => {
        if (values.length === 0) return "";
        const maximumValue = Math.max(...values, 0.01);
        const sign = direction === "up" ? -1 : 1;

        const points = values.map((value, index) => {
            const pointX = padding.left + (index / Math.max(values.length - 1, 1)) * chartWidth;
            const pointY = centerY + sign * (value / maximumValue) * (halfHeight - 4);
            return { x: pointX, y: pointY };
        });

        const polyline = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
        const gradientId = `mirrored-${channelId}-${Date.now()}`;
        const stops = buildGradientStops(values, colorConfig);
        const channelPaint = colorConfig.isGradientEnabled
            ? `url(#${gradientId})`
            : stops[stops.length - 1]?.color ?? colorConfig.solidColor;
        const gradientStops = stops
            .map(stop => `<stop offset="${(stop.offset * 100).toFixed(1)}%" stop-color="${stop.color}" />`)
            .join("\n            ");

        const lastPoint = points[points.length - 1];
        const firstPoint = points[0];
        const areaPath = `M ${firstPoint.x},${centerY} ` +
            points.map(point => `L ${point.x},${point.y}`).join(" ") +
            ` L ${lastPoint.x},${centerY} Z`;

        return `
            ${colorConfig.isGradientEnabled ? `<defs>
                <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                    ${gradientStops}
                </linearGradient>
            </defs>` : ""}
            <path d="${areaPath}" fill="${channelPaint}" opacity="${config.fillOpacity}" ${buildSvgFilterAttributes(config.foregroundEffects.subtleFilter).join(" ")} />
            <polyline points="${polyline}" fill="none"
                stroke="${channelPaint}" stroke-width="${config.lineWidth}"
                stroke-linejoin="round" stroke-linecap="round" ${buildSvgFilterAttributes(config.foregroundEffects.metricFilter).join(" ")} />
        `;
    };

    const positiveLabel = `${data.positive.current.toFixed(1)} ${data.positive.unit}`;
    const negativeLabel = `${data.negative.current.toFixed(1)} ${data.negative.unit}`;
    const labelFilterAttributes = buildSvgFilterAttributes(config.foregroundEffects.labelFilter);
    const subtleFilterAttributes = buildSvgFilterAttributes(config.foregroundEffects.subtleFilter);

    return `
        <!-- Mirrored Traffic: labels -->
        <text x="10" y="14" font-family="${escapeSvgText(config.typography.labelFontFamily)}" font-size="11" fill="${config.labelTextColor}" ${labelFilterAttributes.join(" ")}>
            ▼ ${escapeSvgText(positiveLabel)}</text>
        <text x="${keySize.width - 10}" y="14" text-anchor="end"
            font-family="${escapeSvgText(config.typography.labelFontFamily)}" font-size="11" fill="${config.labelTextColor}" ${labelFilterAttributes.join(" ")}>
            ▲ ${escapeSvgText(negativeLabel)}</text>
        <!-- Mirrored Traffic: center line -->
        <line x1="${padding.left}" y1="${centerY}" x2="${keySize.width - padding.right}" y2="${centerY}"
            stroke="${config.dividerColor}" stroke-width="1" stroke-dasharray="4,3" ${subtleFilterAttributes.join(" ")} />
        <!-- Mirrored Traffic: positive (download/read) -->
        ${renderChannel(data.positive.history, config.positiveColorConfig, "up", "pos")}
        <!-- Mirrored Traffic: negative (upload/write) -->
        ${renderChannel(data.negative.history, config.negativeColorConfig, "down", "neg")}
    `;
}
