import assert from "node:assert/strict";
import { test } from "vitest";
import { formatByteCount, formatBytesPerSecond } from "./byte-format";

test("byte rate format clamps negative samples to a zero kilo-rate display", () => {
    assert.deepEqual(formatBytesPerSecond({
        bytesPerSecond: -1,
        unitBase: "byte",
        base: 1000,
        maximumDisplayDigits: 3,
    }), {
        value: "0",
        unit: "KB/s",
    });
});

test("byte rate format supports decimal bit-rate displays", () => {
    assert.deepEqual(formatBytesPerSecond({
        bytesPerSecond: 12_500,
        unitBase: "bit",
        base: 1000,
        maximumDisplayDigits: 3,
    }), {
        value: "100",
        unit: "Kb/s",
    });
});

test("byte rate format keeps one decimal for small mega-rates", () => {
    assert.deepEqual(formatBytesPerSecond({
        bytesPerSecond: 1_500_000,
        unitBase: "byte",
        base: 1000,
        maximumDisplayDigits: 3,
    }), {
        value: "1.5",
        unit: "MB/s",
    });
});

test("byte count format honors the requested minimum unit", () => {
    assert.deepEqual(formatByteCount({
        bytes: 512,
        base: 1024,
        maximumDisplayDigits: 3,
        minimumUnitIndex: 2,
    }), {
        value: "0.0",
        unit: "MB",
    });
});

test("byte count format chooses binary units and compact fractions", () => {
    assert.deepEqual(formatByteCount({
        bytes: 1.5 * 1024,
        base: 1024,
        maximumDisplayDigits: 3,
    }), {
        value: "1.5",
        unit: "KB",
    });
});
