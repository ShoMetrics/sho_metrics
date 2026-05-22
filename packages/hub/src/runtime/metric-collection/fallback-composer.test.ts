import assert from "node:assert/strict";
import test from "node:test";
import { MetricStore } from "../metric-store";
import { buildMetricSnapshot, buildScalarMetricValue, buildTextMetricValue } from "../sources/metric-source";
import { normalizeMetricReadPlan, type MetricReadPlan } from "../sources/metric-read-plan";
import { createFallbackMetricStoreReader } from "./fallback-composer";

const TEST_NOW_MILLISECONDS = 3000;
const TEST_MAXIMUM_SAMPLE_AGE_MILLISECONDS = 5000;

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

    const reader = createTestFallbackReader(metricStore, readPlan);

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

    const reader = createTestFallbackReader(metricStore, readPlan);

    assert.deepEqual(reader.getWidgetData("ram.used", "RAM", "B"), {
        current: 50,
        progress: 0.5,
        history: [50],
        unit: "B",
        label: "RAM",
        sampleTimestampMilliseconds: 2000,
    });
});

test("fallback reader uses each metric route's own source order", () => {
    const metricStore = new MetricStore();
    const readPlan = normalizeMetricReadPlan({
        metrics: [
            {
                sourceScopeId: "local",
                metricKey: "cpu.usage_percent",
                sourceCandidates: [{ sourceId: "node-system" }],
                failureMode: "empty",
            },
            {
                sourceScopeId: "local",
                metricKey: "gpu.temp",
                sourceCandidates: [
                    { sourceId: "windows-helper" },
                    { sourceId: "node-system" },
                ],
                failureMode: "fallback",
            },
        ],
    });

    metricStore.ingest("windows-helper", buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(5),
            "gpu.temp": buildScalarMetricValue(70),
        },
    }));
    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(50),
            "gpu.temp": buildScalarMetricValue(60),
        },
    }));

    const reader = createTestFallbackReader(metricStore, readPlan);

    assert.equal(reader.getWidgetData("cpu.usage_percent", "CPU", "%").current, 50);
    assert.equal(reader.getWidgetData("gpu.temp", "GPU", "C").current, 70);
});

test("fallback reader uses fallback when the primary scalar sample is stale", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan();

    metricStore.ingest("windows-helper", buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "ram.used": buildScalarMetricValue(25),
        },
    }));
    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 10000,
        metrics: {
            "ram.used": buildScalarMetricValue(50),
        },
    }));

    const reader = createTestFallbackReader(metricStore, readPlan, {
        now: 11000,
        maximumSampleAgeMilliseconds: 5000,
    });

    assert.equal(reader.getWidgetData("ram.used", "RAM", "B").current, 50);
});

test("fallback reader returns no data when every scalar sample is stale", () => {
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

    const reader = createTestFallbackReader(metricStore, readPlan, {
        now: 11000,
        maximumSampleAgeMilliseconds: 5000,
    });

    assert.deepEqual(reader.getWidgetData("ram.used", "RAM", "B"), {
        current: 0,
        progress: 0,
        history: [],
        unit: "B",
        label: "RAM",
        sampleTimestampMilliseconds: undefined,
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

    const reader = createTestFallbackReader(metricStore, readPlan);

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

    const reader = createTestFallbackReader(metricStore, readPlan);

    assert.equal(
        reader.getWidgetData("ram.used", "RAM", "B").sampleTimestampMilliseconds,
        undefined,
    );
});

test("fallback reader uses the next source candidate when the primary has no text sample", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan({ metricKey: "cpu.model" });

    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "cpu.model": buildTextMetricValue("Example CPU"),
        },
    }));

    const reader = createTestFallbackReader(metricStore, readPlan);

    assert.equal(reader.getTextValue("cpu.model"), "Example CPU");
});

test("fallback reader returns render-safe defaults when no candidate has a sample", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan();
    const reader = createTestFallbackReader(metricStore, readPlan);

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

test("fallback reader returns render-safe defaults for metrics outside the read plan", () => {
    const metricStore = new MetricStore();
    const readPlan = buildReadPlan({ metricKey: "ram.used" });
    const reader = createTestFallbackReader(metricStore, readPlan);

    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 2000,
        metrics: {
            "cpu.model": buildTextMetricValue("Example CPU"),
        },
    }));

    assert.deepEqual(reader.getWidgetData("cpu.usage_percent", "CPU", "%"), {
        current: 0,
        progress: 0,
        history: [],
        unit: "%",
        label: "CPU",
        sampleTimestampMilliseconds: undefined,
    });
    assert.equal(reader.getTextValue("cpu.model"), undefined);
});

function createTestFallbackReader(
    metricStore: MetricStore,
    readPlan: MetricReadPlan,
    options: {
        readonly now?: number;
        readonly maximumSampleAgeMilliseconds?: number;
    } = {},
) {
    return createFallbackMetricStoreReader(metricStore, readPlan, {
        now: () => options.now ?? TEST_NOW_MILLISECONDS,
        maximumSampleAgeMilliseconds: options.maximumSampleAgeMilliseconds
            ?? TEST_MAXIMUM_SAMPLE_AGE_MILLISECONDS,
    });
}

function buildReadPlan(
    options: {
        readonly metricKey?: string;
        readonly failureMode?: "fallback" | "empty";
    } = {},
): MetricReadPlan {
    return normalizeMetricReadPlan({
        metrics: [{
            sourceScopeId: "local",
            metricKey: options.metricKey ?? "ram.used",
            sourceCandidates: [
                { sourceId: "windows-helper" },
                { sourceId: "node-system" },
            ],
            failureMode: options.failureMode ?? "fallback",
        }],
    });
}
