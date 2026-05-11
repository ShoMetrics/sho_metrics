import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStore } from "../../runtime/metric-store";
import type { DiskVolumeOption } from "../../runtime/disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
    type DiskThroughputDirection,
} from "../../runtime/disk-metric-keys";
import { buildDiskThroughputWidgetData, buildDiskUsageWidgetData } from "../../metrics/storage-widget-data";
import type {
    ResolvedGlobalSettings,
    ResolvedWidgetSettings,
} from "../../settings/widget-settings";
import { resolveColorForThresholdValue, type ColorConfig } from "../../rendering/color-resolver";
import { buildGlobalChannelColorConfig } from "../../settings/global-appearance";
import { getDiskIcon, getDiskIconFragment, renderCenteredHardwareIconFragment } from "../../widgets/icons/hardware-icons";
import { renderDiskThroughputDirectionIconFragment } from "../../widgets/icons/catalog/disk";
import { getMetricStatusIcon } from "../../widgets/icons/metric-status-icons";
import { ARC_GAUGE_LABELS } from "../../widgets/primitives/arc-gauge-label";
import { escapeSvgText } from "../../rendering/svg-utils";
import {
    isDualDiskThroughputDisplay,
    normalizeDiskThroughputDisplayDirection,
    resolveSingleDiskThroughputDirection,
} from "./metric-subscriptions";
import type { MetricDisplayOptions } from "../../metric-view-runner/display-model";
import { buildColorConfigFromRamp } from "../shared/channel-color-config";

interface BuildDiskDisplayOptions {
    event: WillAppearEvent;
    settings: ResolvedWidgetSettings;
    globalSettings: ResolvedGlobalSettings;
    metricStore: MetricStore;
    selectedVolume: DiskVolumeOption | null;
}

export function buildDiskDisplayOptions(options: BuildDiskDisplayOptions): MetricDisplayOptions {
    if (options.settings.metric.diskMetricKind === "throughput") {
        return buildDiskThroughputDisplayOptions(options);
    }

    return buildDiskUsageDisplayOptions(options);
}

export function formatAsCompactDiskVolumeLabel(diskVolume: DiskVolumeOption): string {
    const mountLabel = diskVolume.mount || diskVolume.fs || ARC_GAUGE_LABELS.disk;

    if (/^[A-Z]:\\?$/i.test(mountLabel)) {
        return mountLabel.slice(0, 2).toUpperCase();
    }

    return mountLabel.slice(0, 4).toUpperCase();
}

export function resolveDiskMaximumThroughputMebibytesPerSecond(
    direction: Exclude<DiskThroughputDirection, "both" | "total">,
    settings: ResolvedWidgetSettings,
    selectedVolume: DiskVolumeOption | null,
): number {
    const configuredMaximum = direction === "read"
        ? settings.diskThroughput.maximumDiskReadThroughputMebibytesPerSecond
        : settings.diskThroughput.maximumDiskWriteThroughputMebibytesPerSecond;

    if (configuredMaximum !== undefined && configuredMaximum > 0) {
        return configuredMaximum;
    }

    return resolveDefaultDiskMaximumThroughputMebibytesPerSecond(direction, selectedVolume);
}

