// Resolved settings are the complete application contract after stored
// settings, global defaults, overrides, controller context, and runtime facts
// have been applied by the resolver.
//
// This file intentionally tracks the current stored proto shape at the app
// boundary. Future product directions such as rotation, text dashboards,
// touch-strip layouts, per-core CPU metrics, process network metrics, and
// system status belong in comments until the stored contract can express them.
//
// Quick-start actions such as CPU, GPU, Network, and Disk should resolve to
// these widget shapes with default metric selections. They are product entry
// points, not separate runtime models.
//
// This file must not import generated proto, SDK payload types, or renderer
// primitives. Proto stays at the storage boundary; rendering gets adapted
// contracts from resolved settings.

import type { MetricUnit } from "../runtime/sources/metric-source";

export type MetricView = "circle" | "text" | "bar" | "line";
export type CircleViewVariant = "full-ring" | "minimal" | "gauge";
export type TextViewVariant = "centered" | "title-card";
export type MetricTheme = "flat" | "cupertino-glass" | "color-filled" | "terminal" | "pixel-window";
export type TerminalThemeVariant = "clean" | "vintage";
export type TerminalPalettePreset = "green" | "amber" | "cyan" | "white";
export type ColorMode = "multi-color" | "solid" | "black-white";
export type GridLineVisibility = "adaptive" | "always" | "none";
export type GridLineType = "horizontal" | "vertical";
export type ScaleMode = "auto" | "custom";
export type SourceFailureMode = "showUnavailable" | "useFallback";
export type TemperatureUnit = "celsius" | "fahrenheit";
export type NetworkDirection = "both" | "download" | "upload";
export type NetworkTrafficDisplayMode = "mirrored" | "overlay";
export type NetworkUnitBase = "byte" | "bit";
export type DiskUsageDisplayMode = "percentage" | "space";
export type DiskThroughputDirection = "both" | "read" | "write";
export type CatalogMetricCategory = "unspecified" | "cpu" | "gpu" | "memory" | "disk" | "network" | "other";
export type CatalogMetricReadingKind =
    | "unspecified"
    | "usage"
    | "temperature"
    | "power"
    | "clock"
    | "fan"
    | "voltage"
    | "current"
    | "data"
    | "throughput"
    | "timing"
    | "level"
    | "control"
    | "other";

export interface ResolvedWidgetSettings {
    readonly widget: ResolvedWidget;
    readonly preferences: ResolvedWidgetPreferences;
}

export type ResolvedWidget =
    | ResolvedSingleMetricWidget
    | ResolvedDenseMultiMetricWidget
    | ResolvedStackedMetricWidget;

export interface ResolvedSingleMetricWidget {
    readonly widgetKind: "singleMetric";
    readonly slot: ResolvedMetricSlot;
}

export interface ResolvedDenseMultiMetricWidget {
    readonly widgetKind: "denseMultiMetric";
    readonly slots: readonly ResolvedDenseMetricSlot[];
    readonly appearance: ResolvedAppearanceSettings;
}

export interface ResolvedDenseMetricSlot {
    readonly slotId: string;
    readonly slot: ResolvedMetricSlot;
    readonly customLabel: string | undefined;
    readonly customMaximumValue: number | undefined;
}

export interface ResolvedStackedMetricWidget {
    readonly widgetKind: "stackedMetric";
    readonly slots: readonly ResolvedStackedMetricSlot[];
    readonly rotation: ResolvedStackedMetricRotationSettings;
}

export interface ResolvedStackedMetricSlot {
    readonly slotId: string;
    readonly widget: ResolvedSingleMetricWidget;
}

export interface ResolvedStackedMetricRotationSettings {
    readonly autoRotateEnabled: boolean;
    readonly intervalSeconds: number;
}

export interface ResolvedMetricSlot {
    readonly metric: ResolvedMetric;
    readonly appearance: ResolvedAppearanceSettings;
}

/**
 * Narrows resolved settings for legacy single-metric callers.
 *
 * TODO(DenseMultiMetric): Replace this transitional assertion with single-metric
 * function parameters at action/view-builder boundaries.
 * TODO(DenseMultiMetric): Add a lint or architecture test that limits this
 * helper to approved boundary files after dense action wiring is complete.
 */
