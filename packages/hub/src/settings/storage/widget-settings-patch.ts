import { create } from "@bufbuild/protobuf";
import {
    AppearanceSettingsSchema,
    AppearanceThemeSettingsSchema,
    AppearanceViewSettingsSchema,
    ColorFilledMultiColorPaintSettingsSchema,
    ColorFilledPaintSettingsSchema,
    ColorFilledThemeSettingsSchema,
    ColorFilledSolidPaintSettingsSchema,
    CupertinoGlassThemeSettingsSchema,
    DiskThroughputDisplaySettingsSchema,
    FlatThemeSettingsSchema,
    MetricMultiColorChannelColorsSchema,
    MetricMultiColorPaintSettingsSchema,
    MetricPaintSettingsSchema,
    MetricSolidChannelColorsSchema,
    MetricSolidPaintSettingsSchema,
    MultiColorSetSchema,
    NetworkDisplaySettingsSchema,
    TerminalPaintSettingsSchema,
    TerminalThemeSettingsSchema,
    SlotOverridesSchema,
    LineAppearanceSettingsSchema,
    WidgetPreferencesSchema,
    type AppearanceSettings as StoredAppearanceSettings,
    type ColorFilledPaintSettings as StoredColorFilledPaintSettings,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type MetricPaintSettings as StoredMetricPaintSettings,
    type MetricMultiColorPaintSettings as StoredMetricMultiColorPaintSettings,
    type MetricSelection as StoredMetricSelection,
    type MetricSlot as StoredMetricSlot,
    type MetricSolidPaintSettings as StoredMetricSolidPaintSettings,
    type MultiColorSet as StoredMultiColorSet,
    type NetworkMetricTarget as StoredNetworkMetricTarget,
    type SlotOverrides as StoredSlotOverrides,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    ResolvedGpuReading,
    ScaleMode,
    TemperatureUnit,
} from "../resolved-settings";
import type {
    ResolvedAppearanceSettingsOverride,
    ResolvedColorFilledPaintSettingsOverride,
    ResolvedMetricPaintSettingsOverride,
    ResolvedMultiColorSetOverride,
} from "../appearance-overrides";
import {
    readStoredWidgetSettings,
    writeStoredWidgetSettings,
    type StoredSettingsJsonObject,
} from "./codec";
import {
    storedCircleViewVariantByResolved,
    storedColorModeByResolved,
    storedDiskMetricKindByResolved,
    storedDiskThroughputDirectionByResolved,
    storedDiskUsageDisplayModeByResolved,
    storedGpuMetricKindByResolved,
    storedGridLineTypeByResolved,
    storedGridLineVisibilityByResolved,
    storedNetworkDirectionByResolved,
    storedNetworkTrafficDisplayModeByResolved,
    storedNetworkUnitBaseByResolved,
    storedTerminalPalettePresetByResolved,
    storedTerminalThemeVariantByResolved,
    storedScaleModeByResolved,
    storedMetricViewByResolved,
    storedTemperatureUnitByResolved,
    storedThemeByResolved,
} from "./enum-maps";

export interface StoredWidgetSettingsPatch {
    readonly preferences?: {
        readonly pollingFrequencySeconds?: number | undefined;
    } | undefined;
    readonly appearance?: ResolvedAppearanceSettingsOverride | undefined;
    readonly network?: Partial<{
        readonly direction: NetworkDirection;
        readonly interfaceId: string;
        readonly trafficDisplayMode: NetworkTrafficDisplayMode;
        readonly scaleMode: ScaleMode;
        readonly maximumDownloadSpeedMegabitsPerSecond: number | undefined;
        readonly maximumUploadSpeedMegabitsPerSecond: number | undefined;
        readonly unitBase: NetworkUnitBase;
    }>;
    readonly disk?: Partial<{
        readonly kind: "usage" | "throughput";
        readonly volumeId: string;
        readonly throughputDirection: DiskThroughputDirection;
        readonly usageDisplayMode: DiskUsageDisplayMode;
        readonly barLabel: string;
        readonly scaleMode: ScaleMode;
        readonly maximumReadThroughputMebibytesPerSecond: number | undefined;
        readonly maximumWriteThroughputMebibytesPerSecond: number | undefined;
    }>;
    readonly gpu?: Partial<{
        readonly kind: ResolvedGpuReading["kind"];
        readonly temperatureUnit: TemperatureUnit;
        readonly maximumTemperatureCelsius: number;
        readonly maximumPowerWatts: number | undefined;
    }>;
}

