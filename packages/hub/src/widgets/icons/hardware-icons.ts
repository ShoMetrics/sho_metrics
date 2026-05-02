export type { DiskIconKind, HardwareIconKind } from "./catalog/hardware";
export type HardwareIcon = import("./icon-types").SvgIconDefinition;

import {
    getDiskIconDefinition,
    getHardwareIconDefinition,
    type DiskIconKind,
    type HardwareIconKind,
} from "./catalog/hardware";
import { renderCenteredIconFragment } from "./render-icon";
import type { SvgIconDefinition } from "./icon-types";

export function getHardwareIconFragment(kind: HardwareIconKind): string {
    return renderCenteredHardwareIconFragment(getHardwareIconDefinition(kind), 58);
}

export function renderCenteredHardwareIconFragment(icon: SvgIconDefinition, size: number): string {
    return renderCenteredIconFragment(icon, size);
}

export function getDiskIcon(kind: DiskIconKind): SvgIconDefinition {
    return getDiskIconDefinition(kind);
}

export function getDiskIconFragment(kind: DiskIconKind): string {
    return renderCenteredHardwareIconFragment(getDiskIcon(kind), 58);
}