export function requireResolvedSingleMetricWidget(
    settings: ResolvedWidgetSettings,
): ResolvedSingleMetricWidget {
    if (settings.widget.widgetKind !== "singleMetric") {
        throw new Error(`Expected single metric widget, received ${settings.widget.widgetKind}.`);
    }

    return settings.widget;
}

/** Narrows resolved settings for dense multi-metric action callers. */
export function requireResolvedDenseMultiMetricWidget(
    settings: ResolvedWidgetSettings,
): ResolvedDenseMultiMetricWidget {
    if (settings.widget.widgetKind !== "denseMultiMetric") {
        throw new Error(`Expected dense multi metric widget, received ${settings.widget.widgetKind}.`);
    }

    return settings.widget;
}

/** Narrows resolved settings for stacked metric action callers. */
export function requireResolvedStackedMetricWidget(
    settings: ResolvedWidgetSettings,
): ResolvedStackedMetricWidget {
    if (settings.widget.widgetKind !== "stackedMetric") {
        throw new Error(`Expected stacked metric widget, received ${settings.widget.widgetKind}.`);
    }

    return settings.widget;
}

export interface ResolvedWidgetPreferences {
    readonly pollingFrequencySeconds: number;
}

export interface ResolvedMetric {
    readonly source: ResolvedMetricSourcePolicy;
    readonly target: ResolvedMetricTarget;
}

export type ResolvedMetricTarget =
    | ResolvedCpuMetricTarget
    | ResolvedMemoryMetricTarget
    | ResolvedNetworkMetricTarget
    | ResolvedDiskMetricTarget
    | ResolvedGpuMetricTarget
    | ResolvedSystemMetricTarget
    | ResolvedCatalogMetricTarget
    | ResolvedCustomMetricTarget;

export interface ResolvedMetricSourcePolicy {
    readonly primarySourceProfileId: string | undefined;
    readonly fallbackSourceProfileIds: readonly string[];
    readonly failureMode: SourceFailureMode;
}

export interface ResolvedCpuMetricTarget {
    readonly domain: "cpu";
    readonly reading: ResolvedCpuReading;
}

export type ResolvedCpuReading =
    | { readonly kind: "usage" }
    | { readonly kind: "temperature"; readonly maximumCelsius: number; readonly unit: TemperatureUnit }
    | { readonly kind: "power"; readonly maximumWatts: number };

export interface ResolvedMemoryMetricTarget {
    readonly domain: "memory";
    readonly reading: ResolvedMemoryReading;
}

export type ResolvedMemoryReading =
    | { readonly kind: "usage" };

export interface ResolvedNetworkMetricTarget {
    readonly domain: "network";
    readonly reading: ResolvedNetworkReading;
}

export type ResolvedNetworkReading =
    | {
        readonly kind: "traffic";
        readonly interfaceId: string | undefined;
        readonly direction: NetworkDirection;
        readonly trafficDisplayMode: NetworkTrafficDisplayMode;
        readonly display: ResolvedNetworkDisplaySettings;
    }
    | {
        readonly kind: "ping";
        readonly targetHost: string;
    };

export interface ResolvedDiskMetricTarget {
    readonly domain: "disk";
    readonly volumeId: string | undefined;
    readonly reading: ResolvedDiskReading;
}

export type ResolvedDiskReading =
    | {
        readonly kind: "usage";
        readonly displayMode: DiskUsageDisplayMode;
        readonly barLabel: string;
    }
    | {
        readonly kind: "throughput";
        readonly direction: DiskThroughputDirection;
        readonly display: ResolvedDiskThroughputDisplaySettings;
    };

export interface ResolvedGpuMetricTarget {
    readonly domain: "gpu";
    readonly gpuId: string | undefined;
    readonly reading: ResolvedGpuReading;
}

// Future GPU frequency or richer sensor readings belong here after
// GpuMetricTarget in proto gains the matching kind and parameters.
export type ResolvedGpuReading =
    | { readonly kind: "usage" }
    | { readonly kind: "temperature"; readonly maximumCelsius: number; readonly unit: TemperatureUnit }
    | { readonly kind: "vram" }
    | { readonly kind: "power"; readonly maximumWatts: number };

