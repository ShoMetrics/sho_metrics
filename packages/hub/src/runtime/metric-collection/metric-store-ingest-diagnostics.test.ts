import assert from "node:assert/strict";
import test from "node:test";
import {
    MetricStoreIngestDiagnostics,
    type MetricStoreInvalidValuesLogEntry,
} from "./metric-store-ingest-diagnostics";
import type { MetricStoreIngestReport } from "../metric-store";

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

class RecordingMetricStoreIngestDiagnosticsLogWriter {
    readonly entries: MetricStoreInvalidValuesLogEntry[] = [];

    write(entry: MetricStoreInvalidValuesLogEntry): void {
        this.entries.push(entry);
    }
}

function buildReport(
    rejections: MetricStoreIngestReport["rejections"],
): MetricStoreIngestReport {
    return {
        acceptedScalarCount: 0,
        acceptedTextCount: 0,
        rejectedCount: rejections.length,
        rejections,
    };
}
