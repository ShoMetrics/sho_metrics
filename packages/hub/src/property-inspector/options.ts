import type { OptionProviderId, SelectOption, VisibilityContext } from "./schema";
import type { SettingValue } from "./settings";

interface NetworkInterfaceOption {
    [key: string]: SettingValue;
    id: string;
    name: string;
    type: string;
    isDefault?: boolean;
    speedMegabitsPerSecond?: number;
}

interface DiskVolumeOption {
    [key: string]: SettingValue;
    id: string;
    fs: string;
    mount: string;
    storageKind: string;
    diskName: string;
    volumeLabel?: string;
    sizeBytes: number;
}

export function resolveFieldOptions(providerId: OptionProviderId, context: VisibilityContext): SelectOption[] {
    if (providerId === "networkInterfaces") {
        return buildNetworkInterfaceOptions(context.settings.availableNetworkInterfaces);
    }

    return buildDiskVolumeOptions(context.settings.availableDiskVolumes);
}

function buildNetworkInterfaceOptions(value: SettingValue): SelectOption[] {
    return [
        { value: "", label: "Automatic" },
        ...parseNetworkInterfaceOptions(value).map((networkInterface) => {
            const speedLabel = networkInterface.speedMegabitsPerSecond
                ? `, ${networkInterface.speedMegabitsPerSecond} Mbps`
                : "";
            const defaultLabel = networkInterface.isDefault ? "default, " : "";
            const typeLabel = networkInterface.type === "unknown" ? "" : `${networkInterface.type}, `;

            return {
                value: networkInterface.id,
                label: `${networkInterface.name} (${defaultLabel}${typeLabel}${networkInterface.id}${speedLabel})`,
            };
        }),
    ];
}

function buildDiskVolumeOptions(value: SettingValue): SelectOption[] {
    return [
        { value: "", label: "Automatic" },
        ...parseDiskVolumeOptions(value).map((diskVolume) => ({
            value: diskVolume.id,
            label: formatDiskVolumeOptionLabel(diskVolume),
        })),
    ];
}

function parseNetworkInterfaceOptions(value: SettingValue): NetworkInterfaceOption[] {
    return parseJsonArray(value).filter(isNetworkInterfaceOption);
}

function parseDiskVolumeOptions(value: SettingValue): DiskVolumeOption[] {
    return parseJsonArray(value).filter(isDiskVolumeOption);
}

export function resolveSelectedDiskVolumeLabel(context: VisibilityContext): string {
    const diskVolume = resolveSelectedDiskVolume(context);
    const volumeLabel = diskVolume?.volumeLabel?.trim();

    return volumeLabel && volumeLabel.length > 0 ? volumeLabel : "-";
}

export function resolveDiskAutoLinearLabel(context: VisibilityContext): string {
    const diskVolume = resolveSelectedDiskVolume(context);

    if (!diskVolume) {
        return "Auto";
    }

    return `Auto: ${resolveCompactDiskStorageLabel(diskVolume)} (${formatDiskVolumeDisplayLabel(diskVolume)})`;
}

function resolveSelectedDiskVolume(context: VisibilityContext): DiskVolumeOption | null {
    const diskVolumes = parseDiskVolumeOptions(context.settings.availableDiskVolumes);
    const selectedDiskVolumeId = context.settings.diskVolumeId;

    if (typeof selectedDiskVolumeId === "string" && selectedDiskVolumeId.length > 0) {
        return diskVolumes.find(diskVolume => diskVolume.id === selectedDiskVolumeId) ?? null;
    }

    return diskVolumes.find(diskVolume => diskVolume.mount === "/" || /^[A-Z]:\\?$/i.test(diskVolume.mount))
        ?? diskVolumes[0]
        ?? null;
}

function parseJsonArray(value: SettingValue): Record<string, SettingValue>[] {
    if (typeof value !== "string") {
        return [];
    }

    try {
        const parsedValue = JSON.parse(value) as SettingValue | Record<string, SettingValue>[];

        return Array.isArray(parsedValue)
            ? parsedValue.filter(isRecord)
            : [];
    } catch {
        return [];
    }
}

function isNetworkInterfaceOption(value: Record<string, SettingValue>): value is NetworkInterfaceOption {
    return typeof value.id === "string"
        && typeof value.name === "string"
        && typeof value.type === "string";
}

function isDiskVolumeOption(value: Record<string, SettingValue>): value is DiskVolumeOption {
    return typeof value.id === "string"
        && typeof value.fs === "string"
        && typeof value.mount === "string"
        && typeof value.storageKind === "string"
        && typeof value.diskName === "string"
        && typeof value.sizeBytes === "number";
}

function formatDiskVolumeDisplayLabel(diskVolume: DiskVolumeOption): string {
    const mountLabel = diskVolume.mount || diskVolume.fs || "DISK";

    if (/^[A-Z]:\\?$/i.test(mountLabel)) {
        return mountLabel.slice(0, 2).toUpperCase();
    }

    return mountLabel.slice(0, 4).toUpperCase();
}

function formatDiskVolumeOptionLabel(diskVolume: DiskVolumeOption): string {
    const volumeLabel = diskVolume.volumeLabel?.trim();
    const labelText = volumeLabel && volumeLabel.length > 0
        ? `, ${volumeLabel}`
        : "";

    return `${formatDiskVolumeSelectionLabel(diskVolume)} (${formatByteCount(diskVolume.sizeBytes)}${labelText})`;
}

function formatDiskVolumeSelectionLabel(diskVolume: DiskVolumeOption): string {
    const mountLabel = diskVolume.mount || diskVolume.fs || "Disk";
    const windowsDriveMatch = /^([A-Z]):\\?$/i.exec(mountLabel);

    if (windowsDriveMatch) {
        return `${windowsDriveMatch[1].toUpperCase()}:`;
    }

    if (mountLabel === "/") {
        return "/";
    }

    const pathParts = mountLabel.split(/[\\/]/).filter(pathPart => pathPart.length > 0);

    return pathParts.length > 0
        ? `/${pathParts[pathParts.length - 1]}`
        : mountLabel;
}

function resolveCompactDiskStorageLabel(diskVolume: DiskVolumeOption): string {
    if (diskVolume.storageKind === "ssd") {
        return "SSD";
    }

    if (diskVolume.storageKind === "hdd") {
        return "HDD";
    }

    if (diskVolume.storageKind === "network") {
        return "NET";
    }

    return "DSK";
}

function isRecord(value: SettingValue | Record<string, SettingValue>): value is Record<string, SettingValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatByteCount(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let displayValue = Math.max(0, Number(bytes));
    let unitIndex = 0;

    while (displayValue >= 1024 && unitIndex < units.length - 1) {
        displayValue /= 1024;
        unitIndex += 1;
    }

    return `${displayValue >= 10 ? displayValue.toFixed(0) : displayValue.toFixed(1)} ${units[unitIndex]}`;
}
