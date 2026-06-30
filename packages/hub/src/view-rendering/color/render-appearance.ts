import type { ColorConfig } from "./color-resolver";
import type { RenderTextStyles } from "../rasterize/render-text-style";
import type { RenderThemeEffectTokens } from "../rasterize/render-svg-effects";
import type { CircleVariant } from "../../widgets/primitives/progress-circle";
import type { SparklineGridLineType, SparklineGridLineVisibility } from "../../widgets/primitives/sparkline";
import type { ThemePresetName } from "../../widgets/widget-contract";

export type RenderPaintConstraint = "none" | "black-white";
export type TextMetricVariant = "centered" | "title-card";

export interface RenderPaintTokens {
    readonly background: string;
    readonly backgroundFill: RenderBackgroundFill | undefined;
    readonly surface: string;
    readonly primaryText: string;
    readonly secondaryText: string;
    readonly mutedText: string;
    readonly icon: string;
    readonly barTitleText: string;
    readonly metricValueText: string;
    readonly barValueText: string;
    readonly barUnitText: string;
    readonly barSecondaryText: string;
    readonly primaryMetric: ColorConfig;
    readonly track: string;
    readonly grid: string;
    readonly divider: string;
}

export const DEFAULT_RENDER_OUTLINE_COLOR = "#000000";

export interface RenderOutlineTokens {
    /** V1 resolves outline color to black; do not add a PI color control without a product decision. */
    readonly color: string;
    /** Single 0..1 outline value from the text/shape outline slider. */
    readonly strength: number;
}

export interface RenderTransparentSurfaceTokens {
    /** Theme-owned background and chrome opacity. Metric body content remains opaque. */
    readonly backgroundOpacity: number;
    readonly textOutline: RenderOutlineTokens;
    readonly shapeOutline: RenderOutlineTokens;
}

export const DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS: RenderTransparentSurfaceTokens = {
    backgroundOpacity: 1,
    textOutline: {
        color: DEFAULT_RENDER_OUTLINE_COLOR,
        strength: 0,
    },
    shapeOutline: {
        color: DEFAULT_RENDER_OUTLINE_COLOR,
        strength: 0,
    },
};

export type RenderBackgroundFill =
    | {
        readonly fillKind: "solid";
        readonly color: string;
        readonly isGradientEnabled: boolean;
    }
    | {
        readonly fillKind: "soft-triangle";
        readonly lowColor: string;
        readonly mediumColor: string;
        readonly highColor: string;
        readonly isGradientEnabled: boolean;
    };

export interface MetricRenderAppearance {
    readonly renderPrimitive: "circle" | "text" | "bar" | "sparkline";
    readonly circleVariant: CircleVariant;
    readonly textVariant: TextMetricVariant;
    readonly themePreset: ThemePresetName;
    readonly paintConstraint: RenderPaintConstraint;
    readonly paints: RenderPaintTokens;
    readonly textStyles: RenderTextStyles;
    readonly themeEffects: RenderThemeEffectTokens;
    readonly transparentSurface: RenderTransparentSurfaceTokens;
    readonly lineSmoothingPercent: number;
    readonly gridLineVisibility: SparklineGridLineVisibility;
    readonly gridLineType: SparklineGridLineType;
}
