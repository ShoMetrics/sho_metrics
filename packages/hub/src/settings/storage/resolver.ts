import {
    CircleStyle as StoredCircleStyle,
    ColorMode as StoredColorMode,
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    DiskMetricTarget_ThroughputDirection as StoredDiskThroughputDirection,
    DiskMetricTarget_UsageDisplayMode as StoredDiskUsageDisplayMode,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    MemoryMetricTarget_Kind as StoredMemoryMetricKind,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    MetricTheme as StoredMetricTheme,
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    NetworkMetricTarget_Direction as StoredNetworkDirection,
    NetworkMetricTarget_TrafficDisplayMode as StoredNetworkTrafficDisplayMode,
    ScaleMode as StoredScaleMode,
    SingleMetricViewLayout as StoredSingleMetricViewLayout,
    SparklineAppearanceSettings_GridLineType as StoredGridLineType,
    SparklineAppearanceSettings_GridLineVisibility as StoredGridLineVisibility,
    TemperatureUnit as StoredTemperatureUnit,
    type AppearanceSettings as StoredAppearanceSettings,
    type AppearanceGraphSettings as StoredAppearanceGraphSettings,
    type AppearanceThemeSettings as StoredAppearanceThemeSettings,
    type CatalogMetricTarget as StoredCatalogMetricTarget,
    type ColorFilledMultiColorSettings as StoredColorFilledMultiColorSettings,
    type ColorFilledSolidSettings as StoredColorFilledSolidSettings,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type DiskThroughputDisplaySettings as StoredDiskThroughputDisplaySettings,
    type GlobalColorOverride as StoredGlobalColorOverride,
    type GlobalGraphOverride as StoredGlobalGraphOverride,
    type GlobalMultiColorSettings as StoredGlobalMultiColorSettings,
    type GlobalSolidColorSettings as StoredGlobalSolidColorSettings,
    type GlobalThemeOverride as StoredGlobalThemeOverride,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type MetricColorSettings as StoredMetricColorSettings,
    type MetricMultiColorSettings as StoredMetricMultiColorSettings,
    type MetricSolidColorSettings as StoredMetricSolidColorSettings,
    type MultiColorSet as StoredMultiColorSet,
    type MetricSelection as StoredMetricSelection,
    type MetricSlot as StoredMetricSlot,
    type MetricSourcePolicy as StoredMetricSourcePolicy,
    type MetricSourceProfile as StoredMetricSourceProfile,
    type NetworkDisplaySettings as StoredNetworkDisplaySettings,
    type NetworkMetricTarget as StoredNetworkMetricTarget,
    type StoredGlobalSettings,
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
    ResolvedAppearanceSettings,
    ResolvedCatalogMetricTarget,
    ResolvedAppearanceGraphSettings,
    ResolvedAppearanceThemeSettings,
    ResolvedColorFilledMultiColorSettings,
    ResolvedColorFilledSolidSettings,
    ResolvedDiskReading,
    ResolvedDiskThroughputDisplaySettings,
    ResolvedGlobalColorOverride,
    ResolvedGlobalDefaults,
    ResolvedGlobalGraphOverride,
    ResolvedGlobalSettings,
    ResolvedGlobalThemeOverride,
    ResolvedGlobalMultiColorSettings,
    ResolvedGlobalSolidColorSettings,
    ResolvedGpuReading,
    ResolvedHttpMetricSourceConnection,
    ResolvedMemoryReading,
    ResolvedMetricColorSettings,
    ResolvedMetricMultiColorSettings,
    ResolvedMetricSolidColorSettings,
    ResolvedMetric,
    ResolvedMetricSlot,
    ResolvedMetricSourceConnection,
    ResolvedMetricSourcePolicy,
    ResolvedMetricSourceProfile,
    ResolvedMetricTarget,
    ResolvedMultiColorSet,
    ResolvedNetworkDisplaySettings,
    ResolvedNetworkReading,
    ResolvedSparklineAppearanceSettings,
    ResolvedWidgetPreferences,
    ResolvedWidgetSettings,
    ScaleMode,
    SingleMetricViewLayout,
    SourceFailureMode,
    TemperatureUnit,
} from "../resolved-settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "../default-appearance-settings";

export interface ResolveStoredWidgetSettingsOptions {
    readonly storedWidgetSettings: StoredWidgetSettings;
    readonly storedGlobalSettings?: StoredGlobalSettings | undefined;
    readonly runtime?: ResolveStoredSettingsRuntimeContext | undefined;
}

