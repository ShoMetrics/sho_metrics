import type { WidgetData, KeySize } from "../../view-rendering/widget-data";
import {
    DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS,
    type RenderOutlineTokens,
} from "../../view-rendering/color/render-appearance";
import { resolveColorForThresholdValue } from "../../view-rendering/color/color-resolver";
import {
    buildSvgFilterAttributes,
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    type RenderThemeEffectTokens,
} from "../../view-rendering/rasterize/render-svg-effects";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    type RenderTextStyles,
} from "../../view-rendering/rasterize/render-text-style";
import {
    clamp,
    formatSvgShapeOutlineStrokeAttributes,
    isSvgOutlineEnabled,
    renderStyledSvgText,
    resolveSvgShapeOutlineStrokeWidth,
    type SvgTextAnchor,
} from "../../view-rendering/rasterize/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget-contract";
import {
    buildGaugeRangeColorPlan,
    formatSvgNumber,
    renderGaugeMarkerDot,
    renderGaugeMarkerDotOutline,
    renderGaugeRangeArcSegments,
    renderGradientStop,
    resolveGaugeMarkerDot,
    type ProgressCircleGeometry,
    type GaugeRangeColorPlan,
    type RingNotchGeometry,
} from "./progress-circle-range";
import { renderMetricTextRow } from "./metric-text-row";

export type CircleVariant = "full-ring" | "minimal" | "gauge";

