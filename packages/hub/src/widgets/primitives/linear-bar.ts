import type { WidgetData, KeySize } from "../../rendering/widget-data";
import { resolveColor } from "../../rendering/color-resolver";
import { adjustHexColorBrightness, clamp, escapeSvgText } from "../../rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget.interface";

export interface LinearBarConfig extends WidgetBaseConfig {
    trackColor: string;
    barHeight: number;
    borderRadius: number;
}

export const DEFAULT_LINEAR_BAR_CONFIG: LinearBarConfig = {
    colorConfig: { mode: "threshold", solidColor: "#3b82f6", thresholds: [
        { min: 0, max: 50, color: "#22c55e" },
        { min: 50, max: 80, color: "#eab308" },
        { min: 80, max: 101, color: "#ef4444" },
    ]},
    trackColor: "rgba(255,255,255,0.08)",
    barHeight: 14,
    borderRadius: 7,
    gradientHeadAdjustmentPercent: -15,
};

/**
 * Linear progress bar. Full width = 100%.
 * Renders a horizontal bar with value text above.
 */
export const linearBar: Widget<LinearBarConfig> = {
    widgetId: "linear-bar",

    render(data: WidgetData, config: LinearBarConfig, keySize: KeySize): string {
        const padding = 16;
        const barWidth = keySize.width - padding * 2;
        const fillWidth = Math.max(0, barWidth * clamp(data.progress, 0, 1));
        const barY = keySize.height / 2 + 8;
        const barColor = resolveColor(data.current, config.colorConfig);
        const barHeadColor = adjustHexColorBrightness(barColor, config.gradientHeadAdjustmentPercent ?? -15);
        const gradientId = `linear-progress-${Math.round(data.current * 10)}-${keySize.width}-${keySize.height}`;

        return `
            <defs>
                <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="${barColor}" />
                    <stop offset="100%" stop-color="${barHeadColor}" />
                </linearGradient>
            </defs>
            <!-- Linear Bar: label -->
            <text x="${keySize.width / 2}" y="${barY - config.barHeight - 18}" text-anchor="middle"
                font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
                font-size="12" fill="rgba(255,255,255,0.4)">${escapeSvgText(data.label)}</text>
            <!-- Linear Bar: value -->
            <text x="${keySize.width / 2}" y="${barY - config.barHeight - 2}" text-anchor="middle"
                font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
                font-size="28" font-weight="700" fill="white">${escapeSvgText(data.current.toFixed(0))}${escapeSvgText(data.unit)}</text>
            <!-- Linear Bar: track -->
            <rect x="${padding}" y="${barY}" width="${barWidth}" height="${config.barHeight}"
                rx="${config.borderRadius}" fill="${config.trackColor}" />
            <!-- Linear Bar: fill -->
            <rect x="${padding}" y="${barY}" width="${fillWidth}" height="${config.barHeight}"
                rx="${config.borderRadius}" fill="url(#${gradientId})" />
        `;
    },
};
