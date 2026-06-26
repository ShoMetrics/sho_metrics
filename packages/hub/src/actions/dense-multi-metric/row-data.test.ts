import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildDenseMetricReadPlan,
    buildDenseMetricWidgetData,
} from "./row-data";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../../runtime/metric-store";
import type {
    ResolvedAppearanceSettings,
    ResolvedDenseMetricSlot,
    ResolvedDenseMultiMetricWidget,
    ResolvedMetricSourcePolicy,
    ResolvedMetricTarget,
} from "../../settings/resolved-settings";
import { CPU_USAGE_METRIC_KEY, GPU_USAGE_METRIC_KEY } from "../../runtime/metric-keys";
import { resolveDiskUsageMetricKey } from "../../runtime/disk-metric-keys";
import { MetricUnit } from "../../runtime/sources/metric-source";
import type { SourceMetricValueMetadata } from "../../runtime/sources/source-client";
import type { WidgetData } from "../../view-rendering/widget-data";
import {
    BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
} from "../../runtime/sources/source-ids";
import { listMetricReadPlanKeys } from "../../runtime/source-routing/metric-read-plan";
import { buildCustomHttpRuntimeIdentity, buildDenseCustomHttpConsumerSlug } from "../../runtime/sources/custom-http/custom-http-metric-key";

test("dense read plan subscribes configured 2-to-6 rows", () => {
    const widget = buildDenseWidget([
        buildSlot("slot-1", buildCpuUsageTarget()),
        buildSlot("slot-2", buildGpuUsageTarget()),
        buildSlot("slot-3", buildMemoryUsageTarget()),
        buildSlot("slot-4", buildCatalogTarget("sensor:/cpu/temp")),
        buildSlot("slot-5", buildCpuUsageTarget()),
        buildSlot("slot-6", buildGpuUsageTarget()),
    ]);

    const readPlanResolution = buildDenseMetricReadPlan({ widget, platform: "win32" });

    assert.deepEqual(readPlanResolution.rows.map(row => row.rowKind), [
        "configured",
        "configured",
        "configured",
        "configured",
        "configured",
        "configured",
    ]);
    assert.deepEqual(listMetricReadPlanKeys(readPlanResolution.readPlan), [
        "cpu.usage_percent",
        "gpu.usage_percent",
        "ram.total",
        "ram.used",
        "sensor:/cpu/temp",
    ]);
});

test("dense read plan keeps duplicate rows when their source route is identical", () => {
    const widget = buildDenseWidget([
        buildSlot("slot-1", buildCpuUsageTarget()),
        buildSlot("slot-2", buildCpuUsageTarget()),
    ]);

    const readPlanResolution = buildDenseMetricReadPlan({ widget, platform: "win32" });

    assert.deepEqual(readPlanResolution.rows.map(row => row.rowKind), ["configured", "configured"]);
    assert.deepEqual(listMetricReadPlanKeys(readPlanResolution.readPlan), [CPU_USAGE_METRIC_KEY]);
});

test("dense disk usage rows subscribe the selected disk volume", () => {
    const widget = buildDenseWidget([
        buildSlot("slot-1", buildDiskUsageTarget("E:\\")),
        buildSlot("slot-2", buildCpuUsageTarget()),
    ]);

    const readPlanResolution = buildDenseMetricReadPlan({ widget, platform: "win32" });

    assert.deepEqual(listMetricReadPlanKeys(readPlanResolution.readPlan), [
        CPU_USAGE_METRIC_KEY,
        resolveDiskUsageMetricKey("available", "E:\\"),
        resolveDiskUsageMetricKey("total", "E:\\"),
        resolveDiskUsageMetricKey("used", "E:\\"),
    ]);
});

test("dense read plan downgrades later duplicate rows with conflicting source routes", () => {
    const widget = buildDenseWidget([
        buildSlot("slot-1", buildCpuUsageTarget(), nodeSourcePolicy),
        buildSlot("slot-2", buildCpuUsageTarget(), windowsHelperSourcePolicy),
    ]);

    const readPlanResolution = buildDenseMetricReadPlan({ widget, platform: "win32" });

    assert.equal(readPlanResolution.rows[0]?.rowKind, "configured");
    assert.deepEqual(readPlanResolution.rows[1], {
        rowKind: "unconfigured",
        slotId: "slot-2",
        reason: "conflictingSourcePolicy",
        label: "CPU",
    });
    assert.deepEqual(listMetricReadPlanKeys(readPlanResolution.readPlan), [CPU_USAGE_METRIC_KEY]);
});

