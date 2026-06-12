import type { ActionKind } from "../../shared/stream-deck-actions";
import { create } from "@bufbuild/protobuf";
import {
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    CatalogMetricTargetSchema,
    CustomMetricTargetSchema,
    CpuMetricTargetSchema,
    DenseMetricSlotSchema,
    DenseMultiMetricWidgetSchema,
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
    StackedMetricSlotSchema,
    StackedMetricWidgetSchema,
    type MetricSelection,
    type MetricSourcePolicy,
    type StoredWidgetSettings,
} from "../../generated/proto/shometrics/v1/settings_pb.js";
import { BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID } from "../../runtime/sources/source-ids";
import {
    readStoredWidgetSettings,
    type StoredSettingsReadWarning,
    writeStoredWidgetSettings,
    type StoredSettingsJsonObject,
} from "./codec";
import {
    createDefaultSlotId,
    type SlotIdGenerator,
} from "./slot-id";

export interface QuickStartStoredWidgetSettings {
    readonly rawSettings: unknown;
    readonly settingsJsonToPersist: StoredSettingsJsonObject | null;
    readonly readWarning: StoredSettingsReadWarning | null;
    readonly storedSettings: StoredWidgetSettings;
}

export interface QuickStartStoredWidgetSettingsOptions {
    readonly createSlotId?: SlotIdGenerator;
}

