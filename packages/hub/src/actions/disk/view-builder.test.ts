import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent } from "@elgato/streamdeck";
import { MetricStore } from "../../runtime/metric-store";
import { getDiskVolumeMetricKey } from "../../runtime/disk-metric-keys";
import { buildMetricDisplayRenderPlan, buildRenderWidgetData } from "../../metric-view-runner/display-model";
import { readStoredGlobalSettings } from "../../settings/storage/codec";
import { resolveStoredGlobalSettings } from "../../settings/storage/resolver";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import { resolveInitialActionSettings } from "../settings/action-settings-resolver";
import { buildDiskDisplayOptions } from "./view-builder";

test("disk usage display keeps explicit unavailable volume instead of falling back to default disk", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings,
        {
            appearance: {
                viewLayout: "linear",
            },
            disk: {
                kind: "usage",
                volumeId: "E:\\",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "disk").resolvedSettings;
    const target = settings.widget.slot.metric.target;

    assert.equal(target.domain, "disk");
    if (target.domain !== "disk") {
        assert.fail("Expected disk target.");
    }

    const displayOptions = buildDiskDisplayOptions({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        globalSettings: resolveStoredGlobalSettings(readStoredGlobalSettings(undefined).settings),
        metricStore: new MetricStore(),
        volumeSelection: { kind: "unavailable", volumeId: "E:\\" },
    });

    assert.equal(displayOptions.metricKey, getDiskVolumeMetricKey("used", "E:\\"));
    if ("positiveColor" in displayOptions) {
        assert.fail("Expected single metric disk display.");
    }
    assert.equal(displayOptions.widgetData.label, "E:");
    assert.equal(displayOptions.widgetData.displayValue, "0");
    assert.equal(displayOptions.widgetData.linearLabel, "E:");
    assert.equal(displayOptions.widgetData.sampleTimestampMilliseconds, undefined);

    const renderPlan = buildMetricDisplayRenderPlan({
        displayOptions,
        isDial: false,
    });
    const renderWidgetData = buildRenderWidgetData({
        widgetData: displayOptions.widgetData,
        hasData: renderPlan.displayHasData,
        shouldRenderMutedIconPlaceholder: renderPlan.shouldRenderMutedIconPlaceholder,
    });

    assert.equal(renderWidgetData.displayValue, "N/A");
});
