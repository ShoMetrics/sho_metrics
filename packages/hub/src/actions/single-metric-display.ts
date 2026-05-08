import type { WillAppearEvent } from "@elgato/streamdeck";
import { composeDualChannelSvg, composeSvg } from "../rendering/composer";
import { rasterizeSvgToPngDataUrl } from "../rendering/rasterizer";
import type { ColorConfig } from "../rendering/color-resolver";
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
import { resolveMetricVisualSettings, type ResolvedMetricVisualSettings } from "./metric-visual-settings";
import type { ArcGaugeStatusIcon } from "../widgets/primitives/arc-gauge";
import { logger } from "../logging/logger";
import { DisplayUpdateQueue } from "./display-update-queue";
import {
    DisplayPerformanceStats,
    formatDisplayPerformanceSummary,
    shouldWarnDisplayPerformanceSummary,
    type DisplayPerformanceKind,
    type DisplayPerformanceOutcome,
} from "./display-performance-stats";

const log = logger.for("SingleMetricDisplay");

const MAX_CONCURRENT_DISPLAY_UPDATES = 1;

const displayActionStates = new Map<string, DisplayActionState>();
const displayActionQueue = new DisplayUpdateQueue();
const displayPerformanceStats = new DisplayPerformanceStats();
let activeDisplayUpdateCount = 0;
let isDisplayQueueDrainScheduled = false;

interface DisplayActionState {
    actionId: string;
    isRenderInFlight: boolean;
    isQueued: boolean;
    active: boolean;
    pendingOptions: MetricDisplayOptions | null;
    pendingRequestTimestampMilliseconds: number | null;
    pendingRequestReason: DisplayRequestReason;
    pendingSettingsSignature: string | null;
    touchStripLayoutPromise: Promise<void> | null;
    touchStripLayoutPath: string | null;
    lastRenderedSvg: string | null;
    lastRequestedSettingsSignature: string | null;
}

type DisplayRequestReason = "settings-change" | "metric-tick";

export function setSingleMetricDisplay(options: SingleMetricDisplayOptions): void {
    const displayActionState = getOrCreateDisplayActionState(options.event.action.id);

    recordDisplayRequest(displayActionState, options);
    displayActionState.pendingOptions = options;
    enqueueDisplayAction(displayActionState);
}

export function setDualMetricDisplay(options: DualMetricDisplayOptions): void {
    const displayActionState = getOrCreateDisplayActionState(options.event.action.id);

    recordDisplayRequest(displayActionState, options);
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
    displayActionState.pendingRequestTimestampMilliseconds = null;
    displayActionState.pendingRequestReason = "metric-tick";
    displayActionState.pendingSettingsSignature = null;
    displayActionState.touchStripLayoutPromise = null;
    displayActionState.touchStripLayoutPath = null;
    displayActionQueue.remove(actionId);
    displayActionStates.delete(actionId);
}

