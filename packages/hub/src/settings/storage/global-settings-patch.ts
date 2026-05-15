import { create } from "@bufbuild/protobuf";
import {
    AppearanceGraphSettingsSchema,
    AppearanceThemeSettingsSchema,
    ColorFilledMultiColorSettingsSchema,
    ColorFilledSolidSettingsSchema,
    ColorFilledThemeSettingsSchema,
    DiskThroughputDisplaySettingsSchema,
    GlobalColorOverrideSchema,
    GlobalDefaultsSchema,
    GlobalGraphOverrideSchema,
    GlobalMultiColorSettingsSchema,
    GlobalOverridesSchema,
    GlobalSolidColorSettingsSchema,
    GlobalThemeOverrideSchema,
    MultiColorSetSchema,
    NetworkDisplaySettingsSchema,
    type AppearanceThemeSettings as StoredAppearanceThemeSettings,
    type ColorFilledThemeSettings as StoredColorFilledThemeSettings,
    type GlobalDefaults as StoredGlobalDefaults,
    type GlobalOverrides as StoredGlobalOverrides,
    type MultiColorSet as StoredMultiColorSet,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    ColorMode,
    MetricTheme,
    NetworkUnitBase,
    ResolvedAppearanceGraphSettings,
    ResolvedGlobalMultiColorSettings,
    ResolvedGlobalSolidColorSettings,
    ScaleMode,
} from "../resolved-settings";
import type {
    ResolvedColorFilledMultiColorSettingsOverride,
    ResolvedColorFilledSolidSettingsOverride,
    ResolvedMultiColorSetOverride,
} from "../appearance-overrides";
import {
    readStoredGlobalSettings,
    writeStoredGlobalSettings,
    type StoredSettingsJsonObject,
} from "./codec";
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
    readonly graphOverrideEnabled?: boolean | undefined;
    readonly themeOverrideEnabled?: boolean | undefined;
    readonly colorOverrideEnabled?: boolean | undefined;
    readonly graph?: Partial<ResolvedAppearanceGraphSettings> | undefined;
    readonly theme?: GlobalThemeSettingsPatch | undefined;
    readonly color?: GlobalColorSettingsPatch | undefined;
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

export interface GlobalThemeSettingsPatch {
    readonly selectedTheme?: MetricTheme | undefined;
    readonly colorFilled?: ColorFilledThemeSettingsPatch | undefined;
}

export interface ColorFilledThemeSettingsPatch {
    readonly solid?: ResolvedColorFilledSolidSettingsOverride | undefined;
    readonly multiColor?: ColorFilledMultiColorSettingsPatch | undefined;
}

export type ColorFilledMultiColorSettingsPatch = ResolvedColorFilledMultiColorSettingsOverride;

export interface GlobalColorSettingsPatch {
    readonly colorMode?: ColorMode | undefined;
    readonly solid?: GlobalSolidColorSettingsPatch | undefined;
    readonly multiColor?: GlobalMultiColorSettingsPatch | undefined;
}

export interface GlobalSolidColorSettingsPatch {
    readonly color?: ResolvedGlobalSolidColorSettings["color"] | undefined;
    readonly isGradientEnabled?: ResolvedGlobalSolidColorSettings["isGradientEnabled"] | undefined;
}

export interface GlobalMultiColorSettingsPatch {
    readonly colors?: ResolvedMultiColorSetOverride | undefined;
    readonly lowThresholdPercent?: ResolvedGlobalMultiColorSettings["lowThresholdPercent"] | undefined;
    readonly highThresholdPercent?: ResolvedGlobalMultiColorSettings["highThresholdPercent"] | undefined;
    readonly isGradientEnabled?: ResolvedGlobalMultiColorSettings["isGradientEnabled"] | undefined;
}

