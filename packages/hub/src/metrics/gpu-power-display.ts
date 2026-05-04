import { clamp } from "../rendering/svg-utils";
import type { WidgetData } from "../rendering/widget-data";

export interface GpuPowerDisplayOptions {
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
    };
}

export function resolveMaximumGpuPowerWatts(options: {
    customMaximumPowerWatts: number | string | boolean | null | undefined;
    automaticMaximumPowerWatts: number;
}): number {
    const customMaximumPowerWatts = Number(options.customMaximumPowerWatts);

    if (Number.isFinite(customMaximumPowerWatts) && customMaximumPowerWatts > 0) {
        return customMaximumPowerWatts;
    }

    if (Number.isFinite(options.automaticMaximumPowerWatts) && options.automaticMaximumPowerWatts > 0) {
        return options.automaticMaximumPowerWatts;
    }

    return DEFAULT_MAXIMUM_GPU_POWER_WATTS;
}
