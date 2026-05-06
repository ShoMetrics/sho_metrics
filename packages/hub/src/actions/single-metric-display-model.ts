import type { WillAppearEvent } from "@elgato/streamdeck";
import {
    KEYPAD_PNG_SIZE,
    TOUCH_STRIP_LOGICAL_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_SQUARE_PNG_SIZE,
    WIDGET_LOGICAL_SIZE,
    type DualChannelWidgetData,
    type KeySize,
    type WidgetData,
} from "../rendering/widget-data";
import type { ArcGaugeStatusIcon } from "../widgets/primitives/arc-gauge";
import {
    resolveMetricVisualSettings,
    type MetricVisualSettings,
    type ResolvedMetricVisualSettings,
    type SettingValue,
} from "./metric-visual-settings";

interface BaseMetricDisplayOptions {
    event: WillAppearEvent;
    metricKey: string;
    centerIconFragment: string;
    linearIconFragment?: string;
    statusIcon: ArcGaugeStatusIcon;
    circularCenterContentOverride?: "value" | "icon" | "icon-value-unit";
    visualSettingsOverride?: Partial<MetricVisualSettings>;
}

export interface SingleMetricDisplayOptions extends BaseMetricDisplayOptions {
    widgetData: WidgetData;
}

export interface DualMetricDisplayOptions extends BaseMetricDisplayOptions {
    widgetData: DualChannelWidgetData;
    titleText: string;
    dualGraphicType?: "circular" | "dashed-line";
    chartMode?: "overlay" | "mirrored";
    positiveColor: string;
    negativeColor: string;
    positiveIconFragment?: string;
    negativeIconFragment?: string;
    positiveStatusIcon?: ArcGaugeStatusIcon;
    negativeStatusIcon?: ArcGaugeStatusIcon;
}

export interface SingleMetricDisplaySettings extends MetricVisualSettings {
    circularCenterContent?: SettingValue;
}

export type MetricDisplayOptions = SingleMetricDisplayOptions | DualMetricDisplayOptions;

export type TouchStripMetricLayoutKind = "square" | "wide";

export interface TouchStripMetricLayout {
    kind: TouchStripMetricLayoutKind;
    layoutPath: string;
    renderSize: KeySize;
    pngSize: KeySize;
}

export interface MetricDisplayRenderPlan {
    visualSettings: ResolvedMetricVisualSettings;
    centerContent: "value" | "icon" | "icon-value-unit";
    displayHasData: boolean;
    shouldRenderMutedIconPlaceholder: boolean;
    touchStripMetricLayout: TouchStripMetricLayout | null;
    renderSize: KeySize;
    pngSize: KeySize;
}

const TOUCH_STRIP_METRIC_LAYOUTS: Record<TouchStripMetricLayoutKind, TouchStripMetricLayout> = {
    square: {
        kind: "square",
        layoutPath: "layouts/single-metric-touchstrip-square.json",
        renderSize: WIDGET_LOGICAL_SIZE,
        pngSize: TOUCH_STRIP_SINGLE_METRIC_SQUARE_PNG_SIZE,
    },
    wide: {
        kind: "wide",
        layoutPath: "layouts/single-metric-touchstrip-wide.json",
        renderSize: TOUCH_STRIP_LOGICAL_SIZE,
        pngSize: TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
    },
};

export function buildMetricDisplayRenderPlan(options: {
    displayOptions: MetricDisplayOptions;
    settings: SingleMetricDisplaySettings;
    isDial: boolean;
}): MetricDisplayRenderPlan {
    const visualSettings = resolveMetricVisualSettings({
        ...options.settings,
        ...options.displayOptions.visualSettingsOverride,
    });
    const centerContent = resolveCircularCenterContent({
        settings: options.settings,
        graphicType: visualSettings.graphicType,
        circularCenterContentOverride: options.displayOptions.circularCenterContentOverride,
    });
    const displayHasData = hasMetricDisplayData(options.displayOptions);
    const shouldRenderMutedIconPlaceholder = !displayHasData
        && !isDualMetricDisplayOptions(options.displayOptions)
        && visualSettings.graphicType === "circular"
        && centerContent === "icon";
    const touchStripMetricLayout = options.isDial
        ? resolveTouchStripMetricLayout(visualSettings)
        : null;

    return {
        visualSettings,
        centerContent,
        displayHasData,
        shouldRenderMutedIconPlaceholder,
        touchStripMetricLayout,
        renderSize: touchStripMetricLayout?.renderSize ?? WIDGET_LOGICAL_SIZE,
        pngSize: touchStripMetricLayout?.pngSize ?? KEYPAD_PNG_SIZE,
    };
}

