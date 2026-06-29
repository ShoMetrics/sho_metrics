import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveInitialActionSettings } from "../settings/action-settings-resolver";
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
import { listMetricReadPlanKeys } from "../../runtime/source-routing/metric-read-plan";
import {
    requireResolvedHardwareSummaryWidget,
    type ResolvedCpuHardwareSummaryReadings,
    type ResolvedGpuHardwareSummaryReadings,
    type ResolvedHardwareSummaryWidget,
} from "../../settings/resolved-settings";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";
import {
    buildHardwareSummaryReadPlan,
    resolveHardwareSummaryMetricKeys,
} from "./read-plan";

test("CPU default summary read plan contains usage, temperature, and power keys", () => {
    const widget = buildHardwareSummaryWidget("cpu");
    const readPlan = buildHardwareSummaryReadPlan({
        widget,
        defaultSourceProfileId: undefined,
        platform: "win32",
    });

    assert.deepEqual(listMetricReadPlanKeys(readPlan), [
        CPU_POWER_METRIC_KEY,
        CPU_TEMP_METRIC_KEY,
        CPU_USAGE_METRIC_KEY,
    ]);
});

test("GPU default summary read plan contains usage, temperature, and VRAM keys", () => {
    const widget = buildHardwareSummaryWidget("gpu");
    const readPlan = buildHardwareSummaryReadPlan({
        widget,
        defaultSourceProfileId: undefined,
        platform: "win32",
    });

    assert.deepEqual(listMetricReadPlanKeys(readPlan), [
        GPU_TEMP_METRIC_KEY,
        GPU_USAGE_METRIC_KEY,
        GPU_VRAM_TOTAL_METRIC_KEY,
        GPU_VRAM_USED_METRIC_KEY,
    ]);
});

test("GPU power selected as a secondary reading adds power and power limit keys", () => {
    const widget = buildHardwareSummaryWidget("gpu", [
        { kind: "usage" },
        { kind: "temperature", maximumCelsius: 100, unit: "celsius" },
        { kind: "power", maximumWatts: 320 },
    ]);

    assert.deepEqual(resolveHardwareSummaryMetricKeys(widget), [
        GPU_USAGE_METRIC_KEY,
        GPU_TEMP_METRIC_KEY,
        GPU_POWER_METRIC_KEY,
        GPU_POWER_LIMIT_METRIC_KEY,
    ]);
});

test("summary metric keys are deduplicated", () => {
    const widget = buildGpuHardwareSummaryWidgetWithReadings([
        { kind: "vram" },
        { kind: "vram" },
        { kind: "usage" },
    ]);

    assert.deepEqual(resolveHardwareSummaryMetricKeys(widget), [
        GPU_VRAM_USED_METRIC_KEY,
        GPU_VRAM_TOTAL_METRIC_KEY,
        GPU_USAGE_METRIC_KEY,
    ]);
});

function buildHardwareSummaryWidget(
    domain: "cpu",
    orderedReadings?: ResolvedCpuHardwareSummaryReadings,
): ResolvedHardwareSummaryWidget;
function buildHardwareSummaryWidget(
    domain: "gpu",
    orderedReadings?: ResolvedGpuHardwareSummaryReadings,
): ResolvedHardwareSummaryWidget;
function buildHardwareSummaryWidget(
    domain: "cpu" | "gpu",
    orderedReadings?: ResolvedCpuHardwareSummaryReadings | ResolvedGpuHardwareSummaryReadings,
): ResolvedHardwareSummaryWidget {
    const rawSettings = writeStoredWidgetSettingsPatch(undefined, {
        hardwareSummary: {
            switchTo: { widgetKind: "hardwareSummary", domain },
            ...(orderedReadings === undefined ? {} : { orderedReadings }),
        },
    });
    const resolvedSettings = resolveInitialActionSettings(rawSettings, domain).resolvedSettings;

    return requireResolvedHardwareSummaryWidget(resolvedSettings);
}

function buildGpuHardwareSummaryWidgetWithReadings(
    orderedReadings: ResolvedGpuHardwareSummaryReadings,
): ResolvedHardwareSummaryWidget {
    const widget = buildHardwareSummaryWidget("gpu");

    return {
        ...widget,
        target: {
            domain: "gpu",
            gpuId: undefined,
            orderedReadings,
        },
    };
}
