import { execFile, type ExecFileException } from "node:child_process";
import { logger } from "../../../logging/node-logger";
import { monotonicNowMilliseconds } from "../../../shared/clock";
import { normalizeNonEmptyText } from "./node-system-cpu";
import type { NodeSystemGpuTelemetryData, NodeSystemInformationClient } from "./node-system-source-types";

const gpuLog = logger.for("Source:NodeSystem:GPU");

let lastNvidiaSmiFailureLogMonotonicMilliseconds = 0;
let nextGpuPollDebugSequence = 1;
let nextNvidiaSmiQueryDebugSequence = 1;
let activeNvidiaSmiQueryCount = 0;
let nvidiaSmiMissingRetryAfterMonotonicMilliseconds = 0;

const NVIDIA_SMI_QUERY_FIELDS = [
    "utilization.gpu",
    "name",
    "temperature.gpu",
    "memory.used",
    "memory.total",
    "power.draw",
    "power.limit",
] as const;

const NVIDIA_SMI_ARGUMENTS = [
    `--query-gpu=${NVIDIA_SMI_QUERY_FIELDS.join(",")}`,
    "--format=csv,noheader,nounits",
] as const;

const NVIDIA_SMI_TIMEOUT_MS = 3000;
const NVIDIA_SMI_FAILURE_LOG_INTERVAL_MS = 30000;
const NVIDIA_SMI_MISSING_RETRY_INTERVAL_MS = 60 * 60 * 1000;
// Do not add `-k PerformanceStatistics`: on Apple Silicon it can return zeroed
// utilization counters while the unfiltered IOAccelerator object has live values.
const IOREG_ARGUMENTS = ["-r", "-c", "IOAccelerator", "-d", "1", "-w", "0"] as const;
const IOREG_TIMEOUT_MS = 1000;
const IOREG_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const IOREG_FAILURE_LOG_INTERVAL_MS = 30000;
const IOREG_TELEMETRY_DEBUG_LOG_INTERVAL_MS = 5000;

let lastIoregFailureLogMonotonicMilliseconds = 0;

export function reserveNodeSystemGpuPollDebugSequence(): number {
    return nextGpuPollDebugSequence++;
}

export function getActiveNvidiaSmiQueryCount(): number {
    return activeNvidiaSmiQueryCount;
}

export async function pollWindowsNvidiaGpuTelemetry(): Promise<NodeSystemGpuTelemetryData | null> {
    const output = await runNvidiaSmiTelemetryQuery();

    if (!output) {
        gpuLog.debug("nvidiaSmiEmptyOutput");
        return null;
    }

    const firstGpuLine = output
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(line => line.length > 0);

    if (!firstGpuLine) {
        gpuLog.debug("nvidiaSmiNoDataLine");
        return null;
    }

    const gpuData = parseNvidiaSmiTelemetryLine(firstGpuLine);

    if (!gpuData) {
        gpuLog.debug(() => [
            "nvidiaSmiNoParsedFields",
            `raw=${firstGpuLine}`,
        ].join(" "));
        return null;
    }

    return gpuData;
}

export async function pollDarwinIoAcceleratorGpuTelemetry(): Promise<NodeSystemGpuTelemetryData | null> {
    const output = await runIoregIoAcceleratorQuery();

    if (!output) {
        gpuLog.debug("ioregEmptyOutput");
        return null;
    }

    const statisticGroups = readIoAcceleratorPerformanceStatisticGroups(output);
    const telemetryData = parseIoAcceleratorPerformanceStatisticsFromGroups(statisticGroups);

    logIoAcceleratorTelemetryDebug(statisticGroups, telemetryData);

    return telemetryData;
}

export async function pollSystemInformationGpuTelemetry(
    systemInformation: NodeSystemInformationClient,
): Promise<NodeSystemGpuTelemetryData | null> {
    const graphicsData = await systemInformation.graphics();
    const nvidiaController = graphicsData.controllers.find(graphicsController =>
        graphicsController.vendor.toLowerCase().includes("nvidia") &&
        (typeof graphicsController.utilizationGpu === "number" || typeof graphicsController.temperatureGpu === "number")
    );

    if (!nvidiaController) {
        return null;
    }

    return {
        utilizationGpu: nvidiaController.utilizationGpu,
        modelText: normalizeNonEmptyText(nvidiaController.model),
        temperatureGpu: nvidiaController.temperatureGpu,
        memoryUsed: nvidiaController.memoryUsed,
        memoryTotal: nvidiaController.memoryTotal,
        powerDraw: nvidiaController.powerDraw,
        powerLimit: nvidiaController.powerLimit,
    };
}

function runIoregIoAcceleratorQuery(): Promise<string | null> {
    return new Promise(resolve => {
        const queryStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();

        execFile(
            "ioreg",
            [...IOREG_ARGUMENTS],
            {
                timeout: IOREG_TIMEOUT_MS,
                maxBuffer: IOREG_MAX_BUFFER_BYTES,
            },
            (error: ExecFileException | null, stdout: string) => {
                if (error) {
                    logIoregFailure(error, monotonicNowMilliseconds() - queryStartedAtMonotonicMilliseconds);
                    resolve(null);
                    return;
                }

                resolve(stdout);
            },
        );
    });
}

