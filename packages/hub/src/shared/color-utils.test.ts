import assert from "node:assert/strict";
import { test } from "vitest";

import {
    adjustHexColorBrightness,
    formatHexColor,
    interpolateHexColor,
    normalizeHexColor,
    parseHexColor,
    resolveReadableTextColor,
    resolveRelativeLuminance,
} from "./color-utils";

test("hex color parsing and formatting handle valid colors", () => {
    assert.deepEqual(parseHexColor("#123abc"), { red: 18, green: 58, blue: 188 });
    assert.deepEqual(parseHexColor("123ABC"), { red: 18, green: 58, blue: 188 });
    assert.equal(formatHexColor({ red: 18, green: 58, blue: 188 }), "#123abc");
});

test("hex color normalization keeps valid colors and rejects invalid colors", () => {
    assert.equal(normalizeHexColor(" #ABCDEF ", "#000000"), "#abcdef");
    assert.equal(normalizeHexColor("not-a-color", "#000000"), "#000000");
});

test("hex color brightness adjusts valid colors and leaves invalid colors unchanged", () => {
    assert.equal(adjustHexColorBrightness("#000000", 50), "#808080");
    assert.equal(adjustHexColorBrightness("#808080", -50), "#404040");
    assert.equal(adjustHexColorBrightness("not-a-color", 50), "not-a-color");
});

test("hex color interpolation blends channels with clamped ratio", () => {
    assert.equal(interpolateHexColor("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(interpolateHexColor("#000000", "#ffffff", -1), "#000000");
    assert.equal(interpolateHexColor("#000000", "#ffffff", 2), "#ffffff");
    assert.equal(interpolateHexColor("bad", "#ffffff", 0.25), "bad");
    assert.equal(interpolateHexColor("bad", "#ffffff", 0.75), "#ffffff");
});

test("readable text color picks the higher contrast foreground", () => {
    assert.equal(resolveReadableTextColor("#55007f"), "#ffffff");
    assert.equal(resolveReadableTextColor("#facc15"), "#111827");
    assert.equal(resolveReadableTextColor("not-a-color"), "#111827");
});

test("relative luminance follows WCAG channel weighting", () => {
    const blackLuminance = resolveRelativeLuminance({ red: 0, green: 0, blue: 0 });
    const whiteLuminance = resolveRelativeLuminance({ red: 255, green: 255, blue: 255 });
    const greenLuminance = resolveRelativeLuminance({ red: 0, green: 255, blue: 0 });
    const redLuminance = resolveRelativeLuminance({ red: 255, green: 0, blue: 0 });

    assert.equal(blackLuminance, 0);
    assert.equal(whiteLuminance, 1);
    assert.ok(greenLuminance > redLuminance);
});
