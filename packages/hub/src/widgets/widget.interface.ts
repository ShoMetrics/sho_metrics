import type { WidgetData, KeySize } from "../rendering/widget-data";
import type { ColorConfig } from "../rendering/color-resolver";

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

export type GraphicThemePresetName = "flat" | "cupertino-glass" | "color-filled" | "old-crt";
