import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStore } from "../runtime/metric-store";
import type { NetworkInterfaceOption } from "../runtime/network-interfaces";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    type NetworkDirection,
} from "../runtime/network-metric-keys";
import type { WidgetData } from "../rendering/widget-data";
import { resolveColorForThresholdValue, type ColorConfig } from "../rendering/color-resolver";
import type {
    ResolvedGlobalSettings,
    ResolvedWidgetSettings,
} from "../settings/widget-settings";
import { buildGlobalChannelColorConfig } from "../settings/global-appearance";
import {
    buildNetworkSpeedWidgetData,
    convertMegabitsPerSecondToBytesPerSecond,
} from "../metrics/network-speed-widget-data";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import {
    getNetworkDirectionStatusIcon,
    renderNetworkDirectionIconFragment,
    renderNetworkInterfaceIconFragment,
} from "../widgets/icons/catalog/network";
import {
    normalizeNetworkDisplayDirection,
    resolveSingleNetworkDirection,
} from "./net-speed-metric-subscriptions";
import type { MetricDisplayOptions } from "./single-metric-display-model";
import { buildColorConfigFromRamp } from "./channel-color-config";

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
    globalSettings: ResolvedGlobalSettings;
    metricStore: MetricStore;
    selectedNetworkInterface: NetworkInterfaceOption | null;
}

export function buildNetworkDisplayUpdate(options: BuildNetworkDisplayOptions): NetworkDisplayUpdate {
    const effectiveGraphicType = options.settings.appearance.graphicType;
    const displayDirection = normalizeNetworkDisplayDirection(options.settings.metric.networkDirection);

    if (effectiveGraphicType === "linear") {
        return {
            displayOptions: buildLinearNetworkDisplayOptions(options),
        };
    }

    if (effectiveGraphicType === "dashed-line" && displayDirection === "both") {
        return {
            displayOptions: buildDualNetworkSparklineDisplayOptions(options),
        };
    }

    if (displayDirection === "both") {
        return {
            displayOptions: buildDualNetworkCircularDisplayOptions({
                ...options,
                dualGraphicType: effectiveGraphicType === "text" ? "text" : "circular",
            }),
        };
    }

    const direction = resolveSingleNetworkDirection(displayDirection);
    const networkMetricKey = getNetworkMetricKey(direction, options.selectedNetworkInterface);
    const sourceWidgetData = options.metricStore.getWidgetData(
        networkMetricKey,
        getNetworkDirectionLabel(direction),
        "B/s",
    );
    const displayWidgetData = buildNetworkWidgetData({
        sourceWidgetData,
        direction,
        settings: options.settings,
    });
    const circleStyle = options.settings.appearance.circleStyle;
    const shouldRenderGaugeFooter = effectiveGraphicType === "circular" && circleStyle === "gauge";
    const renderedWidgetData = shouldRenderGaugeFooter
        ? { ...displayWidgetData, label: ARC_GAUGE_LABELS.network }
        : displayWidgetData;

    return {
        displayOptions: {
            event: options.event,
            resolvedSettings: options.settings.appearance,
            metricKey: networkMetricKey,
            widgetData: renderedWidgetData,
            centerIconFragment: buildNetworkCenterIconFragment({
                circleStyle,
                direction,
                selectedNetworkInterface: options.selectedNetworkInterface,
            }),
            footerIconFragment: shouldRenderGaugeFooter
                ? renderNetworkDirectionIconFragment({
                    direction,
                    color: NETWORK_DIRECTION_ICON_COLOR,
                    size: NETWORK_FOOTER_ICON_SIZE,
                })
                : undefined,
            statusIcon: getNetworkDirectionStatusIcon({
                direction,
                color: NETWORK_DIRECTION_ICON_COLOR,
            }),
            circleStyleOverride: circleStyle,
            visualSettingsOverride: {
                colorMode: options.settings.appearance.colorMode,
                usageColors: {
                    solidColor: options.settings.appearance.usageColors.solidColor,
                },
            },
        },
        debugInfo: {
            direction,
            networkMetricKey,
            sourceWidgetData,
            displayWidgetData,
        },
    };
}

export function resolveNetworkMaximumBytesPerSecond(
    direction: NetworkDirection,
    settings: ResolvedWidgetSettings,
): number {
    return convertMegabitsPerSecondToBytesPerSecond(resolveNetworkMaximumMegabitsPerSecond(direction, settings));
}

export function resolveNetworkMaximumMegabitsPerSecond(
    direction: NetworkDirection,
    settings: ResolvedWidgetSettings,
): number {
    const customMaximumMegabitsPerSecond = Number(
        direction === "download"
            ? settings.network.maximumDownloadSpeedMbps
            : settings.network.maximumUploadSpeedMbps,
    );

    if (
        Number.isFinite(customMaximumMegabitsPerSecond)
        && customMaximumMegabitsPerSecond > 0
    ) {
        return customMaximumMegabitsPerSecond;
    }

    return direction === "download"
        ? DEFAULT_DOWNLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND
        : DEFAULT_UPLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND;
}

