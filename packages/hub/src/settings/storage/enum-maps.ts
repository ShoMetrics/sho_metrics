import {
    CircleViewVariant as StoredCircleViewVariant,
    ColorMode as StoredColorMode,
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    DiskMetricTarget_ThroughputDirection as StoredDiskThroughputDirection,
    DiskMetricTarget_UsageDisplayMode as StoredDiskUsageDisplayMode,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    MetricTheme as StoredMetricTheme,
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    NetworkMetricTarget_Direction as StoredNetworkDirection,
    NetworkMetricTarget_TrafficDisplayMode as StoredNetworkTrafficDisplayMode,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
    TextViewVariant as StoredTextViewVariant,
    ScaleMode as StoredScaleMode,
    MetricView as StoredMetricView,
    LineAppearanceSettings_GridLineType as StoredGridLineType,
    LineAppearanceSettings_GridLineVisibility as StoredGridLineVisibility,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    TemperatureUnit as StoredTemperatureUnit,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    CircleViewVariant,
    ColorMode,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    ResolvedCpuReading,
    ResolvedGpuReading,
    GridLineType,
    GridLineVisibility,
    MetricTheme,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    TerminalPalettePreset,
    TerminalThemeVariant,
    TextViewVariant,
    ScaleMode,
    SourceFailureMode,
    MetricView,
    TemperatureUnit,
} from "../resolved-settings";

export const storedMetricViewByResolved = {
    circle: StoredMetricView.CIRCLE,
    text: StoredMetricView.TEXT,
    bar: StoredMetricView.BAR,
    line: StoredMetricView.LINE,
} satisfies Record<MetricView, StoredMetricView>;

export const storedCircleViewVariantByResolved = {
    "full-ring": StoredCircleViewVariant.FULL_RING,
    minimal: StoredCircleViewVariant.MINIMAL,
    gauge: StoredCircleViewVariant.GAUGE,
} satisfies Record<CircleViewVariant, StoredCircleViewVariant>;

export const storedTextViewVariantByResolved = {
    centered: StoredTextViewVariant.CENTERED,
    "title-card": StoredTextViewVariant.TITLE_CARD,
} satisfies Record<TextViewVariant, StoredTextViewVariant>;

export const storedThemeByResolved = {
    flat: StoredMetricTheme.FLAT,
    "cupertino-glass": StoredMetricTheme.CUPERTINO_GLASS,
    "color-filled": StoredMetricTheme.COLOR_FILLED,
    "terminal": StoredMetricTheme.TERMINAL,
    "pixel-window": StoredMetricTheme.PIXEL_WINDOW,
} satisfies Record<MetricTheme, StoredMetricTheme>;

export const storedTerminalThemeVariantByResolved = {
    clean: StoredTerminalThemeVariant.CLEAN,
    vintage: StoredTerminalThemeVariant.VINTAGE,
} satisfies Record<TerminalThemeVariant, StoredTerminalThemeVariant>;

export const storedTerminalPalettePresetByResolved = {
    green: StoredTerminalPalettePreset.GREEN,
    amber: StoredTerminalPalettePreset.AMBER,
    cyan: StoredTerminalPalettePreset.CYAN,
    white: StoredTerminalPalettePreset.WHITE,
} satisfies Record<TerminalPalettePreset, StoredTerminalPalettePreset>;

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

export const storedCpuMetricKindByResolved = {
    usage: StoredCpuMetricKind.USAGE,
    temperature: StoredCpuMetricKind.TEMPERATURE,
    power: StoredCpuMetricKind.POWER,
} satisfies Record<ResolvedCpuReading["kind"], StoredCpuMetricKind>;

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

export const storedSourceFailureModeByResolved = {
    showUnavailable: StoredSourceFailureMode.SHOW_UNAVAILABLE,
    useFallback: StoredSourceFailureMode.USE_FALLBACK,
} satisfies Record<SourceFailureMode, StoredSourceFailureMode>;
