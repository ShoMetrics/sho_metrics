import assert from "node:assert/strict";
import test from "node:test";
import { MetricStore } from "./metric-store";
import { LOCAL_SOURCE_SCOPE_ID } from "./source-routing/metric-read-plan";
import { buildMetricSnapshot, buildScalarMetricValue, buildTextMetricValue, MetricUnit } from "./sources/metric-source";
import { MetricValueFreshness } from "./sources/source-client";

test("missing metric returns render-safe numeric defaults without a sample timestamp", () => {
    const metricStore = new MetricStore();
    const metrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);

    assert.deepEqual(metrics.getWidgetData(
        "cpu.usage_percent",
        "CPU",
        "%",
    ), {
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
    const metrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);

    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(25, { unit: MetricUnit.PERCENT }),
        },
    }));
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(50, { unit: MetricUnit.PERCENT }),
        },
    }));

    assert.deepEqual(metrics.getWidgetData(
        "cpu.usage_percent",
        "CPU",
        "%",
        100,
    ), {
        current: 50,
        progress: 0.5,
        history: [25, 50],
        unit: "%",
        label: "CPU",
        sampleTimestampMilliseconds: 2000,
    });
});

test("retained scalar samples update the current value without adding history points", () => {
    const metricStore = new MetricStore();
    const metrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);

    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.temperature": buildScalarMetricValue(51, { unit: MetricUnit.CELSIUS }),
        },
    }));
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "cpu.temperature": buildScalarMetricValue(50, { unit: MetricUnit.CELSIUS }),
        },
    }), {
        valueAttributions: [{
            metricId: "cpu.temperature",
            valueFreshness: MetricValueFreshness.RETAINED,
        }],
    });

    assert.deepEqual(metrics.getWidgetData(
        "cpu.temperature",
        "CPU",
        "C",
        100,
    ), {
        current: 50,
        progress: 0.5,
        history: [51],
        unit: "C",
        label: "CPU",
        sampleTimestampMilliseconds: 2000,
    });
});

test("widget progress is clamped to the render domain", () => {
    const metricStore = new MetricStore();
    const metrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);

    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "gpu.power": buildScalarMetricValue(160, { unit: MetricUnit.WATTS }),
            "gpu.temperature": buildScalarMetricValue(-5, { unit: MetricUnit.CELSIUS }),
        },
    }));

    assert.equal(
        metrics.getWidgetData("gpu.power", "Power", "W", 100).progress,
        1,
    );
    assert.equal(
        metrics.getWidgetData("gpu.temperature", "Temp", "°C", 100).progress,
        0,
    );
});

test("text samples are retrievable without numeric widget history", () => {
    const metricStore = new MetricStore();
    const metrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);

    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "gpu.model": buildTextMetricValue("RTX 4090"),
        },
    }));

    assert.equal(metrics.getTextValue("gpu.model"), "RTX 4090");
    assert.deepEqual(metrics.getWidgetData("gpu.model", "GPU", ""), {
        current: 0,
        progress: 0,
        history: [],
        unit: "",
        label: "GPU",
        sampleTimestampMilliseconds: 1000,
    });
});

test("invalid scalar and empty text samples are ignored", () => {
    const metricStore = new MetricStore();
    const metrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);

    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(Number.NaN, { unit: MetricUnit.PERCENT }),
            "cpu.model": buildTextMetricValue("   "),
        },
    }));

    assert.equal(
        metrics.getWidgetData("cpu.usage_percent", "CPU", "%").sampleTimestampMilliseconds,
        undefined,
    );
    assert.equal(metrics.getTextValue("cpu.model"), undefined);
});

test("scalar metric replaces text metric completely", () => {
    const metricStore = new MetricStore();
    const metrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);

    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "gpu.model": buildTextMetricValue("RTX 4090"),
        },
    }));
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "gpu.model": buildScalarMetricValue(40, { unit: MetricUnit.PERCENT }),
        },
    }));

    assert.equal(metrics.getTextValue("gpu.model"), undefined);
    assert.deepEqual(metrics.getWidgetData("gpu.model", "GPU", "%"), {
        current: 40,
        progress: 0.4,
        history: [40],
        unit: "%",
        label: "GPU",
        sampleTimestampMilliseconds: 2000,
    });
});

test("text metric replaces scalar metric completely", () => {
    const metricStore = new MetricStore();
    const metrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);

    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "gpu.model": buildScalarMetricValue(40, { unit: MetricUnit.PERCENT }),
        },
    }));
    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "gpu.model": buildTextMetricValue("RTX 4090"),
        },
    }));

    assert.equal(metrics.getTextValue("gpu.model"), "RTX 4090");
    assert.deepEqual(metrics.getWidgetData("gpu.model", "GPU", ""), {
        current: 0,
        progress: 0,
        history: [],
        unit: "",
        label: "GPU",
        sampleTimestampMilliseconds: 2000,
    });
});

test("clear removes scalar history and text values", () => {
    const metricStore = new MetricStore();
    const metrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);

    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(25, { unit: MetricUnit.PERCENT }),
            "cpu.model": buildTextMetricValue("Example CPU"),
        },
    }));

    metricStore.clear();

    assert.deepEqual(
        metrics.getWidgetData("cpu.usage_percent", "CPU", "%").history,
        [],
    );
    assert.equal(
        metrics.getWidgetData("cpu.usage_percent", "CPU", "%").sampleTimestampMilliseconds,
        undefined,
    );
    assert.equal(metrics.getTextValue("cpu.model"), undefined);
});

test("same metric keys keep separate history for different source scopes", () => {
    const metricStore = new MetricStore();
    const localMetrics = metricStore.forScope(LOCAL_SOURCE_SCOPE_ID);
    const remoteMetrics = metricStore.forScope("remote:nuc");

    metricStore.ingest(LOCAL_SOURCE_SCOPE_ID, buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(25, { unit: MetricUnit.PERCENT }),
        },
    }));
    metricStore.ingest("remote:nuc", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(75, { unit: MetricUnit.PERCENT }),
        },
    }));

    assert.deepEqual(
        localMetrics.getWidgetData("cpu.usage_percent", "CPU", "%").history,
        [25],
    );
    assert.deepEqual(
        remoteMetrics.getWidgetData("cpu.usage_percent", "CPU", "%").history,
        [75],
    );
});

test("source scope and metric key boundaries do not collide", () => {
    const metricStore = new MetricStore();
    const firstMetrics = metricStore.forScope("remote\0nuc");
    const secondMetrics = metricStore.forScope("remote");

    metricStore.ingest("remote\0nuc", buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(25, { unit: MetricUnit.PERCENT }),
        },
    }));
    metricStore.ingest("remote", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "nuc\0cpu.usage_percent": buildScalarMetricValue(75, { unit: MetricUnit.PERCENT }),
        },
    }));

    assert.deepEqual(
        firstMetrics.getWidgetData("cpu.usage_percent", "CPU", "%").history,
        [25],
    );
    assert.deepEqual(
        secondMetrics.getWidgetData("nuc\0cpu.usage_percent", "CPU", "%").history,
        [75],
    );
});
