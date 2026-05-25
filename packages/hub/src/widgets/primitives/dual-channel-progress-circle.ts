import type { DualChannelWidgetData, KeySize } from "../../view-rendering/widget-data";
import type { ColorConfig } from "../../view-rendering/color-resolver";
import {
    buildSvgFilterAttributes,
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    type RenderThemeEffectTokens,
} from "../../view-rendering/render-svg-effects";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    type RenderTextStyles,
} from "../../view-rendering/render-text-style";
import {
    clamp,
    renderStyledSvgText,
} from "../../view-rendering/svg-utils";
import type { WidgetBaseConfig } from "../widget-contract";
import type { ProgressCircleStatusIcon, CircleVariant } from "./progress-circle";
import { renderDualGaugeRing } from "./dual-channel-gauge-ring";

export type DualChannelProgressCircleCenterContent = "value" | "icon" | "icon-value-unit";
type ArcProgressDirection = "start-to-end" | "end-to-start";

export interface DualChannelProgressCircleConfig extends WidgetBaseConfig {
    trackColor: string;
    strokeWidth: number;
    valueTextColor: string;
    unitTextColor: string;
    dividerColor: string;
    iconColor: string;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
    centerContent: DualChannelProgressCircleCenterContent;
    circleVariant: CircleVariant;
    titleText?: string;
    centerIconFragment?: string;
    positiveIconFragment?: string;
    negativeIconFragment?: string;
    positiveStatusIcon?: ProgressCircleStatusIcon;
    negativeStatusIcon?: ProgressCircleStatusIcon;
    positiveColor: string;
    negativeColor: string;
    positiveColorConfig?: ColorConfig;
    negativeColorConfig?: ColorConfig;
}

export const DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG: DualChannelProgressCircleConfig = {
    colorConfig: { mode: "solid", solidColor: "#3b82f6", thresholds: [], isGradientEnabled: true },
    trackColor: "rgba(255,255,255,0.14)",
    strokeWidth: 11,
    valueTextColor: "white",
    unitTextColor: "rgba(255,255,255,0.74)",
    dividerColor: "rgba(255,255,255,0.18)",
    iconColor: "rgba(255,255,255,0.88)",
    textStyles: DEFAULT_RENDER_TEXT_STYLES,
    themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    centerContent: "value",
    circleVariant: "full-ring",
    titleText: "",
    positiveColor: "#3b82f6",
    negativeColor: "#ef4444",
};

const ARC_LAYOUT = {
    outerMargin: 7,
    minimumRadius: 20,
    inlineIconSize: 18,
    inlineIconUpperOpticalYOffsetRatio: -0.08,
    inlineIconLowerOpticalYOffsetRatio: -0.18,
    inlineIconSourceSize: 30,
    inlineIconXRatio: 0.18,
    rowTextXRatio: 0.25,
    rowTextXOffsetRatio: 0.06,
    dividerTextPaddingRatio: 0.075,
    valueUnitBaselineGapRatio: 0.25,
    unitBaselineYOffsetRatio: 0.05,
    textClipHeightRatio: 1.45,
    valueFontSize: 21.5,
    unitFontSize: 15.5,
    dividerDiameterRatio: 0.78,
    dividerYOffset: 0,
    gaugeBottomGapAngleDegrees: 92,
    gaugeTopGapAngleDegrees: 92,
    gaugeRowIconXRatio: 0.50,
    gaugeRowValueEndXRatio: 0.18,
    gaugeRowOneDigitValueEndXRatio: 0.08,
    gaugeRowUnitXRatio: 0.27,
    gaugeRowYOffset: 17,
    gaugeValueFontSize: 20,
    gaugeUnitFontSize: 12,
    gaugeValueWidth: 40,
    gaugeUnitWidth: 31,
    gaugeUnavailableValueXRatio: -0.02,
    gaugeUnavailableValueWidth: 36,
    gaugeUnavailableValueFontSize: 17,
    gaugeValueDigitFontSizes: {
        one: 20,
        two: 20,
        three: 13.5,
        many: 11,
    },
    gaugeBottomLabelFontSize: 17,
    gaugeBottomLabelYOffset: 45,
    gaugeBottomLabelMaxWidthRatio: 1.10,
    centerIconScale: 0.86,
    notchIconSizeRatio: 2.15,
    notchGapWidthRatio: 4.4,
    notchIconRadialInsetRatio: 0.72,
    fullRingProgressBottomGapAngleDegrees: 10,
    minimumNonZeroCircleProgressAngleDegrees: 16,
} as const;

interface RingGeometry {
    centerXCoordinate: number;
    centerYCoordinate: number;
    radius: number;
    circumference: number;
    halfLength: number;
}

