import type { WidgetData, KeySize } from "../../rendering/widget-data";
import { resolveColorForThresholdValue } from "../../rendering/color-resolver";
import {
    clamp,
    renderConstrainedSvgText,
    type SvgTextAnchor,
} from "../../rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget.interface";
import { assertArcGaugeLabel } from "./arc-gauge-label";
import {
    buildGaugeRangeColorPlan,
    formatSvgNumber,
    renderGaugeMarkerDot,
    renderGaugeRangeArcSegments,
    renderGradientStop,
    resolveGaugeMarkerDot,
    type ArcGaugeGeometry,
    type GaugeRangeColorPlan,
    type RingNotchGeometry,
} from "./arc-gauge-range";
import { renderMetricTextRow } from "./metric-text-row";

export type ArcGaugeStyle = "value" | "compact" | "gauge";

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
    circleStyle: ArcGaugeStyle;
    gaugeRangeBlendProgress: number;
    centerIconFragment?: string;
    footerIconFragment?: string;
    statusIcon?: ArcGaugeStatusIcon;
}

export const DEFAULT_ARC_GAUGE_CONFIG: ArcGaugeConfig = {
    colorConfig: { mode: "threshold", solidColor: "#3b82f6", thresholds: [
        { min: 0, max: 50, color: "#22c55e" },
        { min: 50, max: 80, color: "#eab308" },
        { min: 80, max: 101, color: "#ef4444" },
    ], isGradientEnabled: true },
    trackColor: "rgba(255,255,255,0.14)",
    strokeWidth: 11,
    labelTextColor: "rgba(255,255,255,0.78)",
    valueTextColor: "white",
    unitTextColor: "rgba(255,255,255,0.74)",
    gradientHeadAdjustmentPercent: -42,
    innerTextScale: 1,
    circleStyle: "value",
    gaugeRangeBlendProgress: 0.16,
};

const ARC_LAYOUT = {
    outerMargin: 7,
    minimumRadius: 20,
    label: {
        fontSize: 23,
        yOffset: -28,
    },
    statusIconGapWidthRatio: 5,
    statusIconDefaultSizeRatio: 2.35,
    statusIconDefaultOpticalYOffsetRatio: 0.24,
    gaugeGapAngleDegrees: 92,
    gaugeMarkerRadiusRatio: 0.78,
    gaugeMarkerGapPaddingRatio: 0.22,
    gaugeMarkerGapScale: 1.5,
    gaugeValueYOffset: 2,
    gaugeValueRow: {
        shortUnitValueEndXOffset: 20,
        shortUnitStartXOffset: 25,
        shortUnitTwoDigitOpticalXOffset: -6,
        shortUnitValueMaxWidth: 74,
        shortUnitMaxWidth: 28,
        shortUnitDigitFontSizes: {
            one: 48,
            two: 48,
            three: 31,
            many: 21,
        },
        longUnitValueEndXOffset: 2,
        longUnitStartXOffset: 13,
        longUnitFontSize: 13,
        longUnitValueMaxWidth: 52,
        longUnitMaxWidth: 46,
        longUnitDigitFontSizes: {
            one: 43,
            two: 37,
            three: 25,
            many: 21,
        },
    },
    gaugeBottomLabel: {
        fontSize: 20,
        yOffset: 45,
        iconScale: 0.54,
        iconGap: 5,
    },
    placeholderValueScale: 0.68,
    value: {
        fontSize: 48,
        yOffset: 12,
    },
    footerIcon: {
        yOffset: 39,
        valueRowXOffset: 6,
    },
    unit: {
        fontSize: 19,
        yOffset: 40,
    },
} as const;

const ARC_TEXT_FONT_FAMILY = "'Inter','SF Pro Display','Segoe UI',sans-serif";
const GAUGE_INLINE_ICON_ASSUMED_SIZE = 30;