function runNvidiaSmiTelemetryQuery(): Promise<string | null> {
    const currentMonotonicMilliseconds = monotonicNowMilliseconds();
    if (currentMonotonicMilliseconds < nvidiaSmiMissingRetryAfterMonotonicMilliseconds) {
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        const queryStartedAtMonotonicMilliseconds = currentMonotonicMilliseconds;
        const querySequence = nextNvidiaSmiQueryDebugSequence++;
        activeNvidiaSmiQueryCount += 1;
        gpuLog.debug(() => [
            "nvidiaSmiStart",
            `queryId=${querySequence}`,
            `timeoutMs=${NVIDIA_SMI_TIMEOUT_MS}`,
            `activeNvidiaSmiQueries=${activeNvidiaSmiQueryCount}`,
        ].join(" "));

        execFile(
            "nvidia-smi",
            [...NVIDIA_SMI_ARGUMENTS],
            {
                timeout: NVIDIA_SMI_TIMEOUT_MS,
                windowsHide: true,
                maxBuffer: 32 * 1024,
            },
            (error: ExecFileException | null, stdout: string) => {
                const elapsedMilliseconds = monotonicNowMilliseconds() - queryStartedAtMonotonicMilliseconds;
                activeNvidiaSmiQueryCount = Math.max(0, activeNvidiaSmiQueryCount - 1);

                if (error) {
                    if (isNvidiaSmiExecutableMissing(error)) {
                        nvidiaSmiMissingRetryAfterMonotonicMilliseconds =
                            monotonicNowMilliseconds() + NVIDIA_SMI_MISSING_RETRY_INTERVAL_MS;
                        gpuLog.info(() => [
                            "nvidiaSmiNotInstalled",
                            `queryId=${querySequence}`,
                            `elapsedMs=${elapsedMilliseconds}`,
                            `retryMs=${NVIDIA_SMI_MISSING_RETRY_INTERVAL_MS}`,
                            `code=${String(error.code ?? "unknown")}`,
                        ].join(" "));
                        resolve(null);
                        return;
                    }

                    logNvidiaSmiFailure({
                        error,
                        elapsedMilliseconds,
                        querySequence,
                    });
                    resolve(null);
                    return;
                }

                gpuLog.debug(() => [
                    elapsedMilliseconds > 250 ? "nvidiaSmiSlowSuccess" : "nvidiaSmiSuccess",
                    `queryId=${querySequence}`,
                    `elapsedMs=${elapsedMilliseconds}`,
                    `timeoutMs=${NVIDIA_SMI_TIMEOUT_MS}`,
                    `timerDelayMs=${Math.max(0, elapsedMilliseconds - NVIDIA_SMI_TIMEOUT_MS)}`,
                    `stdoutBytes=${stdout.length}`,
                    `activeNvidiaSmiQueries=${activeNvidiaSmiQueryCount}`,
                ].join(" "));

                resolve(stdout);
            },
        );
    });
}

function isNvidiaSmiExecutableMissing(error: ExecFileException): boolean {
    return error.code === "ENOENT";
}

function logIoregFailure(error: ExecFileException, elapsedMilliseconds: number): void {
    const currentMonotonicMilliseconds = monotonicNowMilliseconds();

    if (
        currentMonotonicMilliseconds - lastIoregFailureLogMonotonicMilliseconds
        < IOREG_FAILURE_LOG_INTERVAL_MS
    ) {
        return;
    }

    lastIoregFailureLogMonotonicMilliseconds = currentMonotonicMilliseconds;
    gpuLog.warn(() => [
        "ioreg IOAccelerator GPU telemetry query failed",
        `elapsedMs=${elapsedMilliseconds}`,
        `timeoutMs=${IOREG_TIMEOUT_MS}`,
        `code=${String(error.code ?? "unknown")}`,
        `signal=${String(error.signal ?? "none")}`,
        `message=${error.message}`,
    ].join(" "));
}

function logNvidiaSmiFailure(options: {
    error: ExecFileException;
    elapsedMilliseconds: number;
    querySequence: number;
}): void {
    const currentMonotonicMilliseconds = monotonicNowMilliseconds();

    if (
        currentMonotonicMilliseconds - lastNvidiaSmiFailureLogMonotonicMilliseconds
        < NVIDIA_SMI_FAILURE_LOG_INTERVAL_MS
    ) {
        return;
    }

    lastNvidiaSmiFailureLogMonotonicMilliseconds = currentMonotonicMilliseconds;
    gpuLog.warn(() => [
        "nvidia-smi GPU telemetry query failed",
        `queryId=${options.querySequence}`,
        `elapsedMs=${options.elapsedMilliseconds}`,
        `timeoutMs=${NVIDIA_SMI_TIMEOUT_MS}`,
        `timerDelayMs=${Math.max(0, options.elapsedMilliseconds - NVIDIA_SMI_TIMEOUT_MS)}`,
        `code=${String(options.error.code ?? "unknown")}`,
        `signal=${String(options.error.signal ?? "none")}`,
        `activeNvidiaSmiQueries=${activeNvidiaSmiQueryCount}`,
        `message=${options.error.message}`,
    ].join(" "));
}