export interface ResolvedSystemMetricTarget {
    readonly domain: "system";
    readonly reading: ResolvedSystemReading;
}

export type ResolvedSystemReading =
    | {
        readonly kind: "batteryPercent";
        readonly peripheralIdentity: ResolvedSystemPeripheralIdentity | undefined;
        readonly detectedPeripheralDisplayName: string | undefined;
    };

export interface ResolvedSystemPeripheralIdentity {
    readonly evidence: ResolvedSystemPeripheralIdentityEvidence;
}

export type ResolvedSystemPeripheralIdentityEvidence =
    | ResolvedSystemVendorHidPeripheralIdentity
    | {
        readonly kind: "bluetooth";
        readonly primaryIdentifier: ResolvedSystemBluetoothPeripheralIdentifier | undefined;
        readonly fallbackIdentifier: ResolvedSystemBluetoothPeripheralIdentifier | undefined;
    };

export interface ResolvedSystemVendorHidPeripheralIdentity {
    readonly kind: "vendorHid";
    readonly vendorId: number | undefined;
    readonly productId: number | undefined;
    readonly manufacturer: string | undefined;
    readonly productName: string | undefined;
    readonly serialNumber: string | undefined;
    readonly interfaceNumber: number | undefined;
    readonly usagePage: number | undefined;
    readonly usageId: number | undefined;
    readonly bindingTransport: SystemPeripheralBindingTransport | undefined;
    readonly receiverKind: SystemPeripheralReceiverKind | undefined;
    readonly vendorUnitId: string | undefined;
    readonly modelId: string | undefined;
    readonly receiverSlot: number | undefined;
}

export function readSystemVendorHidPeripheralIdentity(
    identity: ResolvedSystemPeripheralIdentity | undefined,
): ResolvedSystemVendorHidPeripheralIdentity | undefined {
    return identity?.evidence.kind === "vendorHid" ? identity.evidence : undefined;
}

export function readSystemBluetoothPeripheralIdentity(
    identity: ResolvedSystemPeripheralIdentity | undefined,
): Extract<ResolvedSystemPeripheralIdentityEvidence, { readonly kind: "bluetooth" }> | undefined {
    return identity?.evidence.kind === "bluetooth" ? identity.evidence : undefined;
}

export interface ResolvedSystemBluetoothPeripheralIdentifier {
    readonly kind: ResolvedSystemBluetoothPeripheralIdentifierKind;
    readonly hash: string;
}

export type ResolvedSystemBluetoothPeripheralIdentifierKind =
    | "platformInstanceId"
    | "windowsAepAddress"
    | "bluetoothDeviceAddress";

export type SystemPeripheralBindingTransport =
    | "bluetooth"
    | "usbReceiver"
    | "usbWired";

export type SystemPeripheralReceiverKind =
    | "unknownReceiver"
    | "bolt"
    | "unifying"
    | "rogOmni"
    | "lightspeed";

export interface ResolvedCatalogMetricTarget {
    readonly domain: "catalog";
    readonly metricId: string;
    readonly detectedLabel: string | undefined;
    readonly detectedUnit: MetricUnit;
    readonly detectedCategory: CatalogMetricCategory;
    readonly detectedReadingKind: CatalogMetricReadingKind;
    readonly customLabel: string | undefined;
    readonly customMaximumValue: number | undefined;
}

export interface ResolvedCustomMetricTarget {
    readonly domain: "customMetric";
    readonly configuration: ResolvedCustomMetricConfiguration;
    readonly iconId: string | undefined;
}

export type ResolvedCustomMetricConfiguration =
    | { readonly state: "unconfigured" }
    | {
        readonly state: "invalid";
        readonly reason: CustomMetricInvalidReason;
        readonly source: ResolvedCustomMetricSource;
    }
    | {
        readonly state: "configured";
        readonly source: ResolvedCustomMetricSource;
    };

export type CustomMetricInvalidReason =
    | "missingUrl"
    | "missingJqTransform";

export type ResolvedCustomMetricSource =
    | {
        readonly kind: "http";
        readonly plan: ResolvedCustomHttpMetricPlan;
    };

export type ResolvedCustomHttpMetricPlan =
    | {
        readonly kind: "singleRequest";
        readonly request: ResolvedSingleCustomHttpRequest;
    };

