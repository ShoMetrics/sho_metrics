import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../../runtime/metric-store";
import type { NetworkInterfaceOption } from "../../runtime/network-interfaces";
import {
    resolveNetworkMetricKey,
    type NetworkDirection,
} from "../../runtime/network-metric-keys";
import type { WidgetData } from "../../rendering/widget-data";
import { resolveColorForThresholdValue, type ColorConfig } from "../../rendering/color-resolver";
import type {
    ResolvedNetworkMetricTarget,
    ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import {
    buildNetworkSpeedWidgetData,
    convertMegabitsPerSecondToBytesPerSecond,
} from "../../metrics/network-speed-widget-data";
import { ARC_GAUGE_LABELS } from "../../widgets/primitives/arc-gauge-label";
import {
    getNetworkDirectionStatusIcon,
    renderNetworkDirectionIconFragment,
    renderNetworkInterfaceIconFragment,
} from "../../widgets/icons/catalog/network";
import type { MetricDisplayOptions } from "../../metric-view-runner/runner";
import { buildColorConfigFromAppearance, resolveSolidMetricColorMode } from "../../settings/render-paint-resolver";

export interface NetworkDisplayUpdate {
    displayOptions: MetricDisplayOptions;
    debugInfo?: NetworkDisplayDebugInfo;
}

export interface NetworkDisplayDebugInfo {
    direction: NetworkDirection;
    networkMetricKey: string;
    sourceWidgetData: WidgetData;
    displayWidgetData: WidgetData;
}

interface BuildNetworkDisplayOptions {
    event: WillAppearEvent;
    settings: ResolvedWidgetSettings;
    target: ResolvedNetworkMetricTarget;
    metrics: MetricStoreReader;
    selectedNetworkInterface: NetworkInterfaceOption | null;
}

export function buildNetworkDisplayUpdate(options: BuildNetworkDisplayOptions): NetworkDisplayUpdate {
    const appearance = options.settings.widget.slot.appearance;
    const networkReading = options.target.reading;
    const selectedView = appearance.view.selectedView;
    const displayDirection = networkReading.direction;

    if (selectedView === "bar") {
        return {
            displayOptions: buildBarNetworkDisplayOptions(options),
        };
    }

    if (selectedView === "line" && displayDirection === "both") {
        return {
            displayOptions: buildDualNetworkLineDisplayOptions(options),
        };
    }

    if (displayDirection === "both") {
        return {
            displayOptions: buildDualNetworkCircleOrTextDisplayOptions({
                ...options,
                dualRenderPrimitive: selectedView === "text" ? "text" : "circle",
            }),
        };
    }

    const networkMetricKey = resolveNetworkMetricKey(displayDirection, options.target.interfaceId);
    const sourceWidgetData = options.metrics.getWidgetData(
        networkMetricKey,
        getNetworkDirectionLabel(displayDirection),
        "B/s",
    );
    const displayWidgetData = buildNetworkWidgetData({
        sourceWidgetData,
        direction: displayDirection,
        target: options.target,
    });
    const circleVariant = appearance.view.circleVariant;
    const shouldRenderGaugeFooter = selectedView === "circle" && circleVariant === "gauge";
    const renderedWidgetData = shouldRenderGaugeFooter
        ? { ...displayWidgetData, label: ARC_GAUGE_LABELS.network }
        : displayWidgetData;

    return {
        displayOptions: {
            event: options.event,
            resolvedSettings: appearance,
            metricKey: networkMetricKey,
            widgetData: renderedWidgetData,
            centerIconFragment: buildNetworkCenterIconFragment({
                circleVariant,
                direction: displayDirection,
                selectedNetworkInterface: options.selectedNetworkInterface,
            }),
            footerIconFragment: shouldRenderGaugeFooter
                ? renderNetworkDirectionIconFragment({
                    direction: displayDirection,
                    size: NETWORK_FOOTER_ICON_SIZE,
                })
                : undefined,
            statusIcon: getNetworkDirectionStatusIcon({
                direction: displayDirection,
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
            direction: displayDirection,
            networkMetricKey,
            sourceWidgetData,
            displayWidgetData,
        },
    };
}

export function resolveNetworkMaximumBytesPerSecond(
    direction: NetworkDirection,
    target: ResolvedNetworkMetricTarget,
): number {
    return convertMegabitsPerSecondToBytesPerSecond(resolveNetworkMaximumMegabitsPerSecond(direction, target));
}

export function resolveNetworkMaximumMegabitsPerSecond(
    direction: NetworkDirection,
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

function buildDualNetworkCircleOrTextDisplayOptions(
    options: BuildNetworkDisplayOptions & { dualRenderPrimitive: "circle" | "text" },
): MetricDisplayOptions {
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
    });
    const downloadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            downloadMetricKey,
            "DOWN",
            "B/s",
        ),
        direction: "download",
        target: options.target,
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
        metricKey: `${downloadMetricKey},${uploadMetricKey}`,
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
            direction: "download",
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

function buildDualNetworkLineDisplayOptions(options: BuildNetworkDisplayOptions): MetricDisplayOptions {
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
    });
    const downloadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            downloadMetricKey,
            "DOWN",
            "B/s",
        ),
        direction: "download",
        target: options.target,
    });
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
    const trafficDisplayMode = options.target.reading.trafficDisplayMode;
    const positiveDirection = trafficDisplayMode === "mirrored" ? "upload" : "download";
    const negativeDirection = trafficDisplayMode === "mirrored" ? "download" : "upload";
    const positiveWidgetData = trafficDisplayMode === "mirrored" ? uploadWidgetData : downloadWidgetData;
    const negativeWidgetData = trafficDisplayMode === "mirrored" ? downloadWidgetData : uploadWidgetData;
    const positiveColor = positiveDirection === "download" ? downloadColor : uploadColor;
    const negativeColor = negativeDirection === "download" ? downloadColor : uploadColor;
    const appearance = options.settings.widget.slot.appearance;
    const solidMetricColorMode = resolveSolidMetricColorMode(appearance.paint.metric.colorMode);

    return {
        event: options.event,
        resolvedSettings: options.settings.widget.slot.appearance,
        metricKey: `${downloadMetricKey},${uploadMetricKey}`,
        widgetData: {
            positive: positiveWidgetData,
            negative: negativeWidgetData,
        },
        titleText: "NETWORK",
        chartMode: trafficDisplayMode,
        centerIconFragment: renderNetworkInterfaceIconFragment({
            networkInterface: options.selectedNetworkInterface,
            size: NETWORK_CENTER_ICON_SIZE,
        }),
        statusIcon: getNetworkDirectionStatusIcon({
            direction: "download",
        }),
        positiveColor,
        negativeColor,
        positiveIconFragment: renderNetworkDirectionIconFragment({
            direction: positiveDirection,
            color: positiveColor,
            size: NETWORK_TOP_ICON_SIZE,
        }),
        negativeIconFragment: renderNetworkDirectionIconFragment({
            direction: negativeDirection,
            color: negativeColor,
            size: NETWORK_TOP_ICON_SIZE,
        }),
        appearanceOverride: {
            paint: {
                metric: {
                    colorMode: solidMetricColorMode,
                    solid: { colors: { usageColor: downloadColor } },
                },
            },
        },
    };
}

