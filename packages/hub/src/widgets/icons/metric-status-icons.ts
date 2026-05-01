import type { ArcGaugeStatusIcon } from "../primitives/arc-gauge";

export type MetricStatusIconKind = "percentage" | "temperature" | "memory";

export function getMetricStatusIcon(kind: MetricStatusIconKind): ArcGaugeStatusIcon {
    if (kind === "temperature") {
        return buildTemperatureStatusIcon();
    }

    if (kind === "memory") {
        return buildMemoryStatusIcon();
    }

    return buildPercentageStatusIcon();
}

function buildPercentageStatusIcon(): ArcGaugeStatusIcon {
    return {
        viewBox: { x: -10, y: -10, width: 20, height: 20 },
        sizeRatio: 2.25,
        opticalYOffsetRatio: 0.6,
        fragment: `
            <g stroke="rgba(255,255,255,0.92)" stroke-width="1.8" fill="none">
                <!-- 左上和右下的空心圆 -->
                <circle cx="-4.5" cy="-4.5" r="2.8" />
                <circle cx="4.5" cy="4.5" r="2.8" />
                <!-- 中间的实心斜杠 -->
                <rect x="-1.4" y="-10" width="2.8" height="20" rx="1.4"
                    fill="rgba(255,255,255,0.92)" stroke="none"
                    transform="rotate(36)" />
            </g>
        `,
    };
}

function buildTemperatureStatusIcon(): ArcGaugeStatusIcon {
    return {
        viewBox: { x: -7, y: -11, width: 14, height: 22 },
        sizeRatio: 2.1,
        opticalYOffsetRatio: 0.6,
        fragment: `
            <g fill="none" stroke="rgba(255,255,255,0.9)" stroke-linecap="round" stroke-linejoin="round">
                <path d="M -3 1.5 V -7 A 3 3 0 0 1 3 -7 V 1.5" stroke-width="2.4" />
                <circle cx="0" cy="5" r="4.8" stroke-width="2.4" />
                <path d="M 0 3 V -3.5" stroke-width="1.8" opacity="0.95" />
                <circle cx="0" cy="5" r="1.8" fill="rgba(255,255,255,0.9)" stroke="none" />
            </g>
        `,
    };
}

function buildMemoryStatusIcon(): ArcGaugeStatusIcon {
    return {
        viewBox: { x: -11, y: -11, width: 22, height: 22 },
        sizeRatio: 2.15,
        opticalYOffsetRatio: 0.16,
        fragment: `
            <g fill="none" stroke="rgba(255,255,255,0.9)" stroke-linecap="round" stroke-linejoin="round">
                <rect x="-9" y="-6" width="18" height="12" rx="2" stroke-width="3" />
                <path d="M -5 -10 L -5 -6 M 0 -10 L 0 -6 M 5 -10 L 5 -6" stroke-width="2.5" />
                <path d="M -5 6 L -5 10 M 0 6 L 0 10 M 5 6 L 5 10" stroke-width="2.5" />
            </g>
        `,
    };
}
