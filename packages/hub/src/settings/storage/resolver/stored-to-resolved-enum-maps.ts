// Settings enum conversion is intentionally represented with explicit maps in
// both directions. This read-side file proves every stored proto enum value is
// handled, including UNSPECIFIED. The write-side maps separately prove every
// resolved settings union value can be persisted. Do not derive one direction
// from the other unless both exhaustiveness checks stay simple and local.
import {
    CircleViewVariant as StoredCircleViewVariant,
    CatalogMetricCategory as StoredCatalogMetricCategory,
    CatalogMetricReadingKind as StoredCatalogMetricReadingKind,
    ColorMode as StoredColorMode,
    DiskMetricTarget_Throughput_Direction as StoredDiskThroughputDirection,
    DiskMetricTarget_Usage_DisplayMode as StoredDiskUsageDisplayMode,
    LineAppearanceSettings_GridLineType as StoredGridLineType,
    LineAppearanceSettings_GridLineVisibility as StoredGridLineVisibility,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    MetricTheme as StoredMetricTheme,
    MetricView as StoredMetricView,
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    NetworkMetricTarget_Traffic_Direction as StoredNetworkDirection,
    NetworkMetricTarget_Traffic_TrafficDisplayMode as StoredNetworkTrafficDisplayMode,
    ScaleMode as StoredScaleMode,
    SystemPeripheralBindingTransport as StoredSystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind as StoredSystemPeripheralReceiverKind,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
    TemperatureUnit as StoredTemperatureUnit,
    TextViewVariant as StoredTextViewVariant,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
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
    MetricView,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    ScaleMode,
    SourceFailureMode,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
    TerminalPalettePreset,
    TerminalThemeVariant,
    TemperatureUnit,
    TextViewVariant,
} from "../../resolved-settings";

export const metricViewByProto = {
    [StoredMetricView.UNSPECIFIED]: undefined,
    [StoredMetricView.CIRCLE]: "circle",
    [StoredMetricView.TEXT]: "text",
    [StoredMetricView.BAR]: "bar",
    [StoredMetricView.LINE]: "line",
} satisfies Record<StoredMetricView, MetricView | undefined>;

export const circleViewVariantByProto = {
    [StoredCircleViewVariant.UNSPECIFIED]: undefined,
    [StoredCircleViewVariant.FULL_RING]: "full-ring",
    [StoredCircleViewVariant.MINIMAL]: "minimal",
    [StoredCircleViewVariant.GAUGE]: "gauge",
} satisfies Record<StoredCircleViewVariant, CircleViewVariant | undefined>;

export const textViewVariantByProto = {
    [StoredTextViewVariant.UNSPECIFIED]: undefined,
    [StoredTextViewVariant.CENTERED]: "centered",
    [StoredTextViewVariant.TITLE_CARD]: "title-card",
} satisfies Record<StoredTextViewVariant, TextViewVariant | undefined>;

export const metricThemeByProto = {
    [StoredMetricTheme.UNSPECIFIED]: undefined,
    [StoredMetricTheme.FLAT]: "flat",
    [StoredMetricTheme.CUPERTINO_GLASS]: "cupertino-glass",
    [StoredMetricTheme.COLOR_FILLED]: "color-filled",
    [StoredMetricTheme.TERMINAL]: "terminal",
    [StoredMetricTheme.PIXEL_WINDOW]: "pixel-window",
} satisfies Record<StoredMetricTheme, MetricTheme | undefined>;

export const terminalThemeVariantByProto = {
    [StoredTerminalThemeVariant.UNSPECIFIED]: undefined,
    [StoredTerminalThemeVariant.CLEAN]: "clean",
    [StoredTerminalThemeVariant.VINTAGE]: "vintage",
} satisfies Record<StoredTerminalThemeVariant, TerminalThemeVariant | undefined>;

export const terminalPalettePresetByProto = {
    [StoredTerminalPalettePreset.UNSPECIFIED]: undefined,
    [StoredTerminalPalettePreset.GREEN]: "green",
    [StoredTerminalPalettePreset.AMBER]: "amber",
    [StoredTerminalPalettePreset.CYAN]: "cyan",
    [StoredTerminalPalettePreset.WHITE]: "white",
} satisfies Record<StoredTerminalPalettePreset, TerminalPalettePreset | undefined>;

export const colorModeByProto = {
    [StoredColorMode.UNSPECIFIED]: undefined,
    [StoredColorMode.MULTI_COLOR]: "multi-color",
    [StoredColorMode.SOLID]: "solid",
    [StoredColorMode.BLACK_WHITE]: "black-white",
} satisfies Record<StoredColorMode, ColorMode | undefined>;

export const gridLineVisibilityByProto = {
    [StoredGridLineVisibility.UNSPECIFIED]: undefined,
    [StoredGridLineVisibility.ADAPTIVE]: "adaptive",
    [StoredGridLineVisibility.ALWAYS]: "always",
    [StoredGridLineVisibility.NONE]: "none",
} satisfies Record<StoredGridLineVisibility, GridLineVisibility | undefined>;

export const gridLineTypeByProto = {
    [StoredGridLineType.UNSPECIFIED]: undefined,
    [StoredGridLineType.HORIZONTAL]: "horizontal",
    [StoredGridLineType.VERTICAL]: "vertical",
} satisfies Record<StoredGridLineType, GridLineType | undefined>;

export const scaleModeByProto = {
    [StoredScaleMode.UNSPECIFIED]: undefined,
    [StoredScaleMode.AUTO]: "auto",
    [StoredScaleMode.CUSTOM]: "custom",
} satisfies Record<StoredScaleMode, ScaleMode | undefined>;

