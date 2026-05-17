import type { ArcGaugeStatusIcon } from "../primitives/arc-gauge";
import { getHardwareIconFragment, type HardwareIconKind } from "./hardware-icons";
import { getMetricStatusIcon, type MetricStatusIconKind } from "./metric-status-icons";

export interface MetricViewIcons {
    centerIconFragment: string;
    statusIcon: ArcGaugeStatusIcon;
}

export function buildMetricViewIcons(options: {
    hardware: HardwareIconKind;
    status: MetricStatusIconKind;
}): MetricViewIcons {
    return {
        centerIconFragment: getHardwareIconFragment(options.hardware),
        statusIcon: getMetricStatusIcon(options.status),
    };
}
