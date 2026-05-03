import type { WillAppearEvent } from "@elgato/streamdeck";
import { composeSvg } from "../rendering/composer";
import { rasterizeSvgToPngDataUrl } from "../rendering/rasterizer";
import {
    KEYPAD_PNG_SIZE,
    TOUCH_STRIP_LOGICAL_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
    WIDGET_LOGICAL_SIZE,
} from "../rendering/widget-data";
import type { WidgetData } from "../rendering/widget-data";
import { resolveMetricVisualSettings, type MetricVisualSettings, type SettingValue } from "./metric-visual-settings";
import type { ArcGaugeStatusIcon } from "../widgets/primitives/arc-gauge";
import { logger } from "../logging/logger";

const log = logger.for("SingleMetricDisplay");

export interface SingleMetricDisplayOptions {
    event: WillAppearEvent;
    metricKey: string;
    widgetData: WidgetData;
    centerIconFragment: string;
    linearIconFragment?: string;
    statusIcon: ArcGaugeStatusIcon;
    circularCenterContentOverride?: "value" | "icon" | "icon-value-unit";
    visualSettingsOverride?: Partial<MetricVisualSettings>;
}

interface SingleMetricDisplaySettings extends MetricVisualSettings {
    circularCenterContent?: SettingValue;
}

const TOUCH_STRIP_SINGLE_METRIC_LAYOUT = "layouts/single-metric-touchstrip.json";
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
    pendingOptions: SingleMetricDisplayOptions | null;
    touchStripLayoutPromise: Promise<void> | null;
    lastRenderedSvg: string | null;
}

export function setSingleMetricDisplay(options: SingleMetricDisplayOptions): void {
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
    displayActionStates.delete(actionId);
}

function renderAndSendSingleMetricDisplay(
    displayActionState: DisplayActionState,
    options: SingleMetricDisplayOptions,
): void {
    displayActionState.isRenderInFlight = true;
    displayActionState.pendingOptions = null;
    activeDisplayUpdateCount += 1;

    const renderStartTimestampMilliseconds = Date.now();
    const settings = options.event.payload.settings as SingleMetricDisplaySettings;
    const visualSettings = resolveMetricVisualSettings({
        ...settings,
        ...options.visualSettingsOverride,
    });
    const centerContent = resolveCircularCenterContent({
        settings,
        graphicType: visualSettings.graphicType,
        circularCenterContentOverride: options.circularCenterContentOverride,
    });
    const hasData = options.widgetData.sampleTimestampMilliseconds != null;
    const shouldRenderMutedIconPlaceholder = !hasData
        && visualSettings.graphicType === "circular"
        && centerContent === "icon";
    const renderWidgetData = buildRenderWidgetData({
        widgetData: options.widgetData,
        hasData,
        shouldRenderMutedIconPlaceholder,
    });
    const renderSize = options.event.action.isDial() ? TOUCH_STRIP_LOGICAL_SIZE : WIDGET_LOGICAL_SIZE;
    const pngSize = options.event.action.isDial() ? TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE : KEYPAD_PNG_SIZE;

    if (options.event.action.isKey()) {
        options.event.action.setTitle("").catch(error => {
            log.error(() => `Failed to clear key title: ${error}`);
        });
    }

    const svg = composeSvg(renderWidgetData, {
        ...visualSettings,
        muted: shouldRenderMutedIconPlaceholder,
        configOverrides: buildSingleMetricConfigOverrides({
            centerIconFragment: options.centerIconFragment,
            linearIconFragment: options.linearIconFragment,
            statusIcon: options.statusIcon,
            centerContent,
        }),
    }, renderSize);
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

    const pngDataUrl = rasterizeSvgToPngDataUrl(svg, pngSize);
    const rasterizeEndTimestampMilliseconds = Date.now();

    if (!pngDataUrl) {
        finishDisplayUpdate(displayActionState);
        return;
    }

    logDisplayDebug({
        actionId: options.event.action.id,
        metricKey: options.metricKey,
        phase: "rendered",
        value: renderWidgetData.current,
        sampleTimestampMilliseconds: renderWidgetData.sampleTimestampMilliseconds,
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
                        sampleTimestampMilliseconds: renderWidgetData.sampleTimestampMilliseconds,
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

        ensureTouchStripSingleMetricLayout(displayActionState, options.event)
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
                    sampleTimestampMilliseconds: renderWidgetData.sampleTimestampMilliseconds,
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
}): {
    centerContent?: "value" | "icon" | "icon-value-unit";
    centerIconFragment?: string;
    topIconFragment?: string;
    statusIcon?: ArcGaugeStatusIcon;
} {
    return {
        centerContent: options.centerContent,
        centerIconFragment: options.centerIconFragment,
        topIconFragment: options.linearIconFragment ?? options.centerIconFragment,
        statusIcon: options.statusIcon,
    };
}

function resolveCircularCenterContent(options: {
    settings: SingleMetricDisplaySettings;
    graphicType: string;
    circularCenterContentOverride: "value" | "icon" | "icon-value-unit" | undefined;
}): "value" | "icon" | "icon-value-unit" {
    if (options.graphicType !== "circular") {
        return "value";
    }

    return options.circularCenterContentOverride
        ?? (options.settings.circularCenterContent === "icon" ? "icon" : "value");
}

function buildRenderWidgetData(options: {
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
): Promise<void> {
    if (!event.action.isDial()) {
        return Promise.resolve();
    }

    if (displayActionState.touchStripLayoutPromise) {
        return displayActionState.touchStripLayoutPromise;
    }

    const layoutPromise = event.action.setFeedbackLayout(TOUCH_STRIP_SINGLE_METRIC_LAYOUT).catch(error => {
        displayActionState.touchStripLayoutPromise = null;
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
    log.trace(() => [
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
    log.trace(() => [
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
    log.trace(() => [
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
