import {
    CircleViewVariant as StoredCircleViewVariant,
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
    TerminalThemeVariant as StoredTerminalThemeVariant,
    ScaleMode as StoredScaleMode,
    MetricView as StoredMetricView,
    LineAppearanceSettings_GridLineType as StoredGridLineType,
    LineAppearanceSettings_GridLineVisibility as StoredGridLineVisibility,
    TemperatureUnit as StoredTemperatureUnit,
    type AppearanceSettings as StoredAppearanceSettings,
    type AppearancePaintSettings as StoredAppearancePaintSettings,
    type AppearanceThemeSettings as StoredAppearanceThemeSettings,
    type AppearanceViewSettings as StoredAppearanceViewSettings,
    type CatalogMetricTarget as StoredCatalogMetricTarget,
    type ColorFilledMultiColorPaintSettings as StoredColorFilledMultiColorPaintSettings,
    type ColorFilledPaintSettings as StoredColorFilledPaintSettings,
    type ColorFilledSolidPaintSettings as StoredColorFilledSolidPaintSettings,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type DiskThroughputDisplaySettings as StoredDiskThroughputDisplaySettings,
    type GlobalMetricPaintSettings as StoredGlobalMetricPaintSettings,
    type GlobalMultiColorPaintSettings as StoredGlobalMultiColorPaintSettings,
    type GlobalPaintOverride as StoredGlobalPaintOverride,
    type GlobalSolidPaintSettings as StoredGlobalSolidPaintSettings,
    type GlobalThemeOverride as StoredGlobalThemeOverride,
    type GlobalViewOverride as StoredGlobalViewOverride,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type MetricPaintSettings as StoredMetricPaintSettings,
    type MetricMultiColorPaintSettings as StoredMetricMultiColorPaintSettings,
    type MetricSolidPaintSettings as StoredMetricSolidPaintSettings,
    type MultiColorSet as StoredMultiColorSet,
    type MetricSelection as StoredMetricSelection,
    type MetricSlot as StoredMetricSlot,
    type MetricSourcePolicy as StoredMetricSourcePolicy,
    type MetricSourceProfile as StoredMetricSourceProfile,
    type NetworkDisplaySettings as StoredNetworkDisplaySettings,
    type NetworkMetricTarget as StoredNetworkMetricTarget,
    type TerminalThemeSettings as StoredTerminalThemeSettings,
    type StoredGlobalSettings,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    CircleViewVariant,
    ColorMode,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    GridLineType,
    GridLineVisibility,
    MetricTheme,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    TerminalThemeVariant,
    ResolvedAppearanceSettings,
    ResolvedCatalogMetricTarget,
    ResolvedAppearancePaintSettings,
    ResolvedAppearanceThemeSettings,
    ResolvedAppearanceViewSettings,
    ResolvedColorFilledMultiColorPaintSettings,
    ResolvedColorFilledPaintSettings,
    ResolvedColorFilledSolidPaintSettings,
    ResolvedDiskReading,
    ResolvedDiskThroughputDisplaySettings,
    ResolvedGlobalDefaults,
    ResolvedGlobalSettings,
    ResolvedGlobalThemeOverride,
    ResolvedGlobalViewOverride,
    ResolvedGlobalMetricPaintSettings,
    ResolvedGlobalMultiColorPaintSettings,
    ResolvedGlobalPaintOverride,
    ResolvedGlobalSolidPaintSettings,
    ResolvedGpuReading,
    ResolvedHttpMetricSourceConnection,
    ResolvedMemoryReading,
    ResolvedMetricPaintSettings,
    ResolvedMetricMultiColorPaintSettings,
    ResolvedMetricSolidPaintSettings,
    ResolvedMetric,
    ResolvedMetricSlot,
    ResolvedMetricSourceConnection,
    ResolvedMetricSourcePolicy,
    ResolvedMetricSourceProfile,
    ResolvedMetricTarget,
    ResolvedMultiColorSet,
    ResolvedNetworkDisplaySettings,
    ResolvedNetworkReading,
    ResolvedTerminalThemeSettings,
    ResolvedLineAppearanceSettings,
    ResolvedWidgetPreferences,
    ResolvedWidgetSettings,
    ScaleMode,
    MetricView,
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

const metricViewByProto = {
    [StoredMetricView.UNSPECIFIED]: undefined,
    [StoredMetricView.CIRCLE]: "circle",
    [StoredMetricView.TEXT]: "text",
    [StoredMetricView.BAR]: "bar",
    [StoredMetricView.LINE]: "line",
} satisfies Record<StoredMetricView, MetricView | undefined>;

const circleViewVariantByProto = {
    [StoredCircleViewVariant.UNSPECIFIED]: undefined,
    [StoredCircleViewVariant.FULL_RING]: "full-ring",
    [StoredCircleViewVariant.MINIMAL]: "minimal",
    [StoredCircleViewVariant.GAUGE]: "gauge",
} satisfies Record<StoredCircleViewVariant, CircleViewVariant | undefined>;

const metricThemeByProto = {
    [StoredMetricTheme.UNSPECIFIED]: undefined,
    [StoredMetricTheme.FLAT]: "flat",
    [StoredMetricTheme.CUPERTINO_GLASS]: "cupertino-glass",
    [StoredMetricTheme.COLOR_FILLED]: "color-filled",
    [StoredMetricTheme.TERMINAL]: "terminal",
} satisfies Record<StoredMetricTheme, MetricTheme | undefined>;

const terminalThemeVariantByProto = {
    [StoredTerminalThemeVariant.UNSPECIFIED]: undefined,
    [StoredTerminalThemeVariant.CLEAN]: "clean",
    [StoredTerminalThemeVariant.VINTAGE]: "vintage",
} satisfies Record<StoredTerminalThemeVariant, TerminalThemeVariant | undefined>;

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
    const viewOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.view?.enabled ?? true);
    const themeOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.theme?.enabled ?? true);
    const paintOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.paint?.enabled ?? true);

    return {
        defaults: resolveGlobalDefaults(storedGlobalSettings),
        globalOverrideEnabled,
        viewOverride: viewOverrideEnabled
            ? resolveGlobalViewOverride(storedOverrides?.view)
            : undefined,
        themeOverride: themeOverrideEnabled
            ? resolveGlobalThemeOverride(storedOverrides?.theme)
            : undefined,
        paintOverride: paintOverrideEnabled
            ? resolveGlobalPaintOverride(storedOverrides?.paint)
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
    const appearanceWithViewOverride = globalSettings.viewOverride
        ? applyGlobalViewOverride(slotAppearance, globalSettings.viewOverride)
        : slotAppearance;
    const appearanceWithThemeOverride = globalSettings.themeOverride
        ? applyGlobalThemeOverride(appearanceWithViewOverride, globalSettings.themeOverride)
        : appearanceWithViewOverride;
    const appearance = globalSettings.paintOverride
        ? applyGlobalPaintOverride(appearanceWithThemeOverride, globalSettings.paintOverride)
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
                barLabel: storedTarget.barLabel ?? "",
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

function resolveGlobalViewOverride(
    storedOverride: StoredGlobalViewOverride | undefined,
): ResolvedGlobalViewOverride {
    return {
        view: resolveAppearanceViewSettings(DEFAULT_APPEARANCE_SETTINGS.view, storedOverride?.view),
    };
}

function resolveGlobalThemeOverride(
    storedOverride: StoredGlobalThemeOverride | undefined,
): ResolvedGlobalThemeOverride {
    return {
        theme: resolveAppearanceThemeSettings(DEFAULT_APPEARANCE_SETTINGS.theme, storedOverride?.theme),
    };
}

function resolveGlobalPaintOverride(
    storedOverride: StoredGlobalPaintOverride | undefined,
): ResolvedGlobalPaintOverride {
    return {
        metric: resolveGlobalMetricPaintSettings(storedOverride?.metric),
        colorFilled: resolveColorFilledPaintSettings(
            DEFAULT_APPEARANCE_SETTINGS.paint.colorFilled,
            storedOverride?.colorFilled,
        ),
    };
}

function resolveGlobalMetricPaintSettings(
    storedMetric: StoredGlobalMetricPaintSettings | undefined,
): ResolvedGlobalMetricPaintSettings {
    return {
        colorMode: resolveStoredEnum(storedMetric?.colorMode, colorModeByProto, "solid"),
        solid: resolveGlobalSolidPaintSettings(storedMetric?.solid),
        multiColor: resolveGlobalMultiColorPaintSettings(storedMetric?.multiColor),
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
        view: resolveAppearanceViewSettings(defaults.view, storedAppearance?.view),
        theme: resolveAppearanceThemeSettings(defaults.theme, storedAppearance?.theme),
        paint: resolveAppearancePaintSettings(defaults.paint, storedAppearance?.paint),
        line: resolveLineAppearanceSettings(defaults.line, storedAppearance?.line),
    };
}

function resolveAppearanceViewSettings(
    defaults: ResolvedAppearanceViewSettings,
    storedView: StoredAppearanceViewSettings | undefined,
): ResolvedAppearanceViewSettings {
    return {
        selectedView: resolveStoredEnum(storedView?.selectedView, metricViewByProto, defaults.selectedView),
        circleVariant: resolveStoredEnum(
            storedView?.circleVariant,
            circleViewVariantByProto,
            defaults.circleVariant,
        ),
    };
}

function resolveAppearanceThemeSettings(
    defaults: ResolvedAppearanceThemeSettings,
    storedTheme: StoredAppearanceThemeSettings | undefined,
): ResolvedAppearanceThemeSettings {
    return {
        selectedTheme: resolveStoredEnum(storedTheme?.selectedTheme, metricThemeByProto, defaults.selectedTheme),
        terminal: resolveTerminalThemeSettings(defaults.terminal, storedTheme?.terminal),
    };
}

function resolveTerminalThemeSettings(
    defaults: ResolvedTerminalThemeSettings,
    storedTerminal: StoredTerminalThemeSettings | undefined,
): ResolvedTerminalThemeSettings {
    return {
        variant: resolveStoredEnum(storedTerminal?.variant, terminalThemeVariantByProto, defaults.variant),
    };
}

function resolveAppearancePaintSettings(
    defaults: ResolvedAppearancePaintSettings,
    storedPaint: StoredAppearancePaintSettings | undefined,
): ResolvedAppearancePaintSettings {
    return {
        metric: resolveMetricPaintSettings(defaults.metric, storedPaint?.metric),
        colorFilled: resolveColorFilledPaintSettings(defaults.colorFilled, storedPaint?.colorFilled),
    };
}

function resolveColorFilledPaintSettings(
    defaults: ResolvedColorFilledPaintSettings,
    storedPaint: StoredColorFilledPaintSettings | undefined,
): ResolvedColorFilledPaintSettings {
    return {
        colorMode: resolveStoredEnum(storedPaint?.colorMode, colorModeByProto, defaults.colorMode),
        solid: resolveColorFilledSolidPaintSettings(defaults.solid, storedPaint?.solid),
        multiColor: resolveColorFilledMultiColorPaintSettings(defaults.multiColor, storedPaint?.multiColor),
    };
}

function resolveColorFilledSolidPaintSettings(
    defaults: ResolvedColorFilledSolidPaintSettings,
    storedSolid: StoredColorFilledSolidPaintSettings | undefined,
): ResolvedColorFilledSolidPaintSettings {
    return {
        color: storedSolid?.color ?? defaults.color,
        isGradientEnabled: storedSolid?.gradientEnabled ?? defaults.isGradientEnabled,
    };
}

function resolveColorFilledMultiColorPaintSettings(
    defaults: ResolvedColorFilledMultiColorPaintSettings,
    storedMultiColor: StoredColorFilledMultiColorPaintSettings | undefined,
): ResolvedColorFilledMultiColorPaintSettings {
    return {
        colors: resolveMultiColorSet(defaults.colors, storedMultiColor?.colors),
        isGradientEnabled: storedMultiColor?.gradientEnabled ?? defaults.isGradientEnabled,
    };
}

function resolveMetricPaintSettings(
    defaults: ResolvedMetricPaintSettings,
    storedMetricPaint: StoredMetricPaintSettings | undefined,
): ResolvedMetricPaintSettings {
    return {
        colorMode: resolveStoredEnum(storedMetricPaint?.colorMode, colorModeByProto, defaults.colorMode),
        solid: resolveMetricSolidPaintSettings(defaults.solid, storedMetricPaint?.solid),
        multiColor: resolveMetricMultiColorPaintSettings(defaults.multiColor, storedMetricPaint?.multiColor),
    };
}

function resolveMetricSolidPaintSettings(
    defaults: ResolvedMetricSolidPaintSettings,
    storedSolid: StoredMetricSolidPaintSettings | undefined,
): ResolvedMetricSolidPaintSettings {
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

function resolveMetricMultiColorPaintSettings(
    defaults: ResolvedMetricMultiColorPaintSettings,
    storedMultiColor: StoredMetricMultiColorPaintSettings | undefined,
): ResolvedMetricMultiColorPaintSettings {
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

function resolveLineAppearanceSettings(
    defaults: ResolvedLineAppearanceSettings,
    storedLine: StoredAppearanceSettings["line"] | undefined,
): ResolvedLineAppearanceSettings {
    return {
        lineSmoothingPercent: storedLine?.lineSmoothingPercent ?? defaults.lineSmoothingPercent,
        gridLineVisibility: resolveStoredEnum(
            storedLine?.gridLineVisibility,
            gridLineVisibilityByProto,
            defaults.gridLineVisibility,
        ),
        gridLineType: resolveStoredEnum(storedLine?.gridLineType, gridLineTypeByProto, defaults.gridLineType),
    };
}

function resolveGlobalSolidPaintSettings(
    storedSolid: StoredGlobalSolidPaintSettings | undefined,
): ResolvedGlobalSolidPaintSettings {
    return {
        color: storedSolid?.color ?? DEFAULT_APPEARANCE_SETTINGS.paint.metric.solid.colors.usageColor,
        isGradientEnabled: storedSolid?.gradientEnabled
            ?? DEFAULT_APPEARANCE_SETTINGS.paint.metric.solid.isGradientEnabled,
    };
}

function resolveGlobalMultiColorPaintSettings(
    storedMultiColor: StoredGlobalMultiColorPaintSettings | undefined,
): ResolvedGlobalMultiColorPaintSettings {
    const defaults = DEFAULT_APPEARANCE_SETTINGS.paint.metric.multiColor;

    return {
        colors: resolveMultiColorSet(defaults.colors.usage, storedMultiColor?.colors),
        lowThresholdPercent: storedMultiColor?.lowThresholdPercent ?? defaults.lowThresholdPercent,
        highThresholdPercent: storedMultiColor?.highThresholdPercent ?? defaults.highThresholdPercent,
        isGradientEnabled: storedMultiColor?.gradientEnabled ?? defaults.isGradientEnabled,
    };
}

function applyGlobalViewOverride(
    appearance: ResolvedAppearanceSettings,
    viewOverride: ResolvedGlobalViewOverride,
): ResolvedAppearanceSettings {
    return {
        ...appearance,
        view: viewOverride.view,
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

function applyGlobalPaintOverride(
    appearance: ResolvedAppearanceSettings,
    paintOverride: ResolvedGlobalPaintOverride,
): ResolvedAppearanceSettings {
    return {
        ...appearance,
        paint: {
            metric: {
                colorMode: paintOverride.metric.colorMode,
                solid: {
                    isGradientEnabled: paintOverride.metric.solid.isGradientEnabled,
                    colors: {
                        usageColor: paintOverride.metric.solid.color,
                        downloadColor: paintOverride.metric.solid.color,
                        uploadColor: paintOverride.metric.solid.color,
                        diskReadColor: paintOverride.metric.solid.color,
                        diskWriteColor: paintOverride.metric.solid.color,
                    },
                },
                multiColor: {
                    lowThresholdPercent: paintOverride.metric.multiColor.lowThresholdPercent,
                    highThresholdPercent: paintOverride.metric.multiColor.highThresholdPercent,
                    isGradientEnabled: paintOverride.metric.multiColor.isGradientEnabled,
                    colors: {
                        usage: paintOverride.metric.multiColor.colors,
                        download: paintOverride.metric.multiColor.colors,
                        upload: paintOverride.metric.multiColor.colors,
                        diskRead: paintOverride.metric.multiColor.colors,
                        diskWrite: paintOverride.metric.multiColor.colors,
                    },
                },
            },
            colorFilled: paintOverride.colorFilled,
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
