import type { Systeminformation } from "systeminformation";
import { type DiskStorageKind, type DiskVolumeOption } from "../../disk-volumes";

export function isUsableFileSystem(fileSystem: Systeminformation.FsSizeData): boolean {
    return fileSystem.size > 0
        && fileSystem.mount.length > 0
        && isUserFacingFileSystemMount(fileSystem.mount)
        && fileSystem.available >= 0
        && fileSystem.used >= 0;
}

export function toDiskVolumeOption(
    fileSystem: Systeminformation.FsSizeData,
    blockDevices: readonly Systeminformation.BlockDevicesData[],
    diskLayout: readonly Systeminformation.DiskLayoutData[],
): DiskVolumeOption {
    const blockDevice = blockDevices.find(device => device.mount === fileSystem.mount || device.name === fileSystem.fs);
    const isNetworkVolume = isNetworkFileSystem(fileSystem);
    const physicalDisk = isNetworkVolume
        ? undefined
        : resolvePhysicalDisk(fileSystem, blockDevice, diskLayout);

    return {
        id: fileSystem.mount || fileSystem.fs,
        fs: fileSystem.fs,
        mount: fileSystem.mount,
        sizeBytes: fileSystem.size,
        usedBytes: fileSystem.used,
        availableBytes: fileSystem.available,
        storageKind: isNetworkVolume ? "network" : resolveDiskStorageKind(physicalDisk, blockDevice),
        diskName: physicalDisk?.name ?? blockDevice?.model ?? fileSystem.fs,
        volumeLabel: blockDevice?.label ?? "",
    };
}

export function resolvePhysicalDisk(
    fileSystem: Systeminformation.FsSizeData,
    blockDevice: Systeminformation.BlockDevicesData | undefined,
    diskLayout: readonly Systeminformation.DiskLayoutData[],
): Systeminformation.DiskLayoutData | undefined {
    if (blockDevice && !isLocalBlockDevice(blockDevice)) {
        return undefined;
    }

    if (diskLayout.length === 0) {
        return undefined;
    }

    const normalizedBlockDeviceText = blockDevice
        ? `${blockDevice.device ?? ""} ${blockDevice.name} ${blockDevice.model}`.toLowerCase()
        : "";
    const normalizedBlockDevicePath = normalizeDiskDevicePath(blockDevice?.device);
    const deviceMatchedDisk = diskLayout.find(disk =>
        normalizedBlockDevicePath
        && disk.device
        && normalizeDiskDevicePath(disk.device) === normalizedBlockDevicePath
    );

    if (deviceMatchedDisk) {
        return deviceMatchedDisk;
    }

    const matchingDisk = diskLayout.find(disk => {
        const normalizedDiskText = `${disk.device ?? ""} ${disk.name}`.toLowerCase();
        return normalizedDiskText.length > 0 && normalizedBlockDeviceText.includes(normalizedDiskText);
    });

    if (matchingDisk) {
        return matchingDisk;
    }

    if (diskLayout.length === 1) {
        return diskLayout[0];
    }

    return diskLayout
        .filter(disk => disk.size >= fileSystem.size)
        .sort((leftDisk, rightDisk) => leftDisk.size - rightDisk.size)[0]
        ?? diskLayout[0];
}

export function resolveDiskStorageKind(
    diskLayout: Systeminformation.DiskLayoutData | undefined,
    blockDevice: Systeminformation.BlockDevicesData | undefined,
): DiskStorageKind {
    if (blockDevice && !isLocalBlockDevice(blockDevice)) {
        return "network";
    }

    if (!diskLayout) {
        return "unknown";
    }

    const diskType = diskLayout.type.toLowerCase();

    if (diskType === "ssd" || diskType === "nvme" || diskType === "scm") {
        return "ssd";
    }

    if (diskType === "hd") {
        return "hdd";
    }

    return "unknown";
}

export function isLocalBlockDevice(blockDevice: Systeminformation.BlockDevicesData): boolean {
    const physicalKind = blockDevice.physical.toLowerCase();

    if (physicalKind === "network") {
        return false;
    }

    return true;
}

export function resolveDefaultDiskVolume(diskVolumes: readonly DiskVolumeOption[]): DiskVolumeOption | null {
    return diskVolumes.find(diskVolume => diskVolume.mount === "/" || /^[A-Z]:\\?$/i.test(diskVolume.mount))
        ?? diskVolumes[0]
        ?? null;
}

export function calculatePercent(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
}

export function normalizeNullableRate(value: number | null): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isNetworkFileSystem(fileSystem: Systeminformation.FsSizeData): boolean {
    return fileSystem.fs.startsWith("//")
        || fileSystem.fs.startsWith("smb://")
        || fileSystem.type.toLowerCase() === "smbfs";
}

function isUserFacingFileSystemMount(mount: string): boolean {
    if (mount === "/" || /^[A-Z]:\\?$/i.test(mount)) {
        return true;
    }

    if (mount.startsWith("/Volumes/")) {
        return true;
    }

    return !mount.startsWith("/System/Volumes/");
}

function normalizeDiskDevicePath(devicePath: string | undefined): string | null {
    if (!devicePath) {
        return null;
    }

    return devicePath
        .toLowerCase()
        .replace(/^\/dev\//, "")
        .replace(/^\\\\\.\\/, "");
}
