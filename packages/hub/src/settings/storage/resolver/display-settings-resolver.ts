
import {
    type DiskThroughputDisplaySettings as StoredDiskThroughputDisplaySettings,
    type NetworkDisplaySettings as StoredNetworkDisplaySettings,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import type {
    ResolvedDiskThroughputDisplaySettings,
    ResolvedNetworkDisplaySettings,
} from "../../resolved-settings";
import type { ResolveStoredSettingsRuntimeContext } from "./resolver-types";
import { resolveProtoEnum } from "./resolver-helpers";
import {
    networkUnitBaseByProto,
    scaleModeByProto,
} from "./stored-to-resolved-enum-maps";

export function resolveNetworkDisplaySettings(
    storedSettings: StoredNetworkDisplaySettings | undefined,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedNetworkDisplaySettings {
    const scaleMode = resolveProtoEnum(storedSettings?.scaleMode, scaleModeByProto, "auto");
    const configuredSettings = {
        scaleMode,
        maximumDownloadSpeedMegabitsPerSecond: storedSettings?.maximumDownloadSpeedMegabitsPerSecond,
        maximumUploadSpeedMegabitsPerSecond: storedSettings?.maximumUploadSpeedMegabitsPerSecond,
        unitBase: resolveProtoEnum(storedSettings?.unitBase, networkUnitBaseByProto, "byte"),
    };

    if (configuredSettings.scaleMode !== "auto") {
        return configuredSettings;
    }

    return {
        ...configuredSettings,
        maximumDownloadSpeedMegabitsPerSecond:
            readPositiveRuntimeMaximum(runtime?.runtimeMaximumDownloadSpeedMegabitsPerSecond),
        maximumUploadSpeedMegabitsPerSecond:
            readPositiveRuntimeMaximum(runtime?.runtimeMaximumUploadSpeedMegabitsPerSecond),
    };
}

export function resolveDiskThroughputDisplaySettings(
    storedSettings: StoredDiskThroughputDisplaySettings | undefined,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedDiskThroughputDisplaySettings {
    const scaleMode = resolveProtoEnum(storedSettings?.scaleMode, scaleModeByProto, "auto");
    const configuredSettings = {
        scaleMode,
        maximumReadThroughputMebibytesPerSecond: storedSettings?.maximumReadThroughputMebibytesPerSecond,
        maximumWriteThroughputMebibytesPerSecond: storedSettings?.maximumWriteThroughputMebibytesPerSecond,
    };

    if (configuredSettings.scaleMode !== "auto") {
        return configuredSettings;
    }

    return {
        ...configuredSettings,
        maximumReadThroughputMebibytesPerSecond:
            readPositiveRuntimeMaximum(runtime?.runtimeMaximumDiskReadThroughputMebibytesPerSecond),
        maximumWriteThroughputMebibytesPerSecond:
            readPositiveRuntimeMaximum(runtime?.runtimeMaximumDiskWriteThroughputMebibytesPerSecond),
    };
}

export function readPositiveRuntimeMaximum(value: number | undefined): number | undefined {
    // Runtime maxima are observations from sources, not user intent. Ignore
    // missing or invalid maxima so configured limits remain stable instead of
    // letting one bad source sample collapse a gauge scale.
    return value !== undefined && Number.isFinite(value) && value > 0
        ? value
        : undefined;
}
