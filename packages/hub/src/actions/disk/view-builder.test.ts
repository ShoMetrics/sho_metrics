import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent } from "@elgato/streamdeck";
import { MetricStore } from "../../runtime/metric-store";
import {
    getDefaultDiskUsageMetricKey,
    getDiskVolumeMetricKey,
} from "../../runtime/disk-metric-keys";
import type { DiskVolumeOption } from "../../runtime/disk-volumes";
import { LOCAL_SOURCE_SCOPE_ID } from "../../runtime/sources/metric-read-plan";
import { buildMetricSnapshot, buildScalarMetricValue } from "../../runtime/sources/source.interface";
import { buildMetricDisplayRenderPlan, buildRenderWidgetData } from "../../metric-view-renderer/display-frame";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import { resolveInitialActionSettings } from "../settings/action-settings-resolver";
import { buildDiskDisplayOptions } from "./view-builder";

test("disk usage automatic volume reads default usage keys after registry selection", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings,
        {
            appearance: {
                view: { selectedView: "bar" },
            },
            disk: {
                kind: "usage",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "disk").resolvedSettings;
    const target = settings.widget.slot.metric.target;

    assert.equal(target.domain, "disk");
    if (target.domain !== "disk") {
        assert.fail("Expected disk target.");
    }

    const metricStore = new MetricStore();
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        sourceId: "test",
        timestampMilliseconds: 1000,
        metrics: {
            [getDefaultDiskUsageMetricKey("used")]: buildScalarMetricValue(40, { unit: "B" }),
            [getDefaultDiskUsageMetricKey("total")]: buildScalarMetricValue(100, { unit: "B" }),
            [getDefaultDiskUsageMetricKey("available")]: buildScalarMetricValue(60, { unit: "B" }),
        },
    }));

    const displayOptions = buildDiskDisplayOptions({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: metricStore.forScope(LOCAL_SOURCE_SCOPE_ID),
        volumeSelection: { kind: "available", volume: buildDiskVolumeOption("C:") },
    });

    assert.equal(displayOptions.metricKey, getDefaultDiskUsageMetricKey("used"));
    if ("positiveColor" in displayOptions) {
        assert.fail("Expected single metric disk display.");
    }
    assert.equal(displayOptions.widgetData.sampleTimestampMilliseconds, 1000);
    assert.equal(displayOptions.widgetData.displayValue, "40");
});

test("disk usage display keeps explicit unavailable volume instead of falling back to default disk", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings,
        {
            appearance: {
                view: { selectedView: "bar" },
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

    const metricStore = new MetricStore();
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        sourceId: "test",
        timestampMilliseconds: 1000,
        metrics: {
            [getDiskVolumeMetricKey("used", "E:\\")]: buildScalarMetricValue(40, { unit: "B" }),
            [getDiskVolumeMetricKey("total", "E:\\")]: buildScalarMetricValue(100, { unit: "B" }),
            [getDiskVolumeMetricKey("available", "E:\\")]: buildScalarMetricValue(60, { unit: "B" }),
        },
    }));

    const displayOptions = buildDiskDisplayOptions({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: metricStore.forScope(LOCAL_SOURCE_SCOPE_ID),
        volumeSelection: { kind: "unavailable", volumeId: "E:\\" },
    });

    assert.equal(displayOptions.metricKey, getDiskVolumeMetricKey("used", "E:\\"));
    if ("positiveColor" in displayOptions) {
        assert.fail("Expected single metric disk display.");
    }
    assert.equal(displayOptions.widgetData.label, "E:");
    assert.equal(displayOptions.widgetData.displayValue, "0");
    assert.equal(displayOptions.widgetData.barLabel, "E:");
    assert.equal(displayOptions.widgetData.sampleTimestampMilliseconds, undefined);

    const renderPlan = buildMetricDisplayRenderPlan({
        displayOptions,
        renderTarget: "key",
    });
    const renderWidgetData = buildRenderWidgetData({
        widgetData: displayOptions.widgetData,
        hasData: renderPlan.displayHasData,
        shouldRenderMutedIconPlaceholder: renderPlan.shouldRenderMutedIconPlaceholder,
    });

    assert.equal(renderWidgetData.displayValue, "N/A");
});

test("disk compact center icon label uses theme label font family", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings,
        {
            appearance: {
                view: {
                    selectedView: "circle",
                    circleVariant: "minimal",
                },
                theme: { selectedTheme: "terminal" },
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
        metrics: new MetricStore().forScope(LOCAL_SOURCE_SCOPE_ID),
        volumeSelection: { kind: "unavailable", volumeId: "E:\\" },
    });

    assert.match(displayOptions.centerIconFragment, /Share Tech Mono/);
    assert.doesNotMatch(displayOptions.centerIconFragment, /font-family="'Inter'/);
});

function buildDiskVolumeOption(id: string): DiskVolumeOption {
    return {
        id,
        fs: "NTFS",
        mount: id,
        sizeBytes: 100,
        usedBytes: 40,
        availableBytes: 60,
        storageKind: "ssd",
        diskName: "Test Disk",
        volumeLabel: "Test",
    };
}
