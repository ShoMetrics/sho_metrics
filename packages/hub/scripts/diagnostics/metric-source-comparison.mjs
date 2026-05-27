#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.resolve(scriptDirectory, "..", "..");
const hubRequire = createRequire(new URL("../../package.json", import.meta.url));
const systemInformation = hubRequire("systeminformation");

const metricNames = [
    "cpuUsagePercent",
    "cpuTemperatureCelsius",
    "ramUsedBytes",
    "ramTotalBytes",
    "networkDownloadBytesPerSecond",
    "networkUploadBytesPerSecond",
    "diskReadBytesPerSecond",
    "diskWriteBytesPerSecond",
    "diskTotalBytesPerSecond",
    "gpuUsagePercent",
    "gpuTemperatureCelsius",
    "gpuPowerWatts",
    "gpuVramUsedBytes",
    "gpuVramTotalBytes",
];

const allMetricGroups = new Set(["cpu", "ram", "network", "disk", "gpu"]);
const allSources = new Set(["node", "lhm-json", "external-probe"]);
const defaultSources = ["node"];
const defaultWarmupMilliseconds = 30000;

const options = readOptions(process.argv.slice(2));

if (options.help) {
    printUsage();
    process.exit(0);
}

const summary = await runComparison(options);
const summaryText = `${JSON.stringify(summary, null, 2)}\n`;

if (options.outputPath) {
    await mkdir(path.dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, summaryText, "utf8");
    process.stdout.write(`Wrote ${path.relative(hubRoot, options.outputPath)}\n`);
} else {
    process.stdout.write(summaryText);
}