interface ChannelArcModel {
    channelId: "positive" | "negative";
    color: string;
    colorConfig: ColorConfig;
    /**
     * The metric progress before any visual lane mirroring.
     *
     * Keep this as the semantic value from the metric: 0 is low traffic and 1
     * is high traffic, regardless of which side of the circle owns the lane.
     */
    progress: number;
    /**
     * Whether geometric lane progress follows the lane start or is mirrored.
     *
     * `start-to-end` draws from the lane's geometric start. `end-to-start`
     * anchors the colored segment at the lane's geometric end, which lets the
     * right-side network lane behave as a visual mirror of the left-side lane
     * without changing the metric progress value.
     */
    progressDirection: ArcProgressDirection;
    gaugeStartAngleDegrees: number;
    gaugeEndAngleDegrees: number;
    rotationDegrees: number;
    iconRotationDegrees: number;
    iconFragment: string | undefined;
    statusIcon: ProgressCircleStatusIcon | undefined;
}

interface ChannelValueRowLayout {
    rowPosition: "upper" | "lower";
    iconXCoordinate: number;
    groupCenterYCoordinate: number;
    valueYCoordinate: number;
    unitYCoordinate: number;
    textXCoordinate: number;
    textWidth: number;
}

/**
 * Renders two independent network speed channels in one progress circle.
 * The positive channel owns the upper/left lane and the negative channel owns
 * the lower/right lane, so each value has a fixed visual lane.
 */
export function renderDualChannelProgressCircle(
    data: DualChannelWidgetData,
    config: DualChannelProgressCircleConfig,
    keySize: KeySize,
): string {
    const centerXCoordinate = keySize.width / 2;
    const centerYCoordinate = keySize.height / 2;
    const radius = Math.max(
        ARC_LAYOUT.minimumRadius,
        Math.min(keySize.width, keySize.height) / 2 - ARC_LAYOUT.outerMargin - config.strokeWidth / 2,
    );
    const circumference = 2 * Math.PI * radius;
    const geometry: RingGeometry = {
        centerXCoordinate,
        centerYCoordinate,
        radius,
        circumference,
        halfLength: circumference / 2,
    };
    const isGaugeVariant = config.circleVariant === "gauge";
    const channelArcModels: readonly ChannelArcModel[] = [
        {
            channelId: "positive",
            color: config.positiveColor,
            colorConfig: config.positiveColorConfig ?? buildSolidChannelColorConfig(config.positiveColor),
            progress: data.positive.progress,
            progressDirection: "start-to-end",
            gaugeStartAngleDegrees: 90 + ARC_LAYOUT.gaugeBottomGapAngleDegrees / 2,
            gaugeEndAngleDegrees: 270 - ARC_LAYOUT.gaugeTopGapAngleDegrees / 2,
            rotationDegrees: 90,
            iconRotationDegrees: -90,
            iconFragment: config.positiveIconFragment,
            statusIcon: config.positiveStatusIcon,
        },
        {
            channelId: "negative",
            color: config.negativeColor,
            colorConfig: config.negativeColorConfig ?? buildSolidChannelColorConfig(config.negativeColor),
            progress: data.negative.progress,
            // The right lane is the visual mirror of the left lane: users see it
            // fill from bottom to top, even though the circle/gauge geometry
            // draws that side clockwise from top to bottom.
            progressDirection: "end-to-start",
            gaugeStartAngleDegrees: 270 + ARC_LAYOUT.gaugeTopGapAngleDegrees / 2,
            gaugeEndAngleDegrees: 450 - ARC_LAYOUT.gaugeBottomGapAngleDegrees / 2,
            rotationDegrees: -90,
            iconRotationDegrees: 90,
            iconFragment: config.negativeIconFragment,
            statusIcon: config.negativeStatusIcon,
        },
    ];

    return `
        ${renderRing({
            geometry,
            channelArcModels,
            trackColor: config.trackColor,
            strokeWidth: config.strokeWidth,
            mode: isGaugeVariant ? "gauge" : "circle",
            hasNotches: !isGaugeVariant && config.centerContent === "icon",
            metricFilter: config.themeEffects.metricFilter,
            subtleFilter: config.themeEffects.subtleFilter,
            iconFilter: config.themeEffects.iconFilter,
        })}
        ${renderCenterContent({ data, config, geometry })}
        ${isGaugeVariant ? renderGaugeBottomLabel({ config, geometry }) : ""}
    `;
}

