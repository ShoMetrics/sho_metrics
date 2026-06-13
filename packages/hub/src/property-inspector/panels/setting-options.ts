import type { SelectOption, SelectOptionValue } from "../inspector/types";
import type {
    ResolvedCpuReading,
    ResolvedGpuReading,
    ResolvedNetworkReading,
    TerminalPalettePreset,
    TerminalThemeVariant,
} from "../../settings/resolved-settings";
import {
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
} from "../../runtime/metric-keys";
import {
    CUSTOM_HTTP_RETRY_COUNT_OPTIONS,
    CUSTOM_HTTP_TIMEOUT_SECOND_OPTIONS,
} from "../../runtime/sources/custom-http/custom-http-request-policy";
import { isBuiltInMetricSupportedOnPlatform } from "../../runtime/source-routing/metric-source-preferences";
import type { MetricSupportPlatform } from "../../runtime/source-capabilities/metric-support-platform";

export const pollingFrequencyOptionList = [
    { value: 1, label: "1s" },
    { value: 2, label: "2s" },
    { value: 3, label: "3s" },
    { value: 5, label: "5s" },
    { value: 10, label: "10s" },
    { value: 15, label: "15s" },
    { value: 30, label: "30s" },
    { value: 60, label: "60s" },
] as const satisfies readonly SelectOption<number>[];

export const customHttpPollingFrequencyOptionList = [
    ...pollingFrequencyOptionList,
    { value: 300, label: "5m" },
    { value: 900, label: "15m" },
    { value: 1800, label: "30m" },
    { value: 3600, label: "1h" },
    { value: 7200, label: "2h" },
    { value: 10800, label: "3h" },
    { value: 21600, label: "6h" },
    { value: 43200, label: "12h" },
    { value: 86400, label: "24h" },
] as const satisfies readonly SelectOption<number>[];

export const customHttpTimeoutSecondOptionList = [
    ...CUSTOM_HTTP_TIMEOUT_SECOND_OPTIONS.map(value => ({ value, label: `${value}s` })),
] as const satisfies readonly SelectOption<number>[];

export const customHttpRetryCountOptionList = [
    ...CUSTOM_HTTP_RETRY_COUNT_OPTIONS.map(value => ({ value, label: `${value}` })),
] as const satisfies readonly SelectOption<number>[];

export const themeOptionList = [
    { value: "flat", label: "Default" },
    { value: "cupertino-glass", label: "Cupertino Glass Style" },
    { value: "color-filled", label: "Color Filled" },
    { value: "terminal", label: "Terminal" },
    { value: "pixel-window", label: "Pixel Window" },
] as const satisfies readonly SelectOption[];

export const terminalVariantOptionList = [
    { value: "clean", label: "Clean" },
    { value: "vintage", label: "Vintage" },
] as const satisfies readonly SelectOption<TerminalThemeVariant>[];

export const terminalPaletteOptionList = [
    { value: "green", label: "Green" },
    { value: "amber", label: "Amber" },
    { value: "cyan", label: "Cyan" },
    { value: "white", label: "White" },
] as const satisfies readonly SelectOption<TerminalPalettePreset>[];

export const metricPaintColorModeOptionList = [
    { value: "multi-color", label: "Range Colors" },
    { value: "solid", label: "Solid Color" },
    { value: "black-white", label: "Black & White" },
] as const satisfies readonly SelectOption[];

export const colorFilledColorModeOptionList = [
    { value: "multi-color", label: "Color Mix" },
    { value: "solid", label: "Solid Color" },
    { value: "black-white", label: "Black & White" },
] as const satisfies readonly SelectOption[];

export const gridLineVisibilityOptionList = [
    { value: "adaptive", label: "Adaptive to Activity" },
    { value: "always", label: "Always" },
    { value: "none", label: "None" },
] as const satisfies readonly SelectOption[];

export const disabledGridLineVisibilityOptionList = [
    { value: "none", label: "None" },
] as const satisfies readonly SelectOption[];

export const gridLineTypeOptionList = [
    { value: "horizontal", label: "Horizontal" },
    { value: "vertical", label: "Vertical" },
] as const satisfies readonly SelectOption[];

export const networkDirectionOptionList = [
    { value: "both", label: "Upload & Download" },
    { value: "upload", label: "Upload" },
    { value: "download", label: "Download" },
] as const satisfies readonly SelectOption[];

export const networkMetricKindOptionList = [
    { value: "traffic", label: "Traffic" },
    { value: "ping", label: "Ping" },
] as const satisfies readonly SelectOption<ResolvedNetworkReading["kind"]>[];

export const networkTrafficDisplayModeOptionList = [
    { value: "overlay", label: "Overlay" },
    { value: "mirrored", label: "Mirrored" },
] as const satisfies readonly SelectOption[];

export const scaleModeOptionList = [
    { value: "auto", label: "Auto" },
    { value: "custom", label: "Custom" },
] as const satisfies readonly SelectOption[];