export interface ProgressCircleStatusIcon {
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

export interface ProgressCircleConfig extends WidgetBaseConfig {
    trackColor: string;
    strokeWidth: number;
    labelTextColor: string;
    valueTextColor: string;
    unitTextColor: string;
    iconColor: string;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
    textOutline?: RenderOutlineTokens;
    shapeOutline?: RenderOutlineTokens;
    innerTextScale: number;
    circleVariant: CircleVariant;
    gaugeRangeBlendProgress: number;
    centerIconFragment?: string;
    footerIconFragment?: string;
    statusIcon?: ProgressCircleStatusIcon;
}

export const DEFAULT_PROGRESS_CIRCLE_CONFIG: ProgressCircleConfig = {
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
    iconColor: "rgba(255,255,255,0.88)",
    textStyles: DEFAULT_RENDER_TEXT_STYLES,
    themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    textOutline: DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS.textOutline,
    shapeOutline: DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS.shapeOutline,
    gradientHeadAdjustmentPercent: -42,
    innerTextScale: 1,
    circleVariant: "full-ring",
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
        valueEndXOffset: 20,
        unitStartXOffset: 25,
        valueMaxWidth: 74,
        // Gauge reserves about two characters for the unit. Longer rate units
        // must be compacted before reaching this primitive.
        unitMaxWidth: 28,
        unitFontSize: 13,
        digitFontSizes: {
            one: 48,
            two: 48,
            three: 31,
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
 * different visual form that can represent two values at the same time.
 * Renders a background track circle + a colored progress arc + centered content.
 */
export const progressCircle: Widget<ProgressCircleConfig> = {
    widgetId: "progress-circle",

    render(data: WidgetData, config: ProgressCircleConfig, keySize: KeySize): string {
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
        const gradientId = `progress-circle-${Math.round(data.current * 10)}-${keySize.width}-${keySize.height}`;
        const circleVariant = config.circleVariant;
        const rangeColorPlan = buildGaugeRangeColorPlan({
            circleVariant,
            colorConfig: config.colorConfig,
            baseColor: arcColor,
            progress: data.progress,
            gradientHeadAdjustmentPercent: config.gradientHeadAdjustmentPercent ?? -15,
            gaugeRangeBlendProgress: config.gaugeRangeBlendProgress,
        });
        const statusNotchGeometry = circleVariant === "minimal" && config.statusIcon
            ? buildStatusNotchGeometry(geometry, config.strokeWidth, config.statusIcon)
            : null;
        const gaugeNotchGeometry = circleVariant === "gauge"
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
        // Full-ring labels sit inside the upper arc, so they need a narrower
        // safe area than footer labels used by gauge/minimal variants.
        const labelMaxWidth = Math.max(24, radius * (circleVariant === "full-ring" ? 1.32 : 1.55));
        const centerTextMaxWidth = Math.max(24, radius * 1.5);
        const centerContentFragment = renderCenterContent({
            circleVariant,
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

        const shouldRenderFullRangeArc = circleVariant === "gauge" && valueText !== "N/A";
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
                shouldRenderMarker: circleVariant === "gauge" && valueText !== "N/A",
                metricFilter: config.themeEffects.metricFilter,
                subtleFilter: config.themeEffects.subtleFilter,
                shapeOutline: config.shapeOutline,
            })}
            ${centerContentFragment}
        `;
    },
};

function renderCenterContent(options: {
    circleVariant: CircleVariant;
    centerIconFragment: string | undefined;
    footerIconFragment: string | undefined;
    statusIcon: ProgressCircleStatusIcon | undefined;
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
    config: ProgressCircleConfig;
}): string {
    if (options.circleVariant === "minimal") {
        return `
            ${renderStatusIcon(
                options.statusIcon,
                options.centerXCoordinate,
                options.statusNotchGeometry,
                options.config.iconColor,
                options.config.themeEffects.iconFilter,
            )}
            ${renderCenterIcon(
                options.centerIconFragment,
                options.centerXCoordinate,
                options.centerYCoordinate,
                options.config.iconColor,
                options.config.themeEffects.iconFilter,
            )}
        `;
    }

    if (options.circleVariant === "gauge") {
        return renderGaugeValueContent(options);
    }

    return renderCenterValue({
        ...options,
        footerIconFragment: undefined,
    });
}

function renderStatusIcon(
    statusIcon: ProgressCircleStatusIcon | undefined,
    centerXCoordinate: number,
    statusNotchGeometry: StatusNotchGeometry | null,
    iconColor: string,
    iconFilter: string | undefined,
): string {
    if (!statusIcon || !statusNotchGeometry) {
        return "";
    }

    return `
        <svg x="${centerXCoordinate - statusNotchGeometry.iconSize / 2}"
            y="${statusNotchGeometry.iconCenterYCoordinate - statusNotchGeometry.iconSize / 2}"
            width="${statusNotchGeometry.iconSize}" height="${statusNotchGeometry.iconSize}"
            color="${iconColor}"
            ${buildSvgFilterAttributes(iconFilter).join(" ")}
            viewBox="${statusIcon.viewBox.x} ${statusIcon.viewBox.y} ${statusIcon.viewBox.width} ${statusIcon.viewBox.height}">
            ${statusIcon.fragment}
        </svg>
    `;
}

function buildStatusNotchGeometry(
    geometry: ProgressCircleGeometry,
    strokeWidth: number,
    statusIcon: ProgressCircleStatusIcon,
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

function buildGaugeNotchGeometry(geometry: ProgressCircleGeometry): RingNotchGeometry {
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
    geometry: ProgressCircleGeometry;
    progress: number;
    trackColor: string;
    progressStroke: string;
    rangeColorPlan: GaugeRangeColorPlan;
    strokeWidth: number;
    notchGeometry: RingNotchGeometry | null;
    shouldRenderFullRangeArc: boolean;
    shouldRenderMarker: boolean;
    metricFilter: string | undefined;
    subtleFilter: string | undefined;
    shapeOutline: RenderOutlineTokens | undefined;
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
            outline: options.shapeOutline,
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
            filter: options.metricFilter,
            outline: options.shapeOutline,
            outlineClassName: "progress-circle-ring-outline",
        })
        : "";
    const markerDotFragment = markerDot
        ? `${renderGaugeMarkerDotOutline(markerDot, options.shapeOutline, "progress-circle-marker-outline")}
            <g ${buildSvgFilterAttributes(options.metricFilter).join(" ")}>${renderGaugeMarkerDot(markerDot)}</g>`
        : "";
    const trackRing = options.shouldRenderFullRangeArc
        ? ""
        : renderRingCircle({
            geometry: options.geometry,
            stroke: options.trackColor,
            strokeWidth: options.strokeWidth,
            dashArray: trackDashArray,
            dashOffset: 0,
            rotationDegrees,
            filter: options.subtleFilter,
            outline: options.shapeOutline,
            outlineClassName: "progress-circle-track-outline",
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
    geometry: ProgressCircleGeometry;
    stroke: string;
    strokeWidth: number;
    dashArray: string;
    dashOffset: number;
    rotationDegrees: number;
    filter: string | undefined;
    outline: RenderOutlineTokens | undefined;
    outlineClassName: string;
}): string {
    const filterAttributes = buildSvgFilterAttributes(options.filter);
    const outlineStrokeWidth = resolveSvgShapeOutlineStrokeWidth(options.strokeWidth, options.outline);
    const outlineCircle = isSvgOutlineEnabled(options.outline)
        ? `<circle class="${options.outlineClassName}"
            cx="${options.geometry.centerXCoordinate}" cy="${options.geometry.centerYCoordinate}" r="${options.geometry.radius}"
            stroke-dasharray="${options.dashArray}" stroke-dashoffset="${options.dashOffset}"
            transform="rotate(${options.rotationDegrees} ${options.geometry.centerXCoordinate} ${options.geometry.centerYCoordinate})"
            ${formatSvgShapeOutlineStrokeAttributes({
                outline: options.outline,
                strokeWidth: outlineStrokeWidth,
                lineCap: "round",
            })} />`
        : "";

    return `
        ${outlineCircle}
        <circle cx="${options.geometry.centerXCoordinate}" cy="${options.geometry.centerYCoordinate}" r="${options.geometry.radius}"
            fill="none" stroke="${options.stroke}" stroke-width="${options.strokeWidth}"
            stroke-dasharray="${options.dashArray}" stroke-dashoffset="${options.dashOffset}"
            stroke-linecap="round"
            transform="rotate(${options.rotationDegrees} ${options.geometry.centerXCoordinate} ${options.geometry.centerYCoordinate})"
            ${filterAttributes.join(" ")}
            style="transition: stroke-dashoffset 0.3s ease;" />
    `;
}

function renderCenterIcon(
    centerIconFragment: string | undefined,
    centerXCoordinate: number,
    centerYCoordinate: number,
    iconColor: string,
    iconFilter: string | undefined,
): string {
    if (!centerIconFragment) {
        return "";
    }

    return `<g color="${iconColor}" transform="translate(${centerXCoordinate} ${centerYCoordinate})" ${buildSvgFilterAttributes(iconFilter).join(" ")}>${centerIconFragment}</g>`;
}

function renderGaugeInlineIcon(options: {
    iconFragment: string | undefined;
    xCoordinate: number;
    yCoordinate: number;
    iconColor: string;
    iconFilter: string | undefined;
}): string {
    if (!options.iconFragment) {
        return "";
    }

    return `<g color="${options.iconColor}" transform="translate(${formatSvgNumber(options.xCoordinate)} ${formatSvgNumber(options.yCoordinate)}) scale(${formatSvgNumber(ARC_LAYOUT.gaugeBottomLabel.iconScale)})" ${buildSvgFilterAttributes(options.iconFilter).join(" ")}>${options.iconFragment}</g>`;
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
    config: ProgressCircleConfig;
}): string {
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
    config: ProgressCircleConfig;
}): string {
    const yCoordinate = options.centerYCoordinate + ARC_LAYOUT.gaugeValueYOffset;
    const valueTextStyle = options.config.textStyles.value;
    const unitTextStyle = options.config.textStyles.unit;

    if (options.unitText.length === 0) {
        return renderStyledSvgText({
            id: "progress-circle-value",
            text: options.valueText,
            xCoordinate: options.centerXCoordinate,
            yCoordinate,
            maxWidth: options.centerTextMaxWidth,
            baseFontSize: options.valueFontSize,
            textStyle: valueTextStyle,
            fill: options.config.valueTextColor,
            textAnchor: "middle",
            outline: options.config.textOutline,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(valueTextStyle.filter),
            ],
        });
    }

    const layout = ARC_LAYOUT.gaugeValueRow;
    const valuePlacement = resolveGaugeValuePlacement({
        centerXCoordinate: options.centerXCoordinate,
        valueText: options.valueText,
        fallbackFontSize: options.valueFontSize,
    });
    const unitXCoordinate = options.centerXCoordinate + layout.unitStartXOffset;

    return `
        ${renderStyledSvgText({
            id: "progress-circle-value",
            text: options.valueText,
            xCoordinate: valuePlacement.xCoordinate,
            yCoordinate,
            maxWidth: valuePlacement.maxWidth,
            baseFontSize: valuePlacement.fontSize,
            textStyle: valueTextStyle,
            fill: options.config.valueTextColor,
            textAnchor: valuePlacement.textAnchor,
            outline: options.config.textOutline,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(valueTextStyle.filter),
            ],
        })}
        ${renderStyledSvgText({
            id: "progress-circle-unit",
            text: options.unitText,
            xCoordinate: unitXCoordinate,
            yCoordinate,
            maxWidth: layout.unitMaxWidth,
            baseFontSize: layout.unitFontSize,
            textStyle: unitTextStyle,
            fill: options.config.unitTextColor,
            textAnchor: "start",
            outline: options.config.textOutline,
            extraAttributes: buildSvgFilterAttributes(unitTextStyle.filter),
        })}
    `;
}

function resolveGaugeValuePlacement(options: {
    centerXCoordinate: number;
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

    return {
        xCoordinate: options.centerXCoordinate + layout.valueEndXOffset,
        maxWidth: layout.valueMaxWidth,
        fontSize: resolveGaugeValueFontSize({
            digitCount,
            fallbackFontSize: options.fallbackFontSize,
            digitFontSizes: layout.digitFontSizes,
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
    config: ProgressCircleConfig;
}): string {
    const labelTextStyle = options.config.textStyles.smallLabel;
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
        ${renderStyledSvgText({
            id: "progress-circle-bottom-label",
            text: options.labelText,
            xCoordinate: labelXCoordinate,
            yCoordinate: options.yCoordinate,
            maxWidth: Math.max(12, options.maxWidth - iconSize - iconGap),
            baseFontSize: fontSize,
            textStyle: labelTextStyle,
            fill: options.config.labelTextColor,
            textAnchor: "middle",
            outline: options.config.textOutline,
            extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
        })}
        ${renderGaugeInlineIcon({
            iconFragment: options.iconFragment,
            xCoordinate: iconXCoordinate,
            yCoordinate: options.yCoordinate,
            iconColor: options.config.iconColor,
            iconFilter: options.config.themeEffects.iconFilter,
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
    config: ProgressCircleConfig;
}): string {
    const labelTextStyle = options.config.textStyles.label;
    const valueTextStyle = options.config.textStyles.value;
    const unitTextStyle = options.config.textStyles.unit;

    return `
        ${renderStyledSvgText({
            id: "arc-label",
            text: options.labelText,
            xCoordinate: options.centerXCoordinate,
            yCoordinate: options.labelYCoordinate,
            maxWidth: options.labelMaxWidth,
            baseFontSize: options.labelFontSize,
            textStyle: labelTextStyle,
            fill: options.config.labelTextColor,
            textAnchor: "middle",
            outline: options.config.textOutline,
            extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
        })}
        ${renderMetricTextRow({
            id: "arc-value-unit",
            layout: {
                xCoordinate: resolveValueRowXCoordinate(options.centerXCoordinate, options.footerIconFragment),
                yCoordinate: options.valueCenterYCoordinate,
                width: options.centerTextMaxWidth,
                textAnchor: "middle",
            },
            value: {
                text: options.valueText,
                baseFontSize: options.valueFontSize,
                textStyle: valueTextStyle,
                fill: options.config.valueTextColor,
                extraAttributes: [
                    "font-variant-numeric=\"tabular-nums\"",
                    ...buildSvgFilterAttributes(valueTextStyle.filter),
                ],
            },
            unit: {
                text: options.unitText,
                baseFontSize: options.unitFontSize,
                textStyle: unitTextStyle,
                fill: options.config.unitTextColor,
                extraAttributes: buildSvgFilterAttributes(unitTextStyle.filter),
            },
            fitOptions: options.unitText.length > 1
                ? { minimumFontScale: 0.42, widthGuardRatio: 1.45 }
                : undefined,
            outline: options.config.textOutline,
        })}
        ${renderCenterIcon(
            options.footerIconFragment,
            options.centerXCoordinate,
            options.centerYCoordinate + ARC_LAYOUT.footerIcon.yOffset,
            options.config.iconColor,
            options.config.themeEffects.iconFilter,
        )}
    `;
}

function resolveValueRowXCoordinate(centerXCoordinate: number, footerIconFragment: string | undefined): number {
    return footerIconFragment
        ? centerXCoordinate + ARC_LAYOUT.footerIcon.valueRowXOffset
        : centerXCoordinate;
}
