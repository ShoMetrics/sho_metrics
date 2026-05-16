import type { WillAppearEvent } from "@elgato/streamdeck";
import { rasterizeSvgToPngDataUrl } from "../rendering/rasterizer";
import type { MetricRenderAppearance } from "../rendering/render-appearance";
import {
    composeMetricDisplayFrame,
    isDualMetricRenderOptions,
    resolveDisplayLogValue,
    resolveDisplaySampleTimestampMilliseconds,
    type DualMetricRenderOptions,
    type MetricRenderOptions,
    type SingleMetricRenderOptions,
} from "../metric-view-renderer/display-frame";
import { logger } from "../logging/logger";
import type { ResolvedAppearanceSettings } from "../settings/resolved-settings";
import { DisplayUpdateQueue, type DisplayUpdatePriority } from "./update-queue";
import {
    dispatchMetricDisplayImage,
    type TouchStripMetricLayoutState,
} from "./dispatch";
import {
    recordDisplayPerformanceSample,
} from "./display-update-observability";
import { buildMetricRenderAppearance } from "../settings/render-appearance-builder";

const log = logger.for("MetricDisplayRunner");

const MAX_CONCURRENT_DISPLAY_UPDATES = 1;

const displayActionStates = new Map<string, DisplayActionState>();
const displayActionQueue = new DisplayUpdateQueue();
let activeDisplayUpdateCount = 0;
let isDisplayQueueDrainScheduled = false;

interface MetricDisplayEvent {
    event: WillAppearEvent;
    metricKey: string;
}

export type SingleMetricDisplayOptions = SingleMetricRenderOptions & MetricDisplayEvent;
export type DualMetricDisplayOptions = DualMetricRenderOptions & MetricDisplayEvent;
export type MetricDisplayOptions = MetricRenderOptions & MetricDisplayEvent;

interface DisplayActionState {
    actionId: string;
    isRenderInFlight: boolean;
    isQueued: boolean;
    active: boolean;
    pendingOptions: MetricDisplayOptions | null;
    pendingUpdateTimestampMilliseconds: number | null;
    pendingUpdateReason: DisplayUpdatePriority;
    pendingSettingsSignature: string | null;
    touchStripMetricLayoutState: TouchStripMetricLayoutState;
    lastRenderedSvg: string | null;
    lastScheduledSettingsSignature: string | null;
}

export function setSingleMetricDisplay(options: SingleMetricDisplayOptions): void {
    const displayActionState = getOrCreateDisplayActionState(options.event.action.id);

    recordDisplayUpdate(displayActionState, options);
    displayActionState.pendingOptions = options;
    enqueueDisplayAction(displayActionState);
}

export function setMetricDisplay(options: MetricDisplayOptions): void {
    if (isDualMetricDisplayOptions(options)) {
        const displayActionState = getOrCreateDisplayActionState(options.event.action.id);

        recordDisplayUpdate(displayActionState, options);
        displayActionState.pendingOptions = options;
        enqueueDisplayAction(displayActionState);
        return;
    }

    setSingleMetricDisplay(options);
}

export function clearMetricDisplayState(actionId: string): void {
    const displayActionState = displayActionStates.get(actionId);

    if (!displayActionState) {
        return;
    }

    displayActionState.active = false;
    displayActionState.isQueued = false;
    displayActionState.pendingOptions = null;
    displayActionState.pendingUpdateTimestampMilliseconds = null;
    displayActionState.pendingUpdateReason = "metric-tick";
    displayActionState.pendingSettingsSignature = null;
    displayActionState.touchStripMetricLayoutState.layoutPromise = null;
    displayActionState.touchStripMetricLayoutState.layoutPath = null;
    displayActionQueue.remove(actionId);
    displayActionStates.delete(actionId);
}

function isDualMetricDisplayOptions(options: MetricDisplayOptions): options is DualMetricDisplayOptions {
    return isDualMetricRenderOptions(options);
}

