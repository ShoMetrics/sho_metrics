import type { Systeminformation } from "systeminformation";
import {
    buildScalarMetricValue,
    MetricUnit,
    type MetricValue,
} from "../metric-source";
import { SYSTEM_BATTERY_PERCENT_METRIC_KEY } from "../../metric-keys";

export function buildSystemBatteryMetrics(
    batteryData: Systeminformation.BatteryData,
): Record<string, MetricValue> {
    const batteryPercent = resolveSystemBatteryPercent(batteryData);

    return batteryPercent == null
        ? {}
        : {
            [SYSTEM_BATTERY_PERCENT_METRIC_KEY]: buildScalarMetricValue(batteryPercent, {
                unit: MetricUnit.PERCENT,
            }),
        };
}

export function resolveSystemBatteryPercent(
    batteryData: Systeminformation.BatteryData,
): number | null {
    if (!batteryData.hasBattery || !Number.isFinite(batteryData.percent)) {
        return null;
    }

    if (batteryData.percent < 0 || batteryData.percent > 100) {
        return null;
    }

    return batteryData.percent;
}
