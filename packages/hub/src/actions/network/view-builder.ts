import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../../runtime/metric-store";
import type { NetworkInterfaceOption } from "../../runtime/network-interfaces";
import {
    resolveNetworkMetricKey,
    type NetworkMetricDirection,
} from "../../runtime/network-metric-keys";
import type { WidgetData } from "../../view-rendering/widget-data";
import { resolveColorForThresholdValue, type ColorConfig } from "../../view-rendering/color-resolver";
import type {
    ResolvedNetworkMetricTarget,
    ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import {
    buildNetworkSpeedWidgetData,
    convertMegabitsPerSecondToBytesPerSecond,
} from "../../metrics/network-speed-widget-data";
import { PROGRESS_CIRCLE_LABELS } from "../../widgets/primitives/progress-circle-label";
import {
    getNetworkDirectionStatusIcon,
    renderNetworkDirectionIconFragment,
    renderNetworkInterfaceIconFragment,
} from "../../widgets/icons/catalog/network";
import type { MetricViewOptions } from "../../view-updates/runner";
import { buildColorConfigFromAppearance, resolveSolidMetricColorMode } from "../../settings/render-paint-resolver";

export interface NetworkViewUpdate {
    viewOptions: MetricViewOptions;
    debugInfo?: NetworkViewDebugInfo;
}

export interface NetworkViewDebugInfo {
    direction: NetworkMetricDirection;
    networkMetricKey: string;
    sourceWidgetData: WidgetData;
    viewWidgetData: WidgetData;
}

interface BuildNetworkViewOptions {
    event: WillAppearEvent;
    settings: ResolvedWidgetSettings;
    target: ResolvedNetworkMetricTarget;
    metrics: MetricStoreReader;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    currentTimestampMilliseconds: number;
}

// Network throughput is a 1 Hz hot reading. Keep a last-good value through a few
// missed ticks, then let the renderer show N/A instead of a misleading old rate.
const NETWORK_SAMPLE_STALE_MS = 5000;

export function buildNetworkViewUpdate(options: BuildNetworkViewOptions): NetworkViewUpdate {
    const appearance = options.settings.widget.slot.appearance;
    const networkReading = options.target.reading;
    const selectedView = appearance.view.selectedView;
    const networkDirection = networkReading.direction;

    if (selectedView === "bar") {
        return {
            viewOptions: buildBarNetworkViewOptions(options),
        };
    }

    if (selectedView === "line" && networkDirection === "both") {
        return {
            viewOptions: buildDualNetworkLineViewOptions(options),
        };
    }

    if (networkDirection === "both") {
        return {
            viewOptions: buildDualNetworkCircleOrTextViewOptions({
                ...options,
                dualRenderPrimitive: selectedView === "text" ? "text" : "circle",
            }),
        };
    }

    const networkMetricKey = resolveNetworkMetricKey(networkDirection, options.target.interfaceId);
    const sourceWidgetData = options.metrics.getWidgetData(
        networkMetricKey,
        getNetworkDirectionLabel(networkDirection),
        "B/s",
    );
    const viewWidgetData = buildNetworkWidgetData({
        sourceWidgetData,
        direction: networkDirection,
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
    });
    const circleVariant = appearance.view.circleVariant;
    const shouldRenderGaugeFooter = selectedView === "circle" && circleVariant === "gauge";
    const renderedWidgetData = shouldRenderGaugeFooter
        ? { ...viewWidgetData, label: PROGRESS_CIRCLE_LABELS.network }
        : viewWidgetData;

    return {
        viewOptions: {
            event: options.event,
            resolvedSettings: appearance,
            metricKey: networkMetricKey,
            widgetData: renderedWidgetData,
            centerIconFragment: buildNetworkCenterIconFragment({
                circleVariant,
                direction: networkDirection,
                selectedNetworkInterface: options.selectedNetworkInterface,
            }),
            footerIconFragment: shouldRenderGaugeFooter
                ? renderNetworkDirectionIconFragment({
                    direction: networkDirection,
                    size: NETWORK_FOOTER_ICON_SIZE,
                })
                : undefined,
            statusIcon: getNetworkDirectionStatusIcon({
                direction: networkDirection,
            }),
            circleVariantOverride: circleVariant,
            appearanceOverride: {
                paint: {
                    metric: {
                        colorMode: appearance.paint.metric.colorMode,
                        solid: {
                            colors: {
                                usageColor: appearance.paint.metric.solid.colors.usageColor,
                            },
                        },
                    },
                },
            },
        },
        debugInfo: {
            direction: networkDirection,
            networkMetricKey,
            sourceWidgetData,
            viewWidgetData,
        },
    };
}

export function resolveNetworkMaximumBytesPerSecond(
    direction: NetworkMetricDirection,
    target: ResolvedNetworkMetricTarget,
): number {
    return convertMegabitsPerSecondToBytesPerSecond(resolveNetworkMaximumMegabitsPerSecond(direction, target));
}

export function resolveNetworkMaximumMegabitsPerSecond(
    direction: NetworkMetricDirection,
    target: ResolvedNetworkMetricTarget,
): number {
    const customMaximumMegabitsPerSecond = direction === "download"
        ? target.reading.display.maximumDownloadSpeedMegabitsPerSecond
        : target.reading.display.maximumUploadSpeedMegabitsPerSecond;

    if (
        customMaximumMegabitsPerSecond !== undefined
        && customMaximumMegabitsPerSecond > 0
    ) {
        return customMaximumMegabitsPerSecond;
    }

    return direction === "download"
        ? DEFAULT_DOWNLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND
        : DEFAULT_UPLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND;
}

function buildDualNetworkCircleOrTextViewOptions(
    options: BuildNetworkViewOptions & { dualRenderPrimitive: "circle" | "text" },
): MetricViewOptions {
    const uploadMetricKey = resolveNetworkMetricKey("upload", options.target.interfaceId);
    const downloadMetricKey = resolveNetworkMetricKey("download", options.target.interfaceId);
    const uploadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            uploadMetricKey,
            "UP",
            "B/s",
        ),
        direction: "upload",
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
    });
    const downloadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            downloadMetricKey,
            "DOWN",
            "B/s",
        ),
        direction: "download",
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
    });
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
    const uploadColorConfig = buildNetworkChannelColorConfig("upload", options.settings);
    const downloadColorConfig = buildNetworkChannelColorConfig("download", options.settings);
    const appearance = options.settings.widget.slot.appearance;
    const circleVariant = appearance.view.circleVariant;
    const solidMetricColorMode = resolveSolidMetricColorMode(appearance.paint.metric.colorMode);

    return {
        event: options.event,
        resolvedSettings: options.settings.widget.slot.appearance,
        metricKey: `${uploadMetricKey},${downloadMetricKey}`,
        dualRenderPrimitive: options.dualRenderPrimitive,
        widgetData: {
            positive: uploadWidgetData,
            negative: downloadWidgetData,
        },
        titleText: "NETWORK",
        centerIconFragment: renderNetworkInterfaceIconFragment({
            networkInterface: options.selectedNetworkInterface,
            size: NETWORK_CENTER_ICON_SIZE,
        }),
        statusIcon: getNetworkDirectionStatusIcon({
            direction: "upload",
        }),
        circleVariantOverride: circleVariant,
        positiveColor: uploadColor,
        negativeColor: downloadColor,
        positiveColorConfig: uploadColorConfig,
        negativeColorConfig: downloadColorConfig,
        positiveIconFragment: renderNetworkDirectionIconFragment({
            direction: "upload",
            color: uploadColor,
            size: NETWORK_TOP_ICON_SIZE,
        }),
        negativeIconFragment: renderNetworkDirectionIconFragment({
            direction: "download",
            color: downloadColor,
            size: NETWORK_TOP_ICON_SIZE,
        }),
        positiveStatusIcon: getNetworkDirectionStatusIcon({
            direction: "upload",
            color: uploadColor,
        }),
        negativeStatusIcon: getNetworkDirectionStatusIcon({
            direction: "download",
            color: downloadColor,
        }),
        appearanceOverride: {
            paint: {
                metric: {
                    colorMode: solidMetricColorMode,
                    solid: { colors: { usageColor: uploadColor } },
                },
            },
        },
    };
}

