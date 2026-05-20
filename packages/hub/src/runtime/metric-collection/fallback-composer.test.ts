import assert from "node:assert/strict";
import test from "node:test";
import { MetricStore } from "../metric-store";
import { buildMetricSnapshot, buildScalarMetricValue, buildTextMetricValue } from "../sources/metric-source";
import { normalizeMetricReadPlan, type MetricReadPlan } from "../sources/metric-read-plan";
import { createFallbackMetricStoreReader } from "./fallback-composer";

test("fallback reader uses the first source candidate with a scalar sample", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan();

    metricStore.ingest("windows-helper", buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "ram.used": buildScalarMetricValue(25),
        },
    }));
    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "ram.used": buildScalarMetricValue(50),
        },
    }));

    const reader = createFallbackMetricStoreReader(metricStore, readPlan);

    assert.equal(reader.getWidgetData("ram.used", "RAM", "B").current, 25);
});

test("fallback reader uses the next source candidate when the primary has no scalar sample", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan();

    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "ram.used": buildScalarMetricValue(50),
        },
    }));

    const reader = createFallbackMetricStoreReader(metricStore, readPlan);

    assert.deepEqual(reader.getWidgetData("ram.used", "RAM", "B"), {
        current: 50,
        progress: 0.5,
        history: [50],
        unit: "B",
        label: "RAM",
        sampleTimestampMilliseconds: 2000,
    });
});

test("fallback reader uses fallback when the primary source writes invalid samples", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan();

    metricStore.ingest("windows-helper", buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "ram.used": buildScalarMetricValue(Number.NaN),
        },
    }));
    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "ram.used": buildScalarMetricValue(50),
        },
    }));

    const reader = createFallbackMetricStoreReader(metricStore, readPlan);

    assert.equal(reader.getWidgetData("ram.used", "RAM", "B").current, 50);
});

test("fallback reader uses only the primary candidate in empty failure mode", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan({ failureMode: "empty" });

    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "ram.used": buildScalarMetricValue(50),
        },
    }));

    const reader = createFallbackMetricStoreReader(metricStore, readPlan);

    assert.equal(
        reader.getWidgetData("ram.used", "RAM", "B").sampleTimestampMilliseconds,
        undefined,
    );
});

test("fallback reader uses the next source candidate when the primary has no text sample", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan();

    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "cpu.model": buildTextMetricValue("Example CPU"),
        },
    }));

    const reader = createFallbackMetricStoreReader(metricStore, readPlan);

    assert.equal(reader.getTextValue("cpu.model"), "Example CPU");
});

test("fallback reader returns render-safe defaults when no candidate has a sample", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan();
    const reader = createFallbackMetricStoreReader(metricStore, readPlan);

    assert.deepEqual(reader.getWidgetData("ram.used", "RAM", "B"), {
        current: 0,
        progress: 0,
        history: [],
        unit: "B",
        label: "RAM",
        sampleTimestampMilliseconds: undefined,
    });
    assert.equal(reader.getTextValue("cpu.model"), undefined);
});

function buildReadPlan(
    options: Partial<Pick<MetricReadPlan, "failureMode">> = {},
): MetricReadPlan {
    return normalizeMetricReadPlan({
        sourceScopeId: "local",
        metricKeys: ["ram.used"],
        sourceCandidates: [
            { sourceId: "windows-helper" },
            { sourceId: "node-system" },
        ],
        failureMode: options.failureMode ?? "fallback",
    });
}
