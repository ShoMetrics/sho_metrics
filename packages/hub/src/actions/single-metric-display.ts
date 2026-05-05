import type { WillAppearEvent } from "@elgato/streamdeck";
import { composeDualChannelSvg, composeSvg } from "../rendering/composer";
import { rasterizeSvgToPngDataUrl } from "../rendering/rasterizer";
import type { DualChannelWidgetData, WidgetData } from "../rendering/widget-data";
import {
    buildMetricDisplayRenderPlan,
    buildRenderDualChannelWidgetData,
    buildRenderWidgetData,
    isDualMetricDisplayOptions,
    resolveDisplayLogValue,
    resolveDisplaySampleTimestampMilliseconds,
    type DualMetricDisplayOptions,
    type MetricDisplayOptions,
    type SingleMetricDisplayOptions,
    type SingleMetricDisplaySettings,
    type TouchStripMetricLayout,
} from "./single-metric-display-model";
import type { ResolvedMetricVisualSettings } from "./metric-visual-settings";
import type { ArcGaugeStatusIcon } from "../widgets/primitives/arc-gauge";
import { logger } from "../logging/logger";

const log = logger.for("SingleMetricDisplay");

const MAX_CONCURRENT_DISPLAY_UPDATES = 1;

const displayActionStates = new Map<string, DisplayActionState>();
const displayActionQueue: string[] = [];
let activeDisplayUpdateCount = 0;
let isDisplayQueueDrainScheduled = false;

interface DisplayActionState {
    actionId: string;
    isRenderInFlight: boolean;
    isQueued: boolean;
    active: boolean;
    pendingOptions: MetricDisplayOptions | null;
    touchStripLayoutPromise: Promise<void> | null;
    touchStripLayoutPath: string | null;
    lastRenderedSvg: string | null;
}

export function setSingleMetricDisplay(options: SingleMetricDisplayOptions): void {
    const displayActionState = getOrCreateDisplayActionState(options.event.action.id);

    displayActionState.pendingOptions = options;
    enqueueDisplayAction(displayActionState);
}

export function setDualMetricDisplay(options: DualMetricDisplayOptions): void {
    const displayActionState = getOrCreateDisplayActionState(options.event.action.id);

    displayActionState.pendingOptions = options;
    enqueueDisplayAction(displayActionState);
}

export function clearSingleMetricDisplayState(actionId: string): void {
    const displayActionState = displayActionStates.get(actionId);

    if (!displayActionState) {
        return;
    }

    displayActionState.active = false;
    displayActionState.isQueued = false;
    displayActionState.pendingOptions = null;
    displayActionState.touchStripLayoutPromise = null;
    displayActionState.touchStripLayoutPath = null;
    displayActionStates.delete(actionId);
}

