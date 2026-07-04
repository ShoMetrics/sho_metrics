import {
    DARWIN_ROOT_DATA_VOLUME_MOUNT,
    resolveDefaultDiskVolumeOption,
    type DiskVolumeOption,
} from "../../runtime/disk-volumes";
import { optionMessages } from "../../i18n/message-groups/options";
import { formatMessage } from "../../i18n/format";
import type { I18n } from "../../i18n/react";
import type { LocalizedMessage, PlaceholderValues } from "../../i18n/types";
import type { NetworkInterfaceOption } from "../../runtime/network-interfaces";
import { requireResolvedSingleMetricWidget } from "../../settings/resolved-settings";
import type { SelectOption, VisibilityContext } from "../inspector/types";
import { preserveMissingCurrentOption } from "./preserve-current-option";

/** Builds localized network interface picker options while preserving dynamic interface labels. */
export function resolveNetworkInterfaceOptions(
    context: VisibilityContext,
    selectedNetworkInterfaceId = "",
    i18n?: I18n,
): readonly SelectOption[] {
    return buildNetworkInterfaceOptions(
        context.runtimeCache.availableNetworkInterfaces,
        selectedNetworkInterfaceId,
        i18n,
    );
}

/** Builds localized disk volume picker options while preserving dynamic volume labels. */
export function resolveDiskVolumeOptions(
    context: VisibilityContext,
    selectedDiskVolumeId = "",
    i18n?: I18n,
): readonly SelectOption[] {
    return buildDiskVolumeOptions(context, i18n, selectedDiskVolumeId);
}

function buildNetworkInterfaceOptions(
    networkInterfaces: readonly NetworkInterfaceOption[],
    selectedNetworkInterfaceId: string,
    i18n: I18n | undefined,
): readonly SelectOption[] {
    const networkInterfaceOptions = [
        { value: "", label: translate(i18n, optionMessages.automaticOption) },
        ...networkInterfaces.map((networkInterface) => {
            const speedLabel = networkInterface.speedMegabitsPerSecond
                ? `, ${networkInterface.speedMegabitsPerSecond} Mbps`
                : "";
            const defaultLabel = networkInterface.isDefault
                ? `${translate(i18n, optionMessages.defaultLowercaseLabel)}, `
                : "";
            const typeLabel = networkInterface.type === "unknown" ? "" : `${networkInterface.type}, `;

            return {
                value: networkInterface.id,
                label: `${networkInterface.name} (${defaultLabel}${typeLabel}${networkInterface.id}${speedLabel})`,
            };
        }),
    ];

    return preserveMissingCurrentOption({
        optionList: networkInterfaceOptions,
        currentValue: selectedNetworkInterfaceId.length > 0 ? selectedNetworkInterfaceId : undefined,
        placement: "start",
        resolveCurrentOption: currentValue => ({
            value: currentValue,
            label: translate(i18n, optionMessages.unavailableOptionLabel, {
                label: currentValue,
            }),
            disabled: true,
        }),
    });
}

function buildDiskVolumeOptions(
    context: VisibilityContext,
    i18n: I18n | undefined,
    selectedDiskVolumeId: string,
): readonly SelectOption[] {
    const diskVolumes = context.runtimeCache.availableDiskVolumes;
    const diskVolumeOptions = diskVolumes.map((diskVolume) => ({
        value: diskVolume.id,
        label: formatDiskVolumeOptionLabel(diskVolume),
    }));
    const hasSelectedDiskVolume = selectedDiskVolumeId.length > 0
        && diskVolumeOptions.some(option => option.value === selectedDiskVolumeId);

    const preservedDiskVolumeOptions = preserveMissingCurrentOption({
        optionList: diskVolumeOptions,
        currentValue: selectedDiskVolumeId.length > 0 && !hasSelectedDiskVolume
            ? selectedDiskVolumeId
            : undefined,
        placement: "start",
        resolveCurrentOption: currentValue => ({
            value: currentValue,
            label: translate(i18n, optionMessages.unavailableOptionLabel, {
                label: formatDiskVolumeSelectionText(currentValue),
            }),
        }),
    });

    if (preservedDiskVolumeOptions.length > 0) {
        return preservedDiskVolumeOptions;
    }

    let volumeOptionLabel: string;
    switch (context.runtimeCacheStatus.diskVolumeOptionsStatus) {
        case "pending":
            volumeOptionLabel = translate(i18n, optionMessages.loadingVolumesOption);
            break;
        case "failed":
            volumeOptionLabel = translate(i18n, optionMessages.volumesUnavailableOption);
            break;
        case "ready":
            volumeOptionLabel = translate(i18n, optionMessages.noDetectedVolumesOption);
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

/** Builds the localized disk bar label placeholder from the current runtime disk selection. */
export function resolveDiskBarLabelPlaceholder(context: VisibilityContext, i18n?: I18n): string {
    const diskVolume = resolveSelectedDiskVolume(context);

    if (!diskVolume) {
        return translate(i18n, optionMessages.autoLabelPrefix);
    }

    return `${translate(i18n, optionMessages.autoLabelPrefix)}: ${resolveCompactDiskStorageLabel(diskVolume)} (${formatDiskVolumeDisplayLabel(diskVolume)})`;
}

export function resolveSelectedDiskVolume(context: VisibilityContext): DiskVolumeOption | null {
    const diskVolumes = context.runtimeCache.availableDiskVolumes;
    const target = requireResolvedSingleMetricWidget(context.resolved).slot.metric.target;
    const selectedDiskVolumeId = target.domain === "disk"
        ? target.volumeId ?? ""
        : "";

    if (selectedDiskVolumeId.length > 0) {
        return diskVolumes.find(diskVolume => diskVolume.id === selectedDiskVolumeId) ?? null;
    }

    return resolveDefaultDiskVolumeOption(diskVolumes);
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

    if (mountLabel === DARWIN_ROOT_DATA_VOLUME_MOUNT) {
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

function translate(
    i18n: I18n | undefined,
    message: LocalizedMessage,
    values?: PlaceholderValues,
): string {
    return i18n ? i18n.t(message, values) : formatMessage("en", message, values);
}
