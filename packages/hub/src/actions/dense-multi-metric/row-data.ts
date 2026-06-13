import type { MetricStoreReader } from "../../runtime/metric-store";
import {
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
} from "../../runtime/metric-keys";
import {
    getDiskThroughputMetricKey,
    resolveDiskUsageMetricKey,
} from "../../runtime/disk-metric-keys";
import {
    getNetworkPingLatencyMetricKey,
    resolveNetworkMetricKey,
} from "../../runtime/network-metric-keys";
import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
    type MetricReadRoute,
} from "../../runtime/source-routing/metric-read-plan";
import { buildMetricReadPlanFromSourcePolicy } from "../../runtime/source-routing/metric-read-plan-builder";
import { buildCustomHttpMetricReadPlan } from "../../runtime/source-routing/custom-http-read-plan";
import {
    buildDenseCustomHttpConsumerSlug,
    type CustomHttpRuntimeIdentity,
} from "../../runtime/sources/custom-http/custom-http-metric-key";
import { pluginGlobalSettingsStore } from "../../settings/global-settings-store";
import type {
    ResolvedDenseMetricSlot,
    ResolvedDenseMultiMetricWidget,
    ResolvedDiskMetricTarget,
    ResolvedGpuMetricTarget,
    ResolvedMetricSourcePolicy,
    ResolvedMetricTarget,
    ResolvedNetworkMetricTarget,
    DiskThroughputDirection,
    NetworkDirection,
} from "../../settings/resolved-settings";
import { buildTemperatureWidgetData } from "../../metrics/temperature-widget-data";
import { buildPowerWidgetData } from "../../metrics/power-widget-data";
import { buildGpuPowerWidgetData } from "../../metrics/gpu-power-widget-data";
import { buildGpuUsageWidgetData, buildGpuVramWidgetData } from "../gpu";
import { buildCpuUsageWidgetData } from "../cpu";
import {
    buildDiskThroughputWidgetData,
    buildDiskUsageWidgetData,
    buildMemoryUsageWidgetData,
} from "../../metrics/storage-widget-data";
import { buildNetworkPingWidgetData } from "../../metrics/network-ping-widget-data";
import { buildNetworkSpeedWidgetData } from "../../metrics/network-speed-widget-data";
import { resolveCatalogMetricDefaultMaximumValue } from "../../metrics/catalog-metric-scale";
import { formatCatalogMetricFreshWidgetData } from "../../metrics/catalog-metric-widget-data";
import { formatMetricUnit } from "../../metrics/metric-unit-format";
import { PROGRESS_CIRCLE_LABELS } from "../../widgets/primitives/progress-circle-label";
import type { WidgetData } from "../../view-rendering/widget-data";
import type { DiskThroughputMetricDirection } from "../../runtime/disk-metric-keys";
import { resolveDiskMaximumThroughputMebibytesPerSecond } from "../disk/view-builder";
import {
    NETWORK_SAMPLE_STALE_MS,
    resolveNetworkMaximumBytesPerSecond as resolveSingleMetricNetworkMaximumBytesPerSecond,
    type ResolvedNetworkTrafficMetricTarget,
} from "../network/view-builder";
import { resolveCustomHttpMetricDefinition } from "../custom-metric/runtime-source-definition";
import { readCustomHttpWidgetData } from "../custom-metric/custom-http-widget-data";

export interface DenseMetricWidgetData {
    readonly rows: readonly DenseMetricRowWidgetData[];
}

export type DenseMetricRowWidgetData =
    | DenseMetricConfiguredRowWidgetData
    | DenseMetricUnconfiguredRowWidgetData;

export interface DenseMetricConfiguredRowWidgetData {
    readonly rowKind: "configured";
    readonly slotId: string;
    readonly metricKey: string;
    readonly widgetData: WidgetData;
}

export interface DenseMetricUnconfiguredRowWidgetData {
    readonly rowKind: "unconfigured";
    readonly slotId: string;
    readonly reason: DenseMetricUnconfiguredReason;
    readonly widgetData: WidgetData;
}

export type DenseMetricUnconfiguredReason =
    | "conflictingSourcePolicy"
    | "emptyCatalogMetric"
    | "emptyCustomMetric";

