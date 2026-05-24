import type { ColorConfig } from "./color-resolver";
import { renderDualMetricBodyView } from "./dual-metric-view";
import { renderMetricFrame } from "./metric-frame";
import type { MetricRenderAppearance } from "./render-appearance";
import { formatRenderUnitText } from "./text-content/render-unit-text";
import { renderSingleMetricBodyView } from "./single-metric-view";
import {
    KEYPAD_PNG_SIZE,
    TOUCH_STRIP_LOGICAL_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_SQUARE_PNG_SIZE,
    WIDGET_LOGICAL_SIZE,
    type DualChannelWidgetData,
    type KeySize,
    type WidgetData,
} from "./widget-data";
import {
    mergeResolvedAppearanceSettings,
    type ResolvedAppearanceSettingsOverride,
} from "../settings/appearance-overrides";
import { buildMetricRenderAppearance } from "../settings/render-appearance-builder";
import type { ResolvedAppearanceSettings } from "../settings/resolved-settings";
import type { ProgressCircleStatusIcon } from "../widgets/primitives/progress-circle";

interface BaseMetricRenderOptions {
    centerIconFragment: string;
    footerIconFragment?: string;
    topIconFragment?: string;
    statusIcon: ProgressCircleStatusIcon;
    circleVariantOverride?: MetricRenderAppearance["circleVariant"];
    appearanceOverride?: ResolvedAppearanceSettingsOverride;
    resolvedSettings: ResolvedAppearanceSettings;
}

export interface SingleMetricRenderOptions extends BaseMetricRenderOptions {
    widgetData: WidgetData;
}

export interface DualMetricRenderOptions extends BaseMetricRenderOptions {
    widgetData: DualChannelWidgetData;
    titleText: string;
    dualRenderPrimitive?: "circle" | "text" | "sparkline";
    chartMode?: "overlay" | "mirrored";
    positiveColor: string;
    negativeColor: string;
    positiveColorConfig?: ColorConfig;
    negativeColorConfig?: ColorConfig;
    positiveLabelText?: string;
    negativeLabelText?: string;
    positiveIconFragment?: string;
    negativeIconFragment?: string;
    positiveStatusIcon?: ProgressCircleStatusIcon;
    negativeStatusIcon?: ProgressCircleStatusIcon;
}

export type MetricRenderOptions = SingleMetricRenderOptions | DualMetricRenderOptions;
export type MetricRenderTarget = "key" | "touch-strip";

export type TouchStripMetricLayoutKind = "square" | "wide";

export interface TouchStripMetricLayout {
    kind: TouchStripMetricLayoutKind;
    layoutPath: string;
    renderSize: KeySize;
    pngSize: KeySize;
}

export interface MetricViewRenderPlan {
    renderAppearance: MetricRenderAppearance;
    centerContent: "value" | "icon";
    circleVariant: MetricRenderAppearance["circleVariant"];
    viewHasData: boolean;
    shouldRenderMutedIconPlaceholder: boolean;
    touchStripMetricLayout: TouchStripMetricLayout | null;
    renderSize: KeySize;
    pngSize: KeySize;
}

export interface MetricViewFrame {
    readonly svg: string;
    readonly renderedMetricData: WidgetData | DualChannelWidgetData;
    readonly renderPlan: MetricViewRenderPlan;
}