function buildDualNetworkCircularDisplayOptions(
    options: BuildNetworkDisplayOptions & { dualGraphicType: "circular" | "text" },
): MetricDisplayOptions {
    const uploadMetricKey = getNetworkMetricKey("upload", options.selectedNetworkInterface);
    const downloadMetricKey = getNetworkMetricKey("download", options.selectedNetworkInterface);
    const uploadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metricStore.getWidgetData(uploadMetricKey, "UP", "B/s"),
        direction: "upload",
        settings: options.settings,
    });
    const downloadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metricStore.getWidgetData(downloadMetricKey, "DOWN", "B/s"),
        direction: "download",
        settings: options.settings,
    });
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, options.globalSettings, uploadWidgetData);
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, options.globalSettings, downloadWidgetData);
    const uploadColorConfig = buildNetworkChannelColorConfig("upload", options.settings, options.globalSettings);
    const downloadColorConfig = buildNetworkChannelColorConfig("download", options.settings, options.globalSettings);
    const circleStyle = options.settings.appearance.circleStyle;

    return {
        event: options.event,
        resolvedSettings: options.settings.appearance,
        metricKey: `${downloadMetricKey},${uploadMetricKey}`,
        dualGraphicType: options.dualGraphicType,
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
            color: NETWORK_DIRECTION_ICON_COLOR,
        }),
        circleStyleOverride: circleStyle,
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
        visualSettingsOverride: {
            colorMode: "solid",
            usageColors: { solidColor: uploadColor },
        },
    };
}

function buildDualNetworkSparklineDisplayOptions(options: BuildNetworkDisplayOptions): MetricDisplayOptions {
    const uploadMetricKey = getNetworkMetricKey("upload", options.selectedNetworkInterface);
    const downloadMetricKey = getNetworkMetricKey("download", options.selectedNetworkInterface);
    const uploadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metricStore.getWidgetData(uploadMetricKey, "UP", "B/s"),
        direction: "upload",
        settings: options.settings,
    });
    const downloadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metricStore.getWidgetData(downloadMetricKey, "DOWN", "B/s"),
        direction: "download",
        settings: options.settings,
    });
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, options.globalSettings, uploadWidgetData);
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, options.globalSettings, downloadWidgetData);
    const trafficDisplayMode = options.settings.local.networkTrafficDisplayMode;
    const positiveDirection = trafficDisplayMode === "mirrored" ? "upload" : "download";
    const negativeDirection = trafficDisplayMode === "mirrored" ? "download" : "upload";
    const positiveWidgetData = trafficDisplayMode === "mirrored" ? uploadWidgetData : downloadWidgetData;
    const negativeWidgetData = trafficDisplayMode === "mirrored" ? downloadWidgetData : uploadWidgetData;
    const positiveColor = positiveDirection === "download" ? downloadColor : uploadColor;
    const negativeColor = negativeDirection === "download" ? downloadColor : uploadColor;

    return {
        event: options.event,
        resolvedSettings: options.settings.appearance,
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
            color: NETWORK_DIRECTION_ICON_COLOR,
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
        visualSettingsOverride: {
            colorMode: "solid",
            usageColors: { solidColor: downloadColor },
        },
    };
}

function buildLinearNetworkDisplayOptions(options: BuildNetworkDisplayOptions): MetricDisplayOptions {
    const uploadMetricKey = getNetworkMetricKey("upload", options.selectedNetworkInterface);
    const downloadMetricKey = getNetworkMetricKey("download", options.selectedNetworkInterface);
    const uploadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metricStore.getWidgetData(uploadMetricKey, "UP", "B/s"),
        direction: "upload",
        settings: options.settings,
    });
    const downloadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metricStore.getWidgetData(downloadMetricKey, "DOWN", "B/s"),
        direction: "download",
        settings: options.settings,
    });

    return {
        event: options.event,
        resolvedSettings: options.settings.appearance,
        metricKey: downloadMetricKey,
        widgetData: {
            current: downloadWidgetData.current,
            progress: downloadWidgetData.progress,
            history: downloadWidgetData.history,
            unit: downloadWidgetData.unit,
            label: "NET",
            linearLabel: "Net Speed",
            linearChannels: [
                {
                    label: "DOWN",
                    displayValue: downloadWidgetData.displayValue ?? downloadWidgetData.current.toFixed(0),
                    unit: downloadWidgetData.unit,
                    progress: downloadWidgetData.progress,
                    color: resolveNetworkWidgetChannelColor("download", options.settings, options.globalSettings, downloadWidgetData),
                    iconFragment: renderNetworkDirectionIconFragment({
                        direction: "download",
                        color: NETWORK_DIRECTION_ICON_COLOR,
                        size: NETWORK_TOP_ICON_SIZE,
                    }),
                },
                {
                    label: "UP",
                    displayValue: uploadWidgetData.displayValue ?? uploadWidgetData.current.toFixed(0),
                    unit: uploadWidgetData.unit,
                    progress: uploadWidgetData.progress,
                    color: resolveNetworkWidgetChannelColor("upload", options.settings, options.globalSettings, uploadWidgetData),
                    iconFragment: renderNetworkDirectionIconFragment({
                        direction: "upload",
                        color: NETWORK_DIRECTION_ICON_COLOR,
                        size: NETWORK_TOP_ICON_SIZE,
                    }),
                },
            ],
            sampleTimestampMilliseconds: downloadWidgetData.sampleTimestampMilliseconds
                ?? uploadWidgetData.sampleTimestampMilliseconds,
        },
        centerIconFragment: buildNetworkCenterIconFragment({
            circleStyle: "compact",
            direction: "download",
            selectedNetworkInterface: options.selectedNetworkInterface,
        }),
        linearIconFragment: renderNetworkInterfaceIconFragment({
            networkInterface: options.selectedNetworkInterface,
            size: NETWORK_CENTER_ICON_SIZE,
        }),
        statusIcon: getNetworkDirectionStatusIcon({
            direction: "download",
            color: NETWORK_DIRECTION_ICON_COLOR,
        }),
        visualSettingsOverride: {
            colorMode: "solid",
            usageColors: {
                solidColor: resolveNetworkWidgetChannelColor("download", options.settings, options.globalSettings, downloadWidgetData),
            },
        },
    };
}