function renderAndSendSingleMetricDisplay(
    displayActionState: DisplayActionState,
    options: MetricDisplayOptions,
): void {
    displayActionState.isRenderInFlight = true;
    displayActionState.pendingOptions = null;
    activeDisplayUpdateCount += 1;

    const renderStartTimestampMilliseconds = Date.now();
    const settings = options.event.payload.settings as SingleMetricDisplaySettings;
    const renderPlan = buildMetricDisplayRenderPlan({
        displayOptions: options,
        settings,
        isDial: options.event.action.isDial(),
    });

    if (options.event.action.isKey()) {
        options.event.action.setTitle("").catch(error => {
            log.error(() => `Failed to clear key title: ${error}`);
        });
    }

    let renderedMetricData: WidgetData | DualChannelWidgetData;
    let svg: string;

    if (isDualMetricDisplayOptions(options)) {
        const renderDualWidgetData = buildRenderDualChannelWidgetData({
            widgetData: options.widgetData,
            hasData: renderPlan.displayHasData,
        });
        renderedMetricData = renderDualWidgetData;
        svg = composeDualChannelSvg(renderDualWidgetData, {
            graphicStyle: renderPlan.visualSettings.graphicStyle,
            muted: false,
            configOverrides: buildDualMetricConfigOverrides({
                positiveColor: options.positiveColor,
                negativeColor: options.negativeColor,
                titleText: options.titleText,
                chartMode: options.chartMode ?? "overlay",
                topIconFragment: options.centerIconFragment,
                positiveIconFragment: options.positiveIconFragment,
                negativeIconFragment: options.negativeIconFragment,
                lineSmoothingPercent: renderPlan.visualSettings.lineSmoothingPercent,
                gridLineVisibility: renderPlan.visualSettings.gridLineVisibility,
                gridLineType: renderPlan.visualSettings.gridLineType,
            }),
        }, renderPlan.renderSize);
    } else {
        const renderSingleWidgetData = buildRenderWidgetData({
            widgetData: options.widgetData,
            hasData: renderPlan.displayHasData,
            shouldRenderMutedIconPlaceholder: renderPlan.shouldRenderMutedIconPlaceholder,
        });
        renderedMetricData = renderSingleWidgetData;
        svg = composeSvg(renderSingleWidgetData, {
            ...renderPlan.visualSettings,
            muted: renderPlan.shouldRenderMutedIconPlaceholder,
            configOverrides: buildSingleMetricConfigOverrides({
                centerIconFragment: options.centerIconFragment,
                linearIconFragment: options.linearIconFragment,
                statusIcon: options.statusIcon,
                centerContent: renderPlan.centerContent,
                lineSmoothingPercent: renderPlan.visualSettings.lineSmoothingPercent,
                gridLineVisibility: renderPlan.visualSettings.gridLineVisibility,
                gridLineType: renderPlan.visualSettings.gridLineType,
            }),
        }, renderPlan.renderSize);
    }
    const composeEndTimestampMilliseconds = Date.now();

    if (svg === displayActionState.lastRenderedSvg) {
        logDisplaySkippedDebug({
            actionId: options.event.action.id,
            metricKey: options.metricKey,
            renderStartTimestampMilliseconds,
            composeDurationMilliseconds: composeEndTimestampMilliseconds - renderStartTimestampMilliseconds,
        });
        finishDisplayUpdate(displayActionState);
        return;
    }

    const pngDataUrl = rasterizeSvgToPngDataUrl(svg, renderPlan.pngSize);
    const rasterizeEndTimestampMilliseconds = Date.now();

    if (!pngDataUrl) {
        finishDisplayUpdate(displayActionState);
        return;
    }

    logDisplayDebug({
        actionId: options.event.action.id,
        metricKey: options.metricKey,
        phase: "rendered",
        value: resolveDisplayLogValue(renderedMetricData),
        sampleTimestampMilliseconds: resolveDisplaySampleTimestampMilliseconds(renderedMetricData),
        renderStartTimestampMilliseconds,
        composeDurationMilliseconds: composeEndTimestampMilliseconds - renderStartTimestampMilliseconds,
        rasterizeDurationMilliseconds: rasterizeEndTimestampMilliseconds - composeEndTimestampMilliseconds,
    });

    if (options.event.action.isDial()) {
        const setFeedback = (): void => {
            if (!displayActionState.active || !options.event.action.isDial()) {
                finishDisplayUpdate(displayActionState);
                return;
            }

            const updateStartTimestampMilliseconds = Date.now();
            options.event.action.setFeedback({ metricImage: pngDataUrl })
                .then(() => {
                    displayActionState.lastRenderedSvg = svg;
                    logUpdateDoneDebug({
                        actionId: options.event.action.id,
                        metricKey: options.metricKey,
                        phase: "setFeedbackDone",
                        sampleTimestampMilliseconds: resolveDisplaySampleTimestampMilliseconds(renderedMetricData),
                        updateStartTimestampMilliseconds,
                    });
                })
                .catch(error => {
                    log.error(() => `Failed to set touch strip feedback: ${error}`);
                })
                .finally(() => {
                    finishDisplayUpdate(displayActionState);
                });
        };

        ensureTouchStripSingleMetricLayout(displayActionState, options.event, renderPlan.touchStripMetricLayout)
            .then(setFeedback)
            .catch(error => {
                log.error(() => `Failed to update touch strip metric image: ${error}`);
                finishDisplayUpdate(displayActionState);
            });
        return;
    }

    if (options.event.action.isKey()) {
        const updateStartTimestampMilliseconds = Date.now();
        options.event.action.setImage(pngDataUrl)
            .then(() => {
                displayActionState.lastRenderedSvg = svg;
                logUpdateDoneDebug({
                    actionId: options.event.action.id,
                    metricKey: options.metricKey,
                    phase: "setImageDone",
                    sampleTimestampMilliseconds: resolveDisplaySampleTimestampMilliseconds(renderedMetricData),
                    updateStartTimestampMilliseconds,
                });
            })
            .catch(error => {
                log.error(() => `Failed to set key image: ${error}`);
            })
            .finally(() => {
                finishDisplayUpdate(displayActionState);
            });
        return;
    }

    finishDisplayUpdate(displayActionState);
}

