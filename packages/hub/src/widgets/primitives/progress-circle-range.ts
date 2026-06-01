import type { ColorConfig } from "../../view-rendering/color-resolver";
import {
    adjustHexColorBrightness,
    clamp,
    escapeSvgText,
    formatSvgShapeOutlineStrokeAttributes,
    isSvgOutlineEnabled,
    resolveSvgFilledShapeOutlinePadding,
    resolveSvgShapeOutlineExtraWidth,
} from "../../view-rendering/svg-utils";
import type { RenderOutlineTokens } from "../../view-rendering/render-appearance";
import { interpolateHexColor } from "../../shared/color-utils";
import type { CircleVariant } from "./progress-circle";

export interface ProgressCircleGeometry {
    centerXCoordinate: number;
    centerYCoordinate: number;
    radius: number;
    circumference: number;
}

export interface RingNotchGeometry {
    gapLength: number;
    visibleLength: number;
    startRotationDegrees: number;
    gapAngleDegrees: number;
}

interface GaugeRangeGradientStop {
    offset: number;
    color: string;
}

interface GaugeRangeColorBand {
    startProgress: number;
    endProgress: number;
    color: string;
}

interface GaugeRangePaintSegment {
    startProgress: number;
    endProgress: number;
    startColor: string;
    endColor: string;
}

export interface GaugeRangeColorPlan {
    stops: readonly GaugeRangeGradientStop[];
    paintSegments: readonly GaugeRangePaintSegment[];
    markerFill: string;
}

export interface GaugeMarkerDot {
    xCoordinate: number;
    yCoordinate: number;
    progress: number;
    radius: number;
    gapLength: number;
    fill: string;
}

export interface GaugeRangeLaneGeometry {
    startAngleDegrees: number;
    endAngleDegrees: number;
    visibleLength: number;
}

export interface GaugeMarkerGap {
    startProgress: number;
    endProgress: number;
}

interface GaugeMarkerTravelDomain {
    minimumProgress: number;
    maximumProgress: number;
}

const GAUGE_RANGE_SEGMENT_OVERLAP_PROGRESS = 0.002;
const MAX_GAUGE_RANGE_BLEND_PROGRESS = 0.24;
// Keep marker dots away from the open gauge ends so the dot remains visible
// without changing true 0% and 100% endpoint semantics.
const GAUGE_MARKER_VISUAL_MIN_PROGRESS = 0.08;
const GAUGE_MARKER_VISUAL_MAX_PROGRESS = 0.90;

/**
 * Builds the color model shared by single and dual gauge lanes.
 *
 * `paintSegments` are used for filled annular arcs; `stops` remain for callers
 * that still need gradient-stop output.
 */
export function buildGaugeRangeColorPlan(options: {
    circleVariant: CircleVariant;
    colorConfig: ColorConfig;
    baseColor: string;
    progress: number;
    gradientHeadAdjustmentPercent: number;
    gaugeRangeBlendProgress: number;
}): GaugeRangeColorPlan {
    if (!options.colorConfig.isGradientEnabled) {
        const paintSegments = options.circleVariant === "gauge" && options.colorConfig.mode === "threshold"
            ? buildBlendedGaugeRangePaintSegments({
                bands: buildThresholdGaugeRangeBands(options.colorConfig),
                blendProgress: 0,
            })
            : [{
                startProgress: 0,
                endProgress: 1,
                startColor: options.baseColor,
                endColor: options.baseColor,
            }];

        return {
            stops: buildGaugeRangeStops(paintSegments),
            paintSegments,
            markerFill: options.circleVariant === "gauge"
                ? resolveGaugeRangePaintColor(clamp(options.progress, 0, 1), paintSegments)
                : options.baseColor,
        };
    }

    if (options.circleVariant === "gauge" && options.colorConfig.mode === "threshold") {
        const blendProgress = clamp(options.gaugeRangeBlendProgress, 0, MAX_GAUGE_RANGE_BLEND_PROGRESS);
        const rangeBands = buildThresholdGaugeRangeBands(options.colorConfig);
        const dynamicSegments = buildBlendedGaugeRangePaintSegments({
            bands: rangeBands,
            blendProgress,
        });
        const dynamicStops = buildBlendedGaugeGradientStops({
            bands: rangeBands,
            blendProgress,
        });

        return {
            stops: dynamicStops,
            paintSegments: dynamicSegments,
            markerFill: resolveGaugeRangePaintColor(clamp(options.progress, 0, 1), dynamicSegments),
        };
    }

    const baseStops = buildSingleHueGradientStops({
        baseColor: options.baseColor,
        gradientHeadAdjustmentPercent: options.gradientHeadAdjustmentPercent,
    });
    const basePaintSegments = buildSingleHuePaintSegments(baseStops);

    return {
        stops: baseStops,
        paintSegments: basePaintSegments,
        markerFill: options.circleVariant === "gauge"
            ? resolveGaugeRangePaintColor(clamp(options.progress, 0, 1), basePaintSegments)
            : baseStops[baseStops.length - 1]?.color ?? options.baseColor,
    };
}

