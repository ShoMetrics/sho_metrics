import { logger } from "../../../logging/node-logger";
import { normalizeNetworkPingTargetInput } from "../../../settings/network-ping-target";
import {
    getNetworkPingLatencyMetricKey,
    readNetworkPingLatencyMetricTargetHost,
} from "../../network-metric-keys";
import {
    buildScalarMetricValue,
    MetricUnit,
    type MetricValue,
} from "../metric-source";
import type { NodeSystemInformationClient } from "./node-system-source-types";

const log = logger.for("Source:NodeSystem:Network");
const PING_POLL_ERROR_WARNING_INTERVAL_MS = 30000;

export function resolveRequestedNetworkPingMetricKeys(metricKeys: readonly string[]): readonly string[] {
    const requestedMetricKeys = new Set<string>();

    for (const metricKey of metricKeys) {
        const targetHost = readNetworkPingLatencyMetricTargetHost(metricKey);
        if (targetHost === undefined) {
            continue;
        }

        const normalizedTarget = normalizeNetworkPingTargetInput(targetHost);
        if (normalizedTarget.status !== "normalized") {
            continue;
        }

        requestedMetricKeys.add(getNetworkPingLatencyMetricKey(normalizedTarget.targetHost));
    }

    return [...requestedMetricKeys];
}

export async function pollNetworkPingMetrics(options: {
    readonly metricKeys: readonly string[];
    readonly systemInformation: Pick<NodeSystemInformationClient, "inetLatency">;
}): Promise<Record<string, MetricValue>> {
    const requestedMetricKeys = resolveRequestedNetworkPingMetricKeys(options.metricKeys);
    const metrics: Record<string, MetricValue> = {};

    await Promise.all(requestedMetricKeys.map(async (metricKey) => {
        const targetHost = readNetworkPingLatencyMetricTargetHost(metricKey);
        if (targetHost === undefined) {
            return;
        }

        try {
            const latencyMilliseconds: number | null | undefined = await options.systemInformation.inetLatency(targetHost);
            if (!isValidNetworkPingLatency(latencyMilliseconds)) {
                return;
            }

            metrics[metricKey] = buildScalarMetricValue(latencyMilliseconds, {
                unit: MetricUnit.MILLISECONDS,
            });
        } catch (error) {
            log.atWarn()
                .everyMs("network-ping-poll-error", PING_POLL_ERROR_WARNING_INTERVAL_MS)
                .log(() => `Network ping poll error targetHost=${targetHost} error=${String(error)}`);
        }
    }));

    return metrics;
}

function isValidNetworkPingLatency(value: number | null | undefined): value is number {
    return value !== null
        && value !== undefined
        && Number.isFinite(value)
        && value >= 0;
}

