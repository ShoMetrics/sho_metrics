import type { ColorCompensationStepId } from "./types";

export type ColorCompensationSampleFocus =
    | ColorCompensationStepId
    | "preflight"
    | "review";

export interface ColorCompensationSampleSwatch {
    readonly color: string;
    readonly label: string;
}

export const COLOR_COMPENSATION_SAMPLE_SWATCHES = {
    red: { color: "#E74C3C", label: "Red" },
    yellow: { color: "#F1C40F", label: "Yellow" },
    green: { color: "#2ECC71", label: "Green" },
    blue: { color: "#3498DB", label: "Blue" },
    middleGray: { color: "#808080", label: "Middle gray" },
    darkRed: { color: "#3a1414", label: "Dark red" },
    darkGray: { color: "#262626", label: "Dark gray" },
    darkBlue: { color: "#142136", label: "Dark blue" },
    darkGreen: { color: "#142a1d", label: "Dark green" },
} as const satisfies Record<string, ColorCompensationSampleSwatch>;
