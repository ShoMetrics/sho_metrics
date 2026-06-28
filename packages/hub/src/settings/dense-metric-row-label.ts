import type { NetworkDirection, ResolvedMetricTarget } from "./resolved-settings";
import { resolveDenseSystemBatteryRowDefaultLabel } from "./metric-custom-label-policy";

/**
 * Resolves the Dense row label used when the row-level label override is empty.
 *
 * The row-level DenseMetricSlot.customLabel is applied by callers. This helper
 * still honors metric-level labels, such as CatalogMetricTarget.customLabel,
 * because those are part of the target fallback that rendering will use.
 */
export function resolveDefaultDenseRowLabel(target: ResolvedMetricTarget): string {
    switch (target.domain) {
        case "cpu":
            return "CPU";
        case "memory":
            return "RAM";
        case "gpu":
            return target.reading.kind === "vram" ? "VRAM" : "GPU";
        case "disk":
            return target.reading.kind === "throughput" ? "DISK" : "DSK";
        case "network":
            return target.reading.kind === "ping"
                ? "PING"
                : resolveNetworkDirectionLabel(target.reading.direction);
        case "system":
            return resolveDenseSystemBatteryRowDefaultLabel(target.reading.detectedPeripheralDisplayName);
        case "catalog":
            return target.customLabel ?? target.detectedLabel ?? "METRIC";
        case "customMetric":
            return "CUSTOM";
    }
}

function resolveNetworkDirectionLabel(direction: NetworkDirection): string {
    switch (direction) {
        case "download":
            return "DOWN";
        case "upload":
            return "UP";
        case "both":
            return "NET";
    }
}
