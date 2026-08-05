import type { WidgetData } from "../view-rendering/widget-data";
import type { DiskUsageDisplayMode, MemoryUsageDisplayMode } from "../settings/resolved-settings";
import { formatByteCount, formatBytesPerSecond } from "./byte-format";
import {
    buildCapacityDisplayFields,
    formatCapacityUsingTotalUnit,
    formatUsedAndTotalBytes,
} from "./capacity-display-fields";
import { isPollingBackedRateSampleFresh } from "./rate-sample-freshness";

const BINARY_BASE = 1024;
const MAXIMUM_SPACE_DISPLAY_DIGITS = 3;
const MAXIMUM_THROUGHPUT_DISPLAY_DIGITS = 3;
const MINIMUM_DISK_RATE_MAXIMUM_BYTES_PER_SECOND = 1024 * 1024;
const DISK_THROUGHPUT_SAMPLE_STALE_GRACE_MILLISECONDS = 5000;
const PERCENTAGE_SPARKLINE_SCALE = {
    mode: "fixed",
    minimumValue: 0,
    maximumValue: 100,
} as const;

export function buildMemoryUsageWidgetData(options: {
    usedBytesWidgetData: WidgetData;
    totalBytes: number;
    label: string;
    displayMode: MemoryUsageDisplayMode;
}): WidgetData {
    const safeTotalBytes = Math.max(options.totalBytes, 1);
    const percentageWidgetData = buildUsedCapacityPercentageWidgetData({
        usedBytesWidgetData: options.usedBytesWidgetData,
        totalBytes: safeTotalBytes,
        label: options.label,
    });

    if (options.displayMode === "usedPercentage") {
        return percentageWidgetData;
    }

    const displayedBytes = options.displayMode === "freeCapacity"
        ? Math.max(safeTotalBytes - options.usedBytesWidgetData.current, 0)
        : options.usedBytesWidgetData.current;
    const capacityDisplayFields = buildCapacityDisplayFields({
        displayMode: options.displayMode,
        formattedCapacity: formatCapacityUsingTotalUnit(displayedBytes, safeTotalBytes),
        usedAndTotalText: percentageWidgetData.secondaryDisplayValue,
        usedPercentageText: percentageWidgetData.displayValue,
    });

    return {
        ...percentageWidgetData,
        ...capacityDisplayFields,
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
    const percentageWidgetData = buildUsedCapacityPercentageWidgetData({
        usedBytesWidgetData: options.usedBytesWidgetData,
        totalBytes: options.totalBytes,
        label: options.label,
    });

    if (options.displayMode === "usedPercentage") {
        return {
            ...percentageWidgetData,
            barLabel: options.barLabel,
        };
    }

    const displayedBytes = options.displayMode === "freeCapacity"
        ? Math.max(options.availableBytes, 0)
        : Math.max(options.usedBytesWidgetData.current, 0);
    const formattedCapacity = formatDiskCapacity({
        capacityBytes: displayedBytes,
        totalBytes: options.totalBytes,
    });
    const capacityDisplayFields = buildCapacityDisplayFields({
        displayMode: options.displayMode,
        formattedCapacity,
        usedAndTotalText: percentageWidgetData.secondaryDisplayValue,
        usedPercentageText: percentageWidgetData.displayValue,
    });

    return {
        ...percentageWidgetData,
        ...capacityDisplayFields,
        barLabel: options.barLabel,
    };
}

function buildUsedCapacityPercentageWidgetData(options: {
    usedBytesWidgetData: WidgetData;
    totalBytes: number;
    label: string;
}): WidgetData & { readonly displayValue: string; readonly secondaryDisplayValue: string } {
    const safeTotalBytes = Math.max(options.totalBytes, 1);
    const currentUsagePercent = (options.usedBytesWidgetData.current / safeTotalBytes) * 100;

    return {
        current: currentUsagePercent,
        progress: Math.min(Math.max(options.usedBytesWidgetData.current / safeTotalBytes, 0), 1),
        history: options.usedBytesWidgetData.history.map(historyValue => (historyValue / safeTotalBytes) * 100),
        unit: "%",
        label: options.label,
        displayValue: currentUsagePercent.toFixed(0),
        secondaryDisplayValue: formatUsedAndTotalBytes(options.usedBytesWidgetData.current, safeTotalBytes),
        sparklineScale: PERCENTAGE_SPARKLINE_SCALE,
        sampleTimestampMilliseconds: options.usedBytesWidgetData.sampleTimestampMilliseconds,
    };
}

export function buildDiskThroughputWidgetData(options: {
    bytesPerSecondWidgetData: WidgetData;
    maximumBytesPerSecond: number;
    label: string;
    currentTimestampMilliseconds: number;
    pollingFrequencySeconds: number;
}): WidgetData {
    if (!isPollingBackedRateSampleFresh({
        sampleTimestampMilliseconds: options.bytesPerSecondWidgetData.sampleTimestampMilliseconds,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.pollingFrequencySeconds,
        graceMilliseconds: DISK_THROUGHPUT_SAMPLE_STALE_GRACE_MILLISECONDS,
    })) {
        return buildUnavailableDiskThroughputWidgetData(options.label, options.maximumBytesPerSecond);
    }

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
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: maximumBytesPerSecond,
        },
        sampleTimestampMilliseconds: options.bytesPerSecondWidgetData.sampleTimestampMilliseconds,
    };
}

function buildUnavailableDiskThroughputWidgetData(label: string, configuredMaximumBytesPerSecond: number): WidgetData {
    // Renderer-facing N/A is driven by the missing sample timestamp. The zero
    // value only keeps the WidgetData shape safe for logs, progress, and units.
    const formattedThroughput = formatBytesPerSecond({
        bytesPerSecond: 0,
        unitBase: "byte",
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_THROUGHPUT_DISPLAY_DIGITS,
    });
    const maximumBytesPerSecond = Math.max(
        configuredMaximumBytesPerSecond,
        MINIMUM_DISK_RATE_MAXIMUM_BYTES_PER_SECOND,
    );

    return {
        current: 0,
        progress: 0,
        history: [],
        unit: formattedThroughput.unit,
        label,
        displayValue: formattedThroughput.value,
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: maximumBytesPerSecond,
        },
        sampleTimestampMilliseconds: undefined,
    };
}

function formatDiskCapacity(options: {
    capacityBytes: number;
    totalBytes: number;
}): { value: string; unit: string } {
    const tebibyte = BINARY_BASE ** 4;
    const gibibyte = BINARY_BASE ** 3;
    const minimumUnitIndex = options.totalBytes >= tebibyte && options.capacityBytes < tebibyte
        ? 2
        : 3;
    const formattedSpace = formatByteCount({
        bytes: options.capacityBytes,
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_SPACE_DISPLAY_DIGITS,
        minimumUnitIndex: options.capacityBytes < gibibyte ? 2 : minimumUnitIndex,
    });

    return formattedSpace;
}