export function resolveCircularCenterContent(options: {
    settings: SingleMetricDisplaySettings;
    graphicType: ResolvedMetricVisualSettings["graphicType"];
    circularCenterContentOverride: "value" | "icon" | "icon-value-unit" | undefined;
}): "value" | "icon" | "icon-value-unit" {
    if (options.graphicType !== "circular") {
        return "value";
    }

    return options.circularCenterContentOverride
        ?? (options.settings.circularCenterContent === "icon" ? "icon" : "value");
}

export function buildRenderWidgetData(options: {
    widgetData: WidgetData;
    hasData: boolean;
    shouldRenderMutedIconPlaceholder: boolean;
}): WidgetData {
    if (options.hasData || options.shouldRenderMutedIconPlaceholder) {
        return options.widgetData;
    }

    return {
        ...options.widgetData,
        current: 0,
        progress: 0,
        history: [],
        unit: "",
        displayValue: "N/A",
    };
}

export function buildRenderDualChannelWidgetData(options: {
    widgetData: DualChannelWidgetData;
    hasData: boolean;
}): DualChannelWidgetData {
    if (!options.hasData) {
        return {
            positive: buildPlaceholderChannelWidgetData(options.widgetData.positive, "N/A"),
            negative: buildPlaceholderChannelWidgetData(options.widgetData.negative, "N/A"),
        };
    }

    return {
        positive: options.widgetData.positive.sampleTimestampMilliseconds == null
            ? buildZeroChannelWidgetData(options.widgetData.positive, options.widgetData.negative.history.length)
            : options.widgetData.positive,
        negative: options.widgetData.negative.sampleTimestampMilliseconds == null
            ? buildZeroChannelWidgetData(options.widgetData.negative, options.widgetData.positive.history.length)
            : options.widgetData.negative,
    };
}

export function isDualMetricDisplayOptions(options: MetricDisplayOptions): options is DualMetricDisplayOptions {
    return "positiveColor" in options;
}

export function hasMetricDisplayData(options: MetricDisplayOptions): boolean {
    if (isDualMetricDisplayOptions(options)) {
        return options.widgetData.positive.sampleTimestampMilliseconds != null
            || options.widgetData.negative.sampleTimestampMilliseconds != null;
    }

    return options.widgetData.sampleTimestampMilliseconds != null;
}

export function resolveDisplayLogValue(widgetData: WidgetData | DualChannelWidgetData): number {
    if (isDualChannelWidgetData(widgetData)) {
        return widgetData.positive.current + widgetData.negative.current;
    }

    return widgetData.current;
}

export function resolveDisplaySampleTimestampMilliseconds(widgetData: WidgetData | DualChannelWidgetData): number | undefined {
    if (isDualChannelWidgetData(widgetData)) {
        return widgetData.positive.sampleTimestampMilliseconds
            ?? widgetData.negative.sampleTimestampMilliseconds;
    }

    return widgetData.sampleTimestampMilliseconds;
}

export function resolveTouchStripMetricLayout(settings: ResolvedMetricVisualSettings): TouchStripMetricLayout {
    if (settings.graphicType === "circular") {
        return TOUCH_STRIP_METRIC_LAYOUTS.square;
    }

    // Touch strip layouts encode both Stream Deck feedback rect and render target
    // size. Add a new layout kind when a future visual needs a different contract,
    // for example two centered circles in one 200x100 touch strip region.
    return TOUCH_STRIP_METRIC_LAYOUTS.wide;
}

function buildPlaceholderChannelWidgetData(widgetData: WidgetData, displayValue: string): WidgetData {
    return {
        ...widgetData,
        current: 0,
        progress: 0,
        history: [],
        unit: "",
        displayValue,
    };
}

function buildZeroChannelWidgetData(widgetData: WidgetData, referenceHistoryLength: number): WidgetData {
    return {
        ...widgetData,
        current: 0,
        progress: 0,
        history: Array.from({ length: Math.max(2, referenceHistoryLength) }, () => 0),
        displayValue: "0",
    };
}

function isDualChannelWidgetData(widgetData: WidgetData | DualChannelWidgetData): widgetData is DualChannelWidgetData {
    return "positive" in widgetData && "negative" in widgetData;
}
