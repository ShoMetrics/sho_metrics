import type { ColorConfig } from "./color-resolver";
import { renderDualMetricBodyView } from "./dual-metric-view";
import { renderMetricFrame, resolveThemeBodyViewport, type MetricFrameBody } from "./metric-frame";
import { renderMetricNoticeBody } from "./metric-notice-body";
import type { MetricRenderAppearance } from "./render-appearance";
import { formatRenderUnitText } from "./text-content/render-unit-text";
import { renderSingleMetricBodyView } from "./single-metric-view";
import {
    KEYPAD_PNG_SIZE,
    PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    TOUCH_STRIP_LOGICAL_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
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
import type { ThemeBodyViewport } from "../widgets/styles/theme-style";

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
    /** Static action-owned notice rendered instead of the selected metric primitive. */
    noticeText?: string;
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

export type TouchStripMetricLayoutKind = "wide" | "wide-frame-square-body" | "wide-frame-two-square-bodies";

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
    bodyRenderSize: KeySize;
    bodyViewport: ThemeBodyViewport | undefined;
    bodyViewports: readonly ThemeBodyViewport[];
    pngSize: KeySize;
}

export interface MetricViewFrame {
    readonly svg: string;
    readonly renderedMetricData: WidgetData | DualChannelWidgetData;
    readonly renderPlan: MetricViewRenderPlan;
}

interface RenderedMetricBodies {
    readonly bodies: readonly MetricFrameBody[];
    readonly renderedMetricData: WidgetData | DualChannelWidgetData;
}

interface BodyArea {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly height: number;
    readonly clipRadius?: number;
}

const TOUCH_STRIP_METRIC_LAYOUTS: Record<TouchStripMetricLayoutKind, TouchStripMetricLayout> = {
    wide: {
        kind: "wide",
        layoutPath: "layouts/single-metric-touchstrip-wide.json",
        renderSize: TOUCH_STRIP_LOGICAL_SIZE,
        pngSize: TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
    },
    "wide-frame-square-body": {
        kind: "wide-frame-square-body",
        layoutPath: "layouts/single-metric-touchstrip-wide.json",
        renderSize: TOUCH_STRIP_LOGICAL_SIZE,
        pngSize: TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
    },
    "wide-frame-two-square-bodies": {
        kind: "wide-frame-two-square-bodies",
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
            bodies: body.bodies,
            themePreset: renderPlan.renderAppearance.themePreset,
            themePaints: renderPlan.renderAppearance.paints,
            themeChromeOpacity: renderPlan.renderAppearance.transparentSurface.backgroundOpacity,
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
    const singleMetricOptions = isDualMetricRenderOptions(options.viewOptions)
        ? undefined
        : options.viewOptions;
    const dualRenderPrimitive = isDualMetricRenderOptions(options.viewOptions)
        ? options.viewOptions.dualRenderPrimitive
        : undefined;
    const shouldRenderMutedIconPlaceholder = singleMetricOptions?.noticeText === undefined
        && !viewHasData
        && singleMetricOptions !== undefined
        && renderAppearance.renderPrimitive === "circle"
        && circleVariant === "minimal";
    const touchStripMetricLayout = options.renderTarget === "touch-strip"
        ? resolveTouchStripMetricLayout({
            renderPrimitive: renderAppearance.renderPrimitive,
            dualRenderPrimitive,
        })
        : null;
    const renderSize = touchStripMetricLayout?.renderSize ?? WIDGET_LOGICAL_SIZE;
    const themeBodyViewport = resolveThemeBodyViewport({
        themePreset: renderAppearance.themePreset,
        themePaints: renderAppearance.paints,
        size: renderSize,
    });
    const bodyViewports = resolveMetricBodyViewports({
        renderSize,
        themeBodyViewport,
        touchStripMetricLayout,
    });
    const bodyViewport = bodyViewports[0];

    return {
        renderAppearance,
        centerContent,
        circleVariant,
        viewHasData,
        shouldRenderMutedIconPlaceholder,
        touchStripMetricLayout,
        renderSize,
        bodyRenderSize: bodyViewport === undefined
            ? renderSize
            : bodyViewport.body.renderSize,
        bodyViewport,
        bodyViewports,
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

/**
 * Converts action WidgetData into renderer-facing single-metric data.
 *
 * Missing samples keep the selected primitive and render `N/A`, except for the
 * explicit pending-refresh display value. Action-owned notice bodies bypass
 * this value text path through `noticeText`.
 */
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
        displayValue: resolveUnavailableRenderDisplayValue(options.widgetData),
    });
}

/** Converts dual-channel missing data into per-channel N/A placeholders. */
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