export interface ResolvedSingleCustomHttpRequest {
    readonly url: string;
    readonly userIntent: string | undefined;
    readonly jqTransform: string;
    readonly requestSettings: ResolvedCustomHttpRequestSettings;
    readonly auth: ResolvedCustomHttpRequestAuth;
}

export interface ResolvedCustomHttpRequestSettings {
    readonly timeoutSeconds: number;
    readonly retryCount: number;
}

export interface ResolvedCustomHttpRequestAuth {
    readonly credentialId: string | undefined;
    readonly allowPublicHttpCredentials: boolean;
}

export interface ResolvedAppearanceSettings {
    readonly view: ResolvedAppearanceViewSettings;
    readonly theme: ResolvedAppearanceThemeSettings;
    readonly line: ResolvedLineAppearanceSettings;
    readonly transparentSurface: ResolvedTransparentSurfaceSettings;
}

export interface ResolvedAppearanceViewSettings {
    readonly selectedView: MetricView;
    readonly circleVariant: CircleViewVariant;
    readonly textVariant: TextViewVariant;
}

export interface ResolvedAppearanceThemeSettings {
    readonly selectedTheme: MetricTheme;
    readonly flat: ResolvedFlatThemeSettings;
    readonly cupertinoGlass: ResolvedCupertinoGlassThemeSettings;
    readonly colorFilled: ResolvedColorFilledThemeSettings;
    readonly terminal: ResolvedTerminalThemeSettings;
}

export interface ResolvedFlatThemeSettings {
    readonly paint: ResolvedMetricPaintSettings;
}

export interface ResolvedCupertinoGlassThemeSettings {
    readonly paint: ResolvedMetricPaintSettings;
}

export interface ResolvedColorFilledThemeSettings {
    readonly paint: ResolvedColorFilledPaintSettings;
}

export interface ResolvedTerminalThemeSettings {
    readonly variant: TerminalThemeVariant;
    readonly paint: ResolvedTerminalPaintSettings;
}

export interface ResolvedTransparentSurfaceSettings {
    readonly enabled: boolean;
    readonly backgroundOpacityPercent: number;
    readonly textOutlinePercent: number;
    readonly shapeOutlinePercent: number;
}

export interface ResolvedTerminalPaintSettings {
    readonly preset: TerminalPalettePreset;
}

export interface ResolvedMetricPaintSettings {
    readonly colorMode: ColorMode;
    readonly solid: ResolvedMetricSolidPaintSettings;
    readonly multiColor: ResolvedMetricMultiColorPaintSettings;
}

export interface ResolvedMetricSolidPaintSettings {
    readonly colors: ResolvedMetricSolidChannelColors;
    readonly isGradientEnabled: boolean;
}

export interface ResolvedMetricSolidChannelColors {
    readonly usageColor: string;
    readonly downloadColor: string;
    readonly uploadColor: string;
    readonly diskReadColor: string;
    readonly diskWriteColor: string;
}

export interface ResolvedMetricMultiColorPaintSettings {
    readonly colors: ResolvedMetricMultiColorChannelColors;
    readonly lowThresholdPercent: number;
    readonly highThresholdPercent: number;
    readonly isGradientEnabled: boolean;
}

export interface ResolvedMetricMultiColorChannelColors {
    readonly usage: ResolvedMultiColorSet;
    readonly download: ResolvedMultiColorSet;
    readonly upload: ResolvedMultiColorSet;
    readonly diskRead: ResolvedMultiColorSet;
    readonly diskWrite: ResolvedMultiColorSet;
}

export interface ResolvedMultiColorSet {
    readonly lowColor: string;
    readonly mediumColor: string;
    readonly highColor: string;
}

export interface ResolvedColorFilledPaintSettings {
    readonly colorMode: ColorMode;
    readonly solid: ResolvedColorFilledSolidPaintSettings;
    readonly multiColor: ResolvedColorFilledMultiColorPaintSettings;
}

export interface ResolvedColorFilledSolidPaintSettings {
    readonly color: string;
    readonly isGradientEnabled: boolean;
}

export interface ResolvedColorFilledMultiColorPaintSettings {
    readonly colors: ResolvedMultiColorSet;
    readonly isGradientEnabled: boolean;
}

