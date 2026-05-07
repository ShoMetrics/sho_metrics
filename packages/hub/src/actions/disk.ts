import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setDualMetricDisplay, setSingleMetricDisplay } from "./single-metric-display";
import { logger } from "../logging/logger";
import type { SettingValue } from "./metric-visual-settings";
import { buildDiskThroughputWidgetData, buildDiskUsageWidgetData, type DiskUsageDisplayMode } from "../metrics/storage-display";
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

const log = logger.for("Action:Disk");

@action({ UUID: "com.ez.sho-metrics.disk" })
export class Disk extends MetricAction {
    protected override getDefaultPollingFrequencySeconds(event: WillAppearEvent): number {
        const settings = event.payload.settings as DiskSettings;
        return normalizeDiskMetricKind(settings.diskMetricKind) === "throughput" ? 1 : 60;
    }

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = event.payload.settings as DiskSettings;
        const metricKind = normalizeDiskMetricKind(settings.diskMetricKind);

        if (metricKind === "throughput") {
            return resolveDiskMetricKeys(settings);
        }

        const selectedVolume = resolveSelectedDiskVolume(settings.diskVolumeId);

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
        const settings = event.payload.settings as DiskSettings;
        const metricKind = normalizeDiskMetricKind(settings.diskMetricKind);

        publishDiskVolumeOptions(event, settings);

        if (metricKind === "throughput") {
            this.updateThroughputDisplay(event, settings);
            return;
        }

