
import {
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    ScaleMode as StoredScaleMode,
    type DiskThroughputDisplaySettings as StoredDiskThroughputDisplaySettings,
    type NetworkDisplaySettings as StoredNetworkDisplaySettings,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import type {
    NetworkUnitBase,
    ResolvedDiskThroughputDisplaySettings,
    ResolvedNetworkDisplaySettings,
    ScaleMode,
} from "../../resolved-settings";
import type { ResolveStoredSettingsRuntimeContext } from "./resolver-types";
import { resolveStoredEnum } from "./resolver-helpers";

const DEFAULT_NETWORK_DISPLAY_SETTINGS: ResolvedNetworkDisplaySettings = {
    scaleMode: "auto",
    maximumDownloadSpeedMegabitsPerSecond: undefined,
    maximumUploadSpeedMegabitsPerSecond: undefined,
    unitBase: "byte",
};

const DEFAULT_DISK_THROUGHPUT_DISPLAY_SETTINGS: ResolvedDiskThroughputDisplaySettings = {
    scaleMode: "auto",
    maximumReadThroughputMebibytesPerSecond: undefined,
    maximumWriteThroughputMebibytesPerSecond: undefined,
};

const scaleModeByProto = {
    [StoredScaleMode.UNSPECIFIED]: undefined,
    [StoredScaleMode.AUTO]: "auto",
    [StoredScaleMode.CUSTOM]: "custom",
} satisfies Record<StoredScaleMode, ScaleMode | undefined>;

const networkUnitBaseByProto = {
    [StoredNetworkUnitBase.UNSPECIFIED]: undefined,
    [StoredNetworkUnitBase.BYTE]: "byte",
    [StoredNetworkUnitBase.BIT]: "bit",
} satisfies Record<StoredNetworkUnitBase, NetworkUnitBase | undefined>;

export function resolveNetworkDisplayDefaults(
    storedSettings: StoredNetworkDisplaySettings | undefined,
): ResolvedNetworkDisplaySettings {
    return resolveNetworkDisplaySettings(DEFAULT_NETWORK_DISPLAY_SETTINGS, storedSettings, undefined);
}

export function resolveNetworkDisplaySettings(
    defaults: ResolvedNetworkDisplaySettings,
    storedSettings: StoredNetworkDisplaySettings | undefined,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedNetworkDisplaySettings {
    const scaleMode = resolveStoredEnum(storedSettings?.scaleMode, scaleModeByProto, defaults.scaleMode);
    const configuredSettings = {
        scaleMode,
        maximumDownloadSpeedMegabitsPerSecond: storedSettings?.maximumDownloadSpeedMegabitsPerSecond
            ?? defaults.maximumDownloadSpeedMegabitsPerSecond,
        maximumUploadSpeedMegabitsPerSecond: storedSettings?.maximumUploadSpeedMegabitsPerSecond
            ?? defaults.maximumUploadSpeedMegabitsPerSecond,
        unitBase: resolveStoredEnum(storedSettings?.unitBase, networkUnitBaseByProto, defaults.unitBase),
    };

    if (configuredSettings.scaleMode !== "auto") {
        return configuredSettings;
    }

    return {
        ...configuredSettings,
        maximumDownloadSpeedMegabitsPerSecond: largestConfiguredOrRuntimeMaximum(
            configuredSettings.maximumDownloadSpeedMegabitsPerSecond,
            runtime?.runtimeMaximumDownloadSpeedMegabitsPerSecond,
        ),
        maximumUploadSpeedMegabitsPerSecond: largestConfiguredOrRuntimeMaximum(
            configuredSettings.maximumUploadSpeedMegabitsPerSecond,
            runtime?.runtimeMaximumUploadSpeedMegabitsPerSecond,
        ),
    };
}

export function resolveDiskThroughputDisplayDefaults(
    storedSettings: StoredDiskThroughputDisplaySettings | undefined,
): ResolvedDiskThroughputDisplaySettings {
    return resolveDiskThroughputDisplaySettings(
        DEFAULT_DISK_THROUGHPUT_DISPLAY_SETTINGS,
        storedSettings,
        undefined,
    );
}

export function resolveDiskThroughputDisplaySettings(
    defaults: ResolvedDiskThroughputDisplaySettings,
    storedSettings: StoredDiskThroughputDisplaySettings | undefined,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedDiskThroughputDisplaySettings {
    const scaleMode = resolveStoredEnum(storedSettings?.scaleMode, scaleModeByProto, defaults.scaleMode);
    const configuredSettings = {
        scaleMode,
        maximumReadThroughputMebibytesPerSecond: storedSettings?.maximumReadThroughputMebibytesPerSecond
            ?? defaults.maximumReadThroughputMebibytesPerSecond,
        maximumWriteThroughputMebibytesPerSecond: storedSettings?.maximumWriteThroughputMebibytesPerSecond
            ?? defaults.maximumWriteThroughputMebibytesPerSecond,
    };

    if (configuredSettings.scaleMode !== "auto") {
        return configuredSettings;
    }

    return {
        ...configuredSettings,
        maximumReadThroughputMebibytesPerSecond: largestConfiguredOrRuntimeMaximum(
            configuredSettings.maximumReadThroughputMebibytesPerSecond,
            runtime?.runtimeMaximumDiskReadThroughputMebibytesPerSecond,
        ),
        maximumWriteThroughputMebibytesPerSecond: largestConfiguredOrRuntimeMaximum(
            configuredSettings.maximumWriteThroughputMebibytesPerSecond,
            runtime?.runtimeMaximumDiskWriteThroughputMebibytesPerSecond,
        ),
    };
}

function largestConfiguredOrRuntimeMaximum(
    configuredMaximum: number | undefined,
    runtimeMaximum: number | undefined,
): number | undefined {
    const resolvedRuntimeMaximum = readPositiveRuntimeMaximum(runtimeMaximum);

    if (configuredMaximum === undefined) {
        return resolvedRuntimeMaximum;
    }

    if (resolvedRuntimeMaximum === undefined) {
        return configuredMaximum;
    }

    return Math.max(configuredMaximum, resolvedRuntimeMaximum);
}

export function readPositiveRuntimeMaximum(value: number | undefined): number | undefined {
    return value !== undefined && Number.isFinite(value) && value > 0
        ? value
        : undefined;
}
