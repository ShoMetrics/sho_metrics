import { CircleQuestionMark, Cpu, Gpu, HardDrive, MemoryStick } from "lucide";
import { createLucideIconDefinition } from "../sources/lucide";
import type { SvgIconDefinition } from "../icon-types";

export type HardwareIconKind = "cpu" | "gpu" | "memory" | "disk" | "unknown";
export type DiskIconKind = "ssd" | "hdd" | "unknown";

export function getHardwareIconDefinition(kind: HardwareIconKind): SvgIconDefinition {
    if (kind === "cpu") {
        return createLucideIconDefinition({
            id: "hardware.cpu",
            node: Cpu,
            opticalScale: 1.05,
        });
    }

    if (kind === "memory") {
        return createLucideIconDefinition({
            id: "hardware.memory",
            node: MemoryStick,
            opticalScale: 1.08,
            opticalOffsetY: 1,
        });
    }

    if (kind === "disk") {
        return getDiskIconDefinition("unknown");
    }

    if (kind === "gpu") {
        return createLucideIconDefinition({
            id: "hardware.gpu",
            node: Gpu,
            opticalScale: 1.08,
        });
    }

    return getUnknownHardwareIconDefinition();
}

export function getDiskIconDefinition(kind: DiskIconKind): SvgIconDefinition {
    return createLucideIconDefinition({
        id: `hardware.disk.${kind}`,
        node: HardDrive,
        opticalScale: 1.08,
    });
}

function getUnknownHardwareIconDefinition(): SvgIconDefinition {
    return createLucideIconDefinition({
        id: "hardware.unknown",
        node: CircleQuestionMark,
        opticalScale: 1,
    });
}