export interface ResolveStoredSettingsRuntimeContext {
    readonly isWindows?: boolean;
    readonly runtimeMaximumDownloadSpeedMegabitsPerSecond?: number | undefined;
    readonly runtimeMaximumUploadSpeedMegabitsPerSecond?: number | undefined;
    readonly runtimeMaximumDiskReadThroughputMebibytesPerSecond?: number | undefined;
    readonly runtimeMaximumDiskWriteThroughputMebibytesPerSecond?: number | undefined;
    readonly runtimeMaximumGpuPowerWatts?: number | undefined;
}

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

const DEFAULT_WIDGET_PREFERENCES: ResolvedWidgetPreferences = {
    pollingFrequencySeconds: 1,
};

const DEFAULT_GPU_TEMPERATURE_CELSIUS = 100;
const DEFAULT_GPU_POWER_WATTS = 300;
const DEFAULT_DISK_USAGE_POLLING_FREQUENCY_SECONDS = 60;

const sourceFailureModeByProto = {
    [StoredSourceFailureMode.UNSPECIFIED]: undefined,
    [StoredSourceFailureMode.SHOW_UNAVAILABLE]: "showUnavailable",
    [StoredSourceFailureMode.USE_FALLBACK]: "useFallback",
} satisfies Record<StoredSourceFailureMode, SourceFailureMode | undefined>;

const singleMetricViewLayoutByProto = {
    [StoredSingleMetricViewLayout.UNSPECIFIED]: undefined,
    [StoredSingleMetricViewLayout.CIRCULAR]: "circular",
    [StoredSingleMetricViewLayout.TEXT]: "text",
    [StoredSingleMetricViewLayout.LINEAR]: "linear",
    [StoredSingleMetricViewLayout.SPARKLINE]: "sparkline",
} satisfies Record<StoredSingleMetricViewLayout, SingleMetricViewLayout | undefined>;

const circleStyleByProto = {
    [StoredCircleStyle.UNSPECIFIED]: undefined,
    [StoredCircleStyle.VALUE]: "value",
    [StoredCircleStyle.COMPACT]: "compact",
    [StoredCircleStyle.GAUGE]: "gauge",
} satisfies Record<StoredCircleStyle, CircleStyle | undefined>;

const metricThemeByProto = {
    [StoredMetricTheme.UNSPECIFIED]: undefined,
    [StoredMetricTheme.FLAT]: "flat",
    [StoredMetricTheme.CUPERTINO_GLASS]: "cupertino-glass",
    [StoredMetricTheme.COLOR_FILLED]: "color-filled",
} satisfies Record<StoredMetricTheme, MetricTheme | undefined>;

const colorModeByProto = {
    [StoredColorMode.UNSPECIFIED]: undefined,
    [StoredColorMode.MULTI_COLOR]: "multi-color",
    [StoredColorMode.SOLID]: "solid",
    [StoredColorMode.BLACK_WHITE]: "black-white",
} satisfies Record<StoredColorMode, ColorMode | undefined>;

const gridLineVisibilityByProto = {
    [StoredGridLineVisibility.UNSPECIFIED]: undefined,
    [StoredGridLineVisibility.ADAPTIVE]: "adaptive",
    [StoredGridLineVisibility.ALWAYS]: "always",
    [StoredGridLineVisibility.NONE]: "none",
} satisfies Record<StoredGridLineVisibility, GridLineVisibility | undefined>;

const gridLineTypeByProto = {
    [StoredGridLineType.UNSPECIFIED]: undefined,
    [StoredGridLineType.HORIZONTAL]: "horizontal",
    [StoredGridLineType.VERTICAL]: "vertical",
} satisfies Record<StoredGridLineType, GridLineType | undefined>;

const scaleModeByProto = {
    [StoredScaleMode.UNSPECIFIED]: undefined,
    [StoredScaleMode.AUTO]: "auto",
    [StoredScaleMode.CUSTOM]: "custom",
} satisfies Record<StoredScaleMode, ScaleMode | undefined>;

const temperatureUnitByProto = {
    [StoredTemperatureUnit.UNSPECIFIED]: undefined,
    [StoredTemperatureUnit.CELSIUS]: "celsius",
    [StoredTemperatureUnit.FAHRENHEIT]: "fahrenheit",
} satisfies Record<StoredTemperatureUnit, TemperatureUnit | undefined>;