function renderAndSendSingleMetricDisplay(
    displayActionState: DisplayActionState,
    options: MetricDisplayOptions,
): void {
    const requestTimestampMilliseconds = displayActionState.pendingRequestTimestampMilliseconds;
    const requestReason = displayActionState.pendingRequestReason;
    const settingsSignature = displayActionState.pendingSettingsSignature;

    displayActionState.isRenderInFlight = true;
    displayActionState.pendingOptions = null;
    displayActionState.pendingRequestTimestampMilliseconds = null;
    displayActionState.pendingRequestReason = "metric-tick";
    displayActionState.pendingSettingsSignature = null;
    activeDisplayUpdateCount += 1;

    const renderStartTimestampMilliseconds = Date.now();
    const renderPlan = buildMetricDisplayRenderPlan({
        displayOptions: options,
        isDial: options.event.action.isDial(),
    });
    const displayKind = resolveDisplayPerformanceKind(options.event);
    const titleClearRequested = options.event.action.isKey();

    if (requestReason === "settings-change") {
        log.info(() => [
            "settingsDisplayRenderStart",
            `actionId=${options.event.action.id}`,
            `metricKey=${options.metricKey}`,
            `graphicType=${renderPlan.visualSettings.graphicType}`,
            `queuedMs=${formatElapsedMilliseconds(requestTimestampMilliseconds, renderStartTimestampMilliseconds)}`,
            `activeUpdates=${activeDisplayUpdateCount}`,
            `queueLength=${displayActionQueue.length}`,
            `signature=${settingsSignature ?? "unknown"}`,
        ].join(" "));
    }

    if (titleClearRequested) {
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
            graphicType: options.dualGraphicType,
            graphicStyle: renderPlan.visualSettings.graphicStyle,
            muted: false,
            configOverrides: buildDualMetricConfigOverrides({
                positiveColor: options.positiveColor,
                negativeColor: options.negativeColor,
                positiveColorConfig: options.positiveColorConfig,
                negativeColorConfig: options.negativeColorConfig,
                titleText: options.titleText,
                chartMode: options.chartMode ?? "overlay",
                centerContent: renderPlan.centerContent,
                circleStyle: renderPlan.circleStyle,
                topIconFragment: options.centerIconFragment,
                positiveIconFragment: options.positiveIconFragment,
                negativeIconFragment: options.negativeIconFragment,
                positiveStatusIcon: options.positiveStatusIcon,
                negativeStatusIcon: options.negativeStatusIcon,
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
                footerIconFragment: options.footerIconFragment,
                linearIconFragment: options.linearIconFragment,
                statusIcon: options.statusIcon,
                centerContent: renderPlan.centerContent,
                circleStyle: renderPlan.circleStyle,
                lineSmoothingPercent: renderPlan.visualSettings.lineSmoothingPercent,
                gridLineVisibility: renderPlan.visualSettings.gridLineVisibility,
                gridLineType: renderPlan.visualSettings.gridLineType,
            }),
        }, renderPlan.renderSize);
    }
    const composeEndTimestampMilliseconds = Date.now();

    if (svg === displayActionState.lastRenderedSvg) {
        if (requestReason === "settings-change") {
            log.info(() => [
                "settingsDisplaySkippedUnchanged",
                `actionId=${options.event.action.id}`,
                `metricKey=${options.metricKey}`,
                `graphicType=${renderPlan.visualSettings.graphicType}`,
                `queuedMs=${formatElapsedMilliseconds(requestTimestampMilliseconds, renderStartTimestampMilliseconds)}`,
                `composeMs=${composeEndTimestampMilliseconds - renderStartTimestampMilliseconds}`,
                `totalMs=${formatElapsedMilliseconds(requestTimestampMilliseconds, composeEndTimestampMilliseconds)}`,
            ].join(" "));
        }

        logDisplaySkippedDebug({
            actionId: options.event.action.id,
            metricKey: options.metricKey,
            renderStartTimestampMilliseconds,
            composeDurationMilliseconds: composeEndTimestampMilliseconds - renderStartTimestampMilliseconds,
        });
        recordDisplayPerformanceSample({
            requestReason,
            displayKind,
            outcome: "skipped",
            titleClearRequested,
            requestTimestampMilliseconds,
            renderStartTimestampMilliseconds,
            composeEndTimestampMilliseconds,
            rasterizeEndTimestampMilliseconds: null,
            updateStartTimestampMilliseconds: null,
            updateEndTimestampMilliseconds: composeEndTimestampMilliseconds,
        });
        finishDisplayUpdate(displayActionState);
        return;
    }

    const pngDataUrl = rasterizeSvgToPngDataUrl(svg, renderPlan.pngSize);
    const rasterizeEndTimestampMilliseconds = Date.now();

    if (!pngDataUrl) {
        recordDisplayPerformanceSample({
            requestReason,
            displayKind,
            outcome: "failed",
            titleClearRequested,
            requestTimestampMilliseconds,
            renderStartTimestampMilliseconds,
            composeEndTimestampMilliseconds,
            rasterizeEndTimestampMilliseconds,
            updateStartTimestampMilliseconds: null,
            updateEndTimestampMilliseconds: rasterizeEndTimestampMilliseconds,
        });
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
                    const updateEndTimestampMilliseconds = Date.now();
                    displayActionState.lastRenderedSvg = svg;
                    recordDisplayPerformanceSample({
                        requestReason,
                        displayKind,
                        outcome: "rendered",
                        titleClearRequested,
                        requestTimestampMilliseconds,
                        renderStartTimestampMilliseconds,
                        composeEndTimestampMilliseconds,
                        rasterizeEndTimestampMilliseconds,
                        updateStartTimestampMilliseconds,
                        updateEndTimestampMilliseconds,
                    });
                    logSettingsUpdateDoneInfo({
                        requestReason,
                        actionId: options.event.action.id,
                        metricKey: options.metricKey,
                        phase: "setFeedbackDone",
                        graphicType: renderPlan.visualSettings.graphicType,
                        requestTimestampMilliseconds,
                        renderStartTimestampMilliseconds,
                        composeEndTimestampMilliseconds,
                        rasterizeEndTimestampMilliseconds,
                        updateStartTimestampMilliseconds,
                    });
                    logUpdateDoneDebug({
                        actionId: options.event.action.id,
                        metricKey: options.metricKey,
                        phase: "setFeedbackDone",
                        sampleTimestampMilliseconds: resolveDisplaySampleTimestampMilliseconds(renderedMetricData),
                        updateStartTimestampMilliseconds,
                    });
                })
                .catch(error => {
                    const updateEndTimestampMilliseconds = Date.now();
                    recordDisplayPerformanceSample({
                        requestReason,
                        displayKind,
                        outcome: "failed",
                        titleClearRequested,
                        requestTimestampMilliseconds,
                        renderStartTimestampMilliseconds,
                        composeEndTimestampMilliseconds,
                        rasterizeEndTimestampMilliseconds,
                        updateStartTimestampMilliseconds,
                        updateEndTimestampMilliseconds,
                    });
                    log.error(() => `Failed to set touch strip feedback: ${error}`);
                })
                .finally(() => {
                    finishDisplayUpdate(displayActionState);
                });
        };

        ensureTouchStripSingleMetricLayout(displayActionState, options.event, renderPlan.touchStripMetricLayout)
            .then(setFeedback)
            .catch(error => {
                const updateEndTimestampMilliseconds = Date.now();
                recordDisplayPerformanceSample({
                    requestReason,
                    displayKind,
                    outcome: "failed",
                    titleClearRequested,
                    requestTimestampMilliseconds,
                    renderStartTimestampMilliseconds,
                    composeEndTimestampMilliseconds,
                    rasterizeEndTimestampMilliseconds,
                    updateStartTimestampMilliseconds: null,
                    updateEndTimestampMilliseconds,
                });
                log.error(() => `Failed to update touch strip metric image: ${error}`);
                finishDisplayUpdate(displayActionState);
            });
        return;
    }

    if (options.event.action.isKey()) {
        const updateStartTimestampMilliseconds = Date.now();
        options.event.action.setImage(pngDataUrl)
            .then(() => {
                const updateEndTimestampMilliseconds = Date.now();
                displayActionState.lastRenderedSvg = svg;
                recordDisplayPerformanceSample({
                    requestReason,
                    displayKind,
                    outcome: "rendered",
                    titleClearRequested,
                    requestTimestampMilliseconds,
                    renderStartTimestampMilliseconds,
                    composeEndTimestampMilliseconds,
                    rasterizeEndTimestampMilliseconds,
                    updateStartTimestampMilliseconds,
                    updateEndTimestampMilliseconds,
                });
                logSettingsUpdateDoneInfo({
                    requestReason,
                    actionId: options.event.action.id,
                    metricKey: options.metricKey,
                    phase: "setImageDone",
                    graphicType: renderPlan.visualSettings.graphicType,
                    requestTimestampMilliseconds,
                    renderStartTimestampMilliseconds,
                    composeEndTimestampMilliseconds,
                    rasterizeEndTimestampMilliseconds,
                    updateStartTimestampMilliseconds,
                });
                logUpdateDoneDebug({
                    actionId: options.event.action.id,
                    metricKey: options.metricKey,
                    phase: "setImageDone",
                    sampleTimestampMilliseconds: resolveDisplaySampleTimestampMilliseconds(renderedMetricData),
                    updateStartTimestampMilliseconds,
                });
            })
            .catch(error => {
                const updateEndTimestampMilliseconds = Date.now();
                recordDisplayPerformanceSample({
                    requestReason,
                    displayKind,
                    outcome: "failed",
                    titleClearRequested,
                    requestTimestampMilliseconds,
                    renderStartTimestampMilliseconds,
                    composeEndTimestampMilliseconds,
                    rasterizeEndTimestampMilliseconds,
                    updateStartTimestampMilliseconds,
                    updateEndTimestampMilliseconds,
                });
                log.error(() => `Failed to set key image: ${error}`);
            })
            .finally(() => {
                finishDisplayUpdate(displayActionState);
            });
        return;
    }

    recordDisplayPerformanceSample({
        requestReason,
        displayKind,
        outcome: "failed",
        titleClearRequested,
        requestTimestampMilliseconds,
        renderStartTimestampMilliseconds,
        composeEndTimestampMilliseconds,
        rasterizeEndTimestampMilliseconds,
        updateStartTimestampMilliseconds: null,
        updateEndTimestampMilliseconds: Date.now(),
    });
    finishDisplayUpdate(displayActionState);
}

