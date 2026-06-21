import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HID = require("node-hid");

const LOGITECH_VENDOR_ID = 0x046d;
const BOLT_RECEIVER_PRODUCT_ID = 0xc548;
const UNIFYING_RECEIVER_PRODUCT_ID = 0xc52b;
const VENDOR_USAGE_PAGE = 0xff00;
const DURATION_MS = Number(process.env.LOGITECH_STRESS_DURATION_MS || 60000);
const INTERVAL_MS = Number(process.env.LOGITECH_STRESS_INTERVAL_MS || 20);
const READ_TIMEOUT_MS = Number(process.env.LOGITECH_STRESS_READ_TIMEOUT_MS || 20);

const TARGETS = [
  {
    mode: "bolt-mx-master-4",
    receiverProductId: BOLT_RECEIVER_PRODUCT_ID,
    slot: 0x02,
    featureIndex: 0x09,
    functionId: 0x11,
  },
  {
    mode: "unifying-mx-master-3s",
    receiverProductId: UNIFYING_RECEIVER_PRODUCT_ID,
    slot: 0x01,
    featureIndex: 0x08,
    functionId: 0x00,
  },
];

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
    usagePage: device.usagePage === undefined ? null : toHex(device.usagePage, 4),
    usage: device.usage === undefined ? null : toHex(device.usage, 4),
    interface: device.interface,
    manufacturer: device.manufacturer,
    product: device.product,
    serialNumber: device.serialNumber,
    path: device.path,
  };
}

function receiverManagementDevices(allDevices, receiverProductId) {
  return allDevices.filter(
    (device) =>
      device.vendorId === LOGITECH_VENDOR_ID &&
      device.productId === receiverProductId &&
      device.usagePage === VENDOR_USAGE_PAGE &&
      device.path,
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseBatteryResponse(target, responseBytes) {
  if (
    responseBytes.length >= 7 &&
    responseBytes[0] === 0x11 &&
    responseBytes[1] === target.slot &&
    responseBytes[2] === target.featureIndex &&
    responseBytes[3] === target.functionId
  ) {
    const batteryPercent = responseBytes[4];
    return {
      ok: batteryPercent >= 0 && batteryPercent <= 100,
      batteryPercent,
      nextBatteryPercent: responseBytes[5],
      statusByte: responseBytes[6],
    };
  }

  return { ok: false, unexpected: true };
}

function drainHandles(handles) {
  let drainedReports = 0;
  for (const handle of handles) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = handle.device.readTimeout(1);
      if (!response || response.length === 0) break;
      drainedReports += 1;
    }
  }
  return drainedReports;
}

function readTargetResponse(target, handles) {
  const deadline = Date.now() + READ_TIMEOUT_MS;
  const seenResponses = [];

  while (Date.now() < deadline) {
    for (const handle of handles) {
      const response = handle.device.readTimeout(1);
      if (!response || response.length === 0) {
        continue;
      }

      const responseBytes = Array.from(response);
      const responseRecord = {
        handleIndex: handle.handleIndex,
        responseHex: bytesToHex(responseBytes),
        responseBytes,
      };
      seenResponses.push(responseRecord);

      const parsed = parseBatteryResponse(target, responseBytes);
      if (parsed.ok) {
        return { kind: "success", responseRecord, parsed, seenResponses };
      }
    }
  }

  if (seenResponses.length > 0) {
    return { kind: "unexpected", seenResponses };
  }

  return { kind: "timeout", seenResponses };
}

function createTargetState(target, allDevices) {
  const managementDevices = receiverManagementDevices(allDevices, target.receiverProductId);
  const handles = managementDevices.map((device, handleIndex) => ({
    handleIndex,
    sourceDevice: device,
    device: new HID.HID(device.path, { nonExclusive: true }),
  }));

  return {
    ...target,
    handles,
    writeHandle: handles[0] ?? null,
    query: [0x10, target.slot, target.featureIndex, target.functionId, 0x00, 0x00, 0x00],
    managementDevices,
    stats: {
      writes: 0,
      reads: 0,
      success: 0,
      timeout: 0,
      unexpected: 0,
      errors: 0,
      drainedReports: 0,
      firstBatteryPercent: null,
      lastBatteryPercent: null,
      nextBatteryPercentValues: {},
      statusBytes: {},
    },
    samples: [],
  };
}

