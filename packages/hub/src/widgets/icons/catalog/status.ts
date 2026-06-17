import {
    Activity,
    ArrowDownUp,
    BatteryCharging,
    Clock,
    Database,
    Fan,
    Gauge,
    MemoryStick,
    Percent,
    SlidersHorizontal,
    Thermometer,
    Timer,
    Zap,
} from "lucide";
import type { IconNode } from "lucide";
import type { ProgressCircleStatusIcon } from "../../primitives/progress-circle";
import { createLucideIconDefinition } from "../sources/lucide";

/**
 * Names the compact status glyph used by the minimal progress-circle view.
 *
 * Minimal progress-circle keys already have a parent hardware icon in the
 * center. This glyph describes the metric status of that parent hardware, not
 * the hardware itself. Before adding a kind, first decide which parent icon it
 * modifies and whether the glyph truly communicates a status. Hardware
 * identities such as CPU, GPU, disk, memory, or network belong in
 * `HardwareIconKind`, not here.
 *
 * This is a render icon catalog, not the full source/runtime reading-kind
 * taxonomy. Multiple metric reading kinds may intentionally share one glyph
 * when the small status slot has the same visual meaning.
 */
export type MetricStatusIconKind =
    /** Shows percent-style usage or utilization for the parent hardware icon. */
    | "percentage"
    /** Shows temperature status for the parent hardware icon. */
    | "temperature"
    /** Shows memory/VRAM status for the parent hardware icon, such as GPU memory. */
    | "memory"
    /** Shows power or wattage status for the parent hardware icon. */
    | "power"
    /** Shows clock or frequency status for the parent hardware icon. */
    | "clock"
    /** Shows fan speed status for the parent hardware icon. */
    | "fan"
    /** Shows voltage status for the parent hardware icon. */
    | "voltage"
    /** Shows electrical current status for the parent hardware icon. */
    | "current"
    /** Shows stored data, capacity, or byte-count status for the parent hardware icon. */
    | "data"
    /** Shows transfer-rate status for the parent hardware icon. */
    | "throughput"
    /** Shows timing or latency status for the parent hardware icon. */
    | "timing"
    /** Shows level-style status for the parent hardware icon. */
    | "level"
    /** Shows control or configured-state status for the parent hardware icon. */
    | "control";

interface MetricStatusIconDefinitionOptions {
    readonly node: IconNode;
    readonly strokeWidth: number;
    readonly opticalScale: number;
    readonly sizeRatio: number;
    readonly opticalYOffsetRatio: number;
}

const METRIC_STATUS_ICON_DEFINITION_OPTIONS_BY_KIND = {
    percentage: {
        node: Percent,
        strokeWidth: 2.45,
        opticalScale: 1.04,
        sizeRatio: 2.15,
        opticalYOffsetRatio: 0.55,
    },
    temperature: {
        node: Thermometer,
        strokeWidth: 2.45,
        opticalScale: 1.04,
        sizeRatio: 2.15,
        opticalYOffsetRatio: 0.56,
    },
    memory: {
        node: MemoryStick,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.1,
        opticalYOffsetRatio: 0.22,
    },
    power: {
        node: Zap,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.15,
        opticalYOffsetRatio: 0.5,
    },
    clock: {
        node: Clock,
        strokeWidth: 2.5,
        opticalScale: 1.06,
        sizeRatio: 2.12,
        opticalYOffsetRatio: 0.46,
    },
    fan: {
        node: Fan,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.12,
        opticalYOffsetRatio: 0.44,
    },
    voltage: {
        node: BatteryCharging,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.12,
        opticalYOffsetRatio: 0.38,
    },
    current: {
        node: Activity,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.15,
        opticalYOffsetRatio: 0.5,
    },
    data: {
        node: Database,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.12,
        opticalYOffsetRatio: 0.4,
    },
    throughput: {
        node: ArrowDownUp,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.12,
        opticalYOffsetRatio: 0.42,
    },
    timing: {
        node: Timer,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.12,
        opticalYOffsetRatio: 0.42,
    },
    level: {
        node: Gauge,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.12,
        opticalYOffsetRatio: 0.44,
    },
    control: {
        node: SlidersHorizontal,
        strokeWidth: 2.5,
        opticalScale: 1.08,
        sizeRatio: 2.12,
        opticalYOffsetRatio: 0.44,
    },
} satisfies Record<MetricStatusIconKind, MetricStatusIconDefinitionOptions>;

export function getMetricStatusIconDefinition(kind: MetricStatusIconKind): ProgressCircleStatusIcon {
    const iconOptions = METRIC_STATUS_ICON_DEFINITION_OPTIONS_BY_KIND[kind];

    return {
        ...createLucideIconDefinition({
            id: `status.${kind}`,
            node: iconOptions.node,
            strokeWidth: iconOptions.strokeWidth,
            opticalScale: iconOptions.opticalScale,
        }),
        sizeRatio: iconOptions.sizeRatio,
        opticalYOffsetRatio: iconOptions.opticalYOffsetRatio,
    };
}

export function isMetricStatusIconKind(kind: string): kind is MetricStatusIconKind {
    return kind in METRIC_STATUS_ICON_DEFINITION_OPTIONS_BY_KIND;
}
