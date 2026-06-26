import assert from "node:assert/strict";
import { test } from "vitest";
import {
    normalizeSystemBatteryCustomLabel,
    resolveSystemBatteryLabel,
    resolveSystemBatterySecondaryLabel,
} from "./system-battery-label";

test("system battery label uses compact defaults for circle and centered text", () => {
    assert.equal(resolveSystemBatteryLabel({
        customLabel: undefined,
        selectedView: "circle",
        circleVariant: "full-ring",
        textVariant: "centered",
        selectedPeripheralDisplayName: undefined,
        maximumCharacters: 8,
    }), "BATT");
    assert.equal(resolveSystemBatteryLabel({
        customLabel: undefined,
        selectedView: "text",
        circleVariant: "full-ring",
        textVariant: "centered",
        selectedPeripheralDisplayName: undefined,
        maximumCharacters: 8,
    }), "BATT");
});

test("system battery label uses readable defaults for title-style views", () => {
    assert.equal(resolveSystemBatteryLabel({
        customLabel: undefined,
        selectedView: "bar",
        circleVariant: "full-ring",
        textVariant: "centered",
        selectedPeripheralDisplayName: undefined,
        maximumCharacters: 12,
    }), "Battery");
    assert.equal(resolveSystemBatteryLabel({
        customLabel: undefined,
        selectedView: "line",
        circleVariant: "full-ring",
        textVariant: "centered",
        selectedPeripheralDisplayName: undefined,
        maximumCharacters: 8,
    }), "Battery");
    assert.equal(resolveSystemBatteryLabel({
        customLabel: undefined,
        selectedView: "text",
        circleVariant: "full-ring",
        textVariant: "title-card",
        selectedPeripheralDisplayName: undefined,
        maximumCharacters: 8,
    }), "Battery");
});

test("system battery label prefers the stored custom label", () => {
    assert.equal(resolveSystemBatteryLabel({
        customLabel: "Mouse",
        selectedPeripheralDisplayName: "MX Master 4",
        selectedView: "bar",
        circleVariant: "full-ring",
        textVariant: "centered",
        maximumCharacters: 12,
    }), "Mouse");
});

test("system battery label falls back to the selected peripheral display name", () => {
    assert.equal(resolveSystemBatteryLabel({
        customLabel: undefined,
        selectedPeripheralDisplayName: "MX Master 4",
        selectedView: "circle",
        circleVariant: "full-ring",
        textVariant: "centered",
        maximumCharacters: 8,
    }), "MX Maste");
});

test("system battery label keeps long stored input but caps rendered output", () => {
    assert.equal(normalizeSystemBatteryCustomLabel("  12345678901234567890  "), "12345678901234567890");
    assert.equal(resolveSystemBatteryLabel({
        customLabel: "12345678901234567890",
        selectedPeripheralDisplayName: undefined,
        selectedView: "circle",
        circleVariant: "full-ring",
        textVariant: "centered",
        maximumCharacters: 8,
    }), "12345678");
});

test("system battery secondary label omits defaults", () => {
    assert.equal(resolveSystemBatterySecondaryLabel({
        customLabel: undefined,
        selectedPeripheralDisplayName: undefined,
        maximumCharacters: 12,
    }), undefined);
    assert.equal(resolveSystemBatterySecondaryLabel({
        customLabel: undefined,
        selectedPeripheralDisplayName: "MX Master 4",
        maximumCharacters: 12,
    }), "MX Master 4");
});
