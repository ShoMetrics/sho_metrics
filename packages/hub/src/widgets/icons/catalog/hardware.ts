import { CircleQuestionMark, Cpu, Gpu, HardDrive, MemoryStick } from "lucide";
import { createLucideIconDefinition } from "../sources/lucide";
import { createCustomIconDefinition } from "../sources/custom";
import type { SvgIconDefinition } from "../icon-types";

export type HardwareIconKind = "cpu" | "gpu" | "memory" | "disk" | "unknown";
export type DiskIconKind = "ssd" | "hdd" | "network" | "unknown";

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
    if (kind === "network") {
        return getNetworkDriveIconDefinition();
    }

    return createLucideIconDefinition({
        id: `hardware.disk.${kind}`,
        node: HardDrive,
        opticalScale: 1.08,
    });
}

function getNetworkDriveIconDefinition(): SvgIconDefinition {
    return createCustomIconDefinition({
        id: "hardware.disk.network",
        viewBox: { x: 0, y: 0, width: 24, height: 24 },
        opticalScale: 1.08,
        fragment: `
            <!--
              Icon: Network Drive
              Based on Lucide "hard-drive"
              Source: https://lucide.dev/
              License: ISC (https://opensource.org/licenses/ISC)
              Modified by: Sho Metrics Contributor
            -->
            <g fill="none" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M2.212 9.577a2 2 0 0 0-.212.896V16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 3.11A2 2 0 0 0 16.76 2H7.24a2 2 0 0 0-1.79 1.11z" />
                <path d="M21.946 10.013H2.054" />
                <path d="M10 14h.01" />
                <path d="M6 14h.01" />
                <path d="M12 18v4" />
                <path d="M2 22h20" />
                <circle cx="12" cy="22" r="1.7" fill="currentColor" stroke="none" />
            </g>
        `,
    });
}

function getUnknownHardwareIconDefinition(): SvgIconDefinition {
    return createLucideIconDefinition({
        id: "hardware.unknown",
        node: CircleQuestionMark,
        opticalScale: 1,
    });
}
