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
    ResolvedDiskMetricTarget,
    ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import { resolveColorForThresholdValue, type ColorConfig } from "../../rendering/color-resolver";
import { getDiskIcon, getDiskIconFragment, renderCenteredHardwareIconFragment } from "../../widgets/icons/hardware-icons";
import { renderDiskThroughputDirectionIconFragment } from "../../widgets/icons/catalog/disk";
import { getMetricStatusIcon } from "../../widgets/icons/metric-status-icons";
import { escapeSvgText } from "../../rendering/svg-utils";
import type { WidgetData } from "../../rendering/widget-data";
import {
    isDualDiskThroughputDisplay,
} from "./metric-subscriptions";
import {
    formatCompactDiskVolumeLabel,
    resolveAvailableDiskVolume,
    resolveDiskVolumeSelectionId,
    type DiskVolumeSelection,
} from "./volume-selection";
import type { MetricDisplayOptions } from "../../metric-view-runner/display-model";
import { buildColorConfigFromRamp, resolveSolidVisualOverrideColorMode } from "../../settings/visual-adapter";

interface BuildDiskDisplayOptions {
    event: WillAppearEvent;
    settings: ResolvedWidgetSettings;
    target: ResolvedDiskMetricTarget;
    metricStore: MetricStore;
    volumeSelection: DiskVolumeSelection;
}

type DiskUsageReading = Extract<ResolvedDiskMetricTarget["reading"], { readonly kind: "usage" }>;
type DiskThroughputReading = Extract<ResolvedDiskMetricTarget["reading"], { readonly kind: "throughput" }>;

export function buildDiskDisplayOptions(options: BuildDiskDisplayOptions): MetricDisplayOptions {
    if (options.target.reading.kind === "throughput") {
        return buildDiskThroughputDisplayOptions({
            ...options,
            reading: options.target.reading,
        });
    }

    return buildDiskUsageDisplayOptions({
        ...options,
        reading: options.target.reading,
    });
}

export function resolveDiskMaximumThroughputMebibytesPerSecond(
    direction: Exclude<DiskThroughputDirection, "both" | "total">,
    reading: DiskThroughputReading,
    selectedVolume: DiskVolumeOption | null,
): number {
    const configuredMaximum = direction === "read"
        ? reading.display.maximumReadThroughputMebibytesPerSecond
        : reading.display.maximumWriteThroughputMebibytesPerSecond;

    if (configuredMaximum !== undefined && configuredMaximum > 0) {
        return configuredMaximum;
    }

    return resolveDefaultDiskMaximumThroughputMebibytesPerSecond(direction, selectedVolume);
}

function buildDiskUsageDisplayOptions(
    options: BuildDiskDisplayOptions & { reading: DiskUsageReading },
): MetricDisplayOptions {
    const selectedVolume = resolveAvailableDiskVolume(options.volumeSelection);
    const selectedVolumeId = resolveDiskVolumeSelectionId(options.volumeSelection);
    const usedMetricKey = selectedVolumeId
        ? getDiskVolumeMetricKey("used", selectedVolumeId)
        : getDefaultDiskUsageMetricKey("used");
    const totalMetricKey = selectedVolumeId
        ? getDiskVolumeMetricKey("total", selectedVolumeId)
        : getDefaultDiskUsageMetricKey("total");
    const availableMetricKey = selectedVolumeId
        ? getDiskVolumeMetricKey("available", selectedVolumeId)
        : getDefaultDiskUsageMetricKey("available");
    const label = formatCompactDiskVolumeLabel(options.volumeSelection);
    const usedBytesWidgetData = options.volumeSelection.kind === "unavailable"
        ? buildUnavailableDiskBytesWidgetData(label)
        : options.metricStore.getWidgetData(usedMetricKey, label, "B");
    const totalBytesWidgetData = options.metricStore.getWidgetData(totalMetricKey, label, "B");
    const availableBytesWidgetData = options.metricStore.getWidgetData(availableMetricKey, label, "B");
    const appearance = options.settings.widget.slot.appearance;
    const effectiveGraphicType = appearance.viewLayout;
    const circleStyle = appearance.circleStyle;
    const shouldRenderGauge = effectiveGraphicType === "circular" && circleStyle === "gauge";

    return {
        event: options.event,
        resolvedSettings: appearance,
        metricKey: usedMetricKey,
        widgetData: buildDiskUsageWidgetData({
            usedBytesWidgetData,
            totalBytes: totalBytesWidgetData.current,
            availableBytes: availableBytesWidgetData.current,
            displayMode: options.reading.displayMode,
            label,
            linearLabel: resolveDiskLinearLabel(options.reading.linearLabel, selectedVolume, label),
        }),
        centerIconFragment: buildDiskCenterIconFragment(options.volumeSelection),
        footerIconFragment: shouldRenderGauge ? undefined : buildDiskGaugeFooterIconFragment(selectedVolume),
        linearIconFragment: getDiskIconFragment(selectedVolume?.storageKind ?? "unknown"),
        statusIcon: getMetricStatusIcon("percentage"),
        circleStyleOverride: circleStyle,
    };
}

function buildUnavailableDiskBytesWidgetData(label: string): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        unit: "B",
        label,
    };
}

