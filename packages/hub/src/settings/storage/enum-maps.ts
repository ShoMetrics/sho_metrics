import {
    CircleStyle as StoredCircleStyle,
    ColorMode as StoredColorMode,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    DiskMetricTarget_ThroughputDirection as StoredDiskThroughputDirection,
    DiskMetricTarget_UsageDisplayMode as StoredDiskUsageDisplayMode,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    MetricTheme as StoredMetricTheme,
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    NetworkMetricTarget_Direction as StoredNetworkDirection,
    NetworkMetricTarget_TrafficDisplayMode as StoredNetworkTrafficDisplayMode,
    ScaleMode as StoredScaleMode,
    SingleMetricViewLayout as StoredSingleMetricViewLayout,
    SparklineAppearanceSettings_GridLineType as StoredGridLineType,
    SparklineAppearanceSettings_GridLineVisibility as StoredGridLineVisibility,
    TemperatureUnit as StoredTemperatureUnit,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    CircleStyle,
    ColorMode,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    ResolvedGpuReading,
    GridLineType,
    GridLineVisibility,
    MetricTheme,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    ScaleMode,
    SingleMetricViewLayout,
    TemperatureUnit,
} from "../resolved-settings";

export const storedSingleMetricViewLayoutByResolved = {
    circular: StoredSingleMetricViewLayout.CIRCULAR,
    text: StoredSingleMetricViewLayout.TEXT,
    linear: StoredSingleMetricViewLayout.LINEAR,
    sparkline: StoredSingleMetricViewLayout.SPARKLINE,
} satisfies Record<SingleMetricViewLayout, StoredSingleMetricViewLayout>;

export const storedCircleStyleByResolved = {
    value: StoredCircleStyle.VALUE,
    compact: StoredCircleStyle.COMPACT,
    gauge: StoredCircleStyle.GAUGE,
} satisfies Record<CircleStyle, StoredCircleStyle>;

export const storedThemeByResolved = {
    flat: StoredMetricTheme.FLAT,
    "cupertino-glass": StoredMetricTheme.CUPERTINO_GLASS,
    "color-filled": StoredMetricTheme.COLOR_FILLED,
} satisfies Record<MetricTheme, StoredMetricTheme>;

export const storedColorModeByResolved = {
    "multi-color": StoredColorMode.MULTI_COLOR,
    solid: StoredColorMode.SOLID,
    "black-white": StoredColorMode.BLACK_WHITE,
} satisfies Record<ColorMode, StoredColorMode>;

export const storedGridLineVisibilityByResolved = {
    adaptive: StoredGridLineVisibility.ADAPTIVE,
    always: StoredGridLineVisibility.ALWAYS,
    none: StoredGridLineVisibility.NONE,
} satisfies Record<GridLineVisibility, StoredGridLineVisibility>;

export const storedGridLineTypeByResolved = {
    horizontal: StoredGridLineType.HORIZONTAL,
    vertical: StoredGridLineType.VERTICAL,
} satisfies Record<GridLineType, StoredGridLineType>;

export const storedScaleModeByResolved = {
    auto: StoredScaleMode.AUTO,
    custom: StoredScaleMode.CUSTOM,
} satisfies Record<ScaleMode, StoredScaleMode>;

export const storedNetworkDirectionByResolved = {
    both: StoredNetworkDirection.BOTH,
    download: StoredNetworkDirection.DOWNLOAD,
    upload: StoredNetworkDirection.UPLOAD,
} satisfies Record<NetworkDirection, StoredNetworkDirection>;

export const storedNetworkTrafficDisplayModeByResolved = {
    mirrored: StoredNetworkTrafficDisplayMode.MIRRORED,
    overlay: StoredNetworkTrafficDisplayMode.OVERLAY,
} satisfies Record<NetworkTrafficDisplayMode, StoredNetworkTrafficDisplayMode>;

export const storedNetworkUnitBaseByResolved = {
    byte: StoredNetworkUnitBase.BYTE,
    bit: StoredNetworkUnitBase.BIT,
} satisfies Record<NetworkUnitBase, StoredNetworkUnitBase>;

export const storedDiskMetricKindByResolved = {
    usage: StoredDiskMetricKind.USAGE,
    throughput: StoredDiskMetricKind.THROUGHPUT,
} satisfies Record<"usage" | "throughput", StoredDiskMetricKind>;

export const storedDiskThroughputDirectionByResolved = {
    both: StoredDiskThroughputDirection.BOTH,
    total: StoredDiskThroughputDirection.TOTAL,
    read: StoredDiskThroughputDirection.READ,
    write: StoredDiskThroughputDirection.WRITE,
} satisfies Record<DiskThroughputDirection, StoredDiskThroughputDirection>;

export const storedDiskUsageDisplayModeByResolved = {
    percentage: StoredDiskUsageDisplayMode.PERCENTAGE,
    space: StoredDiskUsageDisplayMode.SPACE,
} satisfies Record<DiskUsageDisplayMode, StoredDiskUsageDisplayMode>;

export const storedGpuMetricKindByResolved = {
    usage: StoredGpuMetricKind.USAGE,
    temperature: StoredGpuMetricKind.TEMPERATURE,
    vram: StoredGpuMetricKind.VRAM,
    power: StoredGpuMetricKind.POWER,
} satisfies Record<ResolvedGpuReading["kind"], StoredGpuMetricKind>;

export const storedTemperatureUnitByResolved = {
    celsius: StoredTemperatureUnit.CELSIUS,
    fahrenheit: StoredTemperatureUnit.FAHRENHEIT,
} satisfies Record<TemperatureUnit, StoredTemperatureUnit>;
