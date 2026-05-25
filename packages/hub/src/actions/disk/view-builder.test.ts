import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent } from "@elgato/streamdeck";
import { MetricStore } from "../../runtime/metric-store";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
} from "../../runtime/disk-metric-keys";
import type { DiskVolumeOption } from "../../runtime/disk-volumes";
import { LOCAL_SOURCE_SCOPE_ID } from "../../runtime/source-routing/metric-read-plan";
import { buildMetricSnapshot, buildScalarMetricValue, MetricUnit } from "../../runtime/sources/metric-source";
import { buildMetricViewRenderPlan, buildRenderWidgetData } from "../../view-rendering/metric-view-frame";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import { resolveInitialActionSettings } from "../settings/action-settings-resolver";
import { buildDiskViewOptions } from "./view-builder";

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
        timestampMilliseconds: 1000,
        metrics: {
            [getDefaultDiskUsageMetricKey("used")]: buildScalarMetricValue(40, { unit: MetricUnit.BYTES }),
            [getDefaultDiskUsageMetricKey("total")]: buildScalarMetricValue(100, { unit: MetricUnit.BYTES }),
            [getDefaultDiskUsageMetricKey("available")]: buildScalarMetricValue(60, { unit: MetricUnit.BYTES }),
        },
    }));

    const viewOptions = buildDiskViewOptions({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: metricStore.forScope(LOCAL_SOURCE_SCOPE_ID),
        volumeSelection: { kind: "available", volume: buildDiskVolumeOption("C:") },
    });

    assert.equal(viewOptions.metricKey, getDefaultDiskUsageMetricKey("used"));
    if ("positiveColor" in viewOptions) {
        assert.fail("Expected single metric disk view.");
    }
    assert.equal(viewOptions.widgetData.sampleTimestampMilliseconds, 1000);
    assert.equal(viewOptions.widgetData.displayValue, "40");
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
        timestampMilliseconds: 1000,
        metrics: {
            [getDiskVolumeMetricKey("used", "E:\\")]: buildScalarMetricValue(40, { unit: MetricUnit.BYTES }),
            [getDiskVolumeMetricKey("total", "E:\\")]: buildScalarMetricValue(100, { unit: MetricUnit.BYTES }),
            [getDiskVolumeMetricKey("available", "E:\\")]: buildScalarMetricValue(60, { unit: MetricUnit.BYTES }),
        },
    }));

    const viewOptions = buildDiskViewOptions({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: metricStore.forScope(LOCAL_SOURCE_SCOPE_ID),
        volumeSelection: { kind: "unavailable", volumeId: "E:\\" },
    });

    assert.equal(viewOptions.metricKey, getDiskVolumeMetricKey("used", "E:\\"));
    if ("positiveColor" in viewOptions) {
        assert.fail("Expected single metric disk view.");
    }
    assert.equal(viewOptions.widgetData.label, "E:");
    assert.equal(viewOptions.widgetData.displayValue, "0");
    assert.equal(viewOptions.widgetData.barLabel, "E:");
    assert.equal(viewOptions.widgetData.sampleTimestampMilliseconds, undefined);

    const renderPlan = buildMetricViewRenderPlan({
        viewOptions,
        renderTarget: "key",
    });
    const renderWidgetData = buildRenderWidgetData({
        widgetData: viewOptions.widgetData,
        hasData: renderPlan.viewHasData,
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

    const viewOptions = buildDiskViewOptions({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: new MetricStore().forScope(LOCAL_SOURCE_SCOPE_ID),
        volumeSelection: { kind: "unavailable", volumeId: "E:\\" },
    });

    assert.match(viewOptions.centerIconFragment, /Share Tech Mono/);
    assert.doesNotMatch(viewOptions.centerIconFragment, /font-family="'Inter'/);
});

test("disk throughput view ignores selected volume identity", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings,
        {
            disk: {
                kind: "throughput",
                volumeId: "E:\\",
                throughputDirection: "read",
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
        timestampMilliseconds: 1000,
        metrics: {
            [getDiskThroughputMetricKey("read")]: buildScalarMetricValue(40, { unit: MetricUnit.BYTES_PER_SECOND }),
        },
    }));

    const viewOptions = buildDiskViewOptions({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: metricStore.forScope(LOCAL_SOURCE_SCOPE_ID),
        volumeSelection: { kind: "available", volume: buildDiskVolumeOption("E:\\") },
    });

    assert.equal(viewOptions.metricKey, getDiskThroughputMetricKey("read"));
    if ("positiveColor" in viewOptions) {
        assert.fail("Expected single metric disk view.");
    }
    assert.equal(viewOptions.widgetData.label, "DISK");
    assert.equal(viewOptions.widgetData.sampleTimestampMilliseconds, 1000);
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
