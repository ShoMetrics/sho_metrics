import type { WillAppearEvent } from "@elgato/streamdeck";
import { rasterizeSvgToPngDataUrl } from "../rendering/rasterizer";
import type { MetricRenderAppearance } from "../rendering/render-appearance";
import {
    composeMetricViewFrame,
    isDualMetricRenderOptions,
    resolveMetricViewLogValue,
    resolveMetricViewSampleTimestampMilliseconds,
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

const log = logger.for("MetricViewRunner");

const MAX_CONCURRENT_METRIC_VIEW_UPDATES = 1;

const metricViewActionStates = new Map<string, MetricViewActionState>();
const metricViewActionQueue = new DisplayUpdateQueue();
let activeMetricViewUpdateCount = 0;
let isMetricViewQueueDrainScheduled = false;

interface MetricViewEvent {
    event: WillAppearEvent;
    metricKey: string;
}

export type SingleMetricViewOptions = SingleMetricRenderOptions & MetricViewEvent;
export type DualMetricViewOptions = DualMetricRenderOptions & MetricViewEvent;
export type MetricViewOptions = MetricRenderOptions & MetricViewEvent;

interface MetricViewActionState {
    actionId: string;
    isRenderInFlight: boolean;
    isQueued: boolean;
    active: boolean;
    pendingOptions: MetricViewOptions | null;
    pendingUpdateTimestampMilliseconds: number | null;
    pendingUpdateReason: DisplayUpdatePriority;
    pendingSettingsSignature: string | null;
    touchStripMetricLayoutState: TouchStripMetricLayoutState;
    lastRenderedSvg: string | null;
    lastScheduledSettingsSignature: string | null;
}

export function setMetricView(options: MetricViewOptions): void {
    const metricViewActionState = getOrCreateMetricViewActionState(options.event.action.id);

    recordMetricViewUpdate(metricViewActionState, options);
    metricViewActionState.pendingOptions = options;
    enqueueMetricViewAction(metricViewActionState);
}

export function clearMetricViewState(actionId: string): void {
    const metricViewActionState = metricViewActionStates.get(actionId);

    if (!metricViewActionState) {
        return;
    }

    metricViewActionState.active = false;
    metricViewActionState.isQueued = false;
    metricViewActionState.pendingOptions = null;
    metricViewActionState.pendingUpdateTimestampMilliseconds = null;
    metricViewActionState.pendingUpdateReason = "metric-tick";
    metricViewActionState.pendingSettingsSignature = null;
    metricViewActionState.touchStripMetricLayoutState.layoutPromise = null;
    metricViewActionState.touchStripMetricLayoutState.layoutPath = null;
    metricViewActionQueue.remove(actionId);
    metricViewActionStates.delete(actionId);
}

function runMetricViewUpdate(
    metricViewActionState: MetricViewActionState,
    options: MetricViewOptions,
): void {
    const updateTimestampMilliseconds = metricViewActionState.pendingUpdateTimestampMilliseconds;
    const updateReason = metricViewActionState.pendingUpdateReason;
    const settingsSignature = metricViewActionState.pendingSettingsSignature;

    metricViewActionState.isRenderInFlight = true;
    metricViewActionState.pendingOptions = null;
    metricViewActionState.pendingUpdateTimestampMilliseconds = null;
    metricViewActionState.pendingUpdateReason = "metric-tick";
    metricViewActionState.pendingSettingsSignature = null;
    activeMetricViewUpdateCount += 1;

    const renderStartTimestampMilliseconds = Date.now();
    const frame = composeMetricViewFrame({
        viewOptions: options,
        renderTarget: options.event.action.isDial() ? "touch-strip" : "key",
    });
    const renderPlan = frame.renderPlan;
    const renderedMetricData = frame.renderedMetricData;
    const svg = frame.svg;
    const titleClearRequested = options.event.action.isKey();

    if (updateReason === "settings-change") {
        log.info(() => [
            "settingsViewRenderStart",
            `actionId=${options.event.action.id}`,
            `metricKey=${options.metricKey}`,
            `renderPrimitive=${renderPlan.renderAppearance.renderPrimitive}`,
            `queuedMs=${formatElapsedMilliseconds(updateTimestampMilliseconds, renderStartTimestampMilliseconds)}`,
            `activeUpdates=${activeMetricViewUpdateCount}`,
            `queueLength=${metricViewActionQueue.length}`,
            `signature=${settingsSignature ?? "unknown"}`,
        ].join(" "));
    }

    if (titleClearRequested) {
        options.event.action.setTitle("").catch(error => {
            log.error(() => `Failed to clear key title: ${error}`);
        });
    }

    const composeEndTimestampMilliseconds = Date.now();

    if (svg === metricViewActionState.lastRenderedSvg) {
        if (updateReason === "settings-change") {
            log.info(() => [
                "settingsViewSkippedUnchanged",
                `actionId=${options.event.action.id}`,
                `metricKey=${options.metricKey}`,
                `renderPrimitive=${renderPlan.renderAppearance.renderPrimitive}`,
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
            queueLength: metricViewActionQueue.length,
            activeActionCount: metricViewActionStates.size,
        });
        finishMetricViewUpdate(metricViewActionState);
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
            queueLength: metricViewActionQueue.length,
            activeActionCount: metricViewActionStates.size,
        });
        finishMetricViewUpdate(metricViewActionState);
        return;
    }

    log.debug(() => {
        const currentTimestampMilliseconds = Date.now();
        return [
            "rendered",
            `actionId=${options.event.action.id}`,
            `metricKey=${options.metricKey}`,
            `value=${resolveMetricViewLogValue(renderedMetricData).toFixed(2)}`,
            `sampleAgeMs=${formatAgeMilliseconds(
                resolveMetricViewSampleTimestampMilliseconds(renderedMetricData),
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
        touchStripMetricLayoutState: metricViewActionState.touchStripMetricLayoutState,
        isActionActive: () => metricViewActionState.active,
    })
        .then(dispatchResult => {
            if (dispatchResult.status === "inactive") {
                return;
            }

            if (dispatchResult.status === "rendered") {
                metricViewActionState.lastRenderedSvg = svg;
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
                queueLength: metricViewActionQueue.length,
                activeActionCount: metricViewActionStates.size,
            });

            if (dispatchResult.status === "failed") {
                log.error(() => `${dispatchResult.failureMessage}: ${dispatchResult.error}`);
                return;
            }

            if (updateReason === "settings-change") {
                log.info(() => {
                    const currentTimestampMilliseconds = Date.now();
                    return [
                        "settingsViewUpdateDone",
                        `phase=${dispatchResult.donePhase}`,
                        `actionId=${options.event.action.id}`,
                        `metricKey=${options.metricKey}`,
                        `renderPrimitive=${renderPlan.renderAppearance.renderPrimitive}`,
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
                        resolveMetricViewSampleTimestampMilliseconds(renderedMetricData),
                        currentTimestampMilliseconds,
                    )}`,
                    `sdkPromiseMs=${currentTimestampMilliseconds - dispatchResult.updateStartTimestampMilliseconds}`,
                ].join(" ");
            });
        })
        .finally(() => {
            finishMetricViewUpdate(metricViewActionState);
        });
}

