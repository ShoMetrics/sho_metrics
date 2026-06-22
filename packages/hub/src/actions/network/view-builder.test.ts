import assert from "node:assert/strict";
import { test } from "vitest";
import type { WillAppearEvent } from "@elgato/streamdeck";
import { MetricStore } from "../../runtime/metric-store";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    getNetworkPingLatencyMetricKey,
} from "../../runtime/network-metric-keys";
import type { NetworkInterfaceOption } from "../../runtime/network-interfaces";
import { LOCAL_SOURCE_SCOPE_ID } from "../../runtime/source-routing/metric-read-plan";
import { buildMetricSnapshot, buildScalarMetricValue, MetricUnit } from "../../runtime/sources/metric-source";
import { requireResolvedSingleMetricWidget } from "../../settings/resolved-settings";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";
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
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

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
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

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
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

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

test("network overlay line keeps upload as the first channel", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            appearance: {
                view: { selectedView: "line" },
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            network: {
                direction: "both",
                trafficDisplayMode: "overlay",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "network").resolvedSettings;
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

    assert.equal(target.domain, "network");
    if (target.domain !== "network") {
        assert.fail("Expected network target.");
    }

    const viewUpdate = buildNetworkViewUpdate({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: buildNetworkMetricStore().forScope(LOCAL_SOURCE_SCOPE_ID),
        selectedNetworkInterface: buildNetworkInterfaceOption("Ethernet"),
        currentTimestampMilliseconds: 2000,
    });
    const widgetData = viewUpdate.viewOptions.widgetData;

    if (!("positive" in widgetData)) {
        assert.fail("Expected dual metric network view.");
    }

    assert.equal(widgetData.positive.label, "UP");
    assert.equal(widgetData.negative.label, "DOWN");
    if (!("positiveColor" in viewUpdate.viewOptions)) {
        assert.fail("Expected dual metric network colors.");
    }
    assert.equal(viewUpdate.viewOptions.positiveColor, "#F97316");
    assert.equal(viewUpdate.viewOptions.negativeColor, "#2563EB");
});

test("network bar keeps upload as the first channel", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            appearance: {
                view: { selectedView: "bar" },
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            network: {
                direction: "both",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "network").resolvedSettings;
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

    assert.equal(target.domain, "network");
    if (target.domain !== "network") {
        assert.fail("Expected network target.");
    }

    const viewUpdate = buildNetworkViewUpdate({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: buildNetworkMetricStore().forScope(LOCAL_SOURCE_SCOPE_ID),
        selectedNetworkInterface: buildNetworkInterfaceOption("Ethernet"),
        currentTimestampMilliseconds: 2000,
    });
    const widgetData = viewUpdate.viewOptions.widgetData;

    if ("positive" in widgetData) {
        assert.fail("Expected bar network view.");
    }

    assert.deepEqual(widgetData.barChannels?.map(channel => channel.label), ["UP", "DOWN"]);
    assert.deepEqual(widgetData.barChannels?.map(channel => channel.color), ["#F97316", "#2563EB"]);
});

test("network bar single direction renders one direction icon value row", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            appearance: {
                view: { selectedView: "bar" },
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            network: {
                direction: "upload",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "network").resolvedSettings;
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

    assert.equal(target.domain, "network");
    if (target.domain !== "network") {
        assert.fail("Expected network target.");
    }

    const viewUpdate = buildNetworkViewUpdate({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: buildNetworkMetricStore().forScope(LOCAL_SOURCE_SCOPE_ID),
        selectedNetworkInterface: buildNetworkInterfaceOption("Ethernet"),
        currentTimestampMilliseconds: 2000,
    });
    const widgetData = viewUpdate.viewOptions.widgetData;

    if ("positive" in widgetData) {
        assert.fail("Expected single metric network view.");
    }

    assert.equal(viewUpdate.viewOptions.metricKey, getNetworkAggregateMetricKey("upload"));
    assert.equal(widgetData.barChannels, undefined);
    assert.match(widgetData.barValueIconFragment ?? "", /path/);
    assert.equal(widgetData.barValueIconColor, "#F97316");
});

test("network ping view reads a single ping metric key", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            network: {
                kind: "ping",
                pingTargetHost: "8.8.8.8",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "network").resolvedSettings;
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

    assert.equal(target.domain, "network");
    if (target.domain !== "network") {
        assert.fail("Expected network target.");
    }

    const pingMetricKey = getNetworkPingLatencyMetricKey("8.8.8.8");
    const metricStore = new MetricStore();
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            [pingMetricKey]: buildScalarMetricValue(42.4, {
                unit: MetricUnit.MILLISECONDS,
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

    assert.equal(viewUpdate.viewOptions.metricKey, pingMetricKey);
    if ("positive" in widgetData) {
        assert.fail("Expected single metric ping view.");
    }
    assert.equal(widgetData.label, "PING");
    assert.equal(widgetData.unit, "ms");
    assert.equal(widgetData.displayValue, "42");
    assert.equal(widgetData.current, 42.4);
    assert.equal(widgetData.sampleTimestampMilliseconds, 1000);
});

test("network ping view treats expired latency samples as no data", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            network: {
                kind: "ping",
                pingTargetHost: "8.8.8.8",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "network").resolvedSettings;
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

    assert.equal(target.domain, "network");
    if (target.domain !== "network") {
        assert.fail("Expected network target.");
    }

    const pingMetricKey = getNetworkPingLatencyMetricKey("8.8.8.8");
    const metricStore = new MetricStore();
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            [pingMetricKey]: buildScalarMetricValue(42, {
                unit: MetricUnit.MILLISECONDS,
            }),
        },
    }));

    const viewUpdate = buildNetworkViewUpdate({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: metricStore.forScope(LOCAL_SOURCE_SCOPE_ID),
        selectedNetworkInterface: null,
        currentTimestampMilliseconds: 7001,
    });
    const widgetData = viewUpdate.viewOptions.widgetData;

    if ("positive" in widgetData) {
        assert.fail("Expected single metric ping view.");
    }
    assert.equal(widgetData.sampleTimestampMilliseconds, undefined);
    assert.equal(widgetData.current, 0);
    assert.deepEqual(widgetData.history, []);
});

test("network ping bar view shows target host as secondary text", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            appearance: {
                view: { selectedView: "bar" },
            },
            network: {
                kind: "ping",
                pingTargetHost: "example.com",
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "network").resolvedSettings;
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

    assert.equal(target.domain, "network");
    if (target.domain !== "network") {
        assert.fail("Expected network target.");
    }

    const viewUpdate = buildNetworkViewUpdate({
        event: { action: { id: "action-1" } } as unknown as WillAppearEvent,
        settings,
        target,
        metrics: new MetricStore().forScope(LOCAL_SOURCE_SCOPE_ID),
        selectedNetworkInterface: null,
        currentTimestampMilliseconds: 2000,
    });
    const widgetData = viewUpdate.viewOptions.widgetData;

    if ("positive" in widgetData) {
        assert.fail("Expected single metric ping view.");
    }
    assert.equal(widgetData.secondaryDisplayValue, "example.com");
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

function buildNetworkMetricStore(): MetricStore {
    const metricStore = new MetricStore();
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            [getNetworkAggregateMetricKey("upload")]: buildScalarMetricValue(1000, {
                unit: MetricUnit.BYTES_PER_SECOND,
            }),
            [getNetworkAggregateMetricKey("download")]: buildScalarMetricValue(2000, {
                unit: MetricUnit.BYTES_PER_SECOND,
            }),
        },
    }));
    return metricStore;
}


