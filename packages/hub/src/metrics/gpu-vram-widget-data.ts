import { formatByteCount } from "./byte-format";
import type { WidgetData } from "../view-rendering/widget-data";

/** Builds GPU VRAM percentage data from used and total byte readings. */
export function buildGpuVramWidgetData(used: WidgetData, totalBytes: number): WidgetData {
    const safeTotalBytes = totalBytes > 0 ? totalBytes : 1;
    const usedAndTotalText = formatUsedAndTotalBytes(used.current, safeTotalBytes);

    return {
        current: (used.current / safeTotalBytes) * 100,
        progress: Math.min(Math.max(used.current / safeTotalBytes, 0), 1),
        history: used.history.map((historyValue) => (historyValue / safeTotalBytes) * 100),
        unit: "%",
        label: "VRAM",
        displayValue: ((used.current / safeTotalBytes) * 100).toFixed(0),
        secondaryDisplayValue: usedAndTotalText,
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: 100,
        },
        sampleTimestampMilliseconds: used.sampleTimestampMilliseconds,
        unavailableDisplayValue: used.unavailableDisplayValue,
    };
}

function formatUsedAndTotalBytes(usedBytes: number, totalBytes: number): string {
    const binaryBase = 1024;
    const formattedUsedBytes = formatByteCount({
        bytes: usedBytes,
        base: binaryBase,
        maximumDisplayDigits: 3,
        minimumUnitIndex: 3,
    });
    const formattedTotalBytes = formatByteCount({
        bytes: totalBytes,
        base: binaryBase,
        maximumDisplayDigits: 3,
        minimumUnitIndex: 3,
    });
    const usedText = formattedUsedBytes.unit === formattedTotalBytes.unit
        ? formattedUsedBytes.value
        : `${formattedUsedBytes.value} ${formattedUsedBytes.unit}`;

    return `${usedText} / ${formattedTotalBytes.value} ${formattedTotalBytes.unit}`;
}
