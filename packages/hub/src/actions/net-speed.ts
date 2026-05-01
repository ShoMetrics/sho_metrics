import { action, WillAppearEvent } from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
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

/**
 * Network Speed action.
 * A circle visual fits one-way single-value data. Download or upload speed can
 * use a circle independently, but combined download/upload needs another graph.
 */
@action({ UUID: "com.ez.sho-metrics.net-speed" })
export class NetSpeed extends MetricAction {
    private lastDebugLogTimestampMilliseconds = 0;

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = event.payload.settings as NetworkSpeedSettings;
        const direction = normalizeNetworkDirection(settings.networkDirection) ?? "download";
        const selectedNetworkInterface = resolveNetworkInterface(settings.networkInterfaceId);

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
            ? getNetworkInterfaceMetricKey(direction ?? "download", selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey(direction ?? "download");

        publishNetworkInterfaceOptions(event, settings);

        if (!direction) {
            showDirectionSelectionPrompt(event);
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

        setSingleMetricDisplay({
            event,
            metricKey: networkMetricKey,
            widgetData,
            centerIconFragment: renderNetworkIconFragment({
                direction,
                color: resolveNetworkIconColor(direction, rawWidgetData.current, settings),
            }),
            circularCenterContentOverride: settings.circularCenterContent === "icon" ? "icon" : "icon-value-unit",
            visualSettingsOverride: {
                colorMode: settings.colorMode ?? "solid",
                solidColor: settings.solidColor ?? resolveDirectionSolidColor(direction, settings),
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
        const currentTimestampMilliseconds = Date.now();

        if (currentTimestampMilliseconds - this.lastDebugLogTimestampMilliseconds < DEBUG_LOG_INTERVAL_MILLISECONDS) {
            return;
        }

        this.lastDebugLogTimestampMilliseconds = currentTimestampMilliseconds;

        streamDeck.logger.debug([
            "[NetSpeed]",
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
const INACTIVE_ICON_COLOR = "rgba(255,255,255,0.88)";
const ACTIVE_ICON_THRESHOLD_BYTES_PER_SECOND = 1000;
const FALLBACK_MAXIMUM_SPEED_MEGABITS_PER_SECOND = 1000;
const NETWORK_SPEED_MAXIMUM_DISPLAY_DIGITS = 3;
const DEBUG_LOG_INTERVAL_MILLISECONDS = 5000;

function normalizeNetworkDirection(value: SettingValue): NetworkDirection | null {
    if (value === "download" || value === "upload") {
        return value;
    }

    return null;
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

function resolveNetworkIconColor(
    direction: NetworkDirection,
    bytesPerSecond: number,
    settings: NetworkSpeedSettings,
): string {
    if (bytesPerSecond < ACTIVE_ICON_THRESHOLD_BYTES_PER_SECOND) {
        return INACTIVE_ICON_COLOR;
    }

    if (direction === "download") {
        return resolveHexColor(settings.downloadIconColor, ACTIVE_DOWNLOAD_ICON_COLOR);
    }

    return resolveHexColor(settings.uploadIconColor, ACTIVE_UPLOAD_ICON_COLOR);
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
        streamDeck.logger.error(`[NetSpeed] Failed to publish network interfaces: ${String(error)}`);
    });
}

function showDirectionSelectionPrompt(event: WillAppearEvent): void {
    const download = metricStore.getWidgetData(getNetworkAggregateMetricKey("download"), "DOWN", "B/s");
    const upload = metricStore.getWidgetData(getNetworkAggregateMetricKey("upload"), "UP", "B/s");

    if (event.action.isDial()) {
        event.action.setFeedback({
            title: "Net Speed",
            value: `D:${download.current.toFixed(0)} U:${upload.current.toFixed(0)}`,
        });
        return;
    }

    event.action.setTitle("Choose\nUpload/Download");
}

function renderNetworkIconFragment(options: { direction: NetworkDirection; color: string }): string {
    if (options.direction === "download") {
        return `
            <g transform="scale(0.72)" fill="none" stroke="${options.color}" stroke-linecap="round" stroke-linejoin="round">
                <path d="M 0 -13 L 0 5" stroke-width="5" />
                <path d="M -9 -3 L 0 7 L 9 -3" stroke-width="5" />
                <path d="M -13 14 L 13 14" stroke-width="4" opacity="0.86" />
            </g>
        `;
    }

    return `
        <g transform="scale(0.72)" fill="none" stroke="${options.color}" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 0 13 L 0 -5" stroke-width="5" />
            <path d="M -9 3 L 0 -7 L 9 3" stroke-width="5" />
            <path d="M -13 -14 L 13 -14" stroke-width="4" opacity="0.86" />
        </g>
    `;
}