/**
 * Formats one normalized gauge gradient stop for callers that render SVG defs.
 */
export function renderGradientStop(stop: GaugeRangeGradientStop): string {
    return `<stop offset="${formatSvgNumber(stop.offset * 100)}%" stop-color="${stop.color}" />`;
}

/**
 * Places a gauge marker dot on the visible ring while respecting marker travel guards.
 */
export function resolveGaugeMarkerDot(options: {
    geometry: ProgressCircleGeometry;
    notchGeometry: RingNotchGeometry;
    progress: number;
    fill: string;
    radius: number;
    gapLength: number;
}): GaugeMarkerDot {
    const markerRenderProgress = resolveGaugeMarkerRenderProgress({
        progress: options.progress,
        gapLength: options.gapLength,
        visibleLength: options.notchGeometry.visibleLength,
    });
    const visibleAngleDegrees = 360 - options.notchGeometry.gapAngleDegrees;
    const markerAngleDegrees = options.notchGeometry.startRotationDegrees + visibleAngleDegrees * markerRenderProgress;
    const markerPoint = resolvePointOnCircle({
        geometry: options.geometry,
        angleDegrees: markerAngleDegrees,
        radialOffset: 0,
    });

    return {
        xCoordinate: markerPoint.xCoordinate,
        yCoordinate: markerPoint.yCoordinate,
        progress: markerRenderProgress,
        radius: options.radius,
        gapLength: options.gapLength,
        fill: options.fill,
    };
}

/**
 * Renders the single-gauge range lane around a notched progress circle.
 *
 * This adapts the older notch geometry into the lane renderer used by both
 * single and dual gauge variants.
 */
export function renderGaugeRangeArcSegments(options: {
    geometry: ProgressCircleGeometry;
    notchGeometry: RingNotchGeometry;
    markerDot: GaugeMarkerDot | null;
    rangeColorPlan: GaugeRangeColorPlan;
    strokeWidth: number;
    outline?: RenderOutlineTokens;
}): string {
    return renderGaugeRangeLaneSegments({
        geometry: options.geometry,
        laneGeometry: {
            startAngleDegrees: options.notchGeometry.startRotationDegrees,
            endAngleDegrees: options.notchGeometry.startRotationDegrees + 360 - options.notchGeometry.gapAngleDegrees,
            visibleLength: options.notchGeometry.visibleLength,
        },
        markerDot: options.markerDot,
        rangeColorPlan: options.rangeColorPlan,
        strokeWidth: options.strokeWidth,
        outline: options.outline,
        segmentClassName: "progress-circle-range-segment",
        capClassName: "progress-circle-range-cap",
        gradientIdentifierPrefix: "progress-circle-range",
    });
}

/**
 * Renders filled annular range segments plus round caps for one gauge lane.
 *
 * A marker gap removes a small section from the always-filled lane so the
 * marker dot reads as a separate indicator instead of sitting on top of the arc.
 */
