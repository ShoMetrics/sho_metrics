import assert from "node:assert/strict";
import test from "node:test";
import {
    createShoLogger,
    type LoggerSink,
    type LogEntryData,
    type LogLevel,
} from "./logger";

type RecordedLogEntry = {
    readonly level: LogLevel;
    readonly scope: string;
    readonly entryData: LogEntryData;
};

test("disabled direct logs do not evaluate lazy messages", () => {
    const sink = new RecordingLoggerSink("info");
    const log = createShoLogger(sink).for("Scheduler");
    let providerCallCount = 0;

    log.debug(() => {
        providerCallCount += 1;
        return "expensive debug message";
    });

    assert.equal(providerCallCount, 0);
    assert.deepEqual(sink.recordedEntries, []);
});

test("enabled direct logs preserve Error objects and structured entries", () => {
    const sink = new RecordingLoggerSink("trace");
    const log = createShoLogger(sink).for("Source:NodeSystem:GPU");
    const pollError = new Error("nvidia-smi failed");
    const diagnosticEntry = {
        command: "nvidia-smi",
        exitCode: 1,
    };

    log.error("GPU poll error", pollError, diagnosticEntry);

    assert.equal(sink.recordedEntries.length, 1);
    assert.equal(sink.recordedEntries[0].level, "error");
    assert.equal(sink.recordedEntries[0].scope, "Source:NodeSystem:GPU");
    assert.equal(sink.recordedEntries[0].entryData[0], "GPU poll error");
    assert.equal(sink.recordedEntries[0].entryData[1], pollError);
    assert.equal(sink.recordedEntries[0].entryData[2], diagnosticEntry);
});

test("enabled direct logs evaluate lazy first argument only when writing", () => {
    const sink = new RecordingLoggerSink("debug");
    const log = createShoLogger(sink).for("Rasterizer");
    let providerCallCount = 0;

    log.debug(() => {
        providerCallCount += 1;
        return "render summary";
    });

    assert.equal(providerCallCount, 1);
    assert.deepEqual(sink.recordedEntries[0].entryData, ["render summary"]);
});

test("enabled direct logs capture lazy message failures without throwing", () => {
    const sink = new RecordingLoggerSink("debug");
    const log = createShoLogger(sink).for("Rasterizer");
    const providerError = new Error("missing render summary");
    const renderEntry = {
        actionId: "action-1",
    };

    assert.doesNotThrow(() => {
        log.debug(() => {
            throw providerError;
        }, renderEntry);
    });

    assert.deepEqual(sink.recordedEntries[0].entryData, [
        "Log provider failed",
        providerError,
        renderEntry,
    ]);
});

test("builder withCause appends the original Error object after entry data", () => {
    const sink = new RecordingLoggerSink("trace");
    const log = createShoLogger(sink).for("MetricDisplayRunner");
    const renderError = new Error("render failed");
    const actionEntry = {
        actionId: "action-1",
    };

    log.atError()
        .withCause(renderError)
        .log("Render/update error", actionEntry);

    assert.deepEqual(sink.recordedEntries[0].entryData, [
        "Render/update error",
        actionEntry,
        renderError,
    ]);
});

test("disabled builders do not evaluate lazy messages", () => {
    const sink = new RecordingLoggerSink("info");
    const log = createShoLogger(sink).for("Action:NetSpeed");
    let providerCallCount = 0;

    log.atDebug()
        .withCause(new Error("not written"))
        .everyMs("speed-sample", 5000)
        .log(() => {
            providerCallCount += 1;
            return "expensive speed sample";
        });

    assert.equal(providerCallCount, 0);
    assert.deepEqual(sink.recordedEntries, []);
});

test("everyMs throttles matching keys without blocking different keys", () => {
    const sink = new RecordingLoggerSink("debug");
    const log = createShoLogger(sink).for("Action:NetSpeed");

    log.atDebug().everyMs("speed-sample", 60000).log("first sample");
    log.atDebug().everyMs("speed-sample", 60000).log("second sample");
    log.atDebug().everyMs("disk-sample", 60000).log("third sample");

    assert.deepEqual(
        sink.recordedEntries.map(recordedEntry => recordedEntry.entryData[0]),
        ["first sample", "third sample"],
    );
});

test("everyMs evicts the oldest key when throttle state reaches the fixed limit", () => {
    const sink = new RecordingLoggerSink("debug");
    const log = createShoLogger(sink).for("Action:NetSpeed");
    const throttleKeyCountLimit = 128;

    for (let keyIndex = 0; keyIndex < throttleKeyCountLimit; keyIndex += 1) {
        log.atDebug().everyMs(`sample-${keyIndex}`, 60000).log(`sample ${keyIndex}`);
    }

    log.atDebug().everyMs("sample-0", 60000).log("suppressed oldest before eviction");
    log.atDebug().everyMs("sample-128", 60000).log("evict oldest");
    log.atDebug().everyMs("sample-0", 60000).log("oldest can write after eviction");

    const messages = sink.recordedEntries.map(recordedEntry => recordedEntry.entryData[0]);

    assert.equal(messages.length, throttleKeyCountLimit + 2);
    assert.equal(messages.at(-2), "evict oldest");
    assert.equal(messages.at(-1), "oldest can write after eviction");
    assert.equal(messages.includes("suppressed oldest before eviction"), false);
});

class RecordingLoggerSink implements LoggerSink {
    public readonly recordedEntries: RecordedLogEntry[];

    public constructor(
        public level: LogLevel,
        private readonly scope = "",
        recordedEntries: RecordedLogEntry[] = [],
    ) {
        this.recordedEntries = recordedEntries;
    }

    public setLevel(level?: LogLevel): LoggerSink {
        this.level = level ?? "info";
        return this;
    }

    public createScope(scope: string): LoggerSink {
        return new RecordingLoggerSink(this.level, scope, this.recordedEntries);
    }

    public error(...entryData: LogEntryData): LoggerSink {
        return this.record("error", entryData);
    }

    public warn(...entryData: LogEntryData): LoggerSink {
        return this.record("warn", entryData);
    }

    public info(...entryData: LogEntryData): LoggerSink {
        return this.record("info", entryData);
    }

    public debug(...entryData: LogEntryData): LoggerSink {
        return this.record("debug", entryData);
    }

    public trace(...entryData: LogEntryData): LoggerSink {
        return this.record("trace", entryData);
    }

    private record(level: LogLevel, entryData: LogEntryData): LoggerSink {
        this.recordedEntries.push({
            level,
            scope: this.scope,
            entryData,
        });
        return this;
    }
}
