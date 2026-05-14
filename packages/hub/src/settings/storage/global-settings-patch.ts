import { create } from "@bufbuild/protobuf";
import {
    ColorRampSchema,
    GlobalColorOverrideSchema,
    GlobalOverridesSchema,
    GlobalLayoutStyleOverrideSchema,
    GlobalDefaultsSchema,
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
    readonly globalOverrideEnabled?: boolean | undefined;
    readonly layoutStyleOverrideEnabled?: boolean | undefined;
    readonly colorOverrideEnabled?: boolean | undefined;
    readonly layoutStyle?: Partial<{
        readonly viewLayout: SingleMetricViewLayout;
        readonly circleStyle: CircleStyle;
        readonly theme: MetricTheme;
    }> | undefined;
    readonly color?: Partial<{
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

    const overrides = settings.overrides;
    const layoutStylePatch = patch.layoutStyle;
    const colorPatch = patch.color;

    if (patch.globalOverrideEnabled !== undefined) {
        overrides.enabled = patch.globalOverrideEnabled;
    }

    if (patch.layoutStyleOverrideEnabled !== undefined || layoutStylePatch !== undefined) {
        const layoutStyle = overrides.layoutStyle ??= create(GlobalLayoutStyleOverrideSchema);

        if (patch.layoutStyleOverrideEnabled !== undefined) {
            layoutStyle.enabled = patch.layoutStyleOverrideEnabled;
        }
        if (layoutStylePatch?.viewLayout !== undefined) {
            layoutStyle.viewLayout = storedSingleMetricViewLayoutByResolved[layoutStylePatch.viewLayout];
        }
        if (layoutStylePatch?.circleStyle !== undefined) {
            layoutStyle.circleStyle = storedCircleStyleByResolved[layoutStylePatch.circleStyle];
        }
        if (layoutStylePatch?.theme !== undefined) {
            layoutStyle.theme = storedThemeByResolved[layoutStylePatch.theme];
        }
    }

    if (patch.colorOverrideEnabled !== undefined || colorPatch !== undefined) {
        const color = overrides.color ??= create(GlobalColorOverrideSchema);

        if (patch.colorOverrideEnabled !== undefined) {
            color.enabled = patch.colorOverrideEnabled;
        }
        if (colorPatch?.colors !== undefined) {
            color.colors ??= create(ColorRampSchema);
            applyColorRampPatch(color.colors, colorPatch.colors);
        }
        if (colorPatch?.colorMode !== undefined) {
            color.colorMode = storedColorModeByResolved[colorPatch.colorMode];
        }
        if (colorPatch?.lowColorThresholdPercent !== undefined) {
            color.lowColorThresholdPercent = colorPatch.lowColorThresholdPercent;
        }
        if (colorPatch?.highColorThresholdPercent !== undefined) {
            color.highColorThresholdPercent = colorPatch.highColorThresholdPercent;
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