function buildSingleMetricConfigOverrides(options: {
    centerIconFragment: string;
    linearIconFragment: string | undefined;
    statusIcon: ArcGaugeStatusIcon;
    centerContent: "value" | "icon" | "icon-value-unit";
    lineSmoothingPercent: number;
    gridLineVisibility: ResolvedMetricVisualSettings["gridLineVisibility"];
    gridLineType: ResolvedMetricVisualSettings["gridLineType"];
}): {
    centerContent?: "value" | "icon" | "icon-value-unit";
    centerIconFragment?: string;
    topIconFragment?: string;
    statusIcon?: ArcGaugeStatusIcon;
    lineSmoothingPercent?: number;
    gridLineVisibility?: ResolvedMetricVisualSettings["gridLineVisibility"];
    gridLineType?: ResolvedMetricVisualSettings["gridLineType"];
} {
    return {
        centerContent: options.centerContent,
        centerIconFragment: options.centerIconFragment,
        topIconFragment: options.linearIconFragment ?? options.centerIconFragment,
        statusIcon: options.statusIcon,
        lineSmoothingPercent: options.lineSmoothingPercent,
        gridLineVisibility: options.gridLineVisibility,
        gridLineType: options.gridLineType,
    };
}

function buildDualMetricConfigOverrides(options: {
    positiveColor: string;
    negativeColor: string;
    titleText: string;
    chartMode: "overlay" | "mirrored";
    topIconFragment: string;
    positiveIconFragment: string | undefined;
    negativeIconFragment: string | undefined;
    lineSmoothingPercent: number;
    gridLineVisibility: ResolvedMetricVisualSettings["gridLineVisibility"];
    gridLineType: ResolvedMetricVisualSettings["gridLineType"];
}): {
    positiveColor: string;
    negativeColor: string;
    titleText?: string;
    chartMode?: "overlay" | "mirrored";
    topIconFragment?: string;
    positiveIconFragment?: string;
    negativeIconFragment?: string;
    lineSmoothingPercent?: number;
    gridLineVisibility?: ResolvedMetricVisualSettings["gridLineVisibility"];
    gridLineType?: ResolvedMetricVisualSettings["gridLineType"];
} {
    return {
        positiveColor: options.positiveColor,
        negativeColor: options.negativeColor,
        titleText: options.titleText,
        chartMode: options.chartMode,
        topIconFragment: options.topIconFragment,
        positiveIconFragment: options.positiveIconFragment,
        negativeIconFragment: options.negativeIconFragment,
        lineSmoothingPercent: options.lineSmoothingPercent,
        gridLineVisibility: options.gridLineVisibility,
        gridLineType: options.gridLineType,
    };
}

function getOrCreateDisplayActionState(actionId: string): DisplayActionState {
    const existingDisplayActionState = displayActionStates.get(actionId);

    if (existingDisplayActionState) {
        return existingDisplayActionState;
    }

    const displayActionState: DisplayActionState = {
        actionId,
        isRenderInFlight: false,
        isQueued: false,
        active: true,
        pendingOptions: null,
        touchStripLayoutPromise: null,
        touchStripLayoutPath: null,
        lastRenderedSvg: null,
    };
    displayActionStates.set(actionId, displayActionState);
    return displayActionState;
}

function enqueueDisplayAction(displayActionState: DisplayActionState): void {
    if (
        !displayActionState.active
        || displayActionState.isQueued
        || displayActionState.isRenderInFlight
    ) {
        return;
    }

    displayActionState.isQueued = true;
    displayActionQueue.push(displayActionState.actionId);
    scheduleDisplayQueueDrain();
}

function scheduleDisplayQueueDrain(): void {
    if (isDisplayQueueDrainScheduled) {
        return;
    }

    isDisplayQueueDrainScheduled = true;
    setImmediate(drainDisplayQueue);
}

function drainDisplayQueue(): void {
    isDisplayQueueDrainScheduled = false;

    while (
        activeDisplayUpdateCount < MAX_CONCURRENT_DISPLAY_UPDATES
        && displayActionQueue.length > 0
    ) {
        const actionId = displayActionQueue.shift();
        if (!actionId) {
            continue;
        }

        const displayActionState = displayActionStates.get(actionId);
        if (!displayActionState) {
            continue;
        }

        displayActionState.isQueued = false;

        if (
            !displayActionState.active
            || displayActionState.isRenderInFlight
            || !displayActionState.pendingOptions
        ) {
            continue;
        }

        try {
            renderAndSendSingleMetricDisplay(displayActionState, displayActionState.pendingOptions);
        } catch (error) {
            log.error(() => `Render/update error: ${String(error)}`);
            finishDisplayUpdate(displayActionState);
        }
    }

    if (displayActionQueue.length > 0 && activeDisplayUpdateCount < MAX_CONCURRENT_DISPLAY_UPDATES) {
        scheduleDisplayQueueDrain();
    }
}

