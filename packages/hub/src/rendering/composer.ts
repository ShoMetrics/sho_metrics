import type { WidgetData, KeySize } from "./widget-data";
import type { GraphicStyle } from "../widgets/styles/style.interface";
import type { GraphicType, GraphicStyleName } from "../widgets/widget.interface";
import { arcGauge, DEFAULT_ARC_GAUGE_CONFIG, type ArcGaugeConfig } from "../widgets/primitives/arc-gauge";
import { sparkline, DEFAULT_SPARKLINE_CONFIG, type SparklineConfig } from "../widgets/primitives/sparkline";
import { linearBar, DEFAULT_LINEAR_BAR_CONFIG, type LinearBarConfig } from "../widgets/primitives/linear-bar";
import { flatStyle } from "../widgets/styles/flat";
import { cupertinoGlassStyle } from "../widgets/styles/cupertino-glass";
import type { ColorConfig } from "./color-resolver";

export type WidgetConfigOverrides = Partial<ArcGaugeConfig & LinearBarConfig & SparklineConfig>;

interface WidgetRegistryEntry {
    render(data: WidgetData, configOverrides: WidgetConfigOverrides | undefined, keySize: KeySize): string;
}

const WIDGET_REGISTRY: Record<GraphicType, WidgetRegistryEntry> = {
    "circular": {
        render: (data, configOverrides, keySize) =>
            arcGauge.render(data, { ...DEFAULT_ARC_GAUGE_CONFIG, ...configOverrides }, keySize),
    },
    "linear": {
        render: (data, configOverrides, keySize) =>
            linearBar.render(data, { ...DEFAULT_LINEAR_BAR_CONFIG, ...configOverrides }, keySize),
    },
    "dashed-line": {
        render: (data, configOverrides, keySize) =>
            sparkline.render(data, { ...DEFAULT_SPARKLINE_CONFIG, ...configOverrides }, keySize),
    },
    "arc-gauge": {
        render: (data, configOverrides, keySize) =>
            arcGauge.render(data, { ...DEFAULT_ARC_GAUGE_CONFIG, ...configOverrides }, keySize),
    },
    "sparkline": {
        render: (data, configOverrides, keySize) =>
            sparkline.render(data, { ...DEFAULT_SPARKLINE_CONFIG, ...configOverrides }, keySize),
    },
    "linear-bar": {
        render: (data, configOverrides, keySize) =>
            linearBar.render(data, { ...DEFAULT_LINEAR_BAR_CONFIG, ...configOverrides }, keySize),
    },
    "mirrored-traffic": {
        render: () => {
            throw new Error("Mirrored traffic requires dual-channel widget data.");
        },
    },
};

const STYLE_REGISTRY: Record<GraphicStyleName, GraphicStyle> = {
    "flat": flatStyle,
    "cupertino-glass": cupertinoGlassStyle,
};

export interface ComposeOptions {
    graphicType: GraphicType;
    graphicStyle: GraphicStyleName;
    colorConfig?: ColorConfig;
    configOverrides?: WidgetConfigOverrides;
}

export function composeSvg(
    data: WidgetData,
    options: ComposeOptions,
    keySize: KeySize,
): string {
    const widgetEntry = WIDGET_REGISTRY[options.graphicType];
    const style = STYLE_REGISTRY[options.graphicStyle] ?? flatStyle;
    const configOverrides: WidgetConfigOverrides = {
        ...options.configOverrides,
    };

    if (options.colorConfig) {
        configOverrides.colorConfig = options.colorConfig;
    }

    const widgetSvgFragment = widgetEntry.render(data, configOverrides, keySize);

    return `<svg xmlns="http://www.w3.org/2000/svg"
        width="${keySize.width}" height="${keySize.height}"
        viewBox="0 0 ${keySize.width} ${keySize.height}">
        <defs>${style.renderDefs(keySize)}</defs>
        ${style.renderBackground(keySize)}
        ${widgetSvgFragment}
        ${style.renderOverlay(keySize)}
    </svg>`;
}