async function runComparison(comparisonOptions) {
    const startedAt = new Date();
    const startedAtPerformanceMilliseconds = performance.now();
    const nodeSamples = [];
    const lhmJsonSamples = [];
    const externalProbeSamples = [];
    const workloadEvents = [];
    const work = [];

    if (comparisonOptions.sources.has("node")) {
        work.push(readNodeSamples({
            durationMilliseconds: comparisonOptions.durationMilliseconds,
            intervalMilliseconds: comparisonOptions.intervalMilliseconds,
            metricGroups: comparisonOptions.metricGroups,
            samples: nodeSamples,
            startedAtPerformanceMilliseconds,
        }));
    }

    if (comparisonOptions.sources.has("lhm-json")) {
        if (!comparisonOptions.lhmJsonUrl) {
            throw new Error("--lhm-json-url is required when --sources includes lhm-json.");
        }

        work.push(readLhmJsonSamples({
            durationMilliseconds: comparisonOptions.durationMilliseconds,
            intervalMilliseconds: comparisonOptions.intervalMilliseconds,
            samples: lhmJsonSamples,
            startedAtPerformanceMilliseconds,
            url: comparisonOptions.lhmJsonUrl,
        }));
    }

    if (comparisonOptions.sources.has("external-probe")) {
        if (!comparisonOptions.externalProbeExe) {
            throw new Error("--external-probe-exe is required when --sources includes external-probe.");
        }

        work.push(readExternalProbeSamples({
            args: comparisonOptions.externalProbeArgs,
            exe: comparisonOptions.externalProbeExe,
            samples: externalProbeSamples,
        }));
    }

    work.push(runWorkloads({
        events: workloadEvents,
        options: comparisonOptions,
        startedAtPerformanceMilliseconds,
    }));

    await Promise.all(work);

    return {
        measurementVersion: 2,
        capturedAt: startedAt.toISOString(),
        durationMilliseconds: comparisonOptions.durationMilliseconds,
        intervalMilliseconds: comparisonOptions.intervalMilliseconds,
        warmupMilliseconds: comparisonOptions.warmupMilliseconds,
        metricGroups: [...comparisonOptions.metricGroups].sort(),
        sources: [...comparisonOptions.sources].sort(),
        schemaNotes: {
            node: "Uses the same Node libraries and nvidia-smi shape as the hub source, but this script is a diagnostic sampler, not the production source class.",
            lhmJson: "Reads a running LHM desktop HTTP JSON cache. It measures value visibility through that cache, not LHM hardware update cost.",
            externalProbe: "Consumes optional NDJSON samples from a local probe. Output is summarized without hostnames, local paths, LAN IPs, or hardware labels.",
        },
        stress: {
            enabled: comparisonOptions.stress,
            workerCount: comparisonOptions.stress ? comparisonOptions.stressWorkers : 0,
        },
        workloads: workloadEvents,
        reaction: summarizeReaction({
            externalProbeSamples,
            lhmJsonSamples,
            nodeSamples,
            options: comparisonOptions,
            workloadEvents,
        }),
        errors: {
            node: summarizeErrors(nodeSamples),
            lhmJson: summarizeErrors(lhmJsonSamples),
            externalProbe: summarizeErrors(externalProbeSamples),
        },
        metricValues: {
            node: summarizeMetricValues(nodeSamples, sample => sample.values, comparisonOptions),
            nodeBareMemory: summarizeMetricValues(nodeSamples, sample => sample.bareMemoryValues, comparisonOptions),
            lhmJson: summarizeMetricValues(lhmJsonSamples, sample => sample.values, comparisonOptions),
            externalProbeLhmDll: summarizeMetricValues(externalProbeSamples, sample => sample.lhmDll?.Values, comparisonOptions),
            externalProbeNative: summarizeMetricValues(externalProbeSamples, sample => sample.native?.Values, comparisonOptions),
        },
        queryCosts: {
            nodeReadMilliseconds: summarizeDurationSeriesFromSamples(nodeSamples, sample => sample.readMilliseconds, comparisonOptions),
            nodeCpuReadMilliseconds: summarizeDurationSeriesFromSamples(nodeSamples, sample => sample.cpuReadMilliseconds, comparisonOptions),
            nodeRamReadMilliseconds: summarizeDurationSeriesFromSamples(nodeSamples, sample => sample.ramReadMilliseconds, comparisonOptions),
            nodeBareMemoryReadMilliseconds: summarizeDurationSeriesFromSamples(nodeSamples, sample => sample.bareMemoryReadMilliseconds, comparisonOptions),
            nodeNetworkReadMilliseconds: summarizeDurationSeriesFromSamples(nodeSamples, sample => sample.networkReadMilliseconds, comparisonOptions),
            nodeGpuReadMilliseconds: summarizeDurationSeriesFromSamples(nodeSamples, sample => sample.gpuReadMilliseconds, comparisonOptions),
            lhmJsonReadMilliseconds: summarizeDurationSeriesFromSamples(lhmJsonSamples, sample => sample.readMilliseconds, comparisonOptions),
            externalProbeLhmDllUpdateMilliseconds: summarizeDurationSeriesFromSamples(externalProbeSamples, sample => sample.lhmDll?.UpdateMilliseconds, comparisonOptions),
            externalProbeLhmDllHardwareUpdateMillisecondsByType: summarizeExternalProbeHardwareUpdates(externalProbeSamples, comparisonOptions),
            externalProbeNativeReadMilliseconds: summarizeDurationSeriesFromSamples(externalProbeSamples, sample => sample.native?.ReadMilliseconds, comparisonOptions),
            externalProbeNativeCpuReadMilliseconds: summarizeDurationSeriesFromSamples(externalProbeSamples, sample => sample.native?.CpuReadMilliseconds, comparisonOptions),
            externalProbeNativeRamReadMilliseconds: summarizeDurationSeriesFromSamples(externalProbeSamples, sample => sample.native?.RamReadMilliseconds, comparisonOptions),
            externalProbeNativeNetworkReadMilliseconds: summarizeDurationSeriesFromSamples(externalProbeSamples, sample => sample.native?.NetworkReadMilliseconds, comparisonOptions),
            externalProbeNativeDiskReadMilliseconds: summarizeDurationSeriesFromSamples(externalProbeSamples, sample => sample.native?.DiskReadMilliseconds, comparisonOptions),
        },
    };
}

