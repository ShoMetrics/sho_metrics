import type { WidgetData, KeySize } from "./widget-data";
import type { GraphicStyle } from "../widgets/styles/style.interface";
import type { Widget, WidgetBaseConfig, GraphicType, GraphicStyleName } from "../widgets/widget.interface";
import { arcGauge, DEFAULT_ARC_GAUGE_CONFIG } from "../widgets/primitives/arc-gauge";
import { sparkline, DEFAULT_SPARKLINE_CONFIG } from "../widgets/primitives/sparkline";
import { linearBar, DEFAULT_LINEAR_BAR_CONFIG } from "../widgets/primitives/linear-bar";
import { flatStyle } from "../widgets/styles/flat";
import { cupertinoGlassStyle } from "../widgets/styles/cupertino-glass";
import type { ColorConfig } from "./color-resolver";

/** Registry: graphic type → widget + default config */
const WIDGET_REGISTRY: Record<string, { widget: Widget<WidgetBaseConfig>; defaultConfig: WidgetBaseConfig }> = {
    "circular": { widget: arcGauge as unknown as Widget<WidgetBaseConfig>, defaultConfig: DEFAULT_ARC_GAUGE_CONFIG },
    "linear": { widget: linearBar as unknown as Widget<WidgetBaseConfig>, defaultConfig: DEFAULT_LINEAR_BAR_CONFIG },
    "dashed-line": { widget: sparkline as unknown as Widget<WidgetBaseConfig>, defaultConfig: DEFAULT_SPARKLINE_CONFIG },
    "arc-gauge": { widget: arcGauge as unknown as Widget<WidgetBaseConfig>, defaultConfig: DEFAULT_ARC_GAUGE_CONFIG },
    "sparkline": { widget: sparkline as unknown as Widget<WidgetBaseConfig>, defaultConfig: DEFAULT_SPARKLINE_CONFIG },
    "linear-bar": { widget: linearBar as unknown as Widget<WidgetBaseConfig>, defaultConfig: DEFAULT_LINEAR_BAR_CONFIG },
};

/** Registry: style name → style instance */
const STYLE_REGISTRY: Record<string, GraphicStyle> = {
    "flat": flatStyle,
    "cupertino-glass": cupertinoGlassStyle,
};

export interface ComposeOptions {
    graphicType: GraphicType;
    graphicStyle: GraphicStyleName;
    colorConfig?: ColorConfig;
    /** Additional config overrides merged into the widget config */
    configOverrides?: Record<string, unknown>;
}

/**
 * Compose a full SVG document from a widget primitive + graphic style.
 * Returns a complete SVG string ready for rasterization.
 */
export function composeSvg(
    data: WidgetData,
    options: ComposeOptions,
    keySize: KeySize,
): string {
    const widgetEntry = WIDGET_REGISTRY[options.graphicType];
    if (!widgetEntry) {
        throw new Error(`Unknown graphic type: ${options.graphicType}`);
    }

    const style = STYLE_REGISTRY[options.graphicStyle] ?? flatStyle;

    // Merge default config with user overrides
    const widgetConfig = {
        ...widgetEntry.defaultConfig,
        ...options.configOverrides,
    };
    if (options.colorConfig) {
        widgetConfig.colorConfig = options.colorConfig;
    }

    const widgetSvgFragment = widgetEntry.widget.render(data, widgetConfig, keySize);

    return `<svg xmlns="http://www.w3.org/2000/svg"
        width="${keySize.width}" height="${keySize.height}"
        viewBox="0 0 ${keySize.width} ${keySize.height}">
        <defs>${style.renderDefs(keySize)}</defs>
        ${style.renderBackground(keySize)}
        ${widgetSvgFragment}
        ${style.renderOverlay(keySize)}
    </svg>`;
}