function buildDualNetworkLineViewOptions(options: BuildNetworkViewOptions): MetricViewOptions {
    const uploadMetricKey = resolveNetworkMetricKey("upload", options.target.interfaceId);
    const downloadMetricKey = resolveNetworkMetricKey("download", options.target.interfaceId);
    const uploadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            uploadMetricKey,
            "UP",
            "B/s",
        ),
        direction: "upload",
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
    });
    const downloadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            downloadMetricKey,
            "DOWN",
            "B/s",
        ),
        direction: "download",
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
    });
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
    const trafficDisplayMode = options.target.reading.trafficDisplayMode;
    const appearance = options.settings.widget.slot.appearance;
    const solidMetricColorMode = resolveSolidMetricColorMode(appearance.paint.metric.colorMode);

    return {
        event: options.event,
        resolvedSettings: options.settings.widget.slot.appearance,
        metricKey: `${uploadMetricKey},${downloadMetricKey}`,
        widgetData: {
            positive: uploadWidgetData,
            negative: downloadWidgetData,
        },
        titleText: "NETWORK",
        chartMode: trafficDisplayMode,
        centerIconFragment: renderNetworkInterfaceIconFragment({
            networkInterface: options.selectedNetworkInterface,
            size: NETWORK_CENTER_ICON_SIZE,
        }),
        statusIcon: getNetworkDirectionStatusIcon({
            direction: "upload",
        }),
        positiveColor: uploadColor,
        negativeColor: downloadColor,
        positiveIconFragment: renderNetworkDirectionIconFragment({
            direction: "upload",
            color: uploadColor,
            size: NETWORK_TOP_ICON_SIZE,
        }),
        negativeIconFragment: renderNetworkDirectionIconFragment({
            direction: "download",
            color: downloadColor,
            size: NETWORK_TOP_ICON_SIZE,
        }),
        appearanceOverride: {
            paint: {
                metric: {
                    colorMode: solidMetricColorMode,
                    solid: { colors: { usageColor: uploadColor } },
                },
            },
        },
    };
}

