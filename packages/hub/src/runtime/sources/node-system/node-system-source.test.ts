import assert from "node:assert/strict";
import test from "node:test";
import type { Systeminformation } from "systeminformation";
import {
    MetricUnit,
    readRequiredMetricSnapshotTimestampMilliseconds,
    type MetricSnapshot,
    type MetricValue,
} from "../metric-source";
import {
    formatCpuModelText,
    isFinitePositiveNumber,
    normalizeNonEmptyText,
} from "./node-system-cpu";
import {
    calculatePercent,
    isNetworkFileSystem,
    isLocalBlockDevice,
    isUsableFileSystem,
    normalizeNullableRate,
    resolveDefaultDiskVolume,
    resolveDiskStorageKind,
    resolvePhysicalDisk,
    toDiskVolumeOption,
} from "./node-system-disk";
import {
    parseIoAcceleratorPerformanceStatistics,
    parseNvidiaSmiNumber,
    parseNvidiaSmiTelemetryLine,
} from "./node-system-gpu";
import {
    calculateNetworkRate,
    isSystemNetworkInterface,
    isUsableNetworkInterface,
    normalizeNetworkInterfaceType,
    toNetworkInterfaceOption,
} from "./node-system-network";
import {
    NodeSystemSource,
    resolveCollectorGroups,
} from "./node-system-source";
import {
    buildNetworkInterface,
    buildNetworkStats,
} from "./node-system-source-test-helpers";
import type {
    NodeSystemGpuTelemetryData,
    NodeSystemInformationClient,
    NodeSystemMetricGroup,
} from "./node-system-source-types";
import type { DiskVolumeOption } from "../../disk-volumes";
import type { NetworkInterfaceOption } from "../../network-interfaces";

test("collector groups resolve all groups when no metric keys are requested", () => {
    assertMetricGroups(resolveCollectorGroups([]), ["cpu", "disk", "gpu", "memory", "network"]);
});

test("collector groups resolve only requested key prefixes", () => {
    assertMetricGroups(resolveCollectorGroups([
        "net.down",
        "cpu.usage_percent",
        "gpu.temp",
        "unknown.metric",
    ]), ["cpu", "gpu", "network"]);
});

test("node system source declares polling groups for owned metric keys", () => {
    const source = new NodeSystemSource();

    const resolutions = source.resolveMetricPollingGroups([
        "cpu.usage_percent",
        "net.down",
        "unknown.metric",
    ]);

    assert.deepEqual(resolutions.get("cpu.usage_percent"), {
        state: "owned",
        pollingGroupId: "cpu",
    });
    assert.deepEqual(resolutions.get("net.down"), {
        state: "owned",
        pollingGroupId: "network",
    });
    assert.deepEqual(resolutions.get("unknown.metric"), {
        state: "unknown",
    });
});

test("node system source declares only GPU usage as supported on macOS", () => {
    const source = new NodeSystemSource({ platform: "darwin" });

    const resolutions = source.resolveMetricPollingGroups([
        "gpu.usage_percent",
        "gpu.temp",
        "gpu.vram_used",
        "gpu.power",
    ]);

    assert.deepEqual(resolutions.get("gpu.usage_percent"), {
        state: "owned",
        pollingGroupId: "gpu",
    });
    assert.deepEqual(resolutions.get("gpu.temp"), {
        state: "unsupported",
    });
    assert.deepEqual(resolutions.get("gpu.vram_used"), {
        state: "unsupported",
    });
    assert.deepEqual(resolutions.get("gpu.power"), {
        state: "unsupported",
    });
});

test("node system source polls only the requested CPU group and exposes cached CPU info on the next poll", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts, {
            currentLoad: async () => {
                callCounts.currentLoad += 1;
                return {
                    currentLoad: 42,
                } as Systeminformation.CurrentLoadData;
            },
            cpu: async () => {
                callCounts.cpu += 1;
                return buildCpuData({
                    manufacturer: "AMD",
                    brand: "Ryzen 9",
                    speed: 4.2,
                });
            },
        }),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        now: () => 1234,
    });

    const firstSnapshot = await source.pollMetrics(["cpu.usage_percent"]);
    await waitForQueuedCpuInformationPoll();
    const secondSnapshot = await source.pollMetrics(["cpu.usage_percent"]);
    const firstMetrics = assertSnapshotMetrics(firstSnapshot);
    const secondMetrics = assertSnapshotMetrics(secondSnapshot);

    assert.deepEqual(firstMetrics["cpu.usage_percent"], {
        scalar: 42,
        unit: MetricUnit.PERCENT,
    });
    assert.equal(firstMetrics["cpu.base_frequency"], undefined);
    assert.deepEqual(secondMetrics["cpu.base_frequency"], {
        scalar: 4200000000,
        unit: MetricUnit.HERTZ,
    });
    assert.deepEqual(secondMetrics["cpu.model"], {
        text: "AMD Ryzen 9",
    });
    assert.equal(readRequiredMetricSnapshotTimestampMilliseconds(firstSnapshot), 1234);
    assert.equal(callCounts.currentLoad, 2);
    assert.equal(callCounts.cpu, 1);
    assert.equal(callCounts.mem, 0);
    assert.equal(callCounts.fsSize, 0);
    assert.equal(callCounts.networkInterfaces, 0);
    assert.equal(callCounts.windowsGpu, 0);
    assert.equal(callCounts.systemGpu, 0);
});

