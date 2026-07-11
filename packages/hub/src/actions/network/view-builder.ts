import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../../runtime/metric-store";
import type { NetworkInterfaceOption } from "../../runtime/network-interfaces";
import {
    getNetworkPingLatencyMetricKey,
    resolveNetworkMetricKey,
    type NetworkMetricDirection,
} from "../../runtime/network-metric-keys";
import type { WidgetData } from "../../view-rendering/widget-data";
import { resolveThresholdColorForProgress, type ColorConfig } from "../../view-rendering/color/color-resolver";
import type {
    ResolvedAppearanceSettings,
    ResolvedNetworkMetricTarget,
    ResolvedNetworkReading,
    ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import { requireResolvedSingleMetricWidget } from "../../settings/resolved-settings";
import { buildNetworkPingWidgetData } from "../../metrics/network-ping-widget-data";
import {
    buildNetworkSpeedWidgetData,
    convertMegabitsPerSecondToBytesPerSecond,
} from "../../metrics/network-speed-widget-data";
import { PROGRESS_CIRCLE_LABELS } from "../../widgets/primitives/progress-circle-label";
import {
    getNetworkDirectionStatusIcon,
    getNetworkPingStatusIcon,
    renderNetworkDirectionIconFragment,
    renderNetworkInterfaceIconFragment,
    renderNetworkPingIconFragment,
} from "../../widgets/icons/catalog/network";
import type { DualMetricViewOptions, SingleMetricViewOptions } from "../../view-updates/runner";
import {
    buildColorConfigFromAppearance,
    resolveActiveMetricAccentColorMode,
    resolveSolidMetricColorMode,
} from "../../settings/render-paint-resolver";
import { buildMetricAccentPaintAppearanceOverride } from "../../settings/appearance-overrides";

export interface NetworkViewUpdate {
    viewOptions: NetworkMetricViewOptions;
    debugInfo?: NetworkViewDebugInfo;
}

export interface NetworkTrafficViewDebugInfo {
    readonly kind: "traffic";
    readonly direction: NetworkMetricDirection;
    readonly networkMetricKey: string;
    readonly sourceWidgetData: WidgetData;
    readonly viewWidgetData: WidgetData;
}

export interface NetworkPingViewDebugInfo {
    readonly kind: "ping";
    readonly targetHost: string;
    readonly networkMetricKey: string;
    readonly sourceWidgetData: WidgetData;
    readonly viewWidgetData: WidgetData;
}

export type NetworkViewDebugInfo = NetworkTrafficViewDebugInfo | NetworkPingViewDebugInfo;

interface BuildNetworkViewOptions {
    event: WillAppearEvent;
    settings: ResolvedWidgetSettings;
    target: ResolvedNetworkMetricTarget;
    metrics: MetricStoreReader;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    currentTimestampMilliseconds: number;
}

type ResolvedNetworkTrafficReading = Extract<ResolvedNetworkReading, { readonly kind: "traffic" }>;
type ResolvedNetworkPingReading = Extract<ResolvedNetworkReading, { readonly kind: "ping" }>;

export type ResolvedNetworkTrafficMetricTarget = ResolvedNetworkMetricTarget & {
    readonly reading: ResolvedNetworkTrafficReading;
};

type ResolvedNetworkPingMetricTarget = ResolvedNetworkMetricTarget & {
    readonly reading: ResolvedNetworkPingReading;
};

type NetworkMetricViewOptions = SingleMetricViewOptions | DualMetricViewOptions;

type BuildTrafficNetworkViewOptions = Omit<BuildNetworkViewOptions, "target"> & {
    readonly target: ResolvedNetworkTrafficMetricTarget;
};

type BuildPingNetworkViewOptions = Omit<BuildNetworkViewOptions, "target"> & {
    readonly target: ResolvedNetworkPingMetricTarget;
};

export function buildNetworkViewUpdate(options: BuildNetworkViewOptions): NetworkViewUpdate {
    const networkReading = options.target.reading;

    if (networkReading.kind === "ping") {
        return buildPingNetworkViewUpdate({
            ...options,
            target: {
                ...options.target,
                reading: networkReading,
            },
        });
    }

    return buildTrafficNetworkViewUpdate({
        ...options,
        target: {
            ...options.target,
            reading: networkReading,
        },
    });
}

function buildTrafficNetworkViewUpdate(options: BuildTrafficNetworkViewOptions): NetworkViewUpdate {
    const appearance = readSingleMetricAppearance(options.settings);
    const networkReading = options.target.reading;
    const selectedView = appearance.view.selectedView;
    const networkDirection = networkReading.direction;

    switch (selectedView) {
        case "bar":
            return {
                viewOptions: networkDirection === "both"
                    ? buildDualBarNetworkViewOptions(options)
                    : buildSingleBarNetworkViewOptions({
                        ...options,
                        networkDirection,
                    }),
            };
        case "line":
            if (networkDirection === "both") {
                return {
                    viewOptions: buildDualNetworkLineViewOptions(options),
                };
            }
            break;
        case "circle":
        case "text":
            if (networkDirection === "both") {
                return {
                    viewOptions: buildDualNetworkCircleOrTextViewOptions({
                        ...options,
                        dualRenderPrimitive: selectedView === "text" ? "text" : "circle",
                    }),
                };
            }
            break;
        default:
            return assertNever(selectedView);
    }

    const networkMetricKey = resolveNetworkMetricKey(networkDirection, options.target.reading.interfaceId);
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
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const circleVariant = appearance.view.circleVariant;
    const shouldRenderGaugeFooter = selectedView === "circle" && circleVariant === "gauge";
    const renderedWidgetData = shouldRenderGaugeFooter
        ? { ...viewWidgetData, label: PROGRESS_CIRCLE_LABELS.network }
        : viewWidgetData;

    return {
        viewOptions: {
            event: options.event,
            metricRenderKind: "singleMetric",
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
            appearanceOverride: buildMetricAccentPaintAppearanceOverride(
                appearance.theme.selectedTheme,
                {
                    colorMode: resolveActiveMetricAccentColorMode(appearance),
                    solid: {
                        colors: {
                            usageColor: buildColorConfigFromAppearance(appearance, "usage").solidColor,
                        },
                    },
                },
            ),
        },
        debugInfo: {
            kind: "traffic",
            direction: networkDirection,
            networkMetricKey,
            sourceWidgetData,
            viewWidgetData,
        },
    };
}

function buildPingNetworkViewUpdate(options: BuildPingNetworkViewOptions): NetworkViewUpdate {
    const appearance = readSingleMetricAppearance(options.settings);
    const targetHost = options.target.reading.targetHost;
    const networkMetricKey = getNetworkPingLatencyMetricKey(targetHost);
    const sourceWidgetData = options.metrics.getWidgetData(
        networkMetricKey,
        "PING",
        "ms",
        options.target.reading.maximumLatencyMilliseconds,
    );
    const viewWidgetData = buildNetworkPingWidgetData({
        latencyMilliseconds: sourceWidgetData.current,
        historyLatencyMilliseconds: sourceWidgetData.history,
        maximumLatencyMilliseconds: options.target.reading.maximumLatencyMilliseconds,
        sampleTimestampMilliseconds: sourceWidgetData.sampleTimestampMilliseconds,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const renderedWidgetData = appearance.view.selectedView === "bar"
        ? { ...viewWidgetData, secondaryDisplayValue: targetHost }
        : viewWidgetData;

    return {
        viewOptions: {
            event: options.event,
            metricRenderKind: "singleMetric",
            resolvedSettings: appearance,
            metricKey: networkMetricKey,
            widgetData: renderedWidgetData,
            centerIconFragment: renderNetworkPingIconFragment({
                size: NETWORK_CENTER_ICON_SIZE,
            }),
            statusIcon: getNetworkPingStatusIcon(),
        },
        debugInfo: {
            kind: "ping",
            targetHost,
            networkMetricKey,
            sourceWidgetData,
            viewWidgetData,
        },
    };
}

export function resolveNetworkMaximumBytesPerSecond(
    direction: NetworkMetricDirection,
    target: ResolvedNetworkTrafficMetricTarget,
): number {
    return convertMegabitsPerSecondToBytesPerSecond(resolveNetworkMaximumMegabitsPerSecond(direction, target));
}

export function resolveNetworkMaximumMegabitsPerSecond(
    direction: NetworkMetricDirection,
    target: ResolvedNetworkTrafficMetricTarget,
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
    options: BuildTrafficNetworkViewOptions & { dualRenderPrimitive: "circle" | "text" },
): NetworkMetricViewOptions {
    const uploadMetricKey = resolveNetworkMetricKey("upload", options.target.reading.interfaceId);
    const downloadMetricKey = resolveNetworkMetricKey("download", options.target.reading.interfaceId);
    const uploadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            uploadMetricKey,
            "UP",
            "B/s",
        ),
        direction: "upload",
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
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
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
    const uploadColorConfig = buildNetworkChannelColorConfig("upload", options.settings);
    const downloadColorConfig = buildNetworkChannelColorConfig("download", options.settings);
    const appearance = readSingleMetricAppearance(options.settings);
    const circleVariant = appearance.view.circleVariant;
    const solidMetricColorMode = resolveSolidMetricColorMode(resolveActiveMetricAccentColorMode(appearance));

    return {
        event: options.event,
        metricRenderKind: "dualMetric",
        resolvedSettings: appearance,
        metricKey: `${uploadMetricKey},${downloadMetricKey}`,
        dualRenderPrimitive: options.dualRenderPrimitive,
        widgetData: {
            positive: uploadWidgetData,
            negative: downloadWidgetData,
        },
        titleText: options.dualRenderPrimitive === "text" ? "NET" : "NETWORK",
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
        positiveLabelText: "UP",
        negativeLabelText: "DN",
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
        appearanceOverride: buildMetricAccentPaintAppearanceOverride(
            appearance.theme.selectedTheme,
            {
                colorMode: solidMetricColorMode,
                solid: { colors: { usageColor: uploadColor } },
            },
        ),
    };
}

function buildDualNetworkLineViewOptions(options: BuildTrafficNetworkViewOptions): NetworkMetricViewOptions {
    const uploadMetricKey = resolveNetworkMetricKey("upload", options.target.reading.interfaceId);
    const downloadMetricKey = resolveNetworkMetricKey("download", options.target.reading.interfaceId);
    const uploadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            uploadMetricKey,
            "UP",
            "B/s",
        ),
        direction: "upload",
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
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
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
    const trafficDisplayMode = options.target.reading.trafficDisplayMode;
    const appearance = readSingleMetricAppearance(options.settings);
    const solidMetricColorMode = resolveSolidMetricColorMode(resolveActiveMetricAccentColorMode(appearance));

    return {
        event: options.event,
        metricRenderKind: "dualMetric",
        resolvedSettings: appearance,
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
        appearanceOverride: buildMetricAccentPaintAppearanceOverride(
            appearance.theme.selectedTheme,
            {
                colorMode: solidMetricColorMode,
                solid: { colors: { usageColor: uploadColor } },
            },
        ),
    };
}

function buildDualBarNetworkViewOptions(options: BuildTrafficNetworkViewOptions): NetworkMetricViewOptions {
    const uploadMetricKey = resolveNetworkMetricKey("upload", options.target.reading.interfaceId);
    const downloadMetricKey = resolveNetworkMetricKey("download", options.target.reading.interfaceId);
    const uploadWidgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            uploadMetricKey,
            "UP",
            "B/s",
        ),
        direction: "upload",
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
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
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
    const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);
    const appearance = readSingleMetricAppearance(options.settings);

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: appearance,
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
                    sampleTimestampMilliseconds: uploadWidgetData.sampleTimestampMilliseconds,
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
                    sampleTimestampMilliseconds: downloadWidgetData.sampleTimestampMilliseconds,
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
        appearanceOverride: buildMetricAccentPaintAppearanceOverride(
            appearance.theme.selectedTheme,
            {
                colorMode: resolveSolidMetricColorMode(resolveActiveMetricAccentColorMode(appearance)),
                solid: {
                    colors: {
                        usageColor: uploadColor,
                    },
                },
            },
        ),
    };
}

