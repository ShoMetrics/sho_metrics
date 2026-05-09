import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setDualMetricDisplay, setSingleMetricDisplay } from "./single-metric-display";
import { logger } from "../logging/logger";
import { buildDiskThroughputWidgetData, buildDiskUsageWidgetData } from "../metrics/storage-display";
import { diskVolumeRegistry, type DiskVolumeOption } from "../runtime/disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
    type DiskThroughputDirection,
} from "../runtime/disk-metric-keys";
import {
    isDualDiskThroughputDisplay,
    normalizeDiskThroughputDisplayDirection,
    resolveDiskMetricKeys,
    resolveSingleDiskThroughputDirection,
} from "./disk-metric-keys";
import { getDiskIcon, getDiskIconFragment, renderCenteredHardwareIconFragment } from "../widgets/icons/hardware-icons";
import { renderDiskThroughputDirectionIconFragment } from "../widgets/icons/catalog/disk";
import { getMetricStatusIcon } from "../widgets/icons/metric-status-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import { escapeSvgText } from "../rendering/svg-utils";
import { resolveColor, type ColorConfig } from "../rendering/color-resolver";
import { buildGlobalChannelColorConfig } from "../settings/global-appearance";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    readActionStoredSettings,
    serializeActionStoredSettings,
} from "./action-settings-resolver";
import type { ResolvedWidgetSettings } from "../settings/widget-settings";
import { updateWidgetRuntimeCache } from "../settings/updates";

const log = logger.for("Action:Disk");