async function readNodeSamples(options) {
    const endAtPerformanceMilliseconds = options.startedAtPerformanceMilliseconds + options.durationMilliseconds;
    let nextTickAtPerformanceMilliseconds = options.startedAtPerformanceMilliseconds;
    let sampleIndex = 0;
    let previousNetworkStatsByInterface = new Map();

    while (performance.now() < endAtPerformanceMilliseconds) {
        const tickStartedAtPerformanceMilliseconds = performance.now();
        const values = {};
        let bareMemoryValues;
        let cpuReadMilliseconds;
        let ramReadMilliseconds;
        let bareMemoryReadMilliseconds;
        let networkReadMilliseconds;
        let gpuReadMilliseconds;

        if (options.metricGroups.has("cpu")) {
            const cpuStartedAt = performance.now();
            const cpu = await systemInformation.currentLoad();
            cpuReadMilliseconds = performance.now() - cpuStartedAt;
            values.cpuUsagePercent = round(cpu.currentLoad);
        }

        if (options.metricGroups.has("ram")) {
            const bareMemoryStartedAt = performance.now();
            const totalMemoryBytes = os.totalmem();
            bareMemoryValues = {
                ramUsedBytes: totalMemoryBytes - os.freemem(),
                ramTotalBytes: totalMemoryBytes,
            };
            bareMemoryReadMilliseconds = performance.now() - bareMemoryStartedAt;

            const ramStartedAt = performance.now();
            const memory = await systemInformation.mem();
            ramReadMilliseconds = performance.now() - ramStartedAt;
            values.ramUsedBytes = memory.used;
            values.ramTotalBytes = memory.total;
        }

        if (options.metricGroups.has("network")) {
            const networkStartedAt = performance.now();
            const networkStats = await systemInformation.networkStats();
            const networkReadResult = readNodeNetworkRates(networkStats, previousNetworkStatsByInterface);
            previousNetworkStatsByInterface = networkReadResult.currentStatsByInterface;
            networkReadMilliseconds = performance.now() - networkStartedAt;
            values.networkDownloadBytesPerSecond = networkReadResult.downloadBytesPerSecond;
            values.networkUploadBytesPerSecond = networkReadResult.uploadBytesPerSecond;
        }

        if (options.metricGroups.has("disk") && process.platform !== "win32") {
            const diskStartedAt = performance.now();
            const diskStats = await systemInformation.fsStats();
            values.diskReadBytesPerSecond = normalizeNullableRate(diskStats?.rx_sec);
            values.diskWriteBytesPerSecond = normalizeNullableRate(diskStats?.wx_sec);
            values.diskTotalBytesPerSecond = normalizeNullableRate(diskStats?.tx_sec);
            values.diskReadMilliseconds = performance.now() - diskStartedAt;
        }

        if (options.metricGroups.has("gpu")) {
            const gpuStartedAt = performance.now();
            const gpu = await readNodeGpu();
            gpuReadMilliseconds = performance.now() - gpuStartedAt;
            Object.assign(values, gpu);
        }

        options.samples.push({
            sampleIndex,
            elapsedMilliseconds: Math.round(tickStartedAtPerformanceMilliseconds - options.startedAtPerformanceMilliseconds),
            values,
            bareMemoryValues,
            readMilliseconds: round(performance.now() - tickStartedAtPerformanceMilliseconds),
            cpuReadMilliseconds: roundOptional(cpuReadMilliseconds),
            ramReadMilliseconds: roundOptional(ramReadMilliseconds),
            bareMemoryReadMilliseconds: roundOptional(bareMemoryReadMilliseconds),
            networkReadMilliseconds: roundOptional(networkReadMilliseconds),
            gpuReadMilliseconds: roundOptional(gpuReadMilliseconds),
        });

        sampleIndex += 1;
        nextTickAtPerformanceMilliseconds += options.intervalMilliseconds;
        await delay(Math.max(0, nextTickAtPerformanceMilliseconds - performance.now()));
    }
}

function readNodeNetworkRates(networkStats, previousStatsByInterface) {
    const currentStatsByInterface = new Map();
    let downloadBytesPerSecond = 0;
    let uploadBytesPerSecond = 0;
    const capturedAtMilliseconds = Date.now();

    for (const stats of networkStats) {
        currentStatsByInterface.set(stats.iface, {
            receivedBytes: stats.rx_bytes,
            sentBytes: stats.tx_bytes,
            capturedAtMilliseconds,
        });

        downloadBytesPerSecond += readRate({
            currentBytes: stats.rx_bytes,
            currentRate: stats.rx_sec,
            previousSample: previousStatsByInterface.get(stats.iface),
            previousField: "receivedBytes",
            capturedAtMilliseconds,
        });
        uploadBytesPerSecond += readRate({
            currentBytes: stats.tx_bytes,
            currentRate: stats.tx_sec,
            previousSample: previousStatsByInterface.get(stats.iface),
            previousField: "sentBytes",
            capturedAtMilliseconds,
        });
    }

    return {
        currentStatsByInterface,
        downloadBytesPerSecond,
        uploadBytesPerSecond,
    };
}

function readRate(options) {
    if (typeof options.currentRate === "number" && Number.isFinite(options.currentRate)) {
        return Math.max(0, options.currentRate);
    }

    if (!options.previousSample) {
        return 0;
    }

    const previousValue = options.previousSample[options.previousField];
    if (options.currentBytes < previousValue) {
        return 0;
    }

    const elapsedSeconds = Math.max(
        0.001,
        (options.capturedAtMilliseconds - options.previousSample.capturedAtMilliseconds) / 1000,
    );

    return (options.currentBytes - previousValue) / elapsedSeconds;
}

async function readNodeGpu() {
    const output = await execFileText("nvidia-smi", [
        "--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw",
        "--format=csv,noheader,nounits",
    ], 3000).catch(() => undefined);

    if (!output) {
        return {};
    }

    const firstLine = output.split(/\r?\n/u).map(line => line.trim()).find(Boolean);
    if (!firstLine) {
        return {};
    }

    const fields = firstLine.split(",").map(field => field.trim());

    return {
        gpuUsagePercent: parseFiniteNumber(fields[0]),
        gpuTemperatureCelsius: parseFiniteNumber(fields[1]),
        gpuVramUsedBytes: multiplyNullable(parseFiniteNumber(fields[2]), 1024 * 1024),
        gpuVramTotalBytes: multiplyNullable(parseFiniteNumber(fields[3]), 1024 * 1024),
        gpuPowerWatts: parseFiniteNumber(fields[4]),
    };
}

function execFileText(file, args, timeoutMilliseconds) {
    return new Promise((resolve, reject) => {
        execFile(file, args, {
            timeout: timeoutMilliseconds,
            windowsHide: true,
            maxBuffer: 64 * 1024,
        }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(stdout);
        });
    });
}

async function readLhmJsonSamples(options) {
    const endAtPerformanceMilliseconds = options.startedAtPerformanceMilliseconds + options.durationMilliseconds;
    let nextTickAtPerformanceMilliseconds = options.startedAtPerformanceMilliseconds;
    let sampleIndex = 0;

    while (performance.now() < endAtPerformanceMilliseconds) {
        const tickStartedAtPerformanceMilliseconds = performance.now();
        let values;
        let error;

        try {
            const response = await fetch(options.url, { signal: AbortSignal.timeout(5000) });
            values = readLhmJsonValues(await response.json());
        } catch (caughtError) {
            error = String(caughtError);
        }

        options.samples.push({
            sampleIndex,
            elapsedMilliseconds: Math.round(tickStartedAtPerformanceMilliseconds - options.startedAtPerformanceMilliseconds),
            values,
            readMilliseconds: round(performance.now() - tickStartedAtPerformanceMilliseconds),
            error,
        });

        sampleIndex += 1;
        nextTickAtPerformanceMilliseconds += options.intervalMilliseconds;
        await delay(Math.max(0, nextTickAtPerformanceMilliseconds - performance.now()));
    }
}

function readLhmJsonValues(root) {
    const nodes = [];
    flattenLhmJsonNodes(root, nodes);

    const ramUsed = findNodeValue(nodes, node => isSensor(node, "/ram/data/0", "Memory Used", "Data"));
    const ramAvailable = findNodeValue(nodes, node => isSensor(node, "/ram/data/1", "Memory Available", "Data"));
    const diskReadBytesPerSecond = sumNodeValues(nodes, node => node.Type === "Throughput" && node.Text === "Read Rate");
    const diskWriteBytesPerSecond = sumNodeValues(nodes, node => node.Type === "Throughput" && node.Text === "Write Rate");
    const nvidiaNodes = nodes.filter(node => String(node.SensorId ?? "").startsWith("/gpu-nvidia/"));
    const gpuNodes = nvidiaNodes.length > 0
        ? nvidiaNodes
        : nodes.filter(node => String(node.SensorId ?? "").startsWith("/gpu-"));

    return {
        cpuUsagePercent: findNodeValue(nodes, node => isSensor(node, undefined, "CPU Total", "Load")),
        cpuTemperatureCelsius: findNodeValue(nodes, node => isCpuTemperatureNode(node)),
        ramUsedBytes: ramUsed,
        ramTotalBytes: sumNullable(ramUsed, ramAvailable),
        networkDownloadBytesPerSecond: sumNodeValues(nodes, node => node.Type === "Throughput" && node.Text === "Download Speed"),
        networkUploadBytesPerSecond: sumNodeValues(nodes, node => node.Type === "Throughput" && node.Text === "Upload Speed"),
        diskReadBytesPerSecond,
        diskWriteBytesPerSecond,
        diskTotalBytesPerSecond: sumNullable(diskReadBytesPerSecond, diskWriteBytesPerSecond),
        gpuUsagePercent: findNodeValue(gpuNodes, node => node.Text === "GPU Core" && node.Type === "Load"),
        gpuTemperatureCelsius: findNodeValue(gpuNodes, node => node.Text === "GPU Core" && node.Type === "Temperature"),
        gpuPowerWatts: findNodeValue(gpuNodes, node => (node.Text === "GPU Package" || node.Text === "GPU Power") && node.Type === "Power"),
        gpuVramUsedBytes: findNodeValue(gpuNodes, node => node.Text === "GPU Memory Used" && node.Type === "SmallData"),
        gpuVramTotalBytes: findNodeValue(gpuNodes, node => node.Text === "GPU Memory Total" && node.Type === "SmallData"),
    };
}

function flattenLhmJsonNodes(node, nodes) {
    if (!node) {
        return;
    }

    if (node.SensorId || node.Type || node.RawValue != null) {
        nodes.push(node);
    }

    for (const child of node.Children ?? []) {
        flattenLhmJsonNodes(child, nodes);
    }
}

