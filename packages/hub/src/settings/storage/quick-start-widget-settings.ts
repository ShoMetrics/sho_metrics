import type { ActionKind } from "../../shared/stream-deck-actions";
import { create } from "@bufbuild/protobuf";
import {
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    CatalogMetricTargetSchema,
    CpuMetricTargetSchema,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    DiskMetricTargetSchema,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    GpuMetricTargetSchema,
    MemoryMetricTarget_Kind as StoredMemoryMetricKind,
    MemoryMetricTargetSchema,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    MetricSourcePolicySchema,
    MetricSelectionSchema,
    MetricSlotSchema,
    NetworkMetricTarget_Kind as StoredNetworkMetricKind,
    NetworkMetricTarget_Traffic_Direction as StoredNetworkDirection,
    NetworkMetricTarget_TrafficSchema,
    NetworkMetricTargetSchema,
    SingleMetricWidgetSchema,
    type MetricSelection,
    type MetricSourcePolicy,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb.js";
import { BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID } from "../../runtime/sources/source-ids";
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
    const quickStartMetric = buildQuickStartMetric(actionKind);
    const readResult = readStoredWidgetSettings(rawSettings);
    const storedSettings = readResult.settings;

    if (!quickStartMetric) {
        return {
            rawSettings,
            settingsJsonToPersist: null,
            readWarning: readResult.warning,
            storedSettings,
        };
    }

    const readableSettingsJson = writeStoredWidgetSettings(storedSettings);

    if (hasStoredMetricTarget(storedSettings)) {
        if (shouldBackfillQuickStartSourcePolicy(storedSettings, quickStartMetric)) {
            const settingsJson = writeQuickStartSourcePolicy(storedSettings, quickStartMetric.sourcePolicy);
            return {
                rawSettings: settingsJson,
                settingsJsonToPersist: settingsJson,
                readWarning: readResult.warning,
                storedSettings,
            };
        }

        return {
            rawSettings: readableSettingsJson,
            settingsJsonToPersist: null,
            readWarning: readResult.warning,
            storedSettings,
        };
    }

    const settingsJson = writeQuickStartStoredWidgetSettings(storedSettings, quickStartMetric);
    return {
        rawSettings: settingsJson,
        settingsJsonToPersist: settingsJson,
        readWarning: readResult.warning,
        storedSettings,
    };
}

interface QuickStartMetric {
    readonly target: MetricSelection["target"];
    readonly sourcePolicy?: MetricSourcePolicy | undefined;
}

function buildQuickStartMetric(actionKind: ActionKind): QuickStartMetric | null {
    switch (actionKind) {
        case "cpu":
            return {
                target: {
                    case: "cpu",
                    value: create(CpuMetricTargetSchema, { kind: StoredCpuMetricKind.USAGE }),
                },
            };
        case "memory":
            return {
                target: {
                    case: "memory",
                    value: create(MemoryMetricTargetSchema, { kind: StoredMemoryMetricKind.USAGE }),
                },
            };
        case "network":
            return {
                target: {
                    case: "network",
                    value: create(NetworkMetricTargetSchema, {
                        kind: StoredNetworkMetricKind.TRAFFIC,
                        traffic: create(NetworkMetricTarget_TrafficSchema, {
                            direction: StoredNetworkDirection.BOTH,
                        }),
                    }),
                },
            };
        case "disk":
            return {
                target: {
                    case: "disk",
                    value: create(DiskMetricTargetSchema, { kind: StoredDiskMetricKind.USAGE }),
                },
            };
        case "catalog":
            return {
                target: {
                    case: "catalog",
                    value: create(CatalogMetricTargetSchema),
                },
                sourcePolicy: create(MetricSourcePolicySchema, {
                    primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
                    failureMode: StoredSourceFailureMode.SHOW_UNAVAILABLE,
                }),
            };
        case "gpu":
            return {
                target: {
                    case: "gpu",
                    value: create(GpuMetricTargetSchema, { kind: StoredGpuMetricKind.USAGE }),
                },
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

function shouldBackfillQuickStartSourcePolicy(
    settings: StoredWidgetSettings,
    quickStartMetric: QuickStartMetric,
): quickStartMetric is QuickStartMetric & { readonly sourcePolicy: MetricSourcePolicy } {
    if (quickStartMetric.sourcePolicy === undefined) {
        return false;
    }

    const metric = readStoredMetricSelection(settings);
    if (metric === undefined) {
        return false;
    }

    return metric.target.case === quickStartMetric.target.case
        && metric.sourcePolicy === undefined;
}

function readStoredMetricSelection(settings: StoredWidgetSettings): MetricSelection | undefined {
    return settings.widget.case === "singleMetric"
        ? settings.widget.value.slot?.metric
        : undefined;
}

function writeQuickStartSourcePolicy(
    settings: StoredWidgetSettings,
    sourcePolicy: MetricSourcePolicy,
): StoredSettingsJsonObject {
    const metric = readStoredMetricSelection(settings);
    if (metric) {
        metric.sourcePolicy = sourcePolicy;
    }

    return writeStoredWidgetSettings(settings);
}

function writeQuickStartStoredWidgetSettings(
    settings: StoredWidgetSettings,
    quickStartMetric: QuickStartMetric,
): StoredSettingsJsonObject {
    if (settings.widget.case !== "singleMetric") {
        settings.widget = {
            case: "singleMetric",
            value: create(SingleMetricWidgetSchema),
        };
    }

    const slot = settings.widget.value.slot ??= create(MetricSlotSchema);
    const metric = slot.metric ??= create(MetricSelectionSchema);
    metric.target = quickStartMetric.target;
    if (quickStartMetric.sourcePolicy !== undefined) {
        metric.sourcePolicy = quickStartMetric.sourcePolicy;
    }

    return writeStoredWidgetSettings(settings);
}