export function renderGaugeRangeLaneSegments(options: {
    geometry: ProgressCircleGeometry;
    laneGeometry: GaugeRangeLaneGeometry;
    markerDot: GaugeMarkerDot | null;
    rangeColorPlan: GaugeRangeColorPlan;
    strokeWidth: number;
    outline?: RenderOutlineTokens;
    segmentClassName: string;
    capClassName: string;
    gradientIdentifierPrefix: string;
}): string {
    const markerGap = options.markerDot
        ? resolveGaugeMarkerGap({
            progress: options.markerDot.progress,
            gapLength: options.markerDot.gapLength,
            visibleLength: options.laneGeometry.visibleLength,
        })
        : null;
    const visibleSegments = options.rangeColorPlan.paintSegments.flatMap((segment) => {
        return splitGaugeRangeSegmentByMarkerGap(segment, markerGap);
    });
    const arcSegments = visibleSegments.map((segment, segmentIndex) => renderGaugeRangeArcSegment({
        geometry: options.geometry,
        laneGeometry: options.laneGeometry,
        segment,
        gradientIdentifier: `${options.gradientIdentifierPrefix}-${segmentIndex}`,
        className: options.segmentClassName,
        strokeWidth: options.strokeWidth,
        outline: options.outline,
    }));
    const roundEndCaps = buildGaugeRangeRoundEndCaps({
        paintSegments: options.rangeColorPlan.paintSegments,
        markerGap,
    }).map((cap) => renderGaugeRangeRoundEndCap({
        geometry: options.geometry,
        laneGeometry: options.laneGeometry,
        progress: cap.progress,
        color: cap.color,
        radius: options.strokeWidth / 2,
        className: options.capClassName,
    }));

    return [...arcSegments, ...roundEndCaps].join("");
}

/**
 * Renders the foreground gauge marker dot.
 */
export function renderGaugeMarkerDot(markerDot: GaugeMarkerDot): string {
    return `<circle class="progress-circle-marker" cx="${formatSvgNumber(markerDot.xCoordinate)}"
        cy="${formatSvgNumber(markerDot.yCoordinate)}" r="${formatSvgNumber(markerDot.radius)}"
        fill="${markerDot.fill}" />`;
}

/**
 * Renders the black backing circle for gauge marker dots when shape outline is enabled.
 */
export function renderGaugeMarkerDotOutline(
    markerDot: GaugeMarkerDot,
    outline: RenderOutlineTokens | undefined,
    className: string,
): string {
    return renderFilledCircleOutline({
        className,
        xCoordinate: markerDot.xCoordinate,
        yCoordinate: markerDot.yCoordinate,
        radius: markerDot.radius,
        outline,
    });
}

/**
 * Formats numbers consistently for progress-circle range SVG fragments.
 */
export function formatSvgNumber(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;

    return Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(2);
}

function buildSingleHueGradientStops(options: {
    baseColor: string;
    gradientHeadAdjustmentPercent: number;
}): readonly GaugeRangeGradientStop[] {
    return [
        { offset: 0, color: options.baseColor },
        { offset: 0.5, color: adjustHexColorBrightness(options.baseColor, 34) },
        { offset: 1, color: adjustHexColorBrightness(options.baseColor, options.gradientHeadAdjustmentPercent) },
    ];
}

function buildSingleHuePaintSegments(stops: readonly GaugeRangeGradientStop[]): readonly GaugeRangePaintSegment[] {
    return stops.slice(0, -1).map((stop, stopIndex) => {
        const nextStop = stops[stopIndex + 1];

        return {
            startProgress: stop.offset,
            endProgress: nextStop.offset,
            startColor: stop.color,
            endColor: nextStop.color,
        };
    });
}

function buildThresholdGaugeRangeBands(colorConfig: ColorConfig): readonly GaugeRangeColorBand[] {
    const sortedThresholds = [...colorConfig.thresholds]
        .filter(threshold => threshold.max > threshold.min)
        .sort((leftThreshold, rightThreshold) => leftThreshold.min - rightThreshold.min);

    if (sortedThresholds.length === 0) {
        return [{
            startProgress: 0,
            endProgress: 1,
            color: colorConfig.solidColor,
        }];
    }

    return sortedThresholds.map((threshold, thresholdIndex) => {
        const nextThreshold = sortedThresholds[thresholdIndex + 1];
        const startProgress = thresholdIndex === 0
            ? 0
            : clamp(threshold.min / 100, 0, 1);
        const endProgress = nextThreshold
            ? clamp(threshold.max / 100, startProgress, 1)
            : 1;

        return {
            startProgress,
            endProgress,
            color: threshold.color,
        };
    }).filter(threshold => threshold.endProgress > threshold.startProgress);
}

function buildGaugeRangeStops(segments: readonly GaugeRangePaintSegment[]): readonly GaugeRangeGradientStop[] {
    return normalizeGradientStops(segments.flatMap((segment) => [
        { offset: segment.startProgress, color: segment.startColor },
        { offset: segment.endProgress, color: segment.endColor },
    ]));
}

