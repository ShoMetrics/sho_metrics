import type { WillAppearEvent } from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import { composeSvg } from "../rendering/composer";
import { rasterizeSvgToPngDataUrl } from "../rendering/rasterizer";
import { KEYPAD_PNG_SIZE, TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE, WIDGET_LOGICAL_SIZE } from "../rendering/widget-data";
import type { WidgetData } from "../rendering/widget-data";
import { resolveMetricVisualSettings, type MetricVisualSettings, type SettingValue } from "./metric-visual-settings";
import type { ArcGaugeStatusIcon } from "../widgets/primitives/arc-gauge";

export interface SingleMetricDisplayOptions {
    event: WillAppearEvent;
    metricKey: string;
    widgetData: WidgetData;
    centerIconFragment: string;
    statusIcon?: ArcGaugeStatusIcon;
    circularCenterContentOverride?: "value" | "icon" | "icon-value-unit";
    visualSettingsOverride?: Partial<MetricVisualSettings>;
}

interface SingleMetricDisplaySettings extends MetricVisualSettings {
    circularCenterContent?: SettingValue;
}

const TOUCH_STRIP_SINGLE_METRIC_LAYOUT = "layouts/single-metric-touchstrip.json";
const touchStripLayoutPromises = new Map<string, Promise<void>>();

export function setSingleMetricDisplay(options: SingleMetricDisplayOptions): void {
    const renderStartTimestampMilliseconds = Date.now();
    const settings = options.event.payload.settings as SingleMetricDisplaySettings;
    const visualSettings = resolveMetricVisualSettings({
        ...settings,
        ...options.visualSettingsOverride,
    });
    const pngSize = options.event.action.isDial() ? TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE : KEYPAD_PNG_SIZE;

    if (options.event.action.isKey()) {
        options.event.action.setTitle("").catch(error => {
            streamDeck.logger.error(`[SingleMetricDisplay] Failed to clear key title: ${error}`);
        });
    }

    const svg = composeSvg(options.widgetData, {
        ...visualSettings,
        configOverrides: buildSingleMetricConfigOverrides({
            settings,
            graphicType: visualSettings.graphicType,
            centerIconFragment: options.centerIconFragment,
            statusIcon: options.statusIcon,
            circularCenterContentOverride: options.circularCenterContentOverride,
        }),
    }, WIDGET_LOGICAL_SIZE);
    const composeEndTimestampMilliseconds = Date.now();
    const pngDataUrl = rasterizeSvgToPngDataUrl(svg, pngSize);
    const rasterizeEndTimestampMilliseconds = Date.now();

    if (!pngDataUrl) {
        return;
    }

    logDisplayDebug({
        actionId: options.event.action.id,
        metricKey: options.metricKey,
        phase: "rendered",
        value: options.widgetData.current,
        sampleTimestampMilliseconds: options.widgetData.sampleTimestampMilliseconds,
        renderStartTimestampMilliseconds,
        composeDurationMilliseconds: composeEndTimestampMilliseconds - renderStartTimestampMilliseconds,
        rasterizeDurationMilliseconds: rasterizeEndTimestampMilliseconds - composeEndTimestampMilliseconds,
    });

    if (options.event.action.isDial()) {
        const setFeedback = (): void => {
            if (options.event.action.isDial()) {
                const updateStartTimestampMilliseconds = Date.now();
                options.event.action.setFeedback({ metricImage: pngDataUrl })
                    .then(() => {
                        logUpdateDoneDebug({
                            actionId: options.event.action.id,
                            metricKey: options.metricKey,
                            phase: "setFeedbackDone",
                            sampleTimestampMilliseconds: options.widgetData.sampleTimestampMilliseconds,
                            updateStartTimestampMilliseconds,
                        });
                    })
                    .catch(error => {
                        streamDeck.logger.error(`[SingleMetricDisplay] Failed to set touch strip feedback: ${error}`);
                    });
            }
        };

        ensureTouchStripSingleMetricLayout(options.event).then(setFeedback).catch(error => {
            streamDeck.logger.error(`[SingleMetricDisplay] Failed to update touch strip metric image: ${error}`);
        });
        return;
    }

    if (options.event.action.isKey()) {
        const updateStartTimestampMilliseconds = Date.now();
        options.event.action.setImage(pngDataUrl)
            .then(() => {
                logUpdateDoneDebug({
                    actionId: options.event.action.id,
                    metricKey: options.metricKey,
                    phase: "setImageDone",
                    sampleTimestampMilliseconds: options.widgetData.sampleTimestampMilliseconds,
                    updateStartTimestampMilliseconds,
                });
            })
            .catch(error => {
                streamDeck.logger.error(`[SingleMetricDisplay] Failed to set key image: ${error}`);
            });
    }
}

function buildSingleMetricConfigOverrides(options: {
    settings: SingleMetricDisplaySettings;
    graphicType: string;
    centerIconFragment: string;
    statusIcon: ArcGaugeStatusIcon | undefined;
    circularCenterContentOverride: "value" | "icon" | "icon-value-unit" | undefined;
}): { centerContent?: "value" | "icon" | "icon-value-unit"; centerIconFragment?: string; statusIcon?: ArcGaugeStatusIcon } {
    if (options.graphicType !== "circular") {
        return {};
    }

    return {
        centerContent: options.circularCenterContentOverride
            ?? (options.settings.circularCenterContent === "icon" ? "icon" : "value"),
        centerIconFragment: options.centerIconFragment,
        statusIcon: options.statusIcon,
    };
}

function ensureTouchStripSingleMetricLayout(event: WillAppearEvent): Promise<void> {
    if (!event.action.isDial()) {
        return Promise.resolve();
    }

    const existingPromise = touchStripLayoutPromises.get(event.action.id);
    if (existingPromise) {
        return existingPromise;
    }

    const layoutPromise = event.action.setFeedbackLayout(TOUCH_STRIP_SINGLE_METRIC_LAYOUT).catch(error => {
        touchStripLayoutPromises.delete(event.action.id);
        throw error;
    });
    touchStripLayoutPromises.set(event.action.id, layoutPromise);
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
    streamDeck.logger.debug([
        "[SingleMetricDisplay]",
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
    streamDeck.logger.debug([
        "[SingleMetricDisplay]",
        options.phase,
        `actionId=${options.actionId}`,
        `metricKey=${options.metricKey}`,
        `sampleAgeMs=${formatAgeMilliseconds(options.sampleTimestampMilliseconds, currentTimestampMilliseconds)}`,
        `sdkPromiseMs=${currentTimestampMilliseconds - options.updateStartTimestampMilliseconds}`,
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