export const networkUnitBaseByProto = {
    [StoredNetworkUnitBase.UNSPECIFIED]: undefined,
    [StoredNetworkUnitBase.BYTE]: "byte",
    [StoredNetworkUnitBase.BIT]: "bit",
} satisfies Record<StoredNetworkUnitBase, NetworkUnitBase | undefined>;

export const sourceFailureModeByProto = {
    [StoredSourceFailureMode.UNSPECIFIED]: undefined,
    [StoredSourceFailureMode.SHOW_UNAVAILABLE]: "showUnavailable",
    [StoredSourceFailureMode.USE_FALLBACK]: "useFallback",
} satisfies Record<StoredSourceFailureMode, SourceFailureMode | undefined>;

export const temperatureUnitByProto = {
    [StoredTemperatureUnit.UNSPECIFIED]: undefined,
    [StoredTemperatureUnit.CELSIUS]: "celsius",
    [StoredTemperatureUnit.FAHRENHEIT]: "fahrenheit",
} satisfies Record<StoredTemperatureUnit, TemperatureUnit | undefined>;

export const networkDirectionByProto = {
    [StoredNetworkDirection.UNSPECIFIED]: undefined,
    [StoredNetworkDirection.BOTH]: "both",
    [StoredNetworkDirection.DOWNLOAD]: "download",
    [StoredNetworkDirection.UPLOAD]: "upload",
} satisfies Record<StoredNetworkDirection, NetworkDirection | undefined>;

export const networkTrafficDisplayModeByProto = {
    [StoredNetworkTrafficDisplayMode.UNSPECIFIED]: undefined,
    [StoredNetworkTrafficDisplayMode.MIRRORED]: "mirrored",
    [StoredNetworkTrafficDisplayMode.OVERLAY]: "overlay",
} satisfies Record<StoredNetworkTrafficDisplayMode, NetworkTrafficDisplayMode | undefined>;

export const catalogMetricCategoryByProto = {
    [StoredCatalogMetricCategory.UNSPECIFIED]: "unspecified",
    [StoredCatalogMetricCategory.CPU]: "cpu",
    [StoredCatalogMetricCategory.GPU]: "gpu",
    [StoredCatalogMetricCategory.MEMORY]: "memory",
    [StoredCatalogMetricCategory.DISK]: "disk",
    [StoredCatalogMetricCategory.NETWORK]: "network",
    [StoredCatalogMetricCategory.OTHER]: "other",
} satisfies Record<StoredCatalogMetricCategory, CatalogMetricCategory>;

export const catalogMetricReadingKindByProto = {
    [StoredCatalogMetricReadingKind.UNSPECIFIED]: "unspecified",
    [StoredCatalogMetricReadingKind.USAGE]: "usage",
    [StoredCatalogMetricReadingKind.TEMPERATURE]: "temperature",
    [StoredCatalogMetricReadingKind.POWER]: "power",
    [StoredCatalogMetricReadingKind.CLOCK]: "clock",
    [StoredCatalogMetricReadingKind.FAN]: "fan",
    [StoredCatalogMetricReadingKind.VOLTAGE]: "voltage",
    [StoredCatalogMetricReadingKind.CURRENT]: "current",
    [StoredCatalogMetricReadingKind.DATA]: "data",
    [StoredCatalogMetricReadingKind.THROUGHPUT]: "throughput",
    [StoredCatalogMetricReadingKind.TIMING]: "timing",
    [StoredCatalogMetricReadingKind.LEVEL]: "level",
    [StoredCatalogMetricReadingKind.CONTROL]: "control",
    [StoredCatalogMetricReadingKind.OTHER]: "other",
} satisfies Record<StoredCatalogMetricReadingKind, CatalogMetricReadingKind>;

export const diskUsageDisplayModeByProto = {
    [StoredDiskUsageDisplayMode.UNSPECIFIED]: undefined,
    [StoredDiskUsageDisplayMode.PERCENTAGE]: "percentage",
    [StoredDiskUsageDisplayMode.SPACE]: "space",
} satisfies Record<StoredDiskUsageDisplayMode, DiskUsageDisplayMode | undefined>;

export const diskThroughputDirectionByProto = {
    [StoredDiskThroughputDirection.UNSPECIFIED]: undefined,
    [StoredDiskThroughputDirection.BOTH]: "both",
    [StoredDiskThroughputDirection.READ]: "read",
    [StoredDiskThroughputDirection.WRITE]: "write",
} satisfies Record<StoredDiskThroughputDirection, DiskThroughputDirection | undefined>;

export const systemPeripheralBindingTransportByProto = {
    [StoredSystemPeripheralBindingTransport.UNSPECIFIED]: undefined,
    [StoredSystemPeripheralBindingTransport.BLUETOOTH]: "bluetooth",
    [StoredSystemPeripheralBindingTransport.USB_RECEIVER]: "usbReceiver",
    [StoredSystemPeripheralBindingTransport.USB_WIRED]: "usbWired",
} satisfies Record<StoredSystemPeripheralBindingTransport, SystemPeripheralBindingTransport | undefined>;

export const systemPeripheralReceiverKindByProto = {
    [StoredSystemPeripheralReceiverKind.UNSPECIFIED]: undefined,
    [StoredSystemPeripheralReceiverKind.UNKNOWN_RECEIVER]: "unknownReceiver",
    [StoredSystemPeripheralReceiverKind.BOLT]: "bolt",
    [StoredSystemPeripheralReceiverKind.UNIFYING]: "unifying",
    [StoredSystemPeripheralReceiverKind.ROG_OMNI]: "rogOmni",
    [StoredSystemPeripheralReceiverKind.LIGHTSPEED]: "lightspeed",
} satisfies Record<StoredSystemPeripheralReceiverKind, SystemPeripheralReceiverKind | undefined>;
