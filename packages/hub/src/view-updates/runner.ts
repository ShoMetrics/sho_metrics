import type { WillAppearEvent } from "@elgato/streamdeck";
import { rasterizeSvgToPngDataUrl } from "../view-rendering/rasterizer";
import type { MetricRenderAppearance } from "../view-rendering/render-appearance";
import {
    composeMetricViewFrame,
    resolveMetricViewLogValue,
    resolveMetricViewSampleTimestampMilliseconds,
    type DualMetricRenderOptions,
    type MetricRenderOptions,
    type SingleMetricRenderOptions,
} from "../view-rendering/metric-view-frame";
import { logger } from "../logging/logger";
import type { ResolvedAppearanceSettings } from "../settings/resolved-settings";
import { MetricViewUpdateQueue, type MetricViewUpdatePriority } from "./update-queue";
import {
    dispatchMetricViewImage,
    type TouchStripMetricLayoutState,
} from "./dispatch";
import {
    recordMetricViewPerformanceSample,
} from "./view-update-observability";
import { buildMetricRenderAppearance } from "../settings/render-appearance-builder";
import {
    resolveHardwareColorCompensationProfile,
    shouldSuppressMetricViewForColorCompensation,
} from "../color-compensation/runtime-store";
import { wrapSvgWithColorCompensationFilter } from "../view-rendering/color-compensation-filter";
import { hasColorCompensationProfileEffect } from "../color-compensation/types";
import { wallClockNowMilliseconds } from "../shared/clock";

const log = logger.for("MetricViewUpdateRunner");

const MAX_CONCURRENT_METRIC_VIEW_UPDATES = 1;

interface MetricViewEvent {
    event: WillAppearEvent;
    metricKey: string;
}

export type SingleMetricViewOptions = SingleMetricRenderOptions & MetricViewEvent;
export type DualMetricViewOptions = DualMetricRenderOptions & MetricViewEvent;
export type MetricViewOptions = MetricRenderOptions & MetricViewEvent;

export interface MetricViewUpdateRunnerOptions {
    readonly maxConcurrentMetricViewUpdates?: number | undefined;
}

interface MetricViewActionState {
    actionId: string;
    isRenderInFlight: boolean;
    isQueued: boolean;
    active: boolean;
    pendingOptions: MetricViewOptions | null;
    pendingUpdateTimestampMilliseconds: number | null;
    pendingUpdateReason: MetricViewUpdatePriority;
    pendingSettingsSignature: string | null;
    touchStripMetricLayoutState: TouchStripMetricLayoutState;
    lastRenderedSvgSignature: string | null;
    lastScheduledSettingsSignature: string | null;
}

export class MetricViewUpdateRunner {
    private readonly metricViewActionStates = new Map<string, MetricViewActionState>();
    private readonly metricViewActionQueue = new MetricViewUpdateQueue();
    private readonly maxConcurrentMetricViewUpdates: number;
    private activeMetricViewUpdateCount = 0;
    private isMetricViewQueueDrainScheduled = false;

    constructor(options: MetricViewUpdateRunnerOptions = {}) {
        this.maxConcurrentMetricViewUpdates = options.maxConcurrentMetricViewUpdates
            ?? MAX_CONCURRENT_METRIC_VIEW_UPDATES;
    }

    setMetricView(options: MetricViewOptions): void {
        if (shouldSuppressMetricViewForColorCompensation(options.event.action.id)) {
            return;
        }

        const metricViewActionState = this.getOrCreateMetricViewActionState(options.event.action.id);

        this.recordMetricViewUpdate(metricViewActionState, options);
        metricViewActionState.pendingOptions = options;
        this.enqueueMetricViewAction(metricViewActionState);
    }

    clearMetricViewState(actionId: string): void {
        const metricViewActionState = this.metricViewActionStates.get(actionId);

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
        this.metricViewActionQueue.remove(actionId);
        this.metricViewActionStates.delete(actionId);
    }

