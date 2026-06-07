import assert from "node:assert/strict";
import test from "node:test";
import {
    CPU_MODEL_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
} from "../../runtime/metric-keys";
import { resolveStoredWidgetSettings } from "../../settings/storage/resolver";
import { readStoredWidgetSettings } from "../../settings/storage/codec";
import {
    buildStackedMetricReadPlan,
    listStackedMetricReadPlanKeys,
    readStackedDisplayedMetricKey,
} from "./read-plan";

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

function resolveStackedWidget(rawSettings: unknown) {
    const resolvedSettings = resolveStoredWidgetSettings({
        storedWidgetSettings: readStoredWidgetSettings(rawSettings).settings,
    });
    if (resolvedSettings.widget.widgetKind !== "stackedMetric") {
        assert.fail(`Expected stackedMetric widget, received ${resolvedSettings.widget.widgetKind}`);
    }

    return resolvedSettings.widget;
}
