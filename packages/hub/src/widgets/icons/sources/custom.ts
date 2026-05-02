import type { CustomIconOptions, SvgIconDefinition } from "../icon-types";

export function createCustomIconDefinition(options: CustomIconOptions): SvgIconDefinition {
    return {
        id: options.id,
        source: "custom",
        fragment: options.fragment,
        viewBox: options.viewBox,
        opticalScale: options.opticalScale ?? 1,
        opticalOffsetX: options.opticalOffsetX ?? 0,
        opticalOffsetY: options.opticalOffsetY ?? 0,
    };
}