function buildBarNetworkDisplayOptions(options: BuildNetworkDisplayOptions): MetricDisplayOptions {
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
    });
    const downloadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            downloadMetricKey,
            "DOWN",
            "B/s",
        ),
        direction: "download",
        target: options.target,
    });
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);

    return {
        event: options.event,
        resolvedSettings: options.settings.widget.slot.appearance,
        metricKey: downloadMetricKey,
        widgetData: {
            current: downloadWidgetData.current,
            progress: downloadWidgetData.progress,
            history: downloadWidgetData.history,
            unit: downloadWidgetData.unit,
            label: "NET",
            barLabel: "Net Speed",
            barChannels: [
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
            ],
            sampleTimestampMilliseconds: downloadWidgetData.sampleTimestampMilliseconds
                ?? uploadWidgetData.sampleTimestampMilliseconds,
        },
        centerIconFragment: buildNetworkCenterIconFragment({
            circleVariant: "minimal",
            direction: "download",
            selectedNetworkInterface: options.selectedNetworkInterface,
        }),
        topIconFragment: renderNetworkInterfaceIconFragment({
            networkInterface: options.selectedNetworkInterface,
            size: NETWORK_CENTER_ICON_SIZE,
        }),
        statusIcon: getNetworkDirectionStatusIcon({
            direction: "download",
        }),
        appearanceOverride: {
            paint: {
                metric: {
                    colorMode: resolveSolidMetricColorMode(
                        options.settings.widget.slot.appearance.paint.metric.colorMode,
                    ),
                    solid: {
                        colors: {
                            usageColor: downloadColor,
                        },
                    },
                },
            },
        },
    };
}

function buildNetworkWidgetData(options: {
    sourceWidgetData: WidgetData;
    direction: NetworkDirection;
    target: ResolvedNetworkMetricTarget;
}): WidgetData {
    return buildNetworkSpeedWidgetData({
        bytesPerSecond: options.sourceWidgetData.current,
        historyBytesPerSecond: options.sourceWidgetData.history,
        maximumBytesPerSecond: resolveNetworkMaximumBytesPerSecond(options.direction, options.target),
        label: getNetworkDirectionLabel(options.direction),
        unitBase: options.target.reading.display.unitBase,
        maximumDisplayDigits: NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS,
        sampleTimestampMilliseconds: options.sourceWidgetData.sampleTimestampMilliseconds,
    });
}

function getNetworkDirectionLabel(direction: NetworkDirection): string {
    return direction === "download" ? ARC_GAUGE_LABELS.download : ARC_GAUGE_LABELS.upload;
}

function buildNetworkCenterIconFragment(options: {
    circleVariant: "full-ring" | "minimal" | "gauge";
    direction: NetworkDirection;
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
    direction: NetworkDirection,
    settings: ResolvedWidgetSettings,
    widgetData: WidgetData,
): string {
    return resolveColorForThresholdValue(widgetData.progress * 100, buildNetworkChannelColorConfig(direction, settings));
}

function buildNetworkChannelColorConfig(
    direction: NetworkDirection,
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
