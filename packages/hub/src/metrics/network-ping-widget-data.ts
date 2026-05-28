import type { WidgetData } from "../view-rendering/widget-data";

const NETWORK_PING_PROGRESS_MAXIMUM_MILLISECONDS = 200;

export function buildNetworkPingWidgetData(options: {
    readonly latencyMilliseconds: number;
    readonly historyLatencyMilliseconds: readonly number[];
    readonly sampleTimestampMilliseconds?: number;
}): WidgetData {
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
