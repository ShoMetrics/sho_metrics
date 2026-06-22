import assert from "node:assert/strict";
import { test } from "vitest";
import { formatCompactNumber } from "./compact-number-format";

test("compact number format preserves fractions that fit the display budget", () => {
    assert.equal(formatCompactNumber(12.3, 1, 3), "12.3");
});

test("compact number format drops fractions before capping the display value", () => {
    assert.equal(formatCompactNumber(99.95, 1, 3), "100");
});

test("compact number format caps values that cannot fit as integers", () => {
    assert.equal(formatCompactNumber(1_234, 0, 3), "999");
});
