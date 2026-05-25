import assert from "node:assert/strict";
import test from "node:test";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { readStoredWidgetSettings } from "../../settings/storage/codec";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import { buildVisibilityContext } from "../testing/test-context";

test("Property Inspector context reads resolved disk polling defaults without persisting them", () => {
    const diskSettings = resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings;
    const context = buildVisibilityContext({
        actionKind: "disk",
        settings: diskSettings,
    });
    const storedSettings = readStoredWidgetSettings(diskSettings).settings;

    assert.equal(context.resolved.preferences.pollingFrequencySeconds, 60);
    assert.equal(storedSettings.preferences, undefined);
});

test("Property Inspector context preserves stored disk throughput kind on Windows", () => {
    const diskSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings,
        {
            appearance: {
                view: { selectedView: "bar" },
            },
            disk: {
                kind: "throughput",
            },
        },
    );
    const context = buildVisibilityContext({
        actionKind: "disk",
        isWindows: true,
        settings: diskSettings,
    });

    const target = context.resolved.widget.slot.metric.target;
    assert.equal(target.domain, "disk");

    if (target.domain === "disk") {
        assert.equal(target.reading.kind, "throughput");
    }
});
