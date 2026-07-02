import type { WillAppearEvent } from "@elgato/streamdeck";
import { rasterizeSvgToPngDataUrl } from "../view-rendering/rasterize/rasterizer";
import type { MetricRenderAppearance } from "../view-rendering/color/render-appearance";
import {
    composeMetricViewFrame,
    resolveMetricViewLogValue,
    resolveMetricViewSampleTimestampMilliseconds,
    type DualMetricRenderOptions,
    type HardwareSummaryRenderOptions,
    type MetricRenderOptions,
    type SingleMetricRenderOptions,
} from "../view-rendering/frame/metric-view-frame";
import { logger } from "../logging/logger";
import { resolveProductionLogThrottleMilliseconds } from "../logging/log-throttle";
import type { ResolvedAppearanceSettings } from "../settings/resolved-settings";
import { MetricViewUpdateQueue, type MetricViewUpdatePriority } from "./update-queue";
import {
    dispatchMetricViewImage,
    type TouchStripMetricLayoutState,
} from "./dispatch";
import {
    recordMetricViewPerformanceSample,
} from "./view-update-observability";
import type { MetricViewPerformanceRenderContext } from "./performance-stats";
import { buildMetricRenderAppearance } from "../settings/render-appearance-builder";
import { CUSTOM_HTTP_METRIC_KEY_PREFIX } from "../runtime/sources/custom-http/custom-http-metric-key";
import {
    resolveHardwareColorCompensationProfile,
    shouldSuppressMetricViewForColorCompensation,
} from "../color-compensation/runtime-store";
import { wrapSvgWithColorCompensationFilter } from "../view-rendering/color/color-compensation-filter";
import { hasColorCompensationProfileEffect } from "../color-compensation/types";
import { wallClockNowMilliseconds } from "../shared/clock";
import { observeProcessActivity, type ProcessResumeEvent } from "../shared/process-resume-detector";
import {
    MetricImageDeliveryCoordinator,
    type MetricImageDeliveryPolicyResolver,
} from "./image-delivery/metric-image-delivery-coordinator";
import type { MetricImageResender } from "./image-delivery/metric-image-resender";

const log = logger.for("MetricViewUpdateRunner");

const MAX_CONCURRENT_METRIC_VIEW_UPDATES = 1;
const BURSTY_RENDER_LOG_THROTTLE_MILLISECONDS = resolveProductionLogThrottleMilliseconds(10000);
const REPEATED_RENDER_FAILURE_LOG_THROTTLE_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60000);
const STALE_METRIC_TICK_RENDER_BASE_THRESHOLD_MILLISECONDS = 90_000;
const STALE_METRIC_TICK_RENDER_INTERVAL_GRACE_MILLISECONDS = 5_000;

interface MetricViewEvent {
    event: WillAppearEvent;
    metricKey: string;
}

export type SingleMetricViewOptions = SingleMetricRenderOptions & MetricViewEvent;
export type DualMetricViewOptions = DualMetricRenderOptions & MetricViewEvent;
/** Action event plus render contract for the hardware summary view. */
export type HardwareSummaryViewOptions = HardwareSummaryRenderOptions & MetricViewEvent;
export type MetricViewOptions = MetricRenderOptions & MetricViewEvent;

export interface MetricViewUpdateRunnerOptions {
    readonly maxConcurrentMetricViewUpdates?: number | undefined;
    readonly imageDeliveryPolicyResolver?: MetricImageDeliveryPolicyResolver | undefined;
    readonly imageResendJitterWindowMilliseconds?: number | undefined;
    readonly imageResender?: MetricImageResender | undefined;
    readonly wallClockNow?: (() => number) | undefined;
    readonly observeProcessActivity?: ((owner: string, timestampMilliseconds: number) => ProcessResumeEvent | undefined) | undefined;
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
    pollingIntervalMilliseconds: number;
}

