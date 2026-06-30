import { clamp } from "../view-rendering/rasterize/svg-utils";
import type { WidgetData } from "../view-rendering/widget-data";

export interface PowerDisplayOptions {
    powerWidgetData: WidgetData;
    maximumPowerWatts: number;
}

export function buildPowerWidgetData(options: PowerDisplayOptions): WidgetData {
    const safeMaximumPowerWatts = Math.max(options.maximumPowerWatts, 1);
    const currentPowerWatts = Math.max(options.powerWidgetData.current, 0);
    return {
        ...options.powerWidgetData,
        current: (currentPowerWatts / safeMaximumPowerWatts) * 100,
        progress: clamp(currentPowerWatts / safeMaximumPowerWatts, 0, 1),
        history: options.powerWidgetData.history.map((historyPowerWatts) =>
            (Math.max(historyPowerWatts, 0) / safeMaximumPowerWatts) * 100
        ),
        unit: "W",
        displayValue: currentPowerWatts.toFixed(0),
        secondaryDisplayValue: `${currentPowerWatts.toFixed(0)}/${safeMaximumPowerWatts.toFixed(0)} W`,
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: 100,
        },
    };
}
