import type { ArcGaugeStatusIcon } from "../primitives/arc-gauge";
import { getHardwareIconFragment, type HardwareIconKind } from "./hardware-icons";
import { getMetricStatusIcon, type MetricStatusIconKind } from "./metric-status-icons";

export interface MetricDisplayIcons {
    centerIconFragment: string;
    statusIcon: ArcGaugeStatusIcon;
}

export function buildMetricDisplayIcons(options: {
    hardware: HardwareIconKind;
    status: MetricStatusIconKind;
}): MetricDisplayIcons {
    return {
        centerIconFragment: getHardwareIconFragment(options.hardware),
        statusIcon: getMetricStatusIcon(options.status),
    };
}
