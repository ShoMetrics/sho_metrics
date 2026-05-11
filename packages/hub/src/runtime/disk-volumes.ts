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
        return this.options.find(option => option.mount === "/" || /^[A-Z]:\\?$/i.test(option.mount))
            ?? this.options[0]
            ?? null;
    }
}

export const diskVolumeRegistry = new DiskVolumeRegistry();
