import assert from "node:assert/strict";
import { test } from "vitest";
import { formatMessage } from "../../i18n/format";
import type { ResolvedSystemPeripheralIdentity } from "../../settings/resolved-settings";
import {
    resolveBatteryPollingFrequencyOptions,
    resolveBatteryPollingFrequencyOptionsForMinimum,
    resolveMinimumBatteryPollingFrequencySeconds,
} from "./battery-polling-options";
import type { OptionLabelFormatter } from "./setting-options";

test("system and Bluetooth battery polling allows 60 seconds and slower intervals", () => {
    const optionList = resolveBatteryPollingFrequencyOptions(undefined, formatEnglishOptionLabel);

    assert.deepEqual(optionList.map(option => option.value), [
        60,
        180,
        300,
        600,
        1200,
        1800,
        3600,
    ]);
    assert.deepEqual(optionList.map(option => option.label), [
        "1 minute",
        "3 minutes",
        "5 minutes",
        "10 minutes",
        "20 minutes",
        "30 minutes",
        "1 hour",
    ]);
    assert.equal(resolveMinimumBatteryPollingFrequencySeconds(undefined), 60);
    assert.equal(resolveMinimumBatteryPollingFrequencySeconds(buildBluetoothBatteryIdentity()), 60);
});

test("vendor HID battery polling starts at 10 minutes", () => {
    const optionList = resolveBatteryPollingFrequencyOptions(buildVendorHidBatteryIdentity(), formatEnglishOptionLabel);

    assert.deepEqual(optionList.map(option => option.value), [
        600,
        1200,
        1800,
        3600,
    ]);
    assert.deepEqual(optionList.map(option => option.label), [
        "10 minutes",
        "20 minutes",
        "30 minutes",
        "1 hour",
    ]);
    assert.equal(resolveMinimumBatteryPollingFrequencySeconds(buildVendorHidBatteryIdentity()), 600);
});

test("shared battery polling options append an already-slow saved value after slow slots are removed", () => {
    assert.equal(resolveBatteryPollingFrequencyOptionsForMinimum({
        minimumPollingFrequencySeconds: 1,
        currentPollingFrequencySeconds: 1,
        t: formatEnglishOptionLabel,
    }), undefined);

    const optionList = resolveBatteryPollingFrequencyOptionsForMinimum({
        minimumPollingFrequencySeconds: 1,
        currentPollingFrequencySeconds: 600,
        t: formatEnglishOptionLabel,
    });

    assert.deepEqual(optionList?.map(option => option.value), [1, 2, 3, 5, 10, 15, 30, 60, 600]);
    assert.equal(optionList?.find(option => option.value === 600)?.label, "10 minutes");
    assert.equal(optionList?.find(option => option.value === 1)?.disabled, undefined);
    assert.equal(optionList?.find(option => option.value === 600)?.disabled, true);
});

test("shared battery polling options use the slowest configured battery slot floor", () => {
    assert.deepEqual(resolveBatteryPollingFrequencyOptionsForMinimum({
        minimumPollingFrequencySeconds: 60,
        currentPollingFrequencySeconds: 1,
        t: formatEnglishOptionLabel,
    })?.map(option => option.value), [
        60,
        180,
        300,
        600,
        1200,
        1800,
        3600,
    ]);

    assert.deepEqual(resolveBatteryPollingFrequencyOptionsForMinimum({
        minimumPollingFrequencySeconds: 600,
        currentPollingFrequencySeconds: 1,
        t: formatEnglishOptionLabel,
    })?.map(option => option.value), [
        600,
        1200,
        1800,
        3600,
    ]);
});

const formatEnglishOptionLabel: OptionLabelFormatter = (message, values) => formatMessage("en", message, values);

function buildBluetoothBatteryIdentity(): ResolvedSystemPeripheralIdentity {
    return {
        evidence: {
            kind: "bluetooth",
            primaryIdentifier: {
                kind: "platformInstanceId",
                hash: "1".repeat(64),
            },
            fallbackIdentifier: undefined,
        },
    };
}

function buildVendorHidBatteryIdentity(): ResolvedSystemPeripheralIdentity {
    return {
        evidence: {
            kind: "vendorHid",
            vendorId: 0x046D,
            productId: 0xC548,
            manufacturer: "Logitech",
            productName: "MX Master 4",
            serialNumber: undefined,
            interfaceNumber: 2,
            usagePage: 0xFF00,
            usageId: undefined,
            bindingTransport: "usbReceiver",
            receiverKind: "bolt",
            vendorUnitId: "unit-2",
            modelId: "mx-master-4",
            receiverSlot: 2,
        },
    };
}