function buildDiskThroughputDisplayOptions(
    options: BuildDiskDisplayOptions & { reading: DiskThroughputReading },
): MetricDisplayOptions {
    const throughputDirection = options.reading.direction;
    const appearance = options.settings.widget.slot.appearance;
    const effectiveGraphicType = appearance.viewLayout;

    if (isDualDiskThroughputDisplay(effectiveGraphicType, throughputDirection)) {
        return buildDualThroughputDisplayOptions(options);
    }

    const singleThroughputDirection = throughputDirection === "both" ? "total" : throughputDirection;
    const throughputMetricKey = getDiskThroughputMetricKey(singleThroughputDirection);
    const selectedVolume = resolveAvailableDiskVolume(options.volumeSelection);
    const throughputLabel = selectedVolume
        ? formatCompactDiskVolumeLabel({ kind: "available", volume: selectedVolume })
        : "DISK";
    const bytesPerSecondWidgetData = options.metricStore.getWidgetData(throughputMetricKey, throughputLabel, "B/s");
    const circleStyle = appearance.circleStyle;
    const shouldRenderGaugeFooter = effectiveGraphicType === "circular" && circleStyle === "gauge";

    return {
        event: options.event,
        resolvedSettings: appearance,
        metricKey: throughputMetricKey,
        widgetData: buildDiskThroughputWidgetData({
            bytesPerSecondWidgetData,
            maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond(
                singleThroughputDirection,
                options.reading,
                selectedVolume,
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
            colorMode: appearance.colorMode,
            usageColors: {
                solidColor: appearance.usageColors.solidColor,
            },
        },
    };
}

function buildDualThroughputDisplayOptions(
    options: BuildDiskDisplayOptions & { reading: DiskThroughputReading },
): MetricDisplayOptions {
    const readMetricKey = getDiskThroughputMetricKey("read");
    const writeMetricKey = getDiskThroughputMetricKey("write");
    const appearance = options.settings.widget.slot.appearance;
    const effectiveGraphicType = appearance.viewLayout;
    const dualGraphicType = effectiveGraphicType === "circular"
        ? "circular"
        : effectiveGraphicType === "text" ? "text" : undefined;
    const selectedVolume = resolveAvailableDiskVolume(options.volumeSelection);
    const readWidgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: options.metricStore.getWidgetData(readMetricKey, "READ", "B/s"),
        maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("read", options.reading, selectedVolume),
        label: "READ",
    });
    const writeWidgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: options.metricStore.getWidgetData(writeMetricKey, "WRIT", "B/s"),
        maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("write", options.reading, selectedVolume),
        label: "WRIT",
    });
    const readColor = resolveDiskWidgetChannelColor("read", options.settings, readWidgetData);
    const writeColor = resolveDiskWidgetChannelColor("write", options.settings, writeWidgetData);
    const readColorConfig = buildDiskChannelColorConfig("read", options.settings);
    const writeColorConfig = buildDiskChannelColorConfig("write", options.settings);
    const solidVisualOverrideColorMode = resolveSolidVisualOverrideColorMode(appearance.colorMode);

    return {
        event: options.event,
        resolvedSettings: appearance,
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
            ? appearance.circleStyle
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
            colorMode: solidVisualOverrideColorMode,
            usageColors: { solidColor: readColor },
        },
    };
}

function buildDiskLinearLabel(diskVolume: DiskVolumeOption | null, fallbackLabel: string): string {
    if (!diskVolume) {
        return fallbackLabel;
    }

    const storageKind = resolveCompactDiskStorageLabel(diskVolume);
    const volumeLabel = formatCompactDiskVolumeLabel({ kind: "available", volume: diskVolume });

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

function buildDiskCenterIconFragment(volumeSelection: DiskVolumeSelection): string {
    const diskVolume = resolveAvailableDiskVolume(volumeSelection);
    const icon = getDiskIcon(diskVolume?.storageKind ?? "unknown");
    const volumeLabel = formatCompactDiskVolumeLabel(volumeSelection);

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
    reading: DiskThroughputReading,
    selectedVolume: DiskVolumeOption | null,
): number {
    const maximumReadMebibytesPerSecond = resolveDiskMaximumThroughputMebibytesPerSecond("read", reading, selectedVolume);
    const maximumWriteMebibytesPerSecond = resolveDiskMaximumThroughputMebibytesPerSecond("write", reading, selectedVolume);
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
    widgetData: { progress: number },
): string {
    return resolveColorForThresholdValue(widgetData.progress * 100, buildDiskChannelColorConfig(direction, settings));
}

function buildDiskChannelColorConfig(
    direction: Exclude<DiskThroughputDirection, "both" | "total">,
    settings: ResolvedWidgetSettings,
): ColorConfig {
    if (direction === "read") {
        const appearance = settings.widget.slot.appearance;
        return buildColorConfigFromRamp({
            colorMode: appearance.colorMode,
            colors: appearance.diskReadColors,
            lowThreshold: appearance.lowColorThresholdPercent,
            highThreshold: appearance.highColorThresholdPercent,
        });
    }

    const appearance = settings.widget.slot.appearance;
    return buildColorConfigFromRamp({
        colorMode: appearance.colorMode,
        colors: appearance.diskWriteColors,
        lowThreshold: appearance.lowColorThresholdPercent,
        highThreshold: appearance.highColorThresholdPercent,
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
