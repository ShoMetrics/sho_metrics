export type MetricImageAvailability =
    | "no-data"
    | "fresh";

export type MetricImageDeliveryReason =
    | { readonly kind: "none" }
    | { readonly kind: "first-render" }
    | {
        readonly kind: "long-poll-interval-at-least";
        readonly thresholdMilliseconds: 600_000;
    }
    | { readonly kind: "settings-change" };

export interface MetricImageDeliveryPolicyInput {
    readonly updateReason: "metric-tick" | "settings-change";
    readonly pollingIntervalMilliseconds: number;
    readonly isFirstRenderedImageForAction: boolean;
    readonly currentAvailability: MetricImageAvailability;
}

export interface MetricImageDeliveryPolicy {
    readonly resendDelaysMilliseconds: readonly number[];
    readonly forceSendUnchangedImage: boolean;
    readonly reason: MetricImageDeliveryReason;
}

const LONG_RESEND_POLL_INTERVAL_MILLISECONDS = 600_000 as const;

// First-render resends intentionally wait until after the observed plugin-reload upload burst
// instead of firing immediately. Long-poll values also get a late 60s repair because a dropped
// image can otherwise stay visible for the full battery poll interval.
const FIRST_RENDER_RESEND_DELAYS_MILLISECONDS = [3_000, 5_000] as const;
const LONG_POLL_RESEND_DELAYS_MILLISECONDS = [1_000, 10_000, 60_000] as const;

const NO_RESEND_DELAYS_MILLISECONDS = [] as const;

/**
 * Resolves the bounded key-image self-healing policy for one rendered metric view.
 *
 * Stream Deck only acknowledges that `setImage()` was sent to the host. Host to
 * device upload failures are not observable from plugin code, so this policy
 * schedules a small number of repeated sends for states where a lost image
 * would remain user-visible for a long time.
 */
export function resolveMetricImageDeliveryPolicy(
    input: MetricImageDeliveryPolicyInput,
): MetricImageDeliveryPolicy {
    if (input.updateReason === "settings-change") {
        return {
            resendDelaysMilliseconds: NO_RESEND_DELAYS_MILLISECONDS,
            forceSendUnchangedImage: true,
            reason: { kind: "settings-change" },
        };
    }

    if (input.isFirstRenderedImageForAction) {
        return {
            resendDelaysMilliseconds: FIRST_RENDER_RESEND_DELAYS_MILLISECONDS,
            forceSendUnchangedImage: true,
            reason: { kind: "first-render" },
        };
    }

    if (input.currentAvailability !== "fresh") {
        return {
            resendDelaysMilliseconds: NO_RESEND_DELAYS_MILLISECONDS,
            forceSendUnchangedImage: false,
            reason: { kind: "none" },
        };
    }

    if (input.pollingIntervalMilliseconds >= LONG_RESEND_POLL_INTERVAL_MILLISECONDS) {
        return {
            resendDelaysMilliseconds: LONG_POLL_RESEND_DELAYS_MILLISECONDS,
            forceSendUnchangedImage: true,
            reason: {
                kind: "long-poll-interval-at-least",
                thresholdMilliseconds: LONG_RESEND_POLL_INTERVAL_MILLISECONDS,
            },
        };
    }

    return {
        resendDelaysMilliseconds: NO_RESEND_DELAYS_MILLISECONDS,
        forceSendUnchangedImage: false,
        reason: { kind: "none" },
    };
}

export function formatMetricImageDeliveryReason(reason: MetricImageDeliveryPolicy["reason"]): string {
    switch (reason.kind) {
        case "long-poll-interval-at-least":
            return `${reason.kind}:${reason.thresholdMilliseconds}`;
        case "first-render":
        case "settings-change":
        case "none":
            return reason.kind;
    }
}
