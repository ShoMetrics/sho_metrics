import type { SparklineScale } from "../../view-rendering/widget-data";
import { clamp } from "../../view-rendering/rasterize/svg-utils";
import { buildSparklineAreaPath, buildSparklineLinePath } from "./sparkline-path";
import { resolveSparklineScaleBounds } from "./sparkline-scale";
import { smoothSparklineValues } from "./sparkline-smoothing";

export type DualSparklineChannelOrientation = "positive" | "negative";

export interface DualSparklineChartLayout {
    xCoordinate: number;
    yCoordinate: number;
    width: number;
    height: number;
}

export interface DualSparklineChannelInput {
    channelId: string;
    values: readonly number[];
    orientation: DualSparklineChannelOrientation;
    plotLayout?: DualSparklineChartLayout;
}

export interface DualSparklinePoint {
    xCoordinate: number;
    yCoordinate: number;
    visualProgress: number;
}

export interface DualSparklineChannelModel {
    channelId: string;
    orientation: DualSparklineChannelOrientation;
    points: readonly DualSparklinePoint[];
    linePath: string;
    areaPath: string;
    baselineYCoordinate: number;
}

const MINIMUM_VISIBLE_RANGE = 1;
const MINIMUM_AREA_PROGRESS = 0.09;

/**
 * Builds dual-channel sparkline geometry with shared scaling. The orientation
 * flag is intentionally part of the data model so the future mirrored mode can
 * render one channel below its axis without replacing smoothing or path logic.
 */
export function buildDualSparklineChannelModels(options: {
    channels: readonly DualSparklineChannelInput[];
    plotLayout: DualSparklineChartLayout;
    sparklineScale?: SparklineScale;
    lineSmoothingPercent: number;
}): readonly DualSparklineChannelModel[] {
    const renderableChannels = options.channels.map(channel => ({
        ...channel,
        values: buildRenderableValues(channel.values),
    }));
    const scaleBounds = resolveSparklineScaleBounds(
        renderableChannels.flatMap(channel => channel.values),
        options.sparklineScale,
    );
    const valueRange = Math.max(scaleBounds.maximumValue - scaleBounds.minimumValue, MINIMUM_VISIBLE_RANGE);

    return renderableChannels.map(channel => {
        const channelPlotLayout = channel.plotLayout ?? options.plotLayout;
        const visualValues = smoothSparklineValues(channel.values, options.lineSmoothingPercent);
        const points = buildChannelPoints({
            values: visualValues,
            plotLayout: channelPlotLayout,
            scaleBounds,
            valueRange,
            orientation: channel.orientation,
        });
        const baselineYCoordinate = resolveBaselineYCoordinate(channelPlotLayout, channel.orientation);

        return {
            channelId: channel.channelId,
            orientation: channel.orientation,
            points,
            linePath: buildSparklineLinePath({
                points,
                lineSmoothingPercent: options.lineSmoothingPercent,
            }),
            areaPath: buildSparklineAreaPath({
                points,
                baselineYCoordinate,
                lineSmoothingPercent: options.lineSmoothingPercent,
            }),
            baselineYCoordinate,
        };
    });
}

function buildRenderableValues(values: readonly number[]): readonly number[] {
    const finiteValues = values.filter(value => Number.isFinite(value));

    if (finiteValues.length === 1) {
        return [finiteValues[0], finiteValues[0]];
    }

    if (finiteValues.length > 0) {
        return finiteValues;
    }

    return [0, 0];
}

function buildChannelPoints(options: {
    values: readonly number[];
    plotLayout: DualSparklineChartLayout;
    scaleBounds: { minimumValue: number; maximumValue: number };
    valueRange: number;
    orientation: DualSparklineChannelOrientation;
}): readonly DualSparklinePoint[] {
    const pointCount = options.values.length;

    return options.values.map((value, valueIndex) => {
        const horizontalProgress = pointCount > 1 ? valueIndex / (pointCount - 1) : 1;
        const normalizedValue = (value - options.scaleBounds.minimumValue) / options.valueRange;
        const visualProgress = MINIMUM_AREA_PROGRESS
            + clamp(normalizedValue, 0, 1) * (1 - MINIMUM_AREA_PROGRESS);
        const yCoordinate = options.orientation === "positive"
            ? options.plotLayout.yCoordinate + options.plotLayout.height - visualProgress * options.plotLayout.height
            : options.plotLayout.yCoordinate + visualProgress * options.plotLayout.height;

        return {
            xCoordinate: options.plotLayout.xCoordinate + horizontalProgress * options.plotLayout.width,
            yCoordinate,
            visualProgress,
        };
    });
}

function resolveBaselineYCoordinate(
    plotLayout: DualSparklineChartLayout,
    orientation: DualSparklineChannelOrientation,
): number {
    return orientation === "positive"
        ? plotLayout.yCoordinate + plotLayout.height
        : plotLayout.yCoordinate;
}
