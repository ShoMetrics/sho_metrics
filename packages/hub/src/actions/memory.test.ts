import assert from "node:assert/strict";
import type { WillAppearEvent } from "@elgato/streamdeck";
import { test } from "vitest";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import { RAM_TOTAL_METRIC_KEY, RAM_USED_METRIC_KEY } from "../runtime/metric-keys";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import { buildMemoryMetricViewOptions } from "./memory";
import type { WidgetData } from "../view-rendering/widget-data";

test("Memory adds the free-capacity marker only when the displayed value is free", () => {
    const settings = resolveInitialActionSettings(undefined, "memory").resolvedSettings;
    const metrics = buildMetricReader({
        [RAM_USED_METRIC_KEY]: buildWidgetData(18 * 1024 ** 3),
        [RAM_TOTAL_METRIC_KEY]: buildWidgetData(32 * 1024 ** 3),
    });

    for (const displayMode of ["usedPercentage", "usedCapacity", "freeCapacity"] as const) {
        const viewOptions = buildMemoryMetricViewOptions({
            event: {} as WillAppearEvent,
            settings,
            target: {
                domain: "memory",
                reading: { kind: "usage", displayMode },
            },
            metrics,
        });

        assert.equal(
            viewOptions.widgetData.valueQualifierIconFragment !== undefined,
            displayMode === "freeCapacity",
            displayMode,
        );
        assert.equal(viewOptions.widgetData.secondaryDisplayValue, "18 / 32 GB");
    }
});

function buildMetricReader(widgetDataByMetricKey: Readonly<Record<string, WidgetData>>): MetricStoreReader {
    return {
        getWidgetData: metricKey => widgetDataByMetricKey[metricKey] ?? buildWidgetData(0),
        getWidgetDataReadResult: (metricKey): MetricWidgetDataReadResult => ({
            widgetData: widgetDataByMetricKey[metricKey] ?? buildWidgetData(0),
            selectedSourceId: "node-system",
        }),
        getTextValue: () => undefined,
    };
}

function buildWidgetData(current: number): WidgetData {
    return {
        current,
        progress: 0,
        history: [],
        unit: "B",
        label: "RAM",
        sampleTimestampMilliseconds: Date.now(),
    };
}
