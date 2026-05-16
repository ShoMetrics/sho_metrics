import { action, PropertyInspectorDidAppearEvent, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import type { MetricStoreReader } from "../runtime/metric-store";
import { scheduler } from "../runtime/scheduler";
import { setMetricDisplay } from "../metric-view-runner/runner";
import { logger } from "../logging/logger";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../runtime/network-interfaces";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    type NetworkDirection,
} from "../runtime/network-metric-keys";
import type { MetricReadPlan } from "../runtime/sources/metric-read-plan";
import { resolveNetworkMetricSubscriptionKeys } from "./network/metric-subscriptions";
import type { ResolvedNetworkMetricTarget } from "../settings/resolved-settings";
import {
    buildNetworkDisplayUpdate,
    resolveNetworkMaximumBytesPerSecond,
    resolveNetworkMaximumMegabitsPerSecond,
    type NetworkDisplayDebugInfo,
} from "./network/view-builder";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";

const log = logger.for("Action:Network");
const NETWORK_INTERFACE_LIST_REFRESH_METRIC_KEYS = [getNetworkAggregateMetricKey("download")] as const;

/**
 * Network action.
 * Circle, linear, and sparkline visuals all support either one network
 * direction or combined download/upload telemetry.
 */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.network })
export class Network extends MetricAction {
    protected readonly actionKind = "network";

    protected override getMetricReadPlan(event: WillAppearEvent): MetricReadPlan {
        const settings = this.resolveSettings(event);
        const networkTarget = readResolvedMetricTarget(settings, "network");
        const metricKeys = resolveNetworkMetricSubscriptionKeys({
            graphicType: settings.widget.slot.appearance.graph.viewLayout,
            networkDirection: networkTarget.reading.direction,
            networkInterfaceId: networkTarget.interfaceId ?? "",
        });

        return this.buildMetricReadPlan(metricKeys);
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const networkTarget = readResolvedMetricTarget(settings, "network");
        const networkInterfaceId = networkTarget.interfaceId ?? "";
        const isAutomaticNetworkInterface = networkInterfaceId.length === 0;
        const selectedNetworkInterface = networkInterfaceRegistry.resolveSelection(networkInterfaceId);
        const metrics = this.getMetricReader(event);

        this.publishNetworkInterfaceOptions(event);
        this.publishNetworkRuntimeMaximum(event, networkTarget, selectedNetworkInterface, metrics);

        const displayUpdate = buildNetworkDisplayUpdate({
            event,
            settings,
            target: networkTarget,
            metrics,
            selectedNetworkInterface,
        });

        if (displayUpdate.debugInfo) {
            logNetworkSpeedDebug({
                target: networkTarget,
                selectedNetworkInterface,
                isAutomaticNetworkInterface,
                debugInfo: displayUpdate.debugInfo,
            });
        }

        setMetricDisplay(displayUpdate.displayOptions);
    }

    protected override refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        scheduler.refreshMetrics(this.buildMetricReadPlan(NETWORK_INTERFACE_LIST_REFRESH_METRIC_KEYS))
            .then(() => {
                this.publishNetworkInterfaceOptions(event);
            })
            .catch(error => {
                log.error(() => `Failed to refresh network interfaces for Property Inspector: ${String(error)}`);
            });
    }

    private publishNetworkInterfaceOptions(event: WillAppearEvent | PropertyInspectorDidAppearEvent): void {
        const availableNetworkInterfaces = [...networkInterfaceRegistry.getOptions()];

        this.updateRuntimeCache(event, {
            availableNetworkInterfaces,
        }).catch(error => {
            log.error(() => `Failed to publish network interfaces: ${String(error)}`);
        });
    }

    private publishNetworkRuntimeMaximum(
        event: WillAppearEvent,
        target: ResolvedNetworkMetricTarget,
        selectedNetworkInterface: NetworkInterfaceOption | null,
        metrics: MetricStoreReader,
    ): void {
        if (target.reading.display.scaleMode === "custom") {
            return;
        }

        const downloadMetricKey = selectedNetworkInterface
            ? getNetworkInterfaceMetricKey("download", selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey("download");
        const uploadMetricKey = selectedNetworkInterface
            ? getNetworkInterfaceMetricKey("upload", selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey("upload");
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

function logNetworkSpeedDebug(options: {
    target: ResolvedNetworkMetricTarget;
    selectedNetworkInterface: NetworkInterfaceOption | null;
    isAutomaticNetworkInterface: boolean;
    debugInfo: NetworkDisplayDebugInfo;
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

function resolveRuntimeNetworkMaximumMegabitsPerSecond(options: {
    direction: NetworkDirection;
    target: ResolvedNetworkMetricTarget;
    observedBytesPerSecond: number;
}): number {
    const currentMaximum = resolveNetworkMaximumMegabitsPerSecond(options.direction, options.target);
    const observedMegabitsPerSecond = (Math.max(0, options.observedBytesPerSecond) * 8) / 1_000_000;
    const runtimeMaximum = Math.ceil(observedMegabitsPerSecond * 1.1);

    return Math.max(currentMaximum, runtimeMaximum);
}
