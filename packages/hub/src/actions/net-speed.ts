import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import { logger } from "../logging/logger";
import type { WidgetData } from "../rendering/widget-data";
import type { SettingValue } from "./metric-visual-settings";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../runtime/network-interfaces";
import { getNetworkAggregateMetricKey, getNetworkInterfaceMetricKey, type NetworkDirection } from "../runtime/network-metric-keys";
import {
    buildNetworkSpeedWidgetData,
    convertMegabitsPerSecondToBytesPerSecond,
    type NetworkSpeedUnitBase,
} from "../metrics/network-speed-display";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import {
    getNetworkDirectionStatusIcon,
    renderNetworkDirectionIconFragment,
    renderNetworkInterfaceIconFragment,
} from "../widgets/icons/catalog/network";

const log = logger.for("Action:NetSpeed");

/**
 * Network Speed action.
 * A circle visual fits one-way single-value data. Download or upload speed can
 * use a circle independently, but combined download/upload needs another graph.
 */
@action({ UUID: "com.ez.sho-metrics.net-speed" })
export class NetSpeed extends MetricAction {
    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = event.payload.settings as NetworkSpeedSettings;
        const direction = normalizeNetworkDirection(settings.networkDirection);
        const selectedNetworkInterface = resolveNetworkInterface(settings.networkInterfaceId);

        if (settings.graphicType === "linear") {
            return selectedNetworkInterface
                ? [
                    getNetworkInterfaceMetricKey("upload", selectedNetworkInterface.id),
                    getNetworkInterfaceMetricKey("download", selectedNetworkInterface.id),
                ]
                : [
                    getNetworkAggregateMetricKey("upload"),
                    getNetworkAggregateMetricKey("download"),
                ];
        }

        return [
            selectedNetworkInterface
                ? getNetworkInterfaceMetricKey(direction, selectedNetworkInterface.id)
                : getNetworkAggregateMetricKey(direction),
        ];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = event.payload.settings as NetworkSpeedSettings;
        const direction = normalizeNetworkDirection(settings.networkDirection);
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

        const circularCenterContent = settings.circularCenterContent === "icon" ? "icon" : "icon-value-unit";

        setSingleMetricDisplay({
            event,
            metricKey: networkMetricKey,
            widgetData,
            centerIconFragment: buildNetworkCenterIconFragment({
                circularCenterContent,
                direction,
                selectedNetworkInterface,
            }),
            statusIcon: getNetworkDirectionStatusIcon({
                direction,
                color: NETWORK_DIRECTION_ICON_COLOR,
            }),
            circularCenterContentOverride: circularCenterContent,
            visualSettingsOverride: {
                colorMode: settings.colorMode ?? "solid",
                solidColor: settings.solidColor ?? resolveDirectionSolidColor(direction, settings),
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
                        label: "UP",
                        displayValue: uploadWidgetData.displayValue ?? uploadWidgetData.current.toFixed(0),
                        unit: uploadWidgetData.unit,
                        progress: uploadWidgetData.progress,
                        color: resolveDirectionSolidColor("upload", options.settings),
                        iconFragment: renderNetworkDirectionIconFragment({
                            direction: "upload",
                            color: resolveDirectionSolidColor("upload", options.settings),
                            size: NETWORK_TOP_ICON_SIZE,
                        }),
                    },
                    {
                        label: "DOWN",
                        displayValue: downloadWidgetData.displayValue ?? downloadWidgetData.current.toFixed(0),
                        unit: downloadWidgetData.unit,
                        progress: downloadWidgetData.progress,
                        color: resolveDirectionSolidColor("download", options.settings),
                        iconFragment: renderNetworkDirectionIconFragment({
                            direction: "download",
                            color: resolveDirectionSolidColor("download", options.settings),
                            size: NETWORK_TOP_ICON_SIZE,
                        }),
                    },
                ],
                sampleTimestampMilliseconds: downloadWidgetData.sampleTimestampMilliseconds
                    ?? uploadWidgetData.sampleTimestampMilliseconds,
            },
            centerIconFragment: buildNetworkCenterIconFragment({
                circularCenterContent: "icon",
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
                solidColor: resolveDirectionSolidColor("download", options.settings),
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
        log.atTrace().everyMs("speed-sample", DEBUG_LOG_INTERVAL_MILLISECONDS).log(() => [
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

interface NetworkSpeedSettings {
    graphicType?: SettingValue;
    networkDirection?: SettingValue;
    networkInterfaceId?: SettingValue;
    availableNetworkInterfaces?: SettingValue;
    maximumNetworkSpeedMbps?: SettingValue;
    networkUnitBase?: SettingValue;
    downloadIconColor?: SettingValue;
    uploadIconColor?: SettingValue;
    circularCenterContent?: SettingValue;
    colorMode?: SettingValue;
    solidColor?: SettingValue;
}

const ACTIVE_DOWNLOAD_ICON_COLOR = "#3b82f6";
const ACTIVE_UPLOAD_ICON_COLOR = "#ef4444";
const NETWORK_DIRECTION_ICON_COLOR = "rgba(255,255,255,0.88)";
const FALLBACK_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 1000;
const NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS = 3;
const NETWORK_CENTER_ICON_SIZE = 58;
const NETWORK_TOP_ICON_SIZE = 30;
const DEBUG_LOG_INTERVAL_MILLISECONDS = 5000;

function normalizeNetworkDirection(value: SettingValue): NetworkDirection {
    return value === "upload" ? "upload" : "download";
}

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

function getNetworkDirectionLabel(direction: NetworkDirection): string {
    return direction === "download" ? ARC_GAUGE_LABELS.download : ARC_GAUGE_LABELS.upload;
}

function buildNetworkCenterIconFragment(options: {
    circularCenterContent: "icon" | "icon-value-unit";
    direction: NetworkDirection;
    selectedNetworkInterface: NetworkInterfaceOption | null;
}): string {
    if (options.circularCenterContent === "icon") {
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

function resolveDirectionSolidColor(direction: NetworkDirection, settings: NetworkSpeedSettings): string {
    if (direction === "download") {
        return resolveHexColor(settings.downloadIconColor, ACTIVE_DOWNLOAD_ICON_COLOR);
    }

    return resolveHexColor(settings.uploadIconColor, ACTIVE_UPLOAD_ICON_COLOR);
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
