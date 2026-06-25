import assert from "node:assert/strict";
import { test } from "vitest";
import {
    CPU_MODEL_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
    SYSTEM_BATTERY_PERCENT_METRIC_KEY,
} from "../../runtime/metric-keys";
import { buildBatteryMetricKeyFromIdentity } from "../../runtime/sources/battery/battery-metric-key";
import { resolveStoredWidgetSettings } from "../../settings/storage/resolver";
import { readStoredWidgetSettings } from "../../settings/storage/codec";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";
import type { ResolvedSystemPeripheralIdentity } from "../../settings/resolved-settings";
import {
    buildStackedMetricReadPlan,
    listStackedMetricReadPlanKeys,
    readStackedDisplayedMetricKey,
} from "./read-plan";
import { buildCustomHttpRuntimeIdentity, buildStackedCustomHttpConsumerSlug } from "../../runtime/sources/custom-http/custom-http-metric-key";

test("stacked read plan subscribes every configured slot", () => {
    const widget = resolveStackedWidget({
        stackedMetric: {
            slots: [
                { slotId: "cpu-slot", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "memory-slot", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    });

    const resolution = buildStackedMetricReadPlan({ widget });

    assert.deepEqual(listStackedMetricReadPlanKeys(resolution), [
        CPU_MODEL_METRIC_KEY,
        CPU_USAGE_METRIC_KEY,
        RAM_TOTAL_METRIC_KEY,
        RAM_USED_METRIC_KEY,
    ].sort());
    assert.equal(readStackedDisplayedMetricKey(resolution, "cpu-slot"), CPU_USAGE_METRIC_KEY);
    assert.equal(readStackedDisplayedMetricKey(resolution, "memory-slot"), RAM_USED_METRIC_KEY);
});

test("stacked read plan keeps duplicate routes when source policy matches", () => {
    const widget = resolveStackedWidget({
        stackedMetric: {
            slots: [
                { slotId: "first-cpu", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "second-cpu", singleMetric: { slot: { metric: { cpu: {} } } } },
            ],
        },
    });

    const resolution = buildStackedMetricReadPlan({ widget });

    assert.deepEqual(listStackedMetricReadPlanKeys(resolution), [
        CPU_MODEL_METRIC_KEY,
        CPU_USAGE_METRIC_KEY,
    ].sort());
    assert.equal(readStackedDisplayedMetricKey(resolution, "first-cpu"), CPU_USAGE_METRIC_KEY);
    assert.equal(readStackedDisplayedMetricKey(resolution, "second-cpu"), CPU_USAGE_METRIC_KEY);
});

test("stacked read plan downgrades later conflicting source routes", () => {
    const widget = resolveStackedWidget({
        stackedMetric: {
            slots: [
                { slotId: "local-cpu", singleMetric: { slot: { metric: { cpu: {} } } } },
                {
                    slotId: "node-cpu",
                    singleMetric: {
                        slot: {
                            metric: {
                                sourcePolicy: {
                                    primarySourceProfileId: "remote",
                                },
                                cpu: {},
                            },
                        },
                    },
                },
                { slotId: "memory-slot", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    });

    const resolution = buildStackedMetricReadPlan({ widget });

    assert.deepEqual(listStackedMetricReadPlanKeys(resolution), [
        CPU_MODEL_METRIC_KEY,
        CPU_USAGE_METRIC_KEY,
        RAM_TOTAL_METRIC_KEY,
        RAM_USED_METRIC_KEY,
    ].sort());
    assert.equal(readStackedDisplayedMetricKey(resolution, "local-cpu"), CPU_USAGE_METRIC_KEY);
    assert.equal(readStackedDisplayedMetricKey(resolution, "node-cpu"), undefined);
    assert.equal(readStackedDisplayedMetricKey(resolution, "memory-slot"), RAM_USED_METRIC_KEY);
});

test("stacked read plan leaves empty catalog slots unconfigured", () => {
    const widget = resolveStackedWidget({
        stackedMetric: {
            slots: [
                { slotId: "catalog-slot", singleMetric: { slot: { metric: { catalog: {} } } } },
                { slotId: "memory-slot", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    });

    const resolution = buildStackedMetricReadPlan({ widget });

    assert.deepEqual(listStackedMetricReadPlanKeys(resolution), [
        RAM_TOTAL_METRIC_KEY,
        RAM_USED_METRIC_KEY,
    ].sort());
    assert.equal(readStackedDisplayedMetricKey(resolution, "catalog-slot"), undefined);
});

test("stacked read plan subscribes Custom HTTP and built-in slots together", () => {
    const actionId = "stacked-custom-action";
    const url = "https://api.example.com/status";
    const customMetricKey = buildCustomHttpRuntimeIdentity({
        url,
        actionId,
        consumerSlug: buildStackedCustomHttpConsumerSlug("custom-slot"),
    }).metricKey;
    const widget = resolveStackedWidget(buildStackedCustomHttpWidgetSettings(url));

    const resolution = buildStackedMetricReadPlan({ widget, actionId });

    assert.deepEqual(listStackedMetricReadPlanKeys(resolution), [
        customMetricKey,
        RAM_TOTAL_METRIC_KEY,
        RAM_USED_METRIC_KEY,
    ].sort());
    assert.equal(readStackedDisplayedMetricKey(resolution, "custom-slot"), customMetricKey);
    assert.equal(readStackedDisplayedMetricKey(resolution, "memory-slot"), RAM_USED_METRIC_KEY);
});

test("stacked read plan subscribes System battery slots", () => {
    const widget = resolveStackedWidget(writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "stackedMetric", {
            createSlotId: createSequentialSlotIdGenerator(["system-slot", "memory-slot"]),
        }).rawSettings,
        {
            stacked: {
                updateSlot: {
                    slotId: "system-slot",
                    metricDomain: "system",
                },
            },
        },
    ));

    const resolution = buildStackedMetricReadPlan({ widget });

    assert.deepEqual(listStackedMetricReadPlanKeys(resolution), [
        RAM_TOTAL_METRIC_KEY,
        RAM_USED_METRIC_KEY,
        SYSTEM_BATTERY_PERCENT_METRIC_KEY,
    ].sort());
    assert.equal(readStackedDisplayedMetricKey(resolution, "system-slot"), SYSTEM_BATTERY_PERCENT_METRIC_KEY);
});

test("stacked read plan subscribes selected System peripheral battery slots", () => {
    const identity = buildVendorHidPeripheralIdentity();
    const metricKey = buildBatteryMetricKeyFromIdentity(identity);
    const widget = resolveStackedWidget(writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "stackedMetric", {
            createSlotId: createSequentialSlotIdGenerator(["system-slot", "memory-slot"]),
        }).rawSettings,
        {
            stacked: {
                updateSlot: {
                    slotId: "system-slot",
                    metricDomain: "system",
                    singleMetric: {
                        system: {
                            peripheralIdentity: identity,
                            detectedPeripheralDisplayName: "MX Master 4",
                        },
                    },
                },
            },
        },
    ));

    const resolution = buildStackedMetricReadPlan({ widget });

    assert.deepEqual(listStackedMetricReadPlanKeys(resolution), [
        RAM_TOTAL_METRIC_KEY,
        RAM_USED_METRIC_KEY,
        metricKey,
    ].sort());
    assert.equal(readStackedDisplayedMetricKey(resolution, "system-slot"), metricKey);
});

function resolveStackedWidget(rawSettings: unknown) {
    const resolvedSettings = resolveStoredWidgetSettings({
        storedWidgetSettings: readStoredWidgetSettings(rawSettings).settings,
    });
    if (resolvedSettings.widget.widgetKind !== "stackedMetric") {
        assert.fail(`Expected stackedMetric widget, received ${resolvedSettings.widget.widgetKind}`);
    }

    return resolvedSettings.widget;
}

function buildStackedCustomHttpWidgetSettings(url: string): unknown {
    const rawSettings = resolveQuickStartStoredWidgetSettings(undefined, "stackedMetric", {
        createSlotId: createSequentialSlotIdGenerator(["custom-slot", "memory-slot"]),
    }).rawSettings;

    return writeStoredWidgetSettingsPatch(rawSettings, {
        stacked: {
            updateSlot: {
                slotId: "custom-slot",
                metricDomain: "customMetric",
                singleMetric: {
                    customMetric: {
                        url,
                        userIntent: "show temperature",
                        jqTransform: ".temperature",
                    },
                },
            },
        },
    });
}

function createSequentialSlotIdGenerator(slotIds: readonly string[]): () => string {
    const remainingSlotIds = [...slotIds];
    return () => remainingSlotIds.shift() ?? "unexpected-slot";
}

function buildVendorHidPeripheralIdentity(): ResolvedSystemPeripheralIdentity {
    return {
        evidence: {
            kind: "vendorHid",
            vendorId: 0x046D,
            productId: 0xC548,
            manufacturer: "Logitech",
            productName: "MX Master 4",
            serialNumber: undefined,
            interfaceNumber: 2,
            usagePage: 0xFF00,
            usageId: undefined,
            bindingTransport: "usbReceiver",
            receiverKind: "bolt",
            vendorUnitId: "unit-2",
            modelId: "mx-master-4",
            receiverSlot: 2,
        },
    };
}
