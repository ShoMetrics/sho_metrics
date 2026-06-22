import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildDisplayedMetricNoDataThrottleKey,
    DefaultDisplayedMetricNoDataObserver,
    type DisplayedMetricNoDataLogEntry,
} from "./displayed-metric-no-data-observer";
import { StatusEdgeDetector, resolveSustainedStatusEdgeMilliseconds } from "../../logging/status-edge-detector";

test("displayed metric no-data observer ignores the initial first-read gap", () => {
    const logWriter = new RecordingDisplayedMetricNoDataLogWriter();
    const observer = new DefaultDisplayedMetricNoDataObserver({ logWriter });

    observer.observe(buildObservation({
        nowMilliseconds: 9000,
        outcome: undefined,
    }));

    assert.deepEqual(logWriter.entries, []);
});

test("displayed metric no-data observer logs never-read enter as info", () => {
    const logWriter = new RecordingDisplayedMetricNoDataLogWriter();
    const observer = new DefaultDisplayedMetricNoDataObserver({ logWriter });

    observer.observe(buildObservation({
        nowMilliseconds: 10_000,
        outcome: undefined,
    }));

    assert.deepEqual(logWriter.entries.map(entry => ({
        event: entry.event,
        level: entry.level,
        unavailableReason: entry.unavailableReason,
    })), [{
        event: "displayedMetricNoDataEntered",
        level: "info",
        unavailableReason: "noFreshSource",
    }]);
});

test("displayed metric no-data observer logs sustained never-read state as warn", () => {
    const logWriter = new RecordingDisplayedMetricNoDataLogWriter();
    const observer = new DefaultDisplayedMetricNoDataObserver({ logWriter });

    observer.observe(buildObservation({ nowMilliseconds: 10_000, outcome: undefined }));
    observer.observe(buildObservation({ nowMilliseconds: 19_999, outcome: undefined }));
    observer.observe(buildObservation({ nowMilliseconds: 20_000, outcome: undefined }));

    assert.deepEqual(logWriter.entries.map(entry => ({
        event: entry.event,
        level: entry.level,
        sustainedMilliseconds: entry.sustainedMilliseconds,
    })), [
        {
            event: "displayedMetricNoDataEntered",
            level: "info",
            sustainedMilliseconds: 0,
        },
        {
            event: "displayedMetricNoDataSustained",
            level: "warn",
            sustainedMilliseconds: 10_000,
        },
    ]);
});

test("displayed metric no-data observer keeps explicit invalid values at warn", () => {
    const logWriter = new RecordingDisplayedMetricNoDataLogWriter();
    const observer = new DefaultDisplayedMetricNoDataObserver({ logWriter });

    observer.observe(buildObservation({
        outcome: {
            kind: "unavailable",
            reason: "invalidValue",
            lastValueTimestampMilliseconds: undefined,
        },
    }));

    assert.deepEqual(logWriter.entries.map(entry => ({
        event: entry.event,
        level: entry.level,
        unavailableReason: entry.unavailableReason,
    })), [{
        event: "displayedMetricNoDataEntered",
        level: "warn",
        unavailableReason: "invalidValue",
    }]);
});

test("displayed metric no-data observer logs recovery when a value arrives", () => {
    const logWriter = new RecordingDisplayedMetricNoDataLogWriter();
    const observer = new DefaultDisplayedMetricNoDataObserver({ logWriter });

    observer.observe(buildObservation({ nowMilliseconds: 10_000, outcome: undefined }));
    observer.observe(buildObservation({
        nowMilliseconds: 12_000,
        outcome: {
            kind: "value",
            valueTimestampMilliseconds: 12_000,
            freshness: "fresh",
        },
        selectedSourceId: "node-system",
    }));

    assert.deepEqual(logWriter.entries.map(entry => ({
        event: entry.event,
        level: entry.level,
        selectedSourceId: entry.selectedSourceId,
        sustainedMilliseconds: entry.sustainedMilliseconds,
    })), [
        {
            event: "displayedMetricNoDataEntered",
            level: "info",
            selectedSourceId: undefined,
            sustainedMilliseconds: 0,
        },
        {
            event: "displayedMetricNoDataRecovered",
            level: "info",
            selectedSourceId: "node-system",
            sustainedMilliseconds: 2000,
        },
    ]);
});