/**
 * Builds solid color bands with localized transition segments at each semantic boundary.
 * Keeping blend width as progress-space data lets future settings adjust the softness
 * without changing the renderer.
 */
function buildBlendedGaugeRangePaintSegments(options: {
    bands: readonly GaugeRangeColorBand[];
    blendProgress: number;
}): readonly GaugeRangePaintSegment[] {
    if (options.blendProgress <= 0 || options.bands.length <= 1) {
        return options.bands.map((band) => ({
            startProgress: band.startProgress,
            endProgress: band.endProgress,
            startColor: band.color,
            endColor: band.color,
        }));
    }

    const transitionRanges = buildGaugeTransitionRanges(options.bands, options.blendProgress);
    const outputSegments: GaugeRangePaintSegment[] = [];

    for (let bandIndex = 0; bandIndex < options.bands.length; bandIndex++) {
        const band = options.bands[bandIndex];
        const previousTransition = transitionRanges[bandIndex - 1];
        const nextTransition = transitionRanges[bandIndex];
        const solidStartProgress = previousTransition?.endProgress ?? band.startProgress;
        const solidEndProgress = nextTransition?.startProgress ?? band.endProgress;

        if (solidEndProgress > solidStartProgress) {
            outputSegments.push({
                startProgress: solidStartProgress,
                endProgress: solidEndProgress,
                startColor: band.color,
                endColor: band.color,
            });
        }

        if (nextTransition) {
            outputSegments.push({
                startProgress: nextTransition.startProgress,
                endProgress: nextTransition.endProgress,
                startColor: nextTransition.fromColor,
                endColor: nextTransition.toColor,
            });
        }
    }

    return outputSegments;
}

function buildBlendedGaugeGradientStops(options: {
    bands: readonly GaugeRangeColorBand[];
    blendProgress: number;
}): readonly GaugeRangeGradientStop[] {
    if (options.blendProgress <= 0 || options.bands.length <= 1) {
        return buildGaugeRangeStops(options.bands.map((band) => ({
            startProgress: band.startProgress,
            endProgress: band.endProgress,
            startColor: band.color,
            endColor: band.color,
        })));
    }

    const transitionRanges = buildGaugeTransitionRanges(options.bands, options.blendProgress);
    const stops: GaugeRangeGradientStop[] = [{
        offset: options.bands[0]?.startProgress ?? 0,
        color: options.bands[0]?.color ?? "#ffffff",
    }];

    for (let bandIndex = 0; bandIndex < options.bands.length; bandIndex++) {
        const band = options.bands[bandIndex];
        const nextTransition = transitionRanges[bandIndex];

        if (nextTransition) {
            stops.push({
                offset: nextTransition.startProgress,
                color: band.color,
            });
            stops.push({
                offset: nextTransition.endProgress,
                color: nextTransition.toColor,
            });
            continue;
        }

        stops.push({
            offset: band.endProgress,
            color: band.color,
        });
    }

    return normalizeGradientStops(stops);
}

function buildGaugeTransitionRanges(
    bands: readonly GaugeRangeColorBand[],
    blendProgress: number,
): Array<{
    startProgress: number;
    endProgress: number;
    fromColor: string;
    toColor: string;
}> {
    const transitionRanges = [];

    for (let bandIndex = 0; bandIndex < bands.length - 1; bandIndex++) {
        const currentBand = bands[bandIndex];
        const nextBand = bands[bandIndex + 1];
        const boundaryProgress = currentBand.endProgress;
        const maximumLeftBlend = Math.max(0, boundaryProgress - currentBand.startProgress);
        const maximumRightBlend = Math.max(0, nextBand.endProgress - boundaryProgress);
        const halfBlendProgress = Math.min(blendProgress / 2, maximumLeftBlend, maximumRightBlend);

        transitionRanges.push({
            startProgress: boundaryProgress - halfBlendProgress,
            endProgress: boundaryProgress + halfBlendProgress,
            fromColor: currentBand.color,
            toColor: nextBand.color,
        });
    }

    return transitionRanges;
}

function normalizeGradientStops(stops: readonly GaugeRangeGradientStop[]): readonly GaugeRangeGradientStop[] {
    let previousOffset = 0;

    return stops.map((stop) => {
        const offset = Math.max(previousOffset, clamp(stop.offset, 0, 1));
        previousOffset = offset;

        return {
            offset,
            color: stop.color,
        };
    });
}

