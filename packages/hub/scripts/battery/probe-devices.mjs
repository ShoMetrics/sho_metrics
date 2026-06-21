import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HID = require("node-hid");

function toHex(value, width = 4) {
  if (typeof value !== "number") {
    return null;
  }

  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

const devices = HID.devices();
const output = {
  step: "devices",
  ok: true,
  scannedAt: new Date().toISOString(),
  processId: process.pid,
  hidapiVersion: HID.getHidapiVersion(),
  deviceCount: devices.length,
  asusDevices: devices
    .filter((device) => device.vendorId === 0x0b05)
    .map((device) => ({
      vendorId: toHex(device.vendorId),
      productId: toHex(device.productId),
      usagePage: toHex(device.usagePage),
      usage: toHex(device.usage),
      interface: device.interface,
      manufacturer: device.manufacturer,
      product: device.product,
      serialNumber: device.serialNumber,
      path: device.path,
    })),
  devices: devices.map((device) => ({
    vendorId: toHex(device.vendorId),
    productId: toHex(device.productId),
    usagePage: toHex(device.usagePage),
    usage: toHex(device.usage),
    interface: device.interface,
    manufacturer: device.manufacturer,
    product: device.product,
    serialNumber: device.serialNumber,
    path: device.path,
  })),
};

const outputPath = path.resolve(__dirname, `probe-devices-output-${process.pid}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, outputPath, deviceCount: devices.length }, null, 2));


