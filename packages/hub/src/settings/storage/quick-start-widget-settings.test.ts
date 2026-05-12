import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { readStoredWidgetSettings } from "./codec";
import { resolveQuickStartStoredWidgetSettings } from "./quick-start-widget-settings";

describe("quick-start stored widget settings", () => {
    it("keeps readable fields when unknown fields are discarded", () => {
        const quickStartSettings = resolveQuickStartStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 30,
            },
            unknownProtoJsonField: "future-value",
        }, "net-speed");
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
        }, "ram");
        const storedSettings = readStoredWidgetSettings(quickStartSettings.rawSettings).settings;

        assert.equal(quickStartSettings.readWarning?.reason, "invalidSettingsDefaulted");
        assert.equal(storedSettings.widget.case, "singleMetric");
        assert.equal(storedSettings.widget.value.slot?.metric?.target.case, "memory");
    });
});
