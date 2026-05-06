import type { SettingValue } from "./metric-visual-settings";
import {
    getDiskThroughputMetricKey,
    type DiskThroughputDirection,
} from "../runtime/disk-metric-keys";

export interface DiskMetricKeySettings {
    diskMetricKind?: SettingValue;
    graphicType?: SettingValue;
    diskThroughputDirection?: SettingValue;
}

export type DiskThroughputDisplayDirection = DiskThroughputDirection | "both";

export function resolveDiskMetricKeys(settings: DiskMetricKeySettings): readonly string[] {
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

export function normalizeDiskThroughputDisplayDirection(value: SettingValue): DiskThroughputDisplayDirection {
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
    graphicType: SettingValue,
    direction: DiskThroughputDisplayDirection,
): boolean {
    return direction === "both"
        && (graphicType === "circular" || graphicType === "dashed-line");
}
