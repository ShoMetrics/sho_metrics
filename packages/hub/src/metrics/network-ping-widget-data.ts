import type { WidgetData } from "../view-rendering/widget-data";
import { isNetworkSampleFresh } from "./network-sample-freshness";

export function buildNetworkPingWidgetData(options: {
    readonly latencyMilliseconds: number;
    readonly historyLatencyMilliseconds: readonly number[];
    readonly maximumLatencyMilliseconds: number;
    readonly sampleTimestampMilliseconds?: number;
    readonly currentTimestampMilliseconds: number;
    readonly pollingFrequencySeconds: number;
}): WidgetData {
    if (!isNetworkPingSampleFresh(options)) {
        return buildUnavailableNetworkPingWidgetData(options.maximumLatencyMilliseconds);
    }

    const safeLatencyMilliseconds = Number.isFinite(options.latencyMilliseconds)
        ? Math.max(options.latencyMilliseconds, 0)
        : 0;
    const maximumLatencyMilliseconds = Math.max(options.maximumLatencyMilliseconds, 1);

    return {
        current: safeLatencyMilliseconds,
        progress: Math.min(safeLatencyMilliseconds / maximumLatencyMilliseconds, 1),
        history: options.historyLatencyMilliseconds,
        unit: "ms",
        label: "PING",
        displayValue: Math.round(safeLatencyMilliseconds).toFixed(0),
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: maximumLatencyMilliseconds,
        },
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

function buildUnavailableNetworkPingWidgetData(configuredMaximumLatencyMilliseconds: number): WidgetData {
    const maximumLatencyMilliseconds = Math.max(configuredMaximumLatencyMilliseconds, 1);

    return {
        current: 0,
        progress: 0,
        history: [],
        unit: "ms",
        label: "PING",
        displayValue: "",
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: maximumLatencyMilliseconds,
        },
        sampleTimestampMilliseconds: undefined,
    };
}
