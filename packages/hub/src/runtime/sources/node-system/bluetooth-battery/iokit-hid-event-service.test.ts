import assert from "node:assert/strict";
import { test } from "vitest";
import {
    fetchAppleDeviceManagementHIDEventServiceProperties,
    parseAppleDeviceManagementHIDEventServiceArchiveXml,
    parseAppleDeviceManagementHIDEventServiceTextOutput,
    type IokitHidEventServiceDependencies,
} from "./iokit-hid-event-service";

test("IOKit HID event service archive parser normalizes plist data values to hex strings", async () => {
    let parsedXml = "";

    const devices = await parseAppleDeviceManagementHIDEventServiceArchiveXml([
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<plist version=\"1.0\">",
        "<array>",
        "<dict>",
        "<key>BluetoothDevice</key>",
        "<true/>",
        "<key>Product</key>",
        "<string>Demo Trackpad</string>",
        "<key>BatteryPercent</key>",
        "<integer>100</integer>",
        "<key>BD_ADDR</key>",
        "<data>EJS7rLt1</data>",
        "</dict>",
        "</array>",
        "</plist>",
    ].join(""), async xml => {
        parsedXml = xml;
        return [{
            BluetoothDevice: true,
            Product: "Demo Trackpad",
            BatteryPercent: 100,
            BD_ADDR: "1094bbacbb75",
        }];
    });

    assert.match(parsedXml, /<key>BD_ADDR<\/key><string>1094bbacbb75<\/string>/u);
    assert.deepEqual(devices, [{
        BluetoothDevice: true,
        Product: "Demo Trackpad",
        BatteryPercent: 100,
        BD_ADDR: "1094bbacbb75",
    }]);
});

test("IOKit HID event service text parser returns the same normalized record shape", () => {
    const devices = parseAppleDeviceManagementHIDEventServiceTextOutput([
        "+-o AppleDeviceManagementHIDEventService  <class AppleDeviceManagementHIDEventService>",
        "  \"BluetoothDevice\" = Yes",
        "  \"Product\" = \"Demo Trackpad\"",
        "  \"BatteryPercent\" = 100",
        "  \"BD_ADDR\" = <1094bbacbb75>",
        "  \"DeviceAddress\" = \"10-94-bb-ac-bb-75\"",
        "  \"VendorID\" = 76",
        "  \"ProductID\" = 613",
        "+-o AppleDeviceManagementHIDEventService  <class AppleDeviceManagementHIDEventService>",
        "  \"BluetoothDevice\" = No",
        "  \"Product\" = \"USB Keyboard\"",
        "  \"BatteryPercent\" = 42",
    ].join("\n"));

    assert.deepEqual(devices, [{
        BluetoothDevice: true,
        Product: "Demo Trackpad",
        BatteryPercent: 100,
        BD_ADDR: "1094bbacbb75",
        DeviceAddress: "10-94-bb-ac-bb-75",
        VendorID: 76,
        ProductID: 613,
    }, {
        BluetoothDevice: false,
        Product: "USB Keyboard",
        BatteryPercent: 42,
    }]);
});

test("IOKit HID event service query falls back to text ioreg when archive parsing fails", async () => {
    const calls: string[] = [];
    const dependencies: IokitHidEventServiceDependencies = {
        execFile: async (_path, arguments_) => {
            calls.push(arguments_.join(" "));
            if (arguments_.includes("-a")) {
                return "<plist><array></array></plist>";
            }

            return [
                "+-o AppleDeviceManagementHIDEventService  <class AppleDeviceManagementHIDEventService>",
                "  \"BluetoothDevice\" = Yes",
                "  \"Product\" = \"Demo Trackpad\"",
                "  \"BatteryPercent\" = 100",
                "  \"BD_ADDR\" = <1094bbacbb75>",
            ].join("\n");
        },
        parsePlistXmlValue: async () => {
            throw new Error("archive parser failed");
        },
    };

    const devices = await fetchAppleDeviceManagementHIDEventServiceProperties(dependencies);

    assert.deepEqual(calls, [
        "-a -r -c AppleDeviceManagementHIDEventService -l -w 0",
        "-r -c AppleDeviceManagementHIDEventService -l -w 0",
    ]);
    assert.deepEqual(devices, [{
        BluetoothDevice: true,
        Product: "Demo Trackpad",
        BatteryPercent: 100,
        BD_ADDR: "1094bbacbb75",
    }]);
});