const networkDirectionByProto = {
    [StoredNetworkDirection.UNSPECIFIED]: undefined,
    [StoredNetworkDirection.BOTH]: "both",
    [StoredNetworkDirection.DOWNLOAD]: "download",
    [StoredNetworkDirection.UPLOAD]: "upload",
} satisfies Record<StoredNetworkDirection, NetworkDirection | undefined>;

const networkTrafficDisplayModeByProto = {
    [StoredNetworkTrafficDisplayMode.UNSPECIFIED]: undefined,
    [StoredNetworkTrafficDisplayMode.MIRRORED]: "mirrored",
    [StoredNetworkTrafficDisplayMode.OVERLAY]: "overlay",
} satisfies Record<StoredNetworkTrafficDisplayMode, NetworkTrafficDisplayMode | undefined>;

const networkUnitBaseByProto = {
    [StoredNetworkUnitBase.UNSPECIFIED]: undefined,
    [StoredNetworkUnitBase.BYTE]: "byte",
    [StoredNetworkUnitBase.BIT]: "bit",
} satisfies Record<StoredNetworkUnitBase, NetworkUnitBase | undefined>;

const diskUsageDisplayModeByProto = {
    [StoredDiskUsageDisplayMode.UNSPECIFIED]: undefined,
    [StoredDiskUsageDisplayMode.PERCENTAGE]: "percentage",
    [StoredDiskUsageDisplayMode.SPACE]: "space",
} satisfies Record<StoredDiskUsageDisplayMode, DiskUsageDisplayMode | undefined>;

const diskThroughputDirectionByProto = {
    [StoredDiskThroughputDirection.UNSPECIFIED]: undefined,
    [StoredDiskThroughputDirection.BOTH]: "both",
    [StoredDiskThroughputDirection.TOTAL]: "total",
    [StoredDiskThroughputDirection.READ]: "read",
    [StoredDiskThroughputDirection.WRITE]: "write",
} satisfies Record<StoredDiskThroughputDirection, DiskThroughputDirection | undefined>;

function resolveStoredEnum<StoredValue extends number, ResolvedValue>(
    storedValue: StoredValue | undefined,
    resolvedValueByStoredValue: Record<StoredValue, ResolvedValue | undefined>,
    defaultValue: ResolvedValue,
): ResolvedValue {
    if (storedValue === undefined) {
        return defaultValue;
    }

    const resolvedValue = resolvedValueByStoredValue[storedValue];
    if (resolvedValue === undefined) {
        return throwUnexpectedStoredSettingsState("Unexpected UNSPECIFIED enum value after protovalidate.");
    }

    return resolvedValue;
}

export function resolveStoredWidgetSettings(
    options: ResolveStoredWidgetSettingsOptions,
): ResolvedWidgetSettings {
    const globalSettings = resolveStoredGlobalSettings(options.storedGlobalSettings);
    const slot = resolveMetricSlot(
        resolveStoredSingleMetricSlot(options.storedWidgetSettings),
        globalSettings,
        options.runtime,
    );

    return {
        widget: {
            widgetKind: "singleMetric",
            slot,
        },
        preferences: resolveWidgetPreferences(options.storedWidgetSettings, slot.metric.target),
    };
}

export function resolveStoredGlobalSettings(
    storedGlobalSettings: StoredGlobalSettings | undefined,
): ResolvedGlobalSettings {
    const storedOverrides = storedGlobalSettings?.overrides;
    const globalOverrideEnabled = storedOverrides?.enabled === true;
    const graphOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.graph?.enabled ?? true);
    const themeOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.theme?.enabled ?? true);
    const colorOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.color?.enabled ?? true);

    return {
        defaults: resolveGlobalDefaults(storedGlobalSettings),
        globalOverrideEnabled,
        graphOverride: graphOverrideEnabled
            ? resolveGlobalGraphOverride(storedOverrides?.graph)
            : undefined,
        themeOverride: themeOverrideEnabled
            ? resolveGlobalThemeOverride(storedOverrides?.theme)
            : undefined,
        colorOverride: colorOverrideEnabled
            ? resolveGlobalColorOverride(storedOverrides?.color)
            : undefined,
        sourceProfiles: (storedGlobalSettings?.sourceProfiles ?? []).map(resolveMetricSourceProfile),
        defaultSourceProfileId: storedGlobalSettings?.defaultSourceProfileId,
    };
}

