import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setMetricDisplay } from "../metric-view-runner/runner";
import { logger } from "../logging/logger";
import { diskVolumeRegistry, type DiskVolumeOption } from "../runtime/disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
    type DiskThroughputDirection,
} from "../runtime/disk-metric-keys";
import { resolveDiskMetricSubscriptionKeys } from "./disk/metric-subscriptions";
import type { ResolvedDiskMetricTarget, ResolvedWidgetSettings } from "../settings/resolved-settings";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    buildDiskDisplayOptions,
    resolveDiskMaximumThroughputMebibytesPerSecond,
} from "./disk/view-builder";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";

const log = logger.for("Action:Disk");

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.disk })
export class Disk extends MetricAction {
    protected readonly actionKind = "disk";

    protected override getMetricSubscriptionKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        const diskTarget = readDiskTarget(settings);
        const metricKind = diskTarget.reading.kind;

        if (metricKind === "throughput") {
            return resolveDiskMetricSubscriptionKeys({
                diskMetricKind: metricKind,
                graphicType: settings.widget.slot.appearance.viewLayout,
                diskThroughputDirection: diskTarget.reading.direction,
            });
        }

        const selectedVolume = resolveSelectedDiskVolume(diskTarget.volumeId);

        return selectedVolume
            ? [
                getDiskVolumeMetricKey("used", selectedVolume.id),
                getDiskVolumeMetricKey("total", selectedVolume.id),
                getDiskVolumeMetricKey("available", selectedVolume.id),
            ]
            : [
                getDefaultDiskUsageMetricKey("used"),
                getDefaultDiskUsageMetricKey("total"),
                getDefaultDiskUsageMetricKey("available"),
            ];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const diskTarget = readDiskTarget(settings);
        const selectedVolume = resolveSelectedDiskVolume(diskTarget.volumeId);

        this.publishDiskVolumeOptions(event);
        this.publishDiskThroughputRuntimeMaximum(event, diskTarget, selectedVolume);

        if (diskTarget.reading.kind === "throughput" && process.platform !== "darwin") {
            showDiskThroughputUnavailable(event);
            return;
        }

        setMetricDisplay(buildDiskDisplayOptions({
            event,
            settings,
            target: diskTarget,
            globalSettings: pluginGlobalSettingsStore.getResolved(),
            metricStore,
            selectedVolume,
        }));
    }

    private publishDiskVolumeOptions(event: WillAppearEvent): void {
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
        selectedVolume: DiskVolumeOption | null,
    ): void {
        const diskReading = diskTarget.reading;
        if (
            diskReading.kind !== "throughput"
            || diskReading.display.scaleMode === "custom"
        ) {
            return;
        }

        const nextReadMaximum = resolveRuntimeDiskMaximumThroughputMebibytesPerSecond({
            direction: "read",
            reading: diskReading,
            selectedVolume,
            observedBytesPerSecond: metricStore.getWidgetData(getDiskThroughputMetricKey("read"), "READ", "B/s").current,
        });
        const nextWriteMaximum = resolveRuntimeDiskMaximumThroughputMebibytesPerSecond({
            direction: "write",
            reading: diskReading,
            selectedVolume,
            observedBytesPerSecond: metricStore.getWidgetData(getDiskThroughputMetricKey("write"), "WRIT", "B/s").current,
        });

        this.updateRuntimeCache(event, {
            runtimeMaximumDiskReadThroughputMebibytesPerSecond: nextReadMaximum,
            runtimeMaximumDiskWriteThroughputMebibytesPerSecond: nextWriteMaximum,
        }).catch(error => {
            log.error(() => `Failed to publish runtime disk throughput maximum: ${String(error)}`);
        });
    }
}

function readDiskTarget(settings: ResolvedWidgetSettings): ResolvedDiskMetricTarget {
    const target = settings.widget.slot.metric.target;

    if (target.domain !== "disk") {
        throw new Error("Expected disk metric settings.");
    }

    return target;
}

function resolveSelectedDiskVolume(value: string | undefined): DiskVolumeOption | null {
    if (value && value.length > 0) {
        return diskVolumeRegistry.findById(value);
    }

    return diskVolumeRegistry.resolveDefaultSelection();
}

function resolveRuntimeDiskMaximumThroughputMebibytesPerSecond(options: {
    direction: Exclude<DiskThroughputDirection, "both" | "total">;
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

function showDiskThroughputUnavailable(event: WillAppearEvent): void {
    if (event.action.isDial()) {
        event.action.setFeedback({
            title: "Disk",
            value: "N/A",
        });
        return;
    }

    event.action.setTitle("Disk\nN/A");
}
