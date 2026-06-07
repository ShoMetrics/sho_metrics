import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    MemoryMetricTarget_Kind as StoredMemoryMetricKind,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    NetworkMetricTarget_Kind as StoredNetworkMetricKind,
    NetworkMetricTarget_Traffic_Direction as StoredNetworkDirection,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb";
import { MetricUnit } from "../../generated/shometrics/v1/snapshot_pb";
import { BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID } from "../../runtime/sources/source-ids";
import type { ActionKind } from "../../shared/stream-deck-actions";
import { resolveQuickStartStoredWidgetSettings } from "./quick-start-widget-settings";

describe("quick-start stored widget settings", () => {
    it("preserves unknown action raw settings without requesting persistence", () => {
        const rawSettings = {
            preferences: {
                pollingFrequencySeconds: 30,
            },
        };
        const quickStartSettings = resolveQuickStartStoredWidgetSettings(rawSettings, "unknown");

        assert.equal(quickStartSettings.rawSettings, rawSettings);
        assert.equal(quickStartSettings.settingsJsonToPersist, null);
        assert.equal(quickStartSettings.readWarning, null);
        assert.equal(quickStartSettings.storedSettings.preferences?.pollingFrequencySeconds, 30);
    });

    it("creates explicit default metric targets for domain actions", () => {
        const testCases: ReadonlyArray<{
            actionKind: Exclude<ActionKind, "unknown">;
            verifyTarget: (settings: StoredWidgetSettings) => void;
        }> = [
            {
                actionKind: "cpu",
                verifyTarget: (settings) => {
                    const target = readStoredMetricTarget(settings);
                    if (target?.case !== "cpu") {
                        assert.fail(`Expected CPU target, received ${String(target?.case)}`);
                    }
                    assert.equal(target.value.kind, StoredCpuMetricKind.USAGE);
                },
            },
            {
                actionKind: "gpu",
                verifyTarget: (settings) => {
                    const target = readStoredMetricTarget(settings);
                    if (target?.case !== "gpu") {
                        assert.fail(`Expected GPU target, received ${String(target?.case)}`);
                    }
                    assert.equal(target.value.kind, StoredGpuMetricKind.USAGE);
                },
            },
            {
                actionKind: "memory",
                verifyTarget: (settings) => {
                    const target = readStoredMetricTarget(settings);
                    if (target?.case !== "memory") {
                        assert.fail(`Expected memory target, received ${String(target?.case)}`);
                    }
                    assert.equal(target.value.kind, StoredMemoryMetricKind.USAGE);
                },
            },
            {
                actionKind: "disk",
                verifyTarget: (settings) => {
                    const target = readStoredMetricTarget(settings);
                    if (target?.case !== "disk") {
                        assert.fail(`Expected disk target, received ${String(target?.case)}`);
                    }
                    assert.equal(target.value.kind, StoredDiskMetricKind.USAGE);
                },
            },
            {
                actionKind: "network",
                verifyTarget: (settings) => {
                    const target = readStoredMetricTarget(settings);
                    if (target?.case !== "network") {
                        assert.fail(`Expected network target, received ${String(target?.case)}`);
                    }
                    assert.equal(target.value.kind, StoredNetworkMetricKind.TRAFFIC);
                    assert.equal(target.value.traffic?.direction, StoredNetworkDirection.BOTH);
                    if (settings.widget.case !== "singleMetric") {
                        assert.fail(`Expected singleMetric widget, received ${String(settings.widget.case)}`);
                    }
                    assert.equal(settings.widget.value.slot?.overrides?.appearance, undefined);
                },
            },
            {
                actionKind: "catalog",
                verifyTarget: (settings) => {
                    const target = readStoredMetricTarget(settings);
                    if (target?.case !== "catalog") {
                        assert.fail(`Expected catalog target, received ${String(target?.case)}`);
                    }
                    assert.equal(target.value.metricId ?? "", "");
                },
            },
        ];

        for (const testCase of testCases) {
            const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, testCase.actionKind);

            assert.equal(quickStartSettings.settingsJsonToPersist != null, true, testCase.actionKind);
            testCase.verifyTarget(quickStartSettings.storedSettings);
            const sourcePolicy = readStoredMetricSourcePolicy(quickStartSettings.storedSettings);
            if (testCase.actionKind === "catalog") {
                assert.equal(sourcePolicy?.primarySourceProfileId, BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID);
                assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, []);
                assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.SHOW_UNAVAILABLE);
            } else {
                assert.equal(sourcePolicy, undefined, testCase.actionKind);
            }
        }
    });

    it("creates dense multi metric quick-start rows with stable generated ids", () => {
        const slotIds = ["slot-1", "slot-2"];
        const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, "denseMultiMetric", {
            createSlotId: () => slotIds.shift() ?? "unexpected-slot",
        });
        const widget = quickStartSettings.storedSettings.widget;

        assert.equal(quickStartSettings.settingsJsonToPersist != null, true);
        assert.equal(widget.case, "denseMultiMetric");
        assert.equal(widget.value.slots.length, 2);
        assert.equal(widget.value.slots[0]?.slotId, "slot-1");
        assert.equal(widget.value.slots[0]?.slot?.metric?.target.case, "cpu");
        assert.equal(widget.value.slots[1]?.slotId, "slot-2");
        assert.equal(widget.value.slots[1]?.slot?.metric?.target.case, "gpu");
    });

    it("keeps existing metric targets without requesting persistence", () => {
        const initialSettings = resolveQuickStartStoredWidgetSettings(undefined, "disk");
        const quickStartSettings = resolveQuickStartStoredWidgetSettings(initialSettings.rawSettings, "network");

        assert.equal(quickStartSettings.settingsJsonToPersist, null);
        assert.equal(quickStartSettings.storedSettings.widget.case, "singleMetric");
        assert.equal(quickStartSettings.storedSettings.widget.value.slot?.metric?.target.case, "disk");
    });

    it("adds helper routing to an existing catalog target", () => {
        const quickStartSettings = resolveQuickStartStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        catalog: {
                            metricId: "source.sensor:/gpu/temperature/0",
                            detectedLabel: "GPU Temperature",
                            detectedUnit: "METRIC_UNIT_CELSIUS",
                        },
                    },
                },
            },
        }, "catalog");
        const target = readStoredMetricTarget(quickStartSettings.storedSettings);
        const sourcePolicy = readStoredMetricSourcePolicy(quickStartSettings.storedSettings);

        assert.notEqual(quickStartSettings.settingsJsonToPersist, null);
        if (target?.case !== "catalog") {
            assert.fail(`Expected catalog target, received ${String(target?.case)}`);
        }
        assert.equal(target.value.metricId, "source.sensor:/gpu/temperature/0");
        assert.equal(target.value.detectedLabel, "GPU Temperature");
        assert.equal(target.value.detectedUnit, MetricUnit.CELSIUS);
        assert.equal(sourcePolicy?.primarySourceProfileId, BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID);
        assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, []);
        assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.SHOW_UNAVAILABLE);
    });

    it("keeps an existing catalog source policy", () => {
        const quickStartSettings = resolveQuickStartStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        sourcePolicy: {
                            primarySourceProfileId: "remote",
                            fallbackSourceProfileIds: ["local"],
                            failureMode: "FAILURE_MODE_USE_FALLBACK",
                        },
                        catalog: {
                            metricId: "source.sensor:/gpu/temperature/0",
                        },
                    },
                },
            },
        }, "catalog");
        const sourcePolicy = readStoredMetricSourcePolicy(quickStartSettings.storedSettings);

        assert.equal(quickStartSettings.settingsJsonToPersist, null);
        assert.equal(sourcePolicy?.primarySourceProfileId, "remote");
        assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, ["local"]);
        assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.USE_FALLBACK);
    });

    it("keeps readable fields when unknown fields are discarded", () => {
        const quickStartSettings = resolveQuickStartStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 30,
            },
            unknownProtoJsonField: "future-value",
        }, "network");

        assert.equal(quickStartSettings.readWarning?.reason, "unknownFieldsDiscarded");
        assert.equal(quickStartSettings.storedSettings.preferences?.pollingFrequencySeconds, 30);
        assert.equal(quickStartSettings.storedSettings.widget.case, "singleMetric");
        assert.equal(quickStartSettings.storedSettings.widget.value.slot?.metric?.target.case, "network");
    });

    it("loads quick-start defaults when settings cannot be read", () => {
        const quickStartSettings = resolveQuickStartStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 0,
            },
        }, "memory");

        assert.equal(quickStartSettings.readWarning?.reason, "invalidSettingsDefaulted");
        assert.equal(quickStartSettings.storedSettings.widget.case, "singleMetric");
        assert.equal(quickStartSettings.storedSettings.widget.value.slot?.metric?.target.case, "memory");
    });
});

function readStoredMetricTarget(settings: StoredWidgetSettings) {
    assert.equal(settings.widget.case, "singleMetric");
    return settings.widget.value.slot?.metric?.target;
}

function readStoredMetricSourcePolicy(settings: StoredWidgetSettings) {
    assert.equal(settings.widget.case, "singleMetric");
    return settings.widget.value.slot?.metric?.sourcePolicy;
}
