import type { ResolvedAppearanceSettings } from "./resolved-settings";

export function buildSampleResolvedAppearanceSettings(
    overrides: Partial<ResolvedAppearanceSettings> = {},
): ResolvedAppearanceSettings {
    return {
        ...sampleResolvedAppearanceSettings,
        ...overrides,
    };
}

const sampleResolvedAppearanceSettings: ResolvedAppearanceSettings = {
    viewLayout: "circular",
    circleStyle: "value",
    theme: "flat",
    colorMode: "threshold",
    usageColors: {
        solidColor: "#3b82f6",
        lowColor: "#22c55e",
        mediumColor: "#eab308",
        highColor: "#ef4444",
    },
    downloadColors: {
        solidColor: "#3b82f6",
        lowColor: "#22c55e",
        mediumColor: "#3b82f6",
        highColor: "#60a5fa",
    },
    uploadColors: {
        solidColor: "#ef4444",
        lowColor: "#f97316",
        mediumColor: "#ef4444",
        highColor: "#f472b6",
    },
    diskReadColors: {
        solidColor: "#38bdf8",
        lowColor: "#22c55e",
        mediumColor: "#38bdf8",
        highColor: "#60a5fa",
    },
    diskWriteColors: {
        solidColor: "#f472b6",
        lowColor: "#f97316",
        mediumColor: "#f472b6",
        highColor: "#fb7185",
    },
    lowColorThresholdPercent: 30,
    highColorThresholdPercent: 70,
    lineSmoothingPercent: 75,
    gridLineVisibility: "adaptive",
    gridLineType: "horizontal",
};
