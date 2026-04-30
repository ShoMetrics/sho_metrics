import type { DualChannelWidgetData, KeySize } from "../../rendering/widget-data";
import { buildGradientStops, type ColorConfig } from "../../rendering/color-resolver";

export interface MirroredTrafficConfig {
    positiveColorConfig: ColorConfig;
    negativeColorConfig: ColorConfig;
    lineWidth: number;
    fillOpacity: number;
}

export const DEFAULT_MIRRORED_TRAFFIC_CONFIG: MirroredTrafficConfig = {
    positiveColorConfig: { mode: "solid", solidColor: "#22c55e", thresholds: [] },
    negativeColorConfig: { mode: "solid", solidColor: "#ef4444", thresholds: [] },
    lineWidth: 2,
    fillOpacity: 0.2,
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
        const maxVal = Math.max(...values, 0.01);
        const sign = direction === "up" ? -1 : 1;

        const points = values.map((value, index) => {
            const pointX = padding.left + (index / Math.max(values.length - 1, 1)) * chartWidth;
            const pointY = centerY + sign * (value / maxVal) * (halfHeight - 4);
            return { x: pointX, y: pointY };
        });

        const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const gradId = `mirrored-${channelId}-${Date.now()}`;
        const stops = buildGradientStops(values, colorConfig);
        const gradientStops = stops
            .map(s => `<stop offset="${(s.offset * 100).toFixed(1)}%" stop-color="${s.color}" />`)
            .join("\n            ");

        const lastPoint = points[points.length - 1];
        const firstPoint = points[0];
        const areaPath = `M ${firstPoint.x},${centerY} ` +
            points.map(p => `L ${p.x},${p.y}`).join(" ") +
            ` L ${lastPoint.x},${centerY} Z`;

        return `
            <defs>
                <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
                    ${gradientStops}
                </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#${gradId})" opacity="${config.fillOpacity}" />
            <polyline points="${polyline}" fill="none"
                stroke="url(#${gradId})" stroke-width="${config.lineWidth}"
                stroke-linejoin="round" stroke-linecap="round" />
        `;
    };

    const posLabel = `${data.positive.current.toFixed(1)} ${data.positive.unit}`;
    const negLabel = `${data.negative.current.toFixed(1)} ${data.negative.unit}`;

    return `
        <!-- Mirrored Traffic: labels -->
        <text x="10" y="14" font-family="'Inter',sans-serif" font-size="11" fill="rgba(255,255,255,0.5)">
            ▼ ${posLabel}</text>
        <text x="${keySize.width - 10}" y="14" text-anchor="end"
            font-family="'Inter',sans-serif" font-size="11" fill="rgba(255,255,255,0.5)">
            ▲ ${negLabel}</text>
        <!-- Mirrored Traffic: center line -->
        <line x1="${padding.left}" y1="${centerY}" x2="${keySize.width - padding.right}" y2="${centerY}"
            stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-dasharray="4,3" />
        <!-- Mirrored Traffic: positive (download/read) -->
        ${renderChannel(data.positive.history, config.positiveColorConfig, "up", "pos")}
        <!-- Mirrored Traffic: negative (upload/write) -->
        ${renderChannel(data.negative.history, config.negativeColorConfig, "down", "neg")}
    `;
}