interface StatusNotchGeometry {
    gapLength: number;
    visibleLength: number;
    startRotationDegrees: number;
    gapAngleDegrees: number;
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
        const arcColor = resolveColorForThresholdValue(data.current, config.colorConfig);
        const gradientId = `circular-progress-${Math.round(data.current * 10)}-${keySize.width}-${keySize.height}`;
        const circleStyle = config.circleStyle;
        const rangeColorPlan = buildGaugeRangeColorPlan({
            circleStyle,
            colorConfig: config.colorConfig,
            baseColor: arcColor,
            progress: data.progress,
            gradientHeadAdjustmentPercent: config.gradientHeadAdjustmentPercent ?? -15,
            gaugeRangeBlendProgress: config.gaugeRangeBlendProgress,
        });
        const statusNotchGeometry = circleStyle === "compact" && config.statusIcon
            ? buildStatusNotchGeometry(geometry, config.strokeWidth, config.statusIcon)
            : null;
        const gaugeNotchGeometry = circleStyle === "gauge"
            ? buildGaugeNotchGeometry(geometry)
            : null;
        const ringNotchGeometry = statusNotchGeometry ?? gaugeNotchGeometry;

        const innerTextScale = config.innerTextScale;
        const labelFontSize = ARC_LAYOUT.label.fontSize * innerTextScale;
        const valueText = data.displayValue ?? `${data.current.toFixed(0)}`;
        const placeholderTextScale = valueText === "N/A" ? ARC_LAYOUT.placeholderValueScale : 1;
        const valueFontSize = ARC_LAYOUT.value.fontSize * innerTextScale * placeholderTextScale;
        const unitFontSize = ARC_LAYOUT.unit.fontSize * innerTextScale;
        const labelYCoordinate = centerYCoordinate + ARC_LAYOUT.label.yOffset;
        const valueCenterYCoordinate = centerYCoordinate + ARC_LAYOUT.value.yOffset;
        const unitText = data.unit;
        const labelMaxWidth = Math.max(24, radius * 1.55);
        const centerTextMaxWidth = Math.max(24, radius * 1.5);
        const centerContentFragment = renderCenterContent({
            circleStyle,
            centerIconFragment: config.centerIconFragment,
            footerIconFragment: config.footerIconFragment,
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

        const shouldRenderFullRangeArc = circleStyle === "gauge" && valueText !== "N/A";
        const shouldRenderProgressRing = !shouldRenderFullRangeArc && data.progress > 0;
        const shouldRenderProgressGradient = shouldRenderProgressRing && config.colorConfig.isGradientEnabled;
        const progressGradientDefs = shouldRenderProgressGradient
            ? `
                <defs>
                    <linearGradient id="${gradientId}" x1="5%" y1="95%" x2="95%" y2="5%">
                        ${rangeColorPlan.stops.map(renderGradientStop).join("")}
                    </linearGradient>
                </defs>
            `
            : "";

        return `
            ${progressGradientDefs}
            ${renderRing({
                geometry,
                progress: data.progress,
                trackColor: config.trackColor,
                progressStroke: shouldRenderProgressGradient ? `url(#${gradientId})` : arcColor,
                rangeColorPlan,
                strokeWidth: config.strokeWidth,
                notchGeometry: ringNotchGeometry,
                shouldRenderFullRangeArc,
                shouldRenderMarker: circleStyle === "gauge" && valueText !== "N/A",
            })}
            ${centerContentFragment}
        `;
    },
};

function renderCenterContent(options: {
    circleStyle: ArcGaugeStyle;
    centerIconFragment: string | undefined;
    footerIconFragment: string | undefined;
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
    if (options.circleStyle === "compact") {
        return `
            ${renderStatusIcon(options.statusIcon, options.centerXCoordinate, options.statusNotchGeometry)}
            ${renderCenterIcon(options.centerIconFragment, options.centerXCoordinate, options.centerYCoordinate)}
        `;
    }

    if (options.circleStyle === "gauge") {
        return renderGaugeValueContent(options);
    }

    return renderCenterValue({
        ...options,
        footerIconFragment: undefined,
    });
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
        gapAngleDegrees,
        iconSize,
        iconCenterYCoordinate: geometry.centerYCoordinate - geometry.radius + opticalYOffset,
    };
}

function buildGaugeNotchGeometry(geometry: ArcGaugeGeometry): RingNotchGeometry {
    const gapAngleDegrees = ARC_LAYOUT.gaugeGapAngleDegrees;
    const gapLength = geometry.circumference * (gapAngleDegrees / 360);

    return {
        gapLength,
        visibleLength: geometry.circumference - gapLength,
        startRotationDegrees: 90 + gapAngleDegrees / 2,
        gapAngleDegrees,
    };
}

function renderRing(options: {
    geometry: ArcGaugeGeometry;
    progress: number;
    trackColor: string;
    progressStroke: string;
    rangeColorPlan: GaugeRangeColorPlan;
    strokeWidth: number;
    notchGeometry: RingNotchGeometry | null;
    shouldRenderFullRangeArc: boolean;
    shouldRenderMarker: boolean;
}): string {
    const progress = clamp(options.progress, 0, 1);
    const trackDashArray = options.notchGeometry
        ? `${options.notchGeometry.visibleLength} ${options.notchGeometry.gapLength}`
        : `${options.geometry.circumference}`;
    const visibleArcLength = options.notchGeometry
        ? options.notchGeometry.visibleLength
        : options.geometry.circumference;
    const progressLength = options.shouldRenderFullRangeArc
        ? visibleArcLength
        : visibleArcLength * progress;
    const rotationDegrees = options.notchGeometry?.startRotationDegrees ?? -90;
    const shouldRenderProgressRing = options.shouldRenderFullRangeArc || progress > 0;
    const markerDot = options.shouldRenderMarker && options.notchGeometry
        ? resolveGaugeMarkerDot({
            geometry: options.geometry,
            notchGeometry: options.notchGeometry,
            progress,
            fill: options.rangeColorPlan.markerFill,
            radius: options.strokeWidth * ARC_LAYOUT.gaugeMarkerRadiusRatio,
            gapLength: options.strokeWidth * (
                ARC_LAYOUT.gaugeMarkerRadiusRatio + 0.5 + ARC_LAYOUT.gaugeMarkerGapPaddingRatio
            ) * ARC_LAYOUT.gaugeMarkerGapScale,
        })
        : null;
    const progressRing = options.shouldRenderFullRangeArc && options.notchGeometry
        ? renderGaugeRangeArcSegments({
            geometry: options.geometry,
            notchGeometry: options.notchGeometry,
            markerDot,
            rangeColorPlan: options.rangeColorPlan,
            strokeWidth: options.strokeWidth,
        })
        : shouldRenderProgressRing
        ? renderRingCircle({
            geometry: options.geometry,
            stroke: options.progressStroke,
            strokeWidth: options.strokeWidth,
            dashArray: options.notchGeometry
                ? `${progressLength} ${options.geometry.circumference - progressLength}`
                : `${options.geometry.circumference}`,
            dashOffset: options.notchGeometry ? 0 : options.geometry.circumference * (1 - progress),
            rotationDegrees,
        })
        : "";
    const markerDotFragment = markerDot ? renderGaugeMarkerDot(markerDot) : "";
    const trackRing = options.shouldRenderFullRangeArc
        ? ""
        : renderRingCircle({
            geometry: options.geometry,
            stroke: options.trackColor,
            strokeWidth: options.strokeWidth,
            dashArray: trackDashArray,
            dashOffset: 0,
            rotationDegrees,
        });

    return `
        <!-- Arc Gauge: track -->
        ${trackRing}
        <!-- Arc Gauge: progress arc -->
        ${progressRing}
        ${markerDotFragment}
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

function renderGaugeInlineIcon(options: {
    iconFragment: string | undefined;
    xCoordinate: number;
    yCoordinate: number;
}): string {
    if (!options.iconFragment) {
        return "";
    }

    return `<g transform="translate(${formatSvgNumber(options.xCoordinate)} ${formatSvgNumber(options.yCoordinate)}) scale(${formatSvgNumber(ARC_LAYOUT.gaugeBottomLabel.iconScale)})">${options.iconFragment}</g>`;
}

function renderGaugeValueContent(options: {
    centerXCoordinate: number;
    centerYCoordinate: number;
    labelText: string;
    labelMaxWidth: number;
    valueFontSize: number;
    valueText: string;
    unitFontSize: number;
    unitText: string;
    centerTextMaxWidth: number;
    footerIconFragment: string | undefined;
    config: ArcGaugeConfig;
}): string {
    assertArcGaugeLabel(options.labelText);
    const bottomLabelYCoordinate = options.centerYCoordinate + ARC_LAYOUT.gaugeBottomLabel.yOffset;

    return `
        ${renderGaugeValueRow(options)}
        ${renderGaugeBottomLabel({
            labelText: options.labelText,
            iconFragment: options.footerIconFragment,
            centerXCoordinate: options.centerXCoordinate,
            yCoordinate: bottomLabelYCoordinate,
            maxWidth: options.labelMaxWidth,
            config: options.config,
        })}
    `;
}

function renderGaugeValueRow(options: {
    centerXCoordinate: number;
    centerYCoordinate: number;
    valueFontSize: number;
    valueText: string;
    unitFontSize: number;
    unitText: string;
    centerTextMaxWidth: number;
    config: ArcGaugeConfig;
}): string {
    const yCoordinate = options.centerYCoordinate + ARC_LAYOUT.gaugeValueYOffset;

    if (options.unitText.length === 0) {
        return renderConstrainedSvgText({
            id: "arc-gauge-value",
            text: options.valueText,
            xCoordinate: options.centerXCoordinate,
            yCoordinate,
            maxWidth: options.centerTextMaxWidth,
            fontSize: options.valueFontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 900,
            fill: options.config.valueTextColor,
            textAnchor: "middle",
            extraAttributes: ["font-variant-numeric=\"tabular-nums\""],
        });
    }

    const unitLength = Array.from(options.unitText.trim()).length;
    const isShortUnit = unitLength === 1;
    const layout = ARC_LAYOUT.gaugeValueRow;
    const valuePlacement = resolveGaugeValuePlacement({
        centerXCoordinate: options.centerXCoordinate,
        isShortUnit,
        valueText: options.valueText,
        fallbackFontSize: options.valueFontSize,
    });
    const unitXCoordinate = options.centerXCoordinate + (
        isShortUnit ? layout.shortUnitStartXOffset : layout.longUnitStartXOffset
    );
    const unitFontSize = isShortUnit ? options.unitFontSize : layout.longUnitFontSize;

    return `
        ${renderConstrainedSvgText({
            id: "arc-gauge-value",
            text: options.valueText,
            xCoordinate: valuePlacement.xCoordinate,
            yCoordinate,
            maxWidth: valuePlacement.maxWidth,
            fontSize: valuePlacement.fontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 900,
            fill: options.config.valueTextColor,
            textAnchor: valuePlacement.textAnchor,
            extraAttributes: ["font-variant-numeric=\"tabular-nums\""],
        })}
        ${renderConstrainedSvgText({
            id: "arc-gauge-unit",
            text: options.unitText,
            xCoordinate: unitXCoordinate,
            yCoordinate,
            maxWidth: isShortUnit ? layout.shortUnitMaxWidth : layout.longUnitMaxWidth,
            fontSize: unitFontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 800,
            fill: options.config.unitTextColor,
            textAnchor: "start",
        })}
    `;
}

function resolveGaugeValuePlacement(options: {
    centerXCoordinate: number;
    isShortUnit: boolean;
    valueText: string;
    fallbackFontSize: number;
}): {
    xCoordinate: number;
    maxWidth: number;
    fontSize: number;
    textAnchor: SvgTextAnchor;
} {
    const layout = ARC_LAYOUT.gaugeValueRow;
    const digitCount = countDigits(options.valueText);

    if (options.isShortUnit && digitCount <= 2) {
        const opticalXOffset = digitCount === 2
            ? layout.shortUnitTwoDigitOpticalXOffset
            : 0;

        return {
            xCoordinate: options.centerXCoordinate + opticalXOffset,
            maxWidth: layout.shortUnitValueMaxWidth,
            fontSize: resolveGaugeValueFontSize({
                digitCount,
                fallbackFontSize: options.fallbackFontSize,
                digitFontSizes: layout.shortUnitDigitFontSizes,
            }),
            textAnchor: "middle",
        };
    }

    const xOffset = options.isShortUnit
        ? layout.shortUnitValueEndXOffset
        : layout.longUnitValueEndXOffset;

    return {
        xCoordinate: options.centerXCoordinate + xOffset,
        maxWidth: options.isShortUnit ? layout.shortUnitValueMaxWidth : layout.longUnitValueMaxWidth,
        fontSize: resolveGaugeValueFontSize({
            digitCount,
            fallbackFontSize: options.fallbackFontSize,
            digitFontSizes: options.isShortUnit
                ? layout.shortUnitDigitFontSizes
                : layout.longUnitDigitFontSizes,
        }),
        textAnchor: "end",
    };
}

function resolveGaugeValueFontSize(options: {
    digitCount: number;
    fallbackFontSize: number;
    digitFontSizes: {
        one: number;
        two: number;
        three: number;
        many: number;
    };
}): number {
    if (options.digitCount === 0) {
        return options.fallbackFontSize;
    }

    if (options.digitCount <= 1) {
        return options.digitFontSizes.one;
    }

    if (options.digitCount === 2) {
        return options.digitFontSizes.two;
    }

    if (options.digitCount === 3) {
        return options.digitFontSizes.three;
    }

    return options.digitFontSizes.many;
}

function countDigits(value: string): number {
    return Array.from(value).filter(character => /\d/u.test(character)).length;
}

function renderGaugeBottomLabel(options: {
    labelText: string;
    iconFragment: string | undefined;
    centerXCoordinate: number;
    yCoordinate: number;
    maxWidth: number;
    config: ArcGaugeConfig;
}): string {
    const fontSize = ARC_LAYOUT.gaugeBottomLabel.fontSize;
    const estimatedLabelWidth = Math.min(options.maxWidth, options.labelText.length * fontSize * 0.62);
    const iconSize = options.iconFragment
        ? GAUGE_INLINE_ICON_ASSUMED_SIZE * ARC_LAYOUT.gaugeBottomLabel.iconScale
        : 0;
    const iconGap = options.iconFragment ? ARC_LAYOUT.gaugeBottomLabel.iconGap : 0;
    const labelXCoordinate = options.iconFragment
        ? options.centerXCoordinate - (iconSize + iconGap) / 2
        : options.centerXCoordinate;
    const iconXCoordinate = labelXCoordinate + estimatedLabelWidth / 2 + iconGap + iconSize / 2;

    return `
        ${renderConstrainedSvgText({
            id: "arc-gauge-bottom-label",
            text: options.labelText,
            xCoordinate: labelXCoordinate,
            yCoordinate: options.yCoordinate,
            maxWidth: Math.max(12, options.maxWidth - iconSize - iconGap),
            fontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 850,
            fill: options.config.labelTextColor,
            textAnchor: "middle",
        })}
        ${renderGaugeInlineIcon({
            iconFragment: options.iconFragment,
            xCoordinate: iconXCoordinate,
            yCoordinate: options.yCoordinate,
        })}
    `;
}

function renderCenterValue(options: {
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
    footerIconFragment: string | undefined;
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
            xCoordinate: resolveValueRowXCoordinate(options.centerXCoordinate, options.footerIconFragment),
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
            fitOptions: options.unitText.length > 1
                ? { minimumFontScale: 0.42, widthGuardRatio: 1.45 }
                : undefined,
        })}
        ${renderCenterIcon(
            options.footerIconFragment,
            options.centerXCoordinate,
            options.centerYCoordinate + ARC_LAYOUT.footerIcon.yOffset,
        )}
    `;
}

function resolveValueRowXCoordinate(centerXCoordinate: number, footerIconFragment: string | undefined): number {
    return footerIconFragment
        ? centerXCoordinate + ARC_LAYOUT.footerIcon.valueRowXOffset
        : centerXCoordinate;
}