function renderRing(options: {
    geometry: RingGeometry;
    channelArcModels: readonly ChannelArcModel[];
    trackColor: string;
    strokeWidth: number;
    mode: "circle" | "gauge";
    hasNotches: boolean;
    metricFilter: string | undefined;
    subtleFilter: string | undefined;
    iconFilter: string | undefined;
}): string {
    if (options.mode === "gauge") {
        return renderDualGaugeRing({
            geometry: options.geometry,
            channelModels: options.channelArcModels,
            strokeWidth: options.strokeWidth,
        });
    }

    const notchGapLength = options.hasNotches
        ? options.strokeWidth * ARC_LAYOUT.notchGapWidthRatio
        : 0;
    const visibleHalfLength = Math.max(1, options.geometry.halfLength - notchGapLength);
    const trackDashArray = `${visibleHalfLength} ${options.geometry.circumference - visibleHalfLength}`;
    const gapRotationOffset = options.hasNotches ? resolveNotchAngleDegrees(options.geometry, notchGapLength) / 2 : 0;
    const visibleAngleDegrees = visibleHalfLength / options.geometry.circumference * 360;
    const isFullRing = !options.hasNotches;
    const progressBottomGapAngleDegrees = isFullRing
        ? ARC_LAYOUT.fullRingProgressBottomGapAngleDegrees
        : 0;
    const progressVisibleAngleDegrees = visibleAngleDegrees - progressBottomGapAngleDegrees / 2;
    const progressVisibleLength = options.geometry.circumference * (progressVisibleAngleDegrees / 360);

    return `
        ${isFullRing ? renderFullRingProgressClipPaths({
            geometry: options.geometry,
            strokeWidth: options.strokeWidth,
        }) : ""}
        ${options.channelArcModels.map(channel => renderArcSegment({
            geometry: options.geometry,
            stroke: options.trackColor,
            strokeWidth: options.strokeWidth,
            dashArray: trackDashArray,
            dashOffset: 0,
            rotationDegrees: channel.rotationDegrees + gapRotationOffset,
            // Full-ring track halves meet at the top and bottom. Round caps
            // make those joins look like stray dots, but notched tracks still
            // need rounded ends around the icon gaps.
            strokeLineCap: options.hasNotches ? "round" : "butt",
            filter: options.subtleFilter,
        })).join("")}
        ${options.channelArcModels.map(channel => {
            const progress = clamp(channel.progress, 0, 1);
            const progressLength = resolveCircleProgressLength({
                progress,
                visibleLength: progressVisibleLength,
                circumference: options.geometry.circumference,
            });

            if (progressLength <= 0) {
                return "";
            }

            // The bottom gap shortens the drawable domain, so rotation needs a
            // progress ratio in that shortened visual space.
            const renderProgress = progressLength / progressVisibleLength;

            return renderArcSegment({
                geometry: options.geometry,
                stroke: channel.color,
                strokeWidth: options.strokeWidth,
                dashArray: `${progressLength} ${options.geometry.circumference - progressLength}`,
                dashOffset: 0,
                rotationDegrees: resolveArcProgressRotationDegrees({
                    channel,
                    gapRotationOffset,
                    progress: renderProgress,
                    progressBottomGapAngleDegrees,
                    visibleAngleDegrees: progressVisibleAngleDegrees,
                }),
                clipPathId: isFullRing ? resolveFullRingProgressClipPathId(channel.channelId) : undefined,
                filter: options.metricFilter,
            });
        }).join("")}
        ${options.hasNotches ? options.channelArcModels.map(channel => renderNotchIcon({
            geometry: options.geometry,
            strokeWidth: options.strokeWidth,
            channel,
            iconFilter: options.iconFilter,
        })).join("") : ""}
    `;
}

function buildSolidChannelColorConfig(color: string): ColorConfig {
    return {
        mode: "solid",
        solidColor: color,
        thresholds: [],
        isGradientEnabled: true,
    };
}

function renderArcSegment(options: {
    geometry: RingGeometry;
    stroke: string;
    strokeWidth: number;
    dashArray: string;
    dashOffset: number;
    rotationDegrees: number;
    strokeLineCap?: "butt" | "round";
    clipPathId?: string;
    filter: string | undefined;
}): string {
    const circleFragment = `
        <circle cx="${formatSvgNumber(options.geometry.centerXCoordinate)}"
            cy="${formatSvgNumber(options.geometry.centerYCoordinate)}"
            r="${formatSvgNumber(options.geometry.radius)}"
            fill="none" stroke="${options.stroke}" stroke-width="${formatSvgNumber(options.strokeWidth)}"
            stroke-dasharray="${options.dashArray}" stroke-dashoffset="${formatSvgNumber(options.dashOffset)}"
            stroke-linecap="${options.strokeLineCap ?? "round"}"
            transform="rotate(${formatSvgNumber(options.rotationDegrees)} ${formatSvgNumber(options.geometry.centerXCoordinate)} ${formatSvgNumber(options.geometry.centerYCoordinate)})"
            ${buildSvgFilterAttributes(options.filter).join(" ")} />
    `;

    if (options.clipPathId === undefined) {
        return circleFragment;
    }

    return `<g clip-path="url(#${options.clipPathId})">${circleFragment}</g>`;
}

