import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type { MetricVisualSettings } from "./visual-adapter";
import type { ResolvedGlobalAppearanceOverride, ResolvedGlobalSettings } from "./resolved-settings";

const MINIMUM_THRESHOLD = 0;
const MAXIMUM_THRESHOLD = 100;

export function applyGlobalAppearanceToVisualSettings(
    widgetSettings: MetricVisualSettings,
    globalSettings: ResolvedGlobalSettings,
): MetricVisualSettings {
    if (!globalSettings.appearanceOverride) {
        return widgetSettings;
    }

    const appearanceOverride = globalSettings.appearanceOverride;

    return {
        ...widgetSettings,
        viewLayout: appearanceOverride.viewLayout,
        circleStyle: appearanceOverride.circleStyle,
        theme: appearanceOverride.theme,
        colorMode: appearanceOverride.colorMode,
        usageColors: appearanceOverride.colors,
        lowColorThresholdPercent: appearanceOverride.lowColorThresholdPercent,
        highColorThresholdPercent: appearanceOverride.highColorThresholdPercent,
    };
}

export function buildGlobalColorConfig(appearanceOverride: ResolvedGlobalAppearanceOverride): ColorConfig {
    const colors = appearanceOverride.colors;

    return {
        mode: appearanceOverride.colorMode,
        solidColor: colors.solidColor,
        thresholds: buildThresholds({
            lowThreshold: appearanceOverride.lowColorThresholdPercent,
            highThreshold: appearanceOverride.highColorThresholdPercent,
            lowColor: colors.lowColor,
            mediumColor: colors.mediumColor,
            highColor: colors.highColor,
        }),
    };
}

function buildThresholds(options: {
    lowThreshold: number;
    highThreshold: number;
    lowColor: string;
    mediumColor: string;
    highColor: string;
}): ColorThreshold[] {
    return [
        { min: MINIMUM_THRESHOLD, max: options.lowThreshold, color: options.lowColor },
        { min: options.lowThreshold, max: options.highThreshold, color: options.mediumColor },
        { min: options.highThreshold, max: MAXIMUM_THRESHOLD + 1, color: options.highColor },
    ];
}
