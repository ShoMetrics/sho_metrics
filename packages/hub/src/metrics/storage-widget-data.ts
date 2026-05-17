import type { WidgetData } from "../rendering/widget-data";
import { formatByteCount, formatBytesPerSecond } from "./byte-format";

export type DiskUsageDisplayMode = "percentage" | "space";

const BINARY_BASE = 1024;
const MAXIMUM_SPACE_DISPLAY_DIGITS = 3;
const MAXIMUM_THROUGHPUT_DISPLAY_DIGITS = 3;
const MINIMUM_DISK_RATE_MAXIMUM_BYTES_PER_SECOND = 1024 * 1024;
const PERCENTAGE_SPARKLINE_SCALE = {
    mode: "fixed",
    minimumValue: 0,
    maximumValue: 100,
} as const;

export function buildMemoryUsageWidgetData(options: {
    usedBytesWidgetData: WidgetData;
    totalBytes: number;
    label: string;
}): WidgetData {
    const safeTotalBytes = Math.max(options.totalBytes, 1);
    const usedAndTotalText = formatUsedAndTotalBytes({
        usedBytes: options.usedBytesWidgetData.current,
        totalBytes: safeTotalBytes,
    });
    const usageHistory = options.usedBytesWidgetData.history.map(historyValue => (historyValue / safeTotalBytes) * 100);
    const currentUsagePercent = (options.usedBytesWidgetData.current / safeTotalBytes) * 100;

    return {
        current: currentUsagePercent,
        progress: Math.min(Math.max(options.usedBytesWidgetData.current / safeTotalBytes, 0), 1),
        history: usageHistory,
        unit: "%",
        label: options.label,
        displayValue: currentUsagePercent.toFixed(0),
        secondaryDisplayValue: usedAndTotalText,
        sparklineScale: PERCENTAGE_SPARKLINE_SCALE,
        sampleTimestampMilliseconds: options.usedBytesWidgetData.sampleTimestampMilliseconds,
    };
}

export function buildDiskUsageWidgetData(options: {
    usedBytesWidgetData: WidgetData;
    totalBytes: number;
    availableBytes: number;
    displayMode: DiskUsageDisplayMode;
    label: string;
    barLabel?: string;
}): WidgetData {
    const percentageWidgetData = buildMemoryUsageWidgetData({
        usedBytesWidgetData: options.usedBytesWidgetData,
        totalBytes: options.totalBytes,
        label: options.label,
    });

    if (options.displayMode === "percentage") {
        return {
            ...percentageWidgetData,
            barLabel: options.barLabel,
        };
    }

    const formattedAvailableSpace = formatDiskAvailableSpace({
        availableBytes: options.availableBytes,
        totalBytes: options.totalBytes,
    });

    return {
        ...percentageWidgetData,
        displayValue: formattedAvailableSpace.value,
        unit: formattedAvailableSpace.unit,
        barLabel: options.barLabel,
        barDisplayValue: percentageWidgetData.current.toFixed(0),
        barUnit: "%",
    };
}

export function buildDiskThroughputWidgetData(options: {
    bytesPerSecondWidgetData: WidgetData;
    maximumBytesPerSecond: number;
    label: string;
}): WidgetData {
    const safeBytesPerSecond = Math.max(0, options.bytesPerSecondWidgetData.current);
    const formattedThroughput = formatBytesPerSecond({
        bytesPerSecond: safeBytesPerSecond,
        unitBase: "byte",
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_THROUGHPUT_DISPLAY_DIGITS,
    });
    const maximumBytesPerSecond = Math.max(options.maximumBytesPerSecond, MINIMUM_DISK_RATE_MAXIMUM_BYTES_PER_SECOND);

    return {
        current: safeBytesPerSecond,
        progress: Math.min(Math.max(safeBytesPerSecond / maximumBytesPerSecond, 0), 1),
        history: options.bytesPerSecondWidgetData.history,
        unit: formattedThroughput.unit,
        label: options.label,
        displayValue: formattedThroughput.value,
        sparklineScale: { mode: "adaptive", minimumValue: 0 },
        sampleTimestampMilliseconds: options.bytesPerSecondWidgetData.sampleTimestampMilliseconds,
    };
}

function formatDiskAvailableSpace(options: {
    availableBytes: number;
    totalBytes: number;
}): { value: string; unit: string } {
    const tebibyte = BINARY_BASE ** 4;
    const gibibyte = BINARY_BASE ** 3;
    const minimumUnitIndex = options.totalBytes >= tebibyte && options.availableBytes < tebibyte
        ? 2
        : 3;
    const formattedSpace = formatByteCount({
        bytes: options.availableBytes,
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_SPACE_DISPLAY_DIGITS,
        minimumUnitIndex: options.availableBytes < gibibyte ? 2 : minimumUnitIndex,
    });

    return formattedSpace;
}

function formatUsedAndTotalBytes(options: {
    usedBytes: number;
    totalBytes: number;
}): string {
    const formattedUsedBytes = formatByteCount({
        bytes: options.usedBytes,
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_SPACE_DISPLAY_DIGITS,
        minimumUnitIndex: resolveMinimumSpaceUnitIndex(options.totalBytes),
    });
    const formattedTotalBytes = formatByteCount({
        bytes: options.totalBytes,
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_SPACE_DISPLAY_DIGITS,
        minimumUnitIndex: resolveMinimumSpaceUnitIndex(options.totalBytes),
    });
    const usedText = formattedUsedBytes.unit === formattedTotalBytes.unit
        ? formattedUsedBytes.value
        : `${formattedUsedBytes.value} ${formattedUsedBytes.unit}`;

    return `${usedText} / ${formattedTotalBytes.value} ${formattedTotalBytes.unit}`;
}

function resolveMinimumSpaceUnitIndex(totalBytes: number): number {
    return totalBytes >= BINARY_BASE ** 4 ? 4 : 3;
}
