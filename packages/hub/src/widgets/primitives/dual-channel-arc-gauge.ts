import type { DualChannelWidgetData, KeySize } from "../../rendering/widget-data";
import {
    clamp,
    renderConstrainedSvgText,
} from "../../rendering/svg-utils";
import type { WidgetBaseConfig } from "../widget.interface";
import type { ArcGaugeStatusIcon } from "./arc-gauge";

export type DualChannelArcGaugeCenterContent = "value" | "icon" | "icon-value-unit";

export interface DualChannelArcGaugeConfig extends WidgetBaseConfig {
    trackColor: string;
    strokeWidth: number;
    valueTextColor: string;
    unitTextColor: string;
    dividerColor: string;
    centerContent: DualChannelArcGaugeCenterContent;
    centerIconFragment?: string;
    positiveIconFragment?: string;
    negativeIconFragment?: string;
    positiveStatusIcon?: ArcGaugeStatusIcon;
    negativeStatusIcon?: ArcGaugeStatusIcon;
    positiveColor: string;
    negativeColor: string;
}

export const DEFAULT_DUAL_CHANNEL_ARC_GAUGE_CONFIG: DualChannelArcGaugeConfig = {
    colorConfig: { mode: "solid", solidColor: "#3b82f6", thresholds: [] },
    trackColor: "rgba(255,255,255,0.14)",
    strokeWidth: 11,
    valueTextColor: "white",
    unitTextColor: "rgba(255,255,255,0.74)",
    dividerColor: "rgba(255,255,255,0.18)",
    centerContent: "value",
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
    centerIconScale: 0.86,
    notchIconSizeRatio: 2.15,
    notchGapWidthRatio: 4.4,
    notchIconRadialInsetRatio: 0.72,
} as const;

const ARC_TEXT_FONT_FAMILY = "'Inter','SF Pro Display','Segoe UI',sans-serif";

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
    progress: number;
    rotationDegrees: number;
    iconRotationDegrees: number;
    iconFragment: string | undefined;
    statusIcon: ArcGaugeStatusIcon | undefined;
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
 * Renders two independent network speed channels in one circular gauge.
 * The positive channel owns the first clockwise half and the negative channel
 * owns the second clockwise half, so each value has a fixed visual lane.
 */
export function renderDualChannelArcGauge(
    data: DualChannelWidgetData,
    config: DualChannelArcGaugeConfig,
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
    const channelArcModels: readonly ChannelArcModel[] = [
        {
            channelId: "positive",
            color: config.positiveColor,
            progress: data.positive.progress,
            rotationDegrees: -90,
            iconRotationDegrees: -90,
            iconFragment: config.positiveIconFragment,
            statusIcon: config.positiveStatusIcon,
        },
        {
            channelId: "negative",
            color: config.negativeColor,
            progress: data.negative.progress,
            rotationDegrees: 90,
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
            hasNotches: config.centerContent === "icon",
        })}
        ${renderCenterContent({ data, config, geometry })}
    `;
}

function renderRing(options: {
    geometry: RingGeometry;
    channelArcModels: readonly ChannelArcModel[];
    trackColor: string;
    strokeWidth: number;
    hasNotches: boolean;
}): string {
    const notchGapLength = options.hasNotches
        ? options.strokeWidth * ARC_LAYOUT.notchGapWidthRatio
        : 0;
    const visibleHalfLength = Math.max(1, options.geometry.halfLength - notchGapLength);
    const trackDashArray = `${visibleHalfLength} ${options.geometry.circumference - visibleHalfLength}`;

    return `
        ${options.channelArcModels.map(channel => renderArcSegment({
            geometry: options.geometry,
            stroke: options.trackColor,
            strokeWidth: options.strokeWidth,
            dashArray: trackDashArray,
            dashOffset: 0,
            rotationDegrees: channel.rotationDegrees + (options.hasNotches ? resolveNotchAngleDegrees(options.geometry, notchGapLength) / 2 : 0),
        })).join("")}
        ${options.channelArcModels.map(channel => {
            const progressLength = visibleHalfLength * clamp(channel.progress, 0, 1);

            if (progressLength <= 0) {
                return "";
            }

            return renderArcSegment({
                geometry: options.geometry,
                stroke: buildChannelGradient(channel),
                strokeWidth: options.strokeWidth,
                dashArray: `${progressLength} ${options.geometry.circumference - progressLength}`,
                dashOffset: 0,
                rotationDegrees: channel.rotationDegrees
                    + (options.hasNotches ? resolveNotchAngleDegrees(options.geometry, notchGapLength) / 2 : 0),
            });
        }).join("")}
        ${options.hasNotches ? options.channelArcModels.map(channel => renderNotchIcon({
            geometry: options.geometry,
            strokeWidth: options.strokeWidth,
            channel,
        })).join("") : ""}
    `;
}

function renderArcSegment(options: {
    geometry: RingGeometry;
    stroke: string;
    strokeWidth: number;
    dashArray: string;
    dashOffset: number;
    rotationDegrees: number;
}): string {
    return `
        <circle cx="${formatSvgNumber(options.geometry.centerXCoordinate)}"
            cy="${formatSvgNumber(options.geometry.centerYCoordinate)}"
            r="${formatSvgNumber(options.geometry.radius)}"
            fill="none" stroke="${options.stroke}" stroke-width="${formatSvgNumber(options.strokeWidth)}"
            stroke-dasharray="${options.dashArray}" stroke-dashoffset="${formatSvgNumber(options.dashOffset)}"
            stroke-linecap="round"
            transform="rotate(${formatSvgNumber(options.rotationDegrees)} ${formatSvgNumber(options.geometry.centerXCoordinate)} ${formatSvgNumber(options.geometry.centerYCoordinate)})" />
    `;
}

function buildChannelGradient(channel: ChannelArcModel): string {
    return channel.color;
}

function renderNotchIcon(options: {
    geometry: RingGeometry;
    strokeWidth: number;
    channel: ChannelArcModel;
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
                viewBox="${options.channel.statusIcon.viewBox.x} ${options.channel.statusIcon.viewBox.y} ${options.channel.statusIcon.viewBox.width} ${options.channel.statusIcon.viewBox.height}">
                ${options.channel.statusIcon.fragment}
            </svg>
        `;
    }

    return `
        <g transform="translate(${formatSvgNumber(iconCenter.xCoordinate)} ${formatSvgNumber(iconCenter.yCoordinate)}) scale(${formatSvgNumber(iconSize / ARC_LAYOUT.inlineIconSourceSize)})">
            ${options.channel.iconFragment}
        </g>
    `;
}