function renderFullRingProgressClipPaths(options: {
    geometry: RingGeometry;
    strokeWidth: number;
}): string {
    const leftXCoordinate = options.geometry.centerXCoordinate - options.geometry.radius - options.strokeWidth;
    const topYCoordinate = options.geometry.centerYCoordinate - options.geometry.radius - options.strokeWidth;
    const halfWidth = options.geometry.radius + options.strokeWidth;
    const height = options.geometry.radius * 2 + options.strokeWidth * 2;

    return `
        <defs>
            <clipPath id="${resolveFullRingProgressClipPathId("positive")}" clipPathUnits="userSpaceOnUse">
                <rect x="${formatSvgNumber(leftXCoordinate)}" y="${formatSvgNumber(topYCoordinate)}"
                    width="${formatSvgNumber(halfWidth)}" height="${formatSvgNumber(height)}" />
            </clipPath>
            <clipPath id="${resolveFullRingProgressClipPathId("negative")}" clipPathUnits="userSpaceOnUse">
                <rect x="${formatSvgNumber(options.geometry.centerXCoordinate)}" y="${formatSvgNumber(topYCoordinate)}"
                    width="${formatSvgNumber(halfWidth)}" height="${formatSvgNumber(height)}" />
            </clipPath>
        </defs>
    `;
}

function resolveFullRingProgressClipPathId(channelId: ChannelArcModel["channelId"]): string {
    return `dual-progress-circle-${channelId}-clip`;
}

/**
 * Resolves the visual arc length without changing semantic progress.
 *
 * Very low network traffic can be nonzero but shorter than a round stroke cap,
 * which makes upload and download collapse into the same bottom dot. The small
 * floor is visual-only: zero remains zero, and all metric values keep their
 * original normalized progress.
 */
function resolveCircleProgressLength(options: {
    progress: number;
    visibleLength: number;
    circumference: number;
}): number {
    if (options.progress <= 0) {
        return 0;
    }

    const semanticProgressLength = options.visibleLength * options.progress;
    const minimumVisibleLength = options.circumference
        * (ARC_LAYOUT.minimumNonZeroCircleProgressAngleDegrees / 360);

    return Math.min(options.visibleLength, Math.max(semanticProgressLength, minimumVisibleLength));
}

function resolveArcProgressRotationDegrees(options: {
    channel: ChannelArcModel;
    gapRotationOffset: number;
    progress: number;
    progressBottomGapAngleDegrees: number;
    visibleAngleDegrees: number;
}): number {
    const laneStartRotationDegrees = options.channel.rotationDegrees
        + options.gapRotationOffset
        + (options.channel.progressDirection === "start-to-end"
            ? options.progressBottomGapAngleDegrees / 2
            : 0);

    if (options.channel.progressDirection === "end-to-start") {
        return laneStartRotationDegrees + options.visibleAngleDegrees * (1 - options.progress);
    }

    return laneStartRotationDegrees;
}

function renderNotchIcon(options: {
    geometry: RingGeometry;
    strokeWidth: number;
    channel: ChannelArcModel;
    iconFilter: string | undefined;
}): string {
    if (!options.channel.iconFragment && !options.channel.statusIcon) {
        return "";
    }

    const iconSize = options.strokeWidth * (
        options.channel.statusIcon?.sizeRatio ?? ARC_LAYOUT.notchIconSizeRatio
    );
    const iconCenter = resolvePointOnCircle({
        geometry: options.geometry,
        angleDegrees: options.channel.iconRotationDegrees,
        radialOffset: -options.strokeWidth * ARC_LAYOUT.notchIconRadialInsetRatio,
    });

    if (options.channel.statusIcon) {
        return `
            <svg x="${formatSvgNumber(iconCenter.xCoordinate - iconSize / 2)}"
                y="${formatSvgNumber(iconCenter.yCoordinate - iconSize / 2)}"
                width="${formatSvgNumber(iconSize)}" height="${formatSvgNumber(iconSize)}"
                color="${options.channel.color}"
                ${buildSvgFilterAttributes(options.iconFilter).join(" ")}
                viewBox="${options.channel.statusIcon.viewBox.x} ${options.channel.statusIcon.viewBox.y} ${options.channel.statusIcon.viewBox.width} ${options.channel.statusIcon.viewBox.height}">
                ${options.channel.statusIcon.fragment}
            </svg>
        `;
    }

    return `
        <g color="${options.channel.color}" transform="translate(${formatSvgNumber(iconCenter.xCoordinate)} ${formatSvgNumber(iconCenter.yCoordinate)}) scale(${formatSvgNumber(iconSize / ARC_LAYOUT.inlineIconSourceSize)})" ${buildSvgFilterAttributes(options.iconFilter).join(" ")}>
            ${options.channel.iconFragment}
        </g>
    `;
}