export function parseNvidiaSmiTelemetryLine(firstGpuLine: string): NodeSystemGpuTelemetryData | null {
    const fields = firstGpuLine.split(",").map(field => field.trim());
    const utilizationGpu = parseNvidiaSmiNumber(fields[0]);
    const modelText = normalizeNonEmptyText(fields[1]);
    const temperatureGpu = parseNvidiaSmiNumber(fields[2]);
    const memoryUsed = parseNvidiaSmiNumber(fields[3]);
    const memoryTotal = parseNvidiaSmiNumber(fields[4]);
    const powerDraw = parseNvidiaSmiNumber(fields[5]);
    const powerLimit = parseNvidiaSmiNumber(fields[6]);

    if (
        utilizationGpu == null
        && temperatureGpu == null
        && memoryUsed == null
        && memoryTotal == null
        && powerDraw == null
        && powerLimit == null
        && modelText == null
    ) {
        return null;
    }

    return {
        utilizationGpu,
        modelText,
        temperatureGpu,
        memoryUsed,
        memoryTotal,
        powerDraw,
        powerLimit,
    };
}

export function parseNvidiaSmiNumber(value: string | undefined): number | undefined {
    if (!value || value.toUpperCase() === "N/A") {
        return undefined;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : undefined;
}

export function parseIoAcceleratorPerformanceStatistics(output: string): NodeSystemGpuTelemetryData | null {
    const statisticGroups = readIoAcceleratorPerformanceStatisticGroups(output);
    return parseIoAcceleratorPerformanceStatisticsFromGroups(statisticGroups);
}

function parseIoAcceleratorPerformanceStatisticsFromGroups(
    statisticGroups: readonly IoAcceleratorPerformanceStatistics[],
): NodeSystemGpuTelemetryData | null {
    const deviceUtilizationPercentages = statisticGroups
        .map(statistics => statistics.utilization)
        .filter((value): value is number => value !== undefined && value >= 0 && value <= 100);

    if (deviceUtilizationPercentages.length === 0) {
        return null;
    }

    return {
        utilizationGpu: Math.max(...deviceUtilizationPercentages),
    };
}

interface IoAcceleratorPerformanceStatistics {
    readonly utilization: number | undefined;
    readonly deviceUtilization: number | undefined;
    readonly gpuActivity: number | undefined;
    readonly rendererUtilization: number | undefined;
    readonly tilerUtilization: number | undefined;
}

function readIoAcceleratorPerformanceStatisticGroups(output: string): IoAcceleratorPerformanceStatistics[] {
    // IOAccelerator exposes PerformanceStatistics as a flat dictionary today.
    // Nested dictionaries would require a structured parser instead of this regex.
    return [...output.matchAll(/"PerformanceStatistics"\s*=\s*\{(?<statistics>[^}]*)\}/g)]
        .map(match => match.groups?.statistics ?? "")
        .map(readIoAcceleratorPerformanceStatistics);
}

function readIoAcceleratorPerformanceStatistics(statistics: string): IoAcceleratorPerformanceStatistics {
    const deviceUtilization = readIoAcceleratorStatisticValue(statistics, "Device Utilization %");
    const gpuActivity = readIoAcceleratorStatisticValue(statistics, "GPU Activity(%)");

    return {
        utilization: deviceUtilization ?? gpuActivity,
        deviceUtilization,
        gpuActivity,
        rendererUtilization: readIoAcceleratorStatisticValue(statistics, "Renderer Utilization %"),
        tilerUtilization: readIoAcceleratorStatisticValue(statistics, "Tiler Utilization %"),
    };
}

function readIoAcceleratorStatisticValue(statistics: string, key: string): number | undefined {
    const statisticsEntries = [...statistics.matchAll(/"(?<key>[^"]+)"=(?<value>-?\d+(?:\.\d+)?)/g)];
    const matchingEntry = statisticsEntries.find(entry => entry.groups?.key === key);
    const rawValue = matchingEntry?.groups?.value;

    if (rawValue === undefined) {
        return undefined;
    }

    const value = Number(rawValue);

    return Number.isFinite(value) ? value : undefined;
}

function logIoAcceleratorTelemetryDebug(
    statisticGroups: readonly IoAcceleratorPerformanceStatistics[],
    telemetryData: NodeSystemGpuTelemetryData | null,
): void {
    gpuLog.atDebug()
        .everyMs("ioreg-telemetry", IOREG_TELEMETRY_DEBUG_LOG_INTERVAL_MS)
        .log(() => [
            "ioregTelemetry",
            `parsedUsage=${String(telemetryData?.utilizationGpu ?? "none")}`,
            `statistics=${JSON.stringify(statisticGroups)}`,
        ].join(" "));
}