export function resolveTouchStripMetricLayout(options: {
    renderPrimitive: MetricRenderAppearance["renderPrimitive"];
    dualRenderPrimitive?: DualMetricRenderOptions["dualRenderPrimitive"];
}): TouchStripMetricLayout {
    if (options.dualRenderPrimitive === "circle") {
        return TOUCH_STRIP_METRIC_LAYOUTS["wide-frame-two-square-bodies"];
    }

    if (options.renderPrimitive === "circle") {
        return TOUCH_STRIP_METRIC_LAYOUTS["wide-frame-square-body"];
    }

    // Touch strip layouts encode both Stream Deck feedback rect and render target
    // size. Add a distinct kind whenever the body placement contract changes.
    return TOUCH_STRIP_METRIC_LAYOUTS.wide;
}

function resolveMetricBodyViewports(options: {
    renderSize: KeySize;
    themeBodyViewport: ThemeBodyViewport | undefined;
    touchStripMetricLayout: TouchStripMetricLayout | null;
}): readonly ThemeBodyViewport[] {
    if (options.touchStripMetricLayout?.kind === "wide-frame-square-body") {
        return [
            resolveWideFrameSquareBodyViewport({
                renderSize: options.renderSize,
                themeBodyViewport: options.themeBodyViewport,
            }),
        ];
    }

    if (options.touchStripMetricLayout?.kind === "wide-frame-two-square-bodies") {
        return resolveWideFrameTwoSquareBodyViewports({
            renderSize: options.renderSize,
            themeBodyViewport: options.themeBodyViewport,
        });
    }

    return options.themeBodyViewport === undefined ? [] : [options.themeBodyViewport];
}

function resolveWideFrameSquareBodyViewport(options: {
    renderSize: KeySize;
    themeBodyViewport: ThemeBodyViewport | undefined;
}): ThemeBodyViewport {
    // Only the theme-owned rectangle is reused here. Its nested body placement is
    // replaced by the centered square slot required by this touch strip mode.
    const availableBodyArea: BodyArea = options.themeBodyViewport ?? {
        xCoordinate: 0,
        yCoordinate: 0,
        width: options.renderSize.width,
        height: options.renderSize.height,
    };

    return resolveSquareBodyViewport(availableBodyArea);
}

function resolveWideFrameTwoSquareBodyViewports(options: {
    renderSize: KeySize;
    themeBodyViewport: ThemeBodyViewport | undefined;
}): readonly [ThemeBodyViewport, ThemeBodyViewport] {
    // Only the theme-owned rectangle is reused here. Its nested body placement is
    // replaced by the two square slots required by this touch strip mode.
    const availableBodyArea: BodyArea = options.themeBodyViewport ?? {
        xCoordinate: 0,
        yCoordinate: 0,
        width: options.renderSize.width,
        height: options.renderSize.height,
    };
    const leftAreaWidth = Math.floor(availableBodyArea.width / 2);
    const rightAreaWidth = availableBodyArea.width - leftAreaWidth;
    const leftBodyArea: BodyArea = {
        ...availableBodyArea,
        width: leftAreaWidth,
    };
    const rightBodyArea: BodyArea = {
        ...availableBodyArea,
        xCoordinate: availableBodyArea.xCoordinate + leftAreaWidth,
        width: rightAreaWidth,
    };

    return [
        resolveSquareBodyViewport(leftBodyArea),
        resolveSquareBodyViewport(rightBodyArea),
    ];
}

function resolveSquareBodyViewport(availableBodyArea: BodyArea): ThemeBodyViewport {
    const slotSize = Math.min(availableBodyArea.width, availableBodyArea.height);

    return {
        xCoordinate: availableBodyArea.xCoordinate + Math.floor((availableBodyArea.width - slotSize) / 2),
        yCoordinate: availableBodyArea.yCoordinate + Math.floor((availableBodyArea.height - slotSize) / 2),
        width: slotSize,
        height: slotSize,
        body: {
            xOffset: 0,
            yOffset: 0,
            renderSize: WIDGET_LOGICAL_SIZE,
        },
        clipRadius: availableBodyArea.clipRadius,
    };
}

function composeSingleMetricBody(
    options: SingleMetricRenderOptions,
    renderPlan: MetricViewRenderPlan,
): RenderedMetricBodies {
    if (options.noticeText !== undefined) {
        const renderedMetricData = buildRenderWidgetData({
            widgetData: options.widgetData,
            hasData: false,
            shouldRenderMutedIconPlaceholder: false,
        });

        return {
            bodies: [
                {
                    svg: renderMetricNoticeBody({
                        text: options.noticeText,
                        visual: renderPlan.renderAppearance,
                        renderSize: renderPlan.bodyRenderSize,
                    }),
                    bodyViewport: renderPlan.bodyViewport,
                    muted: false,
                },
            ],
            renderedMetricData,
        };
    }

    const renderedMetricData = buildRenderWidgetData({
        widgetData: options.widgetData,
        hasData: renderPlan.viewHasData,
        shouldRenderMutedIconPlaceholder: renderPlan.shouldRenderMutedIconPlaceholder,
    });

    return {
        bodies: [
            {
                svg: renderSingleMetricBodyView({
                    data: renderedMetricData,
                    visual: renderPlan.renderAppearance,
                    renderSize: renderPlan.bodyRenderSize,
                    centerIcon: options.centerIconFragment,
                    footerIcon: options.footerIconFragment,
                    topIcon: options.topIconFragment,
                    statusIcon: options.statusIcon,
                    circleVariant: renderPlan.circleVariant,
                }),
                bodyViewport: renderPlan.bodyViewport,
                muted: renderPlan.shouldRenderMutedIconPlaceholder,
            },
        ],
        renderedMetricData,
    };
}

