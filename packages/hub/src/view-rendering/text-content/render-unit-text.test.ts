import assert from "node:assert/strict";
import { test } from "vitest";
import { formatCompactDataRateUnitText, formatRenderUnitText } from "./render-unit-text";

test("render unit text formats temperature units strictly", () => {
    assert.equal(formatRenderUnitText("C"), "°C");
    assert.equal(formatRenderUnitText("F"), "°F");
    assert.equal(formatRenderUnitText("c"), "c");
    assert.equal(formatRenderUnitText("%"), "%");
});

test("compact data-rate unit text only compacts data-rate units", () => {
    assert.equal(formatCompactDataRateUnitText("MB/s"), "M");
    assert.equal(formatCompactDataRateUnitText("KB/s"), "K");
    assert.equal(formatCompactDataRateUnitText("B/s"), "B");
    assert.equal(formatCompactDataRateUnitText("mb/s"), "M");
    assert.equal(formatCompactDataRateUnitText(""), "");
    assert.equal(formatCompactDataRateUnitText("abc"), "abc");
});