function renderCenterContent(options: {
    data: DualChannelWidgetData;
    config: DualChannelProgressCircleConfig;
    geometry: RingGeometry;
}): string {
    if (options.config.centerContent === "icon") {
        return renderCenterIcon({
            centerIconFragment: options.config.centerIconFragment,
            geometry: options.geometry,
            iconColor: options.config.iconColor,
            iconFilter: options.config.themeEffects.iconFilter,
        });
    }

    if (options.config.circleVariant === "gauge") {
        return renderGaugeValueRows(options);
    }

    return renderValueRows(options);
}

function renderCenterIcon(options: {
    centerIconFragment: string | undefined;
    geometry: RingGeometry;
    iconColor: string;
    iconFilter: string | undefined;
}): string {
    if (!options.centerIconFragment) {
        return "";
    }

    return `
        <g color="${options.iconColor}" transform="translate(${formatSvgNumber(options.geometry.centerXCoordinate)} ${formatSvgNumber(options.geometry.centerYCoordinate)}) scale(${formatSvgNumber(ARC_LAYOUT.centerIconScale)})" ${buildSvgFilterAttributes(options.iconFilter).join(" ")}>
            ${options.centerIconFragment}
        </g>
    `;
}

function renderValueRows(options: {
    data: DualChannelWidgetData;
    config: DualChannelProgressCircleConfig;
    geometry: RingGeometry;
}): string {
    const dividerYCoordinate = options.geometry.centerYCoordinate + ARC_LAYOUT.dividerYOffset;
    const upperRowLayout = resolveChannelValueRowLayout(options.geometry, "upper", dividerYCoordinate);
    const lowerRowLayout = resolveChannelValueRowLayout(options.geometry, "lower", dividerYCoordinate);
    const dividerHalfWidth = options.geometry.radius * ARC_LAYOUT.dividerDiameterRatio;

    return `
        ${renderChannelValueRow({
            rowId: "dual-arc-positive-row",
            widgetData: options.data.positive,
            iconFragment: options.config.positiveIconFragment,
            color: options.config.positiveColor,
            layout: upperRowLayout,
            config: options.config,
        })}
        <line x1="${formatSvgNumber(options.geometry.centerXCoordinate - dividerHalfWidth)}"
            y1="${formatSvgNumber(dividerYCoordinate)}"
            x2="${formatSvgNumber(options.geometry.centerXCoordinate + dividerHalfWidth)}"
            y2="${formatSvgNumber(dividerYCoordinate)}"
            stroke="${options.config.dividerColor}" stroke-width="1.2" stroke-linecap="round" ${buildSvgFilterAttributes(options.config.themeEffects.subtleFilter).join(" ")} />
        ${renderChannelValueRow({
            rowId: "dual-arc-negative-row",
            widgetData: options.data.negative,
            iconFragment: options.config.negativeIconFragment,
            color: options.config.negativeColor,
            layout: lowerRowLayout,
            config: options.config,
        })}
    `;
}

function renderGaugeValueRows(options: {
    data: DualChannelWidgetData;
    config: DualChannelProgressCircleConfig;
    geometry: RingGeometry;
}): string {
    const dividerYCoordinate = options.geometry.centerYCoordinate + ARC_LAYOUT.dividerYOffset;
    const dividerHalfWidth = options.geometry.radius * ARC_LAYOUT.dividerDiameterRatio;

    return `
        ${renderGaugeChannelValueRow({
            rowId: "dual-progress-circle-positive-row",
            widgetData: options.data.positive,
            iconFragment: options.config.positiveIconFragment,
            color: options.config.positiveColor,
            yCoordinate: dividerYCoordinate - ARC_LAYOUT.gaugeRowYOffset,
            geometry: options.geometry,
            config: options.config,
        })}
        <line x1="${formatSvgNumber(options.geometry.centerXCoordinate - dividerHalfWidth)}"
            y1="${formatSvgNumber(dividerYCoordinate)}"
            x2="${formatSvgNumber(options.geometry.centerXCoordinate + dividerHalfWidth)}"
            y2="${formatSvgNumber(dividerYCoordinate)}"
            stroke="${options.config.dividerColor}" stroke-width="1.2" stroke-linecap="round" ${buildSvgFilterAttributes(options.config.themeEffects.subtleFilter).join(" ")} />
        ${renderGaugeChannelValueRow({
            rowId: "dual-progress-circle-negative-row",
            widgetData: options.data.negative,
            iconFragment: options.config.negativeIconFragment,
            color: options.config.negativeColor,
            yCoordinate: dividerYCoordinate + ARC_LAYOUT.gaugeRowYOffset,
            geometry: options.geometry,
            config: options.config,
        })}
    `;
}

