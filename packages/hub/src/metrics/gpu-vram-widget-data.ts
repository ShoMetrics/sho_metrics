import { formatByteCount } from "./byte-format";
import type { WidgetData } from "../view-rendering/widget-data";

/** Builds GPU VRAM percentage data from used and total megabyte readings. */
export function buildGpuVramWidgetData(used: WidgetData, totalMegabytes: number): WidgetData {
    const safeTotalMegabytes = totalMegabytes > 0 ? totalMegabytes : 1;
    const usedAndTotalText = formatUsedAndTotalMegabytes(used.current, safeTotalMegabytes);

    return {
        current: (used.current / safeTotalMegabytes) * 100,
        progress: Math.min(Math.max(used.current / safeTotalMegabytes, 0), 1),
        history: used.history.map((historyValue) => (historyValue / safeTotalMegabytes) * 100),
        unit: "%",
        label: "VRAM",
        displayValue: ((used.current / safeTotalMegabytes) * 100).toFixed(0),
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

function formatUsedAndTotalMegabytes(usedMegabytes: number, totalMegabytes: number): string {
    const binaryBase = 1024;
    const usedBytes = usedMegabytes * binaryBase * binaryBase;
    const totalBytes = totalMegabytes * binaryBase * binaryBase;
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