test("node system source retries static CPU information after a transient failure", async () => {
    const callCounts = buildCallCounts();
    let currentTimestampMilliseconds = 1000;
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts, {
            currentLoad: async () => {
                callCounts.currentLoad += 1;
                return {
                    currentLoad: 42,
                } as Systeminformation.CurrentLoadData;
            },
            cpu: async () => {
                callCounts.cpu += 1;
                if (callCounts.cpu === 1) {
                    throw new Error("cpu info failed");
                }

                return buildCpuData({
                    manufacturer: "AMD",
                    brand: "Ryzen 9",
                    speed: 4.2,
                });
            },
        }),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        now: () => currentTimestampMilliseconds,
    });

    await source.pollMetrics(["cpu.usage_percent"]);
    await waitForQueuedCpuInformationPoll();
    currentTimestampMilliseconds = 60000;
    await source.pollMetrics(["cpu.usage_percent"]);
    await waitForQueuedCpuInformationPoll();
    currentTimestampMilliseconds = 61000;
    const retryStartSnapshot = await source.pollMetrics(["cpu.usage_percent"]);
    await waitForQueuedCpuInformationPoll();
    const cachedSnapshot = await source.pollMetrics(["cpu.usage_percent"]);
    const retryStartMetrics = assertSnapshotMetrics(retryStartSnapshot);
    const cachedMetrics = assertSnapshotMetrics(cachedSnapshot);

    assert.equal(retryStartMetrics["cpu.base_frequency"], undefined);
    assert.deepEqual(cachedMetrics["cpu.base_frequency"], {
        scalar: 4200000000,
        unit: MetricUnit.HERTZ,
    });
    assert.deepEqual(cachedMetrics["cpu.model"], {
        text: "AMD Ryzen 9",
    });
    assert.equal(callCounts.cpu, 2);
    assert.equal(callCounts.currentLoad, 4);
});

test("node system source polls only memory when RAM metrics are requested", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        platform: "linux",
        systemInformation: buildCountingSystemInformation(callCounts, {
            mem: async () => {
                callCounts.mem += 1;
                return {
                    used: 8,
                    total: 16,
                    available: 8,
                } as Systeminformation.MemData;
            },
        }),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
    });

    const snapshot = await source.pollMetrics(["ram.used"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.deepEqual(metrics, {
        "ram.used": {
            scalar: 8,
            unit: MetricUnit.BYTES,
        },
        "ram.total": {
            scalar: 16,
            unit: MetricUnit.BYTES,
        },
    });
    assert.equal(callCounts.mem, 1);
    assert.equal(callCounts.currentLoad, 0);
    assert.equal(callCounts.fsSize, 0);
    assert.equal(callCounts.networkInterfaces, 0);
    assert.equal(callCounts.windowsGpu, 0);
});

test("node system source excludes macOS reclaimable memory from RAM used", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        platform: "darwin",
        systemInformation: buildCountingSystemInformation(callCounts, {
            mem: async () => {
                callCounts.mem += 1;
                return {
                    used: 15_940,
                    total: 16_000,
                    reclaimable: 2_240,
                } as Systeminformation.MemData;
            },
        }),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
    });

    const snapshot = await source.pollMetrics(["ram.used"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.deepEqual(metrics["ram.used"], {
        scalar: 13_700,
        unit: MetricUnit.BYTES,
    });
    assert.deepEqual(metrics["ram.total"], {
        scalar: 16_000,
        unit: MetricUnit.BYTES,
    });
});

test("node system source falls back to used memory when macOS reclaimable memory is unavailable", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        platform: "darwin",
        systemInformation: buildCountingSystemInformation(callCounts, {
            mem: async () => {
                callCounts.mem += 1;
                return {
                    used: 9_000,
                    total: 16_000,
                } as Systeminformation.MemData;
            },
        }),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
    });

    const snapshot = await source.pollMetrics(["ram.used"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.deepEqual(metrics["ram.used"], {
        scalar: 9_000,
        unit: MetricUnit.BYTES,
    });
});

test("node system source uses available memory for non-macOS RAM used", async () => {
    for (const platform of ["linux", "win32"] as const) {
        const callCounts = buildCallCounts();
        const source = new NodeSystemSource({
            platform,
            systemInformation: buildCountingSystemInformation(callCounts, {
                mem: async () => {
                    callCounts.mem += 1;
                    return {
                        used: 15_000,
                        total: 16_000,
                        available: 4_000,
                        reclaimable: 2_000,
                    } as Systeminformation.MemData;
                },
            }),
            pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
            pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        });

        const snapshot = await source.pollMetrics(["ram.used"]);
        const metrics = assertSnapshotMetrics(snapshot);

        assert.deepEqual(metrics["ram.used"], {
            scalar: 12_000,
            unit: MetricUnit.BYTES,
        }, platform);
        assert.deepEqual(metrics["ram.total"], {
            scalar: 16_000,
            unit: MetricUnit.BYTES,
        }, platform);
    }
});