function renderGaugeBottomLabel(options: {
    config: DualChannelProgressCircleConfig;
    geometry: RingGeometry;
}): string {
    const labelText = resolveGaugeBottomLabelText(options.config);
    const labelTextStyle = options.config.textStyles.smallLabel;

    if (labelText.length === 0) {
        return "";
    }

    return renderStyledSvgText({
        id: "dual-progress-circle-bottom-label",
        text: labelText,
        xCoordinate: options.geometry.centerXCoordinate,
        yCoordinate: options.geometry.centerYCoordinate + ARC_LAYOUT.gaugeBottomLabelYOffset,
        maxWidth: Math.max(24, options.geometry.radius * ARC_LAYOUT.gaugeBottomLabelMaxWidthRatio),
        baseFontSize: ARC_LAYOUT.gaugeBottomLabelFontSize,
        textStyle: labelTextStyle,
        fill: options.config.unitTextColor,
        textAnchor: "middle",
        extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
    });
}

function resolveGaugeBottomLabelText(config: DualChannelProgressCircleConfig): string {
    const titleText = config.titleText?.trim() ?? "";

    if (titleText.toUpperCase() === "NETWORK") {
        return "NET";
    }

    return titleText;
}

function renderGaugeChannelValueRow(options: {
    rowId: string;
    widgetData: DualChannelWidgetData["positive"];
    iconFragment: string | undefined;
    color: string;
    yCoordinate: number;
    geometry: RingGeometry;
    config: DualChannelProgressCircleConfig;
}): string {
    const valueTextStyle = options.config.textStyles.value;
    const unitTextStyle = options.config.textStyles.unit;
    const iconXCoordinate = options.geometry.centerXCoordinate - options.geometry.radius * ARC_LAYOUT.gaugeRowIconXRatio;
    const unitXCoordinate = options.geometry.centerXCoordinate + options.geometry.radius * ARC_LAYOUT.gaugeRowUnitXRatio;
    const valueText = options.widgetData.displayValue ?? options.widgetData.current.toFixed(1);
    const valueDigitCount = resolveGaugeRowDigitCount(valueText);
    const valueXCoordinate = resolveGaugeRowValueXCoordinate({
        centerXCoordinate: options.geometry.centerXCoordinate,
        radius: options.geometry.radius,
        digitCount: valueDigitCount,
    });

    if (valueText === "N/A") {
        return `
            ${renderInlineIcon({
                iconFragment: options.iconFragment,
                color: options.color,
                xCoordinate: iconXCoordinate,
                yCoordinate: options.yCoordinate,
                opticalYOffset: 0,
                iconFilter: options.config.themeEffects.iconFilter,
            })}
            ${renderStyledSvgText({
                id: `${options.rowId}-value`,
                text: valueText,
                xCoordinate: options.geometry.centerXCoordinate + options.geometry.radius * ARC_LAYOUT.gaugeUnavailableValueXRatio,
                yCoordinate: options.yCoordinate,
                maxWidth: ARC_LAYOUT.gaugeUnavailableValueWidth,
                baseFontSize: ARC_LAYOUT.gaugeUnavailableValueFontSize,
                textStyle: valueTextStyle,
                fill: options.config.valueTextColor,
                textAnchor: "start",
                extraAttributes: [
                    "font-variant-numeric=\"tabular-nums\"",
                    ...buildSvgFilterAttributes(valueTextStyle.filter),
                ],
                fitOptions: { minimumFontScale: 0.70 },
            })}
        `;
    }

    return `
        ${renderInlineIcon({
            iconFragment: options.iconFragment,
            color: options.color,
            xCoordinate: iconXCoordinate,
            yCoordinate: options.yCoordinate,
            opticalYOffset: 0,
            iconFilter: options.config.themeEffects.iconFilter,
        })}
        ${renderStyledSvgText({
            id: `${options.rowId}-value`,
            text: valueText,
            xCoordinate: valueXCoordinate,
            yCoordinate: options.yCoordinate,
            maxWidth: ARC_LAYOUT.gaugeValueWidth,
            baseFontSize: resolveGaugeRowValueFontSize(valueDigitCount),
            textStyle: valueTextStyle,
            fill: options.config.valueTextColor,
            textAnchor: "end",
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(valueTextStyle.filter),
            ],
            fitOptions: { minimumFontScale: 0.52 },
        })}
        ${renderStyledSvgText({
            id: `${options.rowId}-unit`,
            text: options.widgetData.unit,
            xCoordinate: unitXCoordinate,
            yCoordinate: options.yCoordinate,
            maxWidth: ARC_LAYOUT.gaugeUnitWidth,
            baseFontSize: ARC_LAYOUT.gaugeUnitFontSize,
            textStyle: unitTextStyle,
            fill: options.config.unitTextColor,
            textAnchor: "start",
            extraAttributes: buildSvgFilterAttributes(unitTextStyle.filter),
            fitOptions: { minimumFontScale: 0.62 },
        })}
    `;
}

