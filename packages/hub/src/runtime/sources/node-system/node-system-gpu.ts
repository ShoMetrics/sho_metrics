import { execFile, type ExecFileException } from "node:child_process";
import { logger } from "../../../logging/logger";
import { normalizeNonEmptyText } from "./node-system-cpu";
import type { NodeSystemGpuTelemetryData, NodeSystemInformationClient } from "./node-system-source-types";

const gpuLog = logger.for("Source:NodeSystem:GPU");

let lastNvidiaSmiFailureLogTimestampMilliseconds = 0;
let nextGpuPollDebugSequence = 1;
let nextNvidiaSmiQueryDebugSequence = 1;
let activeNvidiaSmiQueryCount = 0;

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

function runNvidiaSmiTelemetryQuery(): Promise<string | null> {
    return new Promise(resolve => {
        const queryStartTimestampMilliseconds = Date.now();
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
                const elapsedMilliseconds = Date.now() - queryStartTimestampMilliseconds;
                activeNvidiaSmiQueryCount = Math.max(0, activeNvidiaSmiQueryCount - 1);

                if (error) {
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

function logNvidiaSmiFailure(options: {
    error: ExecFileException;
    elapsedMilliseconds: number;
    querySequence: number;
}): void {
    const currentTimestampMilliseconds = Date.now();

    if (
        currentTimestampMilliseconds - lastNvidiaSmiFailureLogTimestampMilliseconds
        < NVIDIA_SMI_FAILURE_LOG_INTERVAL_MS
    ) {
        return;
    }

    lastNvidiaSmiFailureLogTimestampMilliseconds = currentTimestampMilliseconds;
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
