import type { WillAppearEvent } from "@elgato/streamdeck";
import { logger } from "../../logging/node-logger";
import { resolveProductionLogThrottleMilliseconds } from "../../logging/log-throttle";
import { rasterizeSvgToPngDataUrl } from "../../view-rendering/rasterize/rasterizer";
import type { TouchStripMetricLayout } from "../../view-rendering/frame/metric-view-frame";
import type { KeySize } from "../../view-rendering/widget-data";
import {
    dispatchMetricViewImage,
    type TouchStripMetricLayoutState,
} from "../dispatch";
import {
    formatMetricImageDeliveryReason,
    type MetricImageDeliveryPolicy,
} from "./metric-image-delivery-policy";
import {
    buildMetricImageResendJitterKey,
    computeStableMetricImageResendJitterMilliseconds,
} from "./metric-image-resend-jitter";
import { addHardwareImageResendOpacity } from "./hardware-image-resend-opacity";

const log = logger.for("MetricImageResender");

const REPEATED_IMAGE_RESEND_FAILURE_LOG_THROTTLE_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60_000);
const DEFAULT_IMAGE_RESEND_JITTER_WINDOW_MILLISECONDS = 3_000;

interface MetricImageResendState {
    generation: number;
    timerHandles: Array<ReturnType<typeof setTimeout>>;
}

export interface MetricImageResenderOptions {
    readonly jitterWindowMilliseconds?: number | undefined;
}

export interface MetricImageResendSchedule {
    readonly actionId: string;
    readonly slot: string;
    readonly metricKey: string;
    readonly event: WillAppearEvent;
    readonly softwarePngDataUrl: string;
    readonly hardwareSvg: string;
    readonly pngSize: KeySize;
    readonly touchStripMetricLayout: TouchStripMetricLayout | null;
    readonly touchStripMetricLayoutState: TouchStripMetricLayoutState;
    readonly imageDeliveryPolicy: MetricImageDeliveryPolicy;
    readonly isActionActive: () => boolean;
}

export class MetricImageResender {
    private readonly jitterWindowMilliseconds: number;
    private readonly resendStateByActionId = new Map<string, MetricImageResendState>();

    constructor(options: MetricImageResenderOptions = {}) {
        this.jitterWindowMilliseconds = options.jitterWindowMilliseconds
            ?? DEFAULT_IMAGE_RESEND_JITTER_WINDOW_MILLISECONDS;
    }

    schedule(options: MetricImageResendSchedule): void {
        this.cancel(options.actionId);

        if (
            !options.isActionActive()
            || !options.event.action.isKey()
            || options.imageDeliveryPolicy.resendDelaysMilliseconds.length === 0
        ) {
            return;
        }

        const state = this.nextResendState(options.actionId);
        const jitterKey = resolveMetricImageResendJitterKey(options.event);
        const jitterMilliseconds = computeStableMetricImageResendJitterMilliseconds(
            jitterKey,
            this.jitterWindowMilliseconds,
        );

        log.debug(() => [
            "imageResendScheduled",
            `actionId=${options.actionId}`,
            `slot=${options.slot}`,
            `metricKey=${options.metricKey}`,
            `reason=${formatMetricImageDeliveryReason(options.imageDeliveryPolicy.reason)}`,
            `delaysMs=${options.imageDeliveryPolicy.resendDelaysMilliseconds.join(",")}`,
            `jitterMs=${jitterMilliseconds}`,
            `jitterKey=${jitterKey}`,
            `generation=${state.generation}`,
        ].join(" "));

        for (const [resendIndex, delayMilliseconds] of options.imageDeliveryPolicy.resendDelaysMilliseconds.entries()) {
            const totalDelayMilliseconds = delayMilliseconds + jitterMilliseconds;
            const timerHandle = setTimeout(() => {
                state.timerHandles = state.timerHandles
                    .filter(existingTimerHandle => existingTimerHandle !== timerHandle);
                this.dispatchResend({
                    ...options,
                    delayMilliseconds,
                    jitterMilliseconds,
                    totalDelayMilliseconds,
                    generation: state.generation,
                    resendIndex,
                });
            }, totalDelayMilliseconds);
            state.timerHandles.push(timerHandle);
        }
    }

    cancel(actionId: string): void {
        const state = this.resendStateByActionId.get(actionId);
        if (state === undefined) {
            return;
        }

        state.generation += 1;
        for (const timerHandle of state.timerHandles) {
            clearTimeout(timerHandle);
        }
        state.timerHandles = [];
    }

    delete(actionId: string): void {
        this.cancel(actionId);
        this.resendStateByActionId.delete(actionId);
    }

    private nextResendState(actionId: string): MetricImageResendState {
        const existingState = this.resendStateByActionId.get(actionId);
        if (existingState !== undefined) {
            existingState.generation += 1;
            return existingState;
        }

        const state = {
            generation: 1,
            timerHandles: [],
        };
        this.resendStateByActionId.set(actionId, state);
        return state;
    }

