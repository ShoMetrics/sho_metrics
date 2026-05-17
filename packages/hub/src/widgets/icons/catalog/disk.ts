import { HardDriveDownload, HardDriveUpload } from "lucide";
import { createLucideIconDefinition } from "../sources/lucide";
import { renderCenteredIconFragment } from "../render-icon";
import type { DiskThroughputMetricDirection } from "../../../runtime/disk-metric-keys";

export function renderDiskThroughputDirectionIconFragment(options: {
    direction: Exclude<DiskThroughputMetricDirection, "total">;
    color?: string;
    size: number;
}): string {
    const iconDefinition = createLucideIconDefinition({
        id: `disk.throughput.${options.direction}`,
        node: options.direction === "read" ? HardDriveDownload : HardDriveUpload,
        color: options.color,
        strokeWidth: 2.35,
        opticalScale: 1.05,
    });

    return renderCenteredIconFragment(iconDefinition, options.size);
}
