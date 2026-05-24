import {
    buildPowerWidgetData as buildGenericPowerWidgetData,
    type PowerDisplayOptions,
} from "./power-widget-data";
import type { WidgetData } from "../view-rendering/widget-data";

const DEFAULT_MAXIMUM_GPU_POWER_WATTS = 300;

export function buildGpuPowerWidgetData(options: PowerDisplayOptions): WidgetData {
    return buildGenericPowerWidgetData(options);
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
