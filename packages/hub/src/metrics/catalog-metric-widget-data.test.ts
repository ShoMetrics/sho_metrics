import assert from "node:assert/strict";
import { test } from "vitest";
import { MetricUnit } from "../runtime/sources/metric-source";
import type { WidgetData } from "../view-rendering/widget-data";
import { formatCatalogMetricFreshWidgetData } from "./catalog-metric-widget-data";

test("catalog metric widget data formats hertz values across display ranges", () => {
    assertFormattedHertz(800, "800", "Hz");
    assertFormattedHertz(50_000, "50", "KHz");
    assertFormattedHertz(3_600_000, "3.6", "MHz");
    assertFormattedHertz(500_000_000, "500", "MHz");
    assertFormattedHertz(3_600_000_000, "3.6", "GHz");
});

test("catalog metric widget data leaves ordinary units unchanged", () => {
    const widgetData = buildWidgetData({
        current: 42,
        unit: "W",
        displayValue: "42",
    });

    assert.equal(formatCatalogMetricFreshWidgetData({
        widgetData,
        unit: MetricUnit.WATTS,
        category: "gpu",
    }), widgetData);
});

function assertFormattedHertz(current: number, displayValue: string, unit: string): void {
    const widgetData = formatCatalogMetricFreshWidgetData({
        widgetData: buildWidgetData({ current }),
        unit: MetricUnit.HERTZ,
        category: "cpu",
    });

    assert.equal(widgetData.current, current);
    assert.equal(widgetData.displayValue, displayValue);
    assert.equal(widgetData.unit, unit);
}

function buildWidgetData(options: Partial<WidgetData>): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        label: options.label ?? "Metric",
        unit: options.unit ?? "Hz",
        displayValue: options.displayValue,
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}
