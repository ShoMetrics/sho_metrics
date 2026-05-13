import { create } from "@bufbuild/protobuf";
import {
    ColorRampSchema,
    GlobalAppearanceOverrideSchema,
    GlobalDefaultsSchema,
    GlobalOverridesSchema,
    NetworkDisplaySettingsSchema,
    DiskThroughputDisplaySettingsSchema,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    CircleStyle,
    ColorMode,
    MetricTheme,
    NetworkUnitBase,
    ScaleMode,
    SingleMetricViewLayout,
} from "../resolved-settings";
import {
    readStoredGlobalSettings,
    writeStoredGlobalSettings,
    type StoredSettingsJsonObject,
} from "./codec";
import { applyColorRampPatch, type ColorRampPatch } from "./color-ramp-patch";
import {
    storedCircleStyleByResolved,
    storedColorModeByResolved,
    storedNetworkUnitBaseByResolved,
    storedScaleModeByResolved,
    storedSingleMetricViewLayoutByResolved,
    storedThemeByResolved,
} from "./enum-maps";

export interface StoredGlobalSettingsPatch {
    readonly appearanceEnabled?: boolean | undefined;
    readonly appearance?: Partial<{
        readonly viewLayout: SingleMetricViewLayout;
        readonly circleStyle: CircleStyle;
        readonly theme: MetricTheme;
        readonly colors: ColorRampPatch;
        readonly colorMode: ColorMode;
        readonly lowColorThresholdPercent: number;
        readonly highColorThresholdPercent: number;
    }> | undefined;
    readonly network?: Partial<{
        readonly scaleMode: ScaleMode;
        readonly maximumDownloadSpeedMegabitsPerSecond: number | undefined;
        readonly maximumUploadSpeedMegabitsPerSecond: number | undefined;
        readonly unitBase: NetworkUnitBase;
    }> | undefined;
    readonly diskThroughput?: Partial<{
        readonly scaleMode: ScaleMode;
        readonly maximumReadThroughputMebibytesPerSecond: number | undefined;
        readonly maximumWriteThroughputMebibytesPerSecond: number | undefined;
    }> | undefined;
}

export function writeStoredGlobalSettingsPatch(
    rawSettings: unknown,
    patch: StoredGlobalSettingsPatch,
): StoredSettingsJsonObject {
    const settings = readStoredGlobalSettings(rawSettings).settings;

    settings.defaults ??= create(GlobalDefaultsSchema);
    settings.overrides ??= create(GlobalOverridesSchema);

    if (patch.appearanceEnabled !== undefined) {
        settings.overrides.appearanceEnabled = patch.appearanceEnabled;
    }
    if (patch.appearance) {
        const appearance = settings.overrides.appearance ??= create(GlobalAppearanceOverrideSchema);
        if (patch.appearance.viewLayout !== undefined) {
            appearance.viewLayout = storedSingleMetricViewLayoutByResolved[patch.appearance.viewLayout];
        }
        if (patch.appearance.circleStyle !== undefined) {
            appearance.circleStyle = storedCircleStyleByResolved[patch.appearance.circleStyle];
        }
        if (patch.appearance.theme !== undefined) {
            appearance.theme = storedThemeByResolved[patch.appearance.theme];
        }
        if (patch.appearance.colors !== undefined) {
            appearance.colors ??= create(ColorRampSchema);
            applyColorRampPatch(appearance.colors, patch.appearance.colors);
        }
        if (patch.appearance.colorMode !== undefined) {
            appearance.colorMode = storedColorModeByResolved[patch.appearance.colorMode];
        }
        if (patch.appearance.lowColorThresholdPercent !== undefined) {
            appearance.lowColorThresholdPercent = patch.appearance.lowColorThresholdPercent;
        }
        if (patch.appearance.highColorThresholdPercent !== undefined) {
            appearance.highColorThresholdPercent = patch.appearance.highColorThresholdPercent;
        }
    }
    if (patch.network) {
        const network = settings.defaults.network ??= create(NetworkDisplaySettingsSchema);
        if (patch.network.scaleMode !== undefined) {
            network.scaleMode = storedScaleModeByResolved[patch.network.scaleMode];
        }
        if ("maximumDownloadSpeedMegabitsPerSecond" in patch.network) {
            network.maximumDownloadSpeedMegabitsPerSecond = patch.network.maximumDownloadSpeedMegabitsPerSecond;
        }
        if ("maximumUploadSpeedMegabitsPerSecond" in patch.network) {
            network.maximumUploadSpeedMegabitsPerSecond = patch.network.maximumUploadSpeedMegabitsPerSecond;
        }
        if (patch.network.unitBase !== undefined) {
            network.unitBase = storedNetworkUnitBaseByResolved[patch.network.unitBase];
        }
    }
    if (patch.diskThroughput) {
        const diskThroughput = settings.defaults.diskThroughput ??= create(DiskThroughputDisplaySettingsSchema);
        if (patch.diskThroughput.scaleMode !== undefined) {
            diskThroughput.scaleMode = storedScaleModeByResolved[patch.diskThroughput.scaleMode];
        }
        if ("maximumReadThroughputMebibytesPerSecond" in patch.diskThroughput) {
            diskThroughput.maximumReadThroughputMebibytesPerSecond =
                patch.diskThroughput.maximumReadThroughputMebibytesPerSecond;
        }
        if ("maximumWriteThroughputMebibytesPerSecond" in patch.diskThroughput) {
            diskThroughput.maximumWriteThroughputMebibytesPerSecond =
                patch.diskThroughput.maximumWriteThroughputMebibytesPerSecond;
        }
    }

    return writeStoredGlobalSettings(settings);
}