        this.updateUsageDisplay(event, settings);
    }

    private updateUsageDisplay(event: WillAppearEvent, settings: DiskSettings): void {
        const selectedVolume = resolveSelectedDiskVolume(settings.diskVolumeId);
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

        setSingleMetricDisplay({
            event,
            metricKey: usedMetricKey,
            widgetData: buildDiskUsageWidgetData({
                usedBytesWidgetData,
                totalBytes: totalBytesWidgetData.current,
                availableBytes: availableBytesWidgetData.current,
                displayMode: normalizeDiskUsageDisplayMode(settings.diskUsageDisplayMode),
                label,
                linearLabel: resolveDiskLinearLabel(settings.diskLinearLabel, selectedVolume, label),
            }),
            centerIconFragment: buildDiskCenterIconFragment(selectedVolume),
            footerIconFragment: buildDiskGaugeFooterIconFragment(selectedVolume),
            linearIconFragment: getDiskIconFragment(selectedVolume?.storageKind ?? "unknown"),
            statusIcon: getMetricStatusIcon("percentage"),
        });
    }

    private updateThroughputDisplay(event: WillAppearEvent, settings: DiskSettings): void {
        if (process.platform !== "darwin") {
            showDiskThroughputUnavailable(event);
            return;
        }

        const throughputDirection = normalizeDiskThroughputDisplayDirection(settings.diskThroughputDirection);

        if (isDualDiskThroughputDisplay(settings.graphicType, throughputDirection)) {
            this.updateDualThroughputDisplay(event, settings);
            return;
        }

        const singleThroughputDirection = resolveSingleDiskThroughputDirection(throughputDirection);
        const throughputMetricKey = getDiskThroughputMetricKey(singleThroughputDirection);
        const selectedVolume = resolveSelectedDiskVolume(settings.diskVolumeId);
        const throughputLabel = selectedVolume
            ? formatDiskVolumeDisplayLabel(selectedVolume)
            : ARC_GAUGE_LABELS.disk;
        const bytesPerSecondWidgetData = metricStore.getWidgetData(throughputMetricKey, throughputLabel, "B/s");
        const circleStyle = resolveCircleStyle(settings.circleStyle);
        const shouldRenderGaugeFooter = settings.graphicType === "circular" && circleStyle === "gauge";

        setSingleMetricDisplay({
            event,
            metricKey: throughputMetricKey,
            widgetData: buildDiskThroughputWidgetData({
                bytesPerSecondWidgetData,
                maximumBytesPerSecond: normalizePositiveNumber(
                    settings.maximumDiskThroughputMebibytesPerSecond,
                    DEFAULT_MAXIMUM_DISK_THROUGHPUT_MEBIBYTES_PER_SECOND,
                ) * 1024 * 1024,
                label: throughputLabel,
            }),
            centerIconFragment: getDiskIconFragment("unknown"),
            footerIconFragment: shouldRenderGaugeFooter
                ? buildDiskThroughputFooterIconFragment(singleThroughputDirection)
                : undefined,
            statusIcon: getMetricStatusIcon("percentage"),
            circleStyleOverride: circleStyle,
            visualSettingsOverride: {
                colorMode: settings.colorMode ?? "solid",
                solidColor: typeof settings.solidColor === "string" ? settings.solidColor : DEFAULT_DISK_THROUGHPUT_COLOR,
            },
        });
    }

    private updateDualThroughputDisplay(event: WillAppearEvent, settings: DiskSettings): void {
        const readMetricKey = getDiskThroughputMetricKey("read");
        const writeMetricKey = getDiskThroughputMetricKey("write");
        const dualGraphicType = settings.graphicType === "circular"
            ? "circular"
            : settings.graphicType === "text" ? "text" : undefined;
        const maximumBytesPerSecond = normalizePositiveNumber(
            settings.maximumDiskThroughputMebibytesPerSecond,
            DEFAULT_MAXIMUM_DISK_THROUGHPUT_MEBIBYTES_PER_SECOND,
        ) * 1024 * 1024;
        const readWidgetData = buildDiskThroughputWidgetData({
            bytesPerSecondWidgetData: metricStore.getWidgetData(readMetricKey, "READ", "B/s"),
            maximumBytesPerSecond,
            label: "READ",
        });
        const writeWidgetData = buildDiskThroughputWidgetData({
            bytesPerSecondWidgetData: metricStore.getWidgetData(writeMetricKey, "WRIT", "B/s"),
            maximumBytesPerSecond,
            label: "WRIT",
        });
        const readColor = resolveDiskWidgetChannelColor("read", settings, readWidgetData);
        const writeColor = resolveDiskWidgetChannelColor("write", settings, writeWidgetData);

        setDualMetricDisplay({
            event,
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
                ? resolveCircleStyle(settings.circleStyle)
                : undefined,
            positiveColor: readColor,
            negativeColor: writeColor,
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
                solidColor: readColor,
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
    customLinearLabel: SettingValue,
    diskVolume: DiskVolumeOption | null,
    fallbackLabel: string,
): string {
    if (typeof customLinearLabel === "string") {
        const normalizedLinearLabel = customLinearLabel.trim();

        if (normalizedLinearLabel.length > 0) {
            return normalizedLinearLabel;
        }
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

export interface DiskSettings {
    graphicType?: SettingValue;
    diskMetricKind?: SettingValue;
    diskUsageDisplayMode?: SettingValue;
    diskThroughputDirection?: SettingValue;
    diskVolumeId?: SettingValue;
    availableDiskVolumes?: SettingValue;
    diskLinearLabel?: SettingValue;
    maximumDiskThroughputMebibytesPerSecond?: SettingValue;
    pollingFrequencySeconds?: SettingValue;
    circleStyle?: SettingValue;
    colorMode?: SettingValue;
    solidColor?: SettingValue;
    diskReadColorMode?: SettingValue;
    diskReadSolidColor?: SettingValue;
    diskReadColorLow?: SettingValue;
    diskReadColorMedium?: SettingValue;
    diskReadColorHigh?: SettingValue;
    diskWriteColorMode?: SettingValue;
    diskWriteSolidColor?: SettingValue;
    diskWriteColorLow?: SettingValue;
    diskWriteColorMedium?: SettingValue;
    diskWriteColorHigh?: SettingValue;
    lowThreshold?: SettingValue;
    highThreshold?: SettingValue;
}

const DEFAULT_MAXIMUM_DISK_THROUGHPUT_MEBIBYTES_PER_SECOND = 1000;
const DEFAULT_DISK_THROUGHPUT_COLOR = "#38bdf8";
const DEFAULT_DISK_READ_COLOR = "#38bdf8";
const DEFAULT_DISK_WRITE_COLOR = "#f472b6";
const DISK_THROUGHPUT_DIRECTION_ICON_COLOR = "rgba(255,255,255,0.88)";
const DISK_THROUGHPUT_DIRECTION_ICON_SIZE = 30;
const DISK_GAUGE_FOOTER_ICON_SIZE = 25;

function normalizeDiskMetricKind(value: SettingValue): "usage" | "throughput" {
    return value === "throughput" ? "throughput" : "usage";
}

function normalizeDiskUsageDisplayMode(value: SettingValue): DiskUsageDisplayMode {
    return value === "space" ? "space" : "percentage";
}

function resolveCircleStyle(value: SettingValue): "value" | "compact" | "gauge" {
    if (value === "compact" || value === "gauge") {
        return value;
    }

    return "value";
}

function resolveSelectedDiskVolume(value: SettingValue): DiskVolumeOption | null {
    if (typeof value === "string" && value.length > 0) {
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

function normalizePositiveNumber(value: SettingValue, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallbackValue;
    }

    return numericValue;
}

function resolveDiskWidgetChannelColor(
    direction: Exclude<DiskThroughputDirection, "total">,
    settings: DiskSettings,
    widgetData: { progress: number },
): string {
    return resolveColor(widgetData.progress * 100, buildDiskChannelColorConfig(direction, settings));
}

function buildDiskChannelColorConfig(direction: Exclude<DiskThroughputDirection, "total">, settings: DiskSettings): ColorConfig {
    if (direction === "read") {
        return {
            mode: settings.diskReadColorMode === "threshold" ? "threshold" : "solid",
            solidColor: resolveHexColor(settings.diskReadSolidColor, DEFAULT_DISK_READ_COLOR),
            thresholds: buildDiskChannelThresholds({
                settings,
                lowColor: resolveHexColor(settings.diskReadColorLow, "#22c55e"),
                mediumColor: resolveHexColor(settings.diskReadColorMedium, DEFAULT_DISK_READ_COLOR),
                highColor: resolveHexColor(settings.diskReadColorHigh, "#60a5fa"),
            }),
        };
    }

    return {
        mode: settings.diskWriteColorMode === "threshold" ? "threshold" : "solid",
        solidColor: resolveHexColor(settings.diskWriteSolidColor, DEFAULT_DISK_WRITE_COLOR),
        thresholds: buildDiskChannelThresholds({
            settings,
            lowColor: resolveHexColor(settings.diskWriteColorLow, "#f97316"),
            mediumColor: resolveHexColor(settings.diskWriteColorMedium, DEFAULT_DISK_WRITE_COLOR),
            highColor: resolveHexColor(settings.diskWriteColorHigh, "#fb7185"),
        }),
    };
}

function buildDiskChannelThresholds(options: {
    settings: DiskSettings;
    lowColor: string;
    mediumColor: string;
    highColor: string;
}): ColorConfig["thresholds"] {
    const lowThreshold = normalizeThreshold(options.settings.lowThreshold, 30);
    const highThreshold = Math.max(lowThreshold, normalizeThreshold(options.settings.highThreshold, 70));

    return [
        { min: 0, max: lowThreshold, color: options.lowColor },
        { min: lowThreshold, max: highThreshold, color: options.mediumColor },
        { min: highThreshold, max: 101, color: options.highColor },
    ];
}

function normalizeThreshold(value: SettingValue, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(numericValue), 0), 100);
}

function resolveHexColor(value: SettingValue, fallbackColor: string): string {
    if (typeof value !== "string") {
        return fallbackColor;
    }

    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallbackColor;
}

function publishDiskVolumeOptions(event: WillAppearEvent, settings: DiskSettings): void {
    const availableDiskVolumes = JSON.stringify(diskVolumeRegistry.getOptions());

    if (settings.availableDiskVolumes === availableDiskVolumes) {
        return;
    }

    event.action.setSettings({
        ...settings,
        availableDiskVolumes,
    }).catch(error => {
        log.error(() => `Failed to publish disk volumes: ${String(error)}`);
    });
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