export function writeStoredGlobalSettingsPatch(
    rawSettings: unknown,
    patch: StoredGlobalSettingsPatch,
): StoredSettingsJsonObject {
    const settings = readStoredGlobalSettings(rawSettings).settings;

    settings.defaults ??= create(GlobalDefaultsSchema);
    settings.overrides ??= create(GlobalOverridesSchema);

    if (patch.globalOverrideEnabled !== undefined) {
        settings.overrides.enabled = patch.globalOverrideEnabled;
    }

    applyGraphOverridePatch(settings.overrides, patch);
    applyThemeOverridePatch(settings.overrides, patch);
    applyColorOverridePatch(settings.overrides, patch);
    applyNetworkDefaultsPatch(settings.defaults, patch.network);
    applyDiskThroughputDefaultsPatch(settings.defaults, patch.diskThroughput);

    return writeStoredGlobalSettings(settings);
}

function applyGraphOverridePatch(
    overrides: StoredGlobalOverrides,
    patch: StoredGlobalSettingsPatch,
): void {
    if (patch.graphOverrideEnabled === undefined && patch.graph === undefined) {
        return;
    }

    const graphOverride = overrides.graph ??= create(GlobalGraphOverrideSchema);

    if (patch.graphOverrideEnabled !== undefined) {
        graphOverride.enabled = patch.graphOverrideEnabled;
    }

    if (patch.graph === undefined) {
        return;
    }

    const graph = graphOverride.graph ??= create(AppearanceGraphSettingsSchema);
    if (patch.graph.viewLayout !== undefined) {
        graph.viewLayout = storedSingleMetricViewLayoutByResolved[patch.graph.viewLayout];
    }
    if (patch.graph.circleStyle !== undefined) {
        graph.circleStyle = storedCircleStyleByResolved[patch.graph.circleStyle];
    }
}

function applyThemeOverridePatch(
    overrides: StoredGlobalOverrides,
    patch: StoredGlobalSettingsPatch,
): void {
    if (patch.themeOverrideEnabled === undefined && patch.theme === undefined) {
        return;
    }

    const themeOverride = overrides.theme ??= create(GlobalThemeOverrideSchema);

    if (patch.themeOverrideEnabled !== undefined) {
        themeOverride.enabled = patch.themeOverrideEnabled;
    }

    if (patch.theme === undefined) {
        return;
    }

    applyThemeSettingsPatch(themeOverride.theme ??= create(AppearanceThemeSettingsSchema), patch.theme);
}

function applyThemeSettingsPatch(
    theme: StoredAppearanceThemeSettings,
    patch: GlobalThemeSettingsPatch,
): void {
    if (patch.selectedTheme !== undefined) {
        theme.selectedTheme = storedThemeByResolved[patch.selectedTheme];
    }
    if (patch.colorFilled !== undefined) {
        applyColorFilledThemePatch(theme.colorFilled ??= create(ColorFilledThemeSettingsSchema), patch.colorFilled);
    }
}

function applyColorFilledThemePatch(
    colorFilled: StoredColorFilledThemeSettings,
    patch: ColorFilledThemeSettingsPatch,
): void {
    if (patch.solid !== undefined) {
        const solid = colorFilled.solid ??= create(ColorFilledSolidSettingsSchema);
        if (patch.solid.color !== undefined) {
            solid.color = patch.solid.color;
        }
        if (patch.solid.isGradientEnabled !== undefined) {
            solid.gradientEnabled = patch.solid.isGradientEnabled;
        }
    }

    if (patch.multiColor !== undefined) {
        const multiColor = colorFilled.multiColor ??= create(ColorFilledMultiColorSettingsSchema);
        applyMultiColorSetPatch(multiColor.colors ??= create(MultiColorSetSchema), patch.multiColor.colors);
        if (patch.multiColor.isGradientEnabled !== undefined) {
            multiColor.gradientEnabled = patch.multiColor.isGradientEnabled;
        }
    }
}