    private dispatchResend(options: MetricImageResendSchedule & {
        readonly delayMilliseconds: number;
        readonly jitterMilliseconds: number;
        readonly totalDelayMilliseconds: number;
        readonly generation: number;
        readonly resendIndex: number;
    }): void {
        const currentGeneration = this.resendStateByActionId.get(options.actionId)?.generation;
        if (!options.isActionActive()) {
            log.debug(() => [
                "imageResendSkippedInactive",
                `actionId=${options.actionId}`,
                `slot=${options.slot}`,
                `metricKey=${options.metricKey}`,
                `delayMs=${options.delayMilliseconds}`,
                `jitterMs=${options.jitterMilliseconds}`,
                `totalDelayMs=${options.totalDelayMilliseconds}`,
                `scheduledGeneration=${options.generation}`,
                `currentGeneration=${currentGeneration ?? "none"}`,
            ].join(" "));
            return;
        }

        if (currentGeneration !== options.generation) {
            log.debug(() => [
                "imageResendSkippedStaleGeneration",
                `actionId=${options.actionId}`,
                `slot=${options.slot}`,
                `metricKey=${options.metricKey}`,
                `delayMs=${options.delayMilliseconds}`,
                `jitterMs=${options.jitterMilliseconds}`,
                `totalDelayMs=${options.totalDelayMilliseconds}`,
                `scheduledGeneration=${options.generation}`,
                `currentGeneration=${currentGeneration ?? "none"}`,
            ].join(" "));
            return;
        }

        const hardwareSvgWithNonce = addHardwareImageResendOpacity(options.hardwareSvg, options.resendIndex);
        const hardwarePngDataUrl = rasterizeSvgToPngDataUrl(hardwareSvgWithNonce, options.pngSize);

        if (!hardwarePngDataUrl) {
            log.atError()
                .everyMs("metric-image-resend-rasterize-failed", REPEATED_IMAGE_RESEND_FAILURE_LOG_THROTTLE_MILLISECONDS)
                .log(() => [
                    "imageResendRasterizeFailed",
                    `actionId=${options.actionId}`,
                    `slot=${options.slot}`,
                    `metricKey=${options.metricKey}`,
                ].join(" "));
            return;
        }

        log.debug(() => [
            "imageResendDispatchStart",
            `actionId=${options.actionId}`,
            `slot=${options.slot}`,
            `metricKey=${options.metricKey}`,
            `reason=${formatMetricImageDeliveryReason(options.imageDeliveryPolicy.reason)}`,
            `delayMs=${options.delayMilliseconds}`,
            `jitterMs=${options.jitterMilliseconds}`,
            `totalDelayMs=${options.totalDelayMilliseconds}`,
            `generation=${options.generation}`,
        ].join(" "));

        dispatchMetricViewImage({
            event: options.event,
            softwarePngDataUrl: options.softwarePngDataUrl,
            hardwarePngDataUrl,
            touchStripMetricLayout: options.touchStripMetricLayout,
            touchStripMetricLayoutState: options.touchStripMetricLayoutState,
            isActionActive: () => (
                options.isActionActive()
                && this.resendStateByActionId.get(options.actionId)?.generation === options.generation
            ),
            keyImageTarget: "hardware-only",
        })
            .then(dispatchResult => {
                log.debug(() => [
                    "imageResendDispatchDone",
                    `actionId=${options.actionId}`,
                    `slot=${options.slot}`,
                    `metricKey=${options.metricKey}`,
                    `status=${dispatchResult.status}`,
                    `phase=${dispatchResult.status === "rendered" ? dispatchResult.donePhase : "none"}`,
                    `delayMs=${options.delayMilliseconds}`,
                    `jitterMs=${options.jitterMilliseconds}`,
                    `totalDelayMs=${options.totalDelayMilliseconds}`,
                    `sdkPromiseMs=${formatDispatchElapsedMilliseconds(dispatchResult)}`,
                    `scheduledGeneration=${options.generation}`,
                    `currentGeneration=${this.resendStateByActionId.get(options.actionId)?.generation ?? "none"}`,
                ].join(" "));

                if (dispatchResult.status !== "failed") {
                    return;
                }

                log.atError()
                    .everyMs("metric-image-resend-dispatch-failed", REPEATED_IMAGE_RESEND_FAILURE_LOG_THROTTLE_MILLISECONDS)
                    .log(() => `${dispatchResult.failureMessage}: ${dispatchResult.error}`);
            })
            .catch(error => {
                log.atError()
                    .everyMs("metric-image-resend-threw", REPEATED_IMAGE_RESEND_FAILURE_LOG_THROTTLE_MILLISECONDS)
                    .log(() => `Metric image resend threw: ${String(error)}`);
            });
    }
}

function resolveMetricImageResendJitterKey(event: WillAppearEvent): string {
    const coordinates = event.action.isKey()
        ? event.action.coordinates
        : undefined;

    if (coordinates === undefined) {
        return "key:unknown";
    }

    return buildMetricImageResendJitterKey({
        deviceId: event.action.device.id,
        controller: event.action.controllerType,
        row: coordinates.row,
        column: coordinates.column,
    });
}

function formatDispatchElapsedMilliseconds(dispatchResult: Awaited<ReturnType<typeof dispatchMetricViewImage>>): string {
    if (dispatchResult.updateStartTimestampMilliseconds == null) {
        return "unknown";
    }

    return String(dispatchResult.updateEndTimestampMilliseconds - dispatchResult.updateStartTimestampMilliseconds);
}
