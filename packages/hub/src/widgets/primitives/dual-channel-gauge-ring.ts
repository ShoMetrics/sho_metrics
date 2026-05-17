import {
    clamp,
} from "../../rendering/svg-utils";
import type { ColorConfig } from "../../rendering/color-resolver";
import {
    buildGaugeRangeColorPlan,
    formatSvgNumber,
    resolveGaugeMarkerRenderProgress,
    renderGaugeRangeLaneSegments,
    type ArcGaugeGeometry,
    type GaugeRangeColorPlan,
    type GaugeMarkerDot,
    type GaugeRangeLaneGeometry,
} from "./arc-gauge-range";

export interface DualGaugeRingGeometry {
    centerXCoordinate: number;
    centerYCoordinate: number;
    radius: number;
    circumference: number;
}

export interface DualGaugeChannelModel {
    channelId: "positive" | "negative";
    color: string;
    colorConfig: ColorConfig;
    progress: number;
    gaugeStartAngleDegrees: number;
    gaugeEndAngleDegrees: number;
}

interface GaugeLaneModel {
    channel: DualGaugeChannelModel;
    laneGeometry: GaugeRangeLaneGeometry;
    colorPlan: GaugeRangeColorPlan;
    markerDot: GaugeMarkerDot;
}

const GAUGE_RING_LAYOUT = {
    markerRadiusRatio: 0.78,
    markerGapPaddingRatio: 0.22,
    markerGapScale: 1.5,
} as const;

/**
 * Renders the dual-stream gauge variant: two always-filled colored gauge lanes,
 * each interrupted by a marker dot that indicates that channel's progress.
 */
export function renderDualGaugeRing(options: {
    geometry: DualGaugeRingGeometry;
    channelModels: readonly DualGaugeChannelModel[];
    strokeWidth: number;
}): string {
    const gaugeLaneModels = options.channelModels.map(channel => buildGaugeLaneModel({
        channel,
        geometry: options.geometry,
        strokeWidth: options.strokeWidth,
    }));

    return `
        ${gaugeLaneModels.map(gaugeLane => renderGaugeLaneArc({
            gaugeLane,
            geometry: options.geometry,
            strokeWidth: options.strokeWidth,
        })).join("")}
        ${gaugeLaneModels.map(gaugeLane => renderGaugeMarkerDot(
            gaugeLane.channel.channelId,
            gaugeLane.markerDot,
        )).join("")}
    `;
}

function buildGaugeLaneModel(options: {
    channel: DualGaugeChannelModel;
    geometry: DualGaugeRingGeometry;
    strokeWidth: number;
}): GaugeLaneModel {
    const arcAngleDegrees = options.channel.gaugeEndAngleDegrees - options.channel.gaugeStartAngleDegrees;
    const visibleLength = options.geometry.circumference * (arcAngleDegrees / 360);
    const progress = clamp(options.channel.progress, 0, 1);
    const markerRadius = options.strokeWidth * GAUGE_RING_LAYOUT.markerRadiusRatio;
    const markerGapLength = options.strokeWidth * (
        GAUGE_RING_LAYOUT.markerRadiusRatio + 0.5 + GAUGE_RING_LAYOUT.markerGapPaddingRatio
    ) * GAUGE_RING_LAYOUT.markerGapScale;
    const colorPlan = buildGaugeRangeColorPlan({
        circleVariant: "gauge",
        colorConfig: options.channel.colorConfig,
        baseColor: options.channel.color,
        progress,
        gradientHeadAdjustmentPercent: -42,
        gaugeRangeBlendProgress: 0.16,
    });
    const markerRenderProgress = resolveGaugeMarkerRenderProgress({
        progress,
        gapLength: markerGapLength,
        visibleLength,
    });
    const markerAngleDegrees = options.channel.gaugeStartAngleDegrees + arcAngleDegrees * markerRenderProgress;
    const markerPoint = resolvePointOnCircle({
        geometry: options.geometry,
        angleDegrees: markerAngleDegrees,
        radialOffset: 0,
    });

    return {
        channel: options.channel,
        laneGeometry: {
            startAngleDegrees: options.channel.gaugeStartAngleDegrees,
            endAngleDegrees: options.channel.gaugeEndAngleDegrees,
            visibleLength,
        },
        colorPlan,
        markerDot: {
            xCoordinate: markerPoint.xCoordinate,
            yCoordinate: markerPoint.yCoordinate,
            radius: markerRadius,
            fill: colorPlan.markerFill,
            progress: markerRenderProgress,
            gapLength: markerGapLength,
        },
    };
}

function renderGaugeLaneArc(options: {
    gaugeLane: GaugeLaneModel;
    geometry: DualGaugeRingGeometry;
    strokeWidth: number;
}): string {
    return renderGaugeRangeLaneSegments({
        geometry: toArcGaugeGeometry(options.geometry),
        laneGeometry: options.gaugeLane.laneGeometry,
        markerDot: options.gaugeLane.markerDot,
        rangeColorPlan: options.gaugeLane.colorPlan,
        strokeWidth: options.strokeWidth,
        segmentClassName: `dual-arc-gauge-${options.gaugeLane.channel.channelId}-segment`,
        capClassName: `dual-arc-gauge-${options.gaugeLane.channel.channelId}-cap`,
        gradientIdentifierPrefix: `dual-arc-${options.gaugeLane.channel.channelId}-range`,
    });
}

function renderGaugeMarkerDot(channelId: DualGaugeChannelModel["channelId"], markerDot: GaugeMarkerDot): string {
    return `<circle class="dual-arc-gauge-${channelId}-marker"
        cx="${formatSvgNumber(markerDot.xCoordinate)}"
        cy="${formatSvgNumber(markerDot.yCoordinate)}"
        r="${formatSvgNumber(markerDot.radius)}"
        fill="${markerDot.fill}" />`;
}

function resolvePointOnCircle(options: {
    geometry: DualGaugeRingGeometry;
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

function toArcGaugeGeometry(geometry: DualGaugeRingGeometry): ArcGaugeGeometry {
    return {
        centerXCoordinate: geometry.centerXCoordinate,
        centerYCoordinate: geometry.centerYCoordinate,
        radius: geometry.radius,
        circumference: geometry.circumference,
    };
}