interface RenderedMetricBody {
    readonly svg: string;
    readonly renderedMetricData: WidgetData | DualChannelWidgetData;
    readonly muted: boolean;
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

export function composeMetricViewFrame(options: {
    viewOptions: MetricRenderOptions;
    renderTarget: MetricRenderTarget;
}): MetricViewFrame {
    const renderPlan = buildMetricViewRenderPlan(options);
    const body = isDualMetricRenderOptions(options.viewOptions)
        ? composeDualMetricBody(options.viewOptions, renderPlan)
        : composeSingleMetricBody(options.viewOptions, renderPlan);

    return {
        svg: renderMetricFrame({
            body: body.svg,
            themePreset: renderPlan.renderAppearance.themePreset,
            muted: body.muted,
            paints: renderPlan.renderAppearance.paints,
            size: renderPlan.renderSize,
        }),
        renderedMetricData: body.renderedMetricData,
        renderPlan,
    };
}

export function buildMetricViewRenderPlan(options: {
    viewOptions: MetricRenderOptions;
    renderTarget: MetricRenderTarget;
}): MetricViewRenderPlan {
    const resolvedAppearance = mergeResolvedAppearanceSettings(
        options.viewOptions.resolvedSettings,
        options.viewOptions.appearanceOverride,
    );
    const renderAppearance = buildMetricRenderAppearance(resolvedAppearance);
    const circleVariant = resolveEffectiveCircleVariant({
        renderPrimitive: renderAppearance.renderPrimitive,
        circleVariant: renderAppearance.circleVariant,
        circleVariantOverride: options.viewOptions.circleVariantOverride,
    });
    const centerContent = circleVariant === "minimal" ? "icon" : "value";
    const viewHasData = hasMetricViewData(options.viewOptions);
    const shouldRenderMutedIconPlaceholder = !viewHasData
        && !isDualMetricRenderOptions(options.viewOptions)
        && renderAppearance.renderPrimitive === "circle"
        && circleVariant === "minimal";
    const touchStripMetricLayout = options.renderTarget === "touch-strip"
        ? resolveTouchStripMetricLayout(renderAppearance)
        : null;

    return {
        renderAppearance,
        centerContent,
        circleVariant,
        viewHasData,
        shouldRenderMutedIconPlaceholder,
        touchStripMetricLayout,
        renderSize: touchStripMetricLayout?.renderSize ?? WIDGET_LOGICAL_SIZE,
        pngSize: touchStripMetricLayout?.pngSize ?? KEYPAD_PNG_SIZE,
    };
}

export function resolveEffectiveCircleVariant(options: {
    renderPrimitive: MetricRenderAppearance["renderPrimitive"];
    circleVariant: MetricRenderAppearance["circleVariant"];
    circleVariantOverride: MetricRenderAppearance["circleVariant"] | undefined;
}): MetricRenderAppearance["circleVariant"] {
    if (options.renderPrimitive !== "circle") {
        return "full-ring";
    }

    return options.circleVariantOverride ?? options.circleVariant;
}

export function buildRenderWidgetData(options: {
    widgetData: WidgetData;
    hasData: boolean;
    shouldRenderMutedIconPlaceholder: boolean;
}): WidgetData {
    if (options.hasData || options.shouldRenderMutedIconPlaceholder) {
        return formatRenderWidgetDataUnit(options.widgetData);
    }

    return formatRenderWidgetDataUnit({
        ...options.widgetData,
        current: 0,
        progress: 0,
        history: [],
        unit: "",
        displayValue: options.widgetData.unavailableDisplayValue ?? "N/A",
    });
}

export function buildRenderDualChannelWidgetData(options: {
    widgetData: DualChannelWidgetData;
    hasData: boolean;
}): DualChannelWidgetData {
    if (!options.hasData) {
        return {
            positive: formatRenderWidgetDataUnit(buildPlaceholderChannelWidgetData(options.widgetData.positive, "N/A")),
            negative: formatRenderWidgetDataUnit(buildPlaceholderChannelWidgetData(options.widgetData.negative, "N/A")),
        };
    }

    const positiveWidgetData = options.widgetData.positive.sampleTimestampMilliseconds == null
        ? buildZeroChannelWidgetData(options.widgetData.positive, options.widgetData.negative.history.length)
        : options.widgetData.positive;
    const negativeWidgetData = options.widgetData.negative.sampleTimestampMilliseconds == null
        ? buildZeroChannelWidgetData(options.widgetData.negative, options.widgetData.positive.history.length)
        : options.widgetData.negative;

    return {
        positive: formatRenderWidgetDataUnit(positiveWidgetData),
        negative: formatRenderWidgetDataUnit(negativeWidgetData),
    };
}

export function isDualMetricRenderOptions(options: MetricRenderOptions): options is DualMetricRenderOptions {
    return "positiveColor" in options;
}

export function hasMetricViewData(options: MetricRenderOptions): boolean {
    if (isDualMetricRenderOptions(options)) {
        return options.widgetData.positive.sampleTimestampMilliseconds != null
            || options.widgetData.negative.sampleTimestampMilliseconds != null;
    }

    return options.widgetData.sampleTimestampMilliseconds != null;
}

export function resolveMetricViewLogValue(widgetData: WidgetData | DualChannelWidgetData): number {
    if (isDualChannelWidgetData(widgetData)) {
        return widgetData.positive.current + widgetData.negative.current;
    }

    return widgetData.current;
}

export function resolveMetricViewSampleTimestampMilliseconds(widgetData: WidgetData | DualChannelWidgetData): number | undefined {
    if (isDualChannelWidgetData(widgetData)) {
        return widgetData.positive.sampleTimestampMilliseconds
            ?? widgetData.negative.sampleTimestampMilliseconds;
    }

    return widgetData.sampleTimestampMilliseconds;
}

export function resolveTouchStripMetricLayout(settings: MetricRenderAppearance): TouchStripMetricLayout {
    if (settings.renderPrimitive === "circle") {
        return TOUCH_STRIP_METRIC_LAYOUTS.square;
    }

    // Touch strip layouts encode both Stream Deck feedback rect and render target
    // size. Add a new layout kind when a future visual needs a different contract,
    // for example two centered circles in one 200x100 touch strip region.
    return TOUCH_STRIP_METRIC_LAYOUTS.wide;
}

function composeSingleMetricBody(
    options: SingleMetricRenderOptions,
    renderPlan: MetricViewRenderPlan,
): RenderedMetricBody {
    const renderedMetricData = buildRenderWidgetData({
        widgetData: options.widgetData,
        hasData: renderPlan.viewHasData,
        shouldRenderMutedIconPlaceholder: renderPlan.shouldRenderMutedIconPlaceholder,
    });

    return {
        svg: renderSingleMetricBodyView({
            data: renderedMetricData,
            visual: renderPlan.renderAppearance,
            renderSize: renderPlan.renderSize,
            centerIcon: options.centerIconFragment,
            footerIcon: options.footerIconFragment,
            topIcon: options.topIconFragment,
            statusIcon: options.statusIcon,
            circleVariant: renderPlan.circleVariant,
        }),
        renderedMetricData,
        muted: renderPlan.shouldRenderMutedIconPlaceholder,
    };
}

function composeDualMetricBody(
    options: DualMetricRenderOptions,
    renderPlan: MetricViewRenderPlan,
): RenderedMetricBody {
    const renderedMetricData = buildRenderDualChannelWidgetData({
        widgetData: options.widgetData,
        hasData: renderPlan.viewHasData,
    });

    return {
        svg: renderDualMetricBodyView({
            data: renderedMetricData,
            visual: renderPlan.renderAppearance,
            renderPrimitive: options.dualRenderPrimitive ?? "sparkline",
            renderSize: renderPlan.renderSize,
            titleText: options.titleText,
            chartMode: options.chartMode ?? "overlay",
            centerContent: renderPlan.centerContent,
            circleVariant: renderPlan.circleVariant,
            topIcon: options.centerIconFragment,
            positive: {
                labelText: options.positiveLabelText ?? renderedMetricData.positive.label,
                unitText: renderedMetricData.positive.unit,
                color: options.positiveColor,
                colorConfig: options.positiveColorConfig,
                icon: options.positiveIconFragment,
                statusIcon: options.positiveStatusIcon,
            },
            negative: {
                labelText: options.negativeLabelText ?? renderedMetricData.negative.label,
                unitText: renderedMetricData.negative.unit,
                color: options.negativeColor,
                colorConfig: options.negativeColorConfig,
                icon: options.negativeIconFragment,
                statusIcon: options.negativeStatusIcon,
            },
        }),
        renderedMetricData,
        muted: false,
    };
}

// Render-format units once at the frame so downstream renderers do not
// re-implement display-only rules such as C/F -> °C/°F.
function formatRenderWidgetDataUnit(widgetData: WidgetData): WidgetData {
    const formattedUnit = formatRenderUnitText(widgetData.unit);

    if (widgetData.barUnit === undefined) {
        if (formattedUnit === widgetData.unit) {
            return widgetData;
        }

        return {
            ...widgetData,
            unit: formattedUnit,
        };
    }

    const formattedBarUnit = formatRenderUnitText(widgetData.barUnit);

    if (formattedUnit === widgetData.unit && formattedBarUnit === widgetData.barUnit) {
        return widgetData;
    }

    return {
        ...widgetData,
        unit: formattedUnit,
        barUnit: formattedBarUnit,
    };
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