function isSensor(node, sensorId, text, type) {
    return (sensorId === undefined || node.SensorId === sensorId)
        && node.Text === text
        && node.Type === type;
}

function isCpuTemperatureNode(node) {
    const sensorId = String(node.SensorId ?? "");
    return sensorId.includes("cpu")
        && node.Type === "Temperature"
        && (
            node.Text === "CPU Package"
            || node.Text.includes("Package")
            || node.Text.includes("Tctl")
            || node.Text.includes("Tdie")
        );
}

function findNodeValue(nodes, predicate) {
    const node = nodes.find(predicate);
    return node ? parseLhmRawValue(node.RawValue ?? node.Value) : undefined;
}

function sumNodeValues(nodes, predicate) {
    let total = 0;
    let hasValue = false;

    for (const node of nodes) {
        if (!predicate(node)) {
            continue;
        }

        const value = parseLhmRawValue(node.RawValue ?? node.Value);
        if (typeof value === "number") {
            total += value;
            hasValue = true;
        }
    }

    return hasValue ? total : undefined;
}

function parseLhmRawValue(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return undefined;
    }

    const text = String(rawValue).trim();
    const match = /^(-?\d+(?:\.\d+)?)\s*([A-Za-z°/%]+(?:\/s)?)?/u.exec(text);
    if (!match) {
        return undefined;
    }

    const value = Number.parseFloat(match[1]);
    if (!Number.isFinite(value)) {
        return undefined;
    }

    const unit = (match[2] ?? "").toLowerCase();

    if (unit === "gb") {
        return value * 1024 * 1024 * 1024;
    }

    if (unit === "mb") {
        return value * 1024 * 1024;
    }

    if (unit === "kb/s") {
        return value * 1024;
    }

    if (unit === "mb/s") {
        return value * 1024 * 1024;
    }

    if (unit === "gb/s") {
        return value * 1024 * 1024 * 1024;
    }

    return value;
}

function readExternalProbeSamples(options) {
    return new Promise((resolve, reject) => {
        const childProcess = spawn(options.exe, options.args, {
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });
        const samples = options.samples;
        let pendingOutput = "";
        let errorOutput = "";

        childProcess.stdout.setEncoding("utf8");
        childProcess.stderr.setEncoding("utf8");

        childProcess.stdout.on("data", chunk => {
            pendingOutput += chunk;
            const lines = pendingOutput.split(/\r?\n/u);
            pendingOutput = lines.pop() ?? "";

            for (const line of lines) {
                readExternalProbeLine(line, samples);
            }
        });
        childProcess.stderr.on("data", chunk => {
            errorOutput += chunk;
        });
        childProcess.once("error", reject);
        childProcess.once("exit", exitCode => {
            if (pendingOutput.trim().length > 0) {
                readExternalProbeLine(pendingOutput, samples);
            }

            if (exitCode !== 0) {
                reject(new Error(`External probe exited with code ${exitCode}: ${errorOutput.trim()}`));
                return;
            }

            resolve();
        });
    });
}

function readExternalProbeLine(line, samples) {
    if (line.trim().length === 0) {
        return;
    }

    const item = JSON.parse(line);
    if (item.event === "sample") {
        samples.push(item);
    }
}

function summarizeErrors(samples) {
    const countsByError = new Map();

    for (const sample of samples) {
        if (!sample.error) {
            continue;
        }

        const error = sanitizeErrorText(sample.error);
        countsByError.set(error, (countsByError.get(error) ?? 0) + 1);
    }

    return Object.fromEntries(
        [...countsByError.entries()]
            .sort(([, firstCount], [, secondCount]) => secondCount - firstCount)
            .slice(0, 5),
    );
}