test("node system source falls back to used memory when non-macOS available memory is unusable", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        platform: "linux",
        systemInformation: buildCountingSystemInformation(callCounts, {
            mem: async () => {
                callCounts.mem += 1;
                return {
                    used: 9_000,
                    total: 16_000,
                    available: 17_000,
                } as Systeminformation.MemData;
            },
        }),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
    });

    const snapshot = await source.pollMetrics(["ram.used"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.deepEqual(metrics["ram.used"], {
        scalar: 9_000,
        unit: MetricUnit.BYTES,
    });
});

test("node system source maintains network counter state and updates injected interface registry", async () => {
    const callCounts = buildCallCounts();
    const networkRegistryUpdates: NetworkInterfaceOption[][] = [];
    const networkStatsQueue: Systeminformation.NetworkStatsData[][] = [
        [buildNetworkStats({ rx_bytes: 1000, tx_bytes: 500 })],
        [buildNetworkStats({ rx_bytes: 5000, tx_bytes: 2500 })],
    ];
    const networkStatsArguments: Array<string | undefined> = [];
    let currentTimestampMilliseconds = 1000;
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts, {
            networkInterfaces: (async () => {
                callCounts.networkInterfaces += 1;
                return [buildNetworkInterface({
                    iface: "eth0",
                    ifaceName: "Ethernet",
                    type: "wired",
                    speed: 1000,
                })];
            }) as NodeSystemInformationClient["networkInterfaces"],
            networkStats: (async (interfaces?: string | ((data: Systeminformation.NetworkStatsData[]) => unknown)) => {
                callCounts.networkStats += 1;
                networkStatsArguments.push(typeof interfaces === "string" ? interfaces : undefined);
                return networkStatsQueue.shift() ?? [];
            }) as NodeSystemInformationClient["networkStats"],
        }),
        networkRegistry: {
            update: options => networkRegistryUpdates.push([...options]),
        },
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        now: () => currentTimestampMilliseconds,
    });

    const firstSnapshot = await source.pollMetrics(["net.down"]);
    currentTimestampMilliseconds = 3000;
    const secondSnapshot = await source.pollMetrics(["net.down"]);
    const firstMetrics = assertSnapshotMetrics(firstSnapshot);
    const secondMetrics = assertSnapshotMetrics(secondSnapshot);

    assert.equal(firstMetrics["net.down.eth0"]?.scalar, 0);
    assert.equal(secondMetrics["net.down.eth0"]?.scalar, 2000);
    assert.equal(secondMetrics["net.up.eth0"]?.scalar, 1000);
    assert.equal(secondMetrics["net.down"]?.scalar, 2000);
    assert.equal(secondMetrics["net.up"]?.scalar, 1000);
    assert.deepEqual(networkRegistryUpdates[0], [{
        id: "eth0",
        name: "Ethernet",
        type: "wired",
        isDefault: false,
        speedMegabitsPerSecond: 1000,
    }]);
    assert.deepEqual(networkRegistryUpdates[1], networkRegistryUpdates[0]);
    assert.deepEqual(networkStatsArguments, ["eth0", "eth0"]);
    assert.equal(callCounts.networkInterfaces, 1);
    assert.equal(callCounts.networkStats, 2);
    assert.equal(callCounts.currentLoad, 0);
});

test("node system source maps disk usage metrics and updates injected disk registry", async () => {
    const callCounts = buildCallCounts();
    const diskRegistryUpdates: DiskVolumeOption[][] = [];
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts, {
            fsSize: async () => {
                callCounts.fsSize += 1;
                return [buildFileSystem({
                    fs: "C:",
                    mount: "C:",
                    size: 1000,
                    used: 400,
                    available: 600,
                })];
            },
            blockDevices: async () => {
                callCounts.blockDevices += 1;
                return [buildBlockDevice({
                    name: "C:",
                    mount: "C:",
                    label: "System",
                    physical: "Local",
                    size: "1000",
                })];
            },
            diskLayout: async () => {
                callCounts.diskLayout += 1;
                return [buildDiskLayout({
                    name: "Example Disk",
                    type: "SSD",
                    size: 1000,
                })];
            },
        }),
        diskRegistry: {
            update: options => diskRegistryUpdates.push([...options]),
        },
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        platform: "win32",
    });

    const snapshot = await source.pollMetrics(["disk.usage.percent"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.equal(metrics["disk.volume.C%3A.percent"]?.scalar, 40);
    assert.equal(metrics["disk.usage.percent"]?.scalar, 40);
    assert.equal(metrics["disk.throughput.read"], undefined);
    assert.equal(diskRegistryUpdates[0][0]?.id, "C:");
    assert.equal(diskRegistryUpdates[0][0]?.volumeLabel, "System");
    assert.equal(callCounts.fsSize, 1);
    assert.equal(callCounts.fsStats, 0);
});

test("node system source polls disk throughput only on darwin", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts, {
            fsStats: async () => {
                callCounts.fsStats += 1;
                return {
                    rx_sec: 10,
                    wx_sec: 20,
                    tx_sec: 30,
                } as Systeminformation.FsStatsData;
            },
        }),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        platform: "darwin",
    });

    const snapshot = await source.pollMetrics(["disk.throughput.read"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.equal(metrics["disk.throughput.read"]?.scalar, 10);
    assert.equal(metrics["disk.throughput.write"]?.scalar, 20);
    assert.equal(metrics["disk.throughput.total"]?.scalar, 30);
    assert.equal(callCounts.fsStats, 1);
    assert.equal(callCounts.fsSize, 0);
});

