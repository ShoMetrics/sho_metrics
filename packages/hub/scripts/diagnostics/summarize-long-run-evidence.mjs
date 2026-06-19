#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Keep these thresholds in sync with the pre-production long-run gate. They
// are policy constants for diagnostics reports, not runtime product settings.
const LONG_RUN_GATE = {
    activeRenderTargetCount: 64,
    warningWindowMilliseconds: 10 * 60 * 1000,
    maxWarningRatePerMinute: 10,
    maxSameWarningRatePerMinute: 3,
    maxSdkPromiseP95Milliseconds: 2000,
    maxRasterizeP95Milliseconds: 500,
    maxPostGcHeapFloorSlopeMbPerHour: 10,
};
const SUMMARY_CAVEATS = [
    "GC floor samples are collected through an attached Node inspector session with forced global.gc(); use the trend, not absolute memory, as the leak signal.",
    "Process sampling is Windows-oriented and writes to local paths used by the pre-production long-run workflow.",
];

const options = readOptions(process.argv.slice(2));
const processSamples = options.processPath ? await readNdjson(options.processPath) : [];
const heapSamples = options.heapPath ? await readNdjson(options.heapPath) : [];
const metadata = options.metadataPath ? await readJson(options.metadataPath) : null;
const logText = options.logPath ? await readFile(options.logPath, "utf8") : "";
const analysisWindow = buildAnalysisWindow({ metadata, processSamples, heapSamples });
const filteredLogText = filterLogTextByWindow(logText, analysisWindow);
const processSummary = summarizeProcessSamples(processSamples);
const heapSummary = summarizeHeapSamples(heapSamples);
const renderSummary = summarizeRenderLogs(filteredLogText);
const logSummary = summarizeLogEvents(filteredLogText);

const summary = {
    generatedAt: new Date().toISOString(),
    inputs: {
        processPath: options.processPath,
        heapPath: options.heapPath,
        metadataPath: options.metadataPath,
        logPath: options.logPath,
        analysisWindow,
    },
    process: processSummary,
    heap: heapSummary,
    pluginProcessFromHeapPid: readProcessSummaryForHeapPid(processSummary, heapSummary),
    render: renderSummary,
    logs: logSummary,
    verdictHints: buildVerdictHints({
        process: processSummary,
        heap: heapSummary,
        render: renderSummary,
        logs: logSummary,
    }),
    caveats: SUMMARY_CAVEATS,
};

if (options.outputPath) {
    await writeFile(options.outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

function readOptions(args) {
    return {
        processPath: readOptionalPathOption(args, "process"),
        heapPath: readOptionalPathOption(args, "heap"),
        metadataPath: readOptionalPathOption(args, "metadata"),
        logPath: readOptionalPathOption(args, "log"),
        outputPath: readOptionalPathOption(args, "out"),
    };
}

function readOptionalPathOption(args, name) {
    const value = readStringOption(args, name, "");
    return value.length === 0 ? null : path.resolve(value);
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

async function readNdjson(filePath) {
    const text = await readFile(filePath, "utf8");
    return text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => JSON.parse(line));
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, "utf8"));
}

function buildAnalysisWindow({ metadata, processSamples, heapSamples }) {
    const sampleTimestamps = [...processSamples, ...heapSamples]
        .map(sample => Date.parse(sample.timestamp))
        .filter(Number.isFinite);
    const sampleStartMilliseconds = min(sampleTimestamps);
    const sampleEndMilliseconds = max(sampleTimestamps);
    const metadataStartMilliseconds = typeof metadata?.startedAt === "string"
        ? Date.parse(metadata.startedAt)
        : Number.NaN;
    const metadataDurationMilliseconds = Number(metadata?.durationSeconds) * 1000;
    const metadataEndMilliseconds = Number.isFinite(metadataStartMilliseconds)
        && Number.isFinite(metadataDurationMilliseconds)
        && metadataDurationMilliseconds > 0
        ? metadataStartMilliseconds + metadataDurationMilliseconds
        : Number.NaN;
    const startMilliseconds = sampleStartMilliseconds ?? (
        Number.isFinite(metadataStartMilliseconds) ? metadataStartMilliseconds : null
    );
    const endMilliseconds = sampleEndMilliseconds ?? (
        Number.isFinite(metadataEndMilliseconds) ? metadataEndMilliseconds : null
    );

    return {
        startTimestamp: startMilliseconds === null ? null : new Date(startMilliseconds).toISOString(),
        endTimestamp: endMilliseconds === null ? null : new Date(endMilliseconds).toISOString(),
        isActive: startMilliseconds !== null && endMilliseconds !== null && endMilliseconds >= startMilliseconds,
    };
}