interface DenseMetricConfiguredRow {
    readonly rowKind: "configured";
    readonly slotId: string;
    readonly displayMetricKey: string;
    readonly subscriptionMetricKeys: readonly string[];
    readonly target: ResolvedMetricTarget;
    readonly sourcePolicy: ResolvedMetricSourcePolicy;
    readonly customHttpIdentity?: CustomHttpRuntimeIdentity | undefined;
    readonly customLabel: string | undefined;
    readonly customMaximumValue: number | undefined;
}

interface DenseMetricKeys {
    readonly displayMetricKey: string;
    readonly subscriptionMetricKeys: readonly string[];
}

interface DenseMetricUnconfiguredRow {
    readonly rowKind: "unconfigured";
    readonly slotId: string;
    readonly reason: DenseMetricUnconfiguredReason;
    readonly label: string;
}

export type DenseMetricRow = DenseMetricConfiguredRow | DenseMetricUnconfiguredRow;

export interface DenseMetricReadPlanResolution {
    readonly readPlan: MetricReadPlan;
    readonly rows: readonly DenseMetricRow[];
}

export interface DenseMetricReadPlanOptions {
    readonly widget: ResolvedDenseMultiMetricWidget;
    /**
     * Runtime action id used only by Custom HTTP rows to derive action-local keys.
     *
     * Tests and static previews may omit it; configured Custom HTTP rows then
     * resolve as empty instead of inventing a fake runtime identity.
     */
    readonly actionId?: string | undefined;
    readonly platform?: NodeJS.Platform;
}

export interface DenseMetricWidgetDataOptions extends DenseMetricReadPlanOptions {
    readonly metrics: MetricStoreReader;
    readonly currentTimestampMilliseconds: number;
}

/** Builds a dense widget read plan while downgrading conflicting rows before normalization. */
export function buildDenseMetricReadPlan(options: DenseMetricReadPlanOptions): DenseMetricReadPlanResolution {
    const rows = resolveDenseMetricRows(options.widget, options.actionId);
    const acceptedRouteByMetricKey = new Map<string, MetricReadRoute>();
    const resolvedRows: DenseMetricRow[] = [];

    for (const row of rows) {
        if (row.rowKind === "unconfigured") {
            resolvedRows.push(row);
            continue;
        }

        const rowReadPlan = buildDenseRowReadPlan(row, options.platform);
        const rowRoutes = rowReadPlan.metrics;
        // normalizeMetricReadPlan rejects conflicting routes for the same key.
        // Dense treats that as a row-level configuration problem so one bad row
        // cannot blank the entire widget.
        if (rowRoutes.some(route => hasConflictingAcceptedRoute(acceptedRouteByMetricKey, route))) {
            resolvedRows.push({
                rowKind: "unconfigured",
                slotId: row.slotId,
                reason: "conflictingSourcePolicy",
                label: resolveDenseRowLabel(row),
            });
            continue;
        }

        for (const route of rowRoutes) {
            if (!acceptedRouteByMetricKey.has(route.metricKey)) {
                acceptedRouteByMetricKey.set(route.metricKey, route);
            }
        }
        resolvedRows.push(row);
    }

    return {
        readPlan: normalizeMetricReadPlan({ metrics: [...acceptedRouteByMetricKey.values()] }),
        rows: resolvedRows,
    };
}

/** Builds renderer-facing dense row data from the resolved row read plan. */
export function buildDenseMetricWidgetData(options: DenseMetricWidgetDataOptions): DenseMetricWidgetData {
    const readPlanResolution = buildDenseMetricReadPlan(options);

    return {
        rows: readPlanResolution.rows.map(row => row.rowKind === "configured"
            ? buildConfiguredRowWidgetData(row, options.metrics, options.currentTimestampMilliseconds)
            : buildUnconfiguredRowWidgetData(row)),
    };
}

function resolveDenseMetricRows(
    widget: ResolvedDenseMultiMetricWidget,
    actionId: string | undefined,
): readonly DenseMetricRow[] {
    return widget.slots.map(row => resolveDenseMetricRow(row, actionId));
}