test("node system source normalizes null darwin disk throughput rates to zero", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts, {
            fsStats: async () => {
                callCounts.fsStats += 1;
                return {
                    rx: 5484090826752,
                    wx: 2776625758208,
                    tx: 8260716584960,
                    rx_sec: null,
                    wx_sec: null,
                    tx_sec: null,
                    ms: 0,
                } as Systeminformation.FsStatsData;
            },
        }),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        platform: "darwin",
    });

    const snapshot = await source.pollMetrics(["disk.throughput.read"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.equal(metrics["disk.throughput.read"]?.scalar, 0);
    assert.equal(metrics["disk.throughput.write"]?.scalar, 0);
    assert.equal(metrics["disk.throughput.total"]?.scalar, 0);
    assert.equal(callCounts.fsStats, 1);
});

test("node system source skips disk throughput on Windows even when requested", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        platform: "win32",
    });

    const snapshot = await source.pollMetrics(["disk.throughput.read"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.deepEqual(metrics, {});
    assert.equal(callCounts.fsStats, 0);
    assert.equal(callCounts.fsSize, 0);
});

test("node system source maps injected GPU telemetry without polling systeminformation on Windows", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts),
        pollWindowsGpuTelemetry: async () => {
            callCounts.windowsGpu += 1;
            return {
                utilizationGpu: 75,
                modelText: "NVIDIA RTX",
                temperatureGpu: 68,
                memoryUsed: 12000,
                memoryTotal: 24000,
                powerDraw: 250,
                powerLimit: 450,
            };
        },
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        platform: "win32",
    });

    const snapshot = await source.pollMetrics(["gpu.usage_percent"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.deepEqual(metrics["gpu.usage_percent"], {
        scalar: 75,
        unit: MetricUnit.PERCENT,
    });
    assert.deepEqual(metrics["gpu.model"], { text: "NVIDIA RTX" });
    assert.equal(metrics["gpu.temp"]?.scalar, 68);
    assert.equal(metrics["gpu.vram_used"]?.scalar, 12000 * 1024 * 1024);
    assert.equal(metrics["gpu.vram_total"]?.scalar, 24000 * 1024 * 1024);
    assert.equal(metrics["gpu.power"]?.scalar, 250);
    assert.equal(metrics["gpu.power_limit"]?.scalar, 450);
    assert.equal(callCounts.windowsGpu, 1);
    assert.equal(callCounts.systemGpu, 0);
    assert.equal(callCounts.currentLoad, 0);
});

test("node system source maps injected macOS GPU usage without polling systeminformation", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts),
        pollWindowsGpuTelemetry: buildNoGpuPoller(callCounts),
        pollDarwinGpuTelemetry: async () => {
            callCounts.darwinGpu += 1;
            return {
                utilizationGpu: 63,
            };
        },
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        platform: "darwin",
    });

    const snapshot = await source.pollMetrics(["gpu.usage_percent"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.deepEqual(metrics, {
        "gpu.usage_percent": {
            scalar: 63,
            unit: MetricUnit.PERCENT,
        },
    });
    assert.equal(callCounts.darwinGpu, 1);
    assert.equal(callCounts.windowsGpu, 0);
    assert.equal(callCounts.systemGpu, 0);
    assert.equal(callCounts.graphics, 0);
});

test("node system source omits unavailable GPU telemetry fields", async () => {
    const callCounts = buildCallCounts();
    const source = new NodeSystemSource({
        systemInformation: buildCountingSystemInformation(callCounts),
        pollWindowsGpuTelemetry: async () => {
            callCounts.windowsGpu += 1;
            return {
                utilizationGpu: 75,
                modelText: "NVIDIA RTX",
            };
        },
        pollDarwinGpuTelemetry: buildNoDarwinGpuPoller(callCounts),
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller(callCounts),
        platform: "win32",
    });

    const snapshot = await source.pollMetrics(["gpu.usage_percent"]);
    const metrics = assertSnapshotMetrics(snapshot);

    assert.deepEqual(metrics, {
        "gpu.usage_percent": {
            scalar: 75,
            unit: MetricUnit.PERCENT,
        },
        "gpu.model": {
            text: "NVIDIA RTX",
        },
    });
});

test("first network counter sample produces a zero rate", () => {
    const networkRate = calculateNetworkRate({
        interfaceId: "en0",
        direction: "download",
        currentBytes: 1000,
        currentTimestampMilliseconds: 2000,
        previousSample: undefined,
    });

    assert.deepEqual(networkRate, {
        interfaceId: "en0",
        direction: "download",
        currentBytes: 1000,
        previousBytes: null,
        bytesDelta: null,
        elapsedMilliseconds: null,
        bytesPerSecond: 0,
        hadPreviousSample: false,
    });
});

