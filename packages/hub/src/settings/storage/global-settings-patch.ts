import { create } from "@bufbuild/protobuf";
import {
    AppearanceGraphSettingsSchema,
    AppearanceThemeSettingsSchema,
    ColorFilledMultiColorPaintSettingsSchema,
    ColorFilledPaintSettingsSchema,
    ColorFilledSolidPaintSettingsSchema,
    DiskThroughputDisplaySettingsSchema,
    GlobalDefaultsSchema,
    GlobalGraphOverrideSchema,
    GlobalOverridesSchema,
    GlobalMultiColorPaintSettingsSchema,
    GlobalPaintOverrideSchema,
    GlobalMetricPaintSettingsSchema,
    GlobalSolidPaintSettingsSchema,
    GlobalThemeOverrideSchema,
    MultiColorSetSchema,
    NetworkDisplaySettingsSchema,
    type AppearanceThemeSettings as StoredAppearanceThemeSettings,
    type ColorFilledPaintSettings as StoredColorFilledPaintSettings,
    type GlobalDefaults as StoredGlobalDefaults,
    type GlobalMetricPaintSettings as StoredGlobalMetricPaintSettings,
    type GlobalOverrides as StoredGlobalOverrides,
    type MultiColorSet as StoredMultiColorSet,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    ColorMode,
    MetricTheme,
    NetworkUnitBase,
    ResolvedAppearanceGraphSettings,
    ResolvedGlobalMultiColorPaintSettings,
    ResolvedGlobalSolidPaintSettings,
    ScaleMode,
} from "../resolved-settings";
import type {
    ResolvedColorFilledPaintSettingsOverride,
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
    readonly paintOverrideEnabled?: boolean | undefined;
    readonly graph?: Partial<ResolvedAppearanceGraphSettings> | undefined;
    readonly theme?: GlobalThemeSettingsPatch | undefined;
    readonly paint?: GlobalPaintSettingsPatch | undefined;
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

interface GlobalThemeSettingsPatch {
    readonly selectedTheme?: MetricTheme | undefined;
}

interface GlobalPaintSettingsPatch {
    readonly metric?: GlobalMetricPaintSettingsPatch | undefined;
    readonly colorFilled?: ResolvedColorFilledPaintSettingsOverride | undefined;
}

interface GlobalMetricPaintSettingsPatch {
    readonly colorMode?: ColorMode | undefined;
    readonly solid?: GlobalSolidPaintSettingsPatch | undefined;
    readonly multiColor?: GlobalMultiColorPaintSettingsPatch | undefined;
}

interface GlobalSolidPaintSettingsPatch {
    readonly color?: ResolvedGlobalSolidPaintSettings["color"] | undefined;
    readonly isGradientEnabled?: ResolvedGlobalSolidPaintSettings["isGradientEnabled"] | undefined;
}

interface GlobalMultiColorPaintSettingsPatch {
    readonly colors?: ResolvedMultiColorSetOverride | undefined;
    readonly lowThresholdPercent?: ResolvedGlobalMultiColorPaintSettings["lowThresholdPercent"] | undefined;
    readonly highThresholdPercent?: ResolvedGlobalMultiColorPaintSettings["highThresholdPercent"] | undefined;
    readonly isGradientEnabled?: ResolvedGlobalMultiColorPaintSettings["isGradientEnabled"] | undefined;
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
    applyPaintOverridePatch(settings.overrides, patch);
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
}

function applyColorFilledPaintPatch(
    colorFilled: StoredColorFilledPaintSettings,
    patch: ResolvedColorFilledPaintSettingsOverride,
): void {
    if (patch.colorMode !== undefined) {
        colorFilled.colorMode = storedColorModeByResolved[patch.colorMode];
    }
    if (patch.solid !== undefined) {
        const solid = colorFilled.solid ??= create(ColorFilledSolidPaintSettingsSchema);
        if (patch.solid.color !== undefined) {
            solid.color = patch.solid.color;
        }
        if (patch.solid.isGradientEnabled !== undefined) {
            solid.gradientEnabled = patch.solid.isGradientEnabled;
        }
    }

    if (patch.multiColor !== undefined) {
        const multiColor = colorFilled.multiColor ??= create(ColorFilledMultiColorPaintSettingsSchema);
        applyMultiColorSetPatch(multiColor.colors ??= create(MultiColorSetSchema), patch.multiColor.colors);
        if (patch.multiColor.isGradientEnabled !== undefined) {
            multiColor.gradientEnabled = patch.multiColor.isGradientEnabled;
        }
    }
}

function applyPaintOverridePatch(
    overrides: StoredGlobalOverrides,
    patch: StoredGlobalSettingsPatch,
): void {
    if (patch.paintOverrideEnabled === undefined && patch.paint === undefined) {
        return;
    }

    const paint = overrides.paint ??= create(GlobalPaintOverrideSchema);

    if (patch.paintOverrideEnabled !== undefined) {
        paint.enabled = patch.paintOverrideEnabled;
    }

    if (patch.paint === undefined) {
        return;
    }

    if (patch.paint.metric !== undefined) {
        applyGlobalMetricPaintPatch(paint.metric ??= create(GlobalMetricPaintSettingsSchema), patch.paint.metric);
    }
    if (patch.paint.colorFilled !== undefined) {
        applyColorFilledPaintPatch(
            paint.colorFilled ??= create(ColorFilledPaintSettingsSchema),
            patch.paint.colorFilled,
        );
    }
}

function applyGlobalMetricPaintPatch(
    metric: StoredGlobalMetricPaintSettings,
    patch: GlobalMetricPaintSettingsPatch,
): void {
    if (patch.colorMode !== undefined) {
        metric.colorMode = storedColorModeByResolved[patch.colorMode];
    }
    if (patch.solid !== undefined) {
        const solid = metric.solid ??= create(GlobalSolidPaintSettingsSchema);
        if (patch.solid.color !== undefined) {
            solid.color = patch.solid.color;
        }
        if (patch.solid.isGradientEnabled !== undefined) {
            solid.gradientEnabled = patch.solid.isGradientEnabled;
        }
    }
    if (patch.multiColor !== undefined) {
        const multiColor = metric.multiColor ??= create(GlobalMultiColorPaintSettingsSchema);
        applyMultiColorSetPatch(multiColor.colors ??= create(MultiColorSetSchema), patch.multiColor.colors);
        if (patch.multiColor.lowThresholdPercent !== undefined) {
            multiColor.lowThresholdPercent = patch.multiColor.lowThresholdPercent;
        }
        if (patch.multiColor.highThresholdPercent !== undefined) {
            multiColor.highThresholdPercent = patch.multiColor.highThresholdPercent;
        }
        if (patch.multiColor.isGradientEnabled !== undefined) {
            multiColor.gradientEnabled = patch.multiColor.isGradientEnabled;
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