function buildSingleMetricConfigOverrides(options: {
    centerIconFragment: string;
    footerIconFragment: string | undefined;
    linearIconFragment: string | undefined;
    statusIcon: ArcGaugeStatusIcon;
    centerContent: "value" | "icon";
    circleStyle: ResolvedMetricVisualSettings["circleStyle"];
    lineSmoothingPercent: number;
    gridLineVisibility: ResolvedMetricVisualSettings["gridLineVisibility"];
    gridLineType: ResolvedMetricVisualSettings["gridLineType"];
}): {
    centerContent?: "value" | "icon";
    circleStyle?: ResolvedMetricVisualSettings["circleStyle"];
    centerIconFragment?: string;
    footerIconFragment?: string;
    topIconFragment?: string;
    statusIcon?: ArcGaugeStatusIcon;
    lineSmoothingPercent?: number;
    gridLineVisibility?: ResolvedMetricVisualSettings["gridLineVisibility"];
    gridLineType?: ResolvedMetricVisualSettings["gridLineType"];
} {
    return {
        centerContent: options.centerContent,
        circleStyle: options.circleStyle,
        centerIconFragment: options.centerIconFragment,
        footerIconFragment: options.footerIconFragment,
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
    positiveColorConfig: ColorConfig | undefined;
    negativeColorConfig: ColorConfig | undefined;
    titleText: string;
    chartMode: "overlay" | "mirrored";
    centerContent: "value" | "icon";
    circleStyle: ResolvedMetricVisualSettings["circleStyle"];
    topIconFragment: string;
    positiveIconFragment: string | undefined;
    negativeIconFragment: string | undefined;
    positiveStatusIcon: ArcGaugeStatusIcon | undefined;
    negativeStatusIcon: ArcGaugeStatusIcon | undefined;
    lineSmoothingPercent: number;
    gridLineVisibility: ResolvedMetricVisualSettings["gridLineVisibility"];
    gridLineType: ResolvedMetricVisualSettings["gridLineType"];
}): {
    positiveColor: string;
    negativeColor: string;
    positiveColorConfig?: ColorConfig;
    negativeColorConfig?: ColorConfig;
    titleText?: string;
    chartMode?: "overlay" | "mirrored";
    centerContent?: "value" | "icon";
    circleStyle?: ResolvedMetricVisualSettings["circleStyle"];
    centerIconFragment?: string;
    topIconFragment?: string;
    positiveIconFragment?: string;
    negativeIconFragment?: string;
    positiveStatusIcon?: ArcGaugeStatusIcon;
    negativeStatusIcon?: ArcGaugeStatusIcon;
    lineSmoothingPercent?: number;
    gridLineVisibility?: ResolvedMetricVisualSettings["gridLineVisibility"];
    gridLineType?: ResolvedMetricVisualSettings["gridLineType"];
} {
    return {
        positiveColor: options.positiveColor,
        negativeColor: options.negativeColor,
        positiveColorConfig: options.positiveColorConfig,
        negativeColorConfig: options.negativeColorConfig,
        titleText: options.titleText,
        chartMode: options.chartMode,
        centerContent: options.centerContent,
        circleStyle: options.circleStyle,
        centerIconFragment: options.topIconFragment,
        topIconFragment: options.topIconFragment,
        positiveIconFragment: options.positiveIconFragment,
        negativeIconFragment: options.negativeIconFragment,
        positiveStatusIcon: options.positiveStatusIcon,
        negativeStatusIcon: options.negativeStatusIcon,
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
        pendingRequestTimestampMilliseconds: null,
        pendingRequestReason: "metric-tick",
        pendingSettingsSignature: null,
        touchStripLayoutPromise: null,
        touchStripLayoutPath: null,
        lastRenderedSvg: null,
        lastRequestedSettingsSignature: null,
    };
    displayActionStates.set(actionId, displayActionState);
    return displayActionState;
}