test("dense widget data keeps no-data isolated to the affected row", () => {
    const widget = buildDenseWidget([
        buildSlot("slot-1", buildCpuUsageTarget(), nodeSourcePolicy, { customLabel: "CPU" }),
        buildSlot("slot-2", buildGpuUsageTarget(), nodeSourcePolicy, { customLabel: "GPU" }),
    ]);
    const metrics = new FakeMetricStoreReader({
        [CPU_USAGE_METRIC_KEY]: buildWidgetData({
            current: 26,
            progress: 0.26,
            label: "CPU",
            unit: "%",
            sampleTimestampMilliseconds: 10_000,
        }),
    });

    const widgetData = buildDenseMetricWidgetData({
        widget,
        metrics,
        platform: "win32",
        currentTimestampMilliseconds: 10_000,
    });

    assert.deepEqual(widgetData.rows.map(row => ({
        rowKind: row.rowKind,
        label: row.widgetData.label,
        current: row.widgetData.current,
        sampleTimestampMilliseconds: row.widgetData.sampleTimestampMilliseconds,
    })), [
        {
            rowKind: "configured",
            label: "CPU",
            current: 26,
            sampleTimestampMilliseconds: 10_000,
        },
        {
            rowKind: "configured",
            label: "GPU",
            current: 0,
            sampleTimestampMilliseconds: undefined,
        },
    ]);
});

test("dense widget data applies catalog label and raw maximum resolution", () => {
    const metricKey = "sensor:/gpu/power";
    const widget = buildDenseWidget([
        buildSlot("slot-1", buildCatalogTarget(metricKey), nodeSourcePolicy, {
            customLabel: "PWR",
            customMaximumValue: 600,
        }),
        buildSlot("slot-2", buildGpuUsageTarget()),
    ]);
    const metrics = new FakeMetricStoreReader({
        [metricKey]: buildWidgetData({
            current: 450,
            progress: 0.75,
            label: "PWR",
            unit: "W",
            sampleTimestampMilliseconds: 10_000,
        }),
    });

    const widgetData = buildDenseMetricWidgetData({
        widget,
        metrics,
        platform: "win32",
        currentTimestampMilliseconds: 10_000,
    });

    assert.deepEqual(widgetData.rows[0]?.widgetData, {
        current: 450,
        progress: 0.75,
        history: [],
        label: "PWR",
        unit: "W",
        sampleTimestampMilliseconds: 10_000,
    });
});

test("dense empty catalog rows are unconfigured without affecting other rows", () => {
    const widget = buildDenseWidget([
        buildSlot("slot-1", buildCatalogTarget("")),
        buildSlot("slot-2", buildGpuUsageTarget()),
    ]);

    const readPlanResolution = buildDenseMetricReadPlan({ widget, platform: "win32" });

    assert.deepEqual(readPlanResolution.rows.map(row => row.rowKind), ["unconfigured", "configured"]);
    assert.deepEqual(listMetricReadPlanKeys(readPlanResolution.readPlan), [GPU_USAGE_METRIC_KEY]);
});

test("dense custom metric rows use independent runtime keys for the same URL", () => {
    const actionId = "dense-custom-action";
    const url = "https://api.example.com/status";
    const firstMetricKey = buildCustomHttpRuntimeIdentity({
        url,
        actionId,
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-1"),
    }).metricKey;
    const secondMetricKey = buildCustomHttpRuntimeIdentity({
        url,
        actionId,
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-2"),
    }).metricKey;
    const widget = buildDenseWidget([
        buildSlot("slot-1", buildCustomMetricTarget(url, ".temp"), autoSourcePolicy, { customLabel: "TEMP" }),
        buildSlot("slot-2", buildCustomMetricTarget(url, ".humidity"), autoSourcePolicy, { customLabel: "HUM" }),
    ]);

    const readPlanResolution = buildDenseMetricReadPlan({ widget, actionId, platform: "win32" });

    assert.deepEqual(readPlanResolution.rows.map(row => row.rowKind), ["configured", "configured"]);
    assert.deepEqual(listMetricReadPlanKeys(readPlanResolution.readPlan), [
        firstMetricKey,
        secondMetricKey,
    ].sort());
});

test("dense custom metric row data stays isolated when one row has no sample", () => {
    const actionId = "dense-custom-data-action";
    const url = "https://api.example.com/status";
    const tempMetricKey = buildCustomHttpRuntimeIdentity({
        url,
        actionId,
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-temp"),
    }).metricKey;
    const widget = buildDenseWidget([
        buildSlot("slot-temp", buildCustomMetricTarget(url, ".temp"), autoSourcePolicy),
        buildSlot("slot-hum", buildCustomMetricTarget(url, ".humidity"), autoSourcePolicy),
    ]);
    const metrics = new FakeMetricStoreReader({
        [tempMetricKey]: buildWidgetData({
            current: 24,
            progress: 0,
            label: "HTTP",
            unit: "",
            sampleTimestampMilliseconds: 10_000,
        }),
    }, {
        [tempMetricKey]: {
            metricId: tempMetricKey,
            valueFreshness: "fresh",
            displayHint: {
                label: "TEMP",
                unit: MetricUnit.CELSIUS,
                maximum: 40,
            },
        },
    });

    const widgetData = buildDenseMetricWidgetData({
        widget,
        actionId,
        metrics,
        platform: "win32",
        currentTimestampMilliseconds: 10_000,
    });

    assert.deepEqual(widgetData.rows.map(row => ({
        rowKind: row.rowKind,
        label: row.widgetData.label,
        current: row.widgetData.current,
        progress: row.widgetData.progress,
        sampleTimestampMilliseconds: row.widgetData.sampleTimestampMilliseconds,
    })), [
        {
            rowKind: "configured",
            label: "TEMP",
            current: 24,
            progress: 0.6,
            sampleTimestampMilliseconds: 10_000,
        },
        {
            rowKind: "configured",
            label: "HTTP",
            current: 0,
            progress: 0,
            sampleTimestampMilliseconds: undefined,
        },
    ]);
});

