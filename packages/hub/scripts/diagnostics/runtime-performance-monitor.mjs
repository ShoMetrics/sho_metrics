#!/usr/bin/env node

import { spawn } from "node:child_process";
import { open, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const processSamplerScriptPath = path.join(scriptDirectory, "process-sampler.ps1");
const hubRoot = path.resolve(scriptDirectory, "..", "..");
const repositoryRoot = path.resolve(hubRoot, "..", "..");
const defaultLogPath = path.join(
    hubRoot,
    "com.ez.sho-metrics.sdPlugin",
    "logs",
    "com.ez.sho-metrics.0.log",
);
const defaultOutputDirectory = path.join(repositoryRoot, "docs", "development", "perf-logs");
const defaultWarmupSamples = 5;
// PDH rate counters need at least two physical intervals before cooked values are stable.
const minimumWarmupMilliseconds = 2000;
const defaultProcessNames = [
    "node",
    "powershell",
    "pwsh",
    "WmiPrvSE",
    "nvidia-smi",
    "ShoMetricsHelperService",
    "ShoMetrics.Source.Windows.Service",
    "ShoMetrics.Source.Windows.Helper",
    "StreamDeck",
];

const options = readOptions(process.argv.slice(2));
const logicalProcessorCount = os.cpus().length || 1;
const startTimestamp = new Date();
const outputBaseName = [
    startTimestamp.toISOString().replaceAll(":", "-").replaceAll(".", "-"),
    options.label,
].filter(Boolean).join("_");
const processSamplePath = path.join(options.outputDirectory, `${outputBaseName}.process.ndjson`);
const summaryPath = path.join(options.outputDirectory, `${outputBaseName}.summary.json`);

await mkdir(options.outputDirectory, { recursive: true });
const logStartOffset = await readFileSize(options.logPath);
const processSnapshots = await sampleProcesses({
    durationSeconds: options.durationSeconds,
    intervalMilliseconds: options.intervalMilliseconds,
    processNames: options.processNames,
    processSamplePath,
    warmupSamples: options.effectiveWarmupSamples,
});
const logText = await readTextSince(options.logPath, logStartOffset);
const summary = {
    measurementVersion: 5,
    capturedAt: startTimestamp.toISOString(),
    durationSeconds: options.durationSeconds,
    intervalMilliseconds: options.intervalMilliseconds,
    requestedWarmupSamples: options.requestedWarmupSamples,
    effectiveWarmupSamples: options.effectiveWarmupSamples,
    warmupDurationMilliseconds: options.effectiveWarmupSamples * options.intervalMilliseconds,
    logicalProcessorCount,
    schemaNotes: {
        cpuPercent: "Process CPU is normalized by logicalProcessorCount, matching Task Manager system-wide percent.",
        processAggregation: "Per processName values are summed across matching PIDs for each sample, then summarized across samples.",
        processParentAggregation: "processesByParent narrows the same per-sample aggregation by observed parent process name.",
        wmiAttribution: "WmiPrvSE is a shared WMI provider host and can include activity from clients outside this plugin.",
        nvidiaSmiCpu: "Short-lived nvidia-smi processes can be missed by 1Hz process sampling; prefer logSummaries.nvidiaSmi elapsed/start counts.",
        collectorGroupRefresh: "Measurement version 5 adds CollectorGroupRunner refresh status and duration summaries for the Phase 5c background collection path.",
    },
    caveats: [
        "The first effectiveWarmupSamples process samples are excluded from process summaries to reduce PDH rate-counter warm-up bias.",
        "The monitor itself uses PowerShell Get-Counter once per interval and can perturb the measured system; compare runs with identical monitor settings.",
        "Plugin log summaries cover the full capture window, while process summaries exclude warm-up samples.",
    ],
    recommendedProtocol: [
        "Idle baseline: stop Stream Deck and run this monitor for 5 minutes with the same interval and process list.",
        "Before-change baseline: start Stream Deck with the target widget layout and run this monitor for 5 minutes.",
        "After-change baseline: keep the same widget layout and run this monitor for 5 minutes after the code change.",
        "Compare before and after using the same summary fields, and treat the idle baseline as monitor/system noise rather than plugin cost.",
    ],
    logPath: path.relative(repositoryRoot, options.logPath),
    processSamplePath: path.relative(repositoryRoot, processSamplePath),
    processSummaries: summarizeProcessSnapshots(processSnapshots, options.processNames),
    logSummaries: summarizePluginLog(logText),
};

await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

printSummary(summary, summaryPath);

function readOptions(args) {
    const durationSeconds = readNumberOption(args, "duration-seconds", 120);
    const intervalMilliseconds = readNumberOption(args, "interval-ms", 1000);
    const requestedWarmupSamples = readNumberOption(args, "warmup-samples", defaultWarmupSamples);
    const effectiveWarmupSamples = Math.max(
        requestedWarmupSamples,
        Math.ceil(minimumWarmupMilliseconds / intervalMilliseconds),
    );
    const label = readStringOption(args, "label", "baseline");
    const outputDirectory = path.resolve(readStringOption(args, "out", defaultOutputDirectory));
    const logPath = path.resolve(readStringOption(args, "log", defaultLogPath));
    const processNames = readStringOption(args, "processes", defaultProcessNames.join(","))
        .split(",")
        .map(processName => processName.trim())
        .filter(processName => processName.length > 0);

    return {
        durationSeconds,
        intervalMilliseconds,
        requestedWarmupSamples,
        effectiveWarmupSamples,
        label,
        outputDirectory,
        logPath,
        processNames,
    };
}

function readNumberOption(args, name, fallback) {
    const value = readStringOption(args, name, String(fallback));
    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        throw new Error(`--${name} must be a positive number.`);
    }

    return parsedValue;
}

