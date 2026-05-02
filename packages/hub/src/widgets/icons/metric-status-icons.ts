import type { ArcGaugeStatusIcon } from "../primitives/arc-gauge";
import {
    getMetricStatusIconDefinition,
    type MetricStatusIconKind,
} from "./catalog/status";

export type { MetricStatusIconKind } from "./catalog/status";

export function getMetricStatusIcon(kind: MetricStatusIconKind): ArcGaugeStatusIcon {
    return getMetricStatusIconDefinition(kind);
}