function getOrCreateMetricViewActionState(actionId: string): MetricViewActionState {
    const existingMetricViewActionState = metricViewActionStates.get(actionId);

    if (existingMetricViewActionState) {
        return existingMetricViewActionState;
    }

    const metricViewActionState: MetricViewActionState = {
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
    metricViewActionStates.set(actionId, metricViewActionState);
    return metricViewActionState;
}

function recordMetricViewUpdate(metricViewActionState: MetricViewActionState, options: MetricViewOptions): void {
    const settingsSignature = buildMetricViewSettingsSignature(options.resolvedSettings);
    const isSettingsChange = metricViewActionState.lastScheduledSettingsSignature !== null
        && metricViewActionState.lastScheduledSettingsSignature !== settingsSignature.signature;
    const updateTimestampMilliseconds = Date.now();

    metricViewActionState.lastScheduledSettingsSignature = settingsSignature.signature;

    if (!isSettingsChange && metricViewActionState.pendingUpdateReason === "settings-change") {
        return;
    }

    metricViewActionState.pendingUpdateTimestampMilliseconds = updateTimestampMilliseconds;
    metricViewActionState.pendingUpdateReason = isSettingsChange ? "settings-change" : "metric-tick";
    metricViewActionState.pendingSettingsSignature = settingsSignature.signature;

    if (!isSettingsChange) {
        return;
    }

    log.info(() => [
        "settingsViewScheduled",
        `actionId=${options.event.action.id}`,
        `metricKey=${options.metricKey}`,
        `renderPrimitive=${settingsSignature.renderPrimitive}`,
        `viewKind=${isDualMetricRenderOptions(options) ? "dual" : "single"}`,
        `isRenderInFlight=${metricViewActionState.isRenderInFlight}`,
        `isQueued=${metricViewActionState.isQueued}`,
        `activeUpdates=${activeMetricViewUpdateCount}`,
        `queueLength=${metricViewActionQueue.length}`,
        `signature=${settingsSignature.signature}`,
    ].join(" "));
}

function buildMetricViewSettingsSignature(settings: ResolvedAppearanceSettings): {
    readonly renderPrimitive: MetricRenderAppearance["renderPrimitive"];
    readonly signature: string;
} {
    const renderAppearance = buildMetricRenderAppearance(settings);

    return {
        renderPrimitive: renderAppearance.renderPrimitive,
        signature: [
            `renderPrimitive=${renderAppearance.renderPrimitive}`,
            `circleVariant=${renderAppearance.circleVariant}`,
            `themePreset=${renderAppearance.themePreset}`,
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

function enqueueMetricViewAction(metricViewActionState: MetricViewActionState): void {
    if (
        !metricViewActionState.active
        || metricViewActionState.isRenderInFlight
    ) {
        return;
    }

    metricViewActionQueue.enqueue(metricViewActionState.actionId, metricViewActionState.pendingUpdateReason);
    metricViewActionState.isQueued = true;
    scheduleMetricViewQueueDrain();
}

function scheduleMetricViewQueueDrain(): void {
    if (isMetricViewQueueDrainScheduled) {
        return;
    }

    isMetricViewQueueDrainScheduled = true;
    setImmediate(drainMetricViewQueue);
}

function drainMetricViewQueue(): void {
    isMetricViewQueueDrainScheduled = false;

    while (
        activeMetricViewUpdateCount < MAX_CONCURRENT_METRIC_VIEW_UPDATES
        && metricViewActionQueue.length > 0
    ) {
        const actionId = metricViewActionQueue.dequeue();
        if (!actionId) {
            continue;
        }

        const metricViewActionState = metricViewActionStates.get(actionId);
        if (!metricViewActionState) {
            continue;
        }

        metricViewActionState.isQueued = false;

        if (
            !metricViewActionState.active
            || metricViewActionState.isRenderInFlight
            || !metricViewActionState.pendingOptions
        ) {
            continue;
        }

        try {
            runMetricViewUpdate(metricViewActionState, metricViewActionState.pendingOptions);
        } catch (error) {
            log.error(() => `Render/update error: ${String(error)}`);
            finishMetricViewUpdate(metricViewActionState);
        }
    }

    if (metricViewActionQueue.length > 0 && activeMetricViewUpdateCount < MAX_CONCURRENT_METRIC_VIEW_UPDATES) {
        scheduleMetricViewQueueDrain();
    }
}

function finishMetricViewUpdate(metricViewActionState: MetricViewActionState): void {
    metricViewActionState.isRenderInFlight = false;
    activeMetricViewUpdateCount = Math.max(0, activeMetricViewUpdateCount - 1);

    if (!metricViewActionState.active) {
        scheduleMetricViewQueueDrain();
        return;
    }

    if (metricViewActionState.pendingOptions) {
        enqueueMetricViewAction(metricViewActionState);
    }

    scheduleMetricViewQueueDrain();
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

