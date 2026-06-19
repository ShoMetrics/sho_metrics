import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HID = require("node-hid");

const ROG_VENDOR_ID = 0x0b05;
const WIRED_KEYBOARD_PRODUCT_IDS = new Set([
  0x1b78,
  0x1b04,
  0x1a83,
  0x1a85,
]);
const VENDOR_USAGE_PAGE = 0xff00;
const BATTERY_REPORT_ID = 0x02;
const OUTPUT_REPORT_LENGTH = 64;

function toHex(value, width = 2) {
  if (typeof value !== "number") {
    return null;
  }

  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => toHex(value)).join(" ");
}

function describeDevice(device) {
  return {
    vendorId: toHex(device.vendorId, 4),
    productId: toHex(device.productId, 4),
    usagePage: toHex(device.usagePage, 4),
    usage: toHex(device.usage, 4),
    interface: device.interface,
    manufacturer: device.manufacturer,
    product: device.product,
    serialNumber: device.serialNumber,
    path: device.path,
  };
}

function isStandardKeyboardCollection(device) {
  return device.usagePage === 0x0001 && device.usage === 0x0006;
}

function isTargetWiredBatteryCollection(device) {
  const devicePath = typeof device.path === "string" ? device.path.toLowerCase() : "";

  return (
    device.vendorId === ROG_VENDOR_ID &&
    WIRED_KEYBOARD_PRODUCT_IDS.has(device.productId) &&
    device.usagePage === VENDOR_USAGE_PAGE &&
    device.interface === 1 &&
    devicePath.includes("mi_01") &&
    !devicePath.includes("\\kbd") &&
    !isStandardKeyboardCollection(device)
  );
}

function drainPendingReports(device) {
  const drainedReports = [];

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const report = device.readTimeout(5);
    if (!report || report.length === 0) {
      break;
    }

    drainedReports.push(Array.from(report));
  }

  return drainedReports;
}

function queryBattery(targetDevice) {
  const device = new HID.HID(targetDevice.path, { nonExclusive: true });

  try {
    const drainedReports = drainPendingReports(device);
    const query = [
      BATTERY_REPORT_ID,
      0x12,
      0x01,
      ...Array.from({ length: OUTPUT_REPORT_LENGTH - 3 }, () => 0x00),
    ];

    const bytesWritten = device.write(query);
    const responses = [];

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = device.readTimeout(50);
      if (!response || response.length === 0) {
        continue;
      }

      const responseBytes = Array.from(response);
      responses.push(responseBytes);

      if (
        responseBytes.length > 9 &&
        responseBytes[0] === BATTERY_REPORT_ID &&
        responseBytes[1] === 0x12 &&
        responseBytes[2] === 0x01
      ) {
        return {
          ok: true,
          bytesWritten,
          queryHex: bytesToHex(query),
          drainedReports: drainedReports.map((report) => bytesToHex(report)),
          responses: responses.map((report) => bytesToHex(report)),
          batteryPercent: Math.min(responseBytes[6], 100),
          charging: responseBytes[9] > 0,
        };
      }

      if (
        responseBytes.length > 8 &&
        responseBytes[0] === 0x12 &&
        responseBytes[1] === 0x01
      ) {
        return {
          ok: true,
          bytesWritten,
          queryHex: bytesToHex(query),
          drainedReports: drainedReports.map((report) => bytesToHex(report)),
          responses: responses.map((report) => bytesToHex(report)),
          responseIncludesReportId: false,
          batteryPercent: Math.min(responseBytes[5], 100),
          charging: responseBytes[8] > 0,
        };
      }
    }

    return {
      ok: false,
      reason: "No matching battery response",
      bytesWritten,
      queryHex: bytesToHex(query),
      drainedReports: drainedReports.map((report) => bytesToHex(report)),
      responses: responses.map((report) => bytesToHex(report)),
    };
  } finally {
    device.close();
  }
}

const devices = HID.devices().filter((device) =>
  device.vendorId === ROG_VENDOR_ID &&
  WIRED_KEYBOARD_PRODUCT_IDS.has(device.productId),
);
const targetDevices = devices.filter(isTargetWiredBatteryCollection);
const skippedStandardKeyboardDevices = devices.filter(isStandardKeyboardCollection);

let queryResults = [];
let error = null;

try {
  if (targetDevices.length === 0) {
    error = "No ROG wired vendor-defined battery collection found";
  } else {
    queryResults = targetDevices.map((targetDevice) => ({
      targetDevice: describeDevice(targetDevice),
      result: queryBattery(targetDevice),
    }));
  }
} catch (caughtError) {
  error = caughtError instanceof Error ? caughtError.stack || caughtError.message : String(caughtError);
}

const output = {
  step: "rog-wired-battery",
  ok: queryResults.length > 0 && queryResults.every((queryResult) => queryResult.result.ok),
  scannedAt: new Date().toISOString(),
  processId: process.pid,
  targetDevices: targetDevices.map(describeDevice),
  skippedStandardKeyboardDevices: skippedStandardKeyboardDevices.map(describeDevice),
  queryResults,
  error,
};

const outputPath = path.resolve(__dirname, `probe-rog-wired-battery-output-${process.pid}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: output.ok, outputPath, error }, null, 2));


