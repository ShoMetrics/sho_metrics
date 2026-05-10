import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setMetricDisplay } from "./metric-display-runner";
import { logger } from "../logging/logger";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../runtime/network-interfaces";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    type NetworkDirection,
} from "../runtime/network-metric-keys";
import { resolveNetSpeedMetricSubscriptionKeys } from "./net-speed-metric-subscriptions";
import type { ResolvedWidgetSettings } from "../settings/widget-settings";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    buildNetworkDisplayUpdate,
    resolveNetworkMaximumBytesPerSecond,
    resolveNetworkMaximumMegabitsPerSecond,
    type NetworkDisplayDebugInfo,
} from "./net-speed-display";

const log = logger.for("Action:NetSpeed");

/**
 * Network Speed action.
 * Circle, linear, and sparkline visuals all support either one network
 * direction or combined download/upload telemetry.
 */
@action({ UUID: "com.ez.sho-metrics.net-speed" })
export class NetSpeed extends MetricAction {
    protected readonly actionKind = "net-speed";

    protected override getMetricSubscriptionKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        return resolveNetSpeedMetricSubscriptionKeys({
            graphicType: settings.appearance.graphicType,
            networkDirection: settings.metric.networkDirection,
            networkInterfaceId: settings.metric.networkInterfaceId,
        });
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const isAutomaticNetworkInterface = settings.metric.networkInterfaceId.length === 0;
        const selectedNetworkInterface = resolveNetworkInterface(settings.metric.networkInterfaceId);

        this.publishNetworkInterfaceOptions(event);
        this.publishNetworkScaleLearning(event, settings, selectedNetworkInterface);

        const displayUpdate = buildNetworkDisplayUpdate({
            event,
            settings,
            globalSettings: pluginGlobalSettingsStore.getResolved(),
            metricStore,
            selectedNetworkInterface,
        });

        if (displayUpdate.debugInfo) {
            logNetworkSpeedDebug({
                settings,
                selectedNetworkInterface,
                isAutomaticNetworkInterface,
                debugInfo: displayUpdate.debugInfo,
            });
        }

        setMetricDisplay(displayUpdate.displayOptions);
    }

    private publishNetworkInterfaceOptions(event: WillAppearEvent): void {
        const availableNetworkInterfaces = [...networkInterfaceRegistry.getOptions()];

        this.updateRuntimeCache(event, {
            availableNetworkInterfaces,
        }).catch(error => {
            log.error(() => `Failed to publish network interfaces: ${String(error)}`);
        });
    }

    private publishNetworkScaleLearning(
        event: WillAppearEvent,
        settings: ResolvedWidgetSettings,
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
        });
        const nextUploadMaximum = resolveLearnedNetworkMaximumMegabitsPerSecond({
            direction: "upload",
            settings,
            observedBytesPerSecond: metricStore.getWidgetData(uploadMetricKey, "UP", "B/s").current,
        });

        this.updateRuntimeCache(event, {
            learnedMaximumDownloadSpeedMbps: nextDownloadMaximum,
            learnedMaximumUploadSpeedMbps: nextUploadMaximum,
        }).catch(error => {
            log.error(() => `Failed to publish learned network scale: ${String(error)}`);
        });
    }
}

const DEBUG_LOG_INTERVAL_MILLISECONDS = 5000;

function resolveNetworkInterface(value: string): NetworkInterfaceOption | null {
    if (value.length > 0) {
        return networkInterfaceRegistry.findById(value);
    }

    return networkInterfaceRegistry.resolveAutomaticSelection();
}

function logNetworkSpeedDebug(options: {
    settings: ResolvedWidgetSettings;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    isAutomaticNetworkInterface: boolean;
    debugInfo: NetworkDisplayDebugInfo;
}): void {
    log.atDebug().everyMs("speed-sample", DEBUG_LOG_INTERVAL_MILLISECONDS).log(() => [
        `direction=${options.debugInfo.direction}`,
        `metricKey=${options.debugInfo.networkMetricKey}`,
        `selectedInterface=${formatNetworkInterfaceDebugValue(options.selectedNetworkInterface)}`,
        `automaticInterface=${options.isAutomaticNetworkInterface}`,
        `downloadMaxMbps=${String(options.settings.network.maximumDownloadSpeedMbps ?? "")}`,
        `uploadMaxMbps=${String(options.settings.network.maximumUploadSpeedMbps ?? "")}`,
        `resolvedMaxBytesPerSecond=${resolveNetworkMaximumBytesPerSecond(
            options.debugInfo.direction,
            options.settings,
        ).toFixed(0)}`,
        `detectedAutomaticMaxMbps=${String(networkInterfaceRegistry.resolveMaximumAutomaticSpeedMegabitsPerSecond() ?? "")}`,
        `currentBytesPerSecond=${options.debugInfo.sourceWidgetData.current.toFixed(0)}`,
        `progress=${options.debugInfo.displayWidgetData.progress.toFixed(4)}`,
        `availableInterfaces=${JSON.stringify(networkInterfaceRegistry.getOptions())}`,
    ].join(" "));
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

function resolveLearnedNetworkMaximumMegabitsPerSecond(options: {
    direction: NetworkDirection;
    settings: ResolvedWidgetSettings;
    observedBytesPerSecond: number;
}): number {
    const currentMaximum = resolveNetworkMaximumMegabitsPerSecond(options.direction, options.settings);
    const observedMegabitsPerSecond = (Math.max(0, options.observedBytesPerSecond) * 8) / 1_000_000;
    const learnedMaximum = Math.ceil(observedMegabitsPerSecond * 1.1);

    return Math.max(currentMaximum, learnedMaximum);
}
