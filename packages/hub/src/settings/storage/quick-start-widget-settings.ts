import type { ActionKind } from "../../shared/stream-deck-actions";
import { create } from "@bufbuild/protobuf";
import {
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    CpuMetricTargetSchema,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    DiskMetricTargetSchema,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    GpuMetricTargetSchema,
    MemoryMetricTarget_Kind as StoredMemoryMetricKind,
    MemoryMetricTargetSchema,
    MetricSelectionSchema,
    MetricSlotSchema,
    NetworkMetricTarget_Direction as StoredNetworkDirection,
    NetworkMetricTargetSchema,
    SingleMetricWidgetSchema,
    type MetricSelection,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb.js";
import {
    readStoredWidgetSettings,
    writeStoredWidgetSettings,
    type StoredSettingsJsonObject,
} from "./codec";

export interface QuickStartStoredWidgetSettings {
    readonly rawSettings: unknown;
    readonly settingsJsonToPersist: StoredSettingsJsonObject | null;
}

export function resolveQuickStartStoredWidgetSettings(
    rawSettings: unknown,
    actionKind: ActionKind,
): QuickStartStoredWidgetSettings {
    const quickStartTarget = buildQuickStartMetricTarget(actionKind);
    if (!quickStartTarget) {
        return {
            rawSettings,
            settingsJsonToPersist: null,
        };
    }

    const storedSettings = readStoredWidgetSettings(rawSettings);

    if (hasStoredMetricTarget(storedSettings)) {
        return {
            rawSettings,
            settingsJsonToPersist: null,
        };
    }

    const settingsJson = writeQuickStartStoredWidgetSettings(storedSettings, quickStartTarget);
    return {
        rawSettings: settingsJson,
        settingsJsonToPersist: settingsJson,
    };
}

function buildQuickStartMetricTarget(actionKind: ActionKind): MetricSelection["target"] | null {
    switch (actionKind) {
        case "cpu-usage":
            return {
                case: "cpu",
                value: create(CpuMetricTargetSchema, { kind: StoredCpuMetricKind.USAGE }),
            };
        case "ram":
            return {
                case: "memory",
                value: create(MemoryMetricTargetSchema, { kind: StoredMemoryMetricKind.USAGE }),
            };
        case "net-speed":
            return {
                case: "network",
                value: create(NetworkMetricTargetSchema, { direction: StoredNetworkDirection.BOTH }),
            };
        case "disk":
            return {
                case: "disk",
                value: create(DiskMetricTargetSchema, { kind: StoredDiskMetricKind.USAGE }),
            };
        case "gpu-usage":
            return {
                case: "gpu",
                value: create(GpuMetricTargetSchema, { kind: StoredGpuMetricKind.USAGE }),
            };
        case "gpu-temp":
            return {
                case: "gpu",
                value: create(GpuMetricTargetSchema, { kind: StoredGpuMetricKind.TEMPERATURE }),
            };
        case "gpu-vram":
            return {
                case: "gpu",
                value: create(GpuMetricTargetSchema, { kind: StoredGpuMetricKind.VRAM }),
            };
        case "gpu-power":
            return {
                case: "gpu",
                value: create(GpuMetricTargetSchema, { kind: StoredGpuMetricKind.POWER }),
            };
        case "unknown":
            return null;
    }
}

function hasStoredMetricTarget(settings: StoredWidgetSettings): boolean {
    if (settings.widget.case !== "singleMetric") {
        return settings.widget.case !== undefined;
    }

    return settings.widget.value.slot?.metric?.target.case !== undefined;
}

function writeQuickStartStoredWidgetSettings(
    settings: StoredWidgetSettings,
    target: MetricSelection["target"],
): StoredSettingsJsonObject {
    if (settings.widget.case !== "singleMetric") {
        settings.widget = {
            case: "singleMetric",
            value: create(SingleMetricWidgetSchema),
        };
    }

    const slot = settings.widget.value.slot ??= create(MetricSlotSchema);
    const metric = slot.metric ??= create(MetricSelectionSchema);
    metric.target = target;

    return writeStoredWidgetSettings(settings);
}
