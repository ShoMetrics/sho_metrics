import { Target, type WillAppearEvent } from "@elgato/streamdeck";
import { wallClockNowMilliseconds } from "../shared/clock";
import type { TouchStripMetricLayout } from "../view-rendering/metric-view-frame";

export interface TouchStripMetricLayoutState {
    layoutPromise: Promise<void> | null;
    layoutPath: string | null;
}

export type MetricViewKeyImageTarget = "software-and-hardware" | "hardware-only";

export type MetricViewDispatchResult =
    | {
        readonly status: "rendered";
        readonly donePhase: "setFeedbackDone" | "setImageDone";
        readonly updateStartTimestampMilliseconds: number;
        readonly updateEndTimestampMilliseconds: number;
    }
    | {
        readonly status: "failed";
        readonly failureMessage: string;
        readonly error: unknown;
        readonly updateStartTimestampMilliseconds: number | null;
        readonly updateEndTimestampMilliseconds: number;
    }
    | {
        readonly status: "inactive";
        readonly updateStartTimestampMilliseconds: null;
        readonly updateEndTimestampMilliseconds: number;
    };

export async function dispatchMetricViewImage(options: {
    readonly event: WillAppearEvent;
    readonly softwarePngDataUrl: string;
    readonly hardwarePngDataUrl: string;
    readonly touchStripMetricLayout: TouchStripMetricLayout | null;
    readonly touchStripMetricLayoutState: TouchStripMetricLayoutState;
    readonly isActionActive: () => boolean;
    readonly keyImageTarget?: MetricViewKeyImageTarget | undefined;
}): Promise<MetricViewDispatchResult> {
    if (options.event.action.isDial()) {
        return dispatchTouchStripMetricImage(options);
    }

    if (options.event.action.isKey()) {
        return dispatchKeyMetricImage(options);
    }

    return {
        status: "failed",
        failureMessage: "Unsupported Stream Deck action type",
        error: new Error("Unsupported Stream Deck action type"),
        updateStartTimestampMilliseconds: null,
        updateEndTimestampMilliseconds: wallClockNowMilliseconds(),
    };
}

async function dispatchTouchStripMetricImage(options: {
    readonly event: WillAppearEvent;
    readonly hardwarePngDataUrl: string;
    readonly touchStripMetricLayout: TouchStripMetricLayout | null;
    readonly touchStripMetricLayoutState: TouchStripMetricLayoutState;
    readonly isActionActive: () => boolean;
}): Promise<MetricViewDispatchResult> {
    let updateStartTimestampMilliseconds: number | null = null;

    try {
        await ensureTouchStripMetricLayout(options);

        if (!options.isActionActive() || !options.event.action.isDial()) {
            return {
                status: "inactive",
                updateStartTimestampMilliseconds: null,
                updateEndTimestampMilliseconds: wallClockNowMilliseconds(),
            };
        }

        updateStartTimestampMilliseconds = wallClockNowMilliseconds();
        await options.event.action.setFeedback({ metricImage: options.hardwarePngDataUrl });

        return {
            status: "rendered",
            donePhase: "setFeedbackDone",
            updateStartTimestampMilliseconds,
            updateEndTimestampMilliseconds: wallClockNowMilliseconds(),
        };
    } catch (error) {
        return {
            status: "failed",
            failureMessage: updateStartTimestampMilliseconds == null
                ? "Failed to update touch strip metric image"
                : "Failed to set touch strip feedback",
            error,
            updateStartTimestampMilliseconds,
            updateEndTimestampMilliseconds: wallClockNowMilliseconds(),
        };
    }
}

async function dispatchKeyMetricImage(options: {
    readonly event: WillAppearEvent;
    readonly softwarePngDataUrl: string;
    readonly hardwarePngDataUrl: string;
    readonly keyImageTarget?: MetricViewKeyImageTarget | undefined;
}): Promise<MetricViewDispatchResult> {
    const updateStartTimestampMilliseconds = wallClockNowMilliseconds();

    try {
        if (options.keyImageTarget === "hardware-only") {
            await options.event.action.setImage(options.hardwarePngDataUrl, { target: Target.Hardware });
            return {
                status: "rendered",
                donePhase: "setImageDone",
                updateStartTimestampMilliseconds,
                updateEndTimestampMilliseconds: wallClockNowMilliseconds(),
            };
        }

        if (options.softwarePngDataUrl === options.hardwarePngDataUrl) {
            await options.event.action.setImage(options.hardwarePngDataUrl);
        } else {
            await options.event.action.setImage(options.softwarePngDataUrl, { target: Target.Software });
            await options.event.action.setImage(options.hardwarePngDataUrl, { target: Target.Hardware });
        }

        return {
            status: "rendered",
            donePhase: "setImageDone",
            updateStartTimestampMilliseconds,
            updateEndTimestampMilliseconds: wallClockNowMilliseconds(),
        };
    } catch (error) {
        return {
            status: "failed",
            failureMessage: "Failed to set key image",
            error,
            updateStartTimestampMilliseconds,
            updateEndTimestampMilliseconds: wallClockNowMilliseconds(),
        };
    }
}

function ensureTouchStripMetricLayout(options: {
    readonly event: WillAppearEvent;
    readonly touchStripMetricLayout: TouchStripMetricLayout | null;
    readonly touchStripMetricLayoutState: TouchStripMetricLayoutState;
}): Promise<void> {
    if (!options.event.action.isDial() || !options.touchStripMetricLayout) {
        return Promise.resolve();
    }

    const layoutState = options.touchStripMetricLayoutState;

    if (
        layoutState.layoutPromise
        && layoutState.layoutPath === options.touchStripMetricLayout.layoutPath
    ) {
        return layoutState.layoutPromise;
    }

    layoutState.layoutPath = options.touchStripMetricLayout.layoutPath;
    const layoutPromise = options.event.action.setFeedbackLayout(options.touchStripMetricLayout.layoutPath)
        .catch(error => {
            if (layoutState.layoutPath === options.touchStripMetricLayout?.layoutPath) {
                layoutState.layoutPromise = null;
                layoutState.layoutPath = null;
            }
            throw error;
        });
    layoutState.layoutPromise = layoutPromise;
    return layoutPromise;
}
