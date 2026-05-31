import {
    clamp,
} from "../../view-rendering/svg-utils";
import type { RenderOutlineTokens } from "../../view-rendering/render-appearance";
import type { ColorConfig } from "../../view-rendering/color-resolver";
import {
    buildGaugeRangeColorPlan,
    formatSvgNumber,
    renderGaugeMarkerDotOutline,
    resolveGaugeMarkerRenderProgress,
    renderGaugeRangeLaneSegments,
    type ProgressCircleGeometry,
    type GaugeRangeColorPlan,
    type GaugeMarkerDot,
    type GaugeRangeLaneGeometry,
} from "./progress-circle-range";

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
    /**
     * The metric progress before any visual lane mirroring.
     *
     * Keep this as the semantic value from the metric: 0 is low traffic and 1
     * is high traffic, regardless of which side of the gauge owns the lane.
     */
    progress: number;
    /**
     * Whether geometric lane progress follows the lane angles or is mirrored.
     *
     * The right-side network lane is user-facing bottom-to-top, mirroring the
     * left-side lane. The shared gauge arc renderer still draws that right lane
     * clockwise from its top angle to its bottom angle, so `end-to-start` maps
     * semantic progress onto the mirrored geometry without changing the metric
     * value itself.
     */
    progressDirection: "start-to-end" | "end-to-start";
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
    // Dual gauge lanes are always filled, so the marker needs a slightly
    // oversized cutout to stay visually separate from the colored arc.
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
    shapeOutline?: RenderOutlineTokens;
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
            shapeOutline: options.shapeOutline,
        })).join("")}
        ${gaugeLaneModels.map(gaugeLane => `
            ${renderGaugeMarkerDotOutline(
                gaugeLane.markerDot,
                options.shapeOutline,
                `dual-progress-circle-${gaugeLane.channel.channelId}-marker-outline`,
            )}
            ${renderGaugeMarkerDot(gaugeLane.channel.channelId, gaugeLane.markerDot)}
        `).join("")}
    `;
}

function buildGaugeLaneModel(options: {
    channel: DualGaugeChannelModel;
    geometry: DualGaugeRingGeometry;
    strokeWidth: number;
}): GaugeLaneModel {
    const arcAngleDegrees = options.channel.gaugeEndAngleDegrees - options.channel.gaugeStartAngleDegrees;
    const visibleLength = options.geometry.circumference * (Math.abs(arcAngleDegrees) / 360);
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
    const markerLaneProgress = resolveGaugeLaneProgress(
        options.channel.progressDirection,
        markerRenderProgress,
    );
    const markerAngleDegrees = options.channel.gaugeStartAngleDegrees + arcAngleDegrees * markerLaneProgress;
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
        colorPlan: options.channel.progressDirection === "end-to-start"
            ? reverseGaugeRangeColorPlan(colorPlan)
            : colorPlan,
        markerDot: {
            xCoordinate: markerPoint.xCoordinate,
            yCoordinate: markerPoint.yCoordinate,
            radius: markerRadius,
            fill: colorPlan.markerFill,
            progress: markerLaneProgress,
            gapLength: markerGapLength,
        },
    };
}

function resolveGaugeLaneProgress(
    progressDirection: DualGaugeChannelModel["progressDirection"],
    progress: number,
): number {
    if (progressDirection === "end-to-start") {
        return 1 - progress;
    }

    return progress;
}

function reverseGaugeRangeColorPlan(colorPlan: GaugeRangeColorPlan): GaugeRangeColorPlan {
    // When a lane mirrors semantic progress onto geometric progress, the
    // always-filled range track must mirror with it. Otherwise the marker would
    // move bottom-to-top while the low/mid/high colors stayed top-to-bottom.
    return {
        ...colorPlan,
        stops: colorPlan.stops.map(stop => ({
            offset: 1 - stop.offset,
            color: stop.color,
        })).reverse(),
        paintSegments: colorPlan.paintSegments.map(segment => ({
            startProgress: 1 - segment.endProgress,
            endProgress: 1 - segment.startProgress,
            startColor: segment.endColor,
            endColor: segment.startColor,
        })).reverse(),
    };
}

function renderGaugeLaneArc(options: {
    gaugeLane: GaugeLaneModel;
    geometry: DualGaugeRingGeometry;
    strokeWidth: number;
    shapeOutline: RenderOutlineTokens | undefined;
}): string {
    return renderGaugeRangeLaneSegments({
        geometry: toProgressCircleGeometry(options.geometry),
        laneGeometry: options.gaugeLane.laneGeometry,
        markerDot: options.gaugeLane.markerDot,
        rangeColorPlan: options.gaugeLane.colorPlan,
        strokeWidth: options.strokeWidth,
        outline: options.shapeOutline,
        segmentClassName: `dual-progress-circle-${options.gaugeLane.channel.channelId}-segment`,
        capClassName: `dual-progress-circle-${options.gaugeLane.channel.channelId}-cap`,
        gradientIdentifierPrefix: `dual-arc-${options.gaugeLane.channel.channelId}-range`,
    });
}

function renderGaugeMarkerDot(channelId: DualGaugeChannelModel["channelId"], markerDot: GaugeMarkerDot): string {
    return `<circle class="dual-progress-circle-${channelId}-marker"
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

function toProgressCircleGeometry(geometry: DualGaugeRingGeometry): ProgressCircleGeometry {
    return {
        centerXCoordinate: geometry.centerXCoordinate,
        centerYCoordinate: geometry.centerYCoordinate,
        radius: geometry.radius,
        circumference: geometry.circumference,
    };
}
