import type { WidgetData, KeySize } from "../../rendering/widget-data";
import { buildGradientStops, resolveColor } from "../../rendering/color-resolver";
import { escapeSvgText } from "../../rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget.interface";

export interface SparklineConfig extends WidgetBaseConfig {
    lineWidth: number;
    fillOpacity: number;   // 0–1, area fill under the line
    showDots: boolean;
    dashPattern: string;
}

export const DEFAULT_SPARKLINE_CONFIG: SparklineConfig = {
    colorConfig: { mode: "threshold", solidColor: "#3b82f6", thresholds: [
        { min: 0, max: 50, color: "#22c55e" },
        { min: 50, max: 80, color: "#eab308" },
        { min: 80, max: 101, color: "#ef4444" },
    ]},
    lineWidth: 2,
    fillOpacity: 0.15,
    showDots: false,
    dashPattern: "4 4",
};

/**
 * Sparkline (mini line chart) showing metric values over time.
 * Supports threshold-based color gradients: different segments of the line
 * render in different colors based on the value at each point.
 */
export const sparkline: Widget<SparklineConfig> = {
    widgetId: "sparkline",

    render(data: WidgetData, config: SparklineConfig, keySize: KeySize): string {
        const padding = { top: 32, right: 8, bottom: 28, left: 8 };
        const chartWidth = keySize.width - padding.left - padding.right;
        const chartHeight = keySize.height - padding.top - padding.bottom;

        const values = data.history.length > 0 ? data.history : [0];
        const maximumValue = Math.max(...values, 1);

        // Map data points to SVG coordinates
        const points = values.map((value, index) => {
            const pointX = padding.left + (index / Math.max(values.length - 1, 1)) * chartWidth;
            const pointY = padding.top + chartHeight - (value / maximumValue) * chartHeight;
            return { x: pointX, y: pointY };
        });

        const polylinePoints = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
        const gradientId = `sparkline-grad-${Date.now()}`;

        // Build gradient stops for threshold coloring
        const stops = buildGradientStops(values, config.colorConfig);
        const gradientStops = stops
            .map(stop => `<stop offset="${(stop.offset * 100).toFixed(1)}%" stop-color="${stop.color}" />`)
            .join("\n            ");

        // Area fill path (close at bottom)
        const lastPoint = points[points.length - 1];
        const firstPoint = points[0];
        const areaPath = `M ${firstPoint.x},${firstPoint.y} ` +
            points.slice(1).map(point => `L ${point.x},${point.y}`).join(" ") +
            ` L ${lastPoint.x},${padding.top + chartHeight} L ${firstPoint.x},${padding.top + chartHeight} Z`;

        const areaFillId = `sparkline-area-${Date.now()}`;

        // Current value color
        const currentColor = resolveColor(data.current, config.colorConfig);
        const valueText = data.displayValue ?? data.current.toFixed(1);

        // Latest value dot
        const dotSvg = config.showDots && lastPoint
            ? `<circle cx="${lastPoint.x}" cy="${lastPoint.y}" r="3" fill="${currentColor}" />`
            : "";

        return `
            <defs>
                <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                    ${gradientStops}
                </linearGradient>
                <linearGradient id="${areaFillId}" x1="0%" y1="0%" x2="100%" y2="0%">
                    ${gradientStops}
                </linearGradient>
            </defs>
            <!-- Sparkline: label -->
            <text x="${keySize.width / 2}" y="16" text-anchor="middle"
                font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
                font-size="12" fill="rgba(255,255,255,0.4)">${escapeSvgText(data.label)}</text>
            <!-- Sparkline: current value -->
            <text x="${keySize.width / 2}" y="28" text-anchor="middle"
                font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
                font-size="13" font-weight="600" fill="${currentColor}">${escapeSvgText(valueText)}${escapeSvgText(data.unit)}</text>
            <!-- Sparkline: area fill -->
            <path d="${areaPath}" fill="url(#${areaFillId})" opacity="${config.fillOpacity}" />
            <!-- Sparkline: line -->
            <polyline points="${polylinePoints}" fill="none"
                stroke="url(#${gradientId})" stroke-width="${config.lineWidth}"
                stroke-dasharray="${config.dashPattern}"
                stroke-linejoin="round" stroke-linecap="round" />
            ${dotSvg}
            <!-- Sparkline: bottom line -->
            <line x1="${padding.left}" y1="${padding.top + chartHeight}"
                x2="${keySize.width - padding.right}" y2="${padding.top + chartHeight}"
                stroke="rgba(255,255,255,0.08)" stroke-width="1" />
        `;
    },
};
