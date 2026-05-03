import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
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
import { getDiskIcon, getDiskIconFragment, renderCenteredHardwareIconFragment } from "../widgets/icons/hardware-icons";
import { getMetricStatusIcon } from "../widgets/icons/metric-status-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import { escapeSvgText } from "../rendering/svg-utils";

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
            return [getDiskThroughputMetricKey(normalizeDiskThroughputDirection(settings.diskThroughputDirection))];
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
            linearIconFragment: getDiskIconFragment(selectedVolume?.storageKind ?? "unknown"),
            statusIcon: getMetricStatusIcon("percentage"),
        });
    }

    private updateThroughputDisplay(event: WillAppearEvent, settings: DiskSettings): void {
        if (process.platform !== "darwin") {
            showDiskThroughputUnavailable(event);
            return;
        }

        const throughputDirection = normalizeDiskThroughputDirection(settings.diskThroughputDirection);
        const throughputMetricKey = getDiskThroughputMetricKey(throughputDirection);
        const bytesPerSecondWidgetData = metricStore.getWidgetData(throughputMetricKey, getDiskThroughputLabel(throughputDirection), "B/s");

        setSingleMetricDisplay({
            event,
            metricKey: throughputMetricKey,
            widgetData: buildDiskThroughputWidgetData({
                bytesPerSecondWidgetData,
                maximumBytesPerSecond: normalizePositiveNumber(
                    settings.maximumDiskThroughputMebibytesPerSecond,
                    DEFAULT_MAXIMUM_DISK_THROUGHPUT_MEBIBYTES_PER_SECOND,
                ) * 1024 * 1024,
                label: getDiskThroughputLabel(throughputDirection),
            }),
            centerIconFragment: getDiskIconFragment("unknown"),
            statusIcon: getMetricStatusIcon("percentage"),
            circularCenterContentOverride: settings.circularCenterContent === "icon" ? "icon" : "icon-value-unit",
            visualSettingsOverride: {
                colorMode: settings.colorMode ?? "solid",
                solidColor: typeof settings.solidColor === "string" ? settings.solidColor : DEFAULT_DISK_THROUGHPUT_COLOR,
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

interface DiskSettings {
    diskMetricKind?: SettingValue;
    diskUsageDisplayMode?: SettingValue;
    diskThroughputDirection?: SettingValue;
    diskVolumeId?: SettingValue;
    availableDiskVolumes?: SettingValue;
    diskLinearLabel?: SettingValue;
    maximumDiskThroughputMebibytesPerSecond?: SettingValue;
    pollingFrequencySeconds?: SettingValue;
    circularCenterContent?: SettingValue;
    colorMode?: SettingValue;
    solidColor?: SettingValue;
}

const DEFAULT_MAXIMUM_DISK_THROUGHPUT_MEBIBYTES_PER_SECOND = 1000;
const DEFAULT_DISK_THROUGHPUT_COLOR = "#38bdf8";

function normalizeDiskMetricKind(value: SettingValue): "usage" | "throughput" {
    return value === "throughput" ? "throughput" : "usage";
}

function normalizeDiskUsageDisplayMode(value: SettingValue): DiskUsageDisplayMode {
    return value === "space" ? "space" : "percentage";
}

function normalizeDiskThroughputDirection(value: SettingValue): DiskThroughputDirection {
    if (value === "read" || value === "write") {
        return value;
    }

    return "total";
}

function resolveSelectedDiskVolume(value: SettingValue): DiskVolumeOption | null {
    if (typeof value === "string" && value.length > 0) {
        return diskVolumeRegistry.findById(value);
    }

    return diskVolumeRegistry.resolveDefaultSelection();
}

function getDiskThroughputLabel(direction: DiskThroughputDirection): string {
    if (direction === "read") {
        return "READ";
    }

    if (direction === "write") {
        return "WRIT";
    }

    return "DISK";
}

function normalizePositiveNumber(value: SettingValue, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallbackValue;
    }

    return numericValue;
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
