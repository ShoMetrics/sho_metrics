import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent } from "@elgato/streamdeck";
import { MetricStore } from "../../runtime/metric-store";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
} from "../../runtime/network-metric-keys";
import type { NetworkInterfaceOption } from "../../runtime/network-interfaces";
import { LOCAL_SOURCE_SCOPE_ID } from "../../runtime/sources/metric-read-plan";
import { buildMetricSnapshot, buildScalarMetricValue, MetricUnit } from "../../runtime/sources/metric-source";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import { resolveInitialActionSettings } from "../settings/action-settings-resolver";
import { buildNetworkViewUpdate } from "./view-builder";

test("network automatic interface reads aggregate keys after registry selection", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            appearance: {
                view: { selectedView: "line" },
            },
            network: {
                direction: "download",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "network").resolvedSettings;
    const target = settings.widget.slot.metric.target;

    assert.equal(target.domain, "network");
    if (target.domain !== "network") {
        assert.fail("Expected network target.");
    }

    const metricStore = new MetricStore();
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            [getNetworkAggregateMetricKey("download")]: buildScalarMetricValue(1234, {
                unit: MetricUnit.BYTES_PER_SECOND,
            }),
        },
    }));

    const viewUpdate = buildNetworkViewUpdate({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: metricStore.forScope(LOCAL_SOURCE_SCOPE_ID),
        selectedNetworkInterface: buildNetworkInterfaceOption("Ethernet"),
        currentTimestampMilliseconds: 2000,
    });
    const widgetData = viewUpdate.viewOptions.widgetData;

    assert.equal(viewUpdate.viewOptions.metricKey, getNetworkAggregateMetricKey("download"));
    if ("positive" in widgetData) {
        assert.fail("Expected single metric network view.");
    }
    assert.equal(widgetData.sampleTimestampMilliseconds, 1000);
    assert.equal(widgetData.current, 1234);
});

test("network explicit interface reads interface keys without registry selection", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            appearance: {
                view: { selectedView: "line" },
            },
            network: {
                direction: "download",
                interfaceId: "Ethernet",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "network").resolvedSettings;
    const target = settings.widget.slot.metric.target;

    assert.equal(target.domain, "network");
    if (target.domain !== "network") {
        assert.fail("Expected network target.");
    }

    const metricStore = new MetricStore();
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            [getNetworkInterfaceMetricKey("download", "Ethernet")]: buildScalarMetricValue(5678, {
                unit: MetricUnit.BYTES_PER_SECOND,
            }),
        },
    }));

    const viewUpdate = buildNetworkViewUpdate({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: metricStore.forScope(LOCAL_SOURCE_SCOPE_ID),
        selectedNetworkInterface: null,
        currentTimestampMilliseconds: 2000,
    });
    const widgetData = viewUpdate.viewOptions.widgetData;

    assert.equal(viewUpdate.viewOptions.metricKey, getNetworkInterfaceMetricKey("download", "Ethernet"));
    if ("positive" in widgetData) {
        assert.fail("Expected single metric network view.");
    }
    assert.equal(widgetData.sampleTimestampMilliseconds, 1000);
    assert.equal(widgetData.current, 5678);
});

test("network view treats expired throughput samples as no data", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            appearance: {
                view: { selectedView: "line" },
            },
            network: {
                direction: "download",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "network").resolvedSettings;
    const target = settings.widget.slot.metric.target;

    assert.equal(target.domain, "network");
    if (target.domain !== "network") {
        assert.fail("Expected network target.");
    }

    const metricStore = new MetricStore();
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            [getNetworkAggregateMetricKey("download")]: buildScalarMetricValue(1234, {
                unit: MetricUnit.BYTES_PER_SECOND,
            }),
        },
    }));

    const viewUpdate = buildNetworkViewUpdate({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: metricStore.forScope(LOCAL_SOURCE_SCOPE_ID),
        selectedNetworkInterface: buildNetworkInterfaceOption("Ethernet"),
        currentTimestampMilliseconds: 7001,
    });
    const widgetData = viewUpdate.viewOptions.widgetData;

    if ("positive" in widgetData) {
        assert.fail("Expected single metric network view.");
    }
    assert.equal(widgetData.sampleTimestampMilliseconds, undefined);
    assert.equal(widgetData.current, 0);
    assert.deepEqual(widgetData.history, []);
});

function buildNetworkInterfaceOption(id: string): NetworkInterfaceOption {
    return {
        id,
        name: id,
        type: "wired",
        isDefault: true,
        speedMegabitsPerSecond: 2500,
    };
}
