import type { WidgetData, KeySize } from "../view-rendering/widget-data";
import type { ColorConfig } from "../view-rendering/color/color-resolver";

/** Base config shared by all widget primitives. */
export interface WidgetBaseConfig {
    colorConfig: ColorConfig;
    gradientHeadAdjustmentPercent?: number;
}

/** Renders WidgetData plus primitive config into an SVG fragment string. */
export interface Widget<TConfig extends WidgetBaseConfig = WidgetBaseConfig> {
    readonly widgetId: string;
    render(data: WidgetData, config: TConfig, keySize: KeySize): string;
}

export type ThemePresetName =
    | "flat"
    | "cupertino-glass"
    | "color-filled"
    | "pixel-window"
    | "terminal-clean"
    | "terminal-vintage";