function resolveGaugeRowValueXCoordinate(options: {
    centerXCoordinate: number;
    radius: number;
    digitCount: number;
}): number {
    const endXRatio = options.digitCount <= 1
        ? ARC_LAYOUT.gaugeRowOneDigitValueEndXRatio
        : ARC_LAYOUT.gaugeRowValueEndXRatio;

    return options.centerXCoordinate + options.radius * endXRatio;
}

function resolveGaugeRowValueFontSize(digitCount: number): number {
    const fontSizes = ARC_LAYOUT.gaugeValueDigitFontSizes;

    if (digitCount <= 1) {
        return fontSizes.one;
    }

    if (digitCount === 2) {
        return fontSizes.two;
    }

    if (digitCount === 3) {
        return fontSizes.three;
    }

    return fontSizes.many;
}

function resolveGaugeRowDigitCount(valueText: string): number {
    return Array.from(valueText).filter(character => /\d/u.test(character)).length;
}

function resolveChannelValueRowLayout(
    geometry: RingGeometry,
    rowPosition: "upper" | "lower",
    dividerYCoordinate: number,
): ChannelValueRowLayout {
    const contentLeftXCoordinate = geometry.centerXCoordinate - geometry.radius * 0.62;
    const contentRightXCoordinate = geometry.centerXCoordinate + geometry.radius * 0.62;
    const iconXCoordinate = contentLeftXCoordinate + geometry.radius * ARC_LAYOUT.inlineIconXRatio;
    const textXCoordinate = geometry.centerXCoordinate
        - geometry.radius * ARC_LAYOUT.rowTextXRatio
        + geometry.radius * ARC_LAYOUT.rowTextXOffsetRatio;
    const dividerTextPadding = geometry.radius * ARC_LAYOUT.dividerTextPaddingRatio;
    const valueUnitBaselineGap = geometry.radius * ARC_LAYOUT.valueUnitBaselineGapRatio;
    const unitBaselineYOffset = geometry.radius * ARC_LAYOUT.unitBaselineYOffsetRatio;
    const valueTextHalfHeight = ARC_LAYOUT.valueFontSize * ARC_LAYOUT.textClipHeightRatio / 2;
    const unitTextHalfHeight = ARC_LAYOUT.unitFontSize * ARC_LAYOUT.textClipHeightRatio / 2;
    const valueYCoordinate = rowPosition === "upper"
        ? dividerYCoordinate - dividerTextPadding - unitTextHalfHeight - valueUnitBaselineGap
        : dividerYCoordinate + dividerTextPadding + valueTextHalfHeight;
    const unitYCoordinate = rowPosition === "upper"
        ? dividerYCoordinate - dividerTextPadding - unitTextHalfHeight + unitBaselineYOffset
        : valueYCoordinate + valueUnitBaselineGap + unitBaselineYOffset;
    const groupCenterYCoordinate = (valueYCoordinate + unitYCoordinate) / 2;

    return {
        rowPosition,
        iconXCoordinate,
        groupCenterYCoordinate,
        valueYCoordinate,
        unitYCoordinate,
        textXCoordinate,
        textWidth: Math.max(42, contentRightXCoordinate - textXCoordinate),
    };
}

function renderChannelValueRow(options: {
    rowId: string;
    widgetData: DualChannelWidgetData["positive"];
    iconFragment: string | undefined;
    color: string;
    layout: ChannelValueRowLayout;
    config: DualChannelProgressCircleConfig;
}): string {
    return `
        ${renderInlineIcon({
            iconFragment: options.iconFragment,
            color: options.color,
            xCoordinate: options.layout.iconXCoordinate,
            yCoordinate: options.layout.groupCenterYCoordinate,
            opticalYOffset: resolveInlineIconOpticalYOffset(options.layout.rowPosition),
            iconFilter: options.config.themeEffects.iconFilter,
        })}
        ${renderChannelValueBlock({
            rowId: options.rowId,
            valueText: options.widgetData.displayValue ?? options.widgetData.current.toFixed(1),
            unitText: options.widgetData.unit,
            layout: options.layout,
            config: options.config,
        })}
    `;
}