function resolveDenseMetricRow(row: ResolvedDenseMetricSlot, actionId: string | undefined): DenseMetricRow {
    const target = row.slot.metric.target;

    if (target.domain === "catalog" && target.metricId.length === 0) {
        return {
            rowKind: "unconfigured",
            slotId: row.slotId,
            reason: "emptyCatalogMetric",
            label: row.customLabel ?? "METRIC",
        };
    }

    const metricKeys = resolveDenseMetricKeys(target, actionId, row.slotId);
    if (metricKeys === undefined) {
        return {
            rowKind: "unconfigured",
            slotId: row.slotId,
            reason: "emptyCustomMetric",
            label: row.customLabel ?? resolveDefaultDenseRowLabel(target),
        };
    }

    return {
        rowKind: "configured",
        slotId: row.slotId,
        displayMetricKey: metricKeys.displayMetricKey,
        subscriptionMetricKeys: metricKeys.subscriptionMetricKeys,
        target,
        sourcePolicy: row.slot.metric.source,
        customHttpIdentity: metricKeys.customHttpIdentity,
        customLabel: row.customLabel,
        customMaximumValue: row.customMaximumValue,
    };
}

function resolveDenseMetricKeys(
    target: ResolvedMetricTarget,
    actionId: string | undefined,
    slotId: string,
): (DenseMetricKeys & { readonly customHttpIdentity?: CustomHttpRuntimeIdentity | undefined }) | undefined {
    switch (target.domain) {
        case "cpu":
            return resolveCpuDenseMetricKeys(target);
        case "memory":
            return {
                displayMetricKey: RAM_USED_METRIC_KEY,
                subscriptionMetricKeys: [RAM_USED_METRIC_KEY, RAM_TOTAL_METRIC_KEY],
            };
        case "gpu":
            return resolveGpuDenseMetricKeys(target);
        case "disk":
            return resolveDiskDenseMetricKeys(target);
        case "network":
            return resolveNetworkDenseMetricKeys(target);
        case "catalog":
            return buildSingleKey(target.metricId);
        case "customMetric": {
            if (actionId === undefined) {
                return undefined;
            }
            const definition = resolveCustomHttpMetricDefinition({
                target,
                actionId,
                consumerSlug: buildDenseCustomHttpConsumerSlug(slotId),
            });
            return definition === undefined
                ? undefined
                : {
                    ...buildSingleKey(definition.identity.metricKey),
                    customHttpIdentity: definition.identity,
                };
        }
    }
}

function resolveCpuDenseMetricKeys(target: Extract<ResolvedMetricTarget, { readonly domain: "cpu" }>): DenseMetricKeys {
    switch (target.reading.kind) {
        case "usage":
            return buildSingleKey(CPU_USAGE_METRIC_KEY);
        case "temperature":
            return buildSingleKey(CPU_TEMP_METRIC_KEY);
        case "power":
            return buildSingleKey(CPU_POWER_METRIC_KEY);
    }
}

function resolveGpuDenseMetricKeys(target: ResolvedGpuMetricTarget): DenseMetricKeys {
    switch (target.reading.kind) {
        case "usage":
            return buildSingleKey(GPU_USAGE_METRIC_KEY);
        case "temperature":
            return buildSingleKey(GPU_TEMP_METRIC_KEY);
        case "vram":
            return {
                displayMetricKey: GPU_VRAM_USED_METRIC_KEY,
                subscriptionMetricKeys: [GPU_VRAM_USED_METRIC_KEY, GPU_VRAM_TOTAL_METRIC_KEY],
            };
        case "power":
            return buildSingleKey(GPU_POWER_METRIC_KEY);
    }
}

function resolveDiskDenseMetricKeys(target: ResolvedDiskMetricTarget): DenseMetricKeys | undefined {
    if (target.reading.kind === "usage") {
        const usedMetricKey = resolveDiskUsageMetricKey("used", target.volumeId);
        return {
            displayMetricKey: usedMetricKey,
            subscriptionMetricKeys: [
                usedMetricKey,
                resolveDiskUsageMetricKey("total", target.volumeId),
                resolveDiskUsageMetricKey("available", target.volumeId),
            ],
        };
    }

    // Single disk throughput can show read and write as two channels. Dense
    // rows have one progress value, so the PI offers read/write only.
    if (target.reading.direction === "both") {
        return undefined;
    }

    return buildSingleKey(getDiskThroughputMetricKey(target.reading.direction));
}

function resolveNetworkDenseMetricKeys(target: ResolvedNetworkMetricTarget): DenseMetricKeys | undefined {
    if (target.reading.kind === "ping") {
        return buildSingleKey(getNetworkPingLatencyMetricKey(target.reading.targetHost));
    }

    // Single network traffic can render upload and download together. Dense
    // rows intentionally keep one direction per row for predictable spacing.
    if (target.reading.direction === "both") {
        return undefined;
    }

    return buildSingleKey(resolveNetworkMetricKey(target.reading.direction, target.reading.interfaceId));
}