function filterLogTextByWindow(text, analysisWindow) {
    if (!analysisWindow.isActive) {
        return text;
    }

    const startMilliseconds = Date.parse(analysisWindow.startTimestamp);
    const endMilliseconds = Date.parse(analysisWindow.endTimestamp);
    return text
        .split(/\r?\n/)
        .filter(line => {
            const timestampMilliseconds = readLogTimestampMilliseconds(line);
            return Number.isFinite(timestampMilliseconds)
                && timestampMilliseconds >= startMilliseconds
                && timestampMilliseconds <= endMilliseconds;
        })
        .join("\n");
}

function summarizeProcessSamples(samples) {
    const byProcessName = new Map();
    const byPid = new Map();

    for (const sample of samples) {
        const timestampMilliseconds = Date.parse(sample.timestamp);
        const processNameSamples = new Map();

        for (const processSample of sample.processes ?? []) {
            appendProcessValue(byPid, String(processSample.pid), processSample, timestampMilliseconds);

            const processNameSample = processNameSamples.get(processSample.name) ?? {
                name: processSample.name,
                cpuPercent: 0,
                privateBytes: 0,
                workingSetBytes: 0,
            };
            processNameSample.cpuPercent += Number(processSample.cpuPercent ?? 0);
            processNameSample.privateBytes += Number(processSample.privateBytes ?? 0);
            processNameSample.workingSetBytes += Number(processSample.workingSetBytes ?? 0);
            processNameSamples.set(processSample.name, processNameSample);
        }

        for (const processNameSample of processNameSamples.values()) {
            appendProcessValue(byProcessName, processNameSample.name, processNameSample, timestampMilliseconds);
        }
    }

    return {
        sampleCount: samples.length,
        firstTimestamp: samples.at(0)?.timestamp,
        lastTimestamp: samples.at(-1)?.timestamp,
        byProcessName: summarizeProcessGroups(byProcessName),
        byPid: summarizeProcessGroups(byPid),
    };
}

function appendProcessValue(groups, key, processSample, timestampMilliseconds) {
    const group = groups.get(key) ?? {
        timestamps: [],
        cpuPercent: [],
        privateBytes: [],
        workingSetBytes: [],
    };

    group.timestamps.push(timestampMilliseconds);
    group.cpuPercent.push(Number(processSample.cpuPercent ?? 0));
    group.privateBytes.push(Number(processSample.privateBytes ?? 0));
    if (processSample.workingSetBytes !== undefined) {
        group.workingSetBytes.push(Number(processSample.workingSetBytes));
    }
    groups.set(key, group);
}

function summarizeProcessGroups(groups) {
    return Object.fromEntries([...groups.entries()].map(([key, group]) => [key, {
        sampleCount: group.cpuPercent.length,
        cpuAvgPercent: average(group.cpuPercent),
        cpuP95Percent: percentile(group.cpuPercent, 95),
        privateBytesFirst: group.privateBytes.at(0) ?? null,
        privateBytesLast: group.privateBytes.at(-1) ?? null,
        privateBytesMax: max(group.privateBytes),
        privateBytesSlopeMbPerHour: slopePerHour(group.privateBytes, group.timestamps).megabytes,
        workingSetBytesMax: max(group.workingSetBytes),
    }]));
}

function summarizeHeapSamples(samples) {
    const okSamples = samples.filter(sample => sample.ok === true);
    const heapUsedAfter = okSamples
        .map(sample => ({ value: Number(sample.memoryAfter?.heapUsed), timestamp: Date.parse(sample.timestamp) }))
        .filter(sample => Number.isFinite(sample.value) && Number.isFinite(sample.timestamp));
    const rssAfter = okSamples
        .map(sample => Number(sample.memoryAfter?.rss))
        .filter(Number.isFinite);
    const heapUsedAfterValues = heapUsedAfter.map(sample => sample.value);
    const heapUsedAfterTimestamps = heapUsedAfter.map(sample => sample.timestamp);

    return {
        sampleCount: samples.length,
        okCount: okSamples.length,
        failedCount: samples.length - okSamples.length,
        pid: okSamples.find(sample => sample.pid !== undefined)?.pid ?? null,
        firstTimestamp: samples.at(0)?.timestamp,
        lastTimestamp: samples.at(-1)?.timestamp,
        heapUsedAfterGcFirst: heapUsedAfterValues.at(0) ?? null,
        heapUsedAfterGcLast: heapUsedAfterValues.at(-1) ?? null,
        heapUsedAfterGcMax: max(heapUsedAfterValues),
        heapUsedAfterGcSlopeMbPerHour: slopePerHour(heapUsedAfterValues, heapUsedAfterTimestamps).megabytes,
        rssAfterGcMax: max(rssAfter),
        errors: samples
            .filter(sample => sample.ok !== true)
            .map(sample => sample.error)
            .filter(error => typeof error === "string")
            .slice(0, 10),
    };
}