function renderChannelValueBlock(options: {
    rowId: string;
    valueText: string;
    unitText: string;
    layout: ChannelValueRowLayout;
    config: DualChannelProgressCircleConfig;
}): string {
    const valueTextStyle = options.config.textStyles.value;
    const unitTextStyle = options.config.textStyles.unit;

    if (shouldRenderSingleLineValue(options.valueText, options.unitText)) {
        return renderStyledSvgText({
            id: `${options.rowId}-value`,
            text: options.valueText,
            xCoordinate: options.layout.textXCoordinate,
            yCoordinate: options.layout.groupCenterYCoordinate,
            maxWidth: options.layout.textWidth,
            baseFontSize: ARC_LAYOUT.valueFontSize,
            textStyle: valueTextStyle,
            fill: options.config.valueTextColor,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(valueTextStyle.filter),
            ],
            fitOptions: { minimumFontScale: 0.58 },
        });
    }

    return `
        ${renderStyledSvgText({
            id: `${options.rowId}-value`,
            text: options.valueText,
            xCoordinate: options.layout.textXCoordinate,
            yCoordinate: options.layout.valueYCoordinate,
            maxWidth: options.layout.textWidth,
            baseFontSize: ARC_LAYOUT.valueFontSize,
            textStyle: valueTextStyle,
            fill: options.config.valueTextColor,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(valueTextStyle.filter),
            ],
            fitOptions: { minimumFontScale: 0.58 },
        })}
        ${renderStyledSvgText({
            id: `${options.rowId}-unit`,
            text: options.unitText,
            xCoordinate: options.layout.textXCoordinate,
            yCoordinate: options.layout.unitYCoordinate,
            maxWidth: options.layout.textWidth,
            baseFontSize: ARC_LAYOUT.unitFontSize,
            textStyle: unitTextStyle,
            fill: options.config.unitTextColor,
            extraAttributes: buildSvgFilterAttributes(unitTextStyle.filter),
            fitOptions: { minimumFontScale: 0.70 },
        })}
    `;
}

function shouldRenderSingleLineValue(valueText: string, unitText: string): boolean {
    return unitText.length === 0 || valueText === "N/A";
}

function renderInlineIcon(options: {
    iconFragment: string | undefined;
    color: string;
    xCoordinate: number;
    yCoordinate: number;
    opticalYOffset: number;
    iconFilter: string | undefined;
}): string {
    const yCoordinate = options.yCoordinate + options.opticalYOffset;

    if (options.iconFragment) {
        const iconScale = ARC_LAYOUT.inlineIconSize / ARC_LAYOUT.inlineIconSourceSize;

        return `
            <g color="${options.color}" transform="translate(${formatSvgNumber(options.xCoordinate)} ${formatSvgNumber(yCoordinate)}) scale(${formatSvgNumber(iconScale)})" ${buildSvgFilterAttributes(options.iconFilter).join(" ")}>
                ${options.iconFragment}
            </g>
        `;
    }

    return `<circle cx="${formatSvgNumber(options.xCoordinate)}" cy="${formatSvgNumber(yCoordinate)}"
        r="${formatSvgNumber(ARC_LAYOUT.inlineIconSize / 4)}" fill="${options.color}" ${buildSvgFilterAttributes(options.iconFilter).join(" ")} />`;
}

function resolveInlineIconOpticalYOffset(rowPosition: "upper" | "lower"): number {
    const yOffsetRatio = rowPosition === "upper"
        ? ARC_LAYOUT.inlineIconUpperOpticalYOffsetRatio
        : ARC_LAYOUT.inlineIconLowerOpticalYOffsetRatio;

    return ARC_LAYOUT.inlineIconSize * yOffsetRatio;
}

function resolveNotchAngleDegrees(geometry: RingGeometry, notchGapLength: number): number {
    return notchGapLength / geometry.circumference * 360;
}

function resolvePointOnCircle(options: {
    geometry: RingGeometry;
    angleDegrees: number;
    radialOffset: number;
}): { xCoordinate: number; yCoordinate: number } {
    const angleRadians = options.angleDegrees * Math.PI / 180;
    const radius = options.geometry.radius + options.radialOffset;

    return {
        xCoordinate: options.geometry.centerXCoordinate + Math.cos(angleRadians) * radius,
        yCoordinate: options.geometry.centerYCoordinate + Math.sin(angleRadians) * radius,
    };
}

function formatSvgNumber(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;

    return Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(2);
}