@action({ UUID: "com.ez.sho-metrics.disk" })
export class Disk extends MetricAction {
    protected readonly actionKind = "disk";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event) as DiskSettings;
        const metricKind = settings.metric.diskMetricKind;

        if (metricKind === "throughput") {
            return resolveDiskMetricKeys({
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
        const settings = this.resolveSettings(event) as DiskSettings;
        const metricKind = settings.metric.diskMetricKind;

        publishDiskVolumeOptions(event);
        publishDiskThroughputScaleLearning(event, settings);

        if (metricKind === "throughput") {
            this.updateThroughputDisplay(event, settings);
            return;
        }

        this.updateUsageDisplay(event, settings);
    }

    private updateUsageDisplay(event: WillAppearEvent, settings: DiskSettings): void {
        const selectedVolume = resolveSelectedDiskVolume(settings.metric.diskVolumeId);
        const usedMetricKey = selectedVolume
            ? getDiskVolumeMetricKey("used", selectedVolume.id)
            : getDefaultDiskUsageMetricKey("used");
        const totalMetricKey = selectedVolume
            ? getDiskVolumeMetricKey("total", selectedVolume.id)
            : getDefaultDiskUsageMetricKey("total");
        const availableMetricKey = selectedVolume
            ? getDiskVolumeMetricKey("available", selectedVolume.id)
            : getDefaultDiskUsageMetricKey("available");
        const label = selectedVolume ? formatDiskVolumeDisplayLabel(selectedVolume) : ARC_GAUGE_LABELS.disk;
        const usedBytesWidgetData = metricStore.getWidgetData(usedMetricKey, label, "B");
        const totalBytesWidgetData = metricStore.getWidgetData(totalMetricKey, label, "B");
        const availableBytesWidgetData = metricStore.getWidgetData(availableMetricKey, label, "B");
        const effectiveGraphicType = settings.appearance.graphicType;
        const circleStyle = settings.appearance.circleStyle;
        const shouldRenderGauge = effectiveGraphicType === "circular" && circleStyle === "gauge";

        setSingleMetricDisplay({
            event,
            resolvedSettings: settings.appearance,
            metricKey: usedMetricKey,
            widgetData: buildDiskUsageWidgetData({
                usedBytesWidgetData,
                totalBytes: totalBytesWidgetData.current,
                availableBytes: availableBytesWidgetData.current,
                displayMode: settings.local.diskUsageDisplayMode,
                label,
                linearLabel: resolveDiskLinearLabel(settings.local.diskLinearLabel, selectedVolume, label),
            }),
            centerIconFragment: buildDiskCenterIconFragment(selectedVolume),
            footerIconFragment: shouldRenderGauge ? undefined : buildDiskGaugeFooterIconFragment(selectedVolume),
            linearIconFragment: getDiskIconFragment(selectedVolume?.storageKind ?? "unknown"),
            statusIcon: getMetricStatusIcon("percentage"),
            circleStyleOverride: circleStyle,
        });
    }

    private updateThroughputDisplay(event: WillAppearEvent, settings: DiskSettings): void {
        if (process.platform !== "darwin") {
            showDiskThroughputUnavailable(event);
            return;
        }

        const throughputDirection = normalizeDiskThroughputDisplayDirection(settings.metric.diskThroughputDirection);
        const effectiveGraphicType = settings.appearance.graphicType;

        if (isDualDiskThroughputDisplay(effectiveGraphicType, throughputDirection)) {
            this.updateDualThroughputDisplay(event, settings);
            return;
        }

        const singleThroughputDirection = resolveSingleDiskThroughputDirection(throughputDirection);
        const throughputMetricKey = getDiskThroughputMetricKey(singleThroughputDirection);
        const selectedVolume = resolveSelectedDiskVolume(settings.metric.diskVolumeId);
        const throughputLabel = selectedVolume
            ? formatDiskVolumeDisplayLabel(selectedVolume)
            : ARC_GAUGE_LABELS.disk;
        const bytesPerSecondWidgetData = metricStore.getWidgetData(throughputMetricKey, throughputLabel, "B/s");
        const circleStyle = settings.appearance.circleStyle;
        const shouldRenderGaugeFooter = effectiveGraphicType === "circular" && circleStyle === "gauge";

        setSingleMetricDisplay({
            event,
            resolvedSettings: settings.appearance,
            metricKey: throughputMetricKey,
            widgetData: buildDiskThroughputWidgetData({
                bytesPerSecondWidgetData,
                maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond(
                    singleThroughputDirection,
                    settings,
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
                colorMode: settings.appearance.colorMode,
                usageColors: {
                    solidColor: settings.appearance.usageColors.solidColor || DEFAULT_DISK_THROUGHPUT_COLOR,
                },
            },
        });
    }

    private updateDualThroughputDisplay(event: WillAppearEvent, settings: DiskSettings): void {
        const readMetricKey = getDiskThroughputMetricKey("read");
        const writeMetricKey = getDiskThroughputMetricKey("write");
        const effectiveGraphicType = settings.appearance.graphicType;
        const dualGraphicType = effectiveGraphicType === "circular"
            ? "circular"
            : effectiveGraphicType === "text" ? "text" : undefined;
        const selectedVolume = resolveSelectedDiskVolume(settings.metric.diskVolumeId);
        const readWidgetData = buildDiskThroughputWidgetData({
            bytesPerSecondWidgetData: metricStore.getWidgetData(readMetricKey, "READ", "B/s"),
            maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("read", settings, selectedVolume),
            label: "READ",
        });
        const writeWidgetData = buildDiskThroughputWidgetData({
            bytesPerSecondWidgetData: metricStore.getWidgetData(writeMetricKey, "WRIT", "B/s"),
            maximumBytesPerSecond: resolveDiskMaximumThroughputBytesPerSecond("write", settings, selectedVolume),
            label: "WRIT",
        });
        const readColor = resolveDiskWidgetChannelColor("read", settings, readWidgetData);
        const writeColor = resolveDiskWidgetChannelColor("write", settings, writeWidgetData);
        const readColorConfig = buildDiskChannelColorConfig("read", settings);
        const writeColorConfig = buildDiskChannelColorConfig("write", settings);

        setDualMetricDisplay({
            event,
            resolvedSettings: settings.appearance,
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
                ? settings.appearance.circleStyle
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
        });
    }
}

function formatDiskVolumeDisplayLabel(diskVolume: DiskVolumeOption): string {
    const mountLabel = diskVolume.mount || diskVolume.fs || ARC_GAUGE_LABELS.disk;

    if (/^[A-Z]:\\?$/i.test(mountLabel)) {
        return mountLabel.slice(0, 2).toUpperCase();
    }

    return mountLabel.slice(0, 4).toUpperCase();
}

function buildDiskLinearLabel(diskVolume: DiskVolumeOption | null, fallbackLabel: string): string {
    if (!diskVolume) {
        return fallbackLabel;
    }

    const storageKind = resolveCompactDiskStorageLabel(diskVolume);
    const volumeLabel = formatDiskVolumeDisplayLabel(diskVolume);

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
    const volumeLabel = diskVolume ? formatDiskVolumeDisplayLabel(diskVolume) : ARC_GAUGE_LABELS.disk;

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

type DiskSettings = ResolvedWidgetSettings;

const DEFAULT_HDD_READ_THROUGHPUT_MEBIBYTES_PER_SECOND = 220;
const DEFAULT_HDD_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND = 180;
const DEFAULT_SSD_READ_THROUGHPUT_MEBIBYTES_PER_SECOND = 1500;
const DEFAULT_SSD_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND = 1200;
const DEFAULT_NETWORK_DISK_THROUGHPUT_MEBIBYTES_PER_SECOND = 125;
const DEFAULT_UNKNOWN_READ_THROUGHPUT_MEBIBYTES_PER_SECOND = 1000;
const DEFAULT_UNKNOWN_WRITE_THROUGHPUT_MEBIBYTES_PER_SECOND = 1000;
const DEFAULT_DISK_THROUGHPUT_COLOR = "#38bdf8";
const DEFAULT_DISK_READ_COLOR = "#38bdf8";
const DEFAULT_DISK_WRITE_COLOR = "#f472b6";
const DISK_THROUGHPUT_DIRECTION_ICON_COLOR = "rgba(255,255,255,0.88)";
const DISK_THROUGHPUT_DIRECTION_ICON_SIZE = 30;
const DISK_GAUGE_FOOTER_ICON_SIZE = 25;

function resolveSelectedDiskVolume(value: string): DiskVolumeOption | null {
    if (value.length > 0) {
        return diskVolumeRegistry.findById(value);
    }

    return diskVolumeRegistry.resolveDefaultSelection();
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
    settings: DiskSettings,
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

function resolveDiskMaximumThroughputMebibytesPerSecond(
    direction: Exclude<DiskThroughputDirection, "both" | "total">,
    settings: DiskSettings,
    selectedVolume: DiskVolumeOption | null,
): number {
    const configuredMaximum = Number(direction === "read"
        ? settings.diskThroughput.maximumDiskReadThroughputMebibytesPerSecond
        : settings.diskThroughput.maximumDiskWriteThroughputMebibytesPerSecond);

    if (Number.isFinite(configuredMaximum) && configuredMaximum > 0) {
        return configuredMaximum;
    }

    return resolveDefaultDiskMaximumThroughputMebibytesPerSecond(direction, selectedVolume);
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
    direction: Exclude<DiskThroughputDirection, "total">,
    settings: DiskSettings,
    widgetData: { progress: number },
): string {
    return resolveColor(widgetData.progress * 100, buildDiskChannelColorConfig(direction, settings));
}

function buildDiskChannelColorConfig(direction: Exclude<DiskThroughputDirection, "total">, settings: DiskSettings): ColorConfig {
    const globalSettings = pluginGlobalSettingsStore.getResolved();
    if (globalSettings.overrideWidgetAppearance) {
        return buildGlobalChannelColorConfig(direction === "read" ? "primary" : "secondary", globalSettings);
    }

    if (direction === "read") {
        const colors = settings.appearance.diskReadColors;
        return {
            mode: settings.appearance.colorMode === "threshold" ? "threshold" : "solid",
            solidColor: resolveHexColor(colors.solidColor, DEFAULT_DISK_READ_COLOR),
            thresholds: buildDiskChannelThresholds({
                settings,
                lowColor: resolveHexColor(colors.lowColor, "#22c55e"),
                mediumColor: resolveHexColor(colors.mediumColor, DEFAULT_DISK_READ_COLOR),
                highColor: resolveHexColor(colors.highColor, "#60a5fa"),
            }),
        };
    }

    const colors = settings.appearance.diskWriteColors;
    return {
        mode: settings.appearance.colorMode === "threshold" ? "threshold" : "solid",
        solidColor: resolveHexColor(colors.solidColor, DEFAULT_DISK_WRITE_COLOR),
        thresholds: buildDiskChannelThresholds({
            settings,
            lowColor: resolveHexColor(colors.lowColor, "#f97316"),
            mediumColor: resolveHexColor(colors.mediumColor, DEFAULT_DISK_WRITE_COLOR),
            highColor: resolveHexColor(colors.highColor, "#fb7185"),
        }),
    };
}

function buildDiskChannelThresholds(options: {
    settings: DiskSettings;
    lowColor: string;
    mediumColor: string;
    highColor: string;
}): ColorConfig["thresholds"] {
    const lowThreshold = normalizeThreshold(options.settings.appearance.lowThreshold, 30);
    const highThreshold = Math.max(lowThreshold, normalizeThreshold(options.settings.appearance.highThreshold, 70));

    return [
        { min: 0, max: lowThreshold, color: options.lowColor },
        { min: lowThreshold, max: highThreshold, color: options.mediumColor },
        { min: highThreshold, max: 101, color: options.highColor },
    ];
}

function normalizeThreshold(value: number, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(numericValue), 0), 100);
}

function resolveHexColor(value: string, fallbackColor: string): string {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallbackColor;
}

function publishDiskVolumeOptions(event: WillAppearEvent): void {
    const availableDiskVolumes = JSON.stringify(diskVolumeRegistry.getOptions());

    const storedSettings = readActionStoredSettings(event);

    if (storedSettings.runtimeCache?.availableDiskVolumes === availableDiskVolumes) {
        return;
    }

    event.action.setSettings(serializeActionStoredSettings(updateWidgetRuntimeCache(storedSettings, {
        availableDiskVolumes,
    }))).catch(error => {
        log.error(() => `Failed to publish disk volumes: ${String(error)}`);
    });
}

function publishDiskThroughputScaleLearning(event: WillAppearEvent, settings: DiskSettings): void {
    if (
        settings.metric.diskMetricKind !== "throughput"
        || settings.diskThroughput.diskThroughputScaleMode === "custom"
    ) {
        return;
    }

    const selectedVolume = resolveSelectedDiskVolume(settings.metric.diskVolumeId);
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

    const storedSettings = readActionStoredSettings(event);

    if (
        storedSettings.runtimeCache?.learnedMaximumDiskReadThroughputMebibytesPerSecond === nextReadMaximum
        && storedSettings.runtimeCache?.learnedMaximumDiskWriteThroughputMebibytesPerSecond === nextWriteMaximum
    ) {
        return;
    }

    event.action.setSettings(serializeActionStoredSettings(updateWidgetRuntimeCache(storedSettings, {
        learnedMaximumDiskReadThroughputMebibytesPerSecond: nextReadMaximum,
        learnedMaximumDiskWriteThroughputMebibytesPerSecond: nextWriteMaximum,
    }))).catch(error => {
        log.error(() => `Failed to publish learned disk throughput scale: ${String(error)}`);
    });
}

function resolveLearnedDiskMaximumThroughputMebibytesPerSecond(options: {
    direction: Exclude<DiskThroughputDirection, "both" | "total">;
    settings: DiskSettings;
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