    private runMetricViewUpdate(
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
        this.activeMetricViewUpdateCount += 1;

        const renderStartTimestampMilliseconds = wallClockNowMilliseconds();
        const frame = composeMetricViewFrame({
            viewOptions: options,
            renderTarget: options.event.action.isDial() ? "touch-strip" : "key",
        });
        const renderPlan = frame.renderPlan;
        const renderedMetricData = frame.renderedMetricData;
        const colorCompensationProfile = resolveHardwareColorCompensationProfile({
            actionId: options.event.action.id,
            streamDeckDeviceId: options.event.action.device.id,
            surfaceId: undefined,
        });
        const softwareSvg = frame.svg;
        const hardwareSvg = hasColorCompensationProfileEffect(colorCompensationProfile)
            ? wrapSvgWithColorCompensationFilter(softwareSvg, colorCompensationProfile)
            : softwareSvg;
        const renderedSvgSignature = hardwareSvg === softwareSvg
            ? softwareSvg
            : [
                softwareSvg,
                "<!-- shometrics-hardware-image -->",
                hardwareSvg,
            ].join("\n");
        const titleClearRequested = options.event.action.isKey();

        if (updateReason === "settings-change") {
            log.info(() => [
                "settingsViewRenderStart",
                `actionId=${options.event.action.id}`,
                `metricKey=${options.metricKey}`,
                `renderPrimitive=${renderPlan.renderAppearance.renderPrimitive}`,
                `queuedMs=${formatElapsedMilliseconds(updateTimestampMilliseconds, renderStartTimestampMilliseconds)}`,
                `activeUpdates=${this.activeMetricViewUpdateCount}`,
                `queueLength=${this.metricViewActionQueue.length}`,
                `signature=${settingsSignature ?? "unknown"}`,
            ].join(" "));
        }

        if (titleClearRequested) {
            options.event.action.setTitle("").catch(error => {
                log.error(() => `Failed to clear key title: ${error}`);
            });
        }

        const composeEndTimestampMilliseconds = wallClockNowMilliseconds();

        if (renderedSvgSignature === metricViewActionState.lastRenderedSvgSignature) {
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
                `renderToSkipMs=${wallClockNowMilliseconds() - renderStartTimestampMilliseconds}`,
            ].join(" "));
            recordMetricViewPerformanceSample({
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
                queueLength: this.metricViewActionQueue.length,
                activeActionCount: this.metricViewActionStates.size,
            });
            this.finishMetricViewUpdate(metricViewActionState);
            return;
        }

        const softwarePngDataUrl = rasterizeSvgToPngDataUrl(softwareSvg, renderPlan.pngSize);

        if (!softwarePngDataUrl) {
            recordMetricViewPerformanceSample({
                event: options.event,
                updateReason,
                outcome: "failed",
                titleClearRequested,
                updateTimestampMilliseconds,
                renderStartTimestampMilliseconds,
                composeEndTimestampMilliseconds,
                rasterizeEndTimestampMilliseconds: wallClockNowMilliseconds(),
                updateStartTimestampMilliseconds: null,
                updateEndTimestampMilliseconds: wallClockNowMilliseconds(),
                queueLength: this.metricViewActionQueue.length,
                activeActionCount: this.metricViewActionStates.size,
            });
            this.finishMetricViewUpdate(metricViewActionState);
            return;
        }

        const hardwarePngDataUrl = hardwareSvg === softwareSvg
            ? softwarePngDataUrl
            : rasterizeSvgToPngDataUrl(hardwareSvg, renderPlan.pngSize);
        const rasterizeEndTimestampMilliseconds = wallClockNowMilliseconds();

        if (!hardwarePngDataUrl) {
            recordMetricViewPerformanceSample({
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
                queueLength: this.metricViewActionQueue.length,
                activeActionCount: this.metricViewActionStates.size,
            });
            this.finishMetricViewUpdate(metricViewActionState);
            return;
        }

        log.debug(() => {
            const currentTimestampMilliseconds = wallClockNowMilliseconds();
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

        dispatchMetricViewImage({
            event: options.event,
            softwarePngDataUrl,
            hardwarePngDataUrl,
            touchStripMetricLayout: renderPlan.touchStripMetricLayout,
            touchStripMetricLayoutState: metricViewActionState.touchStripMetricLayoutState,
            isActionActive: () => metricViewActionState.active,
        })
            .then(dispatchResult => {
                if (dispatchResult.status === "inactive") {
                    return;
                }

                if (dispatchResult.status === "rendered") {
                    metricViewActionState.lastRenderedSvgSignature = renderedSvgSignature;
                }

                recordMetricViewPerformanceSample({
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
                    queueLength: this.metricViewActionQueue.length,
                    activeActionCount: this.metricViewActionStates.size,
                });

                if (dispatchResult.status === "failed") {
                    log.error(() => `${dispatchResult.failureMessage}: ${dispatchResult.error}`);
                    return;
                }

                if (updateReason === "settings-change") {
                    log.info(() => {
                        const currentTimestampMilliseconds = wallClockNowMilliseconds();
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
                    const currentTimestampMilliseconds = wallClockNowMilliseconds();
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
                this.finishMetricViewUpdate(metricViewActionState);
            });
    }

    private getOrCreateMetricViewActionState(actionId: string): MetricViewActionState {
        const existingMetricViewActionState = this.metricViewActionStates.get(actionId);

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
            lastRenderedSvgSignature: null,
            lastScheduledSettingsSignature: null,
        };
        this.metricViewActionStates.set(actionId, metricViewActionState);
        return metricViewActionState;
    }

    private recordMetricViewUpdate(metricViewActionState: MetricViewActionState, options: MetricViewOptions): void {
        const settingsSignature = buildMetricViewSettingsSignature(options.resolvedSettings);
        const isSettingsChange = metricViewActionState.lastScheduledSettingsSignature !== null
            && metricViewActionState.lastScheduledSettingsSignature !== settingsSignature.signature;
        const updateTimestampMilliseconds = wallClockNowMilliseconds();

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
            `viewKind=${options.metricRenderKind}`,
            `isRenderInFlight=${metricViewActionState.isRenderInFlight}`,
            `isQueued=${metricViewActionState.isQueued}`,
            `activeUpdates=${this.activeMetricViewUpdateCount}`,
            `queueLength=${this.metricViewActionQueue.length}`,
            `signature=${settingsSignature.signature}`,
        ].join(" "));
    }

    private enqueueMetricViewAction(metricViewActionState: MetricViewActionState): void {
        if (
            !metricViewActionState.active
            || metricViewActionState.isRenderInFlight
        ) {
            return;
        }

        this.metricViewActionQueue.enqueue(metricViewActionState.actionId, metricViewActionState.pendingUpdateReason);
        metricViewActionState.isQueued = true;
        this.scheduleMetricViewQueueDrain();
    }

    private scheduleMetricViewQueueDrain(): void {
        if (this.isMetricViewQueueDrainScheduled) {
            return;
        }

        this.isMetricViewQueueDrainScheduled = true;
        setImmediate(() => {
            this.drainMetricViewQueue();
        });
    }

    private drainMetricViewQueue(): void {
        this.isMetricViewQueueDrainScheduled = false;

        while (
            this.activeMetricViewUpdateCount < this.maxConcurrentMetricViewUpdates
            && this.metricViewActionQueue.length > 0
        ) {
            const actionId = this.metricViewActionQueue.dequeue();
            if (!actionId) {
                continue;
            }

            const metricViewActionState = this.metricViewActionStates.get(actionId);
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
                this.runMetricViewUpdate(metricViewActionState, metricViewActionState.pendingOptions);
            } catch (error) {
                log.error(() => `Render/update error: ${String(error)}`);
                this.finishMetricViewUpdate(metricViewActionState);
            }
        }

        if (
            this.metricViewActionQueue.length > 0
            && this.activeMetricViewUpdateCount < this.maxConcurrentMetricViewUpdates
        ) {
            this.scheduleMetricViewQueueDrain();
        }
    }

    private finishMetricViewUpdate(metricViewActionState: MetricViewActionState): void {
        metricViewActionState.isRenderInFlight = false;
        this.activeMetricViewUpdateCount = Math.max(0, this.activeMetricViewUpdateCount - 1);

        if (!metricViewActionState.active) {
            this.scheduleMetricViewQueueDrain();
            return;
        }

        if (metricViewActionState.pendingOptions) {
            this.enqueueMetricViewAction(metricViewActionState);
        }

        this.scheduleMetricViewQueueDrain();
    }
}

export const metricViewUpdateRunner = new MetricViewUpdateRunner();

export function setMetricView(options: MetricViewOptions): void {
    metricViewUpdateRunner.setMetricView(options);
}

export function clearMetricViewState(actionId: string): void {
    metricViewUpdateRunner.clearMetricViewState(actionId);
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
            `backgroundOpacity=${renderAppearance.transparentSurface.backgroundOpacity}`,
            `textOutline=${renderAppearance.transparentSurface.textOutline.color}/${renderAppearance.transparentSurface.textOutline.strength}`,
            `shapeOutline=${renderAppearance.transparentSurface.shapeOutline.color}/${renderAppearance.transparentSurface.shapeOutline.strength}`,
            `lineSmoothingPercent=${renderAppearance.lineSmoothingPercent}`,
            `gridLineVisibility=${renderAppearance.gridLineVisibility}`,
            `gridLineType=${renderAppearance.gridLineType}`,
        ].join(";"),
    };
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

