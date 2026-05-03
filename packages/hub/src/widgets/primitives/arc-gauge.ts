import type { WidgetData, KeySize } from "../../rendering/widget-data";
import { resolveColor } from "../../rendering/color-resolver";
import {
    adjustHexColorBrightness,
    clamp,
    renderConstrainedSvgText,
} from "../../rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget.interface";
import { assertArcGaugeLabel } from "./arc-gauge-label";
import { renderMetricTextRow } from "./metric-text-row";

type ArcGaugeCenterContent = "value" | "icon" | "icon-value-unit";

export interface ArcGaugeStatusIcon {
    fragment: string;
    viewBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    sizeRatio?: number;
    opticalYOffsetRatio?: number;
}

export interface ArcGaugeConfig extends WidgetBaseConfig {
    trackColor: string;
    strokeWidth: number;
    labelTextColor: string;
    valueTextColor: string;
    unitTextColor: string;
    innerTextScale: number;
    centerContent: ArcGaugeCenterContent;
    centerIconFragment?: string;
    statusIcon?: ArcGaugeStatusIcon;
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

const ARC_LAYOUT = {
    outerMargin: 7,
    minimumRadius: 20,
    label: {
        fontSize: 23,
        yOffset: -28,
    },
    topIcon: {
        yOffset: -32,
    },
    statusIconGapWidthRatio: 5,
    statusIconDefaultSizeRatio: 2.35,
    statusIconDefaultOpticalYOffsetRatio: 0.24,
    networkValueScale: 0.9,
    placeholderValueScale: 0.68,
    singleDigitValueOpticalYOffset: -4,
    value: {
        fontSize: 48,
        yOffset: 12,
    },
    unit: {
        fontSize: 19,
        yOffset: 40,
    },
} as const;

const ARC_TEXT_FONT_FAMILY = "'Inter','SF Pro Display','Segoe UI',sans-serif";

interface ArcGaugeGeometry {
    centerXCoordinate: number;
    centerYCoordinate: number;
    radius: number;
    circumference: number;
}

interface StatusNotchGeometry {
    gapLength: number;
    visibleLength: number;
    startRotationDegrees: number;
    iconSize: number;
    iconCenterYCoordinate: number;
}

/**
 * Circular progress bar. Full circle = 100%.
 * A circle visual fits one-way single-value data, such as CPU usage, GPU usage,
 * VRAM usage, RAM usage, upload speed, or download speed.
 * Combined bidirectional data, such as upload and download together, needs a
 * different graph that can represent two values at the same time.
 * Renders a background track circle + a colored progress arc + centered content.
 */
export const arcGauge: Widget<ArcGaugeConfig> = {
    widgetId: "arc-gauge",

    render(data: WidgetData, config: ArcGaugeConfig, keySize: KeySize): string {
        const centerXCoordinate = keySize.width / 2;
        const centerYCoordinate = keySize.height / 2;
        const radius = Math.max(
            ARC_LAYOUT.minimumRadius,
            Math.min(keySize.width, keySize.height) / 2 - ARC_LAYOUT.outerMargin - config.strokeWidth / 2,
        );
        const circumference = 2 * Math.PI * radius;
        const geometry = {
            centerXCoordinate,
            centerYCoordinate,
            radius,
            circumference,
        };
        const arcColor = resolveColor(data.current, config.colorConfig);
        const arcHeadColor = adjustHexColorBrightness(arcColor, config.gradientHeadAdjustmentPercent ?? -15);
        const arcMidColor = adjustHexColorBrightness(arcColor, 34);
        const gradientId = `circular-progress-${Math.round(data.current * 10)}-${keySize.width}-${keySize.height}`;
        const statusNotchGeometry = config.centerContent === "icon" && config.statusIcon
            ? buildStatusNotchGeometry(geometry, config.strokeWidth, config.statusIcon)
            : null;

        const innerTextScale = config.innerTextScale;
        const labelFontSize = ARC_LAYOUT.label.fontSize * innerTextScale;
        const isIconValueUnit = config.centerContent === "icon-value-unit";
        const metricTextScale = isIconValueUnit ? ARC_LAYOUT.networkValueScale : 1;
        const valueText = data.displayValue ?? `${data.current.toFixed(0)}`;
        const placeholderTextScale = valueText === "N/A" ? ARC_LAYOUT.placeholderValueScale : 1;
        const valueFontSize = ARC_LAYOUT.value.fontSize * innerTextScale * metricTextScale * placeholderTextScale;
        const unitFontSize = ARC_LAYOUT.unit.fontSize * innerTextScale * metricTextScale;
        const labelYCoordinate = centerYCoordinate + ARC_LAYOUT.label.yOffset;
        const valueOpticalYOffset = isIconValueUnit && valueText.length === 1
            ? ARC_LAYOUT.singleDigitValueOpticalYOffset
            : 0;
        const valueCenterYCoordinate = centerYCoordinate + ARC_LAYOUT.value.yOffset + valueOpticalYOffset;
        const unitText = data.unit;
        const labelMaxWidth = Math.max(24, radius * 1.55);
        const centerTextMaxWidth = Math.max(24, radius * 1.58);
        const centerContentFragment = renderCenterContent({
            centerContent: config.centerContent,
            centerIconFragment: config.centerIconFragment,
            statusIcon: config.statusIcon,
            statusNotchGeometry,
            centerXCoordinate,
            centerYCoordinate,
            labelYCoordinate,
            labelFontSize,
            labelText: data.label,
            labelMaxWidth,
            valueCenterYCoordinate,
            valueFontSize,
            valueText,
            unitFontSize,
            unitText,
            centerTextMaxWidth,
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
            ${renderRing({
                geometry,
                progress: data.progress,
                trackColor: config.trackColor,
                progressStroke: `url(#${gradientId})`,
                strokeWidth: config.strokeWidth,
                statusNotchGeometry,
            })}
            ${centerContentFragment}
        `;
    },
};

function renderCenterContent(options: {
    centerContent: ArcGaugeCenterContent;
    centerIconFragment: string | undefined;
    statusIcon: ArcGaugeStatusIcon | undefined;
    statusNotchGeometry: StatusNotchGeometry | null;
    centerXCoordinate: number;
    centerYCoordinate: number;
    labelYCoordinate: number;
    labelFontSize: number;
    labelText: string;
    labelMaxWidth: number;
    valueCenterYCoordinate: number;
    valueFontSize: number;
    valueText: string;
    unitFontSize: number;
    unitText: string;
    centerTextMaxWidth: number;
    config: ArcGaugeConfig;
}): string {
    if (options.centerContent === "icon") {
        return `
            ${renderStatusIcon(options.statusIcon, options.centerXCoordinate, options.statusNotchGeometry)}
            ${renderCenterIcon(options.centerIconFragment, options.centerXCoordinate, options.centerYCoordinate)}
        `;
    }

    if (options.centerContent === "icon-value-unit") {
        return renderIconValueUnit(options);
    }

    return renderCenterValue(options);
}

function renderStatusIcon(
    statusIcon: ArcGaugeStatusIcon | undefined,
    centerXCoordinate: number,
    statusNotchGeometry: StatusNotchGeometry | null,
): string {
    if (!statusIcon || !statusNotchGeometry) {
        return "";
    }

    return `
        <svg x="${centerXCoordinate - statusNotchGeometry.iconSize / 2}"
            y="${statusNotchGeometry.iconCenterYCoordinate - statusNotchGeometry.iconSize / 2}"
            width="${statusNotchGeometry.iconSize}" height="${statusNotchGeometry.iconSize}"
            viewBox="${statusIcon.viewBox.x} ${statusIcon.viewBox.y} ${statusIcon.viewBox.width} ${statusIcon.viewBox.height}">
            ${statusIcon.fragment}
        </svg>
    `;
}

function buildStatusNotchGeometry(
    geometry: ArcGaugeGeometry,
    strokeWidth: number,
    statusIcon: ArcGaugeStatusIcon,
): StatusNotchGeometry {
    const gapWidth = strokeWidth * ARC_LAYOUT.statusIconGapWidthRatio;
    const gapAngleRadians = 2 * Math.asin(clamp(gapWidth / (2 * geometry.radius), 0.1, 0.8));
    const gapAngleDegrees = gapAngleRadians * 180 / Math.PI;
    const gapLength = geometry.circumference * (gapAngleDegrees / 360);
    const iconSize = strokeWidth * (statusIcon.sizeRatio ?? ARC_LAYOUT.statusIconDefaultSizeRatio);
    const opticalYOffset = strokeWidth * (
        statusIcon.opticalYOffsetRatio ?? ARC_LAYOUT.statusIconDefaultOpticalYOffsetRatio
    );

    return {
        gapLength,
        visibleLength: geometry.circumference - gapLength,
        startRotationDegrees: -90 + gapAngleDegrees / 2,
        iconSize,
        iconCenterYCoordinate: geometry.centerYCoordinate - geometry.radius + opticalYOffset,
    };
}

function renderRing(options: {
    geometry: ArcGaugeGeometry;
    progress: number;
    trackColor: string;
    progressStroke: string;
    strokeWidth: number;
    statusNotchGeometry: StatusNotchGeometry | null;
}): string {
    const progress = clamp(options.progress, 0, 1);
    const trackDashArray = options.statusNotchGeometry
        ? `${options.statusNotchGeometry.visibleLength} ${options.statusNotchGeometry.gapLength}`
        : `${options.geometry.circumference}`;
    const progressLength = options.statusNotchGeometry
        ? options.statusNotchGeometry.visibleLength * progress
        : options.geometry.circumference;
    const rotationDegrees = options.statusNotchGeometry?.startRotationDegrees ?? -90;
    const progressRing = progress > 0
        ? renderRingCircle({
            geometry: options.geometry,
            stroke: options.progressStroke,
            strokeWidth: options.strokeWidth,
            dashArray: options.statusNotchGeometry
                ? `${progressLength} ${options.geometry.circumference - progressLength}`
                : `${options.geometry.circumference}`,
            dashOffset: options.statusNotchGeometry ? 0 : options.geometry.circumference * (1 - progress),
            rotationDegrees,
        })
        : "";

    return `
        <!-- Arc Gauge: track -->
        ${renderRingCircle({
            geometry: options.geometry,
            stroke: options.trackColor,
            strokeWidth: options.strokeWidth,
            dashArray: trackDashArray,
            dashOffset: 0,
            rotationDegrees,
        })}
        <!-- Arc Gauge: progress arc -->
        ${progressRing}
    `;
}

function renderRingCircle(options: {
    geometry: ArcGaugeGeometry;
    stroke: string;
    strokeWidth: number;
    dashArray: string;
    dashOffset: number;
    rotationDegrees: number;
}): string {
    return `
        <circle cx="${options.geometry.centerXCoordinate}" cy="${options.geometry.centerYCoordinate}" r="${options.geometry.radius}"
            fill="none" stroke="${options.stroke}" stroke-width="${options.strokeWidth}"
            stroke-dasharray="${options.dashArray}" stroke-dashoffset="${options.dashOffset}"
            stroke-linecap="round"
            transform="rotate(${options.rotationDegrees} ${options.geometry.centerXCoordinate} ${options.geometry.centerYCoordinate})"
            style="transition: stroke-dashoffset 0.3s ease;" />
    `;
}

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
    labelMaxWidth: number;
    valueCenterYCoordinate: number;
    valueFontSize: number;
    valueText: string;
    unitFontSize: number;
    unitText: string;
    centerTextMaxWidth: number;
    config: ArcGaugeConfig;
}): string {
    assertArcGaugeLabel(options.labelText);

    return `
        ${renderConstrainedSvgText({
            id: "arc-label",
            text: options.labelText,
            xCoordinate: options.centerXCoordinate,
            yCoordinate: options.labelYCoordinate,
            maxWidth: options.labelMaxWidth,
            fontSize: options.labelFontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 800,
            fill: options.config.labelTextColor,
            textAnchor: "middle",
        })}
        ${renderMetricTextRow({
            id: "arc-value-unit",
            valueText: options.valueText,
            unitText: options.unitText,
            xCoordinate: options.centerXCoordinate,
            yCoordinate: options.valueCenterYCoordinate,
            width: options.centerTextMaxWidth,
            valueFontSize: options.valueFontSize,
            unitFontSize: options.unitFontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            valueFontWeight: 900,
            unitFontWeight: 800,
            valueFill: options.config.valueTextColor,
            unitFill: options.config.unitTextColor,
            textAnchor: "middle",
            valueExtraAttributes: ["font-variant-numeric=\"tabular-nums\""],
        })}
    `;
}

function renderIconValueUnit(options: {
    centerIconFragment: string | undefined;
    centerXCoordinate: number;
    centerYCoordinate: number;
    valueCenterYCoordinate: number;
    valueFontSize: number;
    valueText: string;
    unitFontSize: number;
    unitText: string;
    centerTextMaxWidth: number;
    config: ArcGaugeConfig;
}): string {
    return `
        ${renderCenterIcon(
            options.centerIconFragment,
            options.centerXCoordinate,
            options.centerYCoordinate + ARC_LAYOUT.topIcon.yOffset,
        )}
        ${renderConstrainedSvgText({
            id: "arc-icon-value",
            text: options.valueText,
            xCoordinate: options.centerXCoordinate,
            yCoordinate: options.valueCenterYCoordinate,
            maxWidth: options.centerTextMaxWidth,
            fontSize: options.valueFontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 900,
            fill: options.config.valueTextColor,
            textAnchor: "middle",
            extraAttributes: ["font-variant-numeric=\"tabular-nums\""],
        })}
        ${renderConstrainedSvgText({
            id: "arc-icon-unit",
            text: options.unitText,
            xCoordinate: options.centerXCoordinate,
            yCoordinate: options.centerYCoordinate + ARC_LAYOUT.unit.yOffset,
            maxWidth: options.centerTextMaxWidth,
            fontSize: options.unitFontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 800,
            fill: options.config.unitTextColor,
            textAnchor: "middle",
        })}
    `;
}