function sanitizeErrorText(error) {
    return String(error)
        .replace(/[A-Z]:\\[^\s"]+/giu, "<local-path>")
        .replace(/https?:\/\/[^\s"]+/giu, "<url>")
        .slice(0, 240);
}

function summarizeMetricValues(samples, readValues, options) {
    const summary = {};

    for (const metricName of metricNames) {
        const metricSummary = summarizeValueSeriesFromSamples(
            samples,
            sample => readMetricValue(readValues(sample), metricName),
            options,
        );

        if (metricSummary.count > 0) {
            summary[metricName] = metricSummary;
        }
    }

    return summary;
}

function readMetricValue(values, metricName) {
    if (!values) {
        return undefined;
    }

    return values[metricName] ?? values[capitalize(metricName)];
}

function summarizeExternalProbeHardwareUpdates(samples, options) {
    const valuesByHardwareType = new Map();

    for (const sample of samples) {
        for (const hardwareUpdate of sample.lhmDll?.HardwareUpdates ?? []) {
            const hardwareType = String(hardwareUpdate.HardwareType ?? "unknown");
            const updateValues = valuesByHardwareType.get(hardwareType) ?? [];
            const updateMilliseconds = Number(hardwareUpdate.UpdateMilliseconds);

            if (Number.isFinite(updateMilliseconds)) {
                updateValues.push(updateMilliseconds);
                valuesByHardwareType.set(hardwareType, updateValues);
            }
        }
    }

    return Object.fromEntries(
        [...valuesByHardwareType.entries()]
            .sort(([firstType], [secondType]) => firstType.localeCompare(secondType))
            .map(([hardwareType, values]) => [hardwareType, summarizeDurationSeries(values, options)]),
    );
}

function summarizeReaction(options) {
    if (!options.options.reactionMetricName || options.options.reactionThreshold === undefined) {
        return undefined;
    }

    const workloadStartMilliseconds = options.workloadEvents[0]?.startElapsedMilliseconds;
    if (workloadStartMilliseconds === undefined) {
        return {
            metricName: options.options.reactionMetricName,
            threshold: options.options.reactionThreshold,
            error: "No workload event was recorded.",
        };
    }

    return {
        metricName: options.options.reactionMetricName,
        threshold: options.options.reactionThreshold,
        workloadStartMilliseconds,
        sources: {
            node: summarizeReactionSource(
                options.nodeSamples,
                sample => sample.values,
                options.options.reactionMetricName,
                options.options.reactionThreshold,
                workloadStartMilliseconds,
            ),
            nodeBareMemory: summarizeReactionSource(
                options.nodeSamples,
                sample => sample.bareMemoryValues,
                options.options.reactionMetricName,
                options.options.reactionThreshold,
                workloadStartMilliseconds,
            ),
            lhmJson: summarizeReactionSource(
                options.lhmJsonSamples,
                sample => sample.values,
                options.options.reactionMetricName,
                options.options.reactionThreshold,
                workloadStartMilliseconds,
            ),
            externalProbeLhmDll: summarizeReactionSource(
                options.externalProbeSamples,
                sample => sample.lhmDll?.Values,
                options.options.reactionMetricName,
                options.options.reactionThreshold,
                workloadStartMilliseconds,
            ),
            externalProbeNative: summarizeReactionSource(
                options.externalProbeSamples,
                sample => sample.native?.Values,
                options.options.reactionMetricName,
                options.options.reactionThreshold,
                workloadStartMilliseconds,
            ),
        },
    };
}

function summarizeReactionSource(samples, readValues, metricName, threshold, workloadStartMilliseconds) {
    const candidate = samples
        .map(sample => ({
            elapsedMilliseconds: sample.elapsedMilliseconds,
            value: readMetricValue(readValues(sample), metricName),
        }))
        .find(sample => (
            sample.elapsedMilliseconds >= workloadStartMilliseconds
            && typeof sample.value === "number"
            && Number.isFinite(sample.value)
            && sample.value >= threshold
        ));

    if (!candidate) {
        return {
            reached: false,
        };
    }

    return {
        reached: true,
        firstThresholdMilliseconds: candidate.elapsedMilliseconds,
        deltaMilliseconds: round(candidate.elapsedMilliseconds - workloadStartMilliseconds),
        value: candidate.value,
    };
}

function summarizeValueSeriesFromSamples(samples, readValue, options) {
    return summarizeSeriesFromSamples(samples, readValue, options, summarizeValueSeries);
}

function summarizeDurationSeriesFromSamples(samples, readValue, options) {
    return summarizeSeriesFromSamples(samples, readValue, options, summarizeDurationSeries);
}

function summarizeSeriesFromSamples(samples, readValue, options, summarizeValues) {
    const samplesWithValue = samples
        .map(sample => ({
            elapsedMilliseconds: sample.elapsedMilliseconds,
            value: readValue(sample),
            hasError: Boolean(sample.error),
        }));
    const finiteSamples = samplesWithValue
        .filter(sample => typeof sample.value === "number" && Number.isFinite(sample.value));
    const warmupSamples = finiteSamples
        .filter(sample => sample.elapsedMilliseconds < options.warmupMilliseconds);
    const steadyStateSamples = finiteSamples
        .filter(sample => sample.elapsedMilliseconds >= options.warmupMilliseconds);

    return {
        totalSampleCount: samples.length,
        errorCount: samplesWithValue.filter(sample => sample.hasError).length,
        noDataCount: samplesWithValue.filter(sample => typeof sample.value !== "number" || !Number.isFinite(sample.value)).length,
        nonZeroCount: finiteSamples.filter(sample => sample.value !== 0).length,
        ...summarizeValues(finiteSamples.map(sample => sample.value), options),
        warmup: summarizeValues(warmupSamples.map(sample => sample.value), options),
        steadyState: summarizeValues(steadyStateSamples.map(sample => sample.value), options),
        firstSampleMilliseconds: finiteSamples[0]?.elapsedMilliseconds,
        firstAtLeast50Milliseconds: firstThresholdMilliseconds(finiteSamples, 50),
        firstAtLeast80Milliseconds: firstThresholdMilliseconds(finiteSamples, 80),
        firstAtLeast99Milliseconds: firstThresholdMilliseconds(finiteSamples, 99),
    };
}

function summarizeValueSeries(values) {
    return summarizeSeries(values, {});
}

function summarizeDurationSeries(values, options) {
    return summarizeSeries(values, {
        above500Count: value => value > 500,
        above1000Count: value => value > 1000,
        aboveIntervalCount: value => value > options.intervalMilliseconds,
    });
}

function summarizeSeries(values, counters) {
    const sortedValues = values
        .filter(value => typeof value === "number" && Number.isFinite(value))
        .sort((first, second) => first - second);

    if (sortedValues.length === 0) {
        return {
            count: 0,
        };
    }

    return {
        count: sortedValues.length,
        min: round(sortedValues[0]),
        p50: round(percentile(sortedValues, 0.5)),
        p95: round(percentile(sortedValues, 0.95)),
        p99: round(percentile(sortedValues, 0.99)),
        max: round(sortedValues[sortedValues.length - 1]),
        ...Object.fromEntries(
            Object.entries(counters)
                .map(([counterName, predicate]) => [
                    counterName,
                    sortedValues.filter(predicate).length,
                ]),
        ),
    };
}

function firstThresholdMilliseconds(samples, threshold) {
    return samples.find(candidate => candidate.value >= threshold)?.elapsedMilliseconds;
}

function percentile(sortedValues, percentileValue) {
    const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1),
    );

    return sortedValues[index];
}

function capitalize(value) {
    return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function normalizeNullableRate(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function multiplyNullable(value, multiplier) {
    return typeof value === "number" ? value * multiplier : undefined;
}

function sumNullable(firstValue, secondValue) {
    return firstValue === undefined && secondValue === undefined
        ? undefined
        : (firstValue ?? 0) + (secondValue ?? 0);
}

function parseFiniteNumber(value) {
    if (value === undefined || String(value).toUpperCase() === "N/A") {
        return undefined;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

async function runWorkloads({ events, options, startedAtPerformanceMilliseconds }) {
    if (!options.stress && !options.workloadExe) {
        return;
    }

    await delay(Math.max(0, options.workloadStartMilliseconds));

    if (options.stress) {
        events.push({
            kind: "cpu-stress",
            startElapsedMilliseconds: round(performance.now() - startedAtPerformanceMilliseconds),
            durationMilliseconds: options.stressDurationMilliseconds,
            workerCount: options.stressWorkers,
        });

        const workers = startStressWorkers(options.stressDurationMilliseconds, options.stressWorkers);
        try {
            await delay(options.stressDurationMilliseconds);
        } finally {
            for (const worker of workers) {
                await worker.terminate();
            }
        }
    }

    if (options.workloadExe) {
        const workloadStartedAtPerformanceMilliseconds = performance.now();
        const event = {
            kind: "external",
            startElapsedMilliseconds: round(workloadStartedAtPerformanceMilliseconds - startedAtPerformanceMilliseconds),
            timedOut: false,
        };
        events.push(event);
        await runExternalWorkload(options, event, workloadStartedAtPerformanceMilliseconds);
    }
}

function runExternalWorkload(options, event, workloadStartedAtPerformanceMilliseconds) {
    return new Promise(resolve => {
        const childProcess = spawn(options.workloadExe, options.workloadArgs, {
            stdio: ["ignore", "ignore", "ignore"],
            windowsHide: true,
        });
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) {
                return;
            }

            event.timedOut = true;
            childProcess.kill();
        }, options.workloadTimeoutMilliseconds);

        childProcess.once("error", error => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timeout);
            event.error = sanitizeErrorText(error.message);
            event.durationMilliseconds = round(performance.now() - workloadStartedAtPerformanceMilliseconds);
            resolve();
        });

        childProcess.once("exit", exitCode => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timeout);
            event.exitCode = exitCode;
            event.durationMilliseconds = round(performance.now() - workloadStartedAtPerformanceMilliseconds);
            resolve();
        });
    });
}

