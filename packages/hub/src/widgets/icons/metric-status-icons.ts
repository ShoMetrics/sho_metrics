import type { ProgressCircleStatusIcon } from "../primitives/progress-circle";
import {
    getMetricStatusIconDefinition,
    type MetricStatusIconKind,
} from "./catalog/status";

export type { MetricStatusIconKind } from "./catalog/status";
export { isMetricStatusIconKind } from "./catalog/status";

export function getMetricStatusIcon(kind: MetricStatusIconKind): ProgressCircleStatusIcon {
    return getMetricStatusIconDefinition(kind);
}