test("network counter delta is converted to bytes per second", () => {
    const networkRate = calculateNetworkRate({
        interfaceId: "en0",
        direction: "upload",
        currentBytes: 3000,
        currentTimestampMilliseconds: 3000,
        previousSample: {
            bytes: 1000,
            timestampMilliseconds: 1000,
        },
    });

    assert.deepEqual(networkRate, {
        interfaceId: "en0",
        direction: "upload",
        currentBytes: 3000,
        previousBytes: 1000,
        bytesDelta: 2000,
        elapsedMilliseconds: 2000,
        bytesPerSecond: 1000,
        hadPreviousSample: true,
    });
});

test("network counter reset clamps negative rates to zero", () => {
    const rateCalculation = calculateNetworkRate({
        interfaceId: "en0",
        direction: "download",
        currentBytes: 100,
        currentTimestampMilliseconds: 3000,
        previousSample: {
            bytes: 1000,
            timestampMilliseconds: 1000,
        },
    });

    assert.equal(rateCalculation.bytesDelta, -900);
    assert.equal(rateCalculation.bytesPerSecond, 0);
});

test("usable network interfaces exclude internal virtual down and unnamed interfaces", () => {
    assert.equal(isUsableNetworkInterface(buildNetworkInterface()), true);
    assert.equal(isUsableNetworkInterface(buildNetworkInterface({ internal: true })), false);
    assert.equal(isUsableNetworkInterface(buildNetworkInterface({ virtual: true })), false);
    assert.equal(isUsableNetworkInterface(buildNetworkInterface({ operstate: "down" })), false);
    assert.equal(isUsableNetworkInterface(buildNetworkInterface({ iface: "" })), false);
});

test("usable network interfaces exclude macOS system interfaces", () => {
    const normalMacInterfaceIsUsable = isUsableNetworkInterface(buildNetworkInterface({
        iface: "en0",
        ifaceName: "en0",
        type: "wireless",
        speed: 168.7,
    }), "darwin");
    const awdlInterfaceIsUsable = isUsableNetworkInterface(buildNetworkInterface({ iface: "awdl0", ifaceName: "awdl0" }), "darwin");
    const llwInterfaceIsUsable = isUsableNetworkInterface(buildNetworkInterface({ iface: "llw0", ifaceName: "llw0" }), "darwin");
    const utunInterfaceIsUsable = isUsableNetworkInterface(buildNetworkInterface({ iface: "utun4", ifaceName: "utun4" }), "darwin");
    const bridgeMacInterfaceIsUsable = isUsableNetworkInterface(buildNetworkInterface({ iface: "bridge0", ifaceName: "bridge0" }), "darwin");
    const apInterfaceIsUsable = isUsableNetworkInterface(buildNetworkInterface({ iface: "ap1", ifaceName: "ap1" }), "darwin");
    const en0IsSystemInterface = isSystemNetworkInterface("en0", "darwin");
    const awdlIsSystemInterface = isSystemNetworkInterface("awdl0", "darwin");
    const bridgeIsWindowsSystemInterface = isSystemNetworkInterface("bridge0", "win32");
    const bridgeWindowsInterfaceIsUsable = isUsableNetworkInterface(
        buildNetworkInterface({ iface: "bridge0", ifaceName: "bridge0" }),
        "win32",
    );

    assert.equal(normalMacInterfaceIsUsable, true);
    assert.equal(awdlInterfaceIsUsable, false);
    assert.equal(llwInterfaceIsUsable, false);
    assert.equal(utunInterfaceIsUsable, false);
    assert.equal(bridgeMacInterfaceIsUsable, false);
    assert.equal(apInterfaceIsUsable, false);
    assert.equal(en0IsSystemInterface, false);
    assert.equal(awdlIsSystemInterface, true);
    assert.equal(bridgeIsWindowsSystemInterface, false);
    assert.equal(bridgeWindowsInterfaceIsUsable, true);
});

test("network interface options normalize display fields and speed", () => {
    const networkInterfaceOption = toNetworkInterfaceOption(buildNetworkInterface({
        iface: "en0",
        ifaceName: "Wi-Fi",
        type: "wireless",
        default: true,
        speed: 1200,
    }));
    const unknownInterfaceType = normalizeNetworkInterfaceType("loopback");

    assert.deepEqual(networkInterfaceOption, {
        id: "en0",
        name: "Wi-Fi",
        type: "wireless",
        isDefault: true,
        speedMegabitsPerSecond: 1200,
    });
    assert.equal(unknownInterfaceType, "unknown");
});

test("nvidia-smi numeric and text parsing handles normal values and N/A", () => {
    assert.equal(parseNvidiaSmiNumber("42"), 42);
    assert.equal(parseNvidiaSmiNumber("N/A"), undefined);
    assert.equal(parseNvidiaSmiNumber("not-a-number"), undefined);
    assert.equal(normalizeNonEmptyText(" RTX 4090 "), "RTX 4090");
    assert.equal(normalizeNonEmptyText("N/A"), undefined);
});

test("nvidia-smi telemetry line maps all supported fields", () => {
    const telemetryData = parseNvidiaSmiTelemetryLine("87, NVIDIA RTX 4090, 68, 12000, 24576, 310.5, 450");

    assert.deepEqual(telemetryData, {
        utilizationGpu: 87,
        modelText: "NVIDIA RTX 4090",
        temperatureGpu: 68,
        memoryUsed: 12000,
        memoryTotal: 24576,
        powerDraw: 310.5,
        powerLimit: 450,
    });
});

