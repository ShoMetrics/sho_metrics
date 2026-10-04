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

test.each([
    { bitsPerSecond: -8, value: "0", unit: "Kb/s" },
    { bitsPerSecond: 0, value: "0", unit: "Kb/s" },
    { bitsPerSecond: 999, value: "0", unit: "Kb/s" },
    { bitsPerSecond: 1_000, value: "1", unit: "Kb/s" },
    { bitsPerSecond: 999_000, value: "999", unit: "Kb/s" },
    { bitsPerSecond: 1_000_000, value: "1.0", unit: "Mb/s" },
    { bitsPerSecond: 3_000_000, value: "3.0", unit: "Mb/s" },
    { bitsPerSecond: 8_000_000, value: "8.0", unit: "Mb/s" },
    { bitsPerSecond: 99_000_000, value: "99.0", unit: "Mb/s" },
    { bitsPerSecond: 100_000_000, value: "100", unit: "Mb/s" },
    { bitsPerSecond: 999_000_000, value: "999", unit: "Mb/s" },
    { bitsPerSecond: 1_000_000_000, value: "1.0", unit: "Gb/s" },
    { bitsPerSecond: 2_500_000_000, value: "2.5", unit: "Gb/s" },
    { bitsPerSecond: 3_000_000_000, value: "3.0", unit: "Gb/s" },
    { bitsPerSecond: 3_030_000_000, value: "3.0", unit: "Gb/s" },
    { bitsPerSecond: 7_500_000_000, value: "7.5", unit: "Gb/s" },
    { bitsPerSecond: 8_000_000_000, value: "8.0", unit: "Gb/s" },
    { bitsPerSecond: 9_800_000_000, value: "9.8", unit: "Gb/s" },
    { bitsPerSecond: 10_000_000_000, value: "10.0", unit: "Gb/s" },
])("bit rate format selects units after conversion for $bitsPerSecond bit/s", ({ bitsPerSecond, value, unit }) => {
    assert.deepEqual(formatBytesPerSecond({
        bytesPerSecond: bitsPerSecond / 8,
        unitBase: "bit",
        base: 1000,
        maximumDisplayDigits: 3,
    }), { value, unit });
});

test.each([1000, 1024])("byte rate format preserves unit thresholds with base %i", (base) => {
    for (const { bytesPerSecond, value, unit } of [
        { bytesPerSecond: base - 1, value: "0", unit: "KB/s" },
        { bytesPerSecond: base, value: "1", unit: "KB/s" },
        { bytesPerSecond: base ** 2, value: "1.0", unit: "MB/s" },
        { bytesPerSecond: 100 * base ** 2, value: "100", unit: "MB/s" },
        { bytesPerSecond: base ** 3, value: "1.0", unit: "GB/s" },
    ]) {
        assert.deepEqual(formatBytesPerSecond({
            bytesPerSecond,
            unitBase: "byte",
            base,
            maximumDisplayDigits: 3,
        }), { value, unit });
    }
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
