import type { WidgetData } from "../view-rendering/widget-data";
import { isNetworkSampleFresh } from "./network-sample-freshness";

const NETWORK_PING_PROGRESS_MAXIMUM_MILLISECONDS = 200;

export function buildNetworkPingWidgetData(options: {
    readonly latencyMilliseconds: number;
    readonly historyLatencyMilliseconds: readonly number[];
    readonly sampleTimestampMilliseconds?: number;
    readonly currentTimestampMilliseconds: number;
    readonly pollingFrequencySeconds: number;
}): WidgetData {
    if (!isNetworkPingSampleFresh(options)) {
        return buildUnavailableNetworkPingWidgetData();
    }

    const safeLatencyMilliseconds = Number.isFinite(options.latencyMilliseconds)
        ? Math.max(options.latencyMilliseconds, 0)
        : 0;

    return {
        current: safeLatencyMilliseconds,
        progress: Math.min(safeLatencyMilliseconds / NETWORK_PING_PROGRESS_MAXIMUM_MILLISECONDS, 1),
        history: options.historyLatencyMilliseconds,
        unit: "ms",
        label: "PING",
        displayValue: Math.round(safeLatencyMilliseconds).toFixed(0),
        sparklineScale: { mode: "adaptive", minimumValue: 0 },
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}

function isNetworkPingSampleFresh(options: {
    readonly sampleTimestampMilliseconds?: number | undefined;
    readonly currentTimestampMilliseconds: number;
    readonly pollingFrequencySeconds: number;
}): boolean {
    return isNetworkSampleFresh({
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.pollingFrequencySeconds,
    });
}

function buildUnavailableNetworkPingWidgetData(): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        unit: "ms",
        label: "PING",
        displayValue: "",
        sparklineScale: { mode: "adaptive", minimumValue: 0 },
        sampleTimestampMilliseconds: undefined,
    };
}