function recordDisplayRequest(displayActionState: DisplayActionState, options: MetricDisplayOptions): void {
    const settingsSignature = buildSettingsSignature(options.resolvedSettings);
    const isSettingsChange = displayActionState.lastRequestedSettingsSignature !== null
        && displayActionState.lastRequestedSettingsSignature !== settingsSignature;
    const requestTimestampMilliseconds = Date.now();

    displayActionState.lastRequestedSettingsSignature = settingsSignature;

    if (!isSettingsChange && displayActionState.pendingRequestReason === "settings-change") {
        return;
    }

    displayActionState.pendingRequestTimestampMilliseconds = requestTimestampMilliseconds;
    displayActionState.pendingRequestReason = isSettingsChange ? "settings-change" : "metric-tick";
    displayActionState.pendingSettingsSignature = settingsSignature;

    if (!isSettingsChange) {
        return;
    }

    const visualSettings = resolveMetricVisualSettings(options.resolvedSettings);

    log.info(() => [
        "settingsDisplayRequested",
        `actionId=${options.event.action.id}`,
        `metricKey=${options.metricKey}`,
        `graphicType=${visualSettings.graphicType}`,
        `displayKind=${isDualMetricDisplayOptions(options) ? "dual" : "single"}`,
        `isRenderInFlight=${displayActionState.isRenderInFlight}`,
        `isQueued=${displayActionState.isQueued}`,
        `activeUpdates=${activeDisplayUpdateCount}`,
        `queueLength=${displayActionQueue.length}`,
        `signature=${settingsSignature}`,
    ].join(" "));
}