test("nvidia-smi telemetry line returns null when every field is absent", () => {
    const telemetryData = parseNvidiaSmiTelemetryLine("N/A, N/A, N/A, N/A, N/A, N/A, N/A");

    assert.equal(telemetryData, null);
});

test("IOAccelerator performance statistics parse GPU device utilization", () => {
    const telemetryData = parseIoAcceleratorPerformanceStatistics(`
+-o AGXAcceleratorG13X  <class AGXAcceleratorG13X>
    {
      "PerformanceStatistics" = {"Renderer Utilization %"=11,"Device Utilization %"=42,"Tiler Utilization %"=7}
      "model" = "Apple M1 Pro"
    }
`);

    assert.deepEqual(telemetryData, {
        utilizationGpu: 42,
    });
});

test("IOAccelerator performance statistics use the highest valid device utilization", () => {
    const telemetryData = parseIoAcceleratorPerformanceStatistics(`
      "PerformanceStatistics" = {"Device Utilization %"=18}
      "PerformanceStatistics" = {"Device Utilization %"=75}
      "PerformanceStatistics" = {"Device Utilization %"=101}
`);

    assert.deepEqual(telemetryData, {
        utilizationGpu: 75,
    });
});

test("IOAccelerator performance statistics fall back to GPU activity", () => {
    const telemetryData = parseIoAcceleratorPerformanceStatistics(`
      "PerformanceStatistics" = {"GPU Activity(%)"=38}
`);

    assert.deepEqual(telemetryData, {
        utilizationGpu: 38,
    });
});

test("IOAccelerator performance statistics return null when device utilization is absent", () => {
    const telemetryData = parseIoAcceleratorPerformanceStatistics(`
      "PerformanceStatistics" = {"Renderer Utilization %"=32,"Tiler Utilization %"=24}
`);

    assert.equal(telemetryData, null);
});

test("CPU model text combines manufacturer and brand while dropping empty parts", () => {
    const fullModelText = formatCpuModelText(buildCpuData({
        manufacturer: "AMD",
        brand: "Ryzen 9",
    }));
    const brandOnlyModelText = formatCpuModelText(buildCpuData({
        manufacturer: "",
        brand: "Ryzen 9",
    }));
    const absentModelText = formatCpuModelText(buildCpuData({
        manufacturer: "",
        brand: "",
    }));

    assert.equal(fullModelText, "AMD Ryzen 9");
    assert.equal(brandOnlyModelText, "Ryzen 9");
    assert.equal(absentModelText, null);
});

test("file system usability requires positive size, mount, and non-negative usage numbers", () => {
    assert.equal(isUsableFileSystem(buildFileSystem()), true);
    assert.equal(isUsableFileSystem(buildFileSystem({ size: 0 })), false);
    assert.equal(isUsableFileSystem(buildFileSystem({ mount: "" })), false);
    assert.equal(isUsableFileSystem(buildFileSystem({ available: -1 })), false);
    assert.equal(isUsableFileSystem(buildFileSystem({ used: -1 })), false);
    assert.equal(isUsableFileSystem(buildFileSystem({ mount: "/System/Volumes/Data" })), false);
    assert.equal(isUsableFileSystem(buildFileSystem({ mount: "/Volumes/media" })), true);
});

test("disk volume option maps file system block device and physical disk metadata", () => {
    const diskVolumeOption = toDiskVolumeOption(
        buildFileSystem({ fs: "C:", mount: "C:", size: 1000, used: 400, available: 600 }),
        [buildBlockDevice({
            name: "C:",
            mount: "C:",
            label: "System",
            physical: "Local",
            model: "SKHynix NVMe",
            size: "1000",
        })],
        [buildDiskLayout({ name: "SKHynix NVMe", type: "NVMe", size: 2000 })],
    );

    assert.deepEqual(diskVolumeOption, {
        id: "C:",
        fs: "C:",
        mount: "C:",
        sizeBytes: 1000,
        usedBytes: 400,
        availableBytes: 600,
        storageKind: "ssd",
        diskName: "SKHynix NVMe",
        volumeLabel: "System",
    });
});

test("disk volume option identifies macOS SMB volumes as network volumes", () => {
    const diskVolumeOption = toDiskVolumeOption(
        buildFileSystem({
            fs: "//shiori@fixture-server._smb._tcp.local/media",
            type: "HFS",
            mount: "/Volumes/media",
            size: 1000,
            used: 400,
            available: 600,
        }),
        [],
        [buildDiskLayout({
            device: "disk0",
            type: "NVMe",
            name: "Fixture Internal Disk",
        })],
    );
    const isNetwork = isNetworkFileSystem(buildFileSystem({ fs: "smb://fixture-server/media" }));

    assert.deepEqual(diskVolumeOption, {
        id: "/Volumes/media",
        fs: "//shiori@fixture-server._smb._tcp.local/media",
        mount: "/Volumes/media",
        sizeBytes: 1000,
        usedBytes: 400,
        availableBytes: 600,
        storageKind: "network",
        diskName: "//shiori@fixture-server._smb._tcp.local/media",
        volumeLabel: "",
    });
    assert.equal(isNetwork, true);
});

