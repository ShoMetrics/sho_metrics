import { action, PropertyInspectorDidAppearEvent, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import type { MetricStoreReader } from "../runtime/metric-store";
import { setMetricView } from "../view-updates/runner";
import { logger } from "../logging/node-logger";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../runtime/network-interfaces";
import {
    resolveNetworkMetricKey,
    type NetworkMetricDirection,
} from "../runtime/network-metric-keys";
import { resolveNetworkMetricSubscriptionKeys } from "./network/metric-subscriptions";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedNetworkMetricTarget,
} from "../settings/resolved-settings";
import {
    buildNetworkViewUpdate,
    resolveNetworkMaximumBytesPerSecond,
    resolveNetworkMaximumMegabitsPerSecond,
    type NetworkPingViewDebugInfo,
    type NetworkViewDebugInfo,
    type ResolvedNetworkTrafficMetricTarget,
} from "./network/view-builder";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import { wallClockNowMilliseconds } from "../shared/clock";
import {
    NETWORK_INTERFACE_LIST_REFRESH_METRIC_KEYS,
    publishNetworkInterfaceRuntimeCache,
} from "./shared/network-interface-runtime-cache";

const log = logger.for("Action:Network");

/**
 * Network action.
 * Circle, bar, and line views all support either one network
 * direction or combined download/upload telemetry.
 */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.network })
export class Network extends MetricAction {
    protected readonly actionKind = "network";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        const widget = requireResolvedSingleMetricWidget(settings);
        const networkTarget = readResolvedMetricTarget(settings, "network");
        return resolveNetworkMetricSubscriptionKeys({
            selectedView: widget.slot.appearance.view.selectedView,
            reading: networkTarget.reading,
        });
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const networkTarget = readResolvedMetricTarget(settings, "network");
        const networkInterfaceId = networkTarget.reading.kind === "traffic"
            ? networkTarget.reading.interfaceId ?? ""
            : "";
        const isAutomaticNetworkInterface = networkTarget.reading.kind === "traffic"
            && networkInterfaceId.length === 0;
        const selectedNetworkInterface = networkTarget.reading.kind === "traffic"
            ? networkInterfaceRegistry.resolveSelection(networkInterfaceId)
            : null;
        const metrics = this.getMetricReader(event);

        this.publishNetworkInterfaceOptions(event);
        this.publishNetworkRuntimeMaximum(event, networkTarget, metrics);

        const viewUpdate = buildNetworkViewUpdate({
            event,
            settings,
            target: networkTarget,
            metrics,
            selectedNetworkInterface,
            currentTimestampMilliseconds: wallClockNowMilliseconds(),
        });

        if (viewUpdate.debugInfo) {
            logNetworkDebug({
                target: networkTarget,
                selectedNetworkInterface,
                isAutomaticNetworkInterface,
                debugInfo: viewUpdate.debugInfo,
            });
        }

        setMetricView(this.withManualRefreshIndicator(event, viewUpdate.viewOptions));
    }

    protected override refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        this.refreshMetricKeys(event, NETWORK_INTERFACE_LIST_REFRESH_METRIC_KEYS)
            .then(() => {
                this.publishNetworkInterfaceOptions(event);
            })
            .catch(error => {
                log.error(() => `Failed to refresh network interfaces for Property Inspector: ${String(error)}`);
            });
    }

    private publishNetworkInterfaceOptions(event: WillAppearEvent | PropertyInspectorDidAppearEvent): void {
        publishNetworkInterfaceRuntimeCache({
            updateRuntimeCache: patch => this.updateRuntimeCache(event, patch),
        }).catch(error => {
            log.error(() => `Failed to publish network interfaces: ${String(error)}`);
        });
    }

    private publishNetworkRuntimeMaximum(
        event: WillAppearEvent,
        target: ResolvedNetworkMetricTarget,
        metrics: MetricStoreReader,
    ): void {
        if (!isNetworkTrafficMetricTarget(target)) {
            return;
        }

        if (target.reading.display.scaleMode === "custom") {
            return;
        }

        const downloadMetricKey = resolveNetworkMetricKey("download", target.reading.interfaceId);
        const uploadMetricKey = resolveNetworkMetricKey("upload", target.reading.interfaceId);
        const nextDownloadMaximum = resolveRuntimeNetworkMaximumMegabitsPerSecond({
            direction: "download",
            target,
            observedBytesPerSecond: metrics.getWidgetData(
                downloadMetricKey,
                "DOWN",
                "B/s",
            ).current,
        });
        const nextUploadMaximum = resolveRuntimeNetworkMaximumMegabitsPerSecond({
            direction: "upload",
            target,
            observedBytesPerSecond: metrics.getWidgetData(
                uploadMetricKey,
                "UP",
                "B/s",
            ).current,
        });

        this.updateRuntimeCache(event, {
            runtimeMaximumDownloadSpeedMbps: nextDownloadMaximum,
            runtimeMaximumUploadSpeedMbps: nextUploadMaximum,
        }).catch(error => {
            log.error(() => `Failed to publish runtime network maximum: ${String(error)}`);
        });
    }
}

