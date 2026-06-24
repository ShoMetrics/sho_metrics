import assert from "node:assert/strict";
import { test } from "vitest";
import {
    HIDDevices,
    pmsetAccessoryLevels,
    profilerDevices,
    readStatsBluetoothDevices,
    type StatsBluetoothQuery,
} from "./readers";

test("Stats Bluetooth profilerDevices parses connected battery fields and not-connected addresses", async () => {
    const [devices, notConnected] = await profilerDevices(buildStatsBluetoothQuery({
        systemProfilerBluetoothJson: JSON.stringify({
            SPBluetoothDataType: [{
                device_connected: [{
                    "Edward's Trackpad": {
                        device_address: "AA-BB-CC-DD-EE-FF",
                        device_batteryLevelMain: "100%",
                    },
                }],
                device_not_connected: [{
                    "MX Master 3": {
                        device_address: "11-22-33-44-55-66",
                    },
                }],
            }],
        }),
    }));

    assert.deepEqual(devices, [{
        name: "Edward's Trackpad",
        address: "aa-bb-cc-dd-ee-ff",
        batteryLevel: [{
            key: "device_batteryLevelMain",
            value: "100",
            additional: undefined,
        }],
    }]);
    assert.deepEqual(notConnected, ["11-22-33-44-55-66"]);
});

test("Stats Bluetooth HIDDevices parses IOKit HID registry battery fields", async () => {
    const devices = await HIDDevices(buildStatsBluetoothQuery({
        hidProperties: [{
            BluetoothDevice: true,
            Product: "",
            BatteryPercent: 100,
            DeviceAddress: "10-94-bb-ac-bb-75",
            VendorID: 76,
            ProductID: 613,
        }],
    }));

    assert.deepEqual(devices, [{
        name: "",
        address: "10-94-bb-ac-bb-75",
        uuid: undefined,
        batteryLevel: [{
            key: "battery",
            value: "100",
            additional: undefined,
        }],
        vendorId: 76,
        productId: 613,
    }]);
});

test("Stats Bluetooth pmsetAccessoryLevels groups accessory parts like Stats", async () => {
    const devices = await pmsetAccessoryLevels(buildStatsBluetoothQuery({
        pmsetAccessoryPowerSourcesXml: [
            "INTERNAL",
            "CASE",
            "COMBINED",
        ].map(key => `<?xml ${key}`).join(""),
        plistByXml: new Map([
            ["<?xml INTERNAL", {
                Name: "InternalBattery",
                "Current Capacity": 80,
            }],
            ["<?xml CASE", {
                Name: "Pengcheng's AirPods Pro Case",
                "Current Capacity": 33,
                "Accessory Identifier": "case-id",
                "Part Identifier": "Case",
                "Group Identifier": "airpods-group",
                "Accessory Category": "Audio Battery Case",
                "Is Charging": false,
            }],
            ["<?xml COMBINED", {
                Name: "Pengcheng's AirPods Pro",
                "Current Capacity": 100,
                "Accessory Identifier": "combined-id",
                "Part Identifier": "Combined",
                "Group Identifier": "airpods-group",
                "Combined Parts": [{
                    "Part Identifier": "Left",
                    "Current Capacity": 100,
                    "Is Charging": true,
                }, {
                    "Part Identifier": "Right",
                    "Current Capacity": 99,
                    "Is Charging": false,
                }],
            }],
        ]),
    }));

    assert.deepEqual(devices, [{
        name: "Pengcheng's AirPods Pro",
        address: "combined-id",
        uuid: undefined,
        batteryLevel: [{
            key: "case",
            value: "33",
            additional: "discharging",
        }, {
            key: "left",
            value: "100",
            additional: "charging",
        }, {
            key: "right",
            value: "99",
            additional: "discharging",
        }],
        vendorId: undefined,
        productId: undefined,
    }]);
});

