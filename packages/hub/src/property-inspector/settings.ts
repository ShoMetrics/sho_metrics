import type { ActionKind } from "../settings/widget-settings";

export type {
    ActionKind,
    CircleStyle,
    ColorMode,
    DiskMetricKind,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    GraphicStyle,
    GraphicType,
    GridLineType,
    GridLineVisibility,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    ScaleMode,
    TemperatureUnit,
} from "../settings/widget-settings";

export function resolveActionKind(actionUuid: string): ActionKind {
    const actionSuffix = actionUuid.split(".").pop();

    if (
        actionSuffix === "cpu-usage"
        || actionSuffix === "net-speed"
        || actionSuffix === "ram"
        || actionSuffix === "disk"
        || actionSuffix === "gpu-usage"
        || actionSuffix === "gpu-temp"
        || actionSuffix === "gpu-vram"
        || actionSuffix === "gpu-power"
    ) {
        return actionSuffix;
    }

    return "unknown";
}