function buildDiskUsageDisplayOptions(options: BuildDiskDisplayOptions): MetricDisplayOptions {
    const usedMetricKey = options.selectedVolume
        ? getDiskVolumeMetricKey("used", options.selectedVolume.id)
        : getDefaultDiskUsageMetricKey("used");
    const totalMetricKey = options.selectedVolume
        ? getDiskVolumeMetricKey("total", options.selectedVolume.id)
        : getDefaultDiskUsageMetricKey("total");
    const availableMetricKey = options.selectedVolume
        ? getDiskVolumeMetricKey("available", options.selectedVolume.id)
        : getDefaultDiskUsageMetricKey("available");
    const label = options.selectedVolume ? formatAsCompactDiskVolumeLabel(options.selectedVolume) : ARC_GAUGE_LABELS.disk;
    const usedBytesWidgetData = options.metricStore.getWidgetData(usedMetricKey, label, "B");
    const totalBytesWidgetData = options.metricStore.getWidgetData(totalMetricKey, label, "B");
    const availableBytesWidgetData = options.metricStore.getWidgetData(availableMetricKey, label, "B");
    const effectiveGraphicType = options.settings.appearance.graphicType;
    const circleStyle = options.settings.appearance.circleStyle;
    const shouldRenderGauge = effectiveGraphicType === "circular" && circleStyle === "gauge";

    return {
        event: options.event,
        resolvedSettings: options.settings.appearance,
        metricKey: usedMetricKey,
        widgetData: buildDiskUsageWidgetData({
            usedBytesWidgetData,
            totalBytes: totalBytesWidgetData.current,
            availableBytes: availableBytesWidgetData.current,
            displayMode: options.settings.local.diskUsageDisplayMode,
            label,
            linearLabel: resolveDiskLinearLabel(options.settings.local.diskLinearLabel, options.selectedVolume, label),
        }),
        centerIconFragment: buildDiskCenterIconFragment(options.selectedVolume),
        footerIconFragment: shouldRenderGauge ? undefined : buildDiskGaugeFooterIconFragment(options.selectedVolume),
        linearIconFragment: getDiskIconFragment(options.selectedVolume?.storageKind ?? "unknown"),
        statusIcon: getMetricStatusIcon("percentage"),
        circleStyleOverride: circleStyle,
    };
}

function buildDiskThroughputDisplayOptions(options: BuildDiskDisplayOptions): MetricDisplayOptions {
    const throughputDirection = normalizeDiskThroughputDisplayDirection(options.settings.metric.diskThroughputDirection);
    const effectiveGraphicType = options.settings.appearance.graphicType;

    if (isDualDiskThroughputDisplay(effectiveGraphicType, throughputDirection)) {
        return buildDualThroughputDisplayOptions(options);
    }

    const singleThroughputDirection = resolveSingleDiskThroughputDirection(throughputDirection);
    const throughputMetricKey = getDiskThroughputMetricKey(singleThroughputDirection);
    const throughputLabel = options.selectedVolume
        ? formatAsCompactDiskVolumeLabel(options.selectedVolume)
        : ARC_GAUGE_LABELS.disk;
    const bytesPerSecondWidgetData = options.metricStore.getWidgetData(throughputMetricKey, throughputLabel, "B/s");
    const circleStyle = options.settings.appearance.circleStyle;
    const shouldRenderGaugeFooter = effectiveGraphicType === "circular" && circleStyle === "gauge";

    return {
        event: options.event,
        resolvedSettings: options.settings.appearance,
        metricKey: throughputMetricKey,
        widgetData: buildDiskThroughputWidgetData({
            bytesPerSecondWidgetData,
            maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond(
                singleThroughputDirection,
                options.settings,
                options.selectedVolume,
            ),
            label: throughputLabel,
        }),
        centerIconFragment: getDiskIconFragment("unknown"),
        footerIconFragment: shouldRenderGaugeFooter
            ? buildDiskThroughputFooterIconFragment(singleThroughputDirection)
            : undefined,
        statusIcon: getMetricStatusIcon("percentage"),
        circleStyleOverride: circleStyle,
        visualSettingsOverride: {
            colorMode: options.settings.appearance.colorMode,
            usageColors: {
                solidColor: options.settings.appearance.usageColors.solidColor,
            },
        },
    };
}

