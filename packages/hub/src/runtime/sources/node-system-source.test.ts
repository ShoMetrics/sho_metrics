import assert from "node:assert/strict";
import test from "node:test";
import type { Systeminformation } from "systeminformation";
import {
    formatCpuModelText,
    isFinitePositiveNumber,
    normalizeNonEmptyText,
} from "./node-system-cpu";
import {
    calculatePercent,
    isLocalBlockDevice,
    isUsableFileSystem,
    normalizeNullableRate,
    resolveDefaultDiskVolume,
    resolveDiskStorageKind,
    resolvePhysicalDisk,
    toDiskVolumeOption,
} from "./node-system-disk";
import {
    parseNvidiaSmiNumber,
    parseNvidiaSmiTelemetryLine,
} from "./node-system-gpu";
import {
    calculateNetworkRate,
    isUsableNetworkInterface,
    normalizeNetworkInterfaceType,
    toNetworkInterfaceOption,
} from "./node-system-network";
import {
    resolveMetricGroups,
} from "./node-system-source";
import type { NodeSystemMetricGroup } from "./node-system-source-types";
import type { DiskVolumeOption } from "../disk-volumes";

test("metric groups resolve all groups when no metric keys are requested", () => {
    assertMetricGroups(resolveMetricGroups([]), ["cpu", "disk", "gpu", "memory", "network"]);
});

test("metric groups resolve only requested key prefixes", () => {
    assertMetricGroups(resolveMetricGroups([
        "net.down",
        "cpu.usage_percent",
        "gpu.temp",
        "unknown.metric",
    ]), ["cpu", "gpu", "network"]);
});