function buildConfiguredRowWidgetData(
    row: DenseMetricConfiguredRow,
    metrics: MetricStoreReader,
    currentTimestampMilliseconds: number,
): DenseMetricConfiguredRowWidgetData {
    return {
        rowKind: "configured",
        slotId: row.slotId,
        metricKey: row.displayMetricKey,
        widgetData: buildTargetWidgetData(row, metrics, currentTimestampMilliseconds),
    };
}

function buildTargetWidgetData(
    row: DenseMetricConfiguredRow,
    metrics: MetricStoreReader,
    currentTimestampMilliseconds: number,
): WidgetData {
    switch (row.target.domain) {
        case "cpu":
            return buildCpuRowWidgetData(row, metrics);
        case "memory":
            return buildMemoryUsageWidgetData({
                usedBytesWidgetData: metrics.getWidgetData(RAM_USED_METRIC_KEY, resolveDenseRowLabel(row), "B"),
                totalBytes: metrics.getWidgetData(RAM_TOTAL_METRIC_KEY, resolveDenseRowLabel(row), "B").current,
                label: resolveDenseRowLabel(row),
            });
        case "gpu":
            return buildGpuRowWidgetData(row, metrics);
        case "disk":
            return buildDiskRowWidgetData(row, metrics);
        case "network":
            return buildNetworkRowWidgetData(row, metrics, currentTimestampMilliseconds);
        case "catalog":
            return buildCatalogRowWidgetData(row, metrics);
        case "customMetric":
            return readCustomHttpWidgetData({
                metrics,
                metricKey: row.displayMetricKey,
                shouldCompactCircleLabel: false,
                displayOverrides: {
                    label: row.customLabel,
                    maximum: row.customMaximumValue,
                },
            }).widgetData;
    }
}

function buildCpuRowWidgetData(row: DenseMetricConfiguredRow, metrics: MetricStoreReader): WidgetData {
    if (row.target.domain !== "cpu") {
        throw new Error("Expected CPU dense row.");
    }

    const label = resolveDenseRowLabel(row);

    switch (row.target.reading.kind) {
        case "usage":
            return buildCpuUsageWidgetData(metrics.getWidgetData(
                CPU_USAGE_METRIC_KEY,
                label,
                "%",
                row.customMaximumValue,
            ));
        case "temperature":
            return buildTemperatureWidgetData({
                celsiusWidgetData: metrics.getWidgetData(
                    CPU_TEMP_METRIC_KEY,
                    label,
                    "C",
                    row.customMaximumValue ?? row.target.reading.maximumCelsius,
                ),
                maximumCelsius: row.customMaximumValue ?? row.target.reading.maximumCelsius,
                unit: row.target.reading.unit,
            });
        case "power":
            return buildPowerWidgetData({
                powerWidgetData: metrics.getWidgetData(
                    CPU_POWER_METRIC_KEY,
                    label,
                    "W",
                    row.customMaximumValue ?? row.target.reading.maximumWatts,
                ),
                maximumPowerWatts: row.customMaximumValue ?? row.target.reading.maximumWatts,
            });
    }
}

function buildGpuRowWidgetData(row: DenseMetricConfiguredRow, metrics: MetricStoreReader): WidgetData {
    if (row.target.domain !== "gpu") {
        throw new Error("Expected GPU dense row.");
    }

    const label = resolveDenseRowLabel(row);
    switch (row.target.reading.kind) {
        case "usage":
            return buildGpuUsageWidgetData(metrics.getWidgetData(
                GPU_USAGE_METRIC_KEY,
                label,
                "%",
                row.customMaximumValue,
            ));
        case "temperature":
            return buildTemperatureWidgetData({
                celsiusWidgetData: metrics.getWidgetData(
                    GPU_TEMP_METRIC_KEY,
                    label,
                    "C",
                    row.customMaximumValue ?? row.target.reading.maximumCelsius,
                ),
                maximumCelsius: row.customMaximumValue ?? row.target.reading.maximumCelsius,
                unit: row.target.reading.unit,
            });
        case "vram":
            return {
                ...buildGpuVramWidgetData(
                    metrics.getWidgetData(GPU_VRAM_USED_METRIC_KEY, label, "MB"),
                    metrics.getWidgetData(GPU_VRAM_TOTAL_METRIC_KEY, label, "MB").current,
                ),
                label,
            };
        case "power":
            return buildGpuPowerWidgetData({
                powerWidgetData: metrics.getWidgetData(
                    GPU_POWER_METRIC_KEY,
                    label,
                    "W",
                    row.customMaximumValue ?? row.target.reading.maximumWatts,
                ),
                maximumPowerWatts: row.customMaximumValue ?? row.target.reading.maximumWatts,
            });
    }
}

