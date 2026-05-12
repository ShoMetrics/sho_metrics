import assert from "node:assert/strict";
import test from "node:test";
import { MetricStore } from "./metric-store";
import { buildMetricSnapshot, buildScalarMetricValue, buildTextMetricValue } from "./sources/source.interface";

test("missing metric returns render-safe numeric defaults without a sample timestamp", () => {
    const metricStore = new MetricStore();

    assert.deepEqual(metricStore.getWidgetData("cpu.usage_percent", "CPU", "%"), {
        current: 0,
        progress: 0,
        history: [],
        unit: "%",
        label: "CPU",
        sampleTimestampMilliseconds: undefined,
    });
});

test("scalar samples keep history, latest value, progress, and timestamp", () => {
    const metricStore = new MetricStore();

    metricStore.ingest(buildMetricSnapshot({
        sourceId: "test-source",
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(25, { unit: "%", progress: 0.25 }),
        },
    }));
    metricStore.ingest(buildMetricSnapshot({
        sourceId: "test-source",
        timestampMilliseconds: 2000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(50, { unit: "%", progress: 0.5 }),
        },
    }));

    assert.deepEqual(metricStore.getWidgetData("cpu.usage_percent", "CPU", "%", 100), {
        current: 50,
        progress: 0.5,
        history: [25, 50],
        unit: "%",
        label: "CPU",
        sampleTimestampMilliseconds: 2000,
    });
});

test("widget progress is clamped to the render domain", () => {
    const metricStore = new MetricStore();

    metricStore.ingest(buildMetricSnapshot({
        sourceId: "test-source",
        timestampMilliseconds: 1000,
        metrics: {
            "gpu.power": buildScalarMetricValue(160, { unit: "W" }),
            "gpu.temperature": buildScalarMetricValue(-5, { unit: "°C" }),
        },
    }));

    assert.equal(metricStore.getWidgetData("gpu.power", "Power", "W", 100).progress, 1);
    assert.equal(metricStore.getWidgetData("gpu.temperature", "Temp", "°C", 100).progress, 0);
});

test("text samples are retrievable without numeric widget history", () => {
    const metricStore = new MetricStore();

    metricStore.ingest(buildMetricSnapshot({
        sourceId: "test-source",
        timestampMilliseconds: 1000,
        metrics: {
            "gpu.model": buildTextMetricValue("RTX 4090"),
        },
    }));

    assert.equal(metricStore.getTextValue("gpu.model"), "RTX 4090");
    assert.deepEqual(metricStore.getWidgetData("gpu.model", "GPU", ""), {
        current: 0,
        progress: 0,
        history: [],
        unit: "",
        label: "GPU",
        sampleTimestampMilliseconds: 1000,
    });
});

test("clear removes scalar history and text values", () => {
    const metricStore = new MetricStore();

    metricStore.ingest(buildMetricSnapshot({
        sourceId: "test-source",
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(25, { unit: "%" }),
            "cpu.model": buildTextMetricValue("Example CPU"),
        },
    }));

    metricStore.clear();

    assert.deepEqual(metricStore.getWidgetData("cpu.usage_percent", "CPU", "%").history, []);
    assert.equal(metricStore.getWidgetData("cpu.usage_percent", "CPU", "%").sampleTimestampMilliseconds, undefined);
    assert.equal(metricStore.getTextValue("cpu.model"), undefined);
});