function startStressWorkers(durationMilliseconds, workerCount) {
    const workers = [];
    const workerSource = `
        const { workerData } = require("node:worker_threads");
        const endAt = Date.now() + workerData.durationMilliseconds;
        let value = 0;
        while (Date.now() < endAt) {
            value = Math.sqrt(value + Math.random());
        }
    `;

    for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
        workers.push(new Worker(workerSource, {
            eval: true,
            workerData: { durationMilliseconds },
        }));
    }

    return workers;
}

function readOptions(args) {
    const values = readArgumentMap(args);
    const sources = readSetOption(values, "sources", defaultSources);
    const metricGroups = readSetOption(values, "metrics", [...allMetricGroups]);

    for (const metricGroup of metricGroups) {
        if (!allMetricGroups.has(metricGroup)) {
            throw new Error(`Unknown metric group: ${metricGroup}`);
        }
    }

    for (const source of sources) {
        if (!allSources.has(source)) {
            throw new Error(`Unknown source: ${source}`);
        }
    }

    return {
        durationMilliseconds: readInteger(values, "duration-ms", 30000),
        externalProbeArgs: readListOption(values, "external-probe-args", []),
        externalProbeExe: values.get("external-probe-exe"),
        help: values.has("help"),
        intervalMilliseconds: readInteger(values, "interval-ms", 1000),
        lhmJsonUrl: values.get("lhm-json-url"),
        metricGroups,
        outputPath: values.has("out") ? path.resolve(values.get("out")) : undefined,
        reactionMetricName: values.get("reaction-metric"),
        reactionThreshold: readOptionalNumber(values, "reaction-threshold"),
        sources,
        stress: values.has("stress"),
        stressDurationMilliseconds: readInteger(values, "stress-duration-ms", readInteger(values, "duration-ms", 30000)),
        stressWorkers: readInteger(values, "stress-workers", Math.max(1, os.cpus().length - 1)),
        warmupMilliseconds: readNonNegativeInteger(values, "warmup-ms", defaultWarmupMilliseconds),
        workloadArgs: readListOption(values, "workload-args", []),
        workloadExe: values.get("workload-exe"),
        workloadStartMilliseconds: readNonNegativeInteger(values, "workload-start-ms", 5000),
        workloadTimeoutMilliseconds: readInteger(values, "workload-timeout-ms", readInteger(values, "duration-ms", 30000)),
    };
}

