import {
    getDiskThroughputMetricKey,
    type DiskThroughputDirection,
} from "../../runtime/disk-metric-keys";
import type { DiskMetricKind, GraphicType } from "../../settings/widget-settings";

export interface DiskMetricSubscriptionSettings {
    diskMetricKind?: DiskMetricKind;
    graphicType?: GraphicType;
    diskThroughputDirection?: DiskThroughputDisplayDirection;
}

export type DiskThroughputDisplayDirection = DiskThroughputDirection | "both";

export function resolveDiskMetricSubscriptionKeys(settings: DiskMetricSubscriptionSettings): readonly string[] {
    if (settings.diskMetricKind !== "throughput") {
        return [];
    }

    const throughputDirection = normalizeDiskThroughputDisplayDirection(settings.diskThroughputDirection);

    if (isDualDiskThroughputDisplay(settings.graphicType, throughputDirection)) {
        return [
            getDiskThroughputMetricKey("read"),
            getDiskThroughputMetricKey("write"),
        ];
    }

    return [getDiskThroughputMetricKey(resolveSingleDiskThroughputDirection(throughputDirection))];
}

export function normalizeDiskThroughputDisplayDirection(
    value: DiskMetricSubscriptionSettings["diskThroughputDirection"],
): DiskThroughputDisplayDirection {
    if (value === "read" || value === "write" || value === "total") {
        return value;
    }

    return "both";
}

export function resolveSingleDiskThroughputDirection(
    direction: DiskThroughputDisplayDirection,
): DiskThroughputDirection {
    return direction === "read" || direction === "write" ? direction : "total";
}

export function isDualDiskThroughputDisplay(
    graphicType: GraphicType | undefined,
    direction: DiskThroughputDisplayDirection,
): boolean {
    return direction === "both"
        && (graphicType === "circular" || graphicType === "text" || graphicType === "dashed-line");
}