export const networkUnitBaseOptionList = [
    { value: "byte", label: "Byte/s" },
    { value: "bit", label: "Bit/s" },
] as const satisfies readonly SelectOption[];

export const diskMetricKindOptionList = [
    { value: "usage", label: "Usage" },
    { value: "throughput", label: "Throughput" },
] as const satisfies readonly SelectOption[];

export const diskUsageDisplayModeOptionList = [
    { value: "percentage", label: "Percentage" },
    { value: "space", label: "Free Space" },
] as const satisfies readonly SelectOption[];

export const diskThroughputDirectionOptionList = [
    { value: "both", label: "Read & Write" },
    { value: "read", label: "Read" },
    { value: "write", label: "Write" },
] as const satisfies readonly SelectOption[];

export const cpuMetricKindOptionList = [
    { value: "usage", label: "Usage" },
    { value: "temperature", label: "Temperature" },
    { value: "power", label: "Power" },
] as const satisfies readonly SelectOption<ResolvedCpuReading["kind"]>[];

export const gpuMetricKindOptionList = [
    { value: "usage", label: "Usage" },
    { value: "temperature", label: "Temperature" },
    { value: "vram", label: "VRAM" },
    { value: "power", label: "Power" },
] as const satisfies readonly SelectOption<ResolvedGpuReading["kind"]>[];

export const temperatureUnitOptionList = [
    { value: "celsius", label: "Celsius" },
    { value: "fahrenheit", label: "Fahrenheit" },
] as const satisfies readonly SelectOption[];

/**
 * Builds CPU metric choices that have at least one source on the target platform.
 *
 * When the current stored choice is unsupported, include it as a disabled
 * option so users can see what is stored and switch away from it.
 */
export function buildCpuMetricKindOptionList(
    platform: MetricSupportPlatform,
    currentKind?: ResolvedCpuReading["kind"],
): readonly SelectOption<ResolvedCpuReading["kind"]>[] {
    const supportedOptions = cpuMetricKindOptionList.filter(option =>
        isBuiltInMetricSupportedOnPlatform(resolveCpuMetricKindMetricKey(option.value), platform),
    );

    return appendUnsupportedCurrentOption(supportedOptions, cpuMetricKindOptionList, currentKind);
}

/**
 * Builds GPU metric choices whose required metric keys are all source-supported on the target platform.
 *
 * When the current stored choice is unsupported, include it as a disabled
 * option so users can see what is stored and switch away from it.
 */
export function buildGpuMetricKindOptionList(
    platform: MetricSupportPlatform,
    currentKind?: ResolvedGpuReading["kind"],
): readonly SelectOption<ResolvedGpuReading["kind"]>[] {
    const supportedOptions = gpuMetricKindOptionList.filter(option =>
        resolveGpuMetricKindMetricKeys(option.value).every(metricKey =>
            isBuiltInMetricSupportedOnPlatform(metricKey, platform),
        ),
    );

    return appendUnsupportedCurrentOption(supportedOptions, gpuMetricKindOptionList, currentKind);
}

/** Maps a CPU PI reading choice to its stable runtime metric key. */
export function resolveCpuMetricKindMetricKey(kind: ResolvedCpuReading["kind"]): string {
    switch (kind) {
        case "usage":
            return CPU_USAGE_METRIC_KEY;
        case "temperature":
            return CPU_TEMP_METRIC_KEY;
        case "power":
            return CPU_POWER_METRIC_KEY;
    }
}

/**
 * Maps a GPU PI reading choice to the runtime metric keys it needs.
 *
 * VRAM needs both used and total values, so platform filtering must require
 * both keys to be source-supported before showing the VRAM option.
 */
export function resolveGpuMetricKindMetricKeys(kind: ResolvedGpuReading["kind"]): readonly string[] {
    switch (kind) {
        case "usage":
            return [GPU_USAGE_METRIC_KEY];
        case "temperature":
            return [GPU_TEMP_METRIC_KEY];
        case "vram":
            return [GPU_VRAM_USED_METRIC_KEY, GPU_VRAM_TOTAL_METRIC_KEY];
        case "power":
            return [GPU_POWER_METRIC_KEY];
    }
}

function appendUnsupportedCurrentOption<TValue extends SelectOptionValue>(
    supportedOptions: readonly SelectOption<TValue>[],
    allOptions: readonly SelectOption<TValue>[],
    currentValue: TValue | undefined,
): readonly SelectOption<TValue>[] {
    if (currentValue === undefined || supportedOptions.some(option => option.value === currentValue)) {
        return supportedOptions;
    }

    const currentOption = allOptions.find(option => option.value === currentValue);
    if (!currentOption) {
        return supportedOptions;
    }

    return [
        ...supportedOptions,
        {
            ...currentOption,
            label: `${currentOption.label} (not supported)`,
            disabled: true,
        },
    ];
}