function buildBarNetworkViewOptions(options: BuildNetworkViewOptions): MetricViewOptions {
    const uploadMetricKey = resolveNetworkMetricKey("upload", options.target.interfaceId);
    const downloadMetricKey = resolveNetworkMetricKey("download", options.target.interfaceId);
    const uploadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            uploadMetricKey,
            "UP",
            "B/s",
        ),
        direction: "upload",
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
    });
    const downloadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            downloadMetricKey,
            "DOWN",
            "B/s",
        ),
        direction: "download",
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
    });
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);

    return {
        event: options.event,
        resolvedSettings: options.settings.widget.slot.appearance,
        metricKey: `${uploadMetricKey},${downloadMetricKey}`,
        widgetData: {
            current: uploadWidgetData.current,
            progress: uploadWidgetData.progress,
            history: uploadWidgetData.history,
            unit: uploadWidgetData.unit,
            label: "NET",
            barLabel: "Net Speed",
            barChannels: [
                {
                    label: "UP",
                    displayValue: uploadWidgetData.displayValue ?? uploadWidgetData.current.toFixed(0),
                    unit: uploadWidgetData.unit,
                    progress: uploadWidgetData.progress,
                    color: uploadColor,
                    iconFragment: renderNetworkDirectionIconFragment({
                        direction: "upload",
                        size: NETWORK_TOP_ICON_SIZE,
                    }),
                },
                {
                    label: "DOWN",
                    displayValue: downloadWidgetData.displayValue ?? downloadWidgetData.current.toFixed(0),
                    unit: downloadWidgetData.unit,
                    progress: downloadWidgetData.progress,
                    color: downloadColor,
                    iconFragment: renderNetworkDirectionIconFragment({
                        direction: "download",
                        size: NETWORK_TOP_ICON_SIZE,
                    }),
                },
            ],
            sampleTimestampMilliseconds: uploadWidgetData.sampleTimestampMilliseconds
                ?? downloadWidgetData.sampleTimestampMilliseconds,
        },
        centerIconFragment: buildNetworkCenterIconFragment({
            circleVariant: "minimal",
            direction: "upload",
            selectedNetworkInterface: options.selectedNetworkInterface,
        }),
        topIconFragment: renderNetworkInterfaceIconFragment({
            networkInterface: options.selectedNetworkInterface,
            size: NETWORK_CENTER_ICON_SIZE,
        }),
        statusIcon: getNetworkDirectionStatusIcon({
            direction: "upload",
        }),
        appearanceOverride: {
            paint: {
                metric: {
                    colorMode: resolveSolidMetricColorMode(
                        options.settings.widget.slot.appearance.paint.metric.colorMode,
                    ),
                    solid: {
                        colors: {
                            usageColor: uploadColor,
                        },
                    },
                },
            },
        },
    };
}