function runMetricDisplayUpdate(
    displayActionState: DisplayActionState,
    options: MetricDisplayOptions,
): void {
    const updateTimestampMilliseconds = displayActionState.pendingUpdateTimestampMilliseconds;
    const updateReason = displayActionState.pendingUpdateReason;
    const settingsSignature = displayActionState.pendingSettingsSignature;

    displayActionState.isRenderInFlight = true;
    displayActionState.pendingOptions = null;
    displayActionState.pendingUpdateTimestampMilliseconds = null;
    displayActionState.pendingUpdateReason = "metric-tick";
    displayActionState.pendingSettingsSignature = null;
    activeDisplayUpdateCount += 1;

    const renderStartTimestampMilliseconds = Date.now();
    const frame = composeMetricDisplayFrame({
        displayOptions: options,
        renderTarget: options.event.action.isDial() ? "touch-strip" : "key",
    });
    const renderPlan = frame.renderPlan;
    const renderedMetricData = frame.renderedMetricData;
    const svg = frame.svg;
    const titleClearRequested = options.event.action.isKey();

    if (updateReason === "settings-change") {
        log.info(() => [
            "settingsDisplayRenderStart",
            `actionId=${options.event.action.id}`,
            `metricKey=${options.metricKey}`,
            `graphicType=${renderPlan.renderAppearance.graphicType}`,
            `queuedMs=${formatElapsedMilliseconds(updateTimestampMilliseconds, renderStartTimestampMilliseconds)}`,
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

    const composeEndTimestampMilliseconds = Date.now();

    if (svg === displayActionState.lastRenderedSvg) {
        if (updateReason === "settings-change") {
            log.info(() => [
                "settingsDisplaySkippedUnchanged",
                `actionId=${options.event.action.id}`,
                `metricKey=${options.metricKey}`,
                `graphicType=${renderPlan.renderAppearance.graphicType}`,
                `queuedMs=${formatElapsedMilliseconds(updateTimestampMilliseconds, renderStartTimestampMilliseconds)}`,
                `composeMs=${composeEndTimestampMilliseconds - renderStartTimestampMilliseconds}`,
                `totalMs=${formatElapsedMilliseconds(updateTimestampMilliseconds, composeEndTimestampMilliseconds)}`,
            ].join(" "));
        }

        log.debug(() => [
            "skippedUnchanged",
            `actionId=${options.event.action.id}`,
            `metricKey=${options.metricKey}`,
            `composeMs=${composeEndTimestampMilliseconds - renderStartTimestampMilliseconds}`,
            `renderToSkipMs=${Date.now() - renderStartTimestampMilliseconds}`,
        ].join(" "));
        recordDisplayPerformanceSample({
            event: options.event,
            updateReason,
            outcome: "skipped",
            titleClearRequested,
            updateTimestampMilliseconds,
            renderStartTimestampMilliseconds,
            composeEndTimestampMilliseconds,
            rasterizeEndTimestampMilliseconds: null,
            updateStartTimestampMilliseconds: null,
            updateEndTimestampMilliseconds: composeEndTimestampMilliseconds,
            queueLength: displayActionQueue.length,
            activeActionCount: displayActionStates.size,
        });
        finishDisplayUpdate(displayActionState);
        return;
    }

    const pngDataUrl = rasterizeSvgToPngDataUrl(svg, renderPlan.pngSize);
    const rasterizeEndTimestampMilliseconds = Date.now();

    if (!pngDataUrl) {
        recordDisplayPerformanceSample({
            event: options.event,
            updateReason,
            outcome: "failed",
            titleClearRequested,
            updateTimestampMilliseconds,
            renderStartTimestampMilliseconds,
            composeEndTimestampMilliseconds,
            rasterizeEndTimestampMilliseconds,
            updateStartTimestampMilliseconds: null,
            updateEndTimestampMilliseconds: rasterizeEndTimestampMilliseconds,
            queueLength: displayActionQueue.length,
            activeActionCount: displayActionStates.size,
        });
        finishDisplayUpdate(displayActionState);
        return;
    }

    log.debug(() => {
        const currentTimestampMilliseconds = Date.now();
        return [
            "rendered",
            `actionId=${options.event.action.id}`,
            `metricKey=${options.metricKey}`,
            `value=${resolveDisplayLogValue(renderedMetricData).toFixed(2)}`,
            `sampleAgeMs=${formatAgeMilliseconds(
                resolveDisplaySampleTimestampMilliseconds(renderedMetricData),
                currentTimestampMilliseconds,
            )}`,
            `composeMs=${composeEndTimestampMilliseconds - renderStartTimestampMilliseconds}`,
            `rasterizeMs=${rasterizeEndTimestampMilliseconds - composeEndTimestampMilliseconds}`,
            `renderToEnqueueMs=${currentTimestampMilliseconds - renderStartTimestampMilliseconds}`,
        ].join(" ");
    });

    dispatchMetricDisplayImage({
        event: options.event,
        pngDataUrl,
        touchStripMetricLayout: renderPlan.touchStripMetricLayout,
        touchStripMetricLayoutState: displayActionState.touchStripMetricLayoutState,
        isActionActive: () => displayActionState.active,
    })
        .then(dispatchResult => {
            if (dispatchResult.status === "inactive") {
                return;
            }

            if (dispatchResult.status === "rendered") {
                displayActionState.lastRenderedSvg = svg;
            }

            recordDisplayPerformanceSample({
                event: options.event,
                updateReason,
                outcome: dispatchResult.status === "rendered" ? "rendered" : "failed",
                titleClearRequested,
                updateTimestampMilliseconds,
                renderStartTimestampMilliseconds,
                composeEndTimestampMilliseconds,
                rasterizeEndTimestampMilliseconds,
                updateStartTimestampMilliseconds: dispatchResult.updateStartTimestampMilliseconds,
                updateEndTimestampMilliseconds: dispatchResult.updateEndTimestampMilliseconds,
                queueLength: displayActionQueue.length,
                activeActionCount: displayActionStates.size,
            });

            if (dispatchResult.status === "failed") {
                log.error(() => `${dispatchResult.failureMessage}: ${dispatchResult.error}`);
                return;
            }

            if (updateReason === "settings-change") {
                log.info(() => {
                    const currentTimestampMilliseconds = Date.now();
                    return [
                        "settingsDisplayUpdateDone",
                        `phase=${dispatchResult.donePhase}`,
                        `actionId=${options.event.action.id}`,
                        `metricKey=${options.metricKey}`,
                        `graphicType=${renderPlan.renderAppearance.graphicType}`,
                        `queuedMs=${formatElapsedMilliseconds(updateTimestampMilliseconds, renderStartTimestampMilliseconds)}`,
                        `composeMs=${composeEndTimestampMilliseconds - renderStartTimestampMilliseconds}`,
                        `rasterizeMs=${rasterizeEndTimestampMilliseconds - composeEndTimestampMilliseconds}`,
                        `sdkPromiseMs=${currentTimestampMilliseconds - dispatchResult.updateStartTimestampMilliseconds}`,
                        `totalMs=${formatElapsedMilliseconds(updateTimestampMilliseconds, currentTimestampMilliseconds)}`,
                    ].join(" ");
                });
            }

            log.debug(() => {
                const currentTimestampMilliseconds = Date.now();
                return [
                    dispatchResult.donePhase,
                    `actionId=${options.event.action.id}`,
                    `metricKey=${options.metricKey}`,
                    `sampleAgeMs=${formatAgeMilliseconds(
                        resolveDisplaySampleTimestampMilliseconds(renderedMetricData),
                        currentTimestampMilliseconds,
                    )}`,
                    `sdkPromiseMs=${currentTimestampMilliseconds - dispatchResult.updateStartTimestampMilliseconds}`,
                ].join(" ");
            });
        })
        .finally(() => {
            finishDisplayUpdate(displayActionState);
        });
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
        pendingUpdateTimestampMilliseconds: null,
        pendingUpdateReason: "metric-tick",
        pendingSettingsSignature: null,
        touchStripMetricLayoutState: {
            layoutPromise: null,
            layoutPath: null,
        },
        lastRenderedSvg: null,
        lastScheduledSettingsSignature: null,
    };
    displayActionStates.set(actionId, displayActionState);
    return displayActionState;
}

function recordDisplayUpdate(displayActionState: DisplayActionState, options: MetricDisplayOptions): void {
    const settingsSignature = buildMetricDisplaySettingsSignature(options.resolvedSettings);
    const isSettingsChange = displayActionState.lastScheduledSettingsSignature !== null
        && displayActionState.lastScheduledSettingsSignature !== settingsSignature.signature;
    const updateTimestampMilliseconds = Date.now();

    displayActionState.lastScheduledSettingsSignature = settingsSignature.signature;

    if (!isSettingsChange && displayActionState.pendingUpdateReason === "settings-change") {
        return;
    }

    displayActionState.pendingUpdateTimestampMilliseconds = updateTimestampMilliseconds;
    displayActionState.pendingUpdateReason = isSettingsChange ? "settings-change" : "metric-tick";
    displayActionState.pendingSettingsSignature = settingsSignature.signature;

    if (!isSettingsChange) {
        return;
    }

    log.info(() => [
        "settingsDisplayScheduled",
        `actionId=${options.event.action.id}`,
        `metricKey=${options.metricKey}`,
        `graphicType=${settingsSignature.graphicType}`,
        `displayKind=${isDualMetricDisplayOptions(options) ? "dual" : "single"}`,
        `isRenderInFlight=${displayActionState.isRenderInFlight}`,
        `isQueued=${displayActionState.isQueued}`,
        `activeUpdates=${activeDisplayUpdateCount}`,
        `queueLength=${displayActionQueue.length}`,
        `signature=${settingsSignature.signature}`,
    ].join(" "));
}

function buildMetricDisplaySettingsSignature(settings: ResolvedAppearanceSettings): {
    readonly graphicType: MetricRenderAppearance["graphicType"];
    readonly signature: string;
} {
    const renderAppearance = buildMetricRenderAppearance(settings);

    return {
        graphicType: renderAppearance.graphicType,
        signature: [
            `graphicType=${renderAppearance.graphicType}`,
            `circleStyle=${renderAppearance.circleStyle}`,
            `graphicStyle=${renderAppearance.graphicStyle}`,
            `paintConstraint=${renderAppearance.paintConstraint}`,
            `background=${renderAppearance.paints.background}`,
            `surface=${renderAppearance.paints.surface}`,
            `primaryText=${renderAppearance.paints.primaryText}`,
            `secondaryText=${renderAppearance.paints.secondaryText}`,
            `mutedText=${renderAppearance.paints.mutedText}`,
            `icon=${renderAppearance.paints.icon}`,
            `track=${renderAppearance.paints.track}`,
            `grid=${renderAppearance.paints.grid}`,
            `divider=${renderAppearance.paints.divider}`,
            `metricPaintMode=${renderAppearance.paints.primaryMetric.mode}`,
            `metricSolidPaint=${renderAppearance.paints.primaryMetric.solidColor}`,
            `metricThresholdPaints=${renderAppearance.paints.primaryMetric.thresholds.map(threshold => threshold.color).join(",")}`,
            `lineSmoothingPercent=${renderAppearance.lineSmoothingPercent}`,
            `gridLineVisibility=${renderAppearance.gridLineVisibility}`,
            `gridLineType=${renderAppearance.gridLineType}`,
        ].join(";"),
    };
}

function enqueueDisplayAction(displayActionState: DisplayActionState): void {
    if (
        !displayActionState.active
        || displayActionState.isRenderInFlight
    ) {
        return;
    }

    displayActionQueue.enqueue(displayActionState.actionId, displayActionState.pendingUpdateReason);
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
            runMetricDisplayUpdate(displayActionState, displayActionState.pendingOptions);
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

function formatAgeMilliseconds(
    sampleTimestampMilliseconds: number | undefined,
    currentTimestampMilliseconds: number,
): string {
    if (!sampleTimestampMilliseconds) {
        return "unknown";
    }

    return String(currentTimestampMilliseconds - sampleTimestampMilliseconds);
}

function formatElapsedMilliseconds(
    startTimestampMilliseconds: number | null,
    endTimestampMilliseconds: number,
): string {
    if (startTimestampMilliseconds == null) {
        return "unknown";
    }

    return String(Math.max(0, endTimestampMilliseconds - startTimestampMilliseconds));
}