function buildGaugeRangeRoundEndCaps(options: {
    paintSegments: readonly GaugeRangePaintSegment[];
    markerGap: GaugeMarkerGap | null;
}): Array<{ progress: number; color: string }> {
    const caps: Array<{ progress: number; color: string }> = [
        { progress: 0, color: resolveGaugeRangePaintColor(0, options.paintSegments) },
        { progress: 1, color: resolveGaugeRangePaintColor(1, options.paintSegments) },
    ];

    if (options.markerGap) {
        caps.push({
            progress: options.markerGap.startProgress,
            color: resolveGaugeRangePaintColor(
                clamp(options.markerGap.startProgress - 0.001, 0, 1),
                options.paintSegments,
            ),
        });
        caps.push({
            progress: options.markerGap.endProgress,
            color: resolveGaugeRangePaintColor(
                clamp(options.markerGap.endProgress + 0.001, 0, 1),
                options.paintSegments,
            ),
        });
    }

    return caps;
}

function splitGaugeRangeSegmentByMarkerGap(
    segment: GaugeRangePaintSegment,
    markerGap: GaugeMarkerGap | null,
): GaugeRangePaintSegment[] {
    if (
        !markerGap
        || markerGap.endProgress <= segment.startProgress
        || markerGap.startProgress >= segment.endProgress
    ) {
        return [segment];
    }

    const segments: GaugeRangePaintSegment[] = [];
    const leftEndProgress = Math.min(markerGap.startProgress, segment.endProgress);
    const rightStartProgress = Math.max(markerGap.endProgress, segment.startProgress);

    if (leftEndProgress > segment.startProgress) {
        segments.push({
            ...segment,
            endProgress: leftEndProgress,
            endColor: resolveGaugeRangeSegmentColor(segment, leftEndProgress),
        });
    }

    if (rightStartProgress < segment.endProgress) {
        segments.push({
            ...segment,
            startProgress: rightStartProgress,
            startColor: resolveGaugeRangeSegmentColor(segment, rightStartProgress),
        });
    }

    return segments;
}

/**
 * Maps semantic progress to the visible marker travel domain.
 *
 * Interior values are pulled away from gauge ends to reserve room for the
 * marker gap; exact 0 and 1 remain exact endpoint values.
 */
export function resolveGaugeMarkerRenderProgress(options: {
    progress: number;
    gapLength: number;
    visibleLength: number;
}): number {
    const clampedProgress = clamp(options.progress, 0, 1);
    const markerTravelDomain = resolveGaugeMarkerTravelDomain(options);

    if (
        clampedProgress === 0
        || clampedProgress === 1
        || markerTravelDomain.maximumProgress <= markerTravelDomain.minimumProgress
    ) {
        return clampedProgress;
    }

    return markerTravelDomain.minimumProgress
        + clampedProgress * (markerTravelDomain.maximumProgress - markerTravelDomain.minimumProgress);
}

/**
 * Resolves the progress interval cut out of an always-filled gauge lane.
 */
export function resolveGaugeMarkerGap(options: {
    progress: number;
    gapLength: number;
    visibleLength: number;
}): GaugeMarkerGap {
    const markerRenderProgress = clamp(options.progress, 0, 1);
    const halfGapProgress = resolveGaugeMarkerHalfGapProgress(options);

    if (markerRenderProgress === 0 || markerRenderProgress === 1) {
        return {
            startProgress: clamp(markerRenderProgress - halfGapProgress, 0, 1),
            endProgress: clamp(markerRenderProgress + halfGapProgress, 0, 1),
        };
    }

    return {
        startProgress: clamp(
            markerRenderProgress - halfGapProgress,
            GAUGE_MARKER_VISUAL_MIN_PROGRESS,
            GAUGE_MARKER_VISUAL_MAX_PROGRESS,
        ),
        endProgress: clamp(
            markerRenderProgress + halfGapProgress,
            GAUGE_MARKER_VISUAL_MIN_PROGRESS,
            GAUGE_MARKER_VISUAL_MAX_PROGRESS,
        ),
    };
}

