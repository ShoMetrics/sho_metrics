import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setMetricDisplay } from "./metric-display-runner";
import { logger } from "../logging/logger";
import { diskVolumeRegistry, type DiskVolumeOption } from "../runtime/disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
    type DiskThroughputDirection,
} from "../runtime/disk-metric-keys";
import { resolveDiskMetricSubscriptionKeys } from "./disk-metric-subscriptions";
import type { ResolvedWidgetSettings } from "../settings/widget-settings";
import { updateWidgetRuntimeCache } from "../settings/updates";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    buildDiskDisplayOptions,
    resolveDiskMaximumThroughputMebibytesPerSecond,
} from "./disk-display";

const log = logger.for("Action:Disk");

@action({ UUID: "com.ez.sho-metrics.disk" })
export class Disk extends MetricAction {
    protected readonly actionKind = "disk";

    protected override getMetricSubscriptionKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        const metricKind = settings.metric.diskMetricKind;

        if (metricKind === "throughput") {
            return resolveDiskMetricSubscriptionKeys({
                diskMetricKind: settings.metric.diskMetricKind,
                graphicType: settings.appearance.graphicType,
                diskThroughputDirection: settings.metric.diskThroughputDirection,
            });
        }

        const selectedVolume = resolveSelectedDiskVolume(settings.metric.diskVolumeId);

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
        const selectedVolume = resolveSelectedDiskVolume(settings.metric.diskVolumeId);

        this.publishDiskVolumeOptions(event);
        this.publishDiskThroughputScaleLearning(event, settings, selectedVolume);

        if (settings.metric.diskMetricKind === "throughput" && process.platform !== "darwin") {
            showDiskThroughputUnavailable(event);
            return;
        }

        setMetricDisplay(buildDiskDisplayOptions({
            event,
            settings,
            globalSettings: pluginGlobalSettingsStore.getResolved(),
            metricStore,
            selectedVolume,
        }));
    }

    private publishDiskVolumeOptions(event: WillAppearEvent): void {
        const availableDiskVolumes = [...diskVolumeRegistry.getOptions()];

        const storedSettings = this.readStoredSettings(event);

        // TODO(settings-contract): Temporary pre-proto/pre-Zod deep compare. Move this to the codec/schema layer
        // when persisted settings get a real contract.
        if (JSON.stringify(storedSettings.runtimeCache?.availableDiskVolumes ?? []) === JSON.stringify(availableDiskVolumes)) {
            return;
        }

        this.writeStoredSettings(event, updateWidgetRuntimeCache(storedSettings, {
            availableDiskVolumes,
        })).catch(error => {
            log.error(() => `Failed to publish disk volumes: ${String(error)}`);
        });
    }

    private publishDiskThroughputScaleLearning(
        event: WillAppearEvent,
        settings: ResolvedWidgetSettings,
        selectedVolume: DiskVolumeOption | null,
    ): void {
        if (
            settings.metric.diskMetricKind !== "throughput"
            || settings.diskThroughput.diskThroughputScaleMode === "custom"
        ) {
            return;
        }

        const nextReadMaximum = resolveLearnedDiskMaximumThroughputMebibytesPerSecond({
            direction: "read",
            settings,
            selectedVolume,
            observedBytesPerSecond: metricStore.getWidgetData(getDiskThroughputMetricKey("read"), "READ", "B/s").current,
        });
        const nextWriteMaximum = resolveLearnedDiskMaximumThroughputMebibytesPerSecond({
            direction: "write",
            settings,
            selectedVolume,
            observedBytesPerSecond: metricStore.getWidgetData(getDiskThroughputMetricKey("write"), "WRIT", "B/s").current,
        });

        const storedSettings = this.readStoredSettings(event);

        if (
            storedSettings.runtimeCache?.learnedMaximumDiskReadThroughputMebibytesPerSecond === nextReadMaximum
            && storedSettings.runtimeCache?.learnedMaximumDiskWriteThroughputMebibytesPerSecond === nextWriteMaximum
        ) {
            return;
        }

        this.writeStoredSettings(event, updateWidgetRuntimeCache(storedSettings, {
            learnedMaximumDiskReadThroughputMebibytesPerSecond: nextReadMaximum,
            learnedMaximumDiskWriteThroughputMebibytesPerSecond: nextWriteMaximum,
        })).catch(error => {
            log.error(() => `Failed to publish learned disk throughput scale: ${String(error)}`);
        });
    }
}

function resolveSelectedDiskVolume(value: string): DiskVolumeOption | null {
    if (value.length > 0) {
        return diskVolumeRegistry.findById(value);
    }

    return diskVolumeRegistry.resolveDefaultSelection();
}

function resolveLearnedDiskMaximumThroughputMebibytesPerSecond(options: {
    direction: Exclude<DiskThroughputDirection, "both" | "total">;
    settings: ResolvedWidgetSettings;
    selectedVolume: DiskVolumeOption | null;
    observedBytesPerSecond: number;
}): number {
    const currentMaximum = resolveDiskMaximumThroughputMebibytesPerSecond(
        options.direction,
        options.settings,
        options.selectedVolume,
    );
    const observedMebibytesPerSecond = Math.max(0, options.observedBytesPerSecond) / 1024 / 1024;
    const learnedMaximum = Math.ceil(observedMebibytesPerSecond * 1.1);

    return Math.max(currentMaximum, learnedMaximum);
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