export interface ResolvedLineAppearanceSettings {
    readonly lineSmoothingPercent: number;
    readonly gridLineVisibility: GridLineVisibility;
    readonly gridLineType: GridLineType;
}

export interface ResolvedNetworkDisplaySettings {
    readonly scaleMode: ScaleMode;
    readonly maximumDownloadSpeedMegabitsPerSecond: number | undefined;
    readonly maximumUploadSpeedMegabitsPerSecond: number | undefined;
    readonly unitBase: NetworkUnitBase;
}

export interface ResolvedDiskThroughputDisplaySettings {
    readonly scaleMode: ScaleMode;
    readonly maximumReadThroughputMebibytesPerSecond: number | undefined;
    readonly maximumWriteThroughputMebibytesPerSecond: number | undefined;
}

export interface ResolvedGlobalSettings {
    readonly defaults: ResolvedGlobalDefaults;
    readonly globalOverrideEnabled: boolean;
    readonly viewOverride: ResolvedGlobalViewOverride | undefined;
    readonly themeOverride: ResolvedGlobalThemeOverride | undefined;
    readonly transparentSurfaceOverride: ResolvedGlobalTransparentSurfaceOverride | undefined;
    readonly paintOverride: ResolvedGlobalPaintOverride | undefined;
    readonly sourceProfiles: readonly ResolvedMetricSourceProfile[];
    readonly defaultSourceProfileId: string | undefined;
    readonly customHttpCredentials: readonly ResolvedCustomHttpCredentialSummary[];
    readonly system: ResolvedSystemFeatureSettings;
}

export interface ResolvedSystemFeatureSettings {
    readonly experimentalVendorHidBatteryEnabled: boolean;
}

export type ResolvedCustomHttpCredentialAuthKind = "basic" | "bearer" | "header" | "query";

export interface ResolvedCustomHttpCredentialSummary {
    readonly id: string;
    readonly nickname: string;
    readonly authKind: ResolvedCustomHttpCredentialAuthKind;
    /** Non-secret auth context, such as a username, header name, or query parameter name. */
    readonly authContext: string;
    readonly createdAtMilliseconds: number | undefined;
    readonly updatedAtMilliseconds: number | undefined;
}

export interface ResolvedGlobalDefaults {
    // Current global defaults only cover cross-widget network and disk
    // throughput display settings. Add GPU/temperature/power defaults here
    // only after StoredGlobalSettings gains matching fields.
    readonly network: ResolvedNetworkDisplaySettings;
    readonly diskThroughput: ResolvedDiskThroughputDisplaySettings;
}

export interface ResolvedGlobalViewOverride {
    readonly view: ResolvedAppearanceViewSettings;
}

export interface ResolvedGlobalThemeOverride {
    readonly theme: ResolvedAppearanceThemeSettings;
}

export interface ResolvedGlobalTransparentSurfaceOverride {
    readonly transparentSurface: ResolvedTransparentSurfaceSettings;
}

export interface ResolvedGlobalPaintOverride {
    readonly metric: ResolvedGlobalMetricPaintSettings;
    readonly colorFilled: ResolvedColorFilledPaintSettings;
    readonly terminal: ResolvedTerminalPaintSettings;
}

export interface ResolvedGlobalMetricPaintSettings {
    readonly colorMode: ColorMode;
    readonly solid: ResolvedGlobalSolidPaintSettings;
    readonly multiColor: ResolvedGlobalMultiColorPaintSettings;
}

export interface ResolvedGlobalSolidPaintSettings {
    readonly color: string;
    readonly isGradientEnabled: boolean;
}

export interface ResolvedGlobalMultiColorPaintSettings {
    readonly colors: ResolvedMultiColorSet;
    readonly lowThresholdPercent: number;
    readonly highThresholdPercent: number;
    readonly isGradientEnabled: boolean;
}

export interface ResolvedMetricSourceProfile {
    readonly id: string;
    readonly displayName: string;
    readonly sourceTypeId: string;
    readonly connection: ResolvedMetricSourceConnection | undefined;
}

export type ResolvedMetricSourceConnection =
    | ResolvedHttpMetricSourceConnection;

export interface ResolvedHttpMetricSourceConnection {
    readonly connectionKind: "http";
    readonly baseUrl: string;
}