function resolveGaugeMarkerTravelDomain(options: {
    gapLength: number;
    visibleLength: number;
}): GaugeMarkerTravelDomain {
    const halfGapProgress = resolveGaugeMarkerHalfGapProgress(options);
    const minimumProgress = GAUGE_MARKER_VISUAL_MIN_PROGRESS + halfGapProgress;
    const maximumProgress = GAUGE_MARKER_VISUAL_MAX_PROGRESS - halfGapProgress;

    return {
        minimumProgress,
        maximumProgress,
    };
}

function resolveGaugeMarkerHalfGapProgress(options: {
    gapLength: number;
    visibleLength: number;
}): number {
    if (options.visibleLength <= 0) {
        return 0;
    }

    return clamp(options.gapLength / options.visibleLength, 0, 0.5);
}

function renderGaugeRangeArcSegment(options: {
    geometry: ProgressCircleGeometry;
    laneGeometry: GaugeRangeLaneGeometry;
    segment: GaugeRangePaintSegment;
    gradientIdentifier: string;
    className: string;
    strokeWidth: number;
    outline?: RenderOutlineTokens;
}): string {
    if (options.segment.endProgress - options.segment.startProgress <= 0.001) {
        return "";
    }

    const endProgress = clamp(
        options.segment.endProgress + GAUGE_RANGE_SEGMENT_OVERLAP_PROGRESS,
        options.segment.startProgress,
        1,
    );
    const startAngleDegrees = resolveGaugeRangeAngleDegrees(options.laneGeometry, options.segment.startProgress);
    const endAngleDegrees = resolveGaugeRangeAngleDegrees(options.laneGeometry, endProgress);
    const startPoint = resolvePointOnCircle({
        geometry: options.geometry,
        angleDegrees: startAngleDegrees,
        radialOffset: 0,
    });
    const endPoint = resolvePointOnCircle({
        geometry: options.geometry,
        angleDegrees: endAngleDegrees,
        radialOffset: 0,
    });
    const largeArcFlag = Math.abs(endAngleDegrees - startAngleDegrees) > 180 ? 1 : 0;
    const fill = options.segment.startColor === options.segment.endColor
        ? options.segment.startColor
        : `url(#${options.gradientIdentifier})`;
    const gradient = options.segment.startColor === options.segment.endColor
        ? ""
        : `<linearGradient id="${options.gradientIdentifier}" gradientUnits="userSpaceOnUse"
            x1="${formatSvgNumber(startPoint.xCoordinate)}" y1="${formatSvgNumber(startPoint.yCoordinate)}"
            x2="${formatSvgNumber(endPoint.xCoordinate)}" y2="${formatSvgNumber(endPoint.yCoordinate)}">
            <stop offset="0%" stop-color="${options.segment.startColor}" />
            <stop offset="100%" stop-color="${options.segment.endColor}" />
        </linearGradient>`;
    const path = renderAnnularArcPath({
        geometry: options.geometry,
        startAngleDegrees,
        endAngleDegrees,
        largeArcFlag,
        strokeWidth: options.strokeWidth,
    });
    // Filled annular arcs use the same path as a black backing stroke. Use only
    // the extra width here; the foreground fill already owns the visible band.
    const outlineStrokeWidth = resolveSvgShapeOutlineExtraWidth(options.strokeWidth, options.outline);
    const outlinePath = isSvgOutlineEnabled(options.outline)
        ? `<path class="${options.className}-outline" d="${path}"${formatSvgShapeOutlineStrokeAttributes({
            outline: options.outline,
            strokeWidth: outlineStrokeWidth,
            lineJoin: "round",
        })} />`
        : "";

    return `${gradient}${outlinePath}<path class="${options.className}"
        d="${path}"
        fill="${fill}" />`;
}

