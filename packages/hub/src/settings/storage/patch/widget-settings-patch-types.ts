import type { MetricUnit } from "../../../runtime/sources/metric-source";
import type { ResolvedAppearanceSettingsOverride } from "../../appearance-overrides";
import type {
    CatalogMetricCategory,
    CatalogMetricReadingKind,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    ResolvedCpuReading,
    ResolvedGpuReading,
    ResolvedCpuHardwareSummaryReadings,
    ResolvedGpuHardwareSummaryReadings,
    ResolvedMetricTarget,
    ResolvedNetworkReading,
    ResolvedSystemPeripheralIdentity,
    ScaleMode,
    SourceFailureMode,
    TemperatureUnit,
} from "../../resolved-settings";
import type { SlotIdGenerator } from "../slot-id";

export interface StoredWidgetSettingsPatch {
    /** Replaces the metric source policy as a complete metric-level routing preference. */
    readonly source?: {
        readonly primarySourceProfileId: string | undefined;
        readonly fallbackSourceProfileIds: readonly string[];
        readonly failureMode: SourceFailureMode;
    } | undefined;
    readonly preferences?: {
        readonly pollingFrequencySeconds?: number | undefined;
    } | undefined;
    readonly appearance?: ResolvedAppearanceSettingsOverride | undefined;
    readonly network?: Partial<{
        readonly kind: ResolvedNetworkReading["kind"];
        readonly direction: NetworkDirection;
        readonly interfaceId: string;
        readonly trafficDisplayMode: NetworkTrafficDisplayMode;
        readonly pingTargetHost: string;
        readonly pingMaximumLatencyMilliseconds: number;
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
    readonly cpu?: Partial<{
        readonly kind: ResolvedCpuReading["kind"];
        readonly temperatureUnit: TemperatureUnit;
        readonly maximumTemperatureCelsius: number;
        readonly maximumPowerWatts: number | undefined;
    }>;
    readonly gpu?: Partial<{
        readonly kind: ResolvedGpuReading["kind"];
        readonly temperatureUnit: TemperatureUnit;
        readonly maximumTemperatureCelsius: number;
        readonly maximumPowerWatts: number | undefined;
    }>;
    readonly catalog?: Partial<{
        readonly metricId: string;
        readonly detectedLabel: string | undefined;
        readonly detectedUnit: MetricUnit | undefined;
        readonly detectedCategory: CatalogMetricCategory | undefined;
        readonly detectedReadingKind: CatalogMetricReadingKind | undefined;
        readonly customLabel: string | undefined;
        readonly customMaximumValue: number | undefined;
        readonly customIconId: string | undefined;
    }>;
    readonly customMetric?: Partial<{
        readonly url: string | undefined;
        readonly userIntent: string | undefined;
        readonly jqTransform: string | undefined;
        readonly timeoutSeconds: number | undefined;
        readonly retryCount: number | undefined;
        readonly credentialId: string | undefined;
        readonly allowPublicHttpCredentials: boolean | undefined;
        readonly customLabel: string | undefined;
        readonly customIconId: string | undefined;
    }>;
    readonly system?: Partial<{
        readonly peripheralIdentity: ResolvedSystemPeripheralIdentity | undefined;
        readonly detectedPeripheralDisplayName: string | undefined;
        readonly customLabel: string | undefined;
        readonly customIconId: string | undefined;
    }>;
    readonly dense?: DenseWidgetSettingsPatch | undefined;
    readonly stacked?: StackedWidgetSettingsPatch | undefined;
    readonly hardwareSummary?: HardwareSummaryWidgetSettingsPatch | undefined;
}

export type SingleMetricWidgetSettingsPatch = Omit<
    StoredWidgetSettingsPatch,
    "dense" | "stacked" | "preferences"
>;

export interface DenseWidgetSettingsPatch {
    readonly appearance?: ResolvedAppearanceSettingsOverride | undefined;
    readonly addSlot?: DenseMetricSlotPatch | undefined;
    readonly updateSlot?: DenseMetricSlotPatch & {
        readonly slotId: string;
    } | undefined;
    readonly moveSlot?: {
        readonly slotId: string;
        readonly direction: "up" | "down";
    } | undefined;
    readonly removeSlotId?: string | undefined;
}

export interface DenseMetricSlotPatch {
    readonly target?: DenseMetricTargetPatch | undefined;
    readonly customMetric?: StoredWidgetSettingsPatch["customMetric"] | undefined;
    readonly customLabel?: string | undefined;
    readonly customMaximumValue?: number | undefined;
}

export type DenseMetricTargetPatch =
    | { readonly domain: "cpu"; readonly kind: ResolvedCpuReading["kind"] }
    | { readonly domain: "gpu"; readonly kind: ResolvedGpuReading["kind"] }
    | { readonly domain: "memory" }
    | {
        readonly domain: "disk";
        readonly kind: "usage" | "throughput";
        readonly volumeId?: string | undefined;
        readonly throughputDirection?: "read" | "write";
    }
    | {
        readonly domain: "network";
        readonly kind: "traffic";
        readonly direction: "upload" | "download";
        readonly interfaceId?: string | undefined;
    }
    | {
        readonly domain: "catalog";
        readonly metricId: string;
        readonly detectedLabel: string | undefined;
        readonly detectedUnit: MetricUnit | undefined;
        readonly detectedCategory: CatalogMetricCategory | undefined;
        readonly detectedReadingKind: CatalogMetricReadingKind | undefined;
    }
    | {
        readonly domain: "system";
        readonly peripheralIdentity?: ResolvedSystemPeripheralIdentity | undefined;
        readonly detectedPeripheralDisplayName?: string | undefined;
    }
    | { readonly domain: "customMetric" };

export interface StackedWidgetSettingsPatch {
    readonly rotation?: Partial<{
        readonly autoRotateEnabled: boolean;
        readonly intervalSeconds: number;
    }> | undefined;
    readonly addSlot?: StackedMetricSlotPatch | undefined;
    readonly updateSlot?: StackedMetricSlotPatch & {
        readonly slotId: string;
    } | undefined;
    readonly moveSlot?: {
        readonly slotId: string;
        readonly direction: "up" | "down";
    } | undefined;
    readonly removeSlotId?: string | undefined;
}

export interface StackedMetricSlotPatch {
    /** Replaces the selected stacked slot with a default single-metric widget for this domain. */
    readonly metricDomain?: ResolvedMetricTarget["domain"] | undefined;
    readonly singleMetric?: SingleMetricWidgetSettingsPatch | undefined;
}

export interface HardwareSummaryWidgetSettingsPatch {
    readonly switchTo?: HardwareSummaryWidgetModePatch | undefined;
    readonly appearance?: ResolvedAppearanceSettingsOverride | undefined;
    readonly source?: StoredWidgetSettingsPatch["source"] | undefined;
    readonly orderedReadings?: ResolvedCpuHardwareSummaryReadings | ResolvedGpuHardwareSummaryReadings | undefined;
    readonly cpu?: Partial<{
        readonly temperatureUnit: TemperatureUnit;
        readonly maximumTemperatureCelsius: number;
        readonly maximumPowerWatts: number | undefined;
    }> | undefined;
    readonly gpu?: Partial<{
        readonly temperatureUnit: TemperatureUnit;
        readonly maximumTemperatureCelsius: number;
        readonly maximumPowerWatts: number | undefined;
    }> | undefined;
}

export type HardwareSummaryWidgetModePatch =
    | { readonly widgetKind: "hardwareSummary"; readonly domain: "cpu" | "gpu" }
    | { readonly widgetKind: "singleMetric"; readonly domain: "cpu"; readonly kind: ResolvedCpuReading["kind"] }
    | { readonly widgetKind: "singleMetric"; readonly domain: "gpu"; readonly kind: ResolvedGpuReading["kind"] };

export interface WriteStoredWidgetSettingsPatchOptions {
    readonly createSlotId?: SlotIdGenerator;
}