test("Stats Bluetooth read preserves query merge order and pmset battery override", async () => {
    const devices = await readStatsBluetoothDevices(buildStatsBluetoothQuery({
        hidProperties: [{
            BluetoothDevice: true,
            Product: "Edward's Trackpad",
            BatteryPercent: 90,
            DeviceAddress: "aa-bb-cc-dd-ee-ff",
        }],
        systemProfilerBluetoothJson: JSON.stringify({
            SPBluetoothDataType: [{
                device_connected: [{
                    "Edward's Trackpad": {
                        device_address: "AA-BB-CC-DD-EE-FF",
                        device_batteryLevelMain: "100%",
                    },
                }],
                device_not_connected: [],
            }],
        }),
        pmsetAccessoryPowerSourcesXml: "<?xml TRACKPAD",
        plistByXml: new Map([
            ["<?xml TRACKPAD", {
                Name: "Edward's Trackpad",
                "Current Capacity": 88,
                "Accessory Identifier": "aa-bb-cc-dd-ee-ff",
                "Is Charging": false,
            }],
        ]),
    }));

    assert.deepEqual(devices, [{
        name: "Edward's Trackpad",
        address: "aa-bb-cc-dd-ee-ff",
        uuid: undefined,
        batteryLevel: [{
            key: "battery",
            value: "88",
            additional: "discharging",
        }],
        vendorId: undefined,
        productId: undefined,
    }]);
});

test("Stats Bluetooth read fills an empty HID name from a matching pmset accessory", async () => {
    const devices = await readStatsBluetoothDevices(buildStatsBluetoothQuery({
        hidProperties: [{
            BluetoothDevice: true,
            Product: "",
            BatteryPercent: 100,
            DeviceAddress: "10-94-bb-ac-bb-75",
            VendorID: 76,
            ProductID: 613,
        }],
        pmsetAccessoryPowerSourcesXml: "<?xml TRACKPAD",
        plistByXml: new Map([
            ["<?xml TRACKPAD", {
                Name: "Edward's Trackpad",
                "Current Capacity": 100,
                "Accessory Identifier": "10:94:BB:AC:BB:75",
                "Is Charging": false,
                "Vendor ID": 76,
                "Product ID": 613,
            }],
        ]),
    }));

    assert.deepEqual(devices, [{
        name: "Edward's Trackpad",
        address: "10-94-bb-ac-bb-75",
        uuid: undefined,
        batteryLevel: [{
            key: "battery",
            value: "100",
            additional: "discharging",
        }],
        vendorId: 76,
        productId: 613,
    }]);
});

test("Stats Bluetooth read does not fuzzy-match empty HID names to unrelated pmset accessories", async () => {
    const devices = await readStatsBluetoothDevices(buildStatsBluetoothQuery({
        hidProperties: [{
            BluetoothDevice: true,
            Product: "",
            BatteryPercent: 77,
            DeviceAddress: "10-94-bb-ac-bb-75",
            VendorID: 1,
            ProductID: 2,
        }],
        pmsetAccessoryPowerSourcesXml: "<?xml AIRPODS",
        plistByXml: new Map([
            ["<?xml AIRPODS", {
                Name: "Pengcheng's AirPods Pro",
                "Current Capacity": 44,
                "Accessory Identifier": "aa:bb:cc:dd:ee:ff",
                "Is Charging": false,
                "Vendor ID": 76,
                "Product ID": 613,
            }],
        ]),
    }));

    assert.deepEqual(devices, [{
        name: "",
        address: "10-94-bb-ac-bb-75",
        uuid: undefined,
        batteryLevel: [{
            key: "battery",
            value: "77",
            additional: undefined,
        }],
        vendorId: 1,
        productId: 2,
    }, {
        name: "Pengcheng's AirPods Pro",
        address: "aa:bb:cc:dd:ee:ff",
        uuid: undefined,
        batteryLevel: [{
            key: "battery",
            value: "44",
            additional: "discharging",
        }],
        vendorId: 76,
        productId: 613,
    }]);
});

function buildStatsBluetoothQuery(options: {
    readonly hidProperties?: readonly Record<string, unknown>[];
    readonly bluetoothCachePlist?: Record<string, unknown>;
    readonly systemProfilerBluetoothJson?: string;
    readonly pmsetAccessoryPowerSourcesXml?: string;
    readonly plistByXml?: ReadonlyMap<string, Record<string, unknown>>;
}): StatsBluetoothQuery {
    return {
        fetchAppleDeviceManagementHIDEventServiceProperties: async () => options.hidProperties ?? [],
        readBluetoothCachePlist: async () => options.bluetoothCachePlist ?? {},
        systemProfilerBluetoothJson: async () => options.systemProfilerBluetoothJson ?? JSON.stringify({
            SPBluetoothDataType: [{
                device_connected: [],
                device_not_connected: [],
            }],
        }),
        pmsetAccessoryPowerSourcesXml: async () => options.pmsetAccessoryPowerSourcesXml ?? "",
        parsePlistXml: async xml => options.plistByXml?.get(xml) ?? {},
    };
}
