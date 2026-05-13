import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    MemoryMetricTarget_Kind as StoredMemoryMetricKind,
    NetworkMetricTarget_Direction as StoredNetworkDirection,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb";
import type { ActionKind } from "../../shared/stream-deck-actions";
import { readStoredWidgetSettings } from "./codec";
import { resolveQuickStartStoredWidgetSettings } from "./quick-start-widget-settings";

describe("quick-start stored widget settings", () => {
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
                    assert.equal(target.value.direction, StoredNetworkDirection.BOTH);
                },
            },
        ];

        for (const testCase of testCases) {
            const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, testCase.actionKind);
            const storedSettings = readStoredWidgetSettings(quickStartSettings.rawSettings).settings;

            assert.equal(quickStartSettings.settingsJsonToPersist != null, true, testCase.actionKind);
            testCase.verifyTarget(storedSettings);
        }
    });

    it("keeps readable fields when unknown fields are discarded", () => {
        const quickStartSettings = resolveQuickStartStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 30,
            },
            unknownProtoJsonField: "future-value",
        }, "network");
        const storedSettings = readStoredWidgetSettings(quickStartSettings.rawSettings).settings;

        assert.equal(quickStartSettings.readWarning?.reason, "unknownFieldsDiscarded");
        assert.equal(storedSettings.preferences?.pollingFrequencySeconds, 30);
        assert.equal(storedSettings.widget.case, "singleMetric");
        assert.equal(storedSettings.widget.value.slot?.metric?.target.case, "network");
    });

    it("loads quick-start defaults when settings cannot be read", () => {
        const quickStartSettings = resolveQuickStartStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 0,
            },
        }, "memory");
        const storedSettings = readStoredWidgetSettings(quickStartSettings.rawSettings).settings;

        assert.equal(quickStartSettings.readWarning?.reason, "invalidSettingsDefaulted");
        assert.equal(storedSettings.widget.case, "singleMetric");
        assert.equal(storedSettings.widget.value.slot?.metric?.target.case, "memory");
    });
});

function readStoredMetricTarget(settings: StoredWidgetSettings) {
    assert.equal(settings.widget.case, "singleMetric");
    return settings.widget.value.slot?.metric?.target;
}
