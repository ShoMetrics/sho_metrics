import assert from "node:assert/strict";
import test from "node:test";
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
