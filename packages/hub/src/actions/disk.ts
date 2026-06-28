import { action, PropertyInspectorDidAppearEvent, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import type { MetricStoreReader } from "../runtime/metric-store";
import { setMetricView } from "../view-updates/runner";
import { logger } from "../logging/logger";
import { diskVolumeRegistry, type DiskVolumeOption } from "../runtime/disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    type DiskThroughputMetricDirection,
} from "../runtime/disk-metric-keys";
import {
    resolveDiskMetricSubscriptionKeys,
    resolveDiskUsageMetricSubscriptionKeys,
} from "./disk/metric-subscriptions";
import type { ResolvedDiskMetricTarget } from "../settings/resolved-settings";
import {
    buildDiskViewOptions,
    resolveDiskMaximumThroughputMebibytesPerSecond,
} from "./disk/view-builder";
import {
    resolveAvailableDiskVolume,
    type DiskVolumeSelection,
} from "./disk/volume-selection";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";

const log = logger.for("Action:Disk");
const DISK_USAGE_REFRESH_METRIC_KEYS = [
    getDefaultDiskUsageMetricKey("used"),
    getDefaultDiskUsageMetricKey("total"),
    getDefaultDiskUsageMetricKey("available"),
] as const;

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.disk })
export class Disk extends MetricAction {
    protected readonly actionKind = "disk";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        const diskTarget = readResolvedMetricTarget(settings, "disk");
        const metricKind = diskTarget.reading.kind;

        if (metricKind === "throughput") {
            return resolveDiskMetricSubscriptionKeys({
                diskMetricKind: metricKind,
                diskThroughputDirection: diskTarget.reading.direction,
            });
        }

        return resolveDiskUsageMetricSubscriptionKeys(diskTarget.volumeId);
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const diskTarget = readResolvedMetricTarget(settings, "disk");
        const volumeSelection = resolveDiskVolumeSelectionForTarget(diskTarget);
        const metrics = this.getMetricReader(event);

        this.publishDiskVolumeOptions(event);
        this.publishDiskThroughputRuntimeMaximum(event, diskTarget, volumeSelection, metrics);

        setMetricView(this.withManualRefreshIndicator(event, buildDiskViewOptions({
            event,
            settings,
            target: diskTarget,
            metrics,
            volumeSelection,
        })));
    }

    protected override refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        this.refreshMetricKeys(event, DISK_USAGE_REFRESH_METRIC_KEYS)
            .then(() => {
                this.publishDiskVolumeOptions(event);
            })
            .catch(error => {
                log.error(() => `Failed to refresh disk volumes for Property Inspector: ${String(error)}`);
            });
    }

    private publishDiskVolumeOptions(event: WillAppearEvent | PropertyInspectorDidAppearEvent): void {
        const availableDiskVolumes = [...diskVolumeRegistry.getOptions()];

        this.updateRuntimeCache(event, {
            availableDiskVolumes,
        }).catch(error => {
            log.error(() => `Failed to publish disk volumes: ${String(error)}`);
        });
    }

    private publishDiskThroughputRuntimeMaximum(
        event: WillAppearEvent,
        diskTarget: ResolvedDiskMetricTarget,
        volumeSelection: DiskVolumeSelection,
        metrics: MetricStoreReader,
    ): void {
        const diskReading = diskTarget.reading;
        if (
            diskReading.kind !== "throughput"
            || diskReading.display.scaleMode === "custom"
        ) {
            return;
        }

        const selectedVolume = resolveAvailableDiskVolume(volumeSelection);
        const nextReadMaximum = resolveRuntimeDiskMaximumThroughputMebibytesPerSecond({
            direction: "read",
            reading: diskReading,
            selectedVolume,
            observedBytesPerSecond: metrics.getWidgetData(
                getDiskThroughputMetricKey("read"),
                "READ",
                "B/s",
            ).current,
        });
        const nextWriteMaximum = resolveRuntimeDiskMaximumThroughputMebibytesPerSecond({
            direction: "write",
            reading: diskReading,
            selectedVolume,
            observedBytesPerSecond: metrics.getWidgetData(
                getDiskThroughputMetricKey("write"),
                "WRIT",
                "B/s",
            ).current,
        });

        this.updateRuntimeCache(event, {
            runtimeMaximumDiskReadThroughputMebibytesPerSecond: nextReadMaximum,
            runtimeMaximumDiskWriteThroughputMebibytesPerSecond: nextWriteMaximum,
        }).catch(error => {
            log.error(() => `Failed to publish runtime disk throughput maximum: ${String(error)}`);
        });
    }
}

function resolveDiskVolumeSelectionForTarget(diskTarget: ResolvedDiskMetricTarget): DiskVolumeSelection {
    if (diskTarget.reading.kind === "throughput") {
        return { kind: "none" };
    }

    return resolveDiskVolumeSelection(diskTarget.volumeId);
}

function resolveDiskVolumeSelection(volumeId: string | undefined): DiskVolumeSelection {
    if (volumeId && volumeId.length > 0) {
        const selectedVolume = diskVolumeRegistry.findById(volumeId);

        return selectedVolume
            ? { kind: "available", volume: selectedVolume }
            : { kind: "unavailable", volumeId };
    }

    const defaultVolume = diskVolumeRegistry.resolveDefaultSelection();

    return defaultVolume
        ? { kind: "available", volume: defaultVolume }
        : { kind: "none" };
}

function resolveRuntimeDiskMaximumThroughputMebibytesPerSecond(options: {
    direction: DiskThroughputMetricDirection;
    reading: Extract<ResolvedDiskMetricTarget["reading"], { readonly kind: "throughput" }>;
    selectedVolume: DiskVolumeOption | null;
    observedBytesPerSecond: number;
}): number {
    const currentMaximum = resolveDiskMaximumThroughputMebibytesPerSecond(
        options.direction,
        options.reading,
        options.selectedVolume,
    );
    const observedMebibytesPerSecond = Math.max(0, options.observedBytesPerSecond) / 1024 / 1024;
    const runtimeMaximum = Math.ceil(observedMebibytesPerSecond * 1.1);

    return Math.max(currentMaximum, runtimeMaximum);
}
