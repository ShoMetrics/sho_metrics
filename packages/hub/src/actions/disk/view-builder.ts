import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../../runtime/metric-store";
import type { DiskVolumeOption } from "../../runtime/disk-volumes";
import {
    getDiskThroughputMetricKey,
    resolveDiskUsageMetricKey,
    type DiskThroughputMetricDirection,
} from "../../runtime/disk-metric-keys";
import { buildDiskThroughputWidgetData, buildDiskUsageWidgetData } from "../../metrics/storage-widget-data";
import type {
    ResolvedAppearanceSettings,
    ResolvedDiskMetricTarget,
    ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import { requireResolvedSingleMetricWidget } from "../../settings/resolved-settings";
import { resolveColorForThresholdValue, type ColorConfig } from "../../view-rendering/color-resolver";
import { getDiskIcon, getDiskIconFragment, renderCenteredHardwareIconFragment } from "../../widgets/icons/hardware-icons";
import { renderDiskThroughputDirectionIconFragment } from "../../widgets/icons/catalog/disk";
import { getMetricStatusIcon } from "../../widgets/icons/metric-status-icons";
import { escapeSvgText } from "../../view-rendering/svg-utils";
import type { WidgetData } from "../../view-rendering/widget-data";
import {
    formatCompactDiskVolumeLabel,
    resolveAvailableDiskVolume,
    type DiskVolumeSelection,
} from "./volume-selection";
import type { DualMetricViewOptions, SingleMetricViewOptions } from "../../view-updates/runner";
import {
    buildColorConfigFromAppearance,
    resolveActiveMetricAccentColorMode,
    resolveSolidMetricColorMode,
} from "../../settings/render-paint-resolver";
import { resolveRenderTextStyles } from "../../settings/render-text-style-resolver";
import { buildMetricAccentPaintAppearanceOverride } from "../../settings/appearance-overrides";

interface BuildDiskViewOptions {
    event: WillAppearEvent;
    settings: ResolvedWidgetSettings;
    target: ResolvedDiskMetricTarget;
    metrics: MetricStoreReader;
    volumeSelection: DiskVolumeSelection;
    currentTimestampMilliseconds: number;
}

type DiskUsageReading = Extract<ResolvedDiskMetricTarget["reading"], { readonly kind: "usage" }>;
type DiskThroughputReading = Extract<ResolvedDiskMetricTarget["reading"], { readonly kind: "throughput" }>;

const SYSTEM_TOTAL_DISK_THROUGHPUT_LABEL = "DISK";

type DiskMetricViewOptions = SingleMetricViewOptions | DualMetricViewOptions;

export function buildDiskViewOptions(options: BuildDiskViewOptions): DiskMetricViewOptions {
    if (options.target.reading.kind === "throughput") {
        return buildDiskThroughputViewOptions({
            ...options,
            reading: options.target.reading,
        });
    }

    return buildDiskUsageViewOptions({
        ...options,
        reading: options.target.reading,
    });
}

export function resolveDiskMaximumThroughputMebibytesPerSecond(
    direction: DiskThroughputMetricDirection,
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

function buildDiskUsageViewOptions(
    options: BuildDiskViewOptions & { reading: DiskUsageReading },
): DiskMetricViewOptions {
    const selectedVolume = resolveAvailableDiskVolume(options.volumeSelection);
    const usedMetricKey = resolveDiskUsageMetricKey("used", options.target.volumeId);
    const totalMetricKey = resolveDiskUsageMetricKey("total", options.target.volumeId);
    const availableMetricKey = resolveDiskUsageMetricKey("available", options.target.volumeId);
    const label = formatCompactDiskVolumeLabel(options.volumeSelection);
    const usedBytesWidgetData = options.volumeSelection.kind === "unavailable"
        ? buildUnavailableDiskBytesWidgetData(label)
        : options.metrics.getWidgetData(usedMetricKey, label, "B");
    const totalBytesWidgetData = options.metrics.getWidgetData(
        totalMetricKey,
        label,
        "B",
    );
    const availableBytesWidgetData = options.metrics.getWidgetData(
        availableMetricKey,
        label,
        "B",
    );
    const appearance = readSingleMetricAppearance(options.settings);
    const selectedView = appearance.view.selectedView;
    const circleVariant = appearance.view.circleVariant;
    const shouldRenderGauge = selectedView === "circle" && circleVariant === "gauge";

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: appearance,
        metricKey: usedMetricKey,
        widgetData: buildDiskUsageWidgetData({
            usedBytesWidgetData,
            totalBytes: totalBytesWidgetData.current,
            availableBytes: availableBytesWidgetData.current,
            displayMode: options.reading.displayMode,
            label,
            barLabel: resolveDiskBarLabel(options.reading.barLabel, selectedVolume, label),
        }),
        centerIconFragment: buildDiskCenterIconFragment(
            options.volumeSelection,
            resolveRenderTextStyles(appearance).label.fontFamily,
        ),
        footerIconFragment: shouldRenderGauge ? undefined : buildDiskGaugeFooterIconFragment(selectedVolume),
        topIconFragment: getDiskIconFragment(selectedVolume?.storageKind ?? "unknown"),
        statusIcon: getMetricStatusIcon("percentage"),
        circleVariantOverride: circleVariant,
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

function buildDiskThroughputViewOptions(
    options: BuildDiskViewOptions & { reading: DiskThroughputReading },
): DiskMetricViewOptions {
    const throughputDirection = options.reading.direction;
    const appearance = readSingleMetricAppearance(options.settings);
    const selectedView = appearance.view.selectedView;

    switch (selectedView) {
        case "bar":
            if (throughputDirection === "both") {
                return buildDiskThroughputBarViewOptions(options);
            }

            return buildDiskThroughputSingleBarViewOptions({
                ...options,
                direction: throughputDirection,
            });
        case "circle":
        case "text":
        case "line":
            if (throughputDirection === "both") {
                return buildDualThroughputViewOptions(options);
            }
            break;
        default:
            return assertNever(selectedView);
    }

    const singleThroughputDirection: DiskThroughputMetricDirection = throughputDirection;
    const throughputMetricKey = getDiskThroughputMetricKey(singleThroughputDirection);
    // Throughput is aggregate; volume selection is usage-only.
    const throughputLabel = SYSTEM_TOTAL_DISK_THROUGHPUT_LABEL;
    const bytesPerSecondWidgetData = options.metrics.getWidgetData(
        throughputMetricKey,
        throughputLabel,
        "B/s",
    );
    const circleVariant = appearance.view.circleVariant;
    const shouldRenderGaugeFooter = selectedView === "circle" && circleVariant === "gauge";

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: appearance,
        metricKey: throughputMetricKey,
        widgetData: buildDiskThroughputWidgetData({
            bytesPerSecondWidgetData,
            maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond(
                singleThroughputDirection,
                options.reading,
                null,
            ),
            label: throughputLabel,
            currentTimestampMilliseconds: options.currentTimestampMilliseconds,
            pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
        }),
        centerIconFragment: getDiskIconFragment("unknown"),
        footerIconFragment: shouldRenderGaugeFooter
            ? buildDiskThroughputFooterIconFragment(singleThroughputDirection)
            : undefined,
        statusIcon: getMetricStatusIcon("percentage"),
        circleVariantOverride: circleVariant,
        appearanceOverride: buildMetricAccentPaintAppearanceOverride(
            appearance.theme.selectedTheme,
            {
                colorMode: resolveActiveMetricAccentColorMode(appearance),
                solid: {
                    colors: {
                        usageColor: buildColorConfigFromAppearance(appearance, "usage").solidColor,
                    },
                },
            },
        ),
    };
}

function buildDualThroughputViewOptions(
    options: BuildDiskViewOptions & { reading: DiskThroughputReading },
): DiskMetricViewOptions {
    const readMetricKey = getDiskThroughputMetricKey("read");
    const writeMetricKey = getDiskThroughputMetricKey("write");
    const appearance = readSingleMetricAppearance(options.settings);
    const selectedView = appearance.view.selectedView;
    let dualRenderPrimitive: "circle" | "text" | undefined;
    if (selectedView === "circle") {
        dualRenderPrimitive = "circle";
    } else if (selectedView === "text") {
        dualRenderPrimitive = "text";
    }
    const readWidgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: options.metrics.getWidgetData(
            readMetricKey,
            "READ",
            "B/s",
        ),
        maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("read", options.reading, null),
        label: "READ",
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const writeWidgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: options.metrics.getWidgetData(
            writeMetricKey,
            "WRIT",
            "B/s",
        ),
        maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("write", options.reading, null),
        label: "WRIT",
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const readColor = resolveDiskWidgetChannelColor("read", options.settings, readWidgetData);
    const writeColor = resolveDiskWidgetChannelColor("write", options.settings, writeWidgetData);
    const readColorConfig = buildDiskChannelColorConfig("read", options.settings);
    const writeColorConfig = buildDiskChannelColorConfig("write", options.settings);
    const solidMetricColorMode = resolveSolidMetricColorMode(resolveActiveMetricAccentColorMode(appearance));

    return {
        event: options.event,
        metricRenderKind: "dualMetric",
        resolvedSettings: appearance,
        metricKey: `${readMetricKey},${writeMetricKey}`,
        dualRenderPrimitive,
        widgetData: {
            positive: readWidgetData,
            negative: writeWidgetData,
        },
        titleText: "DISK",
        centerIconFragment: getDiskIconFragment("unknown"),
        statusIcon: getMetricStatusIcon("percentage"),
        circleVariantOverride: dualRenderPrimitive === "circle"
            ? appearance.view.circleVariant
            : undefined,
        positiveColor: readColor,
        negativeColor: writeColor,
        positiveColorConfig: readColorConfig,
        negativeColorConfig: writeColorConfig,
        positiveLabelText: "RD",
        negativeLabelText: "WR",
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
        appearanceOverride: buildMetricAccentPaintAppearanceOverride(
            appearance.theme.selectedTheme,
            {
                colorMode: solidMetricColorMode,
                solid: { colors: { usageColor: readColor } },
            },
        ),
    };
}

function buildDiskThroughputBarViewOptions(
    options: BuildDiskViewOptions & { reading: DiskThroughputReading },
): DiskMetricViewOptions {
    const readMetricKey = getDiskThroughputMetricKey("read");
    const writeMetricKey = getDiskThroughputMetricKey("write");
    const readWidgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: options.metrics.getWidgetData(
            readMetricKey,
            "READ",
            "B/s",
        ),
        maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("read", options.reading, null),
        label: "READ",
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const writeWidgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: options.metrics.getWidgetData(
            writeMetricKey,
            "WRIT",
            "B/s",
        ),
        maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("write", options.reading, null),
        label: "WRIT",
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const readColor = resolveDiskWidgetChannelColor("read", options.settings, readWidgetData);
    const writeColor = resolveDiskWidgetChannelColor("write", options.settings, writeWidgetData);
    const appearance = readSingleMetricAppearance(options.settings);

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: appearance,
        metricKey: `${readMetricKey},${writeMetricKey}`,
        widgetData: {
            current: readWidgetData.current,
            progress: readWidgetData.progress,
            history: readWidgetData.history,
            unit: readWidgetData.unit,
            label: SYSTEM_TOTAL_DISK_THROUGHPUT_LABEL,
            barLabel: SYSTEM_TOTAL_DISK_THROUGHPUT_LABEL,
            barChannels: [
                {
                    label: "READ",
                    displayValue: readWidgetData.displayValue ?? readWidgetData.current.toFixed(0),
                    unit: readWidgetData.unit,
                    progress: readWidgetData.progress,
                    color: readColor,
                    iconFragment: renderDiskThroughputDirectionIconFragment({
                        direction: "read",
                        size: DISK_THROUGHPUT_DIRECTION_ICON_SIZE,
                    }),
                },
                {
                    label: "WRIT",
                    displayValue: writeWidgetData.displayValue ?? writeWidgetData.current.toFixed(0),
                    unit: writeWidgetData.unit,
                    progress: writeWidgetData.progress,
                    color: writeColor,
                    iconFragment: renderDiskThroughputDirectionIconFragment({
                        direction: "write",
                        size: DISK_THROUGHPUT_DIRECTION_ICON_SIZE,
                    }),
                },
            ],
            sampleTimestampMilliseconds: readWidgetData.sampleTimestampMilliseconds
                ?? writeWidgetData.sampleTimestampMilliseconds,
        },
        centerIconFragment: getDiskIconFragment("unknown"),
        topIconFragment: getDiskIconFragment("unknown"),
        statusIcon: getMetricStatusIcon("percentage"),
        appearanceOverride: buildMetricAccentPaintAppearanceOverride(
            appearance.theme.selectedTheme,
            {
                colorMode: resolveSolidMetricColorMode(resolveActiveMetricAccentColorMode(appearance)),
                solid: {
                    colors: {
                        usageColor: readColor,
                    },
                },
            },
        ),
    };
}

function buildDiskThroughputSingleBarViewOptions(
    options: BuildDiskViewOptions & {
        reading: DiskThroughputReading;
        direction: DiskThroughputMetricDirection;
    },
): DiskMetricViewOptions {
    const throughputMetricKey = getDiskThroughputMetricKey(options.direction);
    const widgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: options.metrics.getWidgetData(
            throughputMetricKey,
            SYSTEM_TOTAL_DISK_THROUGHPUT_LABEL,
            "B/s",
        ),
        maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond(
            options.direction,
            options.reading,
            null,
        ),
        label: SYSTEM_TOTAL_DISK_THROUGHPUT_LABEL,
        currentTimestampMilliseconds: options.currentTimestampMilliseconds,
        pollingFrequencySeconds: options.settings.preferences.pollingFrequencySeconds,
    });
    const color = resolveDiskWidgetChannelColor(options.direction, options.settings, widgetData);
    const appearance = readSingleMetricAppearance(options.settings);

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: appearance,
        metricKey: throughputMetricKey,
        widgetData: {
            ...widgetData,
            barLabel: SYSTEM_TOTAL_DISK_THROUGHPUT_LABEL,
            barValueIconFragment: renderDiskThroughputDirectionIconFragment({
                direction: options.direction,
                size: DISK_THROUGHPUT_DIRECTION_ICON_SIZE,
            }),
            barValueIconColor: color,
        },
        centerIconFragment: getDiskIconFragment("unknown"),
        topIconFragment: getDiskIconFragment("unknown"),
        statusIcon: getMetricStatusIcon("percentage"),
        appearanceOverride: buildMetricAccentPaintAppearanceOverride(
            appearance.theme.selectedTheme,
            {
                colorMode: resolveSolidMetricColorMode(resolveActiveMetricAccentColorMode(appearance)),
                solid: {
                    colors: {
                        usageColor: color,
                    },
                },
            },
        ),
    };
}

