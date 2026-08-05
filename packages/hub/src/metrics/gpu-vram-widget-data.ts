import type { WidgetData } from "../view-rendering/widget-data";
import type { GpuVramDisplayMode } from "../settings/resolved-settings";
import {
    buildCapacityDisplayFields,
    formatCapacityUsingTotalUnit,
    formatUsedAndTotalBytes,
} from "./capacity-display-fields";

/** Builds GPU VRAM percentage data from used and total byte readings. */
export function buildGpuVramWidgetData(
    used: WidgetData,
    totalBytes: number,
    options: {
        displayMode: GpuVramDisplayMode;
    },
): WidgetData {
    const safeTotalBytes = totalBytes > 0 ? totalBytes : 1;
    const usedAndTotalText = formatUsedAndTotalBytes(used.current, safeTotalBytes);
    const usedPercentageText = ((used.current / safeTotalBytes) * 100).toFixed(0);

    const percentageWidgetData: WidgetData = {
        current: (used.current / safeTotalBytes) * 100,
        progress: Math.min(Math.max(used.current / safeTotalBytes, 0), 1),
        history: used.history.map((historyValue) => (historyValue / safeTotalBytes) * 100),
        unit: "%",
        label: "VRAM",
        displayValue: usedPercentageText,
        secondaryDisplayValue: usedAndTotalText,
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: 100,
        },
        sampleTimestampMilliseconds: used.sampleTimestampMilliseconds,
        unavailableDisplayValue: used.unavailableDisplayValue,
    };

    if (options.displayMode === "usedPercentage") {
        return percentageWidgetData;
    }

    const displayedBytes = options.displayMode === "freeCapacity"
        ? Math.max(safeTotalBytes - used.current, 0)
        : used.current;
    const capacityDisplayFields = buildCapacityDisplayFields({
        displayMode: options.displayMode,
        formattedCapacity: formatCapacityUsingTotalUnit(displayedBytes, safeTotalBytes),
        usedAndTotalText,
        usedPercentageText,
    });

    return {
        ...percentageWidgetData,
        ...capacityDisplayFields,
    };
}
