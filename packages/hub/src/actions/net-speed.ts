import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setDualMetricDisplay, setSingleMetricDisplay } from "./single-metric-display";
import { logger } from "../logging/logger";
import type { WidgetData } from "../rendering/widget-data";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../runtime/network-interfaces";
import { getNetworkAggregateMetricKey, getNetworkInterfaceMetricKey, type NetworkDirection } from "../runtime/network-metric-keys";
import {
    normalizeNetworkDisplayDirection,
    resolveNetSpeedMetricKeys,
    resolveSingleNetworkDirection,
} from "./net-speed-metric-keys";
import {
    buildNetworkSpeedWidgetData,
    convertMegabitsPerSecondToBytesPerSecond,
} from "../metrics/network-speed-display";
import { resolveColor, type ColorConfig } from "../rendering/color-resolver";
import { buildGlobalChannelColorConfig } from "../settings/global-appearance";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    readActionStoredSettings,
    serializeActionStoredSettings,
} from "./action-settings-resolver";
import type { ResolvedWidgetSettings } from "../settings/widget-settings";
import { updateWidgetRuntimeCache } from "../settings/updates";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import {
    getNetworkDirectionStatusIcon,
    renderNetworkDirectionIconFragment,
    renderNetworkInterfaceIconFragment,
} from "../widgets/icons/catalog/network";

const log = logger.for("Action:NetSpeed");

/**
 * Network Speed action.
 * Circle, linear, and sparkline visuals all support either one network
 * direction or combined download/upload telemetry.
 */
@action({ UUID: "com.ez.sho-metrics.net-speed" })
export class NetSpeed extends MetricAction {
    protected readonly actionKind = "net-speed";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        return resolveNetSpeedMetricKeys({
            graphicType: settings.appearance.graphicType,
            networkDirection: settings.metric.networkDirection,
            networkInterfaceId: settings.metric.networkInterfaceId,
        });
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const effectiveGraphicType = settings.appearance.graphicType;
        const displayDirection = normalizeNetworkDisplayDirection(settings.metric.networkDirection);
        const direction = resolveSingleNetworkDirection(displayDirection);
        const isAutomaticNetworkInterface = settings.metric.networkInterfaceId.length === 0;
        const selectedNetworkInterface = resolveNetworkInterface(settings.metric.networkInterfaceId);
        const networkMetricKey = selectedNetworkInterface
            ? getNetworkInterfaceMetricKey(direction, selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey(direction);

        publishNetworkInterfaceOptions(event);
        publishNetworkScaleLearning(event, settings, selectedNetworkInterface);

        if (effectiveGraphicType === "linear") {
            this.updateLinearNetworkDisplay({
                event,
                settings,
                selectedNetworkInterface,
                isAutomaticNetworkInterface,
            });
            return;
        }

        if (effectiveGraphicType === "dashed-line" && displayDirection === "both") {
            this.updateDualNetworkSparklineDisplay({
                event,
                settings,
                selectedNetworkInterface,
                isAutomaticNetworkInterface,
            });
            return;
        }

        if (displayDirection === "both") {
            this.updateDualNetworkCircularDisplay({
                event,
                settings,
                selectedNetworkInterface,
                isAutomaticNetworkInterface,
                dualGraphicType: effectiveGraphicType === "text" ? "text" : "circular",
            });
            return;
        }

        const rawWidgetData = metricStore.getWidgetData(networkMetricKey, getNetworkDirectionLabel(direction), "B/s");
        const widgetData = buildNetworkWidgetData({
            rawWidgetData,
            direction,
            settings,
            selectedNetworkInterface,
            isAutomaticNetworkInterface,
        });
        this.logNetworkSpeedDebug({
            settings,
            direction,
            selectedNetworkInterface,
            isAutomaticNetworkInterface,
            networkMetricKey,
            rawWidgetData,
            widgetData,
        });

        const circleStyle = settings.appearance.circleStyle;
        const shouldRenderGaugeFooter = effectiveGraphicType === "circular" && circleStyle === "gauge";
        const renderedWidgetData = shouldRenderGaugeFooter
            ? { ...widgetData, label: ARC_GAUGE_LABELS.network }
            : widgetData;

        setSingleMetricDisplay({
            event,
            resolvedSettings: settings.appearance,
            metricKey: networkMetricKey,
            widgetData: renderedWidgetData,
            centerIconFragment: buildNetworkCenterIconFragment({
                circleStyle,
                direction,
                selectedNetworkInterface,
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
                colorMode: settings.appearance.colorMode,
                usageColors: {
                    solidColor: settings.appearance.usageColors.solidColor || resolveNetworkChannelColor(direction, settings),
                },
            },
        });
    }

    private updateDualNetworkCircularDisplay(options: {
        event: WillAppearEvent;
        settings: NetworkSpeedSettings;
        selectedNetworkInterface: NetworkInterfaceOption | null;
        isAutomaticNetworkInterface: boolean;
        dualGraphicType: "circular" | "text";
    }): void {
        const uploadMetricKey = options.selectedNetworkInterface
            ? getNetworkInterfaceMetricKey("upload", options.selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey("upload");
        const downloadMetricKey = options.selectedNetworkInterface
            ? getNetworkInterfaceMetricKey("download", options.selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey("download");
        const uploadWidgetData = buildNetworkWidgetData({
            rawWidgetData: metricStore.getWidgetData(uploadMetricKey, "UP", "B/s"),
            direction: "upload",
            settings: options.settings,
            selectedNetworkInterface: options.selectedNetworkInterface,
            isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
        });
        const downloadWidgetData = buildNetworkWidgetData({
            rawWidgetData: metricStore.getWidgetData(downloadMetricKey, "DOWN", "B/s"),
            direction: "download",
            settings: options.settings,
            selectedNetworkInterface: options.selectedNetworkInterface,
            isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
        });
        const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);
        const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
        const uploadColorConfig = buildNetworkChannelColorConfig("upload", options.settings);
        const downloadColorConfig = buildNetworkChannelColorConfig("download", options.settings);
        const circleStyle = options.settings.appearance.circleStyle;

        setDualMetricDisplay({
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
        });
    }

    private updateDualNetworkSparklineDisplay(options: {
        event: WillAppearEvent;
        settings: NetworkSpeedSettings;
        selectedNetworkInterface: NetworkInterfaceOption | null;
        isAutomaticNetworkInterface: boolean;
    }): void {
        const uploadMetricKey = options.selectedNetworkInterface
            ? getNetworkInterfaceMetricKey("upload", options.selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey("upload");
        const downloadMetricKey = options.selectedNetworkInterface
            ? getNetworkInterfaceMetricKey("download", options.selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey("download");
        const uploadWidgetData = buildNetworkWidgetData({
            rawWidgetData: metricStore.getWidgetData(uploadMetricKey, "UP", "B/s"),
            direction: "upload",
            settings: options.settings,
            selectedNetworkInterface: options.selectedNetworkInterface,
            isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
        });
        const downloadWidgetData = buildNetworkWidgetData({
            rawWidgetData: metricStore.getWidgetData(downloadMetricKey, "DOWN", "B/s"),
            direction: "download",
            settings: options.settings,
            selectedNetworkInterface: options.selectedNetworkInterface,
            isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
        });
        const uploadColor = resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData);
        const downloadColor = resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData);
        const trafficDisplayMode = options.settings.local.networkTrafficDisplayMode;
        const positiveDirection = trafficDisplayMode === "mirrored" ? "upload" : "download";
        const negativeDirection = trafficDisplayMode === "mirrored" ? "download" : "upload";
        const positiveWidgetData = trafficDisplayMode === "mirrored" ? uploadWidgetData : downloadWidgetData;
        const negativeWidgetData = trafficDisplayMode === "mirrored" ? downloadWidgetData : uploadWidgetData;
        const positiveColor = positiveDirection === "download" ? downloadColor : uploadColor;
        const negativeColor = negativeDirection === "download" ? downloadColor : uploadColor;

        setDualMetricDisplay({
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
        });
    }

    private updateLinearNetworkDisplay(options: {
        event: WillAppearEvent;
        settings: NetworkSpeedSettings;
        selectedNetworkInterface: NetworkInterfaceOption | null;
        isAutomaticNetworkInterface: boolean;
    }): void {
        const uploadMetricKey = options.selectedNetworkInterface
            ? getNetworkInterfaceMetricKey("upload", options.selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey("upload");
        const downloadMetricKey = options.selectedNetworkInterface
            ? getNetworkInterfaceMetricKey("download", options.selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey("download");
        const uploadRawWidgetData = metricStore.getWidgetData(uploadMetricKey, "UP", "B/s");
        const downloadRawWidgetData = metricStore.getWidgetData(downloadMetricKey, "DOWN", "B/s");
        const uploadWidgetData = buildNetworkWidgetData({
            rawWidgetData: uploadRawWidgetData,
            direction: "upload",
            settings: options.settings,
            selectedNetworkInterface: options.selectedNetworkInterface,
            isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
        });
        const downloadWidgetData = buildNetworkWidgetData({
            rawWidgetData: downloadRawWidgetData,
            direction: "download",
            settings: options.settings,
            selectedNetworkInterface: options.selectedNetworkInterface,
            isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
        });

        setSingleMetricDisplay({
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
                        color: resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData),
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
                        color: resolveNetworkWidgetChannelColor("upload", options.settings, uploadWidgetData),
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
                    solidColor: resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData),
                },
            },
        });
    }

    private logNetworkSpeedDebug(options: {
        settings: NetworkSpeedSettings;
        direction: NetworkDirection;
        selectedNetworkInterface: NetworkInterfaceOption | null;
        isAutomaticNetworkInterface: boolean;
        networkMetricKey: string;
        rawWidgetData: WidgetData;
        widgetData: WidgetData;
    }): void {
        log.atDebug().everyMs("speed-sample", DEBUG_LOG_INTERVAL_MILLISECONDS).log(() => [
            `direction=${options.direction}`,
            `metricKey=${options.networkMetricKey}`,
            `selectedInterface=${formatNetworkInterfaceDebugValue(options.selectedNetworkInterface)}`,
            `automaticInterface=${options.isAutomaticNetworkInterface}`,
            `downloadMaxMbps=${String(options.settings.network.maximumDownloadSpeedMbps ?? "")}`,
            `uploadMaxMbps=${String(options.settings.network.maximumUploadSpeedMbps ?? "")}`,
            `resolvedMaxBytesPerSecond=${resolveMaximumBytesPerSecond({
                direction: options.direction,
                settings: options.settings,
                selectedNetworkInterface: options.selectedNetworkInterface,
                isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
            }).toFixed(0)}`,
            `detectedAutomaticMaxMbps=${String(networkInterfaceRegistry.resolveMaximumAutomaticSpeedMegabitsPerSecond() ?? "")}`,
            `currentBytesPerSecond=${options.rawWidgetData.current.toFixed(0)}`,
            `progress=${options.widgetData.progress.toFixed(4)}`,
            `availableInterfaces=${JSON.stringify(networkInterfaceRegistry.getOptions())}`,
        ].join(" "));
    }
}

type NetworkSpeedSettings = ResolvedWidgetSettings;

const DEFAULT_DOWNLOAD_COLOR = "#3b82f6";
const DEFAULT_UPLOAD_COLOR = "#ef4444";
const NETWORK_DIRECTION_ICON_COLOR = "rgba(255,255,255,0.88)";
const DEFAULT_DOWNLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 100;
const DEFAULT_UPLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 20;
const NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS = 3;
const NETWORK_CENTER_ICON_SIZE = 58;
const NETWORK_TOP_ICON_SIZE = 30;
const NETWORK_FOOTER_ICON_SIZE = 21;
const DEBUG_LOG_INTERVAL_MILLISECONDS = 5000;

function resolveNetworkInterface(value: string): NetworkInterfaceOption | null {
    if (value.length > 0) {
        return networkInterfaceRegistry.findById(value);
    }

    return networkInterfaceRegistry.resolveAutomaticSelection();
}

function buildNetworkWidgetData(options: {
    rawWidgetData: WidgetData;
    direction: NetworkDirection;
    settings: NetworkSpeedSettings;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    isAutomaticNetworkInterface: boolean;
}): WidgetData {
    return buildNetworkSpeedWidgetData({
        bytesPerSecond: options.rawWidgetData.current,
        historyBytesPerSecond: options.rawWidgetData.history,
        maximumBytesPerSecond: resolveMaximumBytesPerSecond({
            direction: options.direction,
            settings: options.settings,
            selectedNetworkInterface: options.selectedNetworkInterface,
            isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
        }),
        label: getNetworkDirectionLabel(options.direction),
        unitBase: options.settings.network.networkUnitBase,
        maximumDisplayDigits: NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS,
        sampleTimestampMilliseconds: options.rawWidgetData.sampleTimestampMilliseconds,
    });
}

function resolveMaximumBytesPerSecond(options: {
    direction: NetworkDirection;
    settings: NetworkSpeedSettings;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    isAutomaticNetworkInterface: boolean;
}): number {
    return convertMegabitsPerSecondToBytesPerSecond(resolveMaximumMegabitsPerSecond(options));
}

function resolveMaximumMegabitsPerSecond(options: {
    direction: NetworkDirection;
    settings: NetworkSpeedSettings;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    isAutomaticNetworkInterface: boolean;
}): number {
    const customMaximumMegabitsPerSecond = Number(
        options.direction === "download"
            ? options.settings.network.maximumDownloadSpeedMbps
            : options.settings.network.maximumUploadSpeedMbps,
    );

    if (
        Number.isFinite(customMaximumMegabitsPerSecond)
        && customMaximumMegabitsPerSecond > 0
    ) {
        return customMaximumMegabitsPerSecond;
    }

    return options.direction === "download"
        ? DEFAULT_DOWNLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND
        : DEFAULT_UPLOAD_MAXIMUM_SPEED_MEGABITS_PER_SECOND;
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

function resolveNetworkChannelColor(direction: NetworkDirection, settings: NetworkSpeedSettings): string {
    return resolveColor(0, buildNetworkChannelColorConfig(direction, settings));
}

function resolveNetworkWidgetChannelColor(direction: NetworkDirection, settings: NetworkSpeedSettings, widgetData: WidgetData): string {
    return resolveColor(widgetData.progress * 100, buildNetworkChannelColorConfig(direction, settings));
}

function buildNetworkChannelColorConfig(direction: NetworkDirection, settings: NetworkSpeedSettings): ColorConfig {
    const globalSettings = pluginGlobalSettingsStore.get();
    if (globalSettings.overrideWidgetAppearance) {
        return buildGlobalChannelColorConfig(direction === "download" ? "primary" : "secondary", globalSettings);
    }

    if (direction === "download") {
        const colors = settings.appearance.downloadColors;
        return {
            mode: settings.appearance.colorMode === "threshold" ? "threshold" : "solid",
            solidColor: resolveHexColor(colors.solidColor, DEFAULT_DOWNLOAD_COLOR),
            thresholds: buildChannelThresholds({
                settings,
                lowColor: resolveHexColor(colors.lowColor, "#22c55e"),
                mediumColor: resolveHexColor(colors.mediumColor, DEFAULT_DOWNLOAD_COLOR),
                highColor: resolveHexColor(colors.highColor, "#60a5fa"),
            }),
        };
    }

    const colors = settings.appearance.uploadColors;
    return {
        mode: settings.appearance.colorMode === "threshold" ? "threshold" : "solid",
        solidColor: resolveHexColor(colors.solidColor, DEFAULT_UPLOAD_COLOR),
        thresholds: buildChannelThresholds({
            settings,
            lowColor: resolveHexColor(colors.lowColor, "#f97316"),
            mediumColor: resolveHexColor(colors.mediumColor, DEFAULT_UPLOAD_COLOR),
            highColor: resolveHexColor(colors.highColor, "#f472b6"),
        }),
    };
}

function buildChannelThresholds(options: {
    settings: NetworkSpeedSettings;
    lowColor: string;
    mediumColor: string;
    highColor: string;
}): ColorConfig["thresholds"] {
    const lowThreshold = normalizeThreshold(options.settings.appearance.lowThreshold, 30);
    const highThreshold = Math.max(lowThreshold, normalizeThreshold(options.settings.appearance.highThreshold, 70));

    return [
        { min: 0, max: lowThreshold, color: options.lowColor },
        { min: lowThreshold, max: highThreshold, color: options.mediumColor },
        { min: highThreshold, max: 101, color: options.highColor },
    ];
}

function normalizeThreshold(value: number, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(numericValue), 0), 100);
}

function resolveHexColor(value: string, fallbackColor: string): string {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallbackColor;
}

function formatNetworkInterfaceDebugValue(networkInterface: NetworkInterfaceOption | null): string {
    if (!networkInterface) {
        return "none";
    }

    return JSON.stringify({
        id: networkInterface.id,
        name: networkInterface.name,
        type: networkInterface.type,
        isDefault: networkInterface.isDefault,
        speedMegabitsPerSecond: networkInterface.speedMegabitsPerSecond,
    });
}

function publishNetworkInterfaceOptions(event: WillAppearEvent): void {
    const availableNetworkInterfaces = JSON.stringify(networkInterfaceRegistry.getOptions());

    const storedSettings = readActionStoredSettings(event);

    if (storedSettings.runtimeCache?.availableNetworkInterfaces === availableNetworkInterfaces) {
        return;
    }

    event.action.setSettings(serializeActionStoredSettings(updateWidgetRuntimeCache(storedSettings, {
        availableNetworkInterfaces,
    }))).catch(error => {
        log.error(() => `Failed to publish network interfaces: ${String(error)}`);
    });
}

function publishNetworkScaleLearning(
    event: WillAppearEvent,
    settings: NetworkSpeedSettings,
    selectedNetworkInterface: NetworkInterfaceOption | null,
): void {
    if (settings.network.networkScaleMode === "custom") {
        return;
    }

    const downloadMetricKey = selectedNetworkInterface
        ? getNetworkInterfaceMetricKey("download", selectedNetworkInterface.id)
        : getNetworkAggregateMetricKey("download");
    const uploadMetricKey = selectedNetworkInterface
        ? getNetworkInterfaceMetricKey("upload", selectedNetworkInterface.id)
        : getNetworkAggregateMetricKey("upload");
    const nextDownloadMaximum = resolveLearnedNetworkMaximumMegabitsPerSecond({
        direction: "download",
        settings,
        observedBytesPerSecond: metricStore.getWidgetData(downloadMetricKey, "DOWN", "B/s").current,
        selectedNetworkInterface,
    });
    const nextUploadMaximum = resolveLearnedNetworkMaximumMegabitsPerSecond({
        direction: "upload",
        settings,
        observedBytesPerSecond: metricStore.getWidgetData(uploadMetricKey, "UP", "B/s").current,
        selectedNetworkInterface,
    });

    const storedSettings = readActionStoredSettings(event);

    if (
        storedSettings.runtimeCache?.learnedMaximumDownloadSpeedMbps === nextDownloadMaximum
        && storedSettings.runtimeCache?.learnedMaximumUploadSpeedMbps === nextUploadMaximum
    ) {
        return;
    }

    event.action.setSettings(serializeActionStoredSettings(updateWidgetRuntimeCache(storedSettings, {
        learnedMaximumDownloadSpeedMbps: nextDownloadMaximum,
        learnedMaximumUploadSpeedMbps: nextUploadMaximum,
    }))).catch(error => {
        log.error(() => `Failed to publish learned network scale: ${String(error)}`);
    });
}

function resolveLearnedNetworkMaximumMegabitsPerSecond(options: {
    direction: NetworkDirection;
    settings: NetworkSpeedSettings;
    observedBytesPerSecond: number;
    selectedNetworkInterface: NetworkInterfaceOption | null;
}): number {
    const currentMaximum = resolveMaximumMegabitsPerSecond({
        direction: options.direction,
        settings: options.settings,
        selectedNetworkInterface: options.selectedNetworkInterface,
        isAutomaticNetworkInterface: false,
    });
    const observedMegabitsPerSecond = (Math.max(0, options.observedBytesPerSecond) * 8) / 1_000_000;
    const learnedMaximum = Math.ceil(observedMegabitsPerSecond * 1.1);

    return Math.max(currentMaximum, learnedMaximum);
}
