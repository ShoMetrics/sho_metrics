import assert from "node:assert/strict";
import { test } from "vitest";
import { buildDualSparklineChannelModels } from "./dual-channel-sparkline-chart";

const plotLayout = {
    xCoordinate: 0,
    yCoordinate: 0,
    width: 100,
    height: 100,
};

test("shared scale preserves relative channel height above the minimum fill", () => {
    const channelModels = buildDualSparklineChannelModels({
        channels: [
            { channelId: "small", values: [1, 1], orientation: "positive" },
            { channelId: "large", values: [10, 10], orientation: "positive" },
        ],
        plotLayout,
        sparklineScale: { mode: "fixed", minimumValue: 0, maximumValue: 10 },
        lineSmoothingPercent: 0,
    });
    const smallPoint = findChannelPoint(channelModels, "small");
    const largePoint = findChannelPoint(channelModels, "large");
    const minimumProgress = 0.09;
    const relativeProgressRatio = (smallPoint.visualProgress - minimumProgress)
        / (largePoint.visualProgress - minimumProgress);

    assert.ok(Math.abs(relativeProgressRatio - 0.1) < 0.0001);
});

test("positive-positive mode renders both channels above the same baseline", () => {
    const channelModels = buildDualSparklineChannelModels({
        channels: [
            { channelId: "first", values: [2, 6], orientation: "positive" },
            { channelId: "second", values: [4, 8], orientation: "positive" },
        ],
        plotLayout,
        sparklineScale: { mode: "fixed", minimumValue: 0, maximumValue: 8 },
        lineSmoothingPercent: 0,
    });

    for (const channelModel of channelModels) {
        assert.equal(channelModel.baselineYCoordinate, 100);
        assert.ok(channelModel.points.every(point => point.yCoordinate <= channelModel.baselineYCoordinate));
    }
});

test("mirrored channels can share scale while using separate upper and lower plot halves", () => {
    const channelModels = buildDualSparklineChannelModels({
        channels: [
            {
                channelId: "upload",
                values: [10, 10],
                orientation: "positive",
                plotLayout: { xCoordinate: 0, yCoordinate: 0, width: 100, height: 50 },
            },
            {
                channelId: "download",
                values: [10, 10],
                orientation: "negative",
                plotLayout: { xCoordinate: 0, yCoordinate: 50, width: 100, height: 50 },
            },
        ],
        plotLayout,
        sparklineScale: { mode: "fixed", minimumValue: 0, maximumValue: 10 },
        lineSmoothingPercent: 0,
    });
    const uploadModel = findChannelModel(channelModels, "upload");
    const downloadModel = findChannelModel(channelModels, "download");

    assert.equal(uploadModel.baselineYCoordinate, 50);
    assert.equal(downloadModel.baselineYCoordinate, 50);
    assert.ok(uploadModel.points.every(point => point.yCoordinate <= uploadModel.baselineYCoordinate));
    assert.ok(downloadModel.points.every(point => point.yCoordinate >= downloadModel.baselineYCoordinate));
});

test("zero values keep the existing nine percent minimum visual fill", () => {
    const channelModels = buildDualSparklineChannelModels({
        channels: [
            { channelId: "zero", values: [0, 0], orientation: "positive" },
        ],
        plotLayout,
        sparklineScale: { mode: "fixed", minimumValue: 0, maximumValue: 100 },
        lineSmoothingPercent: 0,
    });
    const point = findChannelPoint(channelModels, "zero");

    assert.equal(point.visualProgress, 0.09);
    assert.equal(point.yCoordinate, 91);
});

test("empty and single-sample histories produce safe paths", () => {
    const channelModels = buildDualSparklineChannelModels({
        channels: [
            { channelId: "empty", values: [], orientation: "positive" },
            { channelId: "single", values: [5], orientation: "positive" },
        ],
        plotLayout,
        sparklineScale: { mode: "fixed", minimumValue: 0, maximumValue: 10 },
        lineSmoothingPercent: 75,
    });

    for (const channelModel of channelModels) {
        assert.equal(channelModel.points.length, 2);
        assert.match(channelModel.linePath, /^M/);
        assert.match(channelModel.areaPath, /^M/);
    }
});

function findChannelPoint(
    channelModels: ReturnType<typeof buildDualSparklineChannelModels>,
    channelId: string,
) {
    return findChannelModel(channelModels, channelId).points[0];
}

function findChannelModel(
    channelModels: ReturnType<typeof buildDualSparklineChannelModels>,
    channelId: string,
) {
    const channelModel = channelModels.find(candidateChannel => candidateChannel.channelId === channelId);

    assert.ok(channelModel, `Expected channel "${channelId}" to exist.`);
    return channelModel;
}