test("physical disk resolution prefers device match then matching disk name then size fallback", () => {
    const fileSystem = buildFileSystem({ size: 500 });
    const smallDisk = buildDiskLayout({ name: "Small", size: 400 });
    const largeDisk = buildDiskLayout({ name: "Large", size: 1000 });
    const deviceMatchedDisk = buildDiskLayout({
        device: "\\\\.\\PHYSICALDRIVE7",
        name: "Fixture Windows Disk",
        size: 4000,
    });

    const deviceResolvedDisk = resolvePhysicalDisk(
        fileSystem,
        buildBlockDevice({
            device: "\\\\.\\PHYSICALDRIVE7",
            name: "C:",
            model: "",
            physical: "Local",
        }),
        [smallDisk, deviceMatchedDisk],
    );
    const nameResolvedDisk = resolvePhysicalDisk(
        fileSystem,
        buildBlockDevice({
            device: "/dev/disk0",
            name: "/dev/disk3s1s1",
            physical: "SSD",
        }),
        [buildDiskLayout({
            device: "disk0",
            type: "NVMe",
            name: "Fixture Internal Disk",
            size: 500277792768,
        })],
    );
    const sizeResolvedDisk = resolvePhysicalDisk(
        fileSystem,
        buildBlockDevice({ device: "/dev/disk-large", name: "partition", model: "model" }),
        [smallDisk, largeDisk],
    );
    const fallbackResolvedDisk = resolvePhysicalDisk(fileSystem, undefined, [smallDisk, largeDisk]);

    assert.equal(deviceResolvedDisk, deviceMatchedDisk);
    assert.equal(nameResolvedDisk?.name, "Fixture Internal Disk");
    assert.equal(sizeResolvedDisk, largeDisk);
    assert.equal(fallbackResolvedDisk, largeDisk);
});

test("disk storage kind resolves local disk types and network block devices", () => {
    assert.equal(resolveDiskStorageKind(buildDiskLayout({ type: "NVMe" }), undefined), "ssd");
    assert.equal(resolveDiskStorageKind(buildDiskLayout({ type: "HD" }), undefined), "hdd");
    assert.equal(resolveDiskStorageKind(buildDiskLayout({ type: "USB" }), undefined), "unknown");
    assert.equal(resolveDiskStorageKind(undefined, buildBlockDevice({ physical: "Network" })), "network");
    assert.equal(isLocalBlockDevice(buildBlockDevice({ physical: "Network" })), false);
    assert.equal(isLocalBlockDevice(buildBlockDevice({ physical: "Local" })), true);
    assert.equal(isLocalBlockDevice(buildBlockDevice({ physical: "Removable" })), true);
    assert.equal(isLocalBlockDevice(buildBlockDevice({ physical: "SSD" })), true);
});

test("default disk volume prefers root mounts before first fallback", () => {
    const secondaryVolume = buildDiskVolume({ id: "secondary", mount: "D:\\Games" });
    const rootVolume = buildDiskVolume({ id: "root", mount: "C:" });

    assert.equal(resolveDefaultDiskVolume([secondaryVolume, rootVolume]), rootVolume);
    assert.equal(resolveDefaultDiskVolume([secondaryVolume]), secondaryVolume);
    assert.equal(resolveDefaultDiskVolume([]), null);
});

test("numeric helpers normalize percentages finite rates and positive values", () => {
    assert.equal(calculatePercent(25, 100), 25);
    assert.equal(calculatePercent(25, 0), 0);
    assert.equal(normalizeNullableRate(12), 12);
    assert.equal(normalizeNullableRate(-12), 0);
    assert.equal(normalizeNullableRate(null), 0);
    assert.equal(isFinitePositiveNumber(1), true);
    assert.equal(isFinitePositiveNumber(0), false);
});

function assertMetricGroups(
    actualMetricGroups: Set<NodeSystemMetricGroup>,
    expectedMetricGroups: readonly NodeSystemMetricGroup[],
): void {
    assert.deepEqual([...actualMetricGroups].sort(), [...expectedMetricGroups].sort());
}

function assertSnapshotMetrics(snapshot: MetricSnapshot): Record<string, PlainMetricValue> {
    return Object.fromEntries(
        Object.entries(snapshot.metrics).map(([key, value]) => [key, toPlainMetricValue(value)]),
    );
}

function toPlainMetricValue(value: MetricValue): PlainMetricValue {
    return {
        ...(value.value.case === "scalar" ? { scalar: value.value.value } : {}),
        ...(value.value.case === "text" ? { text: value.value.value } : {}),
        ...(value.unit === MetricUnit.UNSPECIFIED ? {} : { unit: value.unit }),
    };
}

interface PlainMetricValue {
    scalar?: number;
    text?: string;
    unit?: MetricUnit;
}

interface NodeSystemSourceCallCounts {
    currentLoad: number;
    cpu: number;
    mem: number;
    fsSize: number;
    blockDevices: number;
    diskLayout: number;
    fsStats: number;
    networkInterfaces: number;
    networkStats: number;
    graphics: number;
    windowsGpu: number;
    darwinGpu: number;
    systemGpu: number;
}

function buildCallCounts(): NodeSystemSourceCallCounts {
    return {
        currentLoad: 0,
        cpu: 0,
        mem: 0,
        fsSize: 0,
        blockDevices: 0,
        diskLayout: 0,
        fsStats: 0,
        networkInterfaces: 0,
        networkStats: 0,
        graphics: 0,
        windowsGpu: 0,
        darwinGpu: 0,
        systemGpu: 0,
    };
}