function readProcessSummaryForHeapPid(processSummary, heapSummary) {
    if (heapSummary.pid === null) {
        return null;
    }

    return processSummary.byPid[String(heapSummary.pid)] ?? null;
}

function summarizeRenderLogs(logText) {
    const rows = [...logText.matchAll(/^.*metricViewPerfSummary .*$/gm)]
        .map(match => parseKeyValueLine(match[0]));

    return {
        windowCount: rows.length,
        maxActiveActions: max(rows.map(row => row.maxActiveActions)),
        maxQueueLength: max(rows.map(row => row.maxQueueLength)),
        rasterizeP95Ms: percentile(rows.map(row => row.avgRasterizeMs), 95),
        rasterizeMaxMs: max(rows.map(row => row.maxRasterizeMs)),
        sdkPromiseP95Ms: percentile(rows.map(row => row.avgSdkPromiseMs), 95),
        sdkPromiseMaxMs: max(rows.map(row => row.maxSdkPromiseMs)),
        slowestRasterizeMaxMs: max(rows.map(row => row.slowestRasterizeMs)),
        slowestFamilies: topValues(rows.map(row => row.slowestMetricFamily).filter(Boolean)),
        slowestPrimitives: topValues(rows.map(row => row.slowestPrimitive).filter(Boolean)),
        slowestVariants: topValues(rows.map(row => row.slowestVariant).filter(Boolean)),
    };
}

function summarizeLogEvents(logText) {
    const warningLines = [...logText.matchAll(/^.* WARN\s+.*$/gm)].map(match => match[0]);
    const warningEvents = warningLines
        .map(line => ({
            timestamp: readLogTimestampMilliseconds(line),
            normalizedLine: normalizeWarningLine(line),
        }))
        .filter(event => Number.isFinite(event.timestamp));
    const timestamps = warningEvents.map(event => event.timestamp);

    return {
        warningCount: warningLines.length,
        warningRatePerMinute: computeRatePerMinute(timestamps),
        maxWarningRatePerTenMinutes: maxWindowRatePerMinute(timestamps, LONG_RUN_GATE.warningWindowMilliseconds),
        maxSameWarningRatePerTenMinutes: maxSameValueWindowRatePerMinute(
            warningEvents,
            LONG_RUN_GATE.warningWindowMilliseconds,
        ),
        topWarnings: topValues(warningEvents.map(event => event.normalizedLine)),
        displayedNoDataEntered: countMatches(logText, "displayedMetricNoDataEntered"),
        displayedNoDataSustained: countMatches(logText, "displayedMetricNoDataSustained"),
        displayedNoDataRecovered: countMatches(logText, "displayedMetricNoDataRecovered"),
        collectorGroupNoDataEntered: countMatches(logText, "collectorGroupNoDataEntered"),
        collectorGroupNoDataSustained: countMatches(logText, "collectorGroupNoDataSustained"),
        collectorGroupNoDataRecovered: countMatches(logText, "collectorGroupNoDataRecovered"),
        metricStoreInvalidValuesDropped: countMatches(logText, "metricStoreInvalidValuesDropped"),
        collectorRefreshFailed: countMatches(logText, "collectorGroupRefresh status=failed"),
        collectorBackoffSkipped: countMatches(logText, "collectorGroupRefresh status=skippedBackoff"),
    };
}

function buildVerdictHints(summary) {
    return {
        activeRenderInvalid: summary.render.maxActiveActions !== null
            && summary.render.maxActiveActions < LONG_RUN_GATE.activeRenderTargetCount,
        memoryUnknown: summary.heap.okCount === 0,
        warningRateFail: summary.logs.maxWarningRatePerTenMinutes !== null
            && summary.logs.maxWarningRatePerTenMinutes > LONG_RUN_GATE.maxWarningRatePerMinute,
        sameWarningRateFail: summary.logs.maxSameWarningRatePerTenMinutes !== null
            && summary.logs.maxSameWarningRatePerTenMinutes > LONG_RUN_GATE.maxSameWarningRatePerMinute,
        queueInvestigate: summary.render.maxQueueLength !== null
            && summary.render.maxActiveActions !== null
            && summary.render.maxQueueLength > summary.render.maxActiveActions,
        sdkPromiseInvestigate: summary.render.sdkPromiseP95Ms !== null
            && summary.render.sdkPromiseP95Ms > LONG_RUN_GATE.maxSdkPromiseP95Milliseconds,
        rasterizeInvestigate: summary.render.rasterizeP95Ms !== null
            && summary.render.rasterizeP95Ms > LONG_RUN_GATE.maxRasterizeP95Milliseconds,
        heapSlopeFail: summary.heap.heapUsedAfterGcSlopeMbPerHour !== null
            && summary.heap.heapUsedAfterGcSlopeMbPerHour > LONG_RUN_GATE.maxPostGcHeapFloorSlopeMbPerHour,
    };
}

