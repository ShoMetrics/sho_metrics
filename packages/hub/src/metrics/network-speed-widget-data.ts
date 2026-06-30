import type { WidgetData } from "../view-rendering/widget-data";
import { formatBytesPerSecond, type DataRateUnitBase } from "./byte-format";
import {
    isPollingBackedRateSampleFresh,
    resolvePollingBackedSampleFreshnessBudgetMilliseconds,
} from "./rate-sample-freshness";

type NetworkSpeedUnitBase = DataRateUnitBase;

interface NetworkSpeedDisplayOptions {
    bytesPerSecond: number;
    historyBytesPerSecond: readonly number[];
    maximumBytesPerSecond: number;
    label: string;
    unitBase: NetworkSpeedUnitBase;
    maximumDisplayDigits: number;
    sampleTimestampMilliseconds?: number;
    currentTimestampMilliseconds: number;
    pollingFrequencySeconds: number;
}

const NETWORK_SAMPLE_STALE_GRACE_MILLISECONDS = 5000;
const SI_BASE = 1000;
const BITS_PER_BYTE = 8;
const MINIMUM_PROGRESS_MAXIMUM_BYTES_PER_SECOND = SI_BASE;

/**
 * Resolves how long network widgets may render the last-good sample.
 *
 * Traffic samples use this before the rate builder marks stale throughput as
 * unavailable; ping reuses the same network-owned freshness budget in the
 * network action view builder.
 */
export function resolveNetworkSampleFreshnessBudgetMilliseconds(pollingFrequencySeconds: number): number {
    return resolvePollingBackedSampleFreshnessBudgetMilliseconds({
        pollingFrequencySeconds,
        graceMilliseconds: NETWORK_SAMPLE_STALE_GRACE_MILLISECONDS,
    });
}

export function buildNetworkSpeedWidgetData(options: NetworkSpeedDisplayOptions): WidgetData {
    if (!isPollingBackedRateSampleFresh({
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.pollingFrequencySeconds,
        graceMilliseconds: NETWORK_SAMPLE_STALE_GRACE_MILLISECONDS,
    })) {
        return buildUnavailableNetworkSpeedWidgetData(options);
    }

    const safeBytesPerSecond = Math.max(0, options.bytesPerSecond);
    const formattedSpeed = formatBytesPerSecond({
        bytesPerSecond: safeBytesPerSecond,
        unitBase: options.unitBase,
        base: SI_BASE,
        maximumDisplayDigits: options.maximumDisplayDigits,
    });
    const progressMaximumBytesPerSecond = Math.max(
        options.maximumBytesPerSecond,
        MINIMUM_PROGRESS_MAXIMUM_BYTES_PER_SECOND,
    );

    return {
        current: safeBytesPerSecond,
        progress: Math.min(Math.max(safeBytesPerSecond / progressMaximumBytesPerSecond, 0), 1),
        history: options.historyBytesPerSecond,
        unit: formattedSpeed.unit,
        label: options.label,
        displayValue: formattedSpeed.value,
        sparklineScale: { mode: "adaptive", minimumValue: 0 },
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}

function buildUnavailableNetworkSpeedWidgetData(options: NetworkSpeedDisplayOptions): WidgetData {
    // Renderer-facing N/A is driven by the missing sample timestamp. The zero
    // value only keeps the WidgetData shape safe for logs, progress, and units.
    const formattedSpeed = formatBytesPerSecond({
        bytesPerSecond: 0,
        unitBase: options.unitBase,
        base: SI_BASE,
        maximumDisplayDigits: options.maximumDisplayDigits,
    });

    return {
        current: 0,
        progress: 0,
        history: [],
        unit: formattedSpeed.unit,
        label: options.label,
        displayValue: formattedSpeed.value,
        sparklineScale: { mode: "adaptive", minimumValue: 0 },
        sampleTimestampMilliseconds: undefined,
    };
}

export function convertMegabitsPerSecondToBytesPerSecond(megabitsPerSecond: number): number {
    return (Math.max(0, megabitsPerSecond) * 1_000_000) / BITS_PER_BYTE;
}