function buildCountingSystemInformation(
    callCounts: NodeSystemSourceCallCounts,
    overrides: Partial<NodeSystemInformationClient> = {},
): NodeSystemInformationClient {
    return {
        currentLoad: async () => {
            callCounts.currentLoad += 1;
            return { currentLoad: 0 } as Systeminformation.CurrentLoadData;
        },
        cpu: async () => {
            callCounts.cpu += 1;
            return buildCpuData({});
        },
        mem: async () => {
            callCounts.mem += 1;
            return { used: 0, total: 0 } as Systeminformation.MemData;
        },
        fsSize: async () => {
            callCounts.fsSize += 1;
            return [];
        },
        blockDevices: async () => {
            callCounts.blockDevices += 1;
            return [];
        },
        diskLayout: async () => {
            callCounts.diskLayout += 1;
            return [];
        },
        fsStats: async () => {
            callCounts.fsStats += 1;
            return { rx_sec: 0, wx_sec: 0, tx_sec: 0 } as Systeminformation.FsStatsData;
        },
        networkInterfaces: async () => {
            callCounts.networkInterfaces += 1;
            return [];
        },
        networkStats: async () => {
            callCounts.networkStats += 1;
            return [];
        },
        graphics: async () => {
            callCounts.graphics += 1;
            return { controllers: [], displays: [] } as Systeminformation.GraphicsData;
        },
        ...overrides,
    } as NodeSystemInformationClient;
}

function buildNoGpuPoller(
    callCounts: NodeSystemSourceCallCounts,
): () => Promise<NodeSystemGpuTelemetryData | null> {
    return async () => {
        callCounts.windowsGpu += 1;
        return null;
    };
}

function buildNoDarwinGpuPoller(
    callCounts: NodeSystemSourceCallCounts,
): () => Promise<NodeSystemGpuTelemetryData | null> {
    return async () => {
        callCounts.darwinGpu += 1;
        return null;
    };
}

async function waitForQueuedCpuInformationPoll(): Promise<void> {
    await new Promise<void>(resolve => {
        setImmediate(resolve);
    });
}

function buildNoSystemGpuPoller(
    callCounts: NodeSystemSourceCallCounts,
): (systemInformation: NodeSystemInformationClient) => Promise<NodeSystemGpuTelemetryData | null> {
    return async () => {
        callCounts.systemGpu += 1;
        return null;
    };
}

function buildCpuData(overrides: Partial<Systeminformation.CpuData>): Systeminformation.CpuData {
    return {
        manufacturer: "",
        brand: "",
        vendor: "",
        family: "",
        model: "",
        stepping: "",
        revision: "",
        voltage: "",
        speed: 0,
        speedMin: 0,
        speedMax: 0,
        governor: "",
        cores: 0,
        physicalCores: 0,
        performanceCores: 0,
        efficiencyCores: 0,
        processors: 0,
        socket: "",
        flags: "",
        virtualization: false,
        cache: {},
        ...overrides,
    } as Systeminformation.CpuData;
}

function buildFileSystem(overrides: Partial<Systeminformation.FsSizeData> = {}): Systeminformation.FsSizeData {
    return {
        fs: "/dev/disk1s1",
        type: "apfs",
        size: 1000,
        used: 400,
        available: 600,
        use: 40,
        mount: "/",
        rw: true,
        ...overrides,
    } as Systeminformation.FsSizeData;
}

type BlockDeviceTestOverrides =
    Partial<Omit<Systeminformation.BlockDevicesData, "size">>
    & { size?: number | string };

function buildBlockDevice(overrides: BlockDeviceTestOverrides = {}): Systeminformation.BlockDevicesData {
    return {
        name: "disk1",
        type: "disk",
        fsType: "",
        mount: "/",
        size: 1000,
        physical: "local",
        uuid: "",
        label: "",
        model: "Example Disk",
        serial: "",
        removable: false,
        protocol: "",
        group: "",
        device: "/dev/disk1",
        ...overrides,
    } as Systeminformation.BlockDevicesData;
}

function buildDiskLayout(overrides: Partial<Systeminformation.DiskLayoutData> = {}): Systeminformation.DiskLayoutData {
    return {
        device: "/dev/disk1",
        type: "SSD",
        name: "Example Disk",
        vendor: "",
        size: 1000,
        bytesPerSector: 512,
        totalCylinders: 0,
        totalHeads: 0,
        totalSectors: 0,
        totalTracks: 0,
        tracksPerCylinder: 0,
        sectorsPerTrack: 0,
        firmwareRevision: "",
        serialNum: "",
        interfaceType: "",
        smartStatus: "",
        temperature: null,
        ...overrides,
    } as Systeminformation.DiskLayoutData;
}

function buildDiskVolume(overrides: Partial<DiskVolumeOption>): DiskVolumeOption {
    return {
        id: "volume",
        fs: "C:",
        mount: "C:\\",
        sizeBytes: 1000,
        usedBytes: 400,
        availableBytes: 600,
        storageKind: "ssd",
        diskName: "Example Disk",
        volumeLabel: "",
        ...overrides,
    };
}