function buildDualThroughputDisplayOptions(options: BuildDiskDisplayOptions): MetricDisplayOptions {
    const readMetricKey = getDiskThroughputMetricKey("read");
    const writeMetricKey = getDiskThroughputMetricKey("write");
    const effectiveGraphicType = options.settings.appearance.graphicType;
    const dualGraphicType = effectiveGraphicType === "circular"
        ? "circular"
        : effectiveGraphicType === "text" ? "text" : undefined;
    const readWidgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: options.metricStore.getWidgetData(readMetricKey, "READ", "B/s"),
        maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("read", options.settings, options.selectedVolume),
        label: "READ",
    });
    const writeWidgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: options.metricStore.getWidgetData(writeMetricKey, "WRIT", "B/s"),
        maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("write", options.settings, options.selectedVolume),
        label: "WRIT",
    });
    const readColor = resolveDiskWidgetChannelColor("read", options.settings, options.globalSettings, readWidgetData);
    const writeColor = resolveDiskWidgetChannelColor("write", options.settings, options.globalSettings, writeWidgetData);
    const readColorConfig = buildDiskChannelColorConfig("read", options.settings, options.globalSettings);
    const writeColorConfig = buildDiskChannelColorConfig("write", options.settings, options.globalSettings);

    return {
        event: options.event,
        resolvedSettings: options.settings.appearance,
        metricKey: `${readMetricKey},${writeMetricKey}`,
        dualGraphicType,
        widgetData: {
            positive: readWidgetData,
            negative: writeWidgetData,
        },
        titleText: "DISK",
        centerIconFragment: getDiskIconFragment("unknown"),
        statusIcon: getMetricStatusIcon("percentage"),
        circleStyleOverride: dualGraphicType === "circular"
            ? options.settings.appearance.circleStyle
            : undefined,
        positiveColor: readColor,
        negativeColor: writeColor,
        positiveColorConfig: readColorConfig,
        negativeColorConfig: writeColorConfig,
        positiveIconFragment: renderDiskThroughputDirectionIconFragment({
            direction: "read",
            color: readColor,
            size: DISK_THROUGHPUT_DIRECTION_ICON_SIZE,
        }),
        negativeIconFragment: renderDiskThroughputDirectionIconFragment({
            direction: "write",
            color: writeColor,
            size: DISK_THROUGHPUT_DIRECTION_ICON_SIZE,
        }),
        visualSettingsOverride: {
            colorMode: "solid",
            usageColors: { solidColor: readColor },
        },
    };
}

function buildDiskLinearLabel(diskVolume: DiskVolumeOption | null, fallbackLabel: string): string {
    if (!diskVolume) {
        return fallbackLabel;
    }

    const storageKind = resolveCompactDiskStorageLabel(diskVolume);
    const volumeLabel = formatAsCompactDiskVolumeLabel(diskVolume);

    return `${storageKind} (${volumeLabel})`;
}

function resolveDiskLinearLabel(
    customLinearLabel: string,
    diskVolume: DiskVolumeOption | null,
    fallbackLabel: string,
): string {
    const normalizedLinearLabel = customLinearLabel.trim();

    if (normalizedLinearLabel.length > 0) {
        return normalizedLinearLabel;
    }

    return buildDiskLinearLabel(diskVolume, fallbackLabel);
}

function resolveCompactDiskStorageLabel(diskVolume: DiskVolumeOption): string {
    if (diskVolume.storageKind === "ssd") {
        return "SSD";
    }

    if (diskVolume.storageKind === "hdd") {
        return "HDD";
    }

    if (diskVolume.storageKind === "network") {
        return "NET";
    }

    return "DSK";
}

function buildDiskCenterIconFragment(diskVolume: DiskVolumeOption | null): string {
    const icon = getDiskIcon(diskVolume?.storageKind ?? "unknown");
    const volumeLabel = diskVolume ? formatAsCompactDiskVolumeLabel(diskVolume) : ARC_GAUGE_LABELS.disk;

    return `
        <g transform="translate(0 -10)">
            ${renderCenteredHardwareIconFragment(icon, 45)}
        </g>
        <text x="0" y="34" text-anchor="middle"
            dominant-baseline="middle"
            font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
            font-size="26" font-weight="850" fill="rgba(255,255,255,0.94)">${escapeSvgText(volumeLabel)}</text>
    `;
}

function buildDiskGaugeFooterIconFragment(diskVolume: DiskVolumeOption | null): string {
    return renderCenteredHardwareIconFragment(
        getDiskIcon(diskVolume?.storageKind ?? "unknown"),
        DISK_GAUGE_FOOTER_ICON_SIZE,
    );
}

function buildDiskThroughputFooterIconFragment(direction: DiskThroughputDirection): string | undefined {
    if (direction !== "read" && direction !== "write") {
        return undefined;
    }

    return renderDiskThroughputDirectionIconFragment({
        direction,
        color: DISK_THROUGHPUT_DIRECTION_ICON_COLOR,
        size: DISK_THROUGHPUT_DIRECTION_ICON_SIZE,
    });
}