function buildNetworkWidgetData(options: {
    sourceWidgetData: WidgetData;
    direction: NetworkDirection;
    settings: ResolvedWidgetSettings;
}): WidgetData {
    return buildNetworkSpeedWidgetData({
        bytesPerSecond: options.sourceWidgetData.current,
        historyBytesPerSecond: options.sourceWidgetData.history,
        maximumBytesPerSecond: resolveNetworkMaximumBytesPerSecond(options.direction, options.settings),
        label: getNetworkDirectionLabel(options.direction),
        unitBase: options.settings.network.networkUnitBase,
        maximumDisplayDigits: NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS,
        sampleTimestampMilliseconds: options.sourceWidgetData.sampleTimestampMilliseconds,
    });
}

function getNetworkMetricKey(
    direction: NetworkDirection,
    selectedNetworkInterface: NetworkInterfaceOption | null,
): string {
    return selectedNetworkInterface
        ? getNetworkInterfaceMetricKey(direction, selectedNetworkInterface.id)
        : getNetworkAggregateMetricKey(direction);
}

function getNetworkDirectionLabel(direction: NetworkDirection): string {
    return direction === "download" ? ARC_GAUGE_LABELS.download : ARC_GAUGE_LABELS.upload;
}

function buildNetworkCenterIconFragment(options: {
    circleStyle: "value" | "compact" | "gauge";
    direction: NetworkDirection;
    selectedNetworkInterface: NetworkInterfaceOption | null;
}): string {
    if (options.circleStyle === "compact") {
        return renderNetworkInterfaceIconFragment({
            networkInterface: options.selectedNetworkInterface,
            size: NETWORK_CENTER_ICON_SIZE,
        });
    }

    return renderNetworkDirectionIconFragment({
        direction: options.direction,
        color: NETWORK_DIRECTION_ICON_COLOR,
        size: NETWORK_TOP_ICON_SIZE,
    });
}

function resolveNetworkWidgetChannelColor(
    direction: NetworkDirection,
    settings: ResolvedWidgetSettings,
    globalSettings: ResolvedGlobalSettings,
    widgetData: WidgetData,
): string {
    return resolveColorForThresholdValue(widgetData.progress * 100, buildNetworkChannelColorConfig(direction, settings, globalSettings));
}

function buildNetworkChannelColorConfig(
    direction: NetworkDirection,
    settings: ResolvedWidgetSettings,
    globalSettings: ResolvedGlobalSettings,
): ColorConfig {
    if (globalSettings.overrideWidgetAppearance) {
        return buildGlobalChannelColorConfig(direction === "download" ? "primary" : "secondary", globalSettings);
    }

    if (direction === "download") {
        return buildColorConfigFromRamp({
            colorMode: settings.appearance.colorMode,
            colors: settings.appearance.downloadColors,
            lowThreshold: settings.appearance.lowThreshold,
            highThreshold: settings.appearance.highThreshold,
        });
    }

    return buildColorConfigFromRamp({
        colorMode: settings.appearance.colorMode,
        colors: settings.appearance.uploadColors,
        lowThreshold: settings.appearance.lowThreshold,
        highThreshold: settings.appearance.highThreshold,
    });
}

const NETWORK_DIRECTION_ICON_COLOR = "rgba(255,255,255,0.88)";
const DEFAULT_DOWNLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 100;
const DEFAULT_UPLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 20;
const NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS = 3;
const NETWORK_CENTER_ICON_SIZE = 58;
const NETWORK_TOP_ICON_SIZE = 30;
const NETWORK_FOOTER_ICON_SIZE = 21;
