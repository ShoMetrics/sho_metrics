import type { AppearanceColorRampKey, ColorRamp } from "../../settings/widget-settings";
import type { AppearanceColorTarget } from "../types";

export function appearanceColorTarget(
    rampKey: AppearanceColorRampKey,
    colorKey: keyof ColorRamp,
): AppearanceColorTarget {
    return { rampKey, colorKey };
}