function buildSingleBarNetworkViewOptions(
    options: BuildTrafficNetworkViewOptions & {
        networkDirection: Exclude<NetworkMetricDirection, "both">;
    },
): NetworkMetricViewOptions {
    const networkDirection = options.networkDirection;
    const networkMetricKey = resolveNetworkMetricKey(networkDirection, options.target.reading.interfaceId);
    const widgetData = buildNetworkWidgetData({
        sourceWidgetData: options.metrics.getWidgetData(
            networkMetricKey,
            getNetworkDirectionLabel(networkDirection),
            "B/s",
        ),
        direction: networkDirection,
        target: options.target,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const color = resolveNetworkWidgetChannelColor(networkDirection, options.settings, widgetData);
    const appearance = readSingleMetricAppearance(options.settings);

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: appearance,
        metricKey: networkMetricKey,
        widgetData: {
            ...widgetData,
            barLabel: "Net Speed",
            barValueIconFragment: renderNetworkDirectionIconFragment({
                direction: networkDirection,
                size: NETWORK_TOP_ICON_SIZE,
            }),
            barValueIconColor: color,
        },
        centerIconFragment: buildNetworkCenterIconFragment({
            circleVariant: "minimal",
            direction: networkDirection,
            selectedNetworkInterface: options.selectedNetworkInterface,
        }),
        topIconFragment: renderNetworkInterfaceIconFragment({
            networkInterface: options.selectedNetworkInterface,
            size: NETWORK_CENTER_ICON_SIZE,
        }),
        statusIcon: getNetworkDirectionStatusIcon({
            direction: networkDirection,
        }),
        appearanceOverride: buildMetricAccentPaintAppearanceOverride(
            appearance.theme.selectedTheme,
            {
                colorMode: resolveSolidMetricColorMode(resolveActiveMetricAccentColorMode(appearance)),
                solid: {
                    colors: {
                        usageColor: color,
                    },
                },
            },
        ),
    };
}

function buildNetworkWidgetData(options: {
    sourceWidgetData: WidgetData;
    direction: NetworkMetricDirection;
    target: ResolvedNetworkTrafficMetricTarget;
    currentTimestampMilliseconds: number;
    pollingFrequencySeconds: number;
}): WidgetData {
    return buildNetworkSpeedWidgetData({
        bytesPerSecond: options.sourceWidgetData.current,
        historyBytesPerSecond: options.sourceWidgetData.history,
        maximumBytesPerSecond: resolveNetworkMaximumBytesPerSecond(options.direction, options.target),
        label: getNetworkDirectionLabel(options.direction),
        unitBase: options.target.reading.display.unitBase,
        maximumDisplayDigits: NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS,
        sampleTimestampMilliseconds: options.sourceWidgetData.sampleTimestampMilliseconds,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.pollingFrequencySeconds,
    });
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
    return resolveThresholdColorForProgress(widgetData.progress, buildNetworkChannelColorConfig(direction, settings));
}

function buildNetworkChannelColorConfig(
    direction: NetworkMetricDirection,
    settings: ResolvedWidgetSettings,
): ColorConfig {
    if (direction === "download") {
        return buildColorConfigFromAppearance(readSingleMetricAppearance(settings), "download");
    }

    return buildColorConfigFromAppearance(readSingleMetricAppearance(settings), "upload");
}

function assertNever(value: never): never {
    throw new Error(`Unexpected network traffic view: ${String(value)}`);
}

function readSingleMetricAppearance(settings: ResolvedWidgetSettings): ResolvedAppearanceSettings {
    return requireResolvedSingleMetricWidget(settings).slot.appearance;
}

const DEFAULT_DOWNLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 100;
const DEFAULT_UPLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 20;
const NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS = 3;
const NETWORK_CENTER_ICON_SIZE = 58;
const NETWORK_TOP_ICON_SIZE = 30;
const NETWORK_FOOTER_ICON_SIZE = 21;
