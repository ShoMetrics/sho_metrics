import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { HIDAsync, devices } = require("node-hid");

const VID = 0x046d;
const RECEIVERS = [
  { name: "Bolt", productId: 0xc548, slots: [0x02] },
  { name: "Unifying", productId: 0xc52b, slots: [0x01] },
];

const FEATURES = {
  batteryStatus: 0x1000,
  unifiedBattery: 0x1004,
  changeHost: 0x1814,
  smartShift: 0x2110,
  smartShiftEnhanced: 0x2111,
  thumbWheel: 0x2150,
  adjustableDpi: 0x2201,
};

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

async function readMatching(opened, predicate, timeoutMs = 900) {
  const deadline = Date.now() + timeoutMs;
  const seen = [];

  while (Date.now() < deadline) {
    const remaining = Math.min(120, Math.max(1, deadline - Date.now()));
    const reads = await Promise.all(
      opened.map(async (device, index) => {
        try {
          return { index, data: await device.read(remaining) };
        } catch (error) {
          return { index, error: String(error) };
        }
      }),
    );

    for (const read of reads) {
      if (!read.data || read.data.length === 0) continue;
      const record = { handleIndex: read.index, bytes: Array.from(read.data), hex: bytesToHex(read.data) };
      seen.push(record);
      if (predicate(read.data)) return { match: record, seen };
    }
  }

  return { match: null, seen };
}

async function queryFeatureIndex(writeDevice, opened, slot, featureCode) {
  const request = [0x10, slot, 0x00, 0x01, (featureCode >> 8) & 0xff, featureCode & 0xff, 0x00];
  await writeDevice.write(request);
  const response = await readMatching(
    opened,
    data => data.length >= 5 && (data[0] === 0x10 || data[0] === 0x11) && data[1] === slot && data[2] === 0x00,
  );
  return {
    requestHex: bytesToHex(request),
    featureIndex: response.match ? response.match.bytes[4] ?? 0 : 0,
    response: response.match,
  };
}

async function queryFeature(writeDevice, opened, slot, featureIndex, functionId) {
  const request = [0x10, slot, featureIndex, functionId, 0x00, 0x00, 0x00];
  await writeDevice.write(request);
  const response = await readMatching(
    opened,
    data =>
      data.length >= 5 &&
      (data[0] === 0x10 || data[0] === 0x11) &&
      data[1] === slot &&
      data[2] === featureIndex &&
      data[3] === functionId,
  );
  return { requestHex: bytesToHex(request), response: response.match, seen: response.seen };
}

function parseBatteryStatus(response) {
  if (!response) return null;
  const [level, nextLevel, status] = response.bytes.slice(4, 7);
  return {
    feature: "BATTERY_STATUS",
    percent: level === 0 ? null : level,
    nextPercent: nextLevel === 0 ? null : nextLevel,
    status,
  };
}

function parseUnifiedBattery(response) {
  if (!response) return null;
  const [discharge, level, status] = response.bytes.slice(4, 7);
  const approximatePercentByLevel = new Map([
    [8, 90],
    [4, 50],
    [2, 20],
    [1, 5],
    [0, 0],
  ]);
  return {
    feature: "UNIFIED_BATTERY",
    percent: discharge || (approximatePercentByLevel.get(level) ?? null),
    rawDischarge: discharge,
    approximateLevel: level,
    status,
  };
}

function parseChangeHost(response) {
  if (!response) return null;
  const [hostCount, currentHost] = response.bytes.slice(4, 6);
  return {
    hostCount,
    currentHost,
    easySwitchSlot: currentHost + 1,
  };
}

async function probeReceiver(receiver) {
  const allDevices = devices(VID, receiver.productId);
  const managementPaths = allDevices
    .filter(device => device.usagePage === 0xff00 && device.path)
    .map(device => device.path);
  const opened = [];
  const result = { receiver: receiver.name, productId: hex(receiver.productId, 4), managementPaths, slots: [] };

  try {
    for (const managementPath of managementPaths) {
      opened.push(await HIDAsync.open(managementPath, { nonExclusive: true }));
    }
    if (opened.length === 0) return result;
    const writeDevice = opened[0];

    for (const slot of receiver.slots) {
      const featureIndexes = {};
      for (const [name, code] of Object.entries(FEATURES)) {
        featureIndexes[name] = await queryFeatureIndex(writeDevice, opened, slot, code);
      }

      const hasMouseIdentity =
        featureIndexes.smartShift.featureIndex > 0 ||
        featureIndexes.smartShiftEnhanced.featureIndex > 0 ||
        featureIndexes.thumbWheel.featureIndex > 0 ||
        featureIndexes.adjustableDpi.featureIndex > 0;

      let battery = null;
      if (featureIndexes.unifiedBattery.featureIndex > 0) {
        const query = await queryFeature(writeDevice, opened, slot, featureIndexes.unifiedBattery.featureIndex, 0x10);
        battery = { ...parseUnifiedBattery(query.response), query };
      } else if (featureIndexes.batteryStatus.featureIndex > 0) {
        const query = await queryFeature(writeDevice, opened, slot, featureIndexes.batteryStatus.featureIndex, 0x00);
        battery = { ...parseBatteryStatus(query.response), query };
      }

      let changeHost = null;
      if (featureIndexes.changeHost.featureIndex > 0) {
        const query = await queryFeature(writeDevice, opened, slot, featureIndexes.changeHost.featureIndex, 0x00);
        changeHost = { ...parseChangeHost(query.response), query };
      }

      result.slots.push({
        receiverSlot: hex(slot),
        activeMouseCandidate: hasMouseIdentity,
        featureIndexes: Object.fromEntries(
          Object.entries(featureIndexes).map(([name, value]) => [name, value.featureIndex]),
        ),
        battery,
        changeHost,
      });
    }

    return result;
  } finally {
    for (const device of opened) {
      await device.close().catch(() => {});
    }
  }
}

async function main() {
  const result = { timestamp: new Date().toISOString(), receivers: [] };
  for (const receiver of RECEIVERS) {
    result.receivers.push(await probeReceiver(receiver));
  }
  return result;
}

main()
  .then(result => {
    const outputPath = path.join(__dirname, `probe-logitech-current-state-output-${process.pid}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(outputPath);
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });


