import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HID = require("node-hid");

const ROG_VENDOR_ID = 0x0b05;
const OMNI_PRODUCT_ID = 0x1ace;
const RX96_WIRED_PRODUCT_ID = 0x1b78;
const VENDOR_USAGE_PAGE = 0xff00;
const BATTERY_REPORT_ID = 0x02;
const OUTPUT_REPORT_LENGTH = 64;
const DURATION_MS = Number(process.env.ROG_STRESS_DURATION_MS || 60000);
const INTERVAL_MS = Number(process.env.ROG_STRESS_INTERVAL_MS || 20);
const READ_TIMEOUT_MS = Number(process.env.ROG_STRESS_READ_TIMEOUT_MS || 20);
const TARGET_MODE = process.env.ROG_STRESS_TARGET_MODE || "all";

function toHex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, "0")).join(" ");
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

function isRx96WiredCollection(device) {
  const devicePath = typeof device.path === "string" ? device.path.toLowerCase() : "";
  return (
    device.vendorId === ROG_VENDOR_ID &&
    device.productId === RX96_WIRED_PRODUCT_ID &&
    device.usagePage === VENDOR_USAGE_PAGE &&
    device.interface === 1 &&
    devicePath.includes("mi_01") &&
    !devicePath.includes("\\kbd") &&
    !isStandardKeyboardCollection(device)
  );
}

function isRx96OmniCollection(device) {
  const devicePath = typeof device.path === "string" ? device.path.toLowerCase() : "";
  return (
    device.vendorId === ROG_VENDOR_ID &&
    device.productId === OMNI_PRODUCT_ID &&
    device.usagePage === VENDOR_USAGE_PAGE &&
    device.interface === 2 &&
    devicePath.includes("mi_02&col02") &&
    !devicePath.includes("\\kbd") &&
    !isStandardKeyboardCollection(device)
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseResponse(mode, responseBytes) {
  if (mode === "omni") {
    if (
      responseBytes.length > 9 &&
      responseBytes[0] === BATTERY_REPORT_ID &&
      responseBytes[1] === 0x12 &&
      responseBytes[2] === 0x01
    ) {
      return {
        ok: true,
        batteryPercent: responseBytes[6],
        chargingByte: responseBytes[9],
        charging: responseBytes[9] === 0x01,
      };
    }

    if (responseBytes.length >= 3 && responseBytes[0] === BATTERY_REPORT_ID && responseBytes[1] === 0xff && responseBytes[2] === 0xaa) {
      return { ok: false, noData: true };
    }
  }

  if (mode === "wired") {
    if (responseBytes.length > 8 && responseBytes[0] === 0x12 && responseBytes[1] === 0x01) {
      return {
        ok: true,
        batteryPercent: responseBytes[5],
        chargingByte: responseBytes[8],
        charging: responseBytes[8] === 0x01,
      };
    }

    if (responseBytes.length >= 5 && responseBytes[0] === 0xff && responseBytes[1] === 0xaa && responseBytes[4] === 0xff) {
      return { ok: false, noData: true };
    }
  }

  return { ok: false, unexpected: true };
}

function drain(device) {
  let count = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = device.readTimeout(1);
    if (!response || response.length === 0) break;
    count += 1;
  }
  return count;
}

async function stressTarget(target) {
  const query = [
    BATTERY_REPORT_ID,
    0x12,
    0x01,
    ...Array.from({ length: OUTPUT_REPORT_LENGTH - 3 }, () => 0x00),
  ];
  const device = new HID.HID(target.device.path, { nonExclusive: true });
  const startedAt = Date.now();
  const deadline = startedAt + DURATION_MS;
  const samples = [];
  const stats = {
    writes: 0,
    reads: 0,
    success: 0,
    timeout: 0,
    noData: 0,
    unexpected: 0,
    errors: 0,
    drainedReports: 0,
    firstBatteryPercent: null,
    lastBatteryPercent: null,
    chargingBytes: {},
  };

  try {
    stats.drainedReports += drain(device);

    while (Date.now() < deadline) {
      const sampleStartedAt = Date.now();
      try {
        device.write(query);
        stats.writes += 1;

        const response = device.readTimeout(READ_TIMEOUT_MS);
        if (!response || response.length === 0) {
          stats.timeout += 1;
        } else {
          stats.reads += 1;
          const responseBytes = Array.from(response);
          const parsed = parseResponse(target.mode, responseBytes);

          if (parsed.ok) {
            stats.success += 1;
            stats.firstBatteryPercent ??= parsed.batteryPercent;
            stats.lastBatteryPercent = parsed.batteryPercent;
            const chargingByteKey = toHex(parsed.chargingByte);
            stats.chargingBytes[chargingByteKey] = (stats.chargingBytes[chargingByteKey] || 0) + 1;
          } else if (parsed.noData) {
            stats.noData += 1;
          } else {
            stats.unexpected += 1;
            if (samples.length < 30) {
              samples.push({
                atMilliseconds: Date.now() - startedAt,
                kind: "unexpected",
                responseHex: bytesToHex(responseBytes),
              });
            }
          }
        }
      } catch (error) {
        stats.errors += 1;
        if (samples.length < 30) {
          samples.push({
            atMilliseconds: Date.now() - startedAt,
            kind: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const elapsed = Date.now() - sampleStartedAt;
      if (elapsed < INTERVAL_MS) {
        await sleep(INTERVAL_MS - elapsed);
      }
    }

    return {
      mode: target.mode,
      targetDevice: describeDevice(target.device),
      durationMilliseconds: Date.now() - startedAt,
      intervalMilliseconds: INTERVAL_MS,
      readTimeoutMilliseconds: READ_TIMEOUT_MS,
      queryHex: bytesToHex(query),
      stats,
      samples,
    };
  } finally {
    device.close();
  }
}

async function main() {
  const allDevices = HID.devices();
  const allTargets = [
    ...allDevices.filter(isRx96WiredCollection).map((device) => ({ mode: "wired", device })),
    ...allDevices.filter(isRx96OmniCollection).map((device) => ({ mode: "omni", device })),
  ];
  const targets = TARGET_MODE === "all" ? allTargets : allTargets.filter((target) => target.mode === TARGET_MODE);

  const result = {
    startedAt: new Date().toISOString(),
    durationMilliseconds: DURATION_MS,
    intervalMilliseconds: INTERVAL_MS,
    readTimeoutMilliseconds: READ_TIMEOUT_MS,
    targetMode: TARGET_MODE,
    targets: targets.map((target) => ({ mode: target.mode, device: describeDevice(target.device) })),
    results: [],
  };

  for (const target of targets) {
    result.results.push(await stressTarget(target));
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

main()
  .then((result) => {
    const outputPath = path.resolve(__dirname, `stress-rog-rx96-battery-output-${process.pid}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      outputPath,
      targets: result.targets.length,
      summary: result.results.map((item) => ({
        mode: item.mode,
        writes: item.stats.writes,
        success: item.stats.success,
        timeout: item.stats.timeout,
        noData: item.stats.noData,
        unexpected: item.stats.unexpected,
        errors: item.stats.errors,
        firstBatteryPercent: item.stats.firstBatteryPercent,
        lastBatteryPercent: item.stats.lastBatteryPercent,
        chargingBytes: item.stats.chargingBytes,
      })),
    }, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });


