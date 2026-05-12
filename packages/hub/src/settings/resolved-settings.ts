// Resolved settings are the complete application contract after stored
// settings, global defaults, overrides, controller context, and runtime facts
// have been applied by the resolver.
//
// This file intentionally tracks the current stored proto shape at the app
// boundary. Future product directions such as rotation, text dashboards,
// touch-strip layouts, per-core CPU metrics, process network metrics, ping, and
// system status belong in comments until the stored contract can express them.
//
// Quick-start actions such as CPU, GPU, Network, and Disk should resolve to
// these widget shapes with default metric selections. They are product entry
// points, not separate runtime models.
//
// This file must not import generated proto, SDK payload types, or renderer
// primitives. Proto stays at the storage boundary; rendering gets adapted
// contracts from resolved settings.

export type SingleMetricViewLayout = "circular" | "text" | "linear" | "sparkline";
export type CircleStyle = "value" | "compact" | "gauge";
export type MetricTheme = "flat" | "cupertino-glass";
export type ColorMode = "threshold" | "solid";
export type GridLineVisibility = "adaptive" | "always" | "none";
export type GridLineType = "horizontal" | "vertical";
export type ScaleMode = "auto" | "custom";
export type SourceFailureMode = "showUnavailable" | "useFallback";
export type TemperatureUnit = "celsius" | "fahrenheit";
export type NetworkDirection = "both" | "download" | "upload";
export type NetworkTrafficDisplayMode = "mirrored" | "overlay";
export type NetworkUnitBase = "byte" | "bit";
export type DiskUsageDisplayMode = "percentage" | "space";
export type DiskThroughputDirection = "both" | "total" | "read" | "write";

export interface ResolvedWidgetSettings {
    readonly widget: ResolvedWidget;
    readonly preferences: ResolvedWidgetPreferences;
}

export type ResolvedWidget =
    | ResolvedSingleMetricWidget;

export interface ResolvedSingleMetricWidget {
    readonly widgetKind: "singleMetric";
    readonly slot: ResolvedMetricSlot;
}

// Future multi-slot widgets should reuse ResolvedMetricSlot after the stored
// contract adds widget oneof arms for rotation, text dashboards, or touch-strip
// layouts. Do not pre-create those resolved widget types before proto can store
// them.
export interface ResolvedMetricSlot {
    readonly metric: ResolvedMetric;
    readonly appearance: ResolvedAppearanceSettings;
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
    | ResolvedCatalogMetricTarget;

export interface ResolvedMetricSourcePolicy {
    readonly primarySourceProfileId: string | undefined;
    readonly fallbackSourceProfileIds: readonly string[];
    readonly failureMode: SourceFailureMode;
}

export interface ResolvedCpuMetricTarget {
    readonly domain: "cpu";
    readonly reading: ResolvedCpuReading;
}

// Future per-core CPU usage, CPU temperature, frequency, and power readings
// belong here after CpuMetricTarget in proto gains the matching fields.
export type ResolvedCpuReading =
    | { readonly kind: "usage" };

export interface ResolvedMemoryMetricTarget {
    readonly domain: "memory";
    readonly reading: ResolvedMemoryReading;
}

export type ResolvedMemoryReading =
    | { readonly kind: "usage" };

export interface ResolvedNetworkMetricTarget {
    readonly domain: "network";
    readonly interfaceId: string | undefined;
    readonly reading: ResolvedNetworkReading;
}

// Future process network traffic and ping should be added here only after
// NetworkMetricTarget in proto can store their selectors and parameters.
export type ResolvedNetworkReading =
    | {
        readonly kind: "traffic";
        readonly direction: NetworkDirection;
        readonly trafficDisplayMode: NetworkTrafficDisplayMode;
        readonly display: ResolvedNetworkDisplaySettings;
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
        readonly linearLabel: string;
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

export interface ResolvedCatalogMetricTarget {
    readonly domain: "catalog";
    readonly metricId: string;
    readonly fallbackLabel: string | undefined;
    readonly fallbackUnit: string | undefined;
}

export interface ResolvedAppearanceSettings {
    readonly viewLayout: SingleMetricViewLayout;
    readonly circleStyle: CircleStyle;
    readonly theme: MetricTheme;
    readonly colorMode: ColorMode;
    readonly usageColors: ResolvedColorRamp;
    readonly downloadColors: ResolvedColorRamp;
    readonly uploadColors: ResolvedColorRamp;
    readonly diskReadColors: ResolvedColorRamp;
    readonly diskWriteColors: ResolvedColorRamp;
    readonly lowColorThresholdPercent: number;
    readonly highColorThresholdPercent: number;
    readonly lineSmoothingPercent: number;
    readonly gridLineVisibility: GridLineVisibility;
    readonly gridLineType: GridLineType;
}

// If channels become user-defined in proto, replace the named color fields
// above with a channel-color collection in both proto and resolved settings.
// Do not make resolved settings diverge from the stored contract on its own.
export interface ResolvedColorRamp {
    readonly solidColor: string;
    readonly lowColor: string;
    readonly mediumColor: string;
    readonly highColor: string;
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
    readonly appearanceOverride: ResolvedGlobalAppearanceOverride | undefined;
    readonly sourceProfiles: readonly ResolvedMetricSourceProfile[];
    readonly defaultSourceProfileId: string | undefined;
}

export interface ResolvedGlobalDefaults {
    // Current global defaults only cover cross-widget network and disk
    // throughput display settings. Add GPU/temperature/power defaults here
    // only after StoredGlobalSettings gains matching fields.
    readonly network: ResolvedNetworkDisplaySettings;
    readonly diskThroughput: ResolvedDiskThroughputDisplaySettings;
}

export interface ResolvedGlobalAppearanceOverride {
    readonly viewLayout: SingleMetricViewLayout;
    readonly circleStyle: CircleStyle;
    readonly theme: MetricTheme;
    // Resolver fills this from the global appearance fallback tint when the
    // stored override omits tint_color.
    readonly tintColor: string;
    readonly colorMode: ColorMode;
    readonly lowColorThresholdPercent: number;
    readonly highColorThresholdPercent: number;
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