function renderAnnularArcPath(options: {
    geometry: ProgressCircleGeometry;
    startAngleDegrees: number;
    endAngleDegrees: number;
    largeArcFlag: number;
    strokeWidth: number;
}): string {
    const outerGeometry = {
        ...options.geometry,
        radius: options.geometry.radius + options.strokeWidth / 2,
    };
    const innerGeometry = {
        ...options.geometry,
        radius: Math.max(1, options.geometry.radius - options.strokeWidth / 2),
    };
    const outerStartPoint = resolvePointOnCircle({
        geometry: outerGeometry,
        angleDegrees: options.startAngleDegrees,
        radialOffset: 0,
    });
    const outerEndPoint = resolvePointOnCircle({
        geometry: outerGeometry,
        angleDegrees: options.endAngleDegrees,
        radialOffset: 0,
    });
    const innerStartPoint = resolvePointOnCircle({
        geometry: innerGeometry,
        angleDegrees: options.startAngleDegrees,
        radialOffset: 0,
    });
    const innerEndPoint = resolvePointOnCircle({
        geometry: innerGeometry,
        angleDegrees: options.endAngleDegrees,
        radialOffset: 0,
    });

    return [
        `M ${formatSvgNumber(outerStartPoint.xCoordinate)} ${formatSvgNumber(outerStartPoint.yCoordinate)}`,
        `A ${formatSvgNumber(outerGeometry.radius)} ${formatSvgNumber(outerGeometry.radius)} 0 ${options.largeArcFlag} 1 ${formatSvgNumber(outerEndPoint.xCoordinate)} ${formatSvgNumber(outerEndPoint.yCoordinate)}`,
        `L ${formatSvgNumber(innerEndPoint.xCoordinate)} ${formatSvgNumber(innerEndPoint.yCoordinate)}`,
        `A ${formatSvgNumber(innerGeometry.radius)} ${formatSvgNumber(innerGeometry.radius)} 0 ${options.largeArcFlag} 0 ${formatSvgNumber(innerStartPoint.xCoordinate)} ${formatSvgNumber(innerStartPoint.yCoordinate)}`,
        "Z",
    ].join(" ");
}

function renderGaugeRangeRoundEndCap(options: {
    geometry: ProgressCircleGeometry;
    laneGeometry: GaugeRangeLaneGeometry;
    progress: number;
    color: string;
    radius: number;
    className: string;
}): string {
    const point = resolvePointOnCircle({
        geometry: options.geometry,
        angleDegrees: resolveGaugeRangeAngleDegrees(options.laneGeometry, options.progress),
        radialOffset: 0,
    });

    // Round end caps are construction patches for the filled annular arc.
    // They are not independent metric shapes; outlining them separately creates
    // visible dots at every lane end and marker-gap edge.
    return `<circle class="${options.className}" cx="${formatSvgNumber(point.xCoordinate)}"
        cy="${formatSvgNumber(point.yCoordinate)}" r="${formatSvgNumber(options.radius)}"
        fill="${options.color}" />`;
}

function renderFilledCircleOutline(options: {
    className: string;
    xCoordinate: number;
    yCoordinate: number;
    radius: number;
    outline: RenderOutlineTokens | undefined;
}): string {
    if (!isSvgOutlineEnabled(options.outline)) {
        return "";
    }

    // Filled dots/caps use a larger black fill instead of a stroked circle so
    // the foreground dot can fully cover the center of the backing.
    const radius = options.radius + resolveSvgFilledShapeOutlinePadding(options.radius * 2, options.outline);

    return `<circle class="${options.className}" cx="${formatSvgNumber(options.xCoordinate)}"
        cy="${formatSvgNumber(options.yCoordinate)}" r="${formatSvgNumber(radius)}"
        fill="${escapeSvgText(options.outline.color)}" opacity="${formatSvgNumber(options.outline.strength)}" />`;
}

function resolveGaugeRangePaintColor(progress: number, segments: readonly GaugeRangePaintSegment[]): string {
    for (const segment of segments) {
        if (progress >= segment.startProgress && progress < segment.endProgress) {
            return resolveGaugeRangeSegmentColor(segment, progress);
        }
    }

    const lastSegment = segments[segments.length - 1];

    return lastSegment ? resolveGaugeRangeSegmentColor(lastSegment, progress) : "#ffffff";
}

function resolveGaugeRangeSegmentColor(segment: GaugeRangePaintSegment, progress: number): string {
    const span = segment.endProgress - segment.startProgress;
    const ratio = span > 0 ? (progress - segment.startProgress) / span : 0;

    return interpolateHexColor(segment.startColor, segment.endColor, ratio);
}

function resolvePointOnCircle(options: {
    geometry: ProgressCircleGeometry;
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

function resolveGaugeRangeAngleDegrees(laneGeometry: GaugeRangeLaneGeometry, progress: number): number {
    const visibleAngleDegrees = laneGeometry.endAngleDegrees - laneGeometry.startAngleDegrees;

    return laneGeometry.startAngleDegrees + visibleAngleDegrees * clamp(progress, 0, 1);
}
