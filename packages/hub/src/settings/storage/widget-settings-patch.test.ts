import assert from "node:assert/strict";
import test from "node:test";
import {
    GpuMetricTarget_Kind as StoredGpuMetricKind,
} from "../../generated/shometrics/v1/settings_pb";
import { readStoredWidgetSettings } from "./codec";
import { resolveQuickStartStoredWidgetSettings } from "./quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "./widget-settings-patch";

test("widget patch fails before quick-start metric initialization", () => {
    assert.throws(
        () => writeStoredWidgetSettingsPatch(undefined, {
            network: {
                direction: "download",
            },
        }),
        /quick-start widget initialization/,
    );
});

test("widget patch fails when the patch domain does not match the current metric", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    assert.throws(
        () => writeStoredWidgetSettingsPatch(cpuSettings, {
            network: {
                direction: "download",
            },
        }),
        /non-network metric/,
    );
});

test("widget patch updates GPU reading within the GPU action domain", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        gpu: {
            kind: "power",
        },
    });

    const target = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.metric?.target;
    assert.equal(target?.case, "gpu");
    if (target?.case === "gpu") {
        assert.equal(target.value.kind, StoredGpuMetricKind.POWER);
    }
});
