import { create } from "@bufbuild/protobuf";
import {
    AppearanceSettingsSchema,
    CatalogMetricTargetSchema,
    CustomMetricTargetSchema,
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    CpuMetricTargetSchema,
    DenseMetricSlotSchema,
    DiskMetricTargetSchema,
    GpuMetricTargetSchema,
    MemoryMetricTarget_Kind as StoredMemoryMetricKind,
    MemoryMetricTargetSchema,
    MetricSelectionSchema,
    MetricSourcePolicySchema,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    MetricSlotSchema,
    NetworkMetricTarget_Kind as StoredNetworkMetricKind,
    NetworkMetricTargetSchema,
    NetworkMetricTarget_TrafficSchema,
    SlotOverridesSchema,
    SingleMetricWidgetSchema,
    StackedMetricRotationSettingsSchema,
    StackedMetricSlotSchema,
    StoredWidgetSettingsSchema,
    SystemBatteryMetricTargetSchema,
    SystemMetricTargetSchema,
    SystemPeripheralIdentitySchema,
    WidgetPreferencesSchema,
    type CatalogMetricTarget as StoredCatalogMetricTarget,
    type CustomMetricTarget as StoredCustomMetricTarget,
    type DenseMetricSlot as StoredDenseMetricSlot,
    type DenseMultiMetricWidget as StoredDenseMultiMetricWidget,
    type CpuMetricTarget as StoredCpuMetricTarget,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type MetricSelection as StoredMetricSelection,
    type MetricSlot as StoredMetricSlot,
    type NetworkMetricTarget as StoredNetworkMetricTarget,
    type SlotOverrides as StoredSlotOverrides,
    type SingleMetricWidget as StoredSingleMetricWidget,
    type StackedMetricSlot as StoredStackedMetricSlot,
    type StackedMetricWidget as StoredStackedMetricWidget,
    type SystemBatteryMetricTarget as StoredSystemBatteryMetricTarget,
    type SystemPeripheralIdentity as StoredSystemPeripheralIdentity,
    type StoredWidgetSettings,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import type {
    ResolvedMetricTarget,
    ResolvedSystemPeripheralIdentity,
} from "../../resolved-settings";
import { BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID } from "../../../runtime/sources/source-ids";
import {
    readStoredWidgetSettings,
    writeStoredWidgetSettings,
    type StoredSettingsJsonObject,
} from "../codec";
import {
    createDefaultSlotId,
    createUniqueSlotId,
    type SlotIdGenerator,
} from "../slot-id";
import { applyAppearancePatch } from "./appearance-settings-patch";
import {
    applyCatalogPatch,
    applyCpuPatch,
    applyCustomMetricPatch,
    applyDiskPatch,
    applyGpuPatch,
    applyNetworkPatch,
    applySourcePatch,
} from "./metric-target-settings-patch";
import {
    DENSE_MULTI_METRIC_MAX_SLOT_COUNT,
    DENSE_MULTI_METRIC_MIN_SLOT_COUNT,
} from "../dense-multi-metric-constraints";
import type {
    DenseMetricSlotPatch,
    DenseMetricTargetPatch,
    DenseWidgetSettingsPatch,
    SingleMetricWidgetSettingsPatch,
    StackedMetricSlotPatch,
    StackedWidgetSettingsPatch,
    StoredWidgetSettingsPatch,
    WriteStoredWidgetSettingsPatchOptions,
} from "./widget-settings-patch-types";
import {
    STACKED_METRIC_MAX_INTERVAL_SECONDS,
    STACKED_METRIC_MAX_SLOT_COUNT,
    STACKED_METRIC_MIN_INTERVAL_SECONDS,
    STACKED_METRIC_MIN_SLOT_COUNT,
} from "../stacked-metric-constraints";
import {
    storedCatalogMetricCategoryByResolved,
    storedCatalogMetricReadingKindByResolved,
    storedCpuMetricKindByResolved,
    storedDiskMetricKindByResolved,
    storedDiskThroughputDirectionByResolved,
    storedGpuMetricKindByResolved,
    storedNetworkDirectionByResolved,
    storedSystemPeripheralBindingTransportByResolved,
    storedSystemPeripheralReceiverKindByResolved,
} from "../resolved-to-stored-enum-maps";

export type {
    DenseMetricSlotPatch,
    DenseMetricTargetPatch,
    DenseWidgetSettingsPatch,
    SingleMetricWidgetSettingsPatch,
    StackedMetricSlotPatch,
    StackedWidgetSettingsPatch,
    StoredWidgetSettingsPatch,
    WriteStoredWidgetSettingsPatchOptions,
} from "./widget-settings-patch-types";

/** Writes a sparse stored-settings patch without persisting resolved defaults. */
export function writeStoredWidgetSettingsPatch(
    rawSettings: unknown,
    patch: StoredWidgetSettingsPatch,
    options: WriteStoredWidgetSettingsPatchOptions = {},
): StoredSettingsJsonObject {
    const nextSettings = readStoredWidgetSettings(rawSettings).settings;

    applyPatch(nextSettings, patch, options.createSlotId ?? createDefaultSlotId);

    return writeStoredWidgetSettings(nextSettings);
}

function applyPatch(
    settings: StoredWidgetSettings,
    patch: StoredWidgetSettingsPatch,
    createSlotId: SlotIdGenerator,
): void {
    if (patch.preferences) {
        applyPreferencesPatch(settings, patch.preferences);
    }

    if (patch.dense) {
        applyDensePatch(requireDenseMultiMetricWidget(settings), patch.dense, createSlotId);
    }

    if (patch.stacked) {
        applyStackedPatch(requireStackedMetricWidget(settings), patch.stacked, createSlotId);
    }

    if (patch.appearance) {
        const overrides = ensureSlotOverrides(requireSingleMetricSlot(settings));
        applyAppearancePatch(overrides.appearance ??= create(AppearanceSettingsSchema), patch.appearance);
    }

    if (patch.source) {
        applySourcePatch(requireMetricSelection(requireSingleMetricSlot(settings)), patch.source);
    }

    if (patch.network) {
        const slot = requireSingleMetricSlot(settings);
        applyNetworkPatch(requireNetworkTarget(requireMetricSelection(slot)), ensureSlotOverrides(slot), patch.network);
    }

    if (patch.disk) {
        const slot = requireSingleMetricSlot(settings);
        applyDiskPatch(requireDiskTarget(requireMetricSelection(slot)), ensureSlotOverrides(slot), patch.disk);
    }

    if (patch.cpu) {
        applyCpuPatch(requireCpuTarget(requireMetricSelection(requireSingleMetricSlot(settings))), patch.cpu);
    }

    if (patch.gpu) {
        applyGpuPatch(requireGpuTarget(requireMetricSelection(requireSingleMetricSlot(settings))), patch.gpu);
    }

    if (patch.catalog) {
        applyCatalogPatch(requireCatalogTarget(requireMetricSelection(requireSingleMetricSlot(settings))), patch.catalog);
    }

    if (patch.customMetric) {
        applyCustomMetricPatch(
            requireCustomMetricTarget(requireMetricSelection(requireSingleMetricSlot(settings))),
            patch.customMetric,
        );
    }

    if (patch.system) {
        applySystemPatch(requireSystemBatteryTarget(requireMetricSelection(requireSingleMetricSlot(settings))), patch.system);
    }
}

function applyStackedPatch(
    widget: StoredStackedMetricWidget,
    patch: StackedWidgetSettingsPatch,
    createSlotId: SlotIdGenerator,
): void {
    if (patch.rotation !== undefined) {
        applyStackedRotationPatch(widget, patch.rotation);
    }

    if (patch.addSlot !== undefined) {
        if (widget.slots.length >= STACKED_METRIC_MAX_SLOT_COUNT) {
            return throwPatchTargetMismatch(
                `Cannot add more than ${STACKED_METRIC_MAX_SLOT_COUNT} stacked metric slots.`,
            );
        }

        const existingSlotIds = new Set(widget.slots.map((slot) => slot.slotId));
        const slot = create(StackedMetricSlotSchema, {
            slotId: createUniqueSlotId(existingSlotIds, createSlotId),
            item: {
                case: "singleMetric",
                value: create(SingleMetricWidgetSchema, {
                    slot: create(MetricSlotSchema, {
                        metric: create(MetricSelectionSchema, {
                            target: {
                                case: "cpu",
                                value: create(CpuMetricTargetSchema, { kind: StoredCpuMetricKind.USAGE }),
                            },
                        }),
                    }),
                }),
            },
        });
        applyStackedMetricSlotPatch(slot, patch.addSlot);
        widget.slots.push(slot);
    }

    if (patch.updateSlot !== undefined) {
        applyStackedMetricSlotPatch(requireStackedMetricSlot(widget, patch.updateSlot.slotId), patch.updateSlot);
    }

    if (patch.moveSlot !== undefined) {
        moveStackedMetricSlot(widget, patch.moveSlot.slotId, patch.moveSlot.direction);
    }

    if (patch.removeSlotId !== undefined) {
        if (widget.slots.length <= STACKED_METRIC_MIN_SLOT_COUNT) {
            return throwPatchTargetMismatch(
                `Cannot remove stacked metric slots below the minimum of ${STACKED_METRIC_MIN_SLOT_COUNT}.`,
            );
        }

        const slotIndex = widget.slots.findIndex((slot) => slot.slotId === patch.removeSlotId);
        if (slotIndex < 0) {
            return throwPatchTargetMismatch("Cannot remove an unknown stacked metric slot.");
        }

        widget.slots.splice(slotIndex, 1);
    }
}

function applyStackedRotationPatch(
    widget: StoredStackedMetricWidget,
    patch: NonNullable<StackedWidgetSettingsPatch["rotation"]>,
): void {
    const rotation = widget.rotation ??= create(StackedMetricRotationSettingsSchema);

    if ("autoRotateEnabled" in patch) {
        rotation.autoRotateEnabled = patch.autoRotateEnabled;
    }
    if ("intervalSeconds" in patch) {
        if (
            patch.intervalSeconds !== undefined
            && (
                patch.intervalSeconds < STACKED_METRIC_MIN_INTERVAL_SECONDS
                || patch.intervalSeconds > STACKED_METRIC_MAX_INTERVAL_SECONDS
            )
        ) {
            return throwPatchTargetMismatch(
                `Stacked metric interval must be ${STACKED_METRIC_MIN_INTERVAL_SECONDS}`
                + ` to ${STACKED_METRIC_MAX_INTERVAL_SECONDS} seconds.`,
            );
        }

        rotation.intervalSeconds = patch.intervalSeconds;
    }
}

function applyStackedMetricSlotPatch(
    slot: StoredStackedMetricSlot,
    patch: StackedMetricSlotPatch,
): void {
    if (patch.metricDomain !== undefined) {
        slot.item = {
            case: "singleMetric",
            value: buildDefaultSingleMetricWidget(patch.metricDomain),
        };
    }

    if (patch.singleMetric !== undefined) {
        applySingleMetricWidgetPatch(requireStackedSingleMetricWidget(slot), patch.singleMetric);
    }
}

function buildDefaultSingleMetricWidget(domain: ResolvedMetricTarget["domain"]): StoredSingleMetricWidget {
    return create(SingleMetricWidgetSchema, {
        slot: create(MetricSlotSchema, {
            metric: create(MetricSelectionSchema, {
                target: buildDefaultSingleMetricTarget(domain),
            }),
        }),
    });
}

function buildDefaultSingleMetricTarget(domain: ResolvedMetricTarget["domain"]): StoredMetricSelection["target"] {
    switch (domain) {
        case "cpu":
            return {
                case: "cpu",
                value: create(CpuMetricTargetSchema, { kind: StoredCpuMetricKind.USAGE }),
            };
        case "gpu":
            return {
                case: "gpu",
                value: create(GpuMetricTargetSchema),
            };
        case "memory":
            return {
                case: "memory",
                value: create(MemoryMetricTargetSchema, { kind: StoredMemoryMetricKind.USAGE }),
            };
        case "disk":
            return {
                case: "disk",
                value: create(DiskMetricTargetSchema),
            };
        case "network":
            return {
                case: "network",
                value: create(NetworkMetricTargetSchema, {
                    kind: StoredNetworkMetricKind.TRAFFIC,
                    traffic: create(NetworkMetricTarget_TrafficSchema),
                }),
            };
        case "catalog":
            return {
                case: "catalog",
                value: create(CatalogMetricTargetSchema),
            };
        case "system":
            return {
                case: "system",
                value: create(SystemMetricTargetSchema, {
                    reading: {
                        case: "battery",
                        value: create(SystemBatteryMetricTargetSchema),
                    },
                }),
            };
        case "customMetric":
            return {
                case: "custom",
                value: create(CustomMetricTargetSchema),
            };
    }
}

function applySingleMetricWidgetPatch(
    widget: StoredSingleMetricWidget,
    patch: SingleMetricWidgetSettingsPatch,
): void {
    const settings = create(StoredWidgetSettingsSchema, {
        widget: {
            case: "singleMetric",
            value: widget,
        },
    });

    applyPatch(settings, patch, createDefaultSlotId);
}

function moveStackedMetricSlot(
    widget: StoredStackedMetricWidget,
    slotId: string,
    direction: "up" | "down",
): void {
    const slotIndex = widget.slots.findIndex((slot) => slot.slotId === slotId);
    if (slotIndex < 0) {
        return throwPatchTargetMismatch("Cannot move an unknown stacked metric slot.");
    }

    const nextSlotIndex = direction === "up" ? slotIndex - 1 : slotIndex + 1;
    if (nextSlotIndex < 0 || nextSlotIndex >= widget.slots.length) {
        return;
    }

    const [slot] = widget.slots.splice(slotIndex, 1);
    widget.slots.splice(nextSlotIndex, 0, slot);
}

function applyDensePatch(
    widget: StoredDenseMultiMetricWidget,
    patch: DenseWidgetSettingsPatch,
    createSlotId: SlotIdGenerator,
): void {
    if (patch.appearance) {
        applyAppearancePatch(widget.appearance ??= create(AppearanceSettingsSchema), patch.appearance);
    }

    if (patch.addSlot !== undefined) {
        if (widget.slots.length >= DENSE_MULTI_METRIC_MAX_SLOT_COUNT) {
            return throwPatchTargetMismatch(
                `Cannot add more than ${DENSE_MULTI_METRIC_MAX_SLOT_COUNT} dense metric slots.`,
            );
        }

        const existingSlotIds = new Set(widget.slots.map((slot) => slot.slotId));
        const slot = create(DenseMetricSlotSchema, {
            slotId: createUniqueSlotId(existingSlotIds, createSlotId),
        });
        applyDenseMetricSlotPatch(slot, patch.addSlot);
        widget.slots.push(slot);
    }

    if (patch.updateSlot !== undefined) {
        applyDenseMetricSlotPatch(requireDenseMetricSlot(widget, patch.updateSlot.slotId), patch.updateSlot);
    }

    if (patch.moveSlot !== undefined) {
        moveDenseMetricSlot(widget, patch.moveSlot.slotId, patch.moveSlot.direction);
    }

    if (patch.removeSlotId !== undefined) {
        if (widget.slots.length <= DENSE_MULTI_METRIC_MIN_SLOT_COUNT) {
            return throwPatchTargetMismatch(
                `Cannot remove dense metric slots below the minimum of ${DENSE_MULTI_METRIC_MIN_SLOT_COUNT}.`,
            );
        }

        const slotIndex = widget.slots.findIndex((slot) => slot.slotId === patch.removeSlotId);
        if (slotIndex < 0) {
            return throwPatchTargetMismatch("Cannot remove an unknown dense metric slot.");
        }

        widget.slots.splice(slotIndex, 1);
    }
}

function applyDenseMetricSlotPatch(
    slot: StoredDenseMetricSlot,
    patch: DenseMetricSlotPatch,
): void {
    if (patch.target !== undefined) {
        const metricSlot = slot.slot ??= create(MetricSlotSchema);
        const metric = metricSlot.metric ??= create(MetricSelectionSchema);
        metric.target = buildDenseMetricTarget(patch.target);
        metric.sourcePolicy = buildDenseMetricSourcePolicy(patch.target);
    }
    if (patch.customMetric !== undefined) {
        const metricSlot = slot.slot ??= create(MetricSlotSchema);
        const metric = metricSlot.metric ??= create(MetricSelectionSchema);
        applyCustomMetricPatch(requireCustomMetricTarget(metric), patch.customMetric);
    }
    if ("customLabel" in patch) {
        slot.customLabel = patch.customLabel;
    }
    if ("customMaximumValue" in patch) {
        slot.customMaximumValue = patch.customMaximumValue;
    }
}

function buildDenseMetricSourcePolicy(target: DenseMetricTargetPatch): StoredMetricSelection["sourcePolicy"] {
    if (target.domain !== "catalog") {
        return undefined;
    }

    return create(MetricSourcePolicySchema, {
        primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
        failureMode: StoredSourceFailureMode.SHOW_UNAVAILABLE,
    });
}

function moveDenseMetricSlot(
    widget: StoredDenseMultiMetricWidget,
    slotId: string,
    direction: "up" | "down",
): void {
    const slotIndex = widget.slots.findIndex((slot) => slot.slotId === slotId);
    if (slotIndex < 0) {
        return throwPatchTargetMismatch("Cannot move an unknown dense metric slot.");
    }

    const nextSlotIndex = direction === "up" ? slotIndex - 1 : slotIndex + 1;
    if (nextSlotIndex < 0 || nextSlotIndex >= widget.slots.length) {
        return;
    }

    const [slot] = widget.slots.splice(slotIndex, 1);
    widget.slots.splice(nextSlotIndex, 0, slot);
}

function buildDenseMetricTarget(patch: DenseMetricTargetPatch): StoredMetricSelection["target"] {
    switch (patch.domain) {
        case "cpu":
            return {
                case: "cpu",
                value: create(CpuMetricTargetSchema, {
                    kind: storedCpuMetricKindByResolved[patch.kind],
                }),
            };
        case "gpu":
            return {
                case: "gpu",
                value: create(GpuMetricTargetSchema, {
                    kind: storedGpuMetricKindByResolved[patch.kind],
                }),
            };
        case "memory":
            return {
                case: "memory",
                value: create(MemoryMetricTargetSchema, {
                    kind: StoredMemoryMetricKind.USAGE,
                }),
            };
        case "disk":
            return {
                case: "disk",
                value: create(DiskMetricTargetSchema, {
                    kind: storedDiskMetricKindByResolved[patch.kind],
                    volumeId: patch.volumeId,
                    throughputDirection: patch.kind === "throughput"
                        ? storedDiskThroughputDirectionByResolved[patch.throughputDirection ?? "read"]
                        : undefined,
                }),
            };
        case "network":
            return {
                case: "network",
                value: create(NetworkMetricTargetSchema, {
                    kind: StoredNetworkMetricKind.TRAFFIC,
                    traffic: create(NetworkMetricTarget_TrafficSchema, {
                        direction: storedNetworkDirectionByResolved[patch.direction],
                        interfaceId: patch.interfaceId,
                    }),
                }),
            };
        case "catalog":
            return {
                case: "catalog",
                value: create(CatalogMetricTargetSchema, {
                    metricId: patch.metricId,
                    detectedLabel: patch.detectedLabel,
                    detectedUnit: patch.detectedUnit,
                    detectedCategory: patch.detectedCategory === undefined
                        ? undefined
                        : storedCatalogMetricCategoryByResolved[patch.detectedCategory],
                    detectedReadingKind: patch.detectedReadingKind === undefined
                        ? undefined
                        : storedCatalogMetricReadingKindByResolved[patch.detectedReadingKind],
                }),
            };
        case "system":
            return {
                case: "system",
                value: create(SystemMetricTargetSchema, {
                    reading: {
                        case: "battery",
                        value: create(SystemBatteryMetricTargetSchema),
                    },
                }),
            };
        case "customMetric":
            return {
                case: "custom",
                value: create(CustomMetricTargetSchema),
            };
    }
}

function applyPreferencesPatch(
    settings: StoredWidgetSettings,
    patch: NonNullable<StoredWidgetSettingsPatch["preferences"]>,
): void {
    settings.preferences ??= create(WidgetPreferencesSchema);
    settings.preferences.pollingFrequencySeconds = patch.pollingFrequencySeconds;
}

function applySystemPatch(
    target: StoredSystemBatteryMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["system"]>,
): void {
    if ("peripheralIdentity" in patch) {
        target.peripheralIdentity = patch.peripheralIdentity === undefined
            ? undefined
            : buildStoredSystemPeripheralIdentity(patch.peripheralIdentity);
    }

    if ("detectedPeripheralDisplayName" in patch) {
        target.detectedPeripheralDisplayName = patch.detectedPeripheralDisplayName;
    }
}

function buildStoredSystemPeripheralIdentity(
    identity: ResolvedSystemPeripheralIdentity,
): StoredSystemPeripheralIdentity {
    return create(SystemPeripheralIdentitySchema, {
        vendorId: identity.vendorId,
        productId: identity.productId,
        manufacturer: identity.manufacturer,
        productName: identity.productName,
        serialNumber: identity.serialNumber,
        interfaceNumber: identity.interfaceNumber,
        usagePage: identity.usagePage,
        usageId: identity.usageId,
        bindingTransport: identity.bindingTransport === undefined
            ? undefined
            : storedSystemPeripheralBindingTransportByResolved[identity.bindingTransport],
        receiverKind: identity.receiverKind === undefined
            ? undefined
            : storedSystemPeripheralReceiverKindByResolved[identity.receiverKind],
        vendorUnitId: identity.vendorUnitId,
        modelId: identity.modelId,
        receiverSlot: identity.receiverSlot,
    });
}

function requireSingleMetricSlot(settings: StoredWidgetSettings): StoredMetricSlot {
    if (settings.widget.case !== "singleMetric") {
        return throwPatchTargetMismatch("Cannot patch widget settings before quick-start widget initialization.");
    }

    if (!settings.widget.value.slot) {
        return throwPatchTargetMismatch("Cannot patch widget settings before quick-start slot initialization.");
    }

    return settings.widget.value.slot;
}

function requireDenseMultiMetricWidget(settings: StoredWidgetSettings): StoredDenseMultiMetricWidget {
    if (settings.widget.case !== "denseMultiMetric") {
        return throwPatchTargetMismatch("Cannot apply a dense widget patch to a non-dense widget.");
    }

    return settings.widget.value;
}

function requireStackedMetricWidget(settings: StoredWidgetSettings): StoredStackedMetricWidget {
    if (settings.widget.case !== "stackedMetric") {
        return throwPatchTargetMismatch("Cannot apply a stacked widget patch to a non-stacked widget.");
    }

    return settings.widget.value;
}

function requireDenseMetricSlot(
    widget: StoredDenseMultiMetricWidget,
    slotId: string,
): StoredDenseMetricSlot {
    const slot = widget.slots.find((candidateSlot) => candidateSlot.slotId === slotId);
    if (slot === undefined) {
        return throwPatchTargetMismatch("Cannot update an unknown dense metric slot.");
    }

    return slot;
}

function requireStackedMetricSlot(
    widget: StoredStackedMetricWidget,
    slotId: string,
): StoredStackedMetricSlot {
    const slot = widget.slots.find((candidateSlot) => candidateSlot.slotId === slotId);
    if (slot === undefined) {
        return throwPatchTargetMismatch("Cannot update an unknown stacked metric slot.");
    }

    return slot;
}

function requireStackedSingleMetricWidget(slot: StoredStackedMetricSlot): StoredSingleMetricWidget {
    if (slot.item.case !== "singleMetric") {
        return throwPatchTargetMismatch("Cannot update a stacked metric slot without a single metric widget.");
    }

    return slot.item.value;
}

function ensureSlotOverrides(slot: StoredMetricSlot): StoredSlotOverrides {
    slot.overrides ??= create(SlotOverridesSchema);
    return slot.overrides;
}

function requireMetricSelection(slot: StoredMetricSlot): StoredMetricSelection {
    if (!slot.metric) {
        return throwPatchTargetMismatch("Cannot patch widget settings before quick-start metric initialization.");
    }

    return slot.metric;
}

function requireNetworkTarget(metric: StoredMetricSelection): StoredNetworkMetricTarget {
    if (metric.target.case !== "network") {
        return throwPatchTargetMismatch("Cannot apply a network settings patch to a non-network metric.");
    }

    return metric.target.value;
}

function requireDiskTarget(metric: StoredMetricSelection): StoredDiskMetricTarget {
    if (metric.target.case !== "disk") {
        return throwPatchTargetMismatch("Cannot apply a disk settings patch to a non-disk metric.");
    }

    return metric.target.value;
}

function requireCpuTarget(metric: StoredMetricSelection): StoredCpuMetricTarget {
    if (metric.target.case !== "cpu") {
        return throwPatchTargetMismatch("Cannot apply a CPU settings patch to a non-CPU metric.");
    }

    return metric.target.value;
}

function requireGpuTarget(metric: StoredMetricSelection): StoredGpuMetricTarget {
    if (metric.target.case !== "gpu") {
        return throwPatchTargetMismatch("Cannot apply a GPU settings patch to a non-GPU metric.");
    }

    return metric.target.value;
}

function requireCatalogTarget(metric: StoredMetricSelection): StoredCatalogMetricTarget {
    if (metric.target.case !== "catalog") {
        return throwPatchTargetMismatch("Cannot apply a catalog settings patch to a non-catalog metric.");
    }

    return metric.target.value;
}

function requireCustomMetricTarget(metric: StoredMetricSelection): StoredCustomMetricTarget {
    if (metric.target.case !== "custom") {
        return throwPatchTargetMismatch("Cannot apply a Custom Metric settings patch to a non-Custom Metric.");
    }

    return metric.target.value;
}

function requireSystemBatteryTarget(metric: StoredMetricSelection): StoredSystemBatteryMetricTarget {
    if (metric.target.case !== "system") {
        return throwPatchTargetMismatch("Cannot apply a System settings patch to a non-System metric.");
    }

    if (metric.target.value.reading.case !== "battery") {
        return throwPatchTargetMismatch("Cannot apply a System battery settings patch to a non-battery System metric.");
    }

    return metric.target.value.reading.value;
}

function throwPatchTargetMismatch(message: string): never {
    throw new Error(message);
}
