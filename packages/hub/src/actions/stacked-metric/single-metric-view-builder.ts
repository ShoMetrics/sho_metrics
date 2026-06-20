import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../../runtime/metric-store";
import { diskVolumeRegistry } from "../../runtime/disk-volumes";
import { networkInterfaceRegistry } from "../../runtime/network-interfaces";
import { WINDOWS_HELPER_SOURCE_ID } from "../../runtime/sources/source-ids";
import type { SourceClientStatus } from "../../runtime/sources/source-client";
import {
    type ResolvedMetricTarget,
    type ResolvedSingleMetricWidget,
    type ResolvedWidgetPreferences,
    type ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import type { MetricViewOptions } from "../../view-updates/runner";
import { buildCpuViewOptions } from "../cpu";
import { buildGpuViewOptions } from "../gpu";
import { buildDiskViewOptions } from "../disk/view-builder";
import { buildNetworkViewUpdate } from "../network/view-builder";
import {
    buildCatalogMetricNoSelectionViewOptions,
    buildCatalogMetricSelectedViewOptions,
} from "../catalog-metric";
import { buildMemoryMetricViewOptions } from "../memory";
import type { DiskVolumeSelection } from "../disk/volume-selection";
import { buildCustomMetricViewOptions } from "../custom-metric/single-metric-view-options";
import { buildSystemViewOptions } from "../system/view-builder";

export interface StackedSingleMetricViewBuilderContext {
    readonly event: WillAppearEvent;
    readonly widget: ResolvedSingleMetricWidget;
    readonly preferences: ResolvedWidgetPreferences;
    readonly target: ResolvedMetricTarget;
    readonly metrics: MetricStoreReader;
    readonly platform: NodeJS.Platform;
    readonly currentTimestampMilliseconds: number;
    readonly readCachedSourceStatus: (sourceId: string) => SourceClientStatus | undefined;
    /**
     * Runtime consumer segment for source-backed targets inside the active slot.
     */
    readonly consumerSlug: string;
}

/** Builds an active stacked slot through the canonical single-metric builders. */
export function buildStackedSingleMetricViewOptions(
    context: StackedSingleMetricViewBuilderContext,
): MetricViewOptions {
    const settings = buildSingleMetricSettings(context.widget, context.preferences);

    switch (context.target.domain) {
        case "cpu":
            return buildCpuViewOptions({
                event: context.event,
                settings,
                target: context.target,
                metrics: context.metrics,
                helperStatus: context.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID),
            });
        case "gpu":
            return buildGpuViewOptions({
                event: context.event,
                settings,
                target: context.target,
                metrics: context.metrics,
                helperStatus: context.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID),
            });
        case "memory":
            return buildMemoryMetricViewOptions({
                event: context.event,
                settings,
                target: context.target,
                metrics: context.metrics,
            });
        case "disk":
            return buildDiskViewOptions({
                event: context.event,
                settings,
                target: context.target,
                metrics: context.metrics,
                volumeSelection: resolveStackedDiskVolumeSelection(context.target.volumeId),
            });
        case "network":
            return buildNetworkViewUpdate({
                event: context.event,
                settings,
                target: context.target,
                metrics: context.metrics,
                selectedNetworkInterface: context.target.reading.kind === "traffic"
                    ? networkInterfaceRegistry.resolveSelection(context.target.reading.interfaceId ?? "")
                    : null,
                currentTimestampMilliseconds: context.currentTimestampMilliseconds,
            }).viewOptions;
        case "system":
            return buildSystemViewOptions({
                event: context.event,
                settings,
                target: context.target,
                metrics: context.metrics,
            });
        case "catalog":
            if (context.target.metricId.length === 0) {
                return buildCatalogMetricNoSelectionViewOptions({
                    event: context.event,
                    settings,
                    helperStatus: context.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID),
                    platform: context.platform,
                });
            }

            return buildCatalogMetricSelectedViewOptions({
                event: context.event,
                settings,
                target: context.target,
                metrics: context.metrics,
                helperStatus: context.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID),
            });
        case "customMetric":
            return buildCustomMetricViewOptions({
                event: context.event,
                settings,
                target: context.target,
                metrics: context.metrics,
                consumerSlug: context.consumerSlug,
            });
    }
}

function buildSingleMetricSettings(
    widget: ResolvedSingleMetricWidget,
    preferences: ResolvedWidgetPreferences,
): ResolvedWidgetSettings {
    return {
        widget,
        preferences,
    };
}

function resolveStackedDiskVolumeSelection(volumeId: string | undefined): DiskVolumeSelection {
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
