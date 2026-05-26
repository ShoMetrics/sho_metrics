export type DiskStorageKind = "ssd" | "hdd" | "network" | "unknown";

export interface DiskVolumeOption {
    id: string;
    fs: string;
    mount: string;
    sizeBytes: number;
    usedBytes: number;
    availableBytes: number;
    storageKind: DiskStorageKind;
    diskName: string;
    volumeLabel: string;
}

export const DARWIN_ROOT_DATA_VOLUME_MOUNT = "/System/Volumes/Data";

export function resolveDefaultDiskVolumeOption(diskVolumes: readonly DiskVolumeOption[]): DiskVolumeOption | null {
    return diskVolumes.find(diskVolume => diskVolume.mount === DARWIN_ROOT_DATA_VOLUME_MOUNT)
        ?? diskVolumes.find(diskVolume => diskVolume.mount === "/" || /^[A-Z]:\\?$/i.test(diskVolume.mount))
        ?? diskVolumes[0]
        ?? null;
}

class DiskVolumeRegistry {
    private options: DiskVolumeOption[] = [];

    update(options: readonly DiskVolumeOption[]): void {
        this.options = [...options];
    }

    getOptions(): readonly DiskVolumeOption[] {
        return this.options;
    }

    findById(id: string): DiskVolumeOption | null {
        return this.options.find(option => option.id === id) ?? null;
    }

    resolveDefaultSelection(): DiskVolumeOption | null {
        return resolveDefaultDiskVolumeOption(this.options);
    }
}

export const diskVolumeRegistry = new DiskVolumeRegistry();
