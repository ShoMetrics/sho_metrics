import { CircleDashed } from "lucide";
import { renderCenteredIconFragment } from "./render-icon";
import { createLucideIconDefinition } from "./sources/lucide";

/** Aligns the dashed circle optically when it shares a baseline with gauge text. */
export const FREE_CAPACITY_ICON_OPTICAL_Y_OFFSET_RATIO = -0.06;

/** Renders the shared dashed-circle marker for a displayed free-capacity value. */
export function renderFreeCapacityIconFragment(size: number): string {
    return renderCenteredIconFragment(createLucideIconDefinition({
        id: "capacity.free",
        node: CircleDashed,
        opticalScale: 1.08,
    }), size);
}
