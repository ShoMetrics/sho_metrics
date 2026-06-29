import {
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
} from "../../runtime/metric-keys";
import type { MetricReadPlan } from "../../runtime/source-routing/metric-read-plan";
import { buildMetricReadPlanFromSourcePolicy } from "../../runtime/source-routing/metric-read-plan-builder";
import type {
    ResolvedCpuHardwareSummaryReading,
    ResolvedGpuHardwareSummaryReading,
    ResolvedHardwareSummaryWidget,
} from "../../settings/resolved-settings";

/** Inputs for building one hardware summary collection plan. */
export interface HardwareSummaryReadPlanOptions {
    readonly widget: ResolvedHardwareSummaryWidget;
    readonly defaultSourceProfileId: string | undefined;
    readonly platform?: NodeJS.Platform;
}

/** Builds the collection read plan for one curated CPU/GPU summary widget. */
export function buildHardwareSummaryReadPlan(options: HardwareSummaryReadPlanOptions): MetricReadPlan {
    return buildMetricReadPlanFromSourcePolicy({
        metricKeys: resolveHardwareSummaryMetricKeys(options.widget),
        sourcePolicy: options.widget.source,
        defaultSourceProfileId: options.defaultSourceProfileId,
        platform: options.platform,
    });
}

/** Lists every unique metric key needed by the ordered summary readings. */
export function resolveHardwareSummaryMetricKeys(widget: ResolvedHardwareSummaryWidget): readonly string[] {
    const metricKeys = resolveHardwareSummaryTargetMetricKeys(widget.target);

    return [...new Set(metricKeys)];
}

/** Reads the metric key for the primary summary reading used by diagnostics and view updates. */
export function readPrimaryHardwareSummaryMetricKey(widget: ResolvedHardwareSummaryWidget): string {
    const primaryMetricKey = resolveHardwareSummaryMetricKeys(widget)[0];
    if (primaryMetricKey === undefined) {
        throw new Error("Hardware summary widget resolved with no metric keys.");
    }

    return primaryMetricKey;
}

function resolveHardwareSummaryTargetMetricKeys(
    target: ResolvedHardwareSummaryWidget["target"],
): readonly string[] {
    switch (target.domain) {
        case "cpu":
            return target.orderedReadings.flatMap(resolveCpuHardwareSummaryReadingMetricKeys);
        case "gpu":
            return target.orderedReadings.flatMap(resolveGpuHardwareSummaryReadingMetricKeys);
    }
}

function resolveCpuHardwareSummaryReadingMetricKeys(
    reading: ResolvedCpuHardwareSummaryReading,
): readonly string[] {
    switch (reading.kind) {
        case "usage":
            return [CPU_USAGE_METRIC_KEY];
        case "temperature":
            return [CPU_TEMP_METRIC_KEY];
        case "power":
            return [CPU_POWER_METRIC_KEY];
    }

    return assertNever(reading);
}

function resolveGpuHardwareSummaryReadingMetricKeys(
    reading: ResolvedGpuHardwareSummaryReading,
): readonly string[] {
    switch (reading.kind) {
        case "usage":
            return [GPU_USAGE_METRIC_KEY];
        case "temperature":
            return [GPU_TEMP_METRIC_KEY];
        case "vram":
            return [GPU_VRAM_USED_METRIC_KEY, GPU_VRAM_TOTAL_METRIC_KEY];
        case "power":
            return [GPU_POWER_METRIC_KEY, GPU_POWER_LIMIT_METRIC_KEY];
    }

    return assertNever(reading);
}

function assertNever(value: never): never {
    throw new Error(`Unexpected hardware summary read-plan value: ${JSON.stringify(value)}`);
}