export class MetricViewUpdateRunner {
    private readonly metricViewActionStates = new Map<string, MetricViewActionState>();
    private readonly metricViewActionQueue = new MetricViewUpdateQueue();
    private readonly maxConcurrentMetricViewUpdates: number;
    private readonly imageDeliveryCoordinator: MetricImageDeliveryCoordinator;
    private readonly wallClockNow: () => number;
    private readonly observeProcessActivity: (owner: string, timestampMilliseconds: number) => ProcessResumeEvent | undefined;
    private activeMetricViewUpdateCount = 0;
    private isMetricViewQueueDrainScheduled = false;

    constructor(options: MetricViewUpdateRunnerOptions = {}) {
        this.maxConcurrentMetricViewUpdates = options.maxConcurrentMetricViewUpdates
            ?? MAX_CONCURRENT_METRIC_VIEW_UPDATES;
        this.wallClockNow = options.wallClockNow ?? wallClockNowMilliseconds;
        this.observeProcessActivity = options.observeProcessActivity ?? observeProcessActivity;
        this.imageDeliveryCoordinator = new MetricImageDeliveryCoordinator({
            imageDeliveryPolicyResolver: options.imageDeliveryPolicyResolver,
            imageResender: options.imageResender,
            jitterWindowMilliseconds: options.imageResendJitterWindowMilliseconds,
        });
    }

    setMetricView(options: MetricViewOptions): void {
        if (shouldSuppressMetricViewForColorCompensation(options.event.action.id)) {
            return;
        }

        this.observeProcessActivity("metricViewUpdateRunner", this.wallClockNow());

        const metricViewActionState = this.getOrCreateMetricViewActionState(options.event.action.id);

        this.imageDeliveryCoordinator.cancel(metricViewActionState.actionId);
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
        this.imageDeliveryCoordinator.delete(metricViewActionState.actionId);
        this.metricViewActionQueue.remove(actionId);
        this.metricViewActionStates.delete(actionId);
    }

    /**
     * Updates the action's collection interval used by image delivery policy.
     *
     * Rendering only receives the latest widget data. The collection interval
     * is reported separately so long-poll actions can get bounded resend
     * protection without treating every rendered image as long-lived.
     */
    setMetricViewPollingInterval(actionId: string, pollingIntervalMilliseconds: number): void {
        const metricViewActionState = this.getOrCreateMetricViewActionState(actionId);

        metricViewActionState.pollingIntervalMilliseconds = pollingIntervalMilliseconds;
    }

    private runMetricViewUpdate(
        metricViewActionState: MetricViewActionState,
        options: MetricViewOptions,
    ): void {
        const updateTimestampMilliseconds = metricViewActionState.pendingUpdateTimestampMilliseconds;
        const updateReason = metricViewActionState.pendingUpdateReason;
        const settingsSignature = metricViewActionState.pendingSettingsSignature;

        this.imageDeliveryCoordinator.cancel(metricViewActionState.actionId);
        metricViewActionState.isRenderInFlight = true;
        metricViewActionState.pendingOptions = null;
        metricViewActionState.pendingUpdateTimestampMilliseconds = null;
        metricViewActionState.pendingUpdateReason = "metric-tick";
        metricViewActionState.pendingSettingsSignature = null;
        this.activeMetricViewUpdateCount += 1;

        const renderStartTimestampMilliseconds = this.wallClockNow();
        const frame = composeMetricViewFrame({
            viewOptions: options,
            renderTarget: options.event.action.isDial() ? "touch-strip" : "key",
        });
        const renderPlan = frame.renderPlan;
        const renderContext = buildMetricViewPerformanceRenderContext(options, renderPlan.renderAppearance);
        const renderedMetricData = frame.renderedMetricData;
        const imageDeliveryDecision = this.imageDeliveryCoordinator.decideInitialDelivery({
            actionId: metricViewActionState.actionId,
            updateReason,
            pollingIntervalMilliseconds: metricViewActionState.pollingIntervalMilliseconds,
            widgetData: options.widgetData,
        });
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
            log.debug(() => [
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
                log.atError()
                    .everyMs("metric-view-title-clear-failed", REPEATED_RENDER_FAILURE_LOG_THROTTLE_MILLISECONDS)
                    .log(() => `Failed to clear key title: ${error}`);
            });
        }

        const composeEndTimestampMilliseconds = this.wallClockNow();