const autoSourcePolicy: ResolvedMetricSourcePolicy = {
    primarySourceProfileId: undefined,
    fallbackSourceProfileIds: [],
    failureMode: "useFallback",
};

const nodeSourcePolicy: ResolvedMetricSourcePolicy = {
    primarySourceProfileId: BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    fallbackSourceProfileIds: [],
    failureMode: "showUnavailable",
};

const windowsHelperSourcePolicy: ResolvedMetricSourcePolicy = {
    primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
    fallbackSourceProfileIds: [],
    failureMode: "showUnavailable",
};

function buildDenseWidget(slots: readonly ResolvedDenseMetricSlot[]): ResolvedDenseMultiMetricWidget {
    return {
        widgetKind: "denseMultiMetric",
        slots,
        appearance: {} as ResolvedAppearanceSettings,
    };
}

function buildSlot(
    slotId: string,
    target: ResolvedMetricTarget,
    source: ResolvedMetricSourcePolicy = autoSourcePolicy,
    overrides: {
        readonly customLabel?: string | undefined;
        readonly customMaximumValue?: number | undefined;
    } = {},
): ResolvedDenseMetricSlot {
    return {
        slotId,
        slot: {
            metric: {
                source,
                target,
            },
            appearance: {} as ResolvedAppearanceSettings,
        },
        customLabel: overrides.customLabel,
        customMaximumValue: overrides.customMaximumValue,
    };
}

function buildCpuUsageTarget(): ResolvedMetricTarget {
    return {
        domain: "cpu",
        reading: { kind: "usage" },
    };
}

function buildGpuUsageTarget(): ResolvedMetricTarget {
    return {
        domain: "gpu",
        gpuId: undefined,
        reading: { kind: "usage" },
    };
}

function buildMemoryUsageTarget(): ResolvedMetricTarget {
    return {
        domain: "memory",
        reading: { kind: "usage" },
    };
}

function buildDiskUsageTarget(volumeId: string | undefined): ResolvedMetricTarget {
    return {
        domain: "disk",
        volumeId,
        reading: {
            kind: "usage",
            displayMode: "percentage",
            barLabel: "",
        },
    };
}

function buildCatalogTarget(metricId: string): ResolvedMetricTarget {
    return {
        domain: "catalog",
        metricId,
        detectedLabel: "GPU Board Power",
        detectedUnit: MetricUnit.WATTS,
        detectedCategory: "gpu",
        detectedReadingKind: "power",
        customLabel: undefined,
        customMaximumValue: undefined,
        customIconId: undefined,
    };
}

function buildCustomMetricTarget(url: string, jqTransform: string): ResolvedMetricTarget {
    return {
        domain: "customMetric",
        customLabel: undefined,
        customIconId: undefined,
        configuration: {
            state: "configured",
            source: {
                kind: "http",
                plan: {
                    kind: "singleRequest",
                    request: {
                        url,
                        userIntent: "show the requested value",
                        jqTransform,
                        requestSettings: {
                            timeoutSeconds: 5,
                            retryCount: 0,
                        },
                        auth: {
                            credentialId: undefined,
                            allowPublicHttpCredentials: false,
                        },
                    },
                },
            },
        },
    };
}

function buildWidgetData(overrides: Partial<WidgetData> = {}): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        label: "METRIC",
        unit: "",
        ...overrides,
    };
}

class FakeMetricStoreReader implements MetricStoreReader {
    constructor(
        private readonly widgetDataByMetricKey: Readonly<Record<string, WidgetData>>,
        private readonly metadataByMetricKey: Readonly<Record<string, SourceMetricValueMetadata>> = {},
    ) {}

    getWidgetData(metricKey: string, label: string, unit: string, maxValue = 100): WidgetData {
        return this.widgetDataByMetricKey[metricKey] ?? buildWidgetData({ label, unit, progress: 0 / maxValue });
    }

    getWidgetDataReadResult(
        metricKey: string,
        label: string,
        unit: string,
        maxValue?: number,
    ): MetricWidgetDataReadResult {
        return {
            widgetData: this.getWidgetData(metricKey, label, unit, maxValue),
            selectedSourceId: undefined,
            valueMetadata: this.metadataByMetricKey[metricKey],
        };
    }

    getTextValue(metricKey: string): string | undefined {
        void metricKey;
        return undefined;
    }
}