function buildDiskRowWidgetData(row: DenseMetricConfiguredRow, metrics: MetricStoreReader): WidgetData {
    if (row.target.domain !== "disk") {
        throw new Error("Expected disk dense row.");
    }

    const label = resolveDenseRowLabel(row);
    if (row.target.reading.kind === "usage") {
        return buildDiskUsageWidgetData({
            usedBytesWidgetData: metrics.getWidgetData(resolveDiskUsageMetricKey("used", row.target.volumeId), label, "B"),
            totalBytes: metrics.getWidgetData(resolveDiskUsageMetricKey("total", row.target.volumeId), label, "B").current,
            availableBytes: metrics.getWidgetData(resolveDiskUsageMetricKey("available", row.target.volumeId), label, "B").current,
            displayMode: row.target.reading.displayMode,
            label,
        });
    }

    const direction = requireSupportedDiskThroughputDirection(row.target.reading.direction);
    return buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: metrics.getWidgetData(getDiskThroughputMetricKey(direction), label, "B/s"),
        maximumBytesPerSecond: resolveDiskMaximumBytesPerSecond(row, direction),
        label,
    });
}

function buildNetworkRowWidgetData(
    row: DenseMetricConfiguredRow,
    metrics: MetricStoreReader,
    currentTimestampMilliseconds: number,
): WidgetData {
    if (row.target.domain !== "network") {
        throw new Error("Expected network dense row.");
    }

    const label = resolveDenseRowLabel(row);
    if (row.target.reading.kind === "ping") {
        const sourceWidgetData = metrics.getWidgetData(
            row.displayMetricKey,
            label,
            "ms",
            row.customMaximumValue,
        );

        return buildNetworkPingWidgetData({
            latencyMilliseconds: sourceWidgetData.current,
            historyLatencyMilliseconds: sourceWidgetData.history,
            sampleTimestampMilliseconds: sourceWidgetData.sampleTimestampMilliseconds,
        });
    }

    const trafficTarget: ResolvedNetworkTrafficMetricTarget = {
        ...row.target,
        reading: row.target.reading,
    };
    const direction = requireSupportedNetworkTrafficDirection(trafficTarget.reading.direction);
    const sourceWidgetData = metrics.getWidgetData(row.displayMetricKey, label, "B/s");
    if (
        sourceWidgetData.sampleTimestampMilliseconds === undefined
        || currentTimestampMilliseconds - sourceWidgetData.sampleTimestampMilliseconds > NETWORK_SAMPLE_STALE_MS
    ) {
        return buildEmptyRowWidgetData(label);
    }

    return buildNetworkSpeedWidgetData({
        bytesPerSecond: sourceWidgetData.current,
        historyBytesPerSecond: sourceWidgetData.history,
        maximumBytesPerSecond: row.customMaximumValue
            ?? resolveSingleMetricNetworkMaximumBytesPerSecond(direction, trafficTarget),
        label,
        unitBase: trafficTarget.reading.display.unitBase,
        maximumDisplayDigits: 3,
        sampleTimestampMilliseconds: sourceWidgetData.sampleTimestampMilliseconds,
    });
}

function buildCatalogRowWidgetData(row: DenseMetricConfiguredRow, metrics: MetricStoreReader): WidgetData {
    if (row.target.domain !== "catalog") {
        throw new Error("Expected catalog dense row.");
    }

    const unit = formatMetricUnit(row.target.detectedUnit);
    const maxValue = row.customMaximumValue
        ?? row.target.customMaximumValue
        ?? resolveCatalogMetricDefaultMaximumValue(
            row.target.detectedUnit,
            row.target.detectedCategory,
            row.target.detectedReadingKind,
        );
    const widgetData = metrics.getWidgetData(row.target.metricId, resolveDenseRowLabel(row), unit, maxValue);

    return formatCatalogMetricFreshWidgetData({
        widgetData,
        unit: row.target.detectedUnit,
        category: row.target.detectedCategory,
    });
}