        if (
            renderedSvgSignature === metricViewActionState.lastRenderedSvgSignature
            && !imageDeliveryDecision.policy.forceSendUnchangedImage
        ) {
            log.debug(() => [
                "skippedUnchanged",
                `actionId=${options.event.action.id}`,
                `metricKey=${options.metricKey}`,
                `composeMs=${composeEndTimestampMilliseconds - renderStartTimestampMilliseconds}`,
                `renderToSkipMs=${this.wallClockNow() - renderStartTimestampMilliseconds}`,
            ].join(" "));
            recordMetricViewPerformanceSample({
                event: options.event,
                updateReason,
                outcome: "skipped",
                renderContext,
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
            const rasterizeEndTimestampMilliseconds = this.wallClockNow();
            logMetricViewRasterizeFailure({
                actionId: options.event.action.id,
                metricKey: options.metricKey,
                stage: "software",
                renderContext,
                queueLength: this.metricViewActionQueue.length,
                activeActionCount: this.metricViewActionStates.size,
            });
            recordMetricViewPerformanceSample({
                event: options.event,
                updateReason,
                outcome: "failed",
                renderContext,
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

        // Keep the normal path to one `setImage()` payload. Only active color compensation
        // needs a distinct hardware image and the software/hardware target split.
        const hardwarePngDataUrl = hardwareSvg === softwareSvg
            ? softwarePngDataUrl
            : rasterizeSvgToPngDataUrl(hardwareSvg, renderPlan.pngSize);
        const rasterizeEndTimestampMilliseconds = this.wallClockNow();

        if (!hardwarePngDataUrl) {
            logMetricViewRasterizeFailure({
                actionId: options.event.action.id,
                metricKey: options.metricKey,
                stage: "hardware",
                renderContext,
                queueLength: this.metricViewActionQueue.length,
                activeActionCount: this.metricViewActionStates.size,
            });
            recordMetricViewPerformanceSample({
                event: options.event,
                updateReason,
                outcome: "failed",
                renderContext,
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
            const currentTimestampMilliseconds = this.wallClockNow();
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
                    this.imageDeliveryCoordinator.recordInitialRendered({
                        actionId: metricViewActionState.actionId,
                        slot: formatMetricViewActionSlot(options),
                        metricKey: options.metricKey,
                        event: options.event,
                        softwarePngDataUrl,
                        hardwareSvg,
                        pngSize: renderPlan.pngSize,
                        touchStripMetricLayout: renderPlan.touchStripMetricLayout,
                        touchStripMetricLayoutState: metricViewActionState.touchStripMetricLayoutState,
                        deliveryDecision: imageDeliveryDecision,
                        isActionActive: () => metricViewActionState.active,
                    });
                }

                recordMetricViewPerformanceSample({
                    event: options.event,
                    updateReason,
                    outcome: dispatchResult.status === "rendered" ? "rendered" : "failed",
                    renderContext,
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
                    log.atError()
                        .everyMs("metric-view-dispatch-failed", REPEATED_RENDER_FAILURE_LOG_THROTTLE_MILLISECONDS)
                        .log(() => `${dispatchResult.failureMessage}: ${dispatchResult.error}`);
                    return;
                }

                if (updateReason === "settings-change") {
                    log.atInfo()
                        .everyMs("settings-view-update-done", BURSTY_RENDER_LOG_THROTTLE_MILLISECONDS)
                        .log(() => {
                            const currentTimestampMilliseconds = this.wallClockNow();
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
                    const currentTimestampMilliseconds = this.wallClockNow();
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
            // Default to the shortest normal poll until the collection layer publishes the real interval.
            // This keeps image delivery conservative and avoids accidental long-poll resends during action startup.
            pollingIntervalMilliseconds: 1000,
        };
        this.metricViewActionStates.set(actionId, metricViewActionState);
        return metricViewActionState;
    }

    private recordMetricViewUpdate(metricViewActionState: MetricViewActionState, options: MetricViewOptions): void {
        const settingsSignature = buildMetricViewSettingsSignature(options.resolvedSettings);
        const isSettingsChange = metricViewActionState.lastScheduledSettingsSignature !== null
            && metricViewActionState.lastScheduledSettingsSignature !== settingsSignature.signature;
        const updateTimestampMilliseconds = this.wallClockNow();

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

        log.atInfo()
            .everyMs("settings-view-scheduled", BURSTY_RENDER_LOG_THROTTLE_MILLISECONDS)
            .log(() => [
                "settingsViewScheduled",
                `actionId=${options.event.action.id}`,
                `metricKey=${options.metricKey}`,
                `renderPrimitive=${settingsSignature.renderPrimitive}`,
                `viewKind=${options.metricRenderKind}`,
                `isRenderInFlight=${metricViewActionState.isRenderInFlight}`,
                `isQueued=${metricViewActionState.isQueued}`,
                `activeUpdates=${this.activeMetricViewUpdateCount}`,
                `queueLength=${this.metricViewActionQueue.length}`,
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

            if (this.discardStaleQueuedMetricTick(metricViewActionState, this.wallClockNow())) {
                continue;
            }

            try {
                this.runMetricViewUpdate(metricViewActionState, metricViewActionState.pendingOptions);
            } catch (error) {
                log.atError()
                    .everyMs("metric-view-render-update-failed", REPEATED_RENDER_FAILURE_LOG_THROTTLE_MILLISECONDS)
                    .log(() => `Render/update error: ${String(error)}`);
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

    private discardStaleQueuedMetricTick(
        metricViewActionState: MetricViewActionState,
        currentTimestampMilliseconds: number,
    ): boolean {
        const updateTimestampMilliseconds = metricViewActionState.pendingUpdateTimestampMilliseconds;

        if (
            metricViewActionState.pendingUpdateReason !== "metric-tick"
            || updateTimestampMilliseconds === null
        ) {
            return false;
        }

        const queuedMilliseconds = currentTimestampMilliseconds - updateTimestampMilliseconds;
        const staleThresholdMilliseconds = resolveStaleMetricTickRenderThresholdMilliseconds(
            metricViewActionState.pollingIntervalMilliseconds,
        );

        if (queuedMilliseconds < staleThresholdMilliseconds) {
            return false;
        }

        log.atInfo()
            .everyMs("stale-metric-tick-render-discarded", REPEATED_RENDER_FAILURE_LOG_THROTTLE_MILLISECONDS)
            .log(() => [
                "staleMetricTickRenderDiscarded",
                `actionId=${metricViewActionState.actionId}`,
                `queuedMs=${queuedMilliseconds}`,
                `thresholdMs=${staleThresholdMilliseconds}`,
                `pollingIntervalMs=${metricViewActionState.pollingIntervalMilliseconds}`,
                `queueLength=${this.metricViewActionQueue.length}`,
            ].join(" "));

        metricViewActionState.pendingOptions = null;
        metricViewActionState.pendingUpdateTimestampMilliseconds = null;
        metricViewActionState.pendingUpdateReason = "metric-tick";
        metricViewActionState.pendingSettingsSignature = null;
        return true;
    }
}

export const metricViewUpdateRunner = new MetricViewUpdateRunner();

export function setMetricView(options: MetricViewOptions): void {
    metricViewUpdateRunner.setMetricView(options);
}

export function clearMetricViewState(actionId: string): void {
    metricViewUpdateRunner.clearMetricViewState(actionId);
}

/**
 * Publishes an action's resolved polling cadence to image delivery.
 *
 * The runner sees render requests, not the collection subscription that produced
 * them. Delivery policy needs this interval to decide whether a lost key image
 * would remain stale long enough to justify delayed resend attempts.
 */
export function setMetricViewPollingInterval(actionId: string, pollingIntervalMilliseconds: number): void {
    metricViewUpdateRunner.setMetricViewPollingInterval(actionId, pollingIntervalMilliseconds);
}

function logMetricViewRasterizeFailure(options: {
    readonly actionId: string;
    readonly metricKey: string;
    readonly stage: "software" | "hardware";
    readonly renderContext: MetricViewPerformanceRenderContext;
    readonly queueLength: number;
    readonly activeActionCount: number;
}): void {
    log.atError()
        .everyMs(`metric-view-rasterize-failed:${options.stage}`, REPEATED_RENDER_FAILURE_LOG_THROTTLE_MILLISECONDS)
        .log(() => [
            "metricViewRasterizeFailed",
            `stage=${options.stage}`,
            `actionId=${options.actionId}`,
            `metricKey=${options.metricKey}`,
            `metricFamily=${options.renderContext.metricFamily}`,
            `viewKind=${options.renderContext.metricRenderKind}`,
            `renderPrimitive=${options.renderContext.renderPrimitive}`,
            `renderVariant=${options.renderContext.renderVariant}`,
            `theme=${options.renderContext.themePreset}`,
            `queueLength=${options.queueLength}`,
            `activeActionCount=${options.activeActionCount}`,
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
            `backgroundOpacity=${renderAppearance.transparentSurface.backgroundOpacity}`,
            `textOutline=${renderAppearance.transparentSurface.textOutline.color}/${renderAppearance.transparentSurface.textOutline.strength}`,
            `shapeOutline=${renderAppearance.transparentSurface.shapeOutline.color}/${renderAppearance.transparentSurface.shapeOutline.strength}`,
            `lineSmoothingPercent=${renderAppearance.lineSmoothingPercent}`,
            `gridLineVisibility=${renderAppearance.gridLineVisibility}`,
            `gridLineType=${renderAppearance.gridLineType}`,
        ].join(";"),
    };
}

function buildMetricViewPerformanceRenderContext(
    options: MetricViewOptions,
    renderAppearance: MetricRenderAppearance,
): MetricViewPerformanceRenderContext {
    return {
        metricFamily: summarizeMetricViewPerformanceMetricKey(options.metricKey),
        metricRenderKind: options.metricRenderKind,
        renderPrimitive: renderAppearance.renderPrimitive,
        renderVariant: resolveMetricViewPerformanceRenderVariant(renderAppearance),
        themePreset: renderAppearance.themePreset,
    };
}

function summarizeMetricViewPerformanceMetricKey(metricKey: string): string {
    if (metricKey.includes(",")) {
        const metricFamilies = metricKey
            .split(",")
            .map(metricKeyPart => summarizeMetricViewPerformanceMetricKey(metricKeyPart.trim()));
        const uniqueMetricFamilies = [...new Set(metricFamilies)];

        return uniqueMetricFamilies.length === 1 ? uniqueMetricFamilies[0] ?? "unknown" : "mixed";
    }

    if (metricKey.startsWith("lhm.sensor:")) {
        return "catalog";
    }

    if (metricKey.startsWith(CUSTOM_HTTP_METRIC_KEY_PREFIX)) {
        return "custom";
    }

    const metricFamily = metricKey.split(".")[0] ?? "";

    switch (metricFamily) {
        case "cpu":
        case "disk":
        case "gpu":
        case "memory":
        case "net":
        case "ram":
            return metricFamily;
        default:
            return metricFamily.length === 0 ? "unknown" : "other";
    }
}

function resolveMetricViewPerformanceRenderVariant(renderAppearance: MetricRenderAppearance): string {
    switch (renderAppearance.renderPrimitive) {
        case "circle":
            return renderAppearance.circleVariant;
        case "text":
            return renderAppearance.textVariant;
        case "sparkline":
            return renderAppearance.gridLineVisibility;
        case "bar":
            return "default";
    }
}

function formatMetricViewActionSlot(options: MetricViewOptions): string {
    if (!options.event.action.isKey()) {
        return "dial";
    }

    const coordinates = options.event.action.coordinates;

    if (coordinates === undefined) {
        return "key:unknown";
    }

    return `key:${coordinates.row}:${coordinates.column}`;
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

function resolveStaleMetricTickRenderThresholdMilliseconds(pollingIntervalMilliseconds: number): number {
    return Math.max(
        STALE_METRIC_TICK_RENDER_BASE_THRESHOLD_MILLISECONDS,
        pollingIntervalMilliseconds + STALE_METRIC_TICK_RENDER_INTERVAL_GRACE_MILLISECONDS,
    );
}
