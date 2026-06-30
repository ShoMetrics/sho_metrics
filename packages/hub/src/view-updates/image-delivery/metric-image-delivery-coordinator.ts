import type { WillAppearEvent } from "@elgato/streamdeck";
import { resolveMetricViewSampleTimestampMilliseconds, type TouchStripMetricLayout } from "../../view-rendering/frame/metric-view-frame";
import type { KeySize } from "../../view-rendering/widget-data";
import type { TouchStripMetricLayoutState } from "../dispatch";
import {
    resolveMetricImageDeliveryPolicy,
    type MetricImageAvailability,
    type MetricImageDeliveryPolicy,
    type MetricImageDeliveryPolicyInput,
} from "./metric-image-delivery-policy";
import { MetricImageResender, type MetricImageResenderOptions } from "./metric-image-resender";

export type MetricImageDeliveryPolicyResolver = (input: MetricImageDeliveryPolicyInput) => MetricImageDeliveryPolicy;

export interface MetricImageDeliveryCoordinatorOptions extends MetricImageResenderOptions {
    readonly imageDeliveryPolicyResolver?: MetricImageDeliveryPolicyResolver | undefined;
    readonly imageResender?: MetricImageResender | undefined;
}

export interface MetricImageInitialDeliveryDecision {
    readonly availability: MetricImageAvailability;
    readonly policy: MetricImageDeliveryPolicy;
}

export interface MetricImageInitialDeliveryInput {
    readonly actionId: string;
    readonly updateReason: MetricImageDeliveryPolicyInput["updateReason"];
    readonly pollingIntervalMilliseconds: number;
    readonly widgetData: MetricImageDeliveryWidgetData;
}

export interface MetricImageInitialRenderedInput {
    readonly actionId: string;
    readonly slot: string;
    readonly metricKey: string;
    readonly event: WillAppearEvent;
    readonly softwarePngDataUrl: string;
    readonly hardwareSvg: string;
    readonly pngSize: KeySize;
    readonly touchStripMetricLayout: TouchStripMetricLayout | null;
    readonly touchStripMetricLayoutState: TouchStripMetricLayoutState;
    readonly deliveryDecision: MetricImageInitialDeliveryDecision;
    readonly isActionActive: () => boolean;
}

type MetricImageDeliveryWidgetData = Parameters<typeof resolveMetricViewSampleTimestampMilliseconds>[0];

export class MetricImageDeliveryCoordinator {
    private readonly imageDeliveryPolicyResolver: MetricImageDeliveryPolicyResolver;
    private readonly imageResender: MetricImageResender;
    private readonly renderedActionIds = new Set<string>();

    constructor(options: MetricImageDeliveryCoordinatorOptions = {}) {
        this.imageDeliveryPolicyResolver = options.imageDeliveryPolicyResolver
            ?? resolveMetricImageDeliveryPolicy;
        this.imageResender = options.imageResender
            ?? new MetricImageResender({
                jitterWindowMilliseconds: options.jitterWindowMilliseconds,
            });
    }

    cancel(actionId: string): void {
        this.imageResender.cancel(actionId);
    }

    delete(actionId: string): void {
        this.imageResender.delete(actionId);
        this.renderedActionIds.delete(actionId);
    }

    decideInitialDelivery(input: MetricImageInitialDeliveryInput): MetricImageInitialDeliveryDecision {
        const availability = resolveMetricViewSampleTimestampMilliseconds(input.widgetData) === undefined
            ? "no-data"
            : "fresh";
        const policy = this.imageDeliveryPolicyResolver({
            updateReason: input.updateReason,
            pollingIntervalMilliseconds: input.pollingIntervalMilliseconds,
            isFirstRenderedImageForAction: !this.renderedActionIds.has(input.actionId),
            currentAvailability: availability,
        });

        return { availability, policy };
    }

    recordInitialRendered(input: MetricImageInitialRenderedInput): void {
        this.renderedActionIds.add(input.actionId);
        this.imageResender.schedule({
            actionId: input.actionId,
            slot: input.slot,
            metricKey: input.metricKey,
            event: input.event,
            softwarePngDataUrl: input.softwarePngDataUrl,
            hardwareSvg: input.hardwareSvg,
            pngSize: input.pngSize,
            touchStripMetricLayout: input.touchStripMetricLayout,
            touchStripMetricLayoutState: input.touchStripMetricLayoutState,
            imageDeliveryPolicy: input.deliveryDecision.policy,
            isActionActive: input.isActionActive,
        });
    }
}
