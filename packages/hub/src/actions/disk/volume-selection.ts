import type { DiskVolumeOption } from "../../runtime/disk-volumes";

// Carries a disk volume after registry lookup while preserving an explicit
// saved volume id that is currently unavailable.
export type DiskVolumeSelection =
    | { readonly kind: "available"; readonly volume: DiskVolumeOption }
    | { readonly kind: "unavailable"; readonly volumeId: string }
    | { readonly kind: "none" };

export function resolveAvailableDiskVolume(selection: DiskVolumeSelection): DiskVolumeOption | null {
    return selection.kind === "available" ? selection.volume : null;
}

export function resolveDiskVolumeSelectionId(selection: DiskVolumeSelection): string | null {
    if (selection.kind === "available") {
        return selection.volume.id;
    }

    if (selection.kind === "unavailable") {
        return selection.volumeId;
    }

    return null;
}

export function formatCompactDiskVolumeLabel(selection: DiskVolumeSelection): string {
    if (selection.kind === "available") {
        return formatCompactDiskVolumeText(selection.volume.mount || selection.volume.fs || "DISK");
    }

    if (selection.kind === "unavailable") {
        return formatCompactDiskVolumeText(selection.volumeId);
    }

    return "DISK";
}

function formatCompactDiskVolumeText(value: string): string {
    const trimmedValue = value.trim();
    const windowsDriveMatch = /^([A-Z]):\\?$/i.exec(trimmedValue);

    if (windowsDriveMatch) {
        return `${windowsDriveMatch[1].toUpperCase()}:`;
    }

    const pathParts = trimmedValue.split(/[\\/]/).filter(pathPart => pathPart.length > 0);

    if (pathParts.length > 0) {
        return pathParts[pathParts.length - 1].slice(0, 4).toUpperCase();
    }

    return trimmedValue.slice(0, 4).toUpperCase() || "DISK";
}
