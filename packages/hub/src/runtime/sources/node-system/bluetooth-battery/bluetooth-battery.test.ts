import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import { buildBluetoothBatteryPercentMetricKey } from "../../../metric-keys";
import { MetricUnit, type MetricValue } from "../../metric-source";
import {
    readBluetoothBatteryDeviceDescriptors,
    readBluetoothBatteryMetrics,
} from "./bluetooth-battery";

test("macOS Bluetooth descriptors use Stats-derived single battery readings", async () => {
    const airPodsAccessoryIdentifier = "12345678-1234-1234-1234-123456789abc";
    const trackpadMetricKey = buildBluetoothBatteryPercentMetricKey(`device-${sha256Hex("aa:bb:cc:dd:ee:ff")}`);
    const airPodsCaseMetricKey = buildBluetoothBatteryPercentMetricKey(`device-${sha256Hex(`${airPodsAccessoryIdentifier}#case`)}`);
    const airPodsLeftMetricKey = buildBluetoothBatteryPercentMetricKey(`device-${sha256Hex(`${airPodsAccessoryIdentifier}#left`)}`);
    const airPodsRightMetricKey = buildBluetoothBatteryPercentMetricKey(`device-${sha256Hex(`${airPodsAccessoryIdentifier}#right`)}`);

    const descriptors = await readBluetoothBatteryDeviceDescriptors({
        bluetoothDevices: async () => {
            throw new Error("systeminformation should not be used on macOS");
        },
    }, "darwin", async () => [], async () => [{
        name: "Edward's Trackpad",
        address: "aa-bb-cc-dd-ee-ff",
        batteryLevel: [{
            key: "device_batteryLevelMain",
            value: "100",
        }],
    }, {
        name: "Pengcheng's AirPods Pro",
        address: airPodsAccessoryIdentifier,
        batteryLevel: [{
            key: "case",
            value: "33",
        }, {
            key: "left",
            value: "100",
        }, {
            key: "right",
            value: "99",
        }],
    }]);

    assert.equal(descriptors.length, 4);
    assert.equal(descriptors[0]?.displayName, "Edward's Trackpad");
    assert.equal(descriptors[0]?.metricKey, trackpadMetricKey);
    assert.equal(descriptors[0]?.transport, "bluetooth");
    assert.equal(descriptors[0]?.supportState, "supported");
    assert.deepEqual(descriptors[0]?.identity?.evidence, {
        kind: "bluetooth",
        primaryIdentifier: {
            kind: "bluetoothDeviceAddress",
            hash: sha256Hex("aa:bb:cc:dd:ee:ff"),
        },
        fallbackIdentifier: undefined,
    });
    assert.equal(descriptors[1]?.displayName, "Pengcheng's AirPods Pro Case");
    assert.equal(descriptors[1]?.metricKey, airPodsCaseMetricKey);
    assert.deepEqual(descriptors[1]?.identity?.evidence, {
        kind: "bluetooth",
        primaryIdentifier: {
            kind: "bluetoothDeviceAddress",
            hash: sha256Hex(`${airPodsAccessoryIdentifier}#case`),
        },
        fallbackIdentifier: undefined,
    });
    assert.equal(descriptors[2]?.displayName, "Pengcheng's AirPods Pro Left");
    assert.equal(descriptors[2]?.metricKey, airPodsLeftMetricKey);
    assert.equal(descriptors[3]?.displayName, "Pengcheng's AirPods Pro Right");
    assert.equal(descriptors[3]?.metricKey, airPodsRightMetricKey);
});

test("macOS Bluetooth metrics read requested Stats-derived battery values", async () => {
    const bluetoothMetricKey = buildBluetoothBatteryPercentMetricKey(`device-${sha256Hex("aa:bb:cc:dd:ee:ff")}`);

    const metrics = await readBluetoothBatteryMetrics({
        bluetoothDevices: async () => {
            throw new Error("systeminformation should not be used on macOS");
        },
    }, "darwin", [bluetoothMetricKey], async () => [], async () => [], undefined, async () => [{
        name: "Edward's Trackpad",
        address: "AA:BB:CC:DD:EE:FF",
        batteryLevel: [{
            key: "battery",
            value: "88",
        }],
    }]);

    assert.deepEqual(toPlainMetricValue(metrics[bluetoothMetricKey]), {
        scalar: 88,
        unit: MetricUnit.PERCENT,
    });
});

test("macOS Bluetooth metrics read requested Stats-derived multi-part battery values", async () => {
    const airPodsAccessoryIdentifier = "12345678-1234-1234-1234-123456789abc";
    const leftMetricKey = buildBluetoothBatteryPercentMetricKey(`device-${sha256Hex(`${airPodsAccessoryIdentifier}#left`)}`);

    const metrics = await readBluetoothBatteryMetrics({
        bluetoothDevices: async () => {
            throw new Error("systeminformation should not be used on macOS");
        },
    }, "darwin", [leftMetricKey], async () => [], async () => [], undefined, async () => [{
        name: "Pengcheng's AirPods Pro",
        address: airPodsAccessoryIdentifier,
        batteryLevel: [{
            key: "case",
            value: "33",
        }, {
            key: "left",
            value: "100",
        }, {
            key: "right",
            value: "99",
        }],
    }]);

    assert.deepEqual(toPlainMetricValue(metrics[leftMetricKey]), {
        scalar: 100,
        unit: MetricUnit.PERCENT,
    });
});

test("macOS Bluetooth descriptors skip Stats-derived multi-part batteries without a clear base name", async () => {
    const airPodsAccessoryIdentifier = "12345678-1234-1234-1234-123456789abc";

    const descriptors = await readBluetoothBatteryDeviceDescriptors({
        bluetoothDevices: async () => {
            throw new Error("systeminformation should not be used on macOS");
        },
    }, "darwin", async () => [], async () => [{
        name: "",
        address: airPodsAccessoryIdentifier,
        batteryLevel: [{
            key: "case",
            value: "33",
        }, {
            key: "left",
            value: "100",
        }, {
            key: "right",
            value: "99",
        }],
    }]);

    assert.deepEqual(descriptors, []);
});

test("macOS Bluetooth descriptors fall back from empty Stats-derived names", async () => {
    const descriptors = await readBluetoothBatteryDeviceDescriptors({
        bluetoothDevices: async () => {
            throw new Error("systeminformation should not be used on macOS");
        },
    }, "darwin", async () => [], async () => [{
        name: "",
        address: "aa-bb-cc-dd-ee-ff",
        batteryLevel: [{
            key: "battery",
            value: "100",
        }],
    }]);

    assert.equal(descriptors[0]?.displayName, "Bluetooth device");
    assert.equal(descriptors[0]?.identity?.evidence.kind, "bluetooth");
});

function sha256Hex(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function toPlainMetricValue(value: MetricValue | undefined): unknown {
    return value === undefined
        ? undefined
        : {
            scalar: value.value.case === "scalar" ? value.value.value : undefined,
            unit: value.unit,
        };
}