function buildNetworkWidgetData(options: {
    sourceWidgetData: WidgetData;
    direction: NetworkMetricDirection;
    target: ResolvedNetworkMetricTarget;
    currentTimestampMilliseconds: number;
}): WidgetData {
    const sourceWidgetData = isFreshNetworkWidgetData(
        options.sourceWidgetData,
        options.currentTimestampMilliseconds,
    )
        ? options.sourceWidgetData
        : {
            ...options.sourceWidgetData,
            current: 0,
            progress: 0,
            history: [],
            sampleTimestampMilliseconds: undefined,
        };

    return buildNetworkSpeedWidgetData({
        bytesPerSecond: sourceWidgetData.current,
        historyBytesPerSecond: sourceWidgetData.history,
        maximumBytesPerSecond: resolveNetworkMaximumBytesPerSecond(options.direction, options.target),
        label: getNetworkDirectionLabel(options.direction),
        unitBase: options.target.reading.display.unitBase,
        maximumDisplayDigits: NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS,
        sampleTimestampMilliseconds: sourceWidgetData.sampleTimestampMilliseconds,
    });
}

function isFreshNetworkWidgetData(
    widgetData: WidgetData,
    currentTimestampMilliseconds: number,
): boolean {
    if (widgetData.sampleTimestampMilliseconds == null) {
        return false;
    }

    return currentTimestampMilliseconds - widgetData.sampleTimestampMilliseconds <= NETWORK_SAMPLE_STALE_MS;
}

function getNetworkDirectionLabel(direction: NetworkMetricDirection): string {
    return direction === "download" ? PROGRESS_CIRCLE_LABELS.download : PROGRESS_CIRCLE_LABELS.upload;
}

function buildNetworkCenterIconFragment(options: {
    circleVariant: "full-ring" | "minimal" | "gauge";
    direction: NetworkMetricDirection;
    selectedNetworkInterface: NetworkInterfaceOption | null;
}): string {
    if (options.circleVariant === "minimal") {
        return renderNetworkInterfaceIconFragment({
            networkInterface: options.selectedNetworkInterface,
            size: NETWORK_CENTER_ICON_SIZE,
        });
    }

    return renderNetworkDirectionIconFragment({
        direction: options.direction,
        size: NETWORK_TOP_ICON_SIZE,
    });
}

function resolveNetworkWidgetChannelColor(
    direction: NetworkMetricDirection,
    settings: ResolvedWidgetSettings,
    widgetData: WidgetData,
): string {
    return resolveColorForThresholdValue(widgetData.progress * 100, buildNetworkChannelColorConfig(direction, settings));
}

function buildNetworkChannelColorConfig(
    direction: NetworkMetricDirection,
    settings: ResolvedWidgetSettings,
): ColorConfig {
    if (direction === "download") {
        return buildColorConfigFromAppearance(settings.widget.slot.appearance, "download");
    }

    return buildColorConfigFromAppearance(settings.widget.slot.appearance, "upload");
}

const DEFAULT_DOWNLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 100;
const DEFAULT_UPLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 20;
const NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS = 3;
const NETWORK_CENTER_ICON_SIZE = 58;
const NETWORK_TOP_ICON_SIZE = 30;
const NETWORK_FOOTER_ICON_SIZE = 21;