function applyColorOverridePatch(
    overrides: StoredGlobalOverrides,
    patch: StoredGlobalSettingsPatch,
): void {
    if (patch.colorOverrideEnabled === undefined && patch.color === undefined) {
        return;
    }

    const color = overrides.color ??= create(GlobalColorOverrideSchema);

    if (patch.colorOverrideEnabled !== undefined) {
        color.enabled = patch.colorOverrideEnabled;
    }

    if (patch.color === undefined) {
        return;
    }

    if (patch.color.colorMode !== undefined) {
        color.colorMode = storedColorModeByResolved[patch.color.colorMode];
    }
    if (patch.color.solid !== undefined) {
        const solid = color.solid ??= create(GlobalSolidColorSettingsSchema);
        if (patch.color.solid.color !== undefined) {
            solid.color = patch.color.solid.color;
        }
        if (patch.color.solid.isGradientEnabled !== undefined) {
            solid.gradientEnabled = patch.color.solid.isGradientEnabled;
        }
    }
    if (patch.color.multiColor !== undefined) {
        const multiColor = color.multiColor ??= create(GlobalMultiColorSettingsSchema);
        applyMultiColorSetPatch(multiColor.colors ??= create(MultiColorSetSchema), patch.color.multiColor.colors);
        if (patch.color.multiColor.lowThresholdPercent !== undefined) {
            multiColor.lowThresholdPercent = patch.color.multiColor.lowThresholdPercent;
        }
        if (patch.color.multiColor.highThresholdPercent !== undefined) {
            multiColor.highThresholdPercent = patch.color.multiColor.highThresholdPercent;
        }
        if (patch.color.multiColor.isGradientEnabled !== undefined) {
            multiColor.gradientEnabled = patch.color.multiColor.isGradientEnabled;
        }
    }
}

function applyMultiColorSetPatch(
    colors: StoredMultiColorSet,
    patch: ResolvedMultiColorSetOverride | undefined,
): void {
    if (patch?.lowColor !== undefined) {
        colors.lowColor = patch.lowColor;
    }
    if (patch?.mediumColor !== undefined) {
        colors.mediumColor = patch.mediumColor;
    }
    if (patch?.highColor !== undefined) {
        colors.highColor = patch.highColor;
    }
}

function applyNetworkDefaultsPatch(
    defaults: StoredGlobalDefaults,
    patch: StoredGlobalSettingsPatch["network"],
): void {
    if (!patch) {
        return;
    }

    const network = defaults.network ??= create(NetworkDisplaySettingsSchema);
    if (patch.scaleMode !== undefined) {
        network.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumDownloadSpeedMegabitsPerSecond" in patch) {
        network.maximumDownloadSpeedMegabitsPerSecond = patch.maximumDownloadSpeedMegabitsPerSecond;
    }
    if ("maximumUploadSpeedMegabitsPerSecond" in patch) {
        network.maximumUploadSpeedMegabitsPerSecond = patch.maximumUploadSpeedMegabitsPerSecond;
    }
    if (patch.unitBase !== undefined) {
        network.unitBase = storedNetworkUnitBaseByResolved[patch.unitBase];
    }
}

function applyDiskThroughputDefaultsPatch(
    defaults: StoredGlobalDefaults,
    patch: StoredGlobalSettingsPatch["diskThroughput"],
): void {
    if (!patch) {
        return;
    }

    const diskThroughput = defaults.diskThroughput ??= create(DiskThroughputDisplaySettingsSchema);
    if (patch.scaleMode !== undefined) {
        diskThroughput.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumReadThroughputMebibytesPerSecond" in patch) {
        diskThroughput.maximumReadThroughputMebibytesPerSecond = patch.maximumReadThroughputMebibytesPerSecond;
    }
    if ("maximumWriteThroughputMebibytesPerSecond" in patch) {
        diskThroughput.maximumWriteThroughputMebibytesPerSecond = patch.maximumWriteThroughputMebibytesPerSecond;
    }
}