export function writeStoredWidgetSettingsPatch(
    rawSettings: unknown,
    patch: StoredWidgetSettingsPatch,
): StoredSettingsJsonObject {
    const nextSettings = readStoredWidgetSettings(rawSettings).settings;

    applyPatch(nextSettings, patch);

    return writeStoredWidgetSettings(nextSettings);
}

function applyPatch(settings: StoredWidgetSettings, patch: StoredWidgetSettingsPatch): void {
    if (patch.preferences) {
        applyPreferencesPatch(settings, patch.preferences);
    }

    if (patch.appearance) {
        const overrides = ensureSlotOverrides(requireSingleMetricSlot(settings));
        applyAppearancePatch(overrides.appearance ??= create(AppearanceSettingsSchema), patch.appearance);
    }

    if (patch.network) {
        const slot = requireSingleMetricSlot(settings);
        applyNetworkPatch(requireNetworkTarget(requireMetricSelection(slot)), ensureSlotOverrides(slot), patch.network);
    }

    if (patch.disk) {
        const slot = requireSingleMetricSlot(settings);
        applyDiskPatch(requireDiskTarget(requireMetricSelection(slot)), ensureSlotOverrides(slot), patch.disk);
    }

    if (patch.gpu) {
        applyGpuPatch(requireGpuTarget(requireMetricSelection(requireSingleMetricSlot(settings))), patch.gpu);
    }
}

function applyPreferencesPatch(
    settings: StoredWidgetSettings,
    patch: NonNullable<StoredWidgetSettingsPatch["preferences"]>,
): void {
    settings.preferences ??= create(WidgetPreferencesSchema);
    settings.preferences.pollingFrequencySeconds = patch.pollingFrequencySeconds;
}

function applyAppearancePatch(appearance: StoredAppearanceSettings, patch: ResolvedAppearanceSettingsOverride): void {
    if (patch.view !== undefined) {
        const view = appearance.view ??= create(AppearanceViewSettingsSchema);
        if (patch.view.selectedView !== undefined) {
            view.selectedView = storedMetricViewByResolved[patch.view.selectedView];
        }
        if (patch.view.circleVariant !== undefined) {
            view.circleVariant = storedCircleViewVariantByResolved[patch.view.circleVariant];
        }
    }

    if (patch.theme !== undefined) {
        applyAppearanceThemePatch(appearance.theme ??= create(AppearanceThemeSettingsSchema), patch.theme);
    }

    if (patch.line !== undefined) {
        const line = appearance.line ??= create(LineAppearanceSettingsSchema);
        if (patch.line.lineSmoothingPercent !== undefined) {
            line.lineSmoothingPercent = patch.line.lineSmoothingPercent;
        }
        if (patch.line.gridLineVisibility !== undefined) {
            line.gridLineVisibility = storedGridLineVisibilityByResolved[patch.line.gridLineVisibility];
        }
        if (patch.line.gridLineType !== undefined) {
            line.gridLineType = storedGridLineTypeByResolved[patch.line.gridLineType];
        }
    }
}