function finishDisplayUpdate(displayActionState: DisplayActionState): void {
    displayActionState.isRenderInFlight = false;
    activeDisplayUpdateCount = Math.max(0, activeDisplayUpdateCount - 1);

    if (!displayActionState.active) {
        scheduleDisplayQueueDrain();
        return;
    }

    if (displayActionState.pendingOptions) {
        enqueueDisplayAction(displayActionState);
    }

    scheduleDisplayQueueDrain();
}

function ensureTouchStripSingleMetricLayout(
    displayActionState: DisplayActionState,
    event: WillAppearEvent,
    touchStripMetricLayout: TouchStripMetricLayout | null,
): Promise<void> {
    if (!event.action.isDial()) {
        return Promise.resolve();
    }

    if (!touchStripMetricLayout) {
        return Promise.resolve();
    }

    if (
        displayActionState.touchStripLayoutPromise
        && displayActionState.touchStripLayoutPath === touchStripMetricLayout.layoutPath
    ) {
        return displayActionState.touchStripLayoutPromise;
    }

    displayActionState.touchStripLayoutPath = touchStripMetricLayout.layoutPath;
    const layoutPromise = event.action.setFeedbackLayout(touchStripMetricLayout.layoutPath)
        .catch(error => {
            if (displayActionState.touchStripLayoutPath === touchStripMetricLayout.layoutPath) {
                displayActionState.touchStripLayoutPromise = null;
                displayActionState.touchStripLayoutPath = null;
            }
            throw error;
        });
    displayActionState.touchStripLayoutPromise = layoutPromise;
    return layoutPromise;
}

function logDisplayDebug(options: {
    actionId: string;
    metricKey: string;
    phase: string;
    value: number;
    sampleTimestampMilliseconds: number | undefined;
    renderStartTimestampMilliseconds: number;
    composeDurationMilliseconds: number;
    rasterizeDurationMilliseconds: number;
}): void {
    const currentTimestampMilliseconds = Date.now();
    log.debug(() => [
        options.phase,
        `actionId=${options.actionId}`,
        `metricKey=${options.metricKey}`,
        `value=${options.value.toFixed(2)}`,
        `sampleAgeMs=${formatAgeMilliseconds(options.sampleTimestampMilliseconds, currentTimestampMilliseconds)}`,
        `composeMs=${options.composeDurationMilliseconds}`,
        `rasterizeMs=${options.rasterizeDurationMilliseconds}`,
        `renderToEnqueueMs=${currentTimestampMilliseconds - options.renderStartTimestampMilliseconds}`,
    ].join(" "));
}

function logUpdateDoneDebug(options: {
    actionId: string;
    metricKey: string;
    phase: string;
    sampleTimestampMilliseconds: number | undefined;
    updateStartTimestampMilliseconds: number;
}): void {
    const currentTimestampMilliseconds = Date.now();
    log.debug(() => [
        options.phase,
        `actionId=${options.actionId}`,
        `metricKey=${options.metricKey}`,
        `sampleAgeMs=${formatAgeMilliseconds(options.sampleTimestampMilliseconds, currentTimestampMilliseconds)}`,
        `sdkPromiseMs=${currentTimestampMilliseconds - options.updateStartTimestampMilliseconds}`,
    ].join(" "));
}

function logDisplaySkippedDebug(options: {
    actionId: string;
    metricKey: string;
    renderStartTimestampMilliseconds: number;
    composeDurationMilliseconds: number;
}): void {
    const currentTimestampMilliseconds = Date.now();
    log.debug(() => [
        "skippedUnchanged",
        `actionId=${options.actionId}`,
        `metricKey=${options.metricKey}`,
        `composeMs=${options.composeDurationMilliseconds}`,
        `renderToSkipMs=${currentTimestampMilliseconds - options.renderStartTimestampMilliseconds}`,
    ].join(" "));
}

function formatAgeMilliseconds(
    sampleTimestampMilliseconds: number | undefined,
    currentTimestampMilliseconds: number,
): string {
    if (!sampleTimestampMilliseconds) {
        return "unknown";
    }

    return String(currentTimestampMilliseconds - sampleTimestampMilliseconds);
}
