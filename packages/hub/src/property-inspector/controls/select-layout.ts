export type SelectListboxPlacement = "bottom" | "top";

export interface SelectListboxLayout {
    readonly maxHeight: number;
    readonly placement: SelectListboxPlacement;
}

interface SelectListboxLayoutInput {
    readonly optionCount: number;
    readonly optionHeightPixels?: number | undefined;
    readonly triggerRect: Pick<DOMRectReadOnly, "bottom" | "top">;
    readonly viewportHeight: number;
}

const LISTBOX_GAP_PIXELS = 3;
const LISTBOX_FALLBACK_MAX_HEIGHT_PIXELS = 320;
const LISTBOX_VIEWPORT_MARGIN_PIXELS = 8;
const LISTBOX_BORDER_PIXELS = 2;
const LISTBOX_VERTICAL_PADDING_PIXELS = 6;

export const DEFAULT_SELECT_OPTION_HEIGHT_PIXELS = 28;

export const DEFAULT_SELECT_LISTBOX_LAYOUT: SelectListboxLayout = {
    maxHeight: LISTBOX_FALLBACK_MAX_HEIGHT_PIXELS,
    placement: "bottom",
};

export function resolveSelectListboxLayout({
    optionCount,
    optionHeightPixels = DEFAULT_SELECT_OPTION_HEIGHT_PIXELS,
    triggerRect,
    viewportHeight,
}: SelectListboxLayoutInput): SelectListboxLayout {
    const desiredHeight = optionCount * optionHeightPixels
        + LISTBOX_VERTICAL_PADDING_PIXELS
        + LISTBOX_BORDER_PIXELS;
    const spaceBelow = Math.max(
        0,
        viewportHeight - triggerRect.bottom - LISTBOX_GAP_PIXELS - LISTBOX_VIEWPORT_MARGIN_PIXELS,
    );
    const spaceAbove = Math.max(0, triggerRect.top - LISTBOX_GAP_PIXELS - LISTBOX_VIEWPORT_MARGIN_PIXELS);
    const placement = spaceBelow < desiredHeight && spaceAbove > spaceBelow
        ? "top"
        : "bottom";
    const availableHeight = placement === "top" ? spaceAbove : spaceBelow;

    return {
        maxHeight: Math.max(0, Math.min(desiredHeight, availableHeight)),
        placement,
    };
}
