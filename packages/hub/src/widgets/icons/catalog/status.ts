import { MemoryStick, Percent, Thermometer, Zap } from "lucide";
import type { ArcGaugeStatusIcon } from "../../primitives/arc-gauge";
import { createLucideIconDefinition } from "../sources/lucide";

export type MetricStatusIconKind = "percentage" | "temperature" | "memory" | "power";

export function getMetricStatusIconDefinition(kind: MetricStatusIconKind): ArcGaugeStatusIcon {
    if (kind === "temperature") {
        return {
            ...createLucideIconDefinition({
                id: "status.temperature",
                node: Thermometer,
                strokeWidth: 2.45,
                opticalScale: 1.04,
            }),
            sizeRatio: 2.15,
            opticalYOffsetRatio: 0.56,
        };
    }

    if (kind === "memory") {
        return {
            ...createLucideIconDefinition({
                id: "status.memory",
                node: MemoryStick,
                strokeWidth: 2.5,
                opticalScale: 1.08,
            }),
            sizeRatio: 2.1,
            opticalYOffsetRatio: 0.22,
        };
    }

    if (kind === "power") {
        return {
            ...createLucideIconDefinition({
                id: "status.power",
                node: Zap,
                strokeWidth: 2.5,
                opticalScale: 1.08,
            }),
            sizeRatio: 2.15,
            opticalYOffsetRatio: 0.5,
        };
    }

    return {
        ...createLucideIconDefinition({
            id: "status.percentage",
            node: Percent,
            strokeWidth: 2.45,
            opticalScale: 1.04,
        }),
        sizeRatio: 2.15,
        opticalYOffsetRatio: 0.55,
    };
}