function readArgumentMap(args) {
    const values = new Map();

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];

        if (!argument.startsWith("--")) {
            continue;
        }

        const equalsIndex = argument.indexOf("=");
        if (equalsIndex >= 0) {
            values.set(argument.slice(2, equalsIndex), argument.slice(equalsIndex + 1));
            continue;
        }

        const key = argument.slice(2);
        const nextArgument = args[index + 1];

        if (!nextArgument || nextArgument.startsWith("--")) {
            values.set(key, "true");
            continue;
        }

        values.set(key, nextArgument);
        index += 1;
    }

    return values;
}

function readSetOption(values, key, fallback) {
    return new Set(readListOption(values, key, fallback));
}

function readListOption(values, key, fallback) {
    const value = values.get(key);

    if (!value) {
        return fallback;
    }

    return value
        .split(",")
        .map(item => item.trim())
        .filter(item => item.length > 0);
}

function readInteger(values, key, fallback) {
    const value = Number.parseInt(values.get(key) ?? "", 10);

    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readNonNegativeInteger(values, key, fallback) {
    const value = Number.parseInt(values.get(key) ?? "", 10);

    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readOptionalNumber(values, key) {
    if (!values.has(key)) {
        return undefined;
    }

    const value = Number(values.get(key));
    if (!Number.isFinite(value)) {
        throw new Error(`--${key} must be a finite number.`);
    }

    return value;
}

function roundOptional(value) {
    return typeof value === "number" && Number.isFinite(value) ? round(value) : undefined;
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}

function printUsage() {
    process.stdout.write(`Usage:
  node scripts/diagnostics/metric-source-comparison.mjs [options]

Sources:
  --sources=node
  --sources=node,lhm-json
  --sources=node,external-probe
  --sources=node,lhm-json,external-probe

Options:
  --metrics=cpu,ram,network,disk,gpu
  --duration-ms=30000
  --interval-ms=1000
  --warmup-ms=30000
  --lhm-json-url=http://127.0.0.1:8085/data.json
  --external-probe-exe=C:\\path\\to\\probe.exe
  --external-probe-args=--metric-source-probe
  --workload-start-ms=5000
  --workload-exe=C:\\path\\to\\workload.exe
  --workload-args=arg1,arg2
  --workload-timeout-ms=30000
  --reaction-metric=cpuUsagePercent --reaction-threshold=80
  --out=docs/development/perf-logs/source-comparison.json
  --stress --stress-workers=8 --stress-duration-ms=30000

The script does not persist local URLs, hostnames, local paths, or hardware labels in the summary.
`);
}