function resolveUnavailableRenderDisplayValue(widgetData: WidgetData): string {
    switch (widgetData.unavailableDisplayValue) {
        case PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE:
            return PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE;
        default:
            return "N/A";
    }
}

function composeDualMetricBody(
    options: DualMetricRenderOptions,
    renderPlan: MetricViewRenderPlan,
): RenderedMetricBodies {
    const renderedMetricData = buildRenderDualChannelWidgetData({
        widgetData: options.widgetData,
        hasData: renderPlan.viewHasData,
    });

    if (renderPlan.bodyViewports.length === 2) {
        return composeDualTouchStripCircleBodies({
            viewOptions: options,
            renderedMetricData,
            renderPlan,
        });
    }

    return {
        bodies: [
            {
                svg: renderDualMetricBodyView({
                    data: renderedMetricData,
                    visual: renderPlan.renderAppearance,
                    renderPrimitive: options.dualRenderPrimitive ?? "sparkline",
                    renderSize: renderPlan.bodyRenderSize,
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
                bodyViewport: renderPlan.bodyViewport,
                muted: false,
            },
        ],
        renderedMetricData,
    };
}

function composeDualTouchStripCircleBodies(options: {
    viewOptions: DualMetricRenderOptions;
    renderedMetricData: DualChannelWidgetData;
    renderPlan: MetricViewRenderPlan;
}): RenderedMetricBodies {
    const positiveViewport = options.renderPlan.bodyViewports[0];
    const negativeViewport = options.renderPlan.bodyViewports[1];

    return {
        bodies: [
            {
                svg: renderDualTouchStripCircleBody({
                    widgetData: options.renderedMetricData.positive,
                    labelText: options.viewOptions.positiveLabelText,
                    color: options.viewOptions.positiveColor,
                    colorConfig: options.viewOptions.positiveColorConfig,
                    iconFragment: options.viewOptions.positiveIconFragment,
                    statusIcon: options.viewOptions.positiveStatusIcon,
                    fallbackIconFragment: options.viewOptions.centerIconFragment,
                    fallbackStatusIcon: options.viewOptions.statusIcon,
                    renderPlan: options.renderPlan,
                }),
                bodyViewport: positiveViewport,
                muted: false,
            },
            {
                svg: renderDualTouchStripCircleBody({
                    widgetData: options.renderedMetricData.negative,
                    labelText: options.viewOptions.negativeLabelText,
                    color: options.viewOptions.negativeColor,
                    colorConfig: options.viewOptions.negativeColorConfig,
                    iconFragment: options.viewOptions.negativeIconFragment,
                    statusIcon: options.viewOptions.negativeStatusIcon,
                    fallbackIconFragment: options.viewOptions.centerIconFragment,
                    fallbackStatusIcon: options.viewOptions.statusIcon,
                    renderPlan: options.renderPlan,
                }),
                bodyViewport: negativeViewport,
                muted: false,
            },
        ],
        renderedMetricData: options.renderedMetricData,
    };
}

function renderDualTouchStripCircleBody(options: {
    widgetData: WidgetData;
    labelText: string | undefined;
    color: string;
    colorConfig: ColorConfig | undefined;
    iconFragment: string | undefined;
    statusIcon: ProgressCircleStatusIcon | undefined;
    fallbackIconFragment: string;
    fallbackStatusIcon: ProgressCircleStatusIcon;
    renderPlan: MetricViewRenderPlan;
}): string {
    const labelText = options.labelText ?? options.widgetData.label;

    return renderSingleMetricBodyView({
        data: {
            ...options.widgetData,
            label: labelText,
        },
        visual: withMetricPaint(
            options.renderPlan.renderAppearance,
            options.color,
            options.colorConfig,
        ),
        renderSize: options.renderPlan.bodyRenderSize,
        centerIcon: options.iconFragment ?? options.fallbackIconFragment,
        footerIcon: options.iconFragment,
        statusIcon: options.statusIcon ?? options.fallbackStatusIcon,
        circleVariant: options.renderPlan.circleVariant,
    });
}

function withMetricPaint(
    renderAppearance: MetricRenderAppearance,
    color: string,
    colorConfig: ColorConfig | undefined,
): MetricRenderAppearance {
    return {
        ...renderAppearance,
        paints: {
            ...renderAppearance.paints,
            primaryMetric: colorConfig ?? {
                mode: "solid",
                solidColor: color,
                thresholds: [],
                isGradientEnabled: false,
            },
        },
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
