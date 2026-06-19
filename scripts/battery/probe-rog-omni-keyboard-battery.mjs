import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HID = require("node-hid");

const OMNI_VENDOR_ID = 0x0b05;
const OMNI_PRODUCT_ID = 0x1ace;
const OMNI_KEYBOARD_USAGE_PAGE = 0xff00;
const OMNI_KEYBOARD_REPORT_ID = 0x02;
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

function isTargetOmniKeyboardBatteryCollection(device) {
  const devicePath = typeof device.path === "string" ? device.path.toLowerCase() : "";

  return (
    device.vendorId === OMNI_VENDOR_ID &&
    device.productId === OMNI_PRODUCT_ID &&
    device.usagePage === OMNI_KEYBOARD_USAGE_PAGE &&
    device.interface === 2 &&
    devicePath.includes("mi_02&col02") &&
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
    const query = [
      OMNI_KEYBOARD_REPORT_ID,
      0x12,
      0x01,
      ...Array.from({ length: OUTPUT_REPORT_LENGTH - 3 }, () => 0x00),
    ];
    const drainedReports = drainPendingReports(device);
    const responses = [];
    let bytesWritten = 0;

    for (let queryAttempt = 0; queryAttempt < 3; queryAttempt += 1) {
      bytesWritten = device.write(query);

      for (let readAttempt = 0; readAttempt < 40; readAttempt += 1) {
        const response = device.readTimeout(50);
        if (!response || response.length === 0) {
          continue;
        }

        const responseBytes = Array.from(response);
        responses.push(responseBytes);

        if (
          responseBytes.length > 9 &&
          responseBytes[0] === OMNI_KEYBOARD_REPORT_ID &&
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

const devices = HID.devices(OMNI_VENDOR_ID, OMNI_PRODUCT_ID);
const targetDevices = devices.filter(isTargetOmniKeyboardBatteryCollection);
const skippedStandardKeyboardDevices = devices.filter(isStandardKeyboardCollection);

let queryResults = [];
let error = null;

try {
  if (targetDevices.length === 0) {
    error = "No ROG Omni keyboard battery collection found";
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
  step: "rog-battery",
  ok: queryResults.length > 0 && queryResults.every((queryResult) => queryResult.result.ok),
  scannedAt: new Date().toISOString(),
  processId: process.pid,
  targetDevices: targetDevices.map(describeDevice),
  skippedStandardKeyboardDevices: skippedStandardKeyboardDevices.map(describeDevice),
  queryResults,
  error,
};

const outputPath = path.resolve(__dirname, `probe-rog-battery-output-${process.pid}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: output.ok, outputPath, error }, null, 2));


