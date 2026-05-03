import type { WidgetData } from "../rendering/widget-data";
import { formatByteRate, formatBytes } from "./byte-display";

export type DiskUsageDisplayMode = "percentage" | "space";

const BINARY_BASE = 1024;
const MAXIMUM_SPACE_DISPLAY_DIGITS = 3;
const MAXIMUM_THROUGHPUT_DISPLAY_DIGITS = 3;
const MINIMUM_DISK_RATE_MAXIMUM_BYTES_PER_SECOND = 1024 * 1024;

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

    return {
        current: (options.usedBytesWidgetData.current / safeTotalBytes) * 100,
        progress: Math.min(Math.max(options.usedBytesWidgetData.current / safeTotalBytes, 0), 1),
        history: options.usedBytesWidgetData.history.map(historyValue => (historyValue / safeTotalBytes) * 100),
        unit: "%",
        label: options.label,
        displayValue: ((options.usedBytesWidgetData.current / safeTotalBytes) * 100).toFixed(0),
        secondaryDisplayValue: usedAndTotalText,
        sampleTimestampMilliseconds: options.usedBytesWidgetData.sampleTimestampMilliseconds,
    };
}

export function buildDiskUsageWidgetData(options: {
    usedBytesWidgetData: WidgetData;
    totalBytes: number;
    availableBytes: number;
    displayMode: DiskUsageDisplayMode;
    label: string;
    linearLabel?: string;
}): WidgetData {
    const percentageWidgetData = buildMemoryUsageWidgetData({
        usedBytesWidgetData: options.usedBytesWidgetData,
        totalBytes: options.totalBytes,
        label: options.label,
    });

    if (options.displayMode === "percentage") {
        return {
            ...percentageWidgetData,
            linearLabel: options.linearLabel,
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
        linearLabel: options.linearLabel,
        linearDisplayValue: percentageWidgetData.current.toFixed(0),
        linearUnit: "%",
    };
}

export function buildDiskThroughputWidgetData(options: {
    bytesPerSecondWidgetData: WidgetData;
    maximumBytesPerSecond: number;
    label: string;
}): WidgetData {
    const safeBytesPerSecond = Math.max(0, options.bytesPerSecondWidgetData.current);
    const formattedThroughput = formatByteRate({
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
    const formattedSpace = formatBytes({
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
    const formattedUsedBytes = formatBytes({
        bytes: options.usedBytes,
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_SPACE_DISPLAY_DIGITS,
        minimumUnitIndex: resolveMinimumSpaceUnitIndex(options.totalBytes),
    });
    const formattedTotalBytes = formatBytes({
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
