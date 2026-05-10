import type { ColorConfig } from "../rendering/color-resolver";
import type {
    ColorMode,
    ColorRamp,
} from "../settings/widget-settings";

export function buildColorConfigFromRamp(options: {
    colorMode: ColorMode;
    colors: ColorRamp;
    lowThreshold: number;
    highThreshold: number;
}): ColorConfig {
    return {
        mode: options.colorMode,
        solidColor: options.colors.solidColor,
        thresholds: [
            { min: 0, max: options.lowThreshold, color: options.colors.lowColor },
            { min: options.lowThreshold, max: options.highThreshold, color: options.colors.mediumColor },
            { min: options.highThreshold, max: 101, color: options.colors.highColor },
        ],
    };
}
