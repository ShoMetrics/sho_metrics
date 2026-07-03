import assert from "node:assert/strict";
import { test } from "vitest";
import {
    MetricStoreIngestDiagnostics,
    type MetricStoreFirstScalarDiagnosticSamplesLogEntry,
    type MetricStoreInvalidValuesLogEntry,
} from "./metric-store-ingest-diagnostics";
import type { MetricStoreIngestReport } from "../metric-store";
import { MetricUnit } from "../sources/metric-source";
import {
    buildCustomHttpRuntimeIdentity,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "../sources/custom-http/custom-http-metric-key";

test("metric store ingest diagnostics ignores reports without rejections", () => {
    const logWriter = new RecordingMetricStoreIngestDiagnosticsLogWriter();
    const diagnostics = new MetricStoreIngestDiagnostics({ logWriter });

    diagnostics.record({
        sourceId: "node-system",
        groupKind: "sourceDeclared",
        groupId: "cpu",
        intervalMilliseconds: 1000,
    }, buildReport([]));

    assert.deepEqual(logWriter.entries, []);
});

test("metric store ingest diagnostics aggregates invalid values inside a throttle window", () => {
    let nowMilliseconds = 1000;
    const logWriter = new RecordingMetricStoreIngestDiagnosticsLogWriter();
    const diagnostics = new MetricStoreIngestDiagnostics({
        logWriter,
        nowMilliseconds: () => nowMilliseconds,
        throttleMilliseconds: 60_000,
    });
    const context = {
        sourceId: "node-system",
        sourceScopeId: "local",
        groupKind: "sourceDeclared" as const,
        groupId: "cpu",
        intervalMilliseconds: 1000,
    };

    diagnostics.record(context, buildReport([
        { metricKey: "cpu.usage", reason: "nonFiniteScalar" },
        { metricKey: "cpu.model", reason: "emptyText" },
    ]));
    nowMilliseconds = 2000;
    diagnostics.record(context, buildReport([
        { metricKey: "cpu.usage", reason: "nonFiniteScalar" },
    ]));
    nowMilliseconds = 61_000;
    diagnostics.record(context, buildReport([
        { metricKey: "cpu.temperature", reason: "nonFiniteScalar" },
    ]));

    assert.equal(logWriter.entries.length, 2);
    assert.deepEqual(logWriter.entries[0], {
        sourceId: "node-system",
        sourceScopeId: "local",
        groupKind: "sourceDeclared",
        groupId: "cpu",
        rejectedCount: 2,
        uniqueMetricCount: 2,
        topReasons: [
            { reason: "emptyText", count: 1 },
            { reason: "nonFiniteScalar", count: 1 },
        ],
        sampleRejections: [
            { metricKey: "cpu.usage", reason: "nonFiniteScalar" },
            { metricKey: "cpu.model", reason: "emptyText" },
        ],
        intervalMilliseconds: 1000,
    });
    assert.deepEqual(logWriter.entries[1], {
        sourceId: "node-system",
        sourceScopeId: "local",
        groupKind: "sourceDeclared",
        groupId: "cpu",
        rejectedCount: 2,
        uniqueMetricCount: 2,
        topReasons: [
            { reason: "nonFiniteScalar", count: 2 },
        ],
        sampleRejections: [
            { metricKey: "cpu.usage", reason: "nonFiniteScalar" },
            { metricKey: "cpu.temperature", reason: "nonFiniteScalar" },
        ],
        intervalMilliseconds: 1000,
    });
});

test("metric store ingest diagnostics caps sample rejections", () => {
    const logWriter = new RecordingMetricStoreIngestDiagnosticsLogWriter();
    const diagnostics = new MetricStoreIngestDiagnostics({ logWriter, throttleMilliseconds: 60_000 });

    diagnostics.record({
        sourceId: "node-system",
        groupKind: "sourceDeclared",
        groupId: "cpu",
        intervalMilliseconds: 1000,
    }, buildReport(Array.from({ length: 12 }, (_, index) => ({
        metricKey: `metric-${index}`,
        reason: "nonFiniteScalar" as const,
    }))));

    assert.equal(logWriter.entries[0]?.sampleRejections.length, 8);
    assert.deepEqual(logWriter.entries[0]?.sampleRejections.at(-1), {
        metricKey: "metric-7",
        reason: "nonFiniteScalar",
    });
});

test("metric store ingest diagnostics keeps sample rejections unique", () => {
    const logWriter = new RecordingMetricStoreIngestDiagnosticsLogWriter();
    const diagnostics = new MetricStoreIngestDiagnostics({ logWriter, throttleMilliseconds: 60_000 });

    diagnostics.record({
        sourceId: "node-system",
        groupKind: "sourceDeclared",
        groupId: "cpu",
        intervalMilliseconds: 1000,
    }, buildReport(Array.from({ length: 12 }, () => ({
        metricKey: "cpu.model",
        reason: "emptyText" as const,
    }))));

    assert.equal(logWriter.entries[0]?.rejectedCount, 12);
    assert.deepEqual(logWriter.entries[0]?.sampleRejections, [
        { metricKey: "cpu.model", reason: "emptyText" },
    ]);
});

test("metric store ingest diagnostics logs first scalar diagnostic samples once per source metric", () => {
    const logWriter = new RecordingMetricStoreIngestDiagnosticsLogWriter();
    const diagnostics = new MetricStoreIngestDiagnostics({ logWriter });
    const context = {
        sourceId: "node-system",
        sourceScopeId: "local",
        groupKind: "sourceDeclared" as const,
        groupId: "gpu",
        intervalMilliseconds: 1000,
    };

    diagnostics.record(context, {
        acceptedScalarCount: 2,
        acceptedTextCount: 0,
        acceptedScalarDiagnosticSamples: [
            { metricKey: "gpu.usage_percent", value: 42, unit: MetricUnit.PERCENT },
            { metricKey: "gpu.vram_total", value: 8589934592, unit: MetricUnit.BYTES },
        ],
        rejectedCount: 0,
        rejections: [],
    });
    diagnostics.record(context, {
        acceptedScalarCount: 1,
        acceptedTextCount: 0,
        acceptedScalarDiagnosticSamples: [
            { metricKey: "gpu.usage_percent", value: 43, unit: MetricUnit.PERCENT },
        ],
        rejectedCount: 0,
        rejections: [],
    });

    assert.deepEqual(logWriter.firstScalarDiagnosticSampleEntries, [{
        sourceId: "node-system",
        sourceScopeId: "local",
        groupKind: "sourceDeclared",
        groupId: "gpu",
        sampleCount: 2,
        deferredSampleCount: 0,
        samples: [
            { metricKey: "gpu.usage_percent", value: 42, unit: MetricUnit.PERCENT },
            { metricKey: "gpu.vram_total", value: 8589934592, unit: MetricUnit.BYTES },
        ],
        intervalMilliseconds: 1000,
    }]);
    assert.deepEqual(logWriter.entries, []);
});

test("metric store ingest diagnostics pages first scalar diagnostic samples instead of dropping deferred metrics", () => {
    const logWriter = new RecordingMetricStoreIngestDiagnosticsLogWriter();
    const diagnostics = new MetricStoreIngestDiagnostics({ logWriter });
    const context = {
        sourceId: "node-system",
        sourceScopeId: "local",
        groupKind: "sourceDeclared" as const,
        groupId: "multi",
        intervalMilliseconds: 1000,
    };
    const samples = Array.from({ length: 10 }, (_, index) => ({
        metricKey: `metric-${index}`,
        value: index,
        unit: MetricUnit.PERCENT,
    }));

    diagnostics.record(context, {
        acceptedScalarCount: samples.length,
        acceptedTextCount: 0,
        acceptedScalarDiagnosticSamples: samples,
        rejectedCount: 0,
        rejections: [],
    });
    diagnostics.record(context, {
        acceptedScalarCount: samples.length,
        acceptedTextCount: 0,
        acceptedScalarDiagnosticSamples: samples,
        rejectedCount: 0,
        rejections: [],
    });

    assert.equal(logWriter.firstScalarDiagnosticSampleEntries.length, 2);
    assert.equal(logWriter.firstScalarDiagnosticSampleEntries[0]?.sampleCount, 8);
    assert.equal(logWriter.firstScalarDiagnosticSampleEntries[0]?.deferredSampleCount, 2);
    assert.deepEqual(
        logWriter.firstScalarDiagnosticSampleEntries[0]?.samples.map(sample => sample.metricKey),
        ["metric-0", "metric-1", "metric-2", "metric-3", "metric-4", "metric-5", "metric-6", "metric-7"],
    );
    assert.equal(logWriter.firstScalarDiagnosticSampleEntries[1]?.sampleCount, 2);
    assert.equal(logWriter.firstScalarDiagnosticSampleEntries[1]?.deferredSampleCount, 0);
    assert.deepEqual(
        logWriter.firstScalarDiagnosticSampleEntries[1]?.samples.map(sample => sample.metricKey),
        ["metric-8", "metric-9"],
    );
});

test("metric store ingest diagnostics does not log custom HTTP scalar values", () => {
    const logWriter = new RecordingMetricStoreIngestDiagnosticsLogWriter();
    const diagnostics = new MetricStoreIngestDiagnostics({ logWriter });
    const customHttpIdentity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.test/secret",
        actionId: "action-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    });

    diagnostics.record({
        sourceId: customHttpIdentity.sourceId,
        sourceScopeId: customHttpIdentity.sourceScopeId,
        groupKind: "sourceDeclared",
        groupId: "custom-http",
        intervalMilliseconds: 1000,
    }, {
        acceptedScalarCount: 1,
        acceptedTextCount: 0,
        acceptedScalarDiagnosticSamples: [
            { metricKey: customHttpIdentity.metricKey, value: 12345, unit: MetricUnit.UNSPECIFIED },
        ],
        rejectedCount: 0,
        rejections: [],
    });

    assert.deepEqual(logWriter.firstScalarDiagnosticSampleEntries, []);
    assert.deepEqual(logWriter.entries, []);
});

class RecordingMetricStoreIngestDiagnosticsLogWriter {
    readonly entries: MetricStoreInvalidValuesLogEntry[] = [];
    readonly firstScalarDiagnosticSampleEntries: MetricStoreFirstScalarDiagnosticSamplesLogEntry[] = [];

    write(entry: MetricStoreInvalidValuesLogEntry): void {
        this.entries.push(entry);
    }

    writeFirstScalarDiagnosticSamples(entry: MetricStoreFirstScalarDiagnosticSamplesLogEntry): void {
        this.firstScalarDiagnosticSampleEntries.push(entry);
    }
}

function buildReport(
    rejections: MetricStoreIngestReport["rejections"],
): MetricStoreIngestReport {
    return {
        acceptedScalarCount: 0,
        acceptedTextCount: 0,
        acceptedScalarDiagnosticSamples: [],
        rejectedCount: rejections.length,
        rejections,
    };
}
