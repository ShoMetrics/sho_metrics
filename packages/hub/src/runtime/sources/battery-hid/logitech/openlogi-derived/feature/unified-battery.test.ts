import assert from "node:assert/strict";
import test from "node:test";
import {
    encodeOpenLogiBatteryLevel,
    encodeOpenLogiBatteryStatus,
    parseOpenLogiBatteryCapabilities,
    parseOpenLogiBatteryCapabilitiesPayload,
    parseOpenLogiBatteryInfoPayload,
    parseOpenLogiBatteryLevel,
    parseOpenLogiBatteryStatus,
} from "./unified-battery";

test("OpenLogi UnifiedBattery decodes capability bitfields", () => {
    const capabilities = parseOpenLogiBatteryCapabilities([0x0F, 0x03]);

    assert.deepEqual(Array.from(capabilities.reportedLevels), ["critical", "low", "good", "full"]);
    assert.equal(capabilities.rechargeable, true);
    assert.equal(capabilities.percentage, true);
});

test("OpenLogi UnifiedBattery capabilities payload defaults missing bytes to zero", () => {
    const capabilities = parseOpenLogiBatteryCapabilitiesPayload([]);

    assert.deepEqual(Array.from(capabilities.reportedLevels), []);
    assert.equal(capabilities.rechargeable, false);
    assert.equal(capabilities.percentage, false);
});

test("OpenLogi UnifiedBattery parses current battery information", () => {
    assert.deepEqual(parseOpenLogiBatteryInfoPayload([90, 1 << 3, 1]), {
        chargingPercentage: 90,
        levelByte: 1 << 3,
        level: "full",
        statusByte: 1,
        status: "charging",
    });
});

test("OpenLogi UnifiedBattery preserves percentage and raw bytes for unknown level or status values", () => {
    assert.deepEqual(parseOpenLogiBatteryInfoPayload([90, 0xFF, 0x05]), {
        chargingPercentage: 90,
        levelByte: 0xFF,
        level: undefined,
        statusByte: 0x05,
        status: undefined,
    });
});

test("OpenLogi UnifiedBattery decodes and encodes approximate battery levels", () => {
    assert.equal(parseOpenLogiBatteryLevel(1), "critical");
    assert.equal(parseOpenLogiBatteryLevel(1 << 1), "low");
    assert.equal(parseOpenLogiBatteryLevel(1 << 2), "good");
    assert.equal(parseOpenLogiBatteryLevel(1 << 3), "full");
    assert.equal(parseOpenLogiBatteryLevel(0), undefined);
    assert.equal(encodeOpenLogiBatteryLevel("good"), 1 << 2);
});

test("OpenLogi UnifiedBattery decodes and encodes battery charging status", () => {
    assert.equal(parseOpenLogiBatteryStatus(0), "discharging");
    assert.equal(parseOpenLogiBatteryStatus(1), "charging");
    assert.equal(parseOpenLogiBatteryStatus(2), "chargingSlow");
    assert.equal(parseOpenLogiBatteryStatus(3), "full");
    assert.equal(parseOpenLogiBatteryStatus(4), "error");
    assert.equal(parseOpenLogiBatteryStatus(5), undefined);
    assert.equal(encodeOpenLogiBatteryStatus("chargingSlow"), 2);
});
