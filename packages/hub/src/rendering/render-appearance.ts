import type { ColorConfig } from "./color-resolver";
import type { RenderTextStyles } from "./render-text-style";
import type { RenderGraphicEffectTokens } from "./render-svg-effects";
import type { ArcGaugeStyle } from "../widgets/primitives/arc-gauge";
import type { SparklineGridLineType, SparklineGridLineVisibility } from "../widgets/primitives/sparkline";
import type { GraphicThemePresetName } from "../widgets/widget.interface";

export type RenderPaintConstraint = "none" | "black-white";

export interface RenderPaintTokens {
    readonly background: string;
    readonly backgroundFill: RenderBackgroundFill | undefined;
    readonly surface: string;
    readonly primaryText: string;
    readonly secondaryText: string;
    readonly mutedText: string;
    readonly icon: string;
    readonly linearTitleText: string;
    readonly linearValueText: string;
    readonly linearUnitText: string;
    readonly linearSecondaryText: string;
    readonly primaryMetric: ColorConfig;
    readonly track: string;
    readonly grid: string;
    readonly divider: string;
}

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
    readonly graphicType: "circular" | "text" | "linear" | "sparkline";
    readonly circleStyle: ArcGaugeStyle;
    readonly graphicStyle: GraphicThemePresetName;
    readonly paintConstraint: RenderPaintConstraint;
    readonly paints: RenderPaintTokens;
    readonly textStyles: RenderTextStyles;
    readonly graphicEffects: RenderGraphicEffectTokens;
    readonly lineSmoothingPercent: number;
    readonly gridLineVisibility: SparklineGridLineVisibility;
    readonly gridLineType: SparklineGridLineType;
}