function recordCount(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

function recordSample(targetState, sample) {
  if (targetState.samples.length < 30) {
    targetState.samples.push(sample);
  }
}

async function stressTargets(targetStates) {
  const startedAt = Date.now();
  const deadline = startedAt + DURATION_MS;

  for (const targetState of targetStates) {
    targetState.stats.drainedReports += drainHandles(targetState.handles);
  }

  while (Date.now() < deadline) {
    const tickStartedAt = Date.now();

    for (const targetState of targetStates) {
      if (!targetState.writeHandle) {
        continue;
      }

      try {
        targetState.writeHandle.device.write(targetState.query);
        targetState.stats.writes += 1;

        const result = readTargetResponse(targetState, targetState.handles);
        if (result.kind === "success") {
          targetState.stats.reads += 1;
          targetState.stats.success += 1;
          targetState.stats.firstBatteryPercent ??= result.parsed.batteryPercent;
          targetState.stats.lastBatteryPercent = result.parsed.batteryPercent;
          recordCount(targetState.stats.nextBatteryPercentValues, toHex(result.parsed.nextBatteryPercent));
          recordCount(targetState.stats.statusBytes, toHex(result.parsed.statusByte));
        } else if (result.kind === "unexpected") {
          targetState.stats.reads += result.seenResponses.length;
          targetState.stats.unexpected += 1;
          recordSample(targetState, {
            atMilliseconds: Date.now() - startedAt,
            kind: "unexpected",
            seenResponses: result.seenResponses.map((response) => ({
              handleIndex: response.handleIndex,
              responseHex: response.responseHex,
            })),
          });
        } else {
          targetState.stats.timeout += 1;
        }
      } catch (error) {
        targetState.stats.errors += 1;
        recordSample(targetState, {
          atMilliseconds: Date.now() - startedAt,
          kind: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const elapsed = Date.now() - tickStartedAt;
    if (elapsed < INTERVAL_MS) {
      await sleep(INTERVAL_MS - elapsed);
    }
  }
}

async function main() {
  const allDevices = HID.devices();
  const targetStates = TARGETS.map((target) => createTargetState(target, allDevices));

  const result = {
    startedAt: new Date().toISOString(),
    durationMilliseconds: DURATION_MS,
    intervalMilliseconds: INTERVAL_MS,
    readTimeoutMilliseconds: READ_TIMEOUT_MS,
    targets: targetStates.map((targetState) => ({
      mode: targetState.mode,
      slot: toHex(targetState.slot),
      featureIndex: toHex(targetState.featureIndex),
      functionId: toHex(targetState.functionId),
      queryHex: bytesToHex(targetState.query),
      managementDevices: targetState.managementDevices.map(describeDevice),
    })),
    results: [],
  };

  try {
    await stressTargets(targetStates);

    result.results = targetStates.map((targetState) => ({
      mode: targetState.mode,
      durationMilliseconds: DURATION_MS,
      stats: targetState.stats,
      samples: targetState.samples,
    }));
    result.finishedAt = new Date().toISOString();
    return result;
  } finally {
    for (const targetState of targetStates) {
      for (const handle of targetState.handles) {
        handle.device.close();
      }
    }
  }
}

main()
  .then((result) => {
    const outputPath = path.resolve(__dirname, `stress-logitech-mx-battery-output-${process.pid}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      outputPath,
      targets: result.targets.map((target) => ({
        mode: target.mode,
        handles: target.managementDevices.length,
        queryHex: target.queryHex,
      })),
      summary: result.results.map((item) => ({
        mode: item.mode,
        writes: item.stats.writes,
        success: item.stats.success,
        timeout: item.stats.timeout,
        unexpected: item.stats.unexpected,
        errors: item.stats.errors,
        firstBatteryPercent: item.stats.firstBatteryPercent,
        lastBatteryPercent: item.stats.lastBatteryPercent,
        nextBatteryPercentValues: item.stats.nextBatteryPercentValues,
        statusBytes: item.stats.statusBytes,
      })),
    }, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });


