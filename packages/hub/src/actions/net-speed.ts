import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setDualMetricDisplay, setSingleMetricDisplay } from "./single-metric-display";
import { logger } from "../logging/logger";
import type { WidgetData } from "../rendering/widget-data";
import type { SettingValue } from "./metric-visual-settings";
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
    type NetworkSpeedUnitBase,
} from "../metrics/network-speed-display";
import { resolveColor, type ColorConfig } from "../rendering/color-resolver";
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
    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        return resolveNetSpeedMetricKeys(event.payload.settings as NetworkSpeedSettings);
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = event.payload.settings as NetworkSpeedSettings;
        const displayDirection = normalizeNetworkDisplayDirection(settings.networkDirection);
        const direction = resolveSingleNetworkDirection(displayDirection);
        const isAutomaticNetworkInterface = !isNonEmptyString(settings.networkInterfaceId);
        const selectedNetworkInterface = resolveNetworkInterface(settings.networkInterfaceId);
        const networkMetricKey = selectedNetworkInterface
            ? getNetworkInterfaceMetricKey(direction, selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey(direction);

        publishNetworkInterfaceOptions(event, settings);

        if (settings.graphicType === "linear") {
            this.updateLinearNetworkDisplay({
                event,
                settings,
                selectedNetworkInterface,
                isAutomaticNetworkInterface,
            });
            return;
        }

        if (settings.graphicType === "dashed-line" && displayDirection === "both") {
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
                dualGraphicType: settings.graphicType === "text" ? "text" : "circular",
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

        const circleStyle = resolveCircleStyle(settings.circleStyle);
        const shouldRenderGaugeFooter = settings.graphicType === "circular" && circleStyle === "gauge";
        const renderedWidgetData = shouldRenderGaugeFooter
            ? { ...widgetData, label: ARC_GAUGE_LABELS.network }
            : widgetData;

        setSingleMetricDisplay({
            event,
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
                colorMode: settings.colorMode ?? "solid",
                solidColor: settings.solidColor ?? resolveNetworkChannelColor(direction, settings),
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
        const circleStyle = resolveCircleStyle(options.settings.circleStyle);

        setDualMetricDisplay({
            event: options.event,
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
                solidColor: uploadColor,
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
        const trafficDisplayMode = resolveNetworkTrafficDisplayMode(options.settings.networkTrafficDisplayMode);
        const positiveDirection = trafficDisplayMode === "mirrored" ? "upload" : "download";
        const negativeDirection = trafficDisplayMode === "mirrored" ? "download" : "upload";
        const positiveWidgetData = trafficDisplayMode === "mirrored" ? uploadWidgetData : downloadWidgetData;
        const negativeWidgetData = trafficDisplayMode === "mirrored" ? downloadWidgetData : uploadWidgetData;
        const positiveColor = positiveDirection === "download" ? downloadColor : uploadColor;
        const negativeColor = negativeDirection === "download" ? downloadColor : uploadColor;

        setDualMetricDisplay({
            event: options.event,
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
                solidColor: downloadColor,
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
                solidColor: resolveNetworkWidgetChannelColor("download", options.settings, downloadWidgetData),
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
            `manualMaxMbps=${String(options.settings.maximumNetworkSpeedMbps ?? "")}`,
            `resolvedMaxBytesPerSecond=${resolveMaximumBytesPerSecond({
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

export interface NetworkSpeedSettings {
    graphicType?: SettingValue;
    circleStyle?: SettingValue;
    networkDirection?: SettingValue;
    networkInterfaceId?: SettingValue;
    availableNetworkInterfaces?: SettingValue;
    maximumNetworkSpeedMbps?: SettingValue;
    networkUnitBase?: SettingValue;
    networkTrafficDisplayMode?: SettingValue;
    downloadColorMode?: SettingValue;
    downloadSolidColor?: SettingValue;
    downloadColorLow?: SettingValue;
    downloadColorMedium?: SettingValue;
    downloadColorHigh?: SettingValue;
    uploadColorMode?: SettingValue;
    uploadSolidColor?: SettingValue;
    uploadColorLow?: SettingValue;
    uploadColorMedium?: SettingValue;
    uploadColorHigh?: SettingValue;
    lowThreshold?: SettingValue;
    highThreshold?: SettingValue;
    colorMode?: SettingValue;
    solidColor?: SettingValue;
}

const DEFAULT_DOWNLOAD_COLOR = "#3b82f6";
const DEFAULT_UPLOAD_COLOR = "#ef4444";
const NETWORK_DIRECTION_ICON_COLOR = "rgba(255,255,255,0.88)";
const FALLBACK_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 1000;
const NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS = 3;
const NETWORK_CENTER_ICON_SIZE = 58;
const NETWORK_TOP_ICON_SIZE = 30;
const NETWORK_FOOTER_ICON_SIZE = 21;
const DEBUG_LOG_INTERVAL_MILLISECONDS = 5000;

function resolveNetworkInterface(value: SettingValue): NetworkInterfaceOption | null {
    if (isNonEmptyString(value)) {
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
            settings: options.settings,
            selectedNetworkInterface: options.selectedNetworkInterface,
            isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
        }),
        label: getNetworkDirectionLabel(options.direction),
        unitBase: resolveUnitBase(options.settings.networkUnitBase),
        maximumDisplayDigits: NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS,
        sampleTimestampMilliseconds: options.rawWidgetData.sampleTimestampMilliseconds,
    });
}

function resolveMaximumBytesPerSecond(options: {
    settings: NetworkSpeedSettings;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    isAutomaticNetworkInterface: boolean;
}): number {
    const customMaximumMegabitsPerSecond = Number(options.settings.maximumNetworkSpeedMbps);

    if (
        Number.isFinite(customMaximumMegabitsPerSecond)
        && customMaximumMegabitsPerSecond > 0
    ) {
        return convertMegabitsPerSecondToBytesPerSecond(customMaximumMegabitsPerSecond);
    }

    if (options.isAutomaticNetworkInterface) {
        const maximumAutomaticSpeedMegabitsPerSecond = networkInterfaceRegistry.resolveMaximumAutomaticSpeedMegabitsPerSecond();

        if (maximumAutomaticSpeedMegabitsPerSecond) {
            return convertMegabitsPerSecondToBytesPerSecond(maximumAutomaticSpeedMegabitsPerSecond);
        }
    }

    if (options.selectedNetworkInterface?.speedMegabitsPerSecond) {
        return convertMegabitsPerSecondToBytesPerSecond(options.selectedNetworkInterface.speedMegabitsPerSecond);
    }

    return convertMegabitsPerSecondToBytesPerSecond(FALLBACK_MAXIMUM_SPEED_MEGABITS_PER_SECOND);
}

function resolveUnitBase(value: SettingValue): NetworkSpeedUnitBase {
    return value === "bit" ? "bit" : "byte";
}

function resolveNetworkTrafficDisplayMode(value: SettingValue): "overlay" | "mirrored" {
    return value === "overlay" ? "overlay" : "mirrored";
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

function resolveCircleStyle(value: SettingValue): "value" | "compact" | "gauge" {
    if (value === "compact" || value === "gauge") {
        return value;
    }

    return "value";
}

function resolveNetworkChannelColor(direction: NetworkDirection, settings: NetworkSpeedSettings): string {
    return resolveColor(0, buildNetworkChannelColorConfig(direction, settings));
}

function resolveNetworkWidgetChannelColor(direction: NetworkDirection, settings: NetworkSpeedSettings, widgetData: WidgetData): string {
    return resolveColor(widgetData.progress * 100, buildNetworkChannelColorConfig(direction, settings));
}

function buildNetworkChannelColorConfig(direction: NetworkDirection, settings: NetworkSpeedSettings): ColorConfig {
    if (direction === "download") {
        return {
            mode: settings.downloadColorMode === "threshold" ? "threshold" : "solid",
            solidColor: resolveHexColor(settings.downloadSolidColor, DEFAULT_DOWNLOAD_COLOR),
            thresholds: buildChannelThresholds({
                settings,
                lowColor: resolveHexColor(settings.downloadColorLow, "#22c55e"),
                mediumColor: resolveHexColor(settings.downloadColorMedium, DEFAULT_DOWNLOAD_COLOR),
                highColor: resolveHexColor(settings.downloadColorHigh, "#60a5fa"),
            }),
        };
    }

    return {
        mode: settings.uploadColorMode === "threshold" ? "threshold" : "solid",
        solidColor: resolveHexColor(settings.uploadSolidColor, DEFAULT_UPLOAD_COLOR),
        thresholds: buildChannelThresholds({
            settings,
            lowColor: resolveHexColor(settings.uploadColorLow, "#f97316"),
            mediumColor: resolveHexColor(settings.uploadColorMedium, DEFAULT_UPLOAD_COLOR),
            highColor: resolveHexColor(settings.uploadColorHigh, "#f472b6"),
        }),
    };
}

function buildChannelThresholds(options: {
    settings: NetworkSpeedSettings;
    lowColor: string;
    mediumColor: string;
    highColor: string;
}): ColorConfig["thresholds"] {
    const lowThreshold = normalizeThreshold(options.settings.lowThreshold, 30);
    const highThreshold = Math.max(lowThreshold, normalizeThreshold(options.settings.highThreshold, 70));

    return [
        { min: 0, max: lowThreshold, color: options.lowColor },
        { min: lowThreshold, max: highThreshold, color: options.mediumColor },
        { min: highThreshold, max: 101, color: options.highColor },
    ];
}

function normalizeThreshold(value: SettingValue, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(numericValue), 0), 100);
}

function resolveHexColor(value: SettingValue, fallbackColor: string): string {
    if (typeof value !== "string") {
        return fallbackColor;
    }

    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallbackColor;
}

function isNonEmptyString(value: SettingValue): value is string {
    return typeof value === "string" && value.length > 0;
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

function publishNetworkInterfaceOptions(event: WillAppearEvent, settings: NetworkSpeedSettings): void {
    const availableNetworkInterfaces = JSON.stringify(networkInterfaceRegistry.getOptions());

    if (settings.availableNetworkInterfaces === availableNetworkInterfaces) {
        return;
    }

    event.action.setSettings({
        ...settings,
        availableNetworkInterfaces,
    }).catch(error => {
        log.error(() => `Failed to publish network interfaces: ${String(error)}`);
    });
}