function buildUnconfiguredRowWidgetData(row: DenseMetricUnconfiguredRow): DenseMetricUnconfiguredRowWidgetData {
    return {
        rowKind: "unconfigured",
        slotId: row.slotId,
        reason: row.reason,
        widgetData: buildEmptyRowWidgetData(row.label),
    };
}

function buildEmptyRowWidgetData(label: string): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        label,
        unit: "",
    };
}

function buildSingleKey(metricKey: string): {
    readonly displayMetricKey: string;
    readonly subscriptionMetricKeys: readonly string[];
} {
    return {
        displayMetricKey: metricKey,
        subscriptionMetricKeys: [metricKey],
    };
}

function buildDenseRowReadPlan(row: DenseMetricConfiguredRow, platform: NodeJS.Platform | undefined): MetricReadPlan {
    if (row.customHttpIdentity !== undefined) {
        return buildCustomHttpMetricReadPlan([row.customHttpIdentity]);
    }

    return buildMetricReadPlanFromSourcePolicy({
        metricKeys: row.subscriptionMetricKeys,
        sourcePolicy: row.sourcePolicy,
        defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
        platform,
    });
}

function hasConflictingAcceptedRoute(
    acceptedRouteByMetricKey: ReadonlyMap<string, MetricReadRoute>,
    route: MetricReadRoute,
): boolean {
    const acceptedRoute = acceptedRouteByMetricKey.get(route.metricKey);

    return acceptedRoute !== undefined && buildRouteIdentity(acceptedRoute) !== buildRouteIdentity(route);
}

function buildRouteIdentity(route: MetricReadRoute): string {
    return JSON.stringify([
        route.metricKey,
        route.sourceScopeId,
        route.failureMode,
        route.sourceCandidates.map(sourceCandidate => sourceCandidate.sourceId),
    ]);
}

function resolveDenseRowLabel(row: DenseMetricConfiguredRow): string {
    return row.customLabel ?? resolveDefaultDenseRowLabel(row.target);
}

function resolveDefaultDenseRowLabel(target: ResolvedMetricTarget): string {
    switch (target.domain) {
        case "cpu":
            return PROGRESS_CIRCLE_LABELS.cpu;
        case "memory":
            return PROGRESS_CIRCLE_LABELS.ram;
        case "gpu":
            return target.reading.kind === "vram" ? PROGRESS_CIRCLE_LABELS.vram : PROGRESS_CIRCLE_LABELS.gpu;
        case "disk":
            return target.reading.kind === "throughput" ? "DISK" : "DSK";
        case "network":
            return target.reading.kind === "ping"
                ? "PING"
                : resolveNetworkDirectionLabel(target.reading.direction);
        case "catalog":
            return target.customLabel ?? target.detectedLabel ?? "METRIC";
        case "customMetric":
            return "CUSTOM";
    }
}

function resolveNetworkDirectionLabel(direction: NetworkDirection): string {
    switch (direction) {
        case "download":
            return PROGRESS_CIRCLE_LABELS.download;
        case "upload":
            return PROGRESS_CIRCLE_LABELS.upload;
        case "both":
            return "NET";
    }
}

function resolveDiskMaximumBytesPerSecond(
    row: DenseMetricConfiguredRow,
    direction: DiskThroughputMetricDirection,
): number {
    if (row.target.domain !== "disk" || row.target.reading.kind !== "throughput") {
        throw new Error("Expected disk throughput dense row.");
    }

    if (row.customMaximumValue !== undefined && row.customMaximumValue > 0) {
        return row.customMaximumValue;
    }

    return resolveDiskMaximumThroughputMebibytesPerSecond(direction, row.target.reading, null) * 1024 * 1024;
}

function requireSupportedDiskThroughputDirection(direction: DiskThroughputDirection): DiskThroughputMetricDirection {
    if (direction === "read" || direction === "write") {
        return direction;
    }

    throw new Error(`Dense metric read plan allowed unsupported disk direction: ${direction}.`);
}

function requireSupportedNetworkTrafficDirection(
    direction: NetworkDirection,
): Exclude<NetworkDirection, "both"> {
    if (direction !== "both") {
        return direction;
    }

    throw new Error("Dense metric read plan allowed unsupported network direction: both.");
}