/** Resolves existing settings or creates the action's first stored widget settings. */
export function resolveQuickStartStoredWidgetSettings(
    rawSettings: unknown,
    actionKind: ActionKind,
    options: QuickStartStoredWidgetSettingsOptions = {},
): QuickStartStoredWidgetSettings {
    const quickStartWidget = buildQuickStartWidget(actionKind);
    const readResult = readStoredWidgetSettings(rawSettings);
    const storedSettings = readResult.settings;

    if (!quickStartWidget) {
        return {
            rawSettings,
            settingsJsonToPersist: null,
            readWarning: readResult.warning,
            storedSettings,
        };
    }

    const readableSettingsJson = writeStoredWidgetSettings(storedSettings);

    if (hasStoredMetricTarget(storedSettings)) {
        if (quickStartWidget.widgetKind === "singleMetric"
            && shouldBackfillQuickStartSourcePolicy(storedSettings, quickStartWidget.metric)) {
            const settingsJson = writeQuickStartSourcePolicy(storedSettings, quickStartWidget.metric.sourcePolicy);
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

    const settingsJson = writeQuickStartStoredWidgetSettings(
        storedSettings,
        quickStartWidget,
        options.createSlotId ?? createDefaultSlotId,
    );
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

type QuickStartWidget =
    | {
        readonly widgetKind: "singleMetric";
        readonly metric: QuickStartMetric;
    }
    | {
        readonly widgetKind: "denseMultiMetric";
        readonly metrics: readonly QuickStartMetric[];
    }
    | {
        readonly widgetKind: "stackedMetric";
        readonly metrics: readonly QuickStartMetric[];
    };

function buildQuickStartWidget(actionKind: ActionKind): QuickStartWidget | null {
    switch (actionKind) {
        case "cpu":
            return {
                widgetKind: "singleMetric",
                metric: buildCpuUsageQuickStartMetric(),
            };
        case "memory":
            return {
                widgetKind: "singleMetric",
                metric: buildMemoryUsageQuickStartMetric(),
            };
        case "network":
            return {
                widgetKind: "singleMetric",
                metric: buildNetworkTrafficQuickStartMetric(),
            };
        case "disk":
            return {
                widgetKind: "singleMetric",
                metric: buildDiskUsageQuickStartMetric(),
            };
        case "catalog":
            return {
                widgetKind: "singleMetric",
                metric: buildCatalogQuickStartMetric(),
            };
        case "customMetric":
            return {
                widgetKind: "singleMetric",
                metric: buildCustomMetricQuickStartMetric(),
            };
        case "denseMultiMetric":
            return {
                widgetKind: "denseMultiMetric",
                metrics: [
                    buildCpuUsageQuickStartMetric(),
                    buildGpuUsageQuickStartMetric(),
                ],
            };
        case "stackedMetric":
            return {
                widgetKind: "stackedMetric",
                metrics: [
                    buildCpuUsageQuickStartMetric(),
                    buildMemoryUsageQuickStartMetric(),
                ],
            };
        case "gpu":
            return {
                widgetKind: "singleMetric",
                metric: buildGpuUsageQuickStartMetric(),
            };
        case "unknown":
            return null;
    }
}

function buildCpuUsageQuickStartMetric(): QuickStartMetric {
    return {
        target: {
            case: "cpu",
            value: create(CpuMetricTargetSchema, { kind: StoredCpuMetricKind.USAGE }),
        },
    };
}

function buildGpuUsageQuickStartMetric(): QuickStartMetric {
    return {
        target: {
            case: "gpu",
            value: create(GpuMetricTargetSchema, { kind: StoredGpuMetricKind.USAGE }),
        },
    };
}

function buildMemoryUsageQuickStartMetric(): QuickStartMetric {
    return {
        target: {
            case: "memory",
            value: create(MemoryMetricTargetSchema, { kind: StoredMemoryMetricKind.USAGE }),
        },
    };
}

function buildDiskUsageQuickStartMetric(): QuickStartMetric {
    return {
        target: {
            case: "disk",
            value: create(DiskMetricTargetSchema, { kind: StoredDiskMetricKind.USAGE }),
        },
    };
}

function buildNetworkTrafficQuickStartMetric(): QuickStartMetric {
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
}

function buildCatalogQuickStartMetric(): QuickStartMetric {
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
}

function buildCustomMetricQuickStartMetric(): QuickStartMetric {
    return {
        target: {
            case: "custom",
            value: create(CustomMetricTargetSchema),
        },
    };
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
    quickStartWidget: QuickStartWidget,
    createSlotId: () => string,
): StoredSettingsJsonObject {
    if (quickStartWidget.widgetKind === "denseMultiMetric") {
        settings.widget = {
            case: "denseMultiMetric",
            value: create(DenseMultiMetricWidgetSchema, {
                slots: quickStartWidget.metrics.map((metric) => create(DenseMetricSlotSchema, {
                    slotId: createSlotId(),
                    slot: createMetricSlot(metric),
                })),
            }),
        };

        return writeStoredWidgetSettings(settings);
    }

    if (quickStartWidget.widgetKind === "stackedMetric") {
        settings.widget = {
            case: "stackedMetric",
            value: create(StackedMetricWidgetSchema, {
                slots: quickStartWidget.metrics.map((metric) => create(StackedMetricSlotSchema, {
                    slotId: createSlotId(),
                    item: {
                        case: "singleMetric",
                        value: create(SingleMetricWidgetSchema, {
                            slot: createMetricSlot(metric),
                        }),
                    },
                })),
            }),
        };

        return writeStoredWidgetSettings(settings);
    }

    if (settings.widget.case !== "singleMetric") {
        settings.widget = {
            case: "singleMetric",
            value: create(SingleMetricWidgetSchema),
        };
    }

    const slot = settings.widget.value.slot ??= create(MetricSlotSchema);
    const metric = slot.metric ??= create(MetricSelectionSchema);
    metric.target = quickStartWidget.metric.target;
    if (quickStartWidget.metric.sourcePolicy !== undefined) {
        metric.sourcePolicy = quickStartWidget.metric.sourcePolicy;
    }

    return writeStoredWidgetSettings(settings);
}

function createMetricSlot(quickStartMetric: QuickStartMetric) {
    const metric = create(MetricSelectionSchema);
    metric.target = quickStartMetric.target;
    if (quickStartMetric.sourcePolicy !== undefined) {
        metric.sourcePolicy = quickStartMetric.sourcePolicy;
    }

    return create(MetricSlotSchema, { metric });
}