function buildDiskBarLabel(diskVolume: DiskVolumeOption | null, fallbackLabel: string): string {
    if (!diskVolume) {
        return fallbackLabel;
    }

    const storageKind = resolveCompactDiskStorageLabel(diskVolume);
    const volumeLabel = formatCompactDiskVolumeLabel({ kind: "available", volume: diskVolume });

    return `${storageKind} (${volumeLabel})`;
}

function resolveDiskBarLabel(
    customBarLabel: string,
    diskVolume: DiskVolumeOption | null,
    fallbackLabel: string,
): string {
    const normalizedBarLabel = customBarLabel.trim();

    if (normalizedBarLabel.length > 0) {
        return normalizedBarLabel;
    }

    return buildDiskBarLabel(diskVolume, fallbackLabel);
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

function buildDiskCenterIconFragment(volumeSelection: DiskVolumeSelection, labelFontFamily: string): string {
    const diskVolume = resolveAvailableDiskVolume(volumeSelection);
    const icon = getDiskIcon(diskVolume?.storageKind ?? "unknown");
    const volumeLabel = formatCompactDiskVolumeLabel(volumeSelection);

    return `
        <g transform="translate(0 -10)">
            ${renderCenteredHardwareIconFragment(icon, 45)}
        </g>
        <text x="0" y="34" text-anchor="middle"
            dominant-baseline="middle"
            font-family="${escapeSvgText(labelFontFamily)}"
            font-size="26" font-weight="850" fill="currentColor">${escapeSvgText(volumeLabel)}</text>
    `;
}

function buildDiskGaugeFooterIconFragment(diskVolume: DiskVolumeOption | null): string {
    return renderCenteredHardwareIconFragment(
        getDiskIcon(diskVolume?.storageKind ?? "unknown"),
        DISK_GAUGE_FOOTER_ICON_SIZE,
    );
}

function buildDiskThroughputFooterIconFragment(direction: DiskThroughputMetricDirection): string {
    return renderDiskThroughputDirectionIconFragment({
        direction,
        size: DISK_THROUGHPUT_DIRECTION_ICON_SIZE,
    });
}

function resolveDiskMaximumThroughputBytesPerSecond(
    direction: DiskThroughputMetricDirection,
    reading: DiskThroughputReading,
    selectedVolume: DiskVolumeOption | null,
): number {
    const maximumReadMebibytesPerSecond = resolveDiskMaximumThroughputMebibytesPerSecond("read", reading, selectedVolume);
    const maximumWriteMebibytesPerSecond = resolveDiskMaximumThroughputMebibytesPerSecond("write", reading, selectedVolume);
    const maximumMebibytesPerSecond = direction === "write"
        ? maximumWriteMebibytesPerSecond
        : maximumReadMebibytesPerSecond;

    return maximumMebibytesPerSecond * 1024 * 1024;
}

function resolveDefaultDiskMaximumThroughputMebibytesPerSecond(
    direction: DiskThroughputMetricDirection,
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
    direction: DiskThroughputMetricDirection,
    settings: ResolvedWidgetSettings,
    widgetData: { progress: number },
): string {
    return resolveColorForThresholdValue(widgetData.progress * 100, buildDiskChannelColorConfig(direction, settings));
}

function buildDiskChannelColorConfig(
    direction: DiskThroughputMetricDirection,
    settings: ResolvedWidgetSettings,
): ColorConfig {
    if (direction === "read") {
        return buildColorConfigFromAppearance(readSingleMetricAppearance(settings), "diskRead");
    }

    return buildColorConfigFromAppearance(readSingleMetricAppearance(settings), "diskWrite");
}

function assertNever(value: never): never {
    throw new Error(`Unexpected disk throughput view: ${String(value)}`);
}

function readSingleMetricAppearance(settings: ResolvedWidgetSettings): ResolvedAppearanceSettings {
    return requireResolvedSingleMetricWidget(settings).slot.appearance;
}

const DEFAULT_HDD_READ_THROUGHPUT_MEBIBYTES_PER_SECOND = 220;
const DEFAULT_HDD_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND = 180;
const DEFAULT_SSD_READ_THROUGHPUT_MEBIBYTES_PER_SECOND = 1500;
const DEFAULT_SSD_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND = 1200;
const DEFAULT_NETWORK_DISK_THROUGHPUT_MEBIBYTES_PER_SECOND = 125;
const DEFAULT_UNKNOWN_READ_THROUGHPUT_MEBIBYTES_PER_SECOND = 1000;
const DEFAULT_UNKNOWN_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND = 1000;
const DISK_THROUGHPUT_DIRECTION_ICON_SIZE = 30;
const DISK_GAUGE_FOOTER_ICON_SIZE = 25;