function readStringOption(args, name, fallback) {
    const prefix = `--${name}=`;
    const prefixedValue = args.find(argument => argument.startsWith(prefix));

    if (prefixedValue) {
        return prefixedValue.slice(prefix.length);
    }

    const optionIndex = args.indexOf(`--${name}`);
    if (optionIndex >= 0 && args[optionIndex + 1]) {
        return args[optionIndex + 1];
    }

    return fallback;
}

async function readFileSize(filePath) {
    try {
        const fileStats = await stat(filePath);
        return fileStats.size;
    } catch (error) {
        if (isFileNotFound(error)) {
            return 0;
        }

        throw error;
    }
}

async function readTextSince(filePath, startOffset) {
    try {
        const fileHandle = await open(filePath, "r");
        try {
            const fileStats = await fileHandle.stat();
            const readableByteCount = Math.max(0, fileStats.size - startOffset);
            const buffer = Buffer.alloc(readableByteCount);
            await fileHandle.read(buffer, 0, readableByteCount, startOffset);
            return buffer.toString("utf8");
        } finally {
            await fileHandle.close();
        }
    } catch (error) {
        if (isFileNotFound(error)) {
            return "";
        }

        throw error;
    }
}

function isFileNotFound(error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function sampleProcesses(options) {
    const powershellScript = await buildProcessSamplerScript(options);

    return new Promise((resolve, reject) => {
        const powershellProcess = spawn(
            "powershell.exe",
            [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                powershellScript,
            ],
            {
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
            },
        );
        const snapshots = [];
        let pendingOutput = "";
        let errorOutput = "";

        powershellProcess.stdout.setEncoding("utf8");
        powershellProcess.stderr.setEncoding("utf8");

        powershellProcess.stdout.on("data", chunk => {
            pendingOutput += chunk;
            const lines = pendingOutput.split(/\r?\n/);
            pendingOutput = lines.pop() ?? "";

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.length === 0) {
                    continue;
                }

                const snapshot = JSON.parse(trimmedLine);
                snapshots.push(snapshot);
            }
        });
        powershellProcess.stderr.on("data", chunk => {
            errorOutput += chunk;
        });
        powershellProcess.on("error", reject);
        powershellProcess.on("close", async exitCode => {
            try {
                if (pendingOutput.trim().length > 0) {
                    const snapshot = JSON.parse(pendingOutput.trim());
                    snapshots.push(snapshot);
                }

                await writeFile(
                    options.processSamplePath,
                    snapshots.map(snapshot => JSON.stringify(snapshot)).join("\n") + "\n",
                    "utf8",
                );

                if (exitCode !== 0) {
                    reject(new Error(`PowerShell sampler exited with code ${exitCode}: ${errorOutput}`));
                    return;
                }

                resolve(snapshots);
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function buildProcessSamplerScript(options) {
    const template = await readFile(processSamplerScriptPath, "utf8");

    return template
        .replaceAll("__DURATION_SECONDS__", String(options.durationSeconds))
        .replaceAll("__INTERVAL_MILLISECONDS__", String(options.intervalMilliseconds))
        .replaceAll("__WARMUP_SAMPLES__", String(options.warmupSamples))
        .replaceAll("__LOGICAL_PROCESSOR_COUNT__", String(logicalProcessorCount))
        .replaceAll("__MONITOR_NODE_PROCESS_ID__", String(process.pid))
        .replaceAll("__PROCESS_NAMES_JSON__", JSON.stringify(options.processNames));
}

function summarizeProcessSnapshots(snapshots, targetProcessNames) {
    const samplesByProcessName = createProcessSummaryAccumulator();
    const samplesByProcessNameAndParent = createProcessSummaryAccumulator();
    const sampleStatusCounts = new Map();
    const systemCpuPercentSamples = [];
    const actualIntervalMillisecondsSamples = [];
    const counterCollectMillisecondsSamples = [];
    const targetProcessNamesLower = targetProcessNames.map(processName => processName.toLowerCase());
    let warmupSampleCount = 0;
    let includedSampleCount = 0;

    for (const snapshot of snapshots) {
        const sampleStatus = typeof snapshot.status === "string" ? snapshot.status : "unknown";
        sampleStatusCounts.set(sampleStatus, (sampleStatusCounts.get(sampleStatus) ?? 0) + 1);

        if (snapshot.includeInSummary === false) {
            warmupSampleCount += 1;
            continue;
        }

        includedSampleCount += 1;

        if (Number.isFinite(snapshot.actualIntervalMilliseconds)) {
            actualIntervalMillisecondsSamples.push(snapshot.actualIntervalMilliseconds);
        }

        if (Number.isFinite(snapshot.counterCollectMilliseconds)) {
            counterCollectMillisecondsSamples.push(snapshot.counterCollectMilliseconds);
        }

        if (Number.isFinite(snapshot.systemCpuPercent)) {
            systemCpuPercentSamples.push(snapshot.systemCpuPercent);
        }

        const processSamples = Array.isArray(snapshot.processes) ? snapshot.processes : [];
        const processNameById = new Map(
            processSamples
                .map(processSample => [Number(processSample.pid), String(processSample.name).toLowerCase()])
                .filter(([processId]) => Number.isFinite(processId) && processId > 0),
        );

        const aggregateByName = createSeededAggregateMap(targetProcessNamesLower);
        const aggregateByNameAndParent = new Map();

        for (const processSample of processSamples) {
            const processName = String(processSample.name).toLowerCase();
            const parentProcessName = processNameById.get(Number(processSample.parentPid)) ?? "unknown";
            const processAndParentKey = buildProcessParentKey(processName, parentProcessName);

            addProcessSampleToAggregate(aggregateByName, processName, processSample);
            addProcessSampleToAggregate(aggregateByNameAndParent, processAndParentKey, processSample);

            if (Number.isFinite(processSample.pid)) {
                appendSetValue(samplesByProcessName.distinctProcessIds, processName, processSample.pid);
                appendSetValue(samplesByProcessNameAndParent.distinctProcessIds, processAndParentKey, processSample.pid);
            }
        }

        appendProcessAggregates(samplesByProcessName, aggregateByName);
        appendProcessAggregates(samplesByProcessNameAndParent, aggregateByNameAndParent);
    }

    const processNames = Array.from(new Set([
        ...targetProcessNamesLower,
        ...samplesByProcessName.cpuPercent.keys(),
        ...samplesByProcessName.privateMegabytes.keys(),
        ...samplesByProcessName.processCount.keys(),
    ])).sort((firstName, secondName) => firstName.localeCompare(secondName));
    const processAndParentKeys = Array.from(new Set([
        ...samplesByProcessNameAndParent.cpuPercent.keys(),
        ...samplesByProcessNameAndParent.privateMegabytes.keys(),
        ...samplesByProcessNameAndParent.processCount.keys(),
    ])).sort((firstKey, secondKey) => firstKey.localeCompare(secondKey));

    return {
        rawSampleCount: snapshots.length,
        warmupSampleCount,
        includedSampleCount,
        sampleStatusCounts: Object.fromEntries(Array.from(sampleStatusCounts.entries()).sort()),
        actualIntervalMilliseconds: summarizeSeries(actualIntervalMillisecondsSamples),
        counterCollectMilliseconds: summarizeSeries(counterCollectMillisecondsSamples),
        systemCpuPercent: summarizeSeries(systemCpuPercentSamples),
        processes: processNames.map(processName => ({
            processName,
            ...summarizeProcessKey(samplesByProcessName, processName),
        })),
        processesByParent: processAndParentKeys.map(processAndParentKey => {
            const [processName, parentProcessName] = processAndParentKey.split("|");

            return {
                processName,
                parentProcessName,
                ...summarizeProcessKey(samplesByProcessNameAndParent, processAndParentKey),
            };
        }),
    };
}

function createProcessSummaryAccumulator() {
    return {
        cpuPercent: new Map(),
        privateMegabytes: new Map(),
        ioReadOperationsPerSecond: new Map(),
        ioWriteOperationsPerSecond: new Map(),
        threadCount: new Map(),
        handleCount: new Map(),
        processCount: new Map(),
        distinctProcessIds: new Map(),
    };
}

function createSeededAggregateMap(keys) {
    return new Map(keys.map(key => [key, createEmptyProcessAggregate()]));
}

function buildProcessParentKey(processName, parentProcessName) {
    return `${processName}|${parentProcessName}`;
}

function createEmptyProcessAggregate() {
    return {
        cpuPercent: 0,
        privateMegabytes: 0,
        ioReadOperationsPerSecond: 0,
        ioWriteOperationsPerSecond: 0,
        threadCount: 0,
        handleCount: 0,
        processCount: 0,
    };
}

function addProcessSampleToAggregate(aggregateMap, key, processSample) {
    const aggregate = aggregateMap.get(key) ?? createEmptyProcessAggregate();

    aggregate.cpuPercent += Number(processSample.cpuPercent) || 0;
    aggregate.privateMegabytes += (Number(processSample.privateBytes) || 0) / 1024 / 1024;
    aggregate.ioReadOperationsPerSecond += Number(processSample.ioReadOperationsPerSecond) || 0;
    aggregate.ioWriteOperationsPerSecond += Number(processSample.ioWriteOperationsPerSecond) || 0;
    aggregate.threadCount += Number(processSample.threadCount) || 0;
    aggregate.handleCount += Number(processSample.handleCount) || 0;
    aggregate.processCount += 1;

    aggregateMap.set(key, aggregate);
}

function appendProcessAggregates(accumulator, aggregateMap) {
    for (const [key, aggregate] of aggregateMap) {
        appendMapValue(accumulator.cpuPercent, key, aggregate.cpuPercent);
        appendMapValue(accumulator.privateMegabytes, key, aggregate.privateMegabytes);
        appendMapValue(accumulator.ioReadOperationsPerSecond, key, aggregate.ioReadOperationsPerSecond);
        appendMapValue(accumulator.ioWriteOperationsPerSecond, key, aggregate.ioWriteOperationsPerSecond);
        appendMapValue(accumulator.threadCount, key, aggregate.threadCount);
        appendMapValue(accumulator.handleCount, key, aggregate.handleCount);
        appendMapValue(accumulator.processCount, key, aggregate.processCount);
    }
}

function summarizeProcessKey(accumulator, key) {
    return {
        distinctProcessIdCount: accumulator.distinctProcessIds.get(key)?.size ?? 0,
        cpuPercent: summarizeSeries(accumulator.cpuPercent.get(key) ?? []),
        privateMegabytes: summarizeSeries(accumulator.privateMegabytes.get(key) ?? []),
        ioReadOperationsPerSecond: summarizeSeries(accumulator.ioReadOperationsPerSecond.get(key) ?? []),
        ioWriteOperationsPerSecond: summarizeSeries(accumulator.ioWriteOperationsPerSecond.get(key) ?? []),
        threadCount: summarizeSeries(accumulator.threadCount.get(key) ?? []),
        handleCount: summarizeSeries(accumulator.handleCount.get(key) ?? []),
        processCount: summarizeSeries(accumulator.processCount.get(key) ?? []),
    };
}

function appendMapValue(map, key, value) {
    const values = map.get(key);

    if (values) {
        values.push(value);
        return;
    }

    map.set(key, [value]);
}

function appendSetValue(map, key, value) {
    const values = map.get(key);

    if (values) {
        values.add(value);
        return;
    }

    map.set(key, new Set([value]));
}

function incrementMapCount(map, key) {
    map.set(key, (map.get(key) ?? 0) + 1);
}

function summarizePluginLog(logText) {
    const pollDurationsByInterval = new Map();
    const pollStartTimestampsByInterval = new Map();
    const sourceReadDurationsBySource = new Map();
    const sourceReadDurationsBySourceAndMetricSet = new Map();
    const nodeTimingDurationsByOperation = new Map();
    const sourceFallbackDurationsBySource = new Map();
    const sourceFallbackDurationsBySourceAndMetricSet = new Map();
    const sourceSkippedUnsupportedCountsBySourceAndMetricSet = new Map();
    const collectorGroupRefreshDurationsBySource = new Map();
    const collectorGroupRefreshDurationsBySourceAndGroup = new Map();
    const collectorGroupRefreshDurationsByStatus = new Map();
    const collectorGroupRefreshStatusCounts = new Map();
    const renderedSampleAgeDurationsByMetric = new Map();
    const dispatchSampleAgeDurationsByMetric = new Map();
    const metricViewSummaryValuesByField = new Map();
    const rasterizerSummaryValuesByField = new Map();
    const nvidiaSmiDurations = [];
    let maxActiveNvidiaSmiQueries = 0;
    let nvidiaSmiStartCount = 0;
    let nvidiaSmiSuccessCount = 0;
    let nvidiaSmiTimeoutCount = 0;

    for (const line of logText.split(/\r?\n/)) {
        const logTimestampMilliseconds = readLogTimestampMilliseconds(line);
        const pollStartMatch = line.match(/pollStart intervalMs=(?<interval>\d+)/);
        if (pollStartMatch?.groups && logTimestampMilliseconds != null) {
            appendMapValue(
                pollStartTimestampsByInterval,
                pollStartMatch.groups.interval,
                logTimestampMilliseconds,
            );
        }

        const pollDoneMatch = line.match(/pollDone intervalMs=(?<interval>\d+) .*?durationMs=(?<duration>\d+)/);
        if (pollDoneMatch?.groups) {
            appendMapValue(
                pollDurationsByInterval,
                pollDoneMatch.groups.interval,
                Number(pollDoneMatch.groups.duration),
            );
        }

        if (line.includes("SourceRunner: sourceRead")) {
            const fields = readLogFields(line);
            const sourceId = fields.get("sourceId");
            const durationMs = readNumberField(fields, "durationMs");
            if (fields.get("outcome") === "success" && sourceId && durationMs != null) {
                appendMapValue(sourceReadDurationsBySource, sourceId, durationMs);

                const requestedMetrics = fields.get("requestedMetrics");
                if (requestedMetrics) {
                    appendMapValue(
                        sourceReadDurationsBySourceAndMetricSet,
                        `${sourceId} ${requestedMetrics}`,
                        durationMs,
                    );
                }
            }

            const skippedMetrics = fields.get("skippedMetrics");
            if (fields.get("outcome") === "skipped-unsupported" && sourceId && skippedMetrics) {
                const metricSetKey = `${sourceId} ${skippedMetrics}`;
                sourceSkippedUnsupportedCountsBySourceAndMetricSet.set(
                    metricSetKey,
                    (sourceSkippedUnsupportedCountsBySourceAndMetricSet.get(metricSetKey) ?? 0) + 1,
                );
            }
        }

        const nodeTimingMatch = line.match(/timing operation=(?<operation>[^ ]+) outcome=(?:success|error) durationMs=(?<duration>\d+)/);
        if (nodeTimingMatch?.groups) {
            appendMapValue(
                nodeTimingDurationsByOperation,
                nodeTimingMatch.groups.operation,
                Number(nodeTimingMatch.groups.duration),
            );
        }

        if (line.includes("SourceRunner: sourceFallback")) {
            const fields = readLogFields(line);
            const sourceId = fields.get("sourceId");
            const durationMs = readNumberField(fields, "durationMs");
            if (sourceId && durationMs != null) {
                appendMapValue(sourceFallbackDurationsBySource, sourceId, durationMs);

                const attemptedMetrics = fields.get("attemptedMetrics");
                if (attemptedMetrics) {
                    appendMapValue(
                        sourceFallbackDurationsBySourceAndMetricSet,
                        `${sourceId} ${attemptedMetrics}`,
                        durationMs,
                    );
                }
            }
        }

        if (line.includes("CollectorGroupRunner: collectorGroupRefresh")) {
            const fields = readLogFields(line);
            const status = fields.get("status");
            const sourceId = fields.get("sourceId");
            const groupId = fields.get("groupId");
            const durationMs = readNumberField(fields, "durationMs");

            if (status) {
                incrementMapCount(collectorGroupRefreshStatusCounts, status);
            }

            if (status && durationMs != null) {
                appendMapValue(collectorGroupRefreshDurationsByStatus, status, durationMs);
            }

            if (sourceId && durationMs != null) {
                appendMapValue(collectorGroupRefreshDurationsBySource, sourceId, durationMs);
            }

            if (sourceId && groupId && durationMs != null) {
                appendMapValue(collectorGroupRefreshDurationsBySourceAndGroup, `${sourceId} ${groupId}`, durationMs);
            }
        }

        if (line.includes("nvidiaSmiStart")) {
            nvidiaSmiStartCount += 1;
        }
        if (line.includes("nvidiaSmiSuccess") || line.includes("nvidiaSmiSlowSuccess")) {
            nvidiaSmiSuccessCount += 1;
            const nvidiaDurationMatch = line.match(/elapsedMs=(?<duration>\d+)/);
            if (nvidiaDurationMatch?.groups) {
                nvidiaSmiDurations.push(Number(nvidiaDurationMatch.groups.duration));
            }
        }
        if (line.includes("nvidiaSmiTimeout")) {
            nvidiaSmiTimeoutCount += 1;
        }
        const activeNvidiaSmiQueryMatch = line.match(/activeNvidiaSmiQueries=(?<count>\d+)/);
        if (activeNvidiaSmiQueryMatch?.groups) {
            maxActiveNvidiaSmiQueries = Math.max(
                maxActiveNvidiaSmiQueries,
                Number(activeNvidiaSmiQueryMatch.groups.count),
            );
        }

        const renderedSampleAgeMatch = line.match(/MetricViewUpdateRunner: rendered .*?metricKey=(?<metricKey>[^ ]+) .*?sampleAgeMs=(?<duration>\d+)/);
        if (renderedSampleAgeMatch?.groups) {
            appendMapValue(
                renderedSampleAgeDurationsByMetric,
                renderedSampleAgeMatch.groups.metricKey,
                Number(renderedSampleAgeMatch.groups.duration),
            );
        }

        const dispatchSampleAgeMatch = line.match(/MetricViewUpdateRunner: set(?:Image|Feedback)Done .*?metricKey=(?<metricKey>[^ ]+) .*?sampleAgeMs=(?<duration>\d+)/);
        if (dispatchSampleAgeMatch?.groups) {
            appendMapValue(
                dispatchSampleAgeDurationsByMetric,
                dispatchSampleAgeMatch.groups.metricKey,
                Number(dispatchSampleAgeMatch.groups.duration),
            );
        }

        appendKeyedSummaryValues(line, "metricViewPerfSummary", metricViewSummaryValuesByField);
        appendKeyedSummaryValues(line, "rasterizerPerfSummary", rasterizerSummaryValuesByField);
    }

    return {
        pollDurationsByInterval: summarizeMap(pollDurationsByInterval),
        pollStartGapsByInterval: summarizePollStartGaps(pollStartTimestampsByInterval),
        sourceReadDurationsBySource: summarizeMap(sourceReadDurationsBySource),
        sourceReadDurationsBySourceAndMetricSet: summarizeMap(sourceReadDurationsBySourceAndMetricSet),
        nodeTimingDurationsByOperation: summarizeMap(nodeTimingDurationsByOperation),
        sourceFallbackDurationsBySource: summarizeMap(sourceFallbackDurationsBySource),
        sourceFallbackDurationsBySourceAndMetricSet: summarizeMap(sourceFallbackDurationsBySourceAndMetricSet),
        sourceSkippedUnsupportedCountsBySourceAndMetricSet: Object.fromEntries(
            Array.from(sourceSkippedUnsupportedCountsBySourceAndMetricSet.entries()).sort(),
        ),
        collectorGroupRefreshDurationsBySource: summarizeMap(collectorGroupRefreshDurationsBySource),
        collectorGroupRefreshDurationsBySourceAndGroup: summarizeMap(collectorGroupRefreshDurationsBySourceAndGroup),
        collectorGroupRefreshDurationsByStatus: summarizeMap(collectorGroupRefreshDurationsByStatus),
        collectorGroupRefreshStatusCounts: Object.fromEntries(
            Array.from(collectorGroupRefreshStatusCounts.entries()).sort(),
        ),
        renderedSampleAgeDurationsByMetric: summarizeMap(renderedSampleAgeDurationsByMetric),
        dispatchSampleAgeDurationsByMetric: summarizeMap(dispatchSampleAgeDurationsByMetric),
        metricViewSummaryValuesByField: summarizeMap(metricViewSummaryValuesByField),
        rasterizerSummaryValuesByField: summarizeMap(rasterizerSummaryValuesByField),
        nvidiaSmi: {
            startCount: nvidiaSmiStartCount,
            successCount: nvidiaSmiSuccessCount,
            timeoutCount: nvidiaSmiTimeoutCount,
            maxActiveQueries: maxActiveNvidiaSmiQueries,
            elapsedMilliseconds: summarizeSeries(nvidiaSmiDurations),
        },
    };
}

function readLogFields(line) {
    const fields = new Map();

    for (const match of line.matchAll(/(?<key>[a-zA-Z][a-zA-Z0-9]*)=(?<value>[^ ]*)/g)) {
        if (match.groups) {
            fields.set(match.groups.key, match.groups.value);
        }
    }

    return fields;
}

function readNumberField(fields, name) {
    const value = fields.get(name);
    if (value == null) {
        return null;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
}

function readLogTimestampMilliseconds(line) {
    const timestampMatch = line.match(/^(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
    if (!timestampMatch?.groups) {
        return null;
    }

    return Date.parse(timestampMatch.groups.timestamp);
}

function summarizePollStartGaps(timestampMap) {
    const gapMap = new Map();

    for (const [interval, timestamps] of timestampMap) {
        const sortedTimestamps = timestamps.sort((firstTimestamp, secondTimestamp) => firstTimestamp - secondTimestamp);
        for (let index = 1; index < sortedTimestamps.length; index += 1) {
            appendMapValue(gapMap, interval, sortedTimestamps[index] - sortedTimestamps[index - 1]);
        }
    }

    return summarizeMap(gapMap);
}

function appendKeyedSummaryValues(line, marker, targetMap) {
    if (!line.includes(marker)) {
        return;
    }

    for (const match of line.matchAll(/(?<key>[a-zA-Z][a-zA-Z0-9]*)=(?<value>-?\d+(?:\.\d+)?)/g)) {
        if (!match.groups) {
            continue;
        }

        appendMapValue(targetMap, match.groups.key, Number(match.groups.value));
    }
}

function summarizeMap(map) {
    return Object.fromEntries(
        Array.from(map.entries())
            .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
            .map(([key, values]) => [key, summarizeSeries(values)]),
    );
}

function summarizeSeries(values) {
    const sortedValues = values
        .filter(value => Number.isFinite(value))
        .sort((firstValue, secondValue) => firstValue - secondValue);

    if (sortedValues.length === 0) {
        return {
            count: 0,
        };
    }

    const sum = sortedValues.reduce((total, value) => total + value, 0);

    return {
        count: sortedValues.length,
        min: roundNumber(sortedValues[0]),
        p50: roundNumber(percentile(sortedValues, 50)),
        p90: roundNumber(percentile(sortedValues, 90)),
        p95: roundNumber(percentile(sortedValues, 95)),
        max: roundNumber(sortedValues[sortedValues.length - 1]),
        average: roundNumber(sum / sortedValues.length),
    };
}

function percentile(sortedValues, percentileValue) {
    const percentileIndex = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
    const boundedIndex = Math.min(Math.max(percentileIndex, 0), sortedValues.length - 1);

    return sortedValues[boundedIndex];
}

function roundNumber(value) {
    return Math.round(value * 1000) / 1000;
}

function printSummary(summary, summaryPath) {
    const relativeSummaryPath = path.relative(repositoryRoot, summaryPath);
    process.stdout.write(`Wrote ${relativeSummaryPath}\n`);
    process.stdout.write(`Wrote ${summary.processSamplePath}\n`);

    const poll1000 = summary.logSummaries.pollDurationsByInterval["1000"];
    if (poll1000?.count > 0) {
        process.stdout.write(
            `pollDone intervalMs=1000 count=${poll1000.count} p50=${poll1000.p50}ms p90=${poll1000.p90}ms max=${poll1000.max}ms\n`,
        );
    }

    if (summary.processSummaries.systemCpuPercent.count > 0) {
        process.stdout.write([
            "systemCpu",
            `avg=${summary.processSummaries.systemCpuPercent.average}%`,
            `p95=${summary.processSummaries.systemCpuPercent.p95}%`,
            `max=${summary.processSummaries.systemCpuPercent.max}%`,
        ].join(" ") + "\n");
    }

    if (summary.processSummaries.actualIntervalMilliseconds.count > 0) {
        process.stdout.write([
            "processSampleInterval",
            `p50=${summary.processSummaries.actualIntervalMilliseconds.p50}ms`,
            `p95=${summary.processSummaries.actualIntervalMilliseconds.p95}ms`,
            `max=${summary.processSummaries.actualIntervalMilliseconds.max}ms`,
        ].join(" ") + "\n");
    }

    if (summary.processSummaries.counterCollectMilliseconds.count > 0) {
        process.stdout.write([
            "counterCollect",
            `p50=${summary.processSummaries.counterCollectMilliseconds.p50}ms`,
            `p95=${summary.processSummaries.counterCollectMilliseconds.p95}ms`,
            `max=${summary.processSummaries.counterCollectMilliseconds.max}ms`,
        ].join(" ") + "\n");
    }

    const collectorRefreshStatusCounts = summary.logSummaries.collectorGroupRefreshStatusCounts;
    if (Object.keys(collectorRefreshStatusCounts).length > 0) {
        process.stdout.write(
            "collectorGroupRefreshStatus "
            + Object.entries(collectorRefreshStatusCounts)
                .map(([status, count]) => `${status}=${count}`)
                .join(" ")
            + "\n",
        );
    }

    const processSummaries = summary.processSummaries.processes
        .filter(processSummary => processSummary.cpuPercent.count > 0)
        .sort((firstSummary, secondSummary) => secondSummary.cpuPercent.max - firstSummary.cpuPercent.max);

    for (const processSummary of processSummaries.slice(0, 8)) {
        process.stdout.write([
            `process=${processSummary.processName}`,
            `cpuAvg=${processSummary.cpuPercent.average}%`,
            `cpuP95=${processSummary.cpuPercent.p95}%`,
            `cpuMax=${processSummary.cpuPercent.max}%`,
            `privateMaxMB=${processSummary.privateMegabytes.max}`,
            `processCountMax=${processSummary.processCount.max}`,
            `distinctPids=${processSummary.distinctProcessIdCount}`,
        ].join(" ") + "\n");
    }

    const childProcessSummaries = (summary.processSummaries.processesByParent ?? [])
        .filter(processSummary => processSummary.cpuPercent.count > 0)
        .sort((firstSummary, secondSummary) => secondSummary.cpuPercent.max - firstSummary.cpuPercent.max);

    for (const processSummary of childProcessSummaries.slice(0, 8)) {
        process.stdout.write([
            `process=${processSummary.processName}`,
            `parent=${processSummary.parentProcessName}`,
            `cpuAvg=${processSummary.cpuPercent.average}%`,
            `cpuP95=${processSummary.cpuPercent.p95}%`,
            `cpuMax=${processSummary.cpuPercent.max}%`,
            `privateMaxMB=${processSummary.privateMegabytes.max}`,
            `processCountMax=${processSummary.processCount.max}`,
            `distinctPids=${processSummary.distinctProcessIdCount}`,
        ].join(" ") + "\n");
    }
}