function enqueueDisplayAction(displayActionState: DisplayActionState): void {
    if (
        !displayActionState.active
        || displayActionState.isRenderInFlight
    ) {
        return;
    }

    displayActionQueue.enqueue(displayActionState.actionId, displayActionState.pendingRequestReason);
    displayActionState.isQueued = true;
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
        const actionId = displayActionQueue.dequeue();
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

function resolveDisplayPerformanceKind(event: WillAppearEvent): DisplayPerformanceKind {
    if (event.action.isKey()) {
        return "key";
    }

    if (event.action.isDial()) {
        return "dial";
    }

    return "unknown";
}

function recordDisplayPerformanceSample(options: {
    requestReason: DisplayRequestReason;
    displayKind: DisplayPerformanceKind;
    outcome: DisplayPerformanceOutcome;
    titleClearRequested: boolean;
    requestTimestampMilliseconds: number | null;
    renderStartTimestampMilliseconds: number;
    composeEndTimestampMilliseconds: number;
    rasterizeEndTimestampMilliseconds: number | null;
    updateStartTimestampMilliseconds: number | null;
    updateEndTimestampMilliseconds: number;
}): void {
    const summary = displayPerformanceStats.record({
        requestReason: options.requestReason,
        displayKind: options.displayKind,
        outcome: options.outcome,
        queuedMilliseconds: calculateElapsedMilliseconds(
            options.requestTimestampMilliseconds,
            options.renderStartTimestampMilliseconds,
        ),
        composeMilliseconds: options.composeEndTimestampMilliseconds - options.renderStartTimestampMilliseconds,
        rasterizeMilliseconds: calculateStepMilliseconds(
            options.composeEndTimestampMilliseconds,
            options.rasterizeEndTimestampMilliseconds,
        ),
        sdkPromiseMilliseconds: calculateStepMilliseconds(
            options.updateStartTimestampMilliseconds,
            options.updateEndTimestampMilliseconds,
        ),
        totalMilliseconds: calculateElapsedMilliseconds(
            options.requestTimestampMilliseconds,
            options.updateEndTimestampMilliseconds,
        ) ?? Math.max(0, options.updateEndTimestampMilliseconds - options.renderStartTimestampMilliseconds),
        queueLength: displayActionQueue.length,
        activeActionCount: displayActionStates.size,
        titleClearRequested: options.titleClearRequested,
    }, options.updateEndTimestampMilliseconds);

    if (summary) {
        if (shouldWarnDisplayPerformanceSummary(summary)) {
            log.atWarn()
                .everyMs("display-performance-warning", 60000)
                .log(() => formatDisplayPerformanceSummary(summary));
            return;
        }

        log.debug(() => formatDisplayPerformanceSummary(summary));
    }
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

function logSettingsUpdateDoneInfo(options: {
    requestReason: DisplayRequestReason;
    actionId: string;
    metricKey: string;
    phase: string;
    graphicType: string;
    requestTimestampMilliseconds: number | null;
    renderStartTimestampMilliseconds: number;
    composeEndTimestampMilliseconds: number;
    rasterizeEndTimestampMilliseconds: number;
    updateStartTimestampMilliseconds: number;
}): void {
    if (options.requestReason !== "settings-change") {
        return;
    }

    const currentTimestampMilliseconds = Date.now();

    log.info(() => [
        "settingsDisplayUpdateDone",
        `phase=${options.phase}`,
        `actionId=${options.actionId}`,
        `metricKey=${options.metricKey}`,
        `graphicType=${options.graphicType}`,
        `queuedMs=${formatElapsedMilliseconds(options.requestTimestampMilliseconds, options.renderStartTimestampMilliseconds)}`,
        `composeMs=${options.composeEndTimestampMilliseconds - options.renderStartTimestampMilliseconds}`,
        `rasterizeMs=${options.rasterizeEndTimestampMilliseconds - options.composeEndTimestampMilliseconds}`,
        `sdkPromiseMs=${currentTimestampMilliseconds - options.updateStartTimestampMilliseconds}`,
        `totalMs=${formatElapsedMilliseconds(options.requestTimestampMilliseconds, currentTimestampMilliseconds)}`,
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

function buildSettingsSignature(settings: SingleMetricDisplaySettings): string {
    const visualSettings = resolveMetricVisualSettings(settings);

    return [
        `graphicType=${visualSettings.graphicType}`,
        `circleStyle=${visualSettings.circleStyle}`,
        `graphicStyle=${visualSettings.graphicStyle}`,
        `colorMode=${visualSettings.colorConfig.mode}`,
        `solidColor=${visualSettings.colorConfig.solidColor}`,
        `thresholds=${visualSettings.colorConfig.thresholds.map(threshold => threshold.color).join(",")}`,
        `lineSmoothingPercent=${visualSettings.lineSmoothingPercent}`,
        `gridLineVisibility=${visualSettings.gridLineVisibility}`,
        `gridLineType=${visualSettings.gridLineType}`,
    ].join(";");
}

function formatElapsedMilliseconds(
    startTimestampMilliseconds: number | null,
    endTimestampMilliseconds: number,
): string {
    const elapsedMilliseconds = calculateElapsedMilliseconds(
        startTimestampMilliseconds,
        endTimestampMilliseconds,
    );

    if (elapsedMilliseconds == null) {
        return "unknown";
    }

    return String(elapsedMilliseconds);
}

function calculateElapsedMilliseconds(
    startTimestampMilliseconds: number | null,
    endTimestampMilliseconds: number,
): number | null {
    if (startTimestampMilliseconds == null) {
        return null;
    }

    return Math.max(0, endTimestampMilliseconds - startTimestampMilliseconds);
}

function calculateStepMilliseconds(
    startTimestampMilliseconds: number | null,
    endTimestampMilliseconds: number | null,
): number | null {
    if (startTimestampMilliseconds == null || endTimestampMilliseconds == null) {
        return null;
    }

    return Math.max(0, endTimestampMilliseconds - startTimestampMilliseconds);
}
