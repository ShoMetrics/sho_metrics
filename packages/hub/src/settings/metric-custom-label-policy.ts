import type { MetricView } from "./resolved-settings";

export type MetricCustomLabelKeyShape = "square" | "touchStrip";

/**
 * Maximum stored user label length committed by PI text inputs.
 *
 * View-specific caps are applied only when rendering. Keeping the input limit
 * larger avoids blocking IME composition and avoids rewriting settings when a
 * user switches between views with different fitting limits.
 */
export const METRIC_CUSTOM_LABEL_INPUT_MAXIMUM_CHARACTERS = 128;

/** Resolves the render target shape that controls label fitting width. */
export function resolveMetricCustomLabelKeyShape(options: {
    readonly selectedView: MetricView;
    readonly isTouchStrip: boolean;
}): MetricCustomLabelKeyShape {
    if (!options.isTouchStrip) {
        return "square";
    }

    // Touch strip circle views render inside a square body placed in a wide
    // frame, so their label has the same usable width as a keypad circle.
    return options.selectedView === "circle" ? "square" : "touchStrip";
}

/**
 * Resolves the rendered label cap for the current view.
 *
 * This shared policy only decides how many user-entered characters are allowed
 * to participate in a view. The SVG primitives still own pixel fitting and final
 * clipping because font metrics and theme effects live in the rendering layer.
 */
export function resolveMetricCustomLabelDisplayMaximumCharacters(options: {
    readonly selectedView: MetricView;
    readonly keyShape: MetricCustomLabelKeyShape;
}): number {
    switch (options.selectedView) {
        case "bar":
            return options.keyShape === "touchStrip" ? 24 : 12;
        case "text":
            return 12;
        case "circle":
        case "line":
            return options.keyShape === "touchStrip" ? 16 : 8;
        default:
            return assertNever(options.selectedView);
    }
}

/** Trims and caps a label by Unicode code point without writing an empty label. */
export function limitMetricCustomLabelCharacters(
    label: string,
    maximumCharacters: number,
): string | undefined {
    const limitedLabel = Array.from(label.trim())
        .slice(0, maximumCharacters)
        .join("")
        .trim();

    return limitedLabel.length === 0 ? undefined : limitedLabel;
}

/** Normalizes stored custom-label input using the PI commit-time limit. */
export function normalizeMetricCustomLabelInput(label: string): string | undefined {
    return limitMetricCustomLabelCharacters(label, METRIC_CUSTOM_LABEL_INPUT_MAXIMUM_CHARACTERS);
}

function assertNever(value: never): never {
    throw new Error(`Unexpected metric custom label policy value: ${JSON.stringify(value)}`);
}