function renderCenterContent(options: {
    data: DualChannelWidgetData;
    config: DualChannelArcGaugeConfig;
    geometry: RingGeometry;
}): string {
    if (options.config.centerContent === "icon") {
        return renderCenterIcon({
            centerIconFragment: options.config.centerIconFragment,
            geometry: options.geometry,
        });
    }

    return renderValueRows(options);
}

function renderCenterIcon(options: {
    centerIconFragment: string | undefined;
    geometry: RingGeometry;
}): string {
    if (!options.centerIconFragment) {
        return "";
    }

    return `
        <g transform="translate(${formatSvgNumber(options.geometry.centerXCoordinate)} ${formatSvgNumber(options.geometry.centerYCoordinate)}) scale(${formatSvgNumber(ARC_LAYOUT.centerIconScale)})">
            ${options.centerIconFragment}
        </g>
    `;
}

function renderValueRows(options: {
    data: DualChannelWidgetData;
    config: DualChannelArcGaugeConfig;
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
            stroke="${options.config.dividerColor}" stroke-width="1.2" stroke-linecap="round" />
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
    config: DualChannelArcGaugeConfig;
}): string {
    return `
        ${renderInlineIcon({
            iconFragment: options.iconFragment,
            color: options.color,
            xCoordinate: options.layout.iconXCoordinate,
            yCoordinate: options.layout.groupCenterYCoordinate,
            opticalYOffset: resolveInlineIconOpticalYOffset(options.layout.rowPosition),
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
    config: DualChannelArcGaugeConfig;
}): string {
    if (shouldRenderSingleLineValue(options.valueText, options.unitText)) {
        return renderConstrainedSvgText({
            id: `${options.rowId}-value`,
            text: options.valueText,
            xCoordinate: options.layout.textXCoordinate,
            yCoordinate: options.layout.groupCenterYCoordinate,
            maxWidth: options.layout.textWidth,
            fontSize: ARC_LAYOUT.valueFontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 900,
            fill: options.config.valueTextColor,
            extraAttributes: ["font-variant-numeric=\"tabular-nums\""],
            fitOptions: { minimumFontScale: 0.58 },
        });
    }

    return `
        ${renderConstrainedSvgText({
            id: `${options.rowId}-value`,
            text: options.valueText,
            xCoordinate: options.layout.textXCoordinate,
            yCoordinate: options.layout.valueYCoordinate,
            maxWidth: options.layout.textWidth,
            fontSize: ARC_LAYOUT.valueFontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 900,
            fill: options.config.valueTextColor,
            extraAttributes: ["font-variant-numeric=\"tabular-nums\""],
            fitOptions: { minimumFontScale: 0.58 },
        })}
        ${renderConstrainedSvgText({
            id: `${options.rowId}-unit`,
            text: options.unitText,
            xCoordinate: options.layout.textXCoordinate,
            yCoordinate: options.layout.unitYCoordinate,
            maxWidth: options.layout.textWidth,
            fontSize: ARC_LAYOUT.unitFontSize,
            fontFamily: ARC_TEXT_FONT_FAMILY,
            fontWeight: 780,
            fill: options.config.unitTextColor,
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
}): string {
    const yCoordinate = options.yCoordinate + options.opticalYOffset;

    if (options.iconFragment) {
        const iconScale = ARC_LAYOUT.inlineIconSize / ARC_LAYOUT.inlineIconSourceSize;

        return `
            <g transform="translate(${formatSvgNumber(options.xCoordinate)} ${formatSvgNumber(yCoordinate)}) scale(${formatSvgNumber(iconScale)})">
                ${options.iconFragment}
            </g>
        `;
    }

    return `<circle cx="${formatSvgNumber(options.xCoordinate)}" cy="${formatSvgNumber(yCoordinate)}"
        r="${formatSvgNumber(ARC_LAYOUT.inlineIconSize / 4)}" fill="${options.color}" />`;
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