function parseKeyValueLine(line) {
    const values = {};
    for (const match of line.matchAll(/([A-Za-z][A-Za-z0-9]*)=([^\s]+)/g)) {
        const rawValue = match[2];
        const numericValue = Number(rawValue);
        values[match[1]] = Number.isFinite(numericValue) ? numericValue : rawValue;
    }
    return values;
}

function countMatches(text, pattern) {
    return text.split(pattern).length - 1;
}

function readLogTimestampMilliseconds(line) {
    const match = /^(\d{4}-\d{2}-\d{2}T[^\s]+)/.exec(line);
    return match ? Date.parse(match[1]) : Number.NaN;
}

function computeRatePerMinute(timestamps) {
    if (timestamps.length < 2) {
        return timestamps.length === 0 ? 0 : null;
    }

    const durationMinutes = (max(timestamps) - min(timestamps)) / 60000;
    return durationMinutes <= 0 ? null : timestamps.length / durationMinutes;
}

function maxWindowRatePerMinute(timestamps, windowMilliseconds) {
    const sortedTimestamps = [...timestamps].sort((left, right) => left - right);
    if (sortedTimestamps.length === 0) {
        return 0;
    }

    let leftIndex = 0;
    let maxCount = 0;
    for (let rightIndex = 0; rightIndex < sortedTimestamps.length; rightIndex += 1) {
        while (sortedTimestamps[rightIndex] - sortedTimestamps[leftIndex] > windowMilliseconds) {
            leftIndex += 1;
        }

        maxCount = Math.max(maxCount, rightIndex - leftIndex + 1);
    }

    return maxCount / (windowMilliseconds / 60000);
}

function maxSameValueWindowRatePerMinute(events, windowMilliseconds) {
    const eventsByValue = new Map();
    for (const event of events) {
        const timestamps = eventsByValue.get(event.normalizedLine) ?? [];
        timestamps.push(event.timestamp);
        eventsByValue.set(event.normalizedLine, timestamps);
    }

    return max([...eventsByValue.values()].map(timestamps => maxWindowRatePerMinute(timestamps, windowMilliseconds)));
}

function normalizeWarningLine(line) {
    return line
        .replace(/^\d{4}-\d{2}-\d{2}T[^\s]+/, "<timestamp>")
        .replaceAll(/\bactionId=[^\s]+/g, "actionId=<id>")
        .replaceAll(/\bmetricKey=[^\s]+/g, "metricKey=<key>")
        .replaceAll(/\bpid=\d+/g, "pid=<pid>")
        .replaceAll(/\bdurationMs=[^\s]+/g, "durationMs=<n>")
        .replaceAll(/\bsustainedMs=[^\s]+/g, "sustainedMs=<n>");
}

function topValues(values, limit = 10) {
    const counts = new Map();
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
        .slice(0, limit)
        .map(([value, count]) => ({ value, count }));
}

function average(values) {
    const finiteValues = values.filter(Number.isFinite);
    return finiteValues.length === 0 ? null : finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function percentile(values, percentileValue) {
    const finiteValues = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (finiteValues.length === 0) {
        return null;
    }

    const index = Math.min(
        finiteValues.length - 1,
        Math.max(0, Math.ceil((percentileValue / 100) * finiteValues.length) - 1),
    );
    return finiteValues[index];
}

function max(values) {
    const finiteValues = values.filter(Number.isFinite);
    return finiteValues.length === 0 ? null : Math.max(...finiteValues);
}

function min(values) {
    const finiteValues = values.filter(Number.isFinite);
    return finiteValues.length === 0 ? null : Math.min(...finiteValues);
}

function slopePerHour(values, timestamps) {
    const finiteValues = values.filter(Number.isFinite);
    if (finiteValues.length < 2 || timestamps.length < 2) {
        return { bytes: null, megabytes: null };
    }

    const firstValue = finiteValues[0];
    const lastValue = finiteValues.at(-1);
    const firstTimestamp = timestamps.find(Number.isFinite);
    const lastTimestamp = timestamps.findLast(Number.isFinite);
    const durationHours = firstTimestamp === undefined || lastTimestamp === undefined
        ? 0
        : (lastTimestamp - firstTimestamp) / 3600000;
    const bytes = durationHours <= 0 ? null : (lastValue - firstValue) / durationHours;

    return {
        bytes,
        megabytes: bytes === null ? null : bytes / 1024 / 1024,
    };
}
