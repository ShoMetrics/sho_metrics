import assert from "node:assert/strict";
import { test } from "vitest";
import { MetricSourcePolicy_FailureMode as StoredSourceFailureMode } from "../../../generated/proto/shometrics/v1/settings_pb";
import { MetricUnit } from "../../../runtime/sources/metric-source";
import { readStoredWidgetSettings } from "../codec";
import { resolveStoredWidgetSettings } from "../resolver";
import { writeStoredWidgetSettingsPatch } from "./widget-settings-patch";
import { readStackedMetricWidget } from "./testing/widget-settings-patch-test-helpers";

test("widget patch updates stacked metric rotation settings", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            rotation: {
                autoRotateEnabled: false,
                intervalSeconds: 5,
            },
        },
    });
    const widget = readStackedMetricWidget(nextSettings);

    assert.equal(widget.rotation?.autoRotateEnabled, false);
    assert.equal(widget.rotation?.intervalSeconds, 5);
});

test("widget patch rejects stacked metric rotation intervals outside the supported range", () => {
    assert.throws(() => writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            rotation: {
                intervalSeconds: 6,
            },
        },
    }), /1 to 5 seconds/);
});

test("widget patch adds stacked metric slots with storage-owned ids", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            addSlot: {},
        },
    }, {
        createSlotId: () => "slot-3",
    });
    const widget = readStackedMetricWidget(nextSettings);

    assert.equal(widget.slots.length, 3);
    assert.equal(widget.slots[2]?.slotId, "slot-3");
    assert.equal(widget.slots[2]?.item.case, "singleMetric");
    assert.equal(widget.slots[2]?.item.value.slot?.metric?.target.case, "cpu");
    assert.equal(widget.slots[2]?.item.value.slot?.metric?.target.value.reading.case, "usage");

    const resolvedSettings = resolveStoredWidgetSettings({
        storedWidgetSettings: readStoredWidgetSettings(nextSettings).settings,
    });
    assert.equal(resolvedSettings.widget.widgetKind, "stackedMetric");
    assert.equal(resolvedSettings.widget.slots[2]?.widget.slot.metric.target.domain, "cpu");
});

test("widget patch moves stacked metric slots by stable slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
                { slotId: "slot-3", singleMetric: { slot: { metric: { network: {} } } } },
            ],
        },
    }, {
        stacked: {
            moveSlot: {
                slotId: "slot-3",
                direction: "up",
            },
        },
    });
    const widget = readStackedMetricWidget(nextSettings);

    assert.deepEqual(widget.slots.map((slot) => slot.slotId), ["slot-1", "slot-3", "slot-2"]);
});

test("widget patch updates a stacked single metric item by slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            updateSlot: {
                slotId: "slot-1",
                singleMetric: {
                    source: {
                        primarySourceProfileId: "remote",
                        fallbackSourceProfileIds: ["local"],
                        failureMode: "useFallback",
                    },
                },
            },
        },
    });
    const widget = readStackedMetricWidget(nextSettings);
    const firstSlot = widget.slots[0];

    assert.equal(firstSlot?.item.case, "singleMetric");
    assert.equal(firstSlot.item.value.slot?.metric?.sourcePolicy?.primarySourceProfileId, "remote");
    assert.deepEqual(firstSlot.item.value.slot?.metric?.sourcePolicy?.fallbackSourceProfileIds, ["local"]);
    assert.equal(firstSlot.item.value.slot?.metric?.sourcePolicy?.failureMode, StoredSourceFailureMode.USE_FALLBACK);
});

test("widget patch replaces a stacked slot metric domain before applying single metric patches", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            updateSlot: {
                slotId: "slot-1",
                metricDomain: "catalog",
                singleMetric: {
                    catalog: {
                        metricId: "source.sensor:/gpu/0/power",
                        detectedLabel: "GPU Power",
                        detectedUnit: MetricUnit.WATTS,
                        detectedCategory: "gpu",
                        detectedReadingKind: "power",
                    },
                },
            },
        },
    });
    const widget = readStackedMetricWidget(nextSettings);
    const firstSlot = widget.slots[0];

    assert.equal(firstSlot?.item.case, "singleMetric");
    assert.equal(firstSlot.item.value.slot?.metric?.target.case, "catalog");
    assert.equal(firstSlot.item.value.slot?.metric?.target.value.metricId, "source.sensor:/gpu/0/power");
});

test("widget patch rejects removing stacked metric slots below the minimum", () => {
    assert.throws(() => writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            removeSlotId: "slot-2",
        },
    }), /minimum of 2/);
});