const DEBUG_LOG_INTERVAL_MILLISECONDS = 5000;

function logNetworkDebug(options: {
    target: ResolvedNetworkMetricTarget;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    isAutomaticNetworkInterface: boolean;
    debugInfo: NetworkViewDebugInfo;
}): void {
    if (options.debugInfo.kind === "ping") {
        logNetworkPingDebug(options.debugInfo);
        return;
    }

    if (!isNetworkTrafficMetricTarget(options.target)) {
        return;
    }

    logNetworkSpeedDebug({
        target: options.target,
        selectedNetworkInterface: options.selectedNetworkInterface,
        isAutomaticNetworkInterface: options.isAutomaticNetworkInterface,
        debugInfo: options.debugInfo,
    });
}

function logNetworkSpeedDebug(options: {
    target: ResolvedNetworkTrafficMetricTarget;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    isAutomaticNetworkInterface: boolean;
    debugInfo: Extract<NetworkViewDebugInfo, { readonly kind: "traffic" }>;
}): void {
    log.atDebug().everyMs("speed-sample", DEBUG_LOG_INTERVAL_MILLISECONDS).log(() => [
        `direction=${options.debugInfo.direction}`,
        `metricKey=${options.debugInfo.networkMetricKey}`,
        `selectedInterface=${formatNetworkInterfaceDebugValue(options.selectedNetworkInterface)}`,
        `automaticInterface=${options.isAutomaticNetworkInterface}`,
        `downloadMaxMegabitsPerSecond=${String(
            options.target.reading.display.maximumDownloadSpeedMegabitsPerSecond ?? "",
        )}`,
        `uploadMaxMegabitsPerSecond=${String(
            options.target.reading.display.maximumUploadSpeedMegabitsPerSecond ?? "",
        )}`,
        `resolvedMaxBytesPerSecond=${resolveNetworkMaximumBytesPerSecond(
            options.debugInfo.direction,
            options.target,
        ).toFixed(0)}`,
        `detectedAutomaticMaxMbps=${String(networkInterfaceRegistry.resolveMaximumAutomaticSpeedMegabitsPerSecond() ?? "")}`,
        `currentBytesPerSecond=${options.debugInfo.sourceWidgetData.current.toFixed(0)}`,
        `progress=${options.debugInfo.viewWidgetData.progress.toFixed(4)}`,
        `availableInterfaces=${JSON.stringify(networkInterfaceRegistry.getOptions())}`,
    ].join(" "));
}

function logNetworkPingDebug(debugInfo: NetworkPingViewDebugInfo): void {
    log.atDebug().everyMs("ping-sample", DEBUG_LOG_INTERVAL_MILLISECONDS).log(() => [
        `targetHost=${debugInfo.targetHost}`,
        `metricKey=${debugInfo.networkMetricKey}`,
        `currentLatencyMilliseconds=${debugInfo.sourceWidgetData.current.toFixed(0)}`,
        `progress=${debugInfo.viewWidgetData.progress.toFixed(4)}`,
        `sampleTimestampMilliseconds=${String(debugInfo.viewWidgetData.sampleTimestampMilliseconds ?? "")}`,
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

function resolveRuntimeNetworkMaximumMegabitsPerSecond(options: {
    direction: NetworkMetricDirection;
    target: ResolvedNetworkTrafficMetricTarget;
    observedBytesPerSecond: number;
}): number {
    const currentMaximum = resolveNetworkMaximumMegabitsPerSecond(options.direction, options.target);
    const observedMegabitsPerSecond = (Math.max(0, options.observedBytesPerSecond) * 8) / 1_000_000;
    const runtimeMaximum = Math.ceil(observedMegabitsPerSecond * 1.1);

    return Math.max(currentMaximum, runtimeMaximum);
}

function isNetworkTrafficMetricTarget(target: ResolvedNetworkMetricTarget): target is ResolvedNetworkTrafficMetricTarget {
    return target.reading.kind === "traffic";
}
