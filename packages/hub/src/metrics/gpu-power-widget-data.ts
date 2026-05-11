import { clamp } from "../rendering/svg-utils";
import type { WidgetData } from "../rendering/widget-data";

interface GpuPowerDisplayOptions {
    powerWidgetData: WidgetData;
    maximumPowerWatts: number;
}

const DEFAULT_MAXIMUM_GPU_POWER_WATTS = 300;

export function buildGpuPowerWidgetData(options: GpuPowerDisplayOptions): WidgetData {
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

export function resolveMaximumGpuPowerWatts(options: {
    customMaximumPowerWatts: number | undefined;
    automaticMaximumPowerWatts: number;
}): number {
    if (options.customMaximumPowerWatts !== undefined && options.customMaximumPowerWatts > 0) {
        return options.customMaximumPowerWatts;
    }

    if (Number.isFinite(options.automaticMaximumPowerWatts) && options.automaticMaximumPowerWatts > 0) {
        return options.automaticMaximumPowerWatts;
    }

    return DEFAULT_MAXIMUM_GPU_POWER_WATTS;
}
