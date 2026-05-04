import type { WidgetData } from "../rendering/widget-data";
import { formatByteRate, type DataRateUnitBase } from "./byte-display";

export type NetworkSpeedUnitBase = DataRateUnitBase;

export interface NetworkSpeedDisplayOptions {
    bytesPerSecond: number;
    historyBytesPerSecond: readonly number[];
    maximumBytesPerSecond: number;
    label: string;
    unitBase: NetworkSpeedUnitBase;
    maximumDisplayDigits: number;
    sampleTimestampMilliseconds?: number;
}

const SI_BASE = 1000;
const BITS_PER_BYTE = 8;
const MINIMUM_PROGRESS_MAXIMUM_BYTES_PER_SECOND = SI_BASE;

export function buildNetworkSpeedWidgetData(options: NetworkSpeedDisplayOptions): WidgetData {
    const safeBytesPerSecond = Math.max(0, options.bytesPerSecond);
    const formattedSpeed = formatByteRate({
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

export function convertMegabitsPerSecondToBytesPerSecond(megabitsPerSecond: number): number {
    return (Math.max(0, megabitsPerSecond) * 1_000_000) / BITS_PER_BYTE;
}