function resolveDiskMaximumThroughputBytesPerSecond(
    direction: DiskThroughputDirection,
    settings: ResolvedWidgetSettings,
    selectedVolume: DiskVolumeOption | null,
): number {
    const maximumReadMebibytesPerSecond = resolveDiskMaximumThroughputMebibytesPerSecond("read", settings, selectedVolume);
    const maximumWriteMebibytesPerSecond = resolveDiskMaximumThroughputMebibytesPerSecond("write", settings, selectedVolume);
    const maximumMebibytesPerSecond = direction === "write"
        ? maximumWriteMebibytesPerSecond
        : direction === "total"
            ? maximumReadMebibytesPerSecond + maximumWriteMebibytesPerSecond
            : maximumReadMebibytesPerSecond;

    return maximumMebibytesPerSecond * 1024 * 1024;
}

function resolveDefaultDiskMaximumThroughputMebibytesPerSecond(
    direction: Exclude<DiskThroughputDirection, "both" | "total">,
    selectedVolume: DiskVolumeOption | null,
): number {
    if (selectedVolume?.storageKind === "hdd") {
        return direction === "read"
            ? DEFAULT_HDD_READ_THROUGHPUT_MEBIBYTES_PER_SECOND
            : DEFAULT_HDD_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND;
    }

    if (selectedVolume?.storageKind === "ssd") {
        return direction === "read"
            ? DEFAULT_SSD_READ_THROUGHPUT_MEBIBYTES_PER_SECOND
            : DEFAULT_SSD_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND;
    }

    if (selectedVolume?.storageKind === "network") {
        return DEFAULT_NETWORK_DISK_THROUGHPUT_MEBIBYTES_PER_SECOND;
    }

    return direction === "read"
        ? DEFAULT_UNKNOWN_READ_THROUGHPUT_MEBIBYTES_PER_SECOND
        : DEFAULT_UNKNOWN_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND;
}

function resolveDiskWidgetChannelColor(
    direction: Exclude<DiskThroughputDirection, "both" | "total">,
    settings: ResolvedWidgetSettings,
    globalSettings: ResolvedGlobalSettings,
    widgetData: { progress: number },
): string {
    return resolveColorForThresholdValue(widgetData.progress * 100, buildDiskChannelColorConfig(direction, settings, globalSettings));
}

function buildDiskChannelColorConfig(
    direction: Exclude<DiskThroughputDirection, "both" | "total">,
    settings: ResolvedWidgetSettings,
    globalSettings: ResolvedGlobalSettings,
): ColorConfig {
    if (globalSettings.overrideWidgetAppearance) {
        return buildGlobalChannelColorConfig(direction === "read" ? "primary" : "secondary", globalSettings);
    }

    if (direction === "read") {
        return buildColorConfigFromRamp({
            colorMode: settings.appearance.colorMode,
            colors: settings.appearance.diskReadColors,
            lowThreshold: settings.appearance.lowThreshold,
            highThreshold: settings.appearance.highThreshold,
        });
    }

    return buildColorConfigFromRamp({
        colorMode: settings.appearance.colorMode,
        colors: settings.appearance.diskWriteColors,
        lowThreshold: settings.appearance.lowThreshold,
        highThreshold: settings.appearance.highThreshold,
    });
}

const DEFAULT_HDD_READ_THROUGHPUT_MEBIBYTES_PER_SECOND = 220;
const DEFAULT_HDD_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND = 180;
const DEFAULT_SSD_READ_THROUGHPUT_MEBIBYTES_PER_SECOND = 1500;
const DEFAULT_SSD_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND = 1200;
const DEFAULT_NETWORK_DISK_THROUGHPUT_MEBIBYTES_PER_SECOND = 125;
const DEFAULT_UNKNOWN_READ_THROUGHPUT_MEBIBYTES_PER_SECOND = 1000;
const DEFAULT_UNKNOWN_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND = 1000;
const DISK_THROUGHPUT_DIRECTION_ICON_COLOR = "rgba(255,255,255,0.88)";
const DISK_THROUGHPUT_DIRECTION_ICON_SIZE = 30;
const DISK_GAUGE_FOOTER_ICON_SIZE = 25;
