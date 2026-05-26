import type { Systeminformation } from "systeminformation";
import {
    DARWIN_ROOT_DATA_VOLUME_MOUNT,
    resolveDefaultDiskVolumeOption,
    type DiskStorageKind,
    type DiskVolumeOption,
} from "../../disk-volumes";

export function isUsableFileSystem(fileSystem: Systeminformation.FsSizeData): boolean {
    return fileSystem.size > 0
        && fileSystem.mount.length > 0
        && fileSystem.available >= 0
        && fileSystem.used >= 0;
}

export function filterUsableFileSystems(
    fileSystems: readonly Systeminformation.FsSizeData[],
    platform: NodeJS.Platform,
): Systeminformation.FsSizeData[] {
    const hasDarwinRootDataVolume = platform === "darwin"
        && fileSystems.some(fileSystem =>
            fileSystem.mount === DARWIN_ROOT_DATA_VOLUME_MOUNT && isUsableFileSystem(fileSystem)
        );

    return fileSystems.filter(fileSystem =>
        isUsableFileSystem(fileSystem)
        && isUserFacingFileSystemMount(fileSystem.mount, {
            hasDarwinRootDataVolume,
            platform,
        })
    );
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
        usedBytes: calculateDiskUsedBytes(fileSystem.size, fileSystem.available),
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
    return resolveDefaultDiskVolumeOption(diskVolumes);
}

export function calculatePercent(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
}

export function calculateDiskUsedBytes(totalBytes: number, availableBytes: number): number {
    // Capacity usage follows filesystem free-space semantics instead of allocated-block usage.
    return Math.max(totalBytes - availableBytes, 0);
}

export function normalizeNullableRate(value: number | null): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isNetworkFileSystem(fileSystem: Systeminformation.FsSizeData): boolean {
    return fileSystem.fs.startsWith("//")
        || fileSystem.fs.startsWith("smb://")
        || fileSystem.type.toLowerCase() === "smbfs";
}

interface UserFacingFileSystemMountOptions {
    readonly platform: NodeJS.Platform;
    readonly hasDarwinRootDataVolume: boolean;
}

function isUserFacingFileSystemMount(mount: string, options: UserFacingFileSystemMountOptions): boolean {
    if (options.platform === "darwin") {
        return isUserFacingDarwinFileSystemMount(mount, options.hasDarwinRootDataVolume);
    }

    if (mount === "/" || /^[A-Z]:\\?$/i.test(mount)) {
        return true;
    }

    if (mount.startsWith("/Volumes/")) {
        return true;
    }

    return !mount.startsWith("/System/Volumes/");
}

function isUserFacingDarwinFileSystemMount(mount: string, hasRootDataVolume: boolean): boolean {
    if (mount === DARWIN_ROOT_DATA_VOLUME_MOUNT) {
        return true;
    }

    if (mount === "/") {
        return !hasRootDataVolume;
    }

    return mount.startsWith("/Volumes/");
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
