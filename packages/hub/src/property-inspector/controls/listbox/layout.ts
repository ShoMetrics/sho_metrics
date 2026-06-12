export type ListboxPlacement = "bottom" | "top";

export interface ListboxLayout {
    readonly maxHeight: number;
    readonly placement: ListboxPlacement;
}

interface ListboxLayoutInput {
    readonly rowCount: number;
    readonly optionHeightPixels?: number | undefined;
    readonly triggerRect: Pick<DOMRectReadOnly, "bottom" | "top">;
    readonly viewportHeight: number;
}

const LISTBOX_GAP_PIXELS = 3;
const LISTBOX_FALLBACK_MAX_HEIGHT_PIXELS = 320;
const LISTBOX_VIEWPORT_MARGIN_PIXELS = 8;
const LISTBOX_BORDER_PIXELS = 2;
const LISTBOX_VERTICAL_PADDING_PIXELS = 6;

export const DEFAULT_LISTBOX_OPTION_HEIGHT_PIXELS = 28;

export const DEFAULT_LISTBOX_LAYOUT: ListboxLayout = {
    maxHeight: LISTBOX_FALLBACK_MAX_HEIGHT_PIXELS,
    placement: "bottom",
};

/** Resolves popup placement and max height from the trigger position and row count. */
export function resolveListboxLayout({
    rowCount,
    optionHeightPixels = DEFAULT_LISTBOX_OPTION_HEIGHT_PIXELS,
    triggerRect,
    viewportHeight,
}: ListboxLayoutInput): ListboxLayout {
    const desiredHeight = rowCount * optionHeightPixels
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