test("displayed metric no-data observer clears action state", () => {
    const logWriter = new RecordingDisplayedMetricNoDataLogWriter();
    const observer = new DefaultDisplayedMetricNoDataObserver({ logWriter });

    observer.observe(buildObservation({ nowMilliseconds: 10_000, outcome: undefined }));
    observer.clearAction("action-1");
    observer.observe(buildObservation({ nowMilliseconds: 20_000, outcome: undefined }));

    assert.deepEqual(logWriter.entries.map(entry => entry.event), [
        "displayedMetricNoDataEntered",
        "displayedMetricNoDataEntered",
    ]);
});

test("displayed metric no-data observer clears previous key before pending first read returns", () => {
    const detector = new StatusEdgeDetector();
    const logWriter = new RecordingDisplayedMetricNoDataLogWriter();
    const observer = new DefaultDisplayedMetricNoDataObserver({ detector, logWriter });

    observer.observe(buildObservation({
        metricKey: "net.down",
        nowMilliseconds: 10_000,
        outcome: undefined,
    }));
    observer.observe(buildObservation({
        metricKey: "net.up",
        nowMilliseconds: 9000,
        outcome: undefined,
    }));

    assert.equal(detector.has("action:action-1:net.down:node-system"), false);
    assert.equal(detector.has("action:action-1:net.up:node-system"), false);
});

test("displayed metric no-data sustained threshold is bounded by polling interval", () => {
    assert.equal(resolveSustainedStatusEdgeMilliseconds(1000), 10_000);
    assert.equal(resolveSustainedStatusEdgeMilliseconds(30_000), 60_000);
    assert.equal(resolveSustainedStatusEdgeMilliseconds(86_400_000), 60_000);
});

test("displayed metric no-data sustained logs are throttled by source outage", () => {
    const firstActionEntry = buildLogEntry({
        actionId: "action-1",
        metricKey: "ram.used",
        event: "displayedMetricNoDataSustained",
    });
    const secondActionEntry = buildLogEntry({
        actionId: "action-2",
        metricKey: "cpu.usage_percent",
        event: "displayedMetricNoDataSustained",
    });

    assert.equal(
        buildDisplayedMetricNoDataThrottleKey(firstActionEntry),
        buildDisplayedMetricNoDataThrottleKey(secondActionEntry),
    );
});

test("displayed metric no-data enter logs keep per-action throttle identity", () => {
    const firstActionEntry = buildLogEntry({
        actionId: "action-1",
        metricKey: "ram.used",
        event: "displayedMetricNoDataEntered",
    });
    const secondActionEntry = buildLogEntry({
        actionId: "action-2",
        metricKey: "cpu.usage_percent",
        event: "displayedMetricNoDataEntered",
    });

    assert.notEqual(
        buildDisplayedMetricNoDataThrottleKey(firstActionEntry),
        buildDisplayedMetricNoDataThrottleKey(secondActionEntry),
    );
});

class RecordingDisplayedMetricNoDataLogWriter {
    readonly entries: DisplayedMetricNoDataLogEntry[] = [];

    write(entry: DisplayedMetricNoDataLogEntry): void {
        this.entries.push(entry);
    }
}

function buildObservation(
    overrides: Partial<Parameters<DefaultDisplayedMetricNoDataObserver["observe"]>[0]>,
): Parameters<DefaultDisplayedMetricNoDataObserver["observe"]>[0] {
    return {
        actionId: "action-1",
        metricKey: "net.down",
        preferredSourceId: "node-system",
        selectedSourceId: undefined,
        preferredSourceStatus: undefined,
        outcome: undefined,
        actionAppearedAtTimestampMilliseconds: 0,
        nowMilliseconds: 0,
        pollingIntervalMilliseconds: 1000,
        ...overrides,
    };
}

function buildLogEntry(overrides: Partial<DisplayedMetricNoDataLogEntry>): DisplayedMetricNoDataLogEntry {
    return {
        event: "displayedMetricNoDataEntered",
        level: "warn",
        actionId: "action-1",
        metricKey: "ram.used",
        preferredSourceId: "node-system",
        selectedSourceId: undefined,
        preferredSourceState: undefined,
        preferredSourceReason: undefined,
        unavailableReason: "noFreshSource",
        lastValueAgeMilliseconds: undefined,
        pollingIntervalMilliseconds: 1000,
        sustainedMilliseconds: 10_000,
        ...overrides,
    };
}
