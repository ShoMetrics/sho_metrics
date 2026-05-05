import assert from "node:assert/strict";
import test from "node:test";
import {
    buildSparklineAreaPath,
    buildSparklineLinePath,
    type SparklinePathPoint,
} from "./sparkline-path";

test("zero smoothing uses a linear path", () => {
    const path = buildSparklineLinePath({
        points: buildExamplePoints(),
        lineSmoothingPercent: 0,
    });

    assert.match(path, /^M/);
    assert.match(path, /L/);
    assert.doesNotMatch(path, /C/);
});

test("enabled smoothing uses monotone x cubic segments", () => {
    const path = buildSparklineLinePath({
        points: buildExamplePoints(),
        lineSmoothingPercent: 75,
    });

    assert.match(path, /C/);
    assertCubicControlsStayInsideSegments(path);
});

test("area path closes to the configured baseline", () => {
    const path = buildSparklineAreaPath({
        points: buildExamplePoints(),
        baselineYCoordinate: 40,
        lineSmoothingPercent: 75,
    });

    assert.match(path, /^M/);
    assert.match(path, /L[0-9.-]+,40/);
    assert.match(path, /Z$/);
});

test("empty paths are safe", () => {
    assert.equal(buildSparklineLinePath({ points: [], lineSmoothingPercent: 75 }), "");
    assert.equal(buildSparklineAreaPath({ points: [], baselineYCoordinate: 40, lineSmoothingPercent: 75 }), "");
});

function buildExamplePoints(): readonly SparklinePathPoint[] {
    return [
        { xCoordinate: 0, yCoordinate: 30 },
        { xCoordinate: 20, yCoordinate: 28 },
        { xCoordinate: 40, yCoordinate: 18 },
        { xCoordinate: 60, yCoordinate: 24 },
        { xCoordinate: 80, yCoordinate: 22 },
        { xCoordinate: 100, yCoordinate: 30 },
    ];
}

function assertCubicControlsStayInsideSegments(path: string): void {
    const tokenList = path.match(/[A-Za-z]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? [];
    let tokenIndex = 0;
    let currentXCoordinate = 0;

    while (tokenIndex < tokenList.length) {
        const command = tokenList[tokenIndex++];

        if (command === "M") {
            currentXCoordinate = Number(tokenList[tokenIndex++]);
            tokenIndex++;
            continue;
        }

        if (command === "C") {
            const firstControlXCoordinate = Number(tokenList[tokenIndex++]);
            tokenIndex++;
            const secondControlXCoordinate = Number(tokenList[tokenIndex++]);
            tokenIndex++;
            const endXCoordinate = Number(tokenList[tokenIndex++]);
            tokenIndex++;

            assert.ok(firstControlXCoordinate >= currentXCoordinate);
            assert.ok(firstControlXCoordinate <= endXCoordinate);
            assert.ok(secondControlXCoordinate >= currentXCoordinate);
            assert.ok(secondControlXCoordinate <= endXCoordinate);
            currentXCoordinate = endXCoordinate;
            continue;
        }

        assert.fail(`Unexpected path command: ${command}.`);
    }
}
