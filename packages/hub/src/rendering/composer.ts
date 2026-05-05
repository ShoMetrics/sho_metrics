import type { DualChannelWidgetData, WidgetData, KeySize } from "./widget-data";
import type { GraphicStyle } from "../widgets/styles/style.interface";
import type { GraphicThemePresetName, GraphicType } from "../widgets/widget.interface";
import { arcGauge, DEFAULT_ARC_GAUGE_CONFIG, type ArcGaugeConfig } from "../widgets/primitives/arc-gauge";
import { sparkline, DEFAULT_SPARKLINE_CONFIG, type SparklineConfig } from "../widgets/primitives/sparkline";
import { linearBar, DEFAULT_LINEAR_BAR_CONFIG, type LinearBarConfig } from "../widgets/primitives/linear-bar";
import {
    DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG,
    renderDualChannelSparkline,
    type DualChannelSparklineConfig,
} from "../widgets/primitives/dual-channel-sparkline";
import { flatStyle } from "../widgets/styles/flat";
import { cupertinoGlassStyle } from "../widgets/styles/cupertino-glass";
import type { ColorConfig } from "./color-resolver";

export type WidgetConfigOverrides = Partial<ArcGaugeConfig & LinearBarConfig & SparklineConfig & DualChannelSparklineConfig>;

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

const THEME_PRESET_REGISTRY: Record<GraphicThemePresetName, GraphicStyle> = {
    "flat": flatStyle,
    "cupertino-glass": cupertinoGlassStyle,
};

export interface ComposeOptions {
    graphicType: GraphicType;
    /**
     * Persisted setting name is still `graphicStyle`, but the value now
     * represents a theme preset/treatment rather than a widget primitive.
     */
    graphicStyle: GraphicThemePresetName;
    colorConfig?: ColorConfig;
    configOverrides?: WidgetConfigOverrides;
    muted?: boolean;
}

export function composeSvg(
    data: WidgetData,
    options: ComposeOptions,
    keySize: KeySize,
): string {
    const widgetEntry = WIDGET_REGISTRY[options.graphicType];
    const configOverrides: WidgetConfigOverrides = {
        ...options.configOverrides,
    };

    if (options.colorConfig) {
        configOverrides.colorConfig = options.colorConfig;
    }

    const widgetSvgFragment = widgetEntry.render(data, configOverrides, keySize);
    return composeStyledSvg({
        widgetSvgFragment,
        graphicStyle: options.graphicStyle,
        muted: options.muted === true,
        keySize,
    });
}

export function composeDualChannelSvg(
    data: DualChannelWidgetData,
    options: Omit<ComposeOptions, "graphicType" | "colorConfig">,
    keySize: KeySize,
): string {
    const configOverrides: WidgetConfigOverrides = {
        ...options.configOverrides,
    };
    const widgetSvgFragment = renderDualChannelSparkline(
        data,
        { ...DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG, ...configOverrides },
        keySize,
    );

    return composeStyledSvg({
        widgetSvgFragment,
        graphicStyle: options.graphicStyle,
        muted: options.muted === true,
        keySize,
    });
}

function composeStyledSvg(options: {
    widgetSvgFragment: string;
    graphicStyle: GraphicThemePresetName;
    muted: boolean;
    keySize: KeySize;
}): string {
    const style = THEME_PRESET_REGISTRY[options.graphicStyle] ?? flatStyle;
    const filterId = `muted-widget-${options.keySize.width}-${options.keySize.height}`;
    const mutedDefs = options.muted
        ? `
            <filter id="${filterId}" color-interpolation-filters="sRGB">
                <feColorMatrix type="saturate" values="0" />
                <feComponentTransfer>
                    <feFuncA type="linear" slope="0.38" />
                </feComponentTransfer>
            </filter>
        `
        : "";
    const renderedWidgetFragment = options.muted
        ? `<g filter="url(#${filterId})">${options.widgetSvgFragment}</g>`
        : options.widgetSvgFragment;

    return `<svg xmlns="http://www.w3.org/2000/svg"
        width="${options.keySize.width}" height="${options.keySize.height}"
        viewBox="0 0 ${options.keySize.width} ${options.keySize.height}">
        <defs>${style.renderDefs(options.keySize)}${mutedDefs}</defs>
        ${style.renderBackground(options.keySize)}
        ${renderedWidgetFragment}
        ${style.renderOverlay(options.keySize)}
    </svg>`;
}