function applyAppearanceThemePatch(
    theme: NonNullable<StoredAppearanceSettings["theme"]>,
    patch: NonNullable<ResolvedAppearanceSettingsOverride["theme"]>,
): void {
    if (patch.selectedTheme !== undefined) {
        theme.selectedTheme = storedThemeByResolved[patch.selectedTheme];
    }
    if (patch.terminal?.variant !== undefined) {
        theme.terminal ??= create(TerminalThemeSettingsSchema);
        theme.terminal.variant = storedTerminalThemeVariantByResolved[patch.terminal.variant];
    }
    if (patch.terminal?.paint !== undefined) {
        theme.terminal ??= create(TerminalThemeSettingsSchema);
        const paint = theme.terminal.paint ??= create(TerminalPaintSettingsSchema);
        if (patch.terminal.paint.preset !== undefined) {
            paint.preset = storedTerminalPalettePresetByResolved[patch.terminal.paint.preset];
        }
    }
    if (patch.flat?.paint !== undefined) {
        const flat = theme.flat ??= create(FlatThemeSettingsSchema);
        applyMetricPaintPatch(flat.paint ??= create(MetricPaintSettingsSchema), patch.flat.paint);
    }
    if (patch.cupertinoGlass?.paint !== undefined) {
        const cupertinoGlass = theme.cupertinoGlass ??= create(CupertinoGlassThemeSettingsSchema);
        applyMetricPaintPatch(cupertinoGlass.paint ??= create(MetricPaintSettingsSchema), patch.cupertinoGlass.paint);
    }
    if (patch.colorFilled?.paint !== undefined) {
        const colorFilled = theme.colorFilled ??= create(ColorFilledThemeSettingsSchema);
        applyColorFilledPaintPatch(
            colorFilled.paint ??= create(ColorFilledPaintSettingsSchema),
            patch.colorFilled.paint,
        );
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

function applyMetricPaintPatch(metric: StoredMetricPaintSettings, patch: ResolvedMetricPaintSettingsOverride): void {
    if (patch.colorMode !== undefined) {
        metric.colorMode = storedColorModeByResolved[patch.colorMode];
    }
    if (patch.solid !== undefined) {
        applyMetricSolidPaintPatch(metric.solid ??= create(MetricSolidPaintSettingsSchema), patch.solid);
    }
    if (patch.multiColor !== undefined) {
        applyMetricMultiColorPaintPatch(
            metric.multiColor ??= create(MetricMultiColorPaintSettingsSchema),
            patch.multiColor,
        );
    }
}

function applyMetricSolidPaintPatch(
    solid: StoredMetricSolidPaintSettings,
    patch: NonNullable<ResolvedMetricPaintSettingsOverride["solid"]>,
): void {
    if (patch.colors !== undefined) {
        const colors = solid.colors ??= create(MetricSolidChannelColorsSchema);
        if (patch.colors.usageColor !== undefined) {
            colors.usageColor = patch.colors.usageColor;
        }
        if (patch.colors.downloadColor !== undefined) {
            colors.downloadColor = patch.colors.downloadColor;
        }
        if (patch.colors.uploadColor !== undefined) {
            colors.uploadColor = patch.colors.uploadColor;
        }
        if (patch.colors.diskReadColor !== undefined) {
            colors.diskReadColor = patch.colors.diskReadColor;
        }
        if (patch.colors.diskWriteColor !== undefined) {
            colors.diskWriteColor = patch.colors.diskWriteColor;
        }
    }
    if (patch.isGradientEnabled !== undefined) {
        solid.gradientEnabled = patch.isGradientEnabled;
    }
}

function applyMetricMultiColorPaintPatch(
    multiColor: StoredMetricMultiColorPaintSettings,
    patch: NonNullable<ResolvedMetricPaintSettingsOverride["multiColor"]>,
): void {
    if (patch.lowThresholdPercent !== undefined) {
        multiColor.lowThresholdPercent = patch.lowThresholdPercent;
    }
    if (patch.highThresholdPercent !== undefined) {
        multiColor.highThresholdPercent = patch.highThresholdPercent;
    }
    if (patch.isGradientEnabled !== undefined) {
        multiColor.gradientEnabled = patch.isGradientEnabled;
    }
    if (patch.colors !== undefined) {
        const colors = multiColor.colors ??= create(MetricMultiColorChannelColorsSchema);
        applyMultiColorSetPatch(colors.usage ??= create(MultiColorSetSchema), patch.colors.usage);
        applyMultiColorSetPatch(colors.download ??= create(MultiColorSetSchema), patch.colors.download);
        applyMultiColorSetPatch(colors.upload ??= create(MultiColorSetSchema), patch.colors.upload);
        applyMultiColorSetPatch(colors.diskRead ??= create(MultiColorSetSchema), patch.colors.diskRead);
        applyMultiColorSetPatch(colors.diskWrite ??= create(MultiColorSetSchema), patch.colors.diskWrite);
    }
}

function applyMultiColorSetPatch(colors: StoredMultiColorSet, patch: ResolvedMultiColorSetOverride | undefined): void {
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

function applyNetworkPatch(
    target: StoredNetworkMetricTarget,
    overrides: StoredSlotOverrides,
    patch: NonNullable<StoredWidgetSettingsPatch["network"]>,
): void {
    if (patch.direction !== undefined) {
        target.direction = storedNetworkDirectionByResolved[patch.direction];
    }
    applyDefinedValue(target, "interfaceId", patch.interfaceId);
    if (patch.trafficDisplayMode !== undefined) {
        target.trafficDisplayMode = storedNetworkTrafficDisplayModeByResolved[patch.trafficDisplayMode];
    }

    const display = overrides.network ??= create(NetworkDisplaySettingsSchema);

    if (patch.scaleMode !== undefined) {
        display.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumDownloadSpeedMegabitsPerSecond" in patch) {
        display.maximumDownloadSpeedMegabitsPerSecond = patch.maximumDownloadSpeedMegabitsPerSecond;
    }
    if ("maximumUploadSpeedMegabitsPerSecond" in patch) {
        display.maximumUploadSpeedMegabitsPerSecond = patch.maximumUploadSpeedMegabitsPerSecond;
    }
    if (patch.unitBase !== undefined) {
        display.unitBase = storedNetworkUnitBaseByResolved[patch.unitBase];
    }
}

function applyDiskPatch(
    target: StoredDiskMetricTarget,
    overrides: StoredSlotOverrides,
    patch: NonNullable<StoredWidgetSettingsPatch["disk"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedDiskMetricKindByResolved[patch.kind];
    }
    applyDefinedValue(target, "volumeId", patch.volumeId);
    if (patch.throughputDirection !== undefined) {
        target.throughputDirection = storedDiskThroughputDirectionByResolved[patch.throughputDirection];
    }
    if (patch.usageDisplayMode !== undefined) {
        target.usageDisplayMode = storedDiskUsageDisplayModeByResolved[patch.usageDisplayMode];
    }
    applyDefinedValue(target, "barLabel", patch.barLabel);

    const display = overrides.diskThroughput ??= create(DiskThroughputDisplaySettingsSchema);

    if (patch.scaleMode !== undefined) {
        display.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumReadThroughputMebibytesPerSecond" in patch) {
        display.maximumReadThroughputMebibytesPerSecond = patch.maximumReadThroughputMebibytesPerSecond;
    }
    if ("maximumWriteThroughputMebibytesPerSecond" in patch) {
        display.maximumWriteThroughputMebibytesPerSecond = patch.maximumWriteThroughputMebibytesPerSecond;
    }
}

function applyGpuPatch(
    target: StoredGpuMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["gpu"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedGpuMetricKindByResolved[patch.kind];
    }
    if (patch.temperatureUnit !== undefined) {
        target.temperatureUnit = storedTemperatureUnitByResolved[patch.temperatureUnit];
    }
    applyDefinedValue(target, "maximumTemperatureCelsius", patch.maximumTemperatureCelsius);
    if ("maximumPowerWatts" in patch) {
        target.maximumPowerWatts = patch.maximumPowerWatts;
    }
}

function requireSingleMetricSlot(settings: StoredWidgetSettings): StoredMetricSlot {
    if (settings.widget.case !== "singleMetric") {
        return throwPatchTargetMismatch("Cannot patch widget settings before quick-start widget initialization.");
    }

    if (!settings.widget.value.slot) {
        return throwPatchTargetMismatch("Cannot patch widget settings before quick-start slot initialization.");
    }

    return settings.widget.value.slot;
}

function ensureSlotOverrides(slot: StoredMetricSlot): StoredSlotOverrides {
    slot.overrides ??= create(SlotOverridesSchema);
    return slot.overrides;
}

function requireMetricSelection(slot: StoredMetricSlot): StoredMetricSelection {
    if (!slot.metric) {
        return throwPatchTargetMismatch("Cannot patch widget settings before quick-start metric initialization.");
    }

    return slot.metric;
}

function requireNetworkTarget(metric: StoredMetricSelection): StoredNetworkMetricTarget {
    if (metric.target.case !== "network") {
        return throwPatchTargetMismatch("Cannot apply a network settings patch to a non-network metric.");
    }

    return metric.target.value;
}

function requireDiskTarget(metric: StoredMetricSelection): StoredDiskMetricTarget {
    if (metric.target.case !== "disk") {
        return throwPatchTargetMismatch("Cannot apply a disk settings patch to a non-disk metric.");
    }

    return metric.target.value;
}

function requireGpuTarget(metric: StoredMetricSelection): StoredGpuMetricTarget {
    if (metric.target.case !== "gpu") {
        return throwPatchTargetMismatch("Cannot apply a GPU settings patch to a non-GPU metric.");
    }

    return metric.target.value;
}

function throwPatchTargetMismatch(message: string): never {
    throw new Error(message);
}

function applyDefinedValue<TObject extends object, TKey extends keyof TObject>(
    object: TObject,
    key: TKey,
    value: TObject[TKey] | undefined,
): void {
    if (value !== undefined) {
        object[key] = value;
    }
}
