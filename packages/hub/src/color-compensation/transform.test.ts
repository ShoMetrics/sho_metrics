import assert from "node:assert/strict";
import { test } from "vitest";
import { applyColorCompensationToRgb, resolveColorCompensationFilterValues } from "./transform";
import {
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    normalizeColorCompensationProfile,
} from "./types";

test("default profile leaves RGB colors unchanged", () => {
    assert.deepEqual(
        applyColorCompensationToRgb({ red: 32, green: 128, blue: 224 }, DEFAULT_COLOR_COMPENSATION_PROFILE),
        { red: 32, green: 128, blue: 224 },
    );
});

test("profile adjustments are rounded and clamped", () => {
    assert.deepEqual(normalizeColorCompensationProfile({
        brightnessAdjustment: 99,
        shadowAdjustment: -99,
        gammaAdjustment: 1.6,
        saturationAdjustment: Number.NaN,
    }), {
        brightnessAdjustment: 10,
        shadowAdjustment: -10,
        gammaAdjustment: 2,
        saturationAdjustment: 0,
    });
});

test("positive adjustment resolves stronger filter values", () => {
    const filterValues = resolveColorCompensationFilterValues({
        brightnessAdjustment: 2,
        shadowAdjustment: 3,
        gammaAdjustment: 4,
        saturationAdjustment: 5,
    });

    assert.equal(filterValues.brightnessAmplitude > 1, true);
    assert.equal(filterValues.shadowOffset > 0, true);
    assert.equal(filterValues.gammaExponent < 1, true);
    assert.equal(filterValues.saturationMultiplier > 1, true);
});
