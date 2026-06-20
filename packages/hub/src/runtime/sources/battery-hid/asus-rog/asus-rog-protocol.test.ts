import assert from "node:assert/strict";
import test from "node:test";
import {
    parseAsusRogKeyboardOmniBatteryReport,
    parseAsusRogKeyboardWiredBatteryReport,
    parseAsusRogMouseBatteryReport,
} from "./asus-rog-protocol";

test("ASUS ROG parser reads verified Omni keyboard battery reports", () => {
    const parsed = parseAsusRogKeyboardOmniBatteryReport([
        0x02, 0x12, 0x01, 0x00, 0x00, 0x00, 0x2F, 0x02, 0x01, 0x01,
    ]);

    assert.deepEqual(parsed, {
        state: "battery",
        reading: {
            percent: 47,
            rawChargingByte: 0x01,
            chargingState: "charging",
        },
    });
});

test("ASUS ROG parser reads verified wired keyboard battery reports", () => {
    const parsed = parseAsusRogKeyboardWiredBatteryReport([
        0x12, 0x01, 0x00, 0x00, 0x00, 0x4B, 0x00, 0x01, 0x00,
    ]);

    assert.deepEqual(parsed, {
        state: "battery",
        reading: {
            percent: 75,
            rawChargingByte: 0x00,
            chargingState: "notCharging",
        },
    });
});

test("ASUS ROG parser treats known no-data responses as no-data", () => {
    assert.deepEqual(
        parseAsusRogKeyboardOmniBatteryReport([0x02, 0xFF, 0xAA, 0x00]),
        { state: "noData", reason: "knownNoData" },
    );
    assert.deepEqual(
        parseAsusRogKeyboardWiredBatteryReport([0xFF, 0xAA, 0x00, 0x00, 0xFF]),
        { state: "noData", reason: "knownNoData" },
    );
});

test("ASUS ROG parser discards unrelated Armoury Crate traffic", () => {
    assert.deepEqual(
        parseAsusRogKeyboardWiredBatteryReport([0x12, 0x03, 0x00, 0x00, 0x00]),
        { state: "unrelated" },
    );
    assert.deepEqual(
        parseAsusRogKeyboardWiredBatteryReport([0x7D, 0x20, 0x00, 0x00, 0x00]),
        { state: "unrelated" },
    );
});

test("ASUS ROG parser rejects malformed matching reports", () => {
    assert.deepEqual(
        parseAsusRogKeyboardOmniBatteryReport([0x02, 0x12, 0x01, 0x00]),
        { state: "malformed" },
    );
});

test("ASUS ROG parser preserves unknown charging bytes as diagnostics only", () => {
    const parsed = parseAsusRogKeyboardWiredBatteryReport([
        0x12, 0x01, 0x00, 0x00, 0x00, 0x64, 0x00, 0x01, 0x7F,
    ]);

    assert.deepEqual(parsed, {
        state: "battery",
        reading: {
            percent: 100,
            rawChargingByte: 0x7F,
            chargingState: "unknown",
        },
    });
});

test("ASUS ROG parser rejects out-of-range keyboard percentages", () => {
    assert.deepEqual(
        parseAsusRogKeyboardWiredBatteryReport([
            0x12, 0x01, 0x00, 0x00, 0x00, 0x65, 0x00, 0x01, 0x00,
        ]),
        { state: "noData", reason: "outOfRange" },
    );
});

test("ASUS ROG parser reads theory-backed mouse quarter-step percentages", () => {
    const parsed = parseAsusRogMouseBatteryReport(
        [0x00, 0x12, 0x07, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x01],
        {
            reportId: 0x00,
            parserKind: "quarterPercentAt5",
        },
    );

    assert.deepEqual(parsed, {
        state: "battery",
        reading: {
            percent: 50,
            rawChargingByte: 0x01,
            chargingState: "charging",
        },
    });
});

test("ASUS ROG parser rejects out-of-range theory-backed mouse percentages", () => {
    assert.deepEqual(
        parseAsusRogMouseBatteryReport(
            [0x00, 0x12, 0x07, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00],
            {
                reportId: 0x00,
                parserKind: "quarterPercentAt5",
            },
        ),
        { state: "noData", reason: "outOfRange" },
    );
});

test("ASUS ROG parser reads the Strix Carry mouse battery offset", () => {
    const parsed = parseAsusRogMouseBatteryReport(
        [0x00, 0x12, 0x07, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00],
        {
            reportId: 0x00,
            parserKind: "quarterPercentAt7",
        },
    );

    assert.equal(parsed.state, "battery");
    assert.equal(parsed.state === "battery" ? parsed.reading.percent : undefined, 75);
});
