import type { DiskVolumeOption } from "../../runtime/disk-volumes";
import type { NetworkInterfaceOption } from "../../runtime/network-interfaces";
import type { SelectOption, VisibilityContext } from "../inspector/types";

export function resolveNetworkInterfaceOptions(context: VisibilityContext): SelectOption[] {
    return buildNetworkInterfaceOptions(context.runtimeCache.availableNetworkInterfaces);
}

export function resolveDiskVolumeOptions(
    context: VisibilityContext,
    selectedDiskVolumeId = "",
): SelectOption[] {
    return buildDiskVolumeOptions(context, selectedDiskVolumeId);
}

function buildNetworkInterfaceOptions(networkInterfaces: readonly NetworkInterfaceOption[]): SelectOption[] {
    return [
        { value: "", label: "Automatic" },
        ...networkInterfaces.map((networkInterface) => {
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

function buildDiskVolumeOptions(context: VisibilityContext, selectedDiskVolumeId: string): SelectOption[] {
    const diskVolumes = context.runtimeCache.availableDiskVolumes;
    const diskVolumeOptions = diskVolumes.map((diskVolume) => ({
        value: diskVolume.id,
        label: formatDiskVolumeOptionLabel(diskVolume),
    }));
    const hasSelectedDiskVolume = selectedDiskVolumeId.length > 0
        && diskVolumeOptions.some(option => option.value === selectedDiskVolumeId);

    if (selectedDiskVolumeId.length > 0 && !hasSelectedDiskVolume) {
        diskVolumeOptions.unshift({
            value: selectedDiskVolumeId,
            label: `${formatDiskVolumeSelectionText(selectedDiskVolumeId)} (Unavailable)`,
        });
    }

    if (diskVolumeOptions.length > 0) {
        return diskVolumeOptions;
    }

    let volumeOptionLabel: string;
    switch (context.runtimeCacheStatus.diskVolumeOptionsStatus) {
        case "pending":
            volumeOptionLabel = "Loading volumes...";
            break;
        case "failed":
            volumeOptionLabel = "Volumes unavailable";
            break;
        case "ready":
            volumeOptionLabel = "No detected volumes";
            break;
    }

    return [{
        value: "",
        label: volumeOptionLabel,
        disabled: true,
    }];
}

export function resolveSelectedDiskVolumeLabel(context: VisibilityContext): string {
    const diskVolume = resolveSelectedDiskVolume(context);
    const volumeLabel = diskVolume?.volumeLabel?.trim();

    return volumeLabel && volumeLabel.length > 0 ? volumeLabel : "-";
}

export function resolveDiskLinearLabelPlaceholder(context: VisibilityContext): string {
    const diskVolume = resolveSelectedDiskVolume(context);

    if (!diskVolume) {
        return "Auto";
    }

    return `Auto: ${resolveCompactDiskStorageLabel(diskVolume)} (${formatDiskVolumeDisplayLabel(diskVolume)})`;
}

export function resolveSelectedDiskVolume(context: VisibilityContext): DiskVolumeOption | null {
    const diskVolumes = context.runtimeCache.availableDiskVolumes;
    const target = context.resolved.widget.slot.metric.target;
    const selectedDiskVolumeId = target.domain === "disk"
        ? target.volumeId ?? ""
        : "";

    if (selectedDiskVolumeId.length > 0) {
        return diskVolumes.find(diskVolume => diskVolume.id === selectedDiskVolumeId) ?? null;
    }

    return diskVolumes.find(diskVolume => diskVolume.mount === "/" || /^[A-Z]:\\?$/i.test(diskVolume.mount))
        ?? diskVolumes[0]
        ?? null;
}

function formatDiskVolumeDisplayLabel(diskVolume: DiskVolumeOption): string {
    const mountLabel = diskVolume.mount || diskVolume.fs || "DISK";

    if (/^[A-Z]:\\?$/i.test(mountLabel)) {
        return mountLabel.slice(0, 2).toUpperCase();
    }

    const pathParts = mountLabel.split(/[\\/]/).filter(pathPart => pathPart.length > 0);

    if (pathParts.length > 0) {
        return pathParts[pathParts.length - 1].slice(0, 4).toUpperCase();
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

    return formatDiskVolumeSelectionText(mountLabel);
}

function formatDiskVolumeSelectionText(value: string): string {
    const mountLabel = value.trim();
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

function formatByteCount(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let displayValue = Math.max(0, bytes);
    let unitIndex = 0;

    while (displayValue >= 1024 && unitIndex < units.length - 1) {
        displayValue /= 1024;
        unitIndex += 1;
    }

    return `${displayValue >= 10 ? displayValue.toFixed(0) : displayValue.toFixed(1)} ${units[unitIndex]}`;
}