test("first network counter sample produces a zero rate", () => {
    assert.deepEqual(calculateNetworkRate({
        interfaceId: "en0",
        direction: "download",
        currentBytes: 1000,
        currentTimestampMilliseconds: 2000,
        previousSample: undefined,
    }), {
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
    assert.deepEqual(calculateNetworkRate({
        interfaceId: "en0",
        direction: "upload",
        currentBytes: 3000,
        currentTimestampMilliseconds: 3000,
        previousSample: {
            bytes: 1000,
            timestampMilliseconds: 1000,
        },
    }), {
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

test("network interface options normalize display fields and speed", () => {
    assert.deepEqual(toNetworkInterfaceOption(buildNetworkInterface({
        iface: "en0",
        ifaceName: "Wi-Fi",
        type: "wireless",
        default: true,
        speed: 1200,
    })), {
        id: "en0",
        name: "Wi-Fi",
        type: "wireless",
        isDefault: true,
        speedMegabitsPerSecond: 1200,
    });
    assert.equal(normalizeNetworkInterfaceType("loopback"), "unknown");
});

test("nvidia-smi numeric and text parsing handles normal values and N/A", () => {
    assert.equal(parseNvidiaSmiNumber("42"), 42);
    assert.equal(parseNvidiaSmiNumber("N/A"), undefined);
    assert.equal(parseNvidiaSmiNumber("not-a-number"), undefined);
    assert.equal(normalizeNonEmptyText(" RTX 4090 "), "RTX 4090");
    assert.equal(normalizeNonEmptyText("N/A"), undefined);
});

test("nvidia-smi telemetry line maps all supported fields", () => {
    assert.deepEqual(parseNvidiaSmiTelemetryLine("87, NVIDIA RTX 4090, 68, 12000, 24576, 310.5, 450"), {
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
    assert.equal(parseNvidiaSmiTelemetryLine("N/A, N/A, N/A, N/A, N/A, N/A, N/A"), null);
});

test("CPU model text combines manufacturer and brand while dropping empty parts", () => {
    assert.equal(formatCpuModelText(buildCpuData({
        manufacturer: "AMD",
        brand: "Ryzen 9",
    })), "AMD Ryzen 9");
    assert.equal(formatCpuModelText(buildCpuData({
        manufacturer: "",
        brand: "Ryzen 9",
    })), "Ryzen 9");
    assert.equal(formatCpuModelText(buildCpuData({
        manufacturer: "",
        brand: "",
    })), null);
});

test("file system usability requires positive size, mount, and non-negative usage numbers", () => {
    assert.equal(isUsableFileSystem(buildFileSystem()), true);
    assert.equal(isUsableFileSystem(buildFileSystem({ size: 0 })), false);
    assert.equal(isUsableFileSystem(buildFileSystem({ mount: "" })), false);
    assert.equal(isUsableFileSystem(buildFileSystem({ available: -1 })), false);
    assert.equal(isUsableFileSystem(buildFileSystem({ used: -1 })), false);
});

test("disk volume option maps file system block device and physical disk metadata", () => {
    assert.deepEqual(toDiskVolumeOption(
        buildFileSystem({ fs: "C:", mount: "C:\\", size: 1000, used: 400, available: 600 }),
        [buildBlockDevice({ name: "C:", mount: "C:\\", label: "System", physical: "local", model: "Samsung 990" })],
        [buildDiskLayout({ name: "Samsung 990", type: "NVMe", size: 2000 })],
    ), {
        id: "C:\\",
        fs: "C:",
        mount: "C:\\",
        sizeBytes: 1000,
        usedBytes: 400,
        availableBytes: 600,
        storageKind: "ssd",
        diskName: "Samsung 990",
        volumeLabel: "System",
    });
});

test("physical disk resolution prefers a matching disk name then size fallback", () => {
    const fileSystem = buildFileSystem({ size: 500 });
    const smallDisk = buildDiskLayout({ name: "Small", size: 400 });
    const largeDisk = buildDiskLayout({ name: "Large", size: 1000 });

    assert.equal(resolvePhysicalDisk(
        fileSystem,
        buildBlockDevice({ device: "/dev/disk-large", name: "partition", model: "model" }),
        [smallDisk, largeDisk],
    ), largeDisk);
    assert.equal(resolvePhysicalDisk(fileSystem, undefined, [smallDisk, largeDisk]), largeDisk);
});

test("disk storage kind resolves local disk types and network block devices", () => {
    assert.equal(resolveDiskStorageKind(buildDiskLayout({ type: "NVMe" }), undefined), "ssd");
    assert.equal(resolveDiskStorageKind(buildDiskLayout({ type: "HD" }), undefined), "hdd");
    assert.equal(resolveDiskStorageKind(buildDiskLayout({ type: "USB" }), undefined), "unknown");
    assert.equal(resolveDiskStorageKind(undefined, buildBlockDevice({ physical: "network" })), "network");
    assert.equal(isLocalBlockDevice(buildBlockDevice({ physical: "network" })), false);
});

test("default disk volume prefers root mounts before first fallback", () => {
    const secondaryVolume = buildDiskVolume({ id: "secondary", mount: "D:\\Games" });
    const rootVolume = buildDiskVolume({ id: "root", mount: "C:\\" });

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

function buildNetworkInterface(
    overrides: Partial<Systeminformation.NetworkInterfacesData> = {},
): Systeminformation.NetworkInterfacesData {
    return {
        iface: "en0",
        ifaceName: "Ethernet",
        default: false,
        ip4: "",
        ip4subnet: "",
        ip6: "",
        ip6subnet: "",
        mac: "",
        internal: false,
        virtual: false,
        operstate: "up",
        type: "wired",
        duplex: "",
        mtu: 1500,
        speed: null,
        dhcp: false,
        dnsSuffix: "",
        ieee8021xAuth: "",
        ieee8021xState: "",
        carrierChanges: 0,
        ...overrides,
    } as Systeminformation.NetworkInterfacesData;
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

function buildBlockDevice(overrides: Partial<Systeminformation.BlockDevicesData> = {}): Systeminformation.BlockDevicesData {
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