function resolveStoredSingleMetricSlot(storedWidgetSettings: StoredWidgetSettings): StoredMetricSlot | undefined {
    switch (storedWidgetSettings.widget.case) {
        case "singleMetric":
            return storedWidgetSettings.widget.value.slot;
        case undefined:
            return undefined;
    }
}

function resolveMetricSlot(
    storedSlot: StoredMetricSlot | undefined,
    globalSettings: ResolvedGlobalSettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedMetricSlot {
    const networkDisplay = resolveNetworkDisplaySettings(
        globalSettings.defaults.network,
        storedSlot?.overrides?.network,
        runtime,
    );
    const diskThroughputDisplay = resolveDiskThroughputDisplaySettings(
        globalSettings.defaults.diskThroughput,
        storedSlot?.overrides?.diskThroughput,
        runtime,
    );
    const slotAppearance = mergeAppearanceSettings(
        DEFAULT_APPEARANCE_SETTINGS,
        storedSlot?.overrides?.appearance,
    );
    const appearanceWithGraphOverride = globalSettings.graphOverride
        ? applyGlobalGraphOverride(slotAppearance, globalSettings.graphOverride)
        : slotAppearance;
    const appearanceWithThemeOverride = globalSettings.themeOverride
        ? applyGlobalThemeOverride(appearanceWithGraphOverride, globalSettings.themeOverride)
        : appearanceWithGraphOverride;
    const appearance = globalSettings.colorOverride
        ? applyGlobalColorOverride(appearanceWithThemeOverride, globalSettings.colorOverride)
        : appearanceWithThemeOverride;

    return {
        metric: resolveMetricSelection(
            storedSlot?.metric,
            networkDisplay,
            diskThroughputDisplay,
            runtime,
        ),
        appearance,
    };
}

function resolveMetricSelection(
    storedMetricSelection: StoredMetricSelection | undefined,
    networkDisplay: ResolvedNetworkDisplaySettings,
    diskThroughputDisplay: ResolvedDiskThroughputDisplaySettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedMetric {
    return {
        source: resolveMetricSourcePolicy(storedMetricSelection?.sourcePolicy),
        target: resolveMetricTarget(
            storedMetricSelection,
            networkDisplay,
            diskThroughputDisplay,
            runtime,
        ),
    };
}

function resolveMetricTarget(
    storedMetricSelection: StoredMetricSelection | undefined,
    networkDisplay: ResolvedNetworkDisplaySettings,
    diskThroughputDisplay: ResolvedDiskThroughputDisplaySettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedMetricTarget {
    switch (storedMetricSelection?.target.case) {
        case "cpu":
            return resolveCpuMetricTarget(storedMetricSelection.target.value.kind);
        case "memory":
            return resolveMemoryMetricTarget(storedMetricSelection.target.value.kind);
        case "network":
            return resolveNetworkMetricTarget(storedMetricSelection.target.value, networkDisplay);
        case "disk":
            return resolveDiskMetricTarget(storedMetricSelection.target.value, diskThroughputDisplay, runtime);
        case "gpu":
            return resolveGpuMetricTarget(storedMetricSelection.target.value, runtime);
        case "catalog":
            return resolveCatalogMetricTarget(storedMetricSelection.target.value);
        case undefined:
            return resolveCpuMetricTarget(undefined);
    }
}

function resolveCpuMetricTarget(kind: StoredCpuMetricKind | undefined): ResolvedMetricTarget {
    switch (kind) {
        case StoredCpuMetricKind.USAGE:
        case undefined:
            return {
                domain: "cpu",
                reading: { kind: "usage" },
            };
        case StoredCpuMetricKind.UNSPECIFIED:
            return throwUnexpectedStoredSettingsState("Unexpected CPU metric kind after protovalidate.");
    }
}

function resolveMemoryMetricTarget(kind: StoredMemoryMetricKind | undefined): ResolvedMetricTarget {
    switch (kind) {
        case StoredMemoryMetricKind.USAGE:
        case undefined:
            return {
                domain: "memory",
                reading: { kind: "usage" } satisfies ResolvedMemoryReading,
            };
        case StoredMemoryMetricKind.UNSPECIFIED:
            return throwUnexpectedStoredSettingsState("Unexpected memory metric kind after protovalidate.");
    }
}

function resolveNetworkMetricTarget(
    storedTarget: StoredNetworkMetricTarget,
    display: ResolvedNetworkDisplaySettings,
): ResolvedMetricTarget {
    const reading: ResolvedNetworkReading = {
        kind: "traffic",
        direction: resolveStoredEnum(storedTarget.direction, networkDirectionByProto, "both"),
        trafficDisplayMode: resolveStoredEnum(
            storedTarget.trafficDisplayMode,
            networkTrafficDisplayModeByProto,
            "mirrored",
        ),
        display,
    };

    return {
        domain: "network",
        interfaceId: storedTarget.interfaceId,
        reading,
    };
}

function resolveDiskMetricTarget(
    storedTarget: StoredDiskMetricTarget,
    display: ResolvedDiskThroughputDisplaySettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedMetricTarget {
    return {
        domain: "disk",
        volumeId: storedTarget.volumeId,
        reading: resolveDiskReading(storedTarget, display, runtime),
    };
}

function resolveDiskReading(
    storedTarget: StoredDiskMetricTarget,
    display: ResolvedDiskThroughputDisplaySettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedDiskReading {
    const kind = runtime?.isWindows === true && storedTarget.kind === StoredDiskMetricKind.THROUGHPUT
        ? StoredDiskMetricKind.USAGE
        : storedTarget.kind;

    switch (kind) {
        case StoredDiskMetricKind.THROUGHPUT:
            return {
                kind: "throughput",
                direction: resolveStoredEnum(
                    storedTarget.throughputDirection,
                    diskThroughputDirectionByProto,
                    "both",
                ),
                display,
            };
        case StoredDiskMetricKind.USAGE:
        case undefined:
            return {
                kind: "usage",
                displayMode: resolveStoredEnum(
                    storedTarget.usageDisplayMode,
                    diskUsageDisplayModeByProto,
                    "percentage",
                ),
                linearLabel: storedTarget.linearLabel ?? "",
            };
        case StoredDiskMetricKind.UNSPECIFIED:
            return throwUnexpectedStoredSettingsState("Unexpected disk metric kind after protovalidate.");
    }
}

function resolveGpuMetricTarget(
    storedTarget: StoredGpuMetricTarget,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedMetricTarget {
    return {
        domain: "gpu",
        gpuId: storedTarget.gpuId,
        reading: resolveGpuReading(storedTarget, runtime),
    };
}

function resolveGpuReading(
    storedTarget: StoredGpuMetricTarget,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedGpuReading {
    switch (storedTarget.kind) {
        case StoredGpuMetricKind.TEMPERATURE:
            return {
                kind: "temperature",
                maximumCelsius: storedTarget.maximumTemperatureCelsius ?? DEFAULT_GPU_TEMPERATURE_CELSIUS,
                unit: resolveStoredEnum(storedTarget.temperatureUnit, temperatureUnitByProto, "celsius"),
            };
        case StoredGpuMetricKind.VRAM:
            return { kind: "vram" };
        case StoredGpuMetricKind.POWER:
            return {
                kind: "power",
                maximumWatts: resolveGpuPowerMaximumWatts(
                    storedTarget.maximumPowerWatts,
                    runtime?.runtimeMaximumGpuPowerWatts,
                ),
            };
        case StoredGpuMetricKind.USAGE:
        case undefined:
            return { kind: "usage" };
        case StoredGpuMetricKind.UNSPECIFIED:
            return throwUnexpectedStoredSettingsState("Unexpected GPU metric kind after protovalidate.");
    }
}

function resolveCatalogMetricTarget(storedTarget: StoredCatalogMetricTarget): ResolvedCatalogMetricTarget {
    return {
        domain: "catalog",
        metricId: storedTarget.metricId ?? "",
        fallbackLabel: storedTarget.fallbackLabel,
        fallbackUnit: storedTarget.fallbackUnit,
    };
}

function resolveMetricSourcePolicy(
    storedSourcePolicy: StoredMetricSourcePolicy | undefined,
): ResolvedMetricSourcePolicy {
    return {
        primarySourceProfileId: storedSourcePolicy?.primarySourceProfileId,
        fallbackSourceProfileIds: [...(storedSourcePolicy?.fallbackSourceProfileIds ?? [])],
        failureMode: resolveStoredEnum(
            storedSourcePolicy?.failureMode,
            sourceFailureModeByProto,
            "showUnavailable",
        ),
    };
}

function resolveWidgetPreferences(
    storedWidgetSettings: StoredWidgetSettings,
    resolvedTarget: ResolvedMetricTarget,
): ResolvedWidgetPreferences {
    return {
        pollingFrequencySeconds: storedWidgetSettings.preferences?.pollingFrequencySeconds
            ?? defaultPollingFrequencySeconds(resolvedTarget),
    };
}

function defaultPollingFrequencySeconds(resolvedTarget: ResolvedMetricTarget): number {
    if (resolvedTarget.domain === "disk" && resolvedTarget.reading.kind === "usage") {
        return DEFAULT_DISK_USAGE_POLLING_FREQUENCY_SECONDS;
    }

    return DEFAULT_WIDGET_PREFERENCES.pollingFrequencySeconds;
}

function resolveGlobalDefaults(
    storedGlobalSettings: StoredGlobalSettings | undefined,
): ResolvedGlobalDefaults {
    return {
        network: resolveNetworkDisplayDefaults(storedGlobalSettings?.defaults?.network),
        diskThroughput: resolveDiskThroughputDisplayDefaults(storedGlobalSettings?.defaults?.diskThroughput),
    };
}

function resolveGlobalGraphOverride(
    storedOverride: StoredGlobalGraphOverride | undefined,
): ResolvedGlobalGraphOverride {
    return {
        graph: resolveAppearanceGraphSettings(DEFAULT_APPEARANCE_SETTINGS.graph, storedOverride?.graph),
    };
}

function resolveGlobalThemeOverride(
    storedOverride: StoredGlobalThemeOverride | undefined,
): ResolvedGlobalThemeOverride {
    return {
        theme: resolveAppearanceThemeSettings(DEFAULT_APPEARANCE_SETTINGS.theme, storedOverride?.theme),
    };
}

function resolveGlobalColorOverride(
    storedOverride: StoredGlobalColorOverride | undefined,
): ResolvedGlobalColorOverride {
    return {
        colorMode: resolveStoredEnum(storedOverride?.colorMode, colorModeByProto, "solid"),
        solid: resolveGlobalSolidColorSettings(storedOverride?.solid),
        multiColor: resolveGlobalMultiColorSettings(storedOverride?.multiColor),
    };
}

function resolveMetricSourceProfile(
    storedProfile: StoredMetricSourceProfile,
): ResolvedMetricSourceProfile {
    return {
        id: storedProfile.id ?? "",
        displayName: storedProfile.displayName ?? "",
        sourceTypeId: storedProfile.sourceTypeId ?? "",
        connection: resolveMetricSourceConnection(storedProfile),
    };
}

function resolveMetricSourceConnection(
    storedProfile: StoredMetricSourceProfile,
): ResolvedMetricSourceConnection | undefined {
    switch (storedProfile.connection.case) {
        case "http":
            return {
                connectionKind: "http",
                baseUrl: storedProfile.connection.value.baseUrl ?? "",
            } satisfies ResolvedHttpMetricSourceConnection;
        case undefined:
            return undefined;
    }
}

function mergeAppearanceSettings(
    defaults: ResolvedAppearanceSettings,
    storedAppearance: StoredAppearanceSettings | undefined,
): ResolvedAppearanceSettings {
    return {
        graph: resolveAppearanceGraphSettings(defaults.graph, storedAppearance?.graph),
        theme: resolveAppearanceThemeSettings(defaults.theme, storedAppearance?.theme),
        metricColor: resolveMetricColorSettings(defaults.metricColor, storedAppearance?.metricColor),
        sparkline: resolveSparklineAppearanceSettings(defaults.sparkline, storedAppearance?.sparkline),
    };
}

function resolveAppearanceGraphSettings(
    defaults: ResolvedAppearanceGraphSettings,
    storedGraph: StoredAppearanceGraphSettings | undefined,
): ResolvedAppearanceGraphSettings {
    return {
        viewLayout: resolveStoredEnum(storedGraph?.viewLayout, singleMetricViewLayoutByProto, defaults.viewLayout),
        circleStyle: resolveStoredEnum(storedGraph?.circleStyle, circleStyleByProto, defaults.circleStyle),
    };
}

function resolveAppearanceThemeSettings(
    defaults: ResolvedAppearanceThemeSettings,
    storedTheme: StoredAppearanceThemeSettings | undefined,
): ResolvedAppearanceThemeSettings {
    return {
        selectedTheme: resolveStoredEnum(storedTheme?.selectedTheme, metricThemeByProto, defaults.selectedTheme),
        colorFilled: {
            solid: resolveColorFilledSolidSettings(defaults.colorFilled.solid, storedTheme?.colorFilled?.solid),
            multiColor: resolveColorFilledMultiColorSettings(
                defaults.colorFilled.multiColor,
                storedTheme?.colorFilled?.multiColor,
            ),
        },
    };
}

function resolveColorFilledSolidSettings(
    defaults: ResolvedColorFilledSolidSettings,
    storedSolid: StoredColorFilledSolidSettings | undefined,
): ResolvedColorFilledSolidSettings {
    return {
        color: storedSolid?.color ?? defaults.color,
        isGradientEnabled: storedSolid?.gradientEnabled ?? defaults.isGradientEnabled,
    };
}

function resolveColorFilledMultiColorSettings(
    defaults: ResolvedColorFilledMultiColorSettings,
    storedMultiColor: StoredColorFilledMultiColorSettings | undefined,
): ResolvedColorFilledMultiColorSettings {
    return {
        colors: resolveMultiColorSet(defaults.colors, storedMultiColor?.colors),
        isGradientEnabled: storedMultiColor?.gradientEnabled ?? defaults.isGradientEnabled,
    };
}

function resolveMetricColorSettings(
    defaults: ResolvedMetricColorSettings,
    storedMetricColor: StoredMetricColorSettings | undefined,
): ResolvedMetricColorSettings {
    return {
        colorMode: resolveStoredEnum(storedMetricColor?.colorMode, colorModeByProto, defaults.colorMode),
        solid: resolveMetricSolidColorSettings(defaults.solid, storedMetricColor?.solid),
        multiColor: resolveMetricMultiColorSettings(defaults.multiColor, storedMetricColor?.multiColor),
    };
}

function resolveMetricSolidColorSettings(
    defaults: ResolvedMetricSolidColorSettings,
    storedSolid: StoredMetricSolidColorSettings | undefined,
): ResolvedMetricSolidColorSettings {
    const storedColors = storedSolid?.colors;

    return {
        isGradientEnabled: storedSolid?.gradientEnabled ?? defaults.isGradientEnabled,
        colors: {
            usageColor: storedColors?.usageColor ?? defaults.colors.usageColor,
            downloadColor: storedColors?.downloadColor ?? defaults.colors.downloadColor,
            uploadColor: storedColors?.uploadColor ?? defaults.colors.uploadColor,
            diskReadColor: storedColors?.diskReadColor ?? defaults.colors.diskReadColor,
            diskWriteColor: storedColors?.diskWriteColor ?? defaults.colors.diskWriteColor,
        },
    };
}

function resolveMetricMultiColorSettings(
    defaults: ResolvedMetricMultiColorSettings,
    storedMultiColor: StoredMetricMultiColorSettings | undefined,
): ResolvedMetricMultiColorSettings {
    const storedColors = storedMultiColor?.colors;

    return {
        lowThresholdPercent: storedMultiColor?.lowThresholdPercent ?? defaults.lowThresholdPercent,
        highThresholdPercent: storedMultiColor?.highThresholdPercent ?? defaults.highThresholdPercent,
        isGradientEnabled: storedMultiColor?.gradientEnabled ?? defaults.isGradientEnabled,
        colors: {
            usage: resolveMultiColorSet(defaults.colors.usage, storedColors?.usage),
            download: resolveMultiColorSet(defaults.colors.download, storedColors?.download),
            upload: resolveMultiColorSet(defaults.colors.upload, storedColors?.upload),
            diskRead: resolveMultiColorSet(defaults.colors.diskRead, storedColors?.diskRead),
            diskWrite: resolveMultiColorSet(defaults.colors.diskWrite, storedColors?.diskWrite),
        },
    };
}

function resolveSparklineAppearanceSettings(
    defaults: ResolvedSparklineAppearanceSettings,
    storedSparkline: StoredAppearanceSettings["sparkline"] | undefined,
): ResolvedSparklineAppearanceSettings {
    return {
        lineSmoothingPercent: storedSparkline?.lineSmoothingPercent ?? defaults.lineSmoothingPercent,
        gridLineVisibility: resolveStoredEnum(
            storedSparkline?.gridLineVisibility,
            gridLineVisibilityByProto,
            defaults.gridLineVisibility,
        ),
        gridLineType: resolveStoredEnum(storedSparkline?.gridLineType, gridLineTypeByProto, defaults.gridLineType),
    };
}

function resolveGlobalSolidColorSettings(
    storedSolid: StoredGlobalSolidColorSettings | undefined,
): ResolvedGlobalSolidColorSettings {
    return {
        color: storedSolid?.color ?? DEFAULT_APPEARANCE_SETTINGS.metricColor.solid.colors.usageColor,
        isGradientEnabled: storedSolid?.gradientEnabled ?? DEFAULT_APPEARANCE_SETTINGS.metricColor.solid.isGradientEnabled,
    };
}

function resolveGlobalMultiColorSettings(
    storedMultiColor: StoredGlobalMultiColorSettings | undefined,
): ResolvedGlobalMultiColorSettings {
    const defaults = DEFAULT_APPEARANCE_SETTINGS.metricColor.multiColor;

    return {
        colors: resolveMultiColorSet(defaults.colors.usage, storedMultiColor?.colors),
        lowThresholdPercent: storedMultiColor?.lowThresholdPercent ?? defaults.lowThresholdPercent,
        highThresholdPercent: storedMultiColor?.highThresholdPercent ?? defaults.highThresholdPercent,
        isGradientEnabled: storedMultiColor?.gradientEnabled ?? defaults.isGradientEnabled,
    };
}

function applyGlobalGraphOverride(
    appearance: ResolvedAppearanceSettings,
    graphOverride: ResolvedGlobalGraphOverride,
): ResolvedAppearanceSettings {
    return {
        ...appearance,
        graph: graphOverride.graph,
    };
}

function applyGlobalThemeOverride(
    appearance: ResolvedAppearanceSettings,
    themeOverride: ResolvedGlobalThemeOverride,
): ResolvedAppearanceSettings {
    return {
        ...appearance,
        theme: themeOverride.theme,
    };
}

function applyGlobalColorOverride(
    appearance: ResolvedAppearanceSettings,
    colorOverride: ResolvedGlobalColorOverride,
): ResolvedAppearanceSettings {
    return {
        ...appearance,
        metricColor: {
            colorMode: colorOverride.colorMode,
            solid: {
                isGradientEnabled: colorOverride.solid.isGradientEnabled,
                colors: {
                    usageColor: colorOverride.solid.color,
                    downloadColor: colorOverride.solid.color,
                    uploadColor: colorOverride.solid.color,
                    diskReadColor: colorOverride.solid.color,
                    diskWriteColor: colorOverride.solid.color,
                },
            },
            multiColor: {
                lowThresholdPercent: colorOverride.multiColor.lowThresholdPercent,
                highThresholdPercent: colorOverride.multiColor.highThresholdPercent,
                isGradientEnabled: colorOverride.multiColor.isGradientEnabled,
                colors: {
                    usage: colorOverride.multiColor.colors,
                    download: colorOverride.multiColor.colors,
                    upload: colorOverride.multiColor.colors,
                    diskRead: colorOverride.multiColor.colors,
                    diskWrite: colorOverride.multiColor.colors,
                },
            },
        },
    };
}

function resolveMultiColorSet(
    defaults: ResolvedMultiColorSet,
    storedColors: StoredMultiColorSet | undefined,
): ResolvedMultiColorSet {
    return {
        lowColor: storedColors?.lowColor ?? defaults.lowColor,
        mediumColor: storedColors?.mediumColor ?? defaults.mediumColor,
        highColor: storedColors?.highColor ?? defaults.highColor,
    };
}

function resolveNetworkDisplayDefaults(
    storedSettings: StoredNetworkDisplaySettings | undefined,
): ResolvedNetworkDisplaySettings {
    return resolveNetworkDisplaySettings(DEFAULT_NETWORK_DISPLAY_SETTINGS, storedSettings, undefined);
}

function resolveNetworkDisplaySettings(
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

function resolveDiskThroughputDisplayDefaults(
    storedSettings: StoredDiskThroughputDisplaySettings | undefined,
): ResolvedDiskThroughputDisplaySettings {
    return resolveDiskThroughputDisplaySettings(
        DEFAULT_DISK_THROUGHPUT_DISPLAY_SETTINGS,
        storedSettings,
        undefined,
    );
}

function resolveDiskThroughputDisplaySettings(
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

function resolveGpuPowerMaximumWatts(
    configuredMaximum: number | undefined,
    runtimeMaximum: number | undefined,
): number {
    return configuredMaximum
        ?? readPositiveRuntimeMaximum(runtimeMaximum)
        ?? DEFAULT_GPU_POWER_WATTS;
}

function readPositiveRuntimeMaximum(value: number | undefined): number | undefined {
    return value !== undefined && Number.isFinite(value) && value > 0
        ? value
        : undefined;
}

function throwUnexpectedStoredSettingsState(message: string): never {
    throw new Error(message);
}
