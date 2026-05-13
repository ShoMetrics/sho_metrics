import { create } from "@bufbuild/protobuf";
import {
    AppearanceSettingsSchema,
    ColorRampSchema,
    DiskThroughputDisplaySettingsSchema,
    NetworkDisplaySettingsSchema,
    SlotOverridesSchema,
    WidgetPreferencesSchema,
    type AppearanceSettings as StoredAppearanceSettings,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type MetricSelection as StoredMetricSelection,
    type MetricSlot as StoredMetricSlot,
    type NetworkMetricTarget as StoredNetworkMetricTarget,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    CircleStyle,
    ColorMode,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    GridLineType,
    GridLineVisibility,
    MetricTheme,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    ResolvedGpuReading,
    ScaleMode,
    SingleMetricViewLayout,
    TemperatureUnit,
} from "../resolved-settings";
import {
    readStoredWidgetSettings,
    writeStoredWidgetSettings,
    type StoredSettingsJsonObject,
} from "./codec";
import { applyColorRampPatch, type ColorRampPatch } from "./color-ramp-patch";
import {
    storedCircleStyleByResolved,
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
    storedScaleModeByResolved,
    storedSingleMetricViewLayoutByResolved,
    storedTemperatureUnitByResolved,
    storedThemeByResolved,
} from "./enum-maps";

type ColorRampKey =
    | "usageColors"
    | "downloadColors"
    | "uploadColors"
    | "diskReadColors"
    | "diskWriteColors";

export interface StoredWidgetSettingsPatch {
    readonly preferences?: {
        readonly pollingFrequencySeconds?: number | undefined;
    } | undefined;
    readonly appearance?: Partial<{
        readonly viewLayout: SingleMetricViewLayout;
        readonly circleStyle: CircleStyle;
        readonly theme: MetricTheme;
        readonly colorMode: ColorMode;
        readonly lowColorThresholdPercent: number;
        readonly highColorThresholdPercent: number;
        readonly lineSmoothingPercent: number;
        readonly gridLineVisibility: GridLineVisibility;
        readonly gridLineType: GridLineType;
    }> & Partial<Record<ColorRampKey, ColorRampPatch>>;
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
        readonly linearLabel: string;
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

function applyAppearancePatch(
    appearance: StoredAppearanceSettings,
    patch: NonNullable<StoredWidgetSettingsPatch["appearance"]>,
): void {
    if (patch.viewLayout !== undefined) {
        appearance.viewLayout = storedSingleMetricViewLayoutByResolved[patch.viewLayout];
    }
    if (patch.circleStyle !== undefined) {
        appearance.circleStyle = storedCircleStyleByResolved[patch.circleStyle];
    }
    if (patch.theme !== undefined) {
        appearance.theme = storedThemeByResolved[patch.theme];
    }
    if (patch.colorMode !== undefined) {
        appearance.colorMode = storedColorModeByResolved[patch.colorMode];
    }
    if (patch.lowColorThresholdPercent !== undefined) {
        appearance.lowColorThresholdPercent = patch.lowColorThresholdPercent;
    }
    if (patch.highColorThresholdPercent !== undefined) {
        appearance.highColorThresholdPercent = patch.highColorThresholdPercent;
    }
    if (patch.lineSmoothingPercent !== undefined) {
        appearance.lineSmoothingPercent = patch.lineSmoothingPercent;
    }
    if (patch.gridLineVisibility !== undefined) {
        appearance.gridLineVisibility = storedGridLineVisibilityByResolved[patch.gridLineVisibility];
    }
    if (patch.gridLineType !== undefined) {
        appearance.gridLineType = storedGridLineTypeByResolved[patch.gridLineType];
    }

    applyAppearanceColorRampPatch(appearance, "usageColors", patch.usageColors);
    applyAppearanceColorRampPatch(appearance, "downloadColors", patch.downloadColors);
    applyAppearanceColorRampPatch(appearance, "uploadColors", patch.uploadColors);
    applyAppearanceColorRampPatch(appearance, "diskReadColors", patch.diskReadColors);
    applyAppearanceColorRampPatch(appearance, "diskWriteColors", patch.diskWriteColors);
}

function applyAppearanceColorRampPatch(
    appearance: StoredAppearanceSettings,
    rampKey: ColorRampKey,
    patch: ColorRampPatch | undefined,
): void {
    if (!patch) {
        return;
    }

    const colors = appearance[rampKey] ?? create(ColorRampSchema);
    appearance[rampKey] = colors;

    applyColorRampPatch(colors, patch);
}

function applyNetworkPatch(
    target: StoredNetworkMetricTarget,
    overrides: ReturnType<typeof ensureSlotOverrides>,
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
    overrides: ReturnType<typeof ensureSlotOverrides>,
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
    applyDefinedValue(target, "linearLabel", patch.linearLabel);

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

function ensureSlotOverrides(slot: StoredMetricSlot) {
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
