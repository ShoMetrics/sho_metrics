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
    NetworkMetricTarget_Kind as StoredNetworkMetricKind,
    NetworkMetricTarget_Traffic_Direction as StoredNetworkDirection,
    NetworkMetricTarget_TrafficSchema,
    NetworkMetricTargetSchema,
    SingleMetricWidgetSchema,
    type MetricSelection,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb.js";
import {
    readStoredWidgetSettings,
    type StoredSettingsReadWarning,
    writeStoredWidgetSettings,
    type StoredSettingsJsonObject,
} from "./codec";

export interface QuickStartStoredWidgetSettings {
    readonly rawSettings: unknown;
    readonly settingsJsonToPersist: StoredSettingsJsonObject | null;
    readonly readWarning: StoredSettingsReadWarning | null;
    readonly storedSettings: StoredWidgetSettings;
}

export function resolveQuickStartStoredWidgetSettings(
    rawSettings: unknown,
    actionKind: ActionKind,
): QuickStartStoredWidgetSettings {
    const quickStartTarget = buildQuickStartMetricTarget(actionKind);
    const readResult = readStoredWidgetSettings(rawSettings);
    const storedSettings = readResult.settings;

    if (!quickStartTarget) {
        return {
            rawSettings,
            settingsJsonToPersist: null,
            readWarning: readResult.warning,
            storedSettings,
        };
    }

    const readableSettingsJson = writeStoredWidgetSettings(storedSettings);

    if (hasStoredMetricTarget(storedSettings)) {
        return {
            rawSettings: readableSettingsJson,
            settingsJsonToPersist: null,
            readWarning: readResult.warning,
            storedSettings,
        };
    }

    const settingsJson = writeQuickStartStoredWidgetSettings(storedSettings, quickStartTarget);
    return {
        rawSettings: settingsJson,
        settingsJsonToPersist: settingsJson,
        readWarning: readResult.warning,
        storedSettings,
    };
}

function buildQuickStartMetricTarget(actionKind: ActionKind): MetricSelection["target"] | null {
    switch (actionKind) {
        case "cpu":
            return {
                case: "cpu",
                value: create(CpuMetricTargetSchema, { kind: StoredCpuMetricKind.USAGE }),
            };
        case "memory":
            return {
                case: "memory",
                value: create(MemoryMetricTargetSchema, { kind: StoredMemoryMetricKind.USAGE }),
            };
        case "network":
            return {
                case: "network",
                value: create(NetworkMetricTargetSchema, {
                    kind: StoredNetworkMetricKind.TRAFFIC,
                    traffic: create(NetworkMetricTarget_TrafficSchema, {
                        direction: StoredNetworkDirection.BOTH,
                    }),
                }),
            };
        case "disk":
            return {
                case: "disk",
                value: create(DiskMetricTargetSchema, { kind: StoredDiskMetricKind.USAGE }),
            };
        case "gpu":
            return {
                case: "gpu",
                value: create(GpuMetricTargetSchema, { kind: StoredGpuMetricKind.USAGE }),
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
