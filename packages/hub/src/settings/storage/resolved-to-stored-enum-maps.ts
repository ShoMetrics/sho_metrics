// Settings enum conversion is intentionally represented with explicit maps in
// both directions. This write-side file proves every resolved settings union
// value can be persisted. The read-side maps separately prove every stored
// proto enum value is handled, including UNSPECIFIED. Do not derive one
// direction from the other unless both exhaustiveness checks stay simple and
// local.
import {
    CircleViewVariant as StoredCircleViewVariant,
    CatalogMetricCategory as StoredCatalogMetricCategory,
    CatalogMetricReadingKind as StoredCatalogMetricReadingKind,
    ColorMode as StoredColorMode,
    DiskMetricTarget_Throughput_Direction as StoredDiskThroughputDirection,
    DiskMetricTarget_Usage_DisplayMode as StoredDiskUsageDisplayMode,
    MetricTheme as StoredMetricTheme,
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    NetworkMetricTarget_Traffic_Direction as StoredNetworkDirection,
    NetworkMetricTarget_Traffic_TrafficDisplayMode as StoredNetworkTrafficDisplayMode,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
    TextViewVariant as StoredTextViewVariant,
    ScaleMode as StoredScaleMode,
    MetricView as StoredMetricView,
    LineAppearanceSettings_GridLineType as StoredGridLineType,
    LineAppearanceSettings_GridLineVisibility as StoredGridLineVisibility,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    SystemPeripheralBindingTransport as StoredSystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind as StoredSystemPeripheralReceiverKind,
    TemperatureUnit as StoredTemperatureUnit,
} from "../../generated/proto/shometrics/v1/settings_pb.js";
import type {
    CatalogMetricCategory,
    CatalogMetricReadingKind,
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
    TerminalPalettePreset,
    TerminalThemeVariant,
    TextViewVariant,
    ScaleMode,
    SourceFailureMode,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
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

export const storedCatalogMetricCategoryByResolved = {
    unspecified: StoredCatalogMetricCategory.UNSPECIFIED,
    cpu: StoredCatalogMetricCategory.CPU,
    gpu: StoredCatalogMetricCategory.GPU,
    memory: StoredCatalogMetricCategory.MEMORY,
    disk: StoredCatalogMetricCategory.DISK,
    network: StoredCatalogMetricCategory.NETWORK,
    other: StoredCatalogMetricCategory.OTHER,
} satisfies Record<CatalogMetricCategory, StoredCatalogMetricCategory>;

export const storedCatalogMetricReadingKindByResolved = {
    unspecified: StoredCatalogMetricReadingKind.UNSPECIFIED,
    usage: StoredCatalogMetricReadingKind.USAGE,
    temperature: StoredCatalogMetricReadingKind.TEMPERATURE,
    power: StoredCatalogMetricReadingKind.POWER,
    clock: StoredCatalogMetricReadingKind.CLOCK,
    fan: StoredCatalogMetricReadingKind.FAN,
    voltage: StoredCatalogMetricReadingKind.VOLTAGE,
    current: StoredCatalogMetricReadingKind.CURRENT,
    data: StoredCatalogMetricReadingKind.DATA,
    throughput: StoredCatalogMetricReadingKind.THROUGHPUT,
    timing: StoredCatalogMetricReadingKind.TIMING,
    level: StoredCatalogMetricReadingKind.LEVEL,
    control: StoredCatalogMetricReadingKind.CONTROL,
    other: StoredCatalogMetricReadingKind.OTHER,
} satisfies Record<CatalogMetricReadingKind, StoredCatalogMetricReadingKind>;

export const storedDiskThroughputDirectionByResolved = {
    both: StoredDiskThroughputDirection.BOTH,
    read: StoredDiskThroughputDirection.READ,
    write: StoredDiskThroughputDirection.WRITE,
} satisfies Record<DiskThroughputDirection, StoredDiskThroughputDirection>;

export const storedDiskUsageDisplayModeByResolved = {
    percentage: StoredDiskUsageDisplayMode.PERCENTAGE,
    space: StoredDiskUsageDisplayMode.SPACE,
} satisfies Record<DiskUsageDisplayMode, StoredDiskUsageDisplayMode>;

export const storedTemperatureUnitByResolved = {
    celsius: StoredTemperatureUnit.CELSIUS,
    fahrenheit: StoredTemperatureUnit.FAHRENHEIT,
} satisfies Record<TemperatureUnit, StoredTemperatureUnit>;

export const storedSourceFailureModeByResolved = {
    showUnavailable: StoredSourceFailureMode.SHOW_UNAVAILABLE,
    useFallback: StoredSourceFailureMode.USE_FALLBACK,
} satisfies Record<SourceFailureMode, StoredSourceFailureMode>;

export const storedSystemPeripheralBindingTransportByResolved = {
    bluetooth: StoredSystemPeripheralBindingTransport.BLUETOOTH,
    usbReceiver: StoredSystemPeripheralBindingTransport.USB_RECEIVER,
    usbWired: StoredSystemPeripheralBindingTransport.USB_WIRED,
} satisfies Record<SystemPeripheralBindingTransport, StoredSystemPeripheralBindingTransport>;

export const storedSystemPeripheralReceiverKindByResolved = {
    unknownReceiver: StoredSystemPeripheralReceiverKind.UNKNOWN_RECEIVER,
    bolt: StoredSystemPeripheralReceiverKind.BOLT,
    unifying: StoredSystemPeripheralReceiverKind.UNIFYING,
    rogOmni: StoredSystemPeripheralReceiverKind.ROG_OMNI,
    lightspeed: StoredSystemPeripheralReceiverKind.LIGHTSPEED,
} satisfies Record<SystemPeripheralReceiverKind, StoredSystemPeripheralReceiverKind>;
