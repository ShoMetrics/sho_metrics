export type { ActionKind } from "../../shared/stream-deck-actions";
import type { MetricTheme, SingleMetricViewLayout } from "../../settings/resolved-settings";
export type {
    CircleStyle,
    ColorMode,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    GridLineType,
    GridLineVisibility,
    MetricTheme,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    ScaleMode,
    SingleMetricViewLayout,
    TemperatureUnit,
} from "../../settings/resolved-settings";

export type GraphicType = SingleMetricViewLayout;
export type GraphicStyle = MetricTheme;
export type DiskMetricKind = "usage" | "throughput";
