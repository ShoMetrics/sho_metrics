import { create } from "@bufbuild/protobuf";
import {
    AppearanceSettingsSchema,
    CatalogMetricTargetSchema,
    CpuMetricTargetSchema,
    CustomMetricTargetSchema,
    DenseMetricSlotSchema,
    DiskMetricTargetSchema,
    DiskMetricTarget_ThroughputSchema,
    DiskMetricTarget_UsageSchema,
    GpuMetricTargetSchema,
    MemoryMetricTarget_UsageSchema,
    MemoryMetricTargetSchema,
    MetricSelectionSchema,
    MetricSourcePolicySchema,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    MetricSlotSchema,
    NetworkMetricTargetSchema,
    NetworkMetricTarget_TrafficSchema,
    SystemBatteryMetricTargetSchema,
    SystemMetricTargetSchema,
    type DenseMetricSlot as StoredDenseMetricSlot,
    type DenseMultiMetricWidget as StoredDenseMultiMetricWidget,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type MetricSelection as StoredMetricSelection,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import { BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID } from "../../../runtime/sources/source-ids";
import {
    DENSE_MULTI_METRIC_MAX_SLOT_COUNT,
    DENSE_MULTI_METRIC_MIN_SLOT_COUNT,
} from "../dense-multi-metric-constraints";
import {
    storedCatalogMetricCategoryByResolved,
    storedCatalogMetricReadingKindByResolved,
    storedDiskThroughputDirectionByResolved,
    storedNetworkDirectionByResolved,
} from "../resolved-to-stored-enum-maps";
import { createUniqueSlotId, type SlotIdGenerator } from "../slot-id";
import { applyAppearancePatch } from "./appearance-settings-patch";
import { applyCustomMetricPatch } from "./metric-target-settings-patch";
import {
    buildDefaultCpuMetricReading,
    buildDefaultGpuMetricReading,
} from "./metric-reading-builders";
import { assertNever, throwPatchTargetMismatch } from "./patch-errors";
import { requireCustomMetricTarget, requireDenseMetricSlot } from "./patch-require";
import { buildStoredSystemPeripheralIdentity } from "./system-target-settings-patch";
import type {
    DenseMetricSlotPatch,
    DenseMetricTargetPatch,
    DenseWidgetSettingsPatch,
} from "./widget-settings-patch-types";

type StoredDiskReadingCase = NonNullable<StoredDiskMetricTarget["reading"]["case"]>;

export function applyDensePatch(
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
                value: create(CpuMetricTargetSchema, { reading: buildDefaultCpuMetricReading(patch.kind) }),
            };
        case "gpu":
            return {
                case: "gpu",
                value: create(GpuMetricTargetSchema, { reading: buildDefaultGpuMetricReading(patch.kind) }),
            };
        case "memory":
            return {
                case: "memory",
                value: create(MemoryMetricTargetSchema, {
                    reading: {
                        case: "usage",
                        value: create(MemoryMetricTarget_UsageSchema),
                    },
                }),
            };
        case "disk":
            return {
                case: "disk",
                value: create(DiskMetricTargetSchema, { reading: buildDenseDiskReading(patch) }),
            };
        case "network":
            return {
                case: "network",
                value: create(NetworkMetricTargetSchema, {
                    reading: {
                        case: "traffic",
                        value: create(NetworkMetricTarget_TrafficSchema, {
                            direction: storedNetworkDirectionByResolved[patch.direction],
                            interfaceId: patch.interfaceId,
                        }),
                    },
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
                        value: create(SystemBatteryMetricTargetSchema, {
                            peripheralIdentity: patch.peripheralIdentity === undefined
                                ? undefined
                                : buildStoredSystemPeripheralIdentity(patch.peripheralIdentity),
                            detectedPeripheralDisplayName: patch.detectedPeripheralDisplayName,
                        }),
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

function buildDenseDiskReading(
    patch: Extract<DenseMetricTargetPatch, { readonly domain: "disk" }>,
): StoredDiskMetricTarget["reading"] {
    const kind: StoredDiskReadingCase = patch.kind;

    switch (kind) {
        case "usage":
            return {
                case: "usage",
                value: create(DiskMetricTarget_UsageSchema, {
                    volumeId: patch.volumeId,
                }),
            };
        case "throughput":
            return {
                case: "throughput",
                value: create(DiskMetricTarget_ThroughputSchema, {
                    direction: storedDiskThroughputDirectionByResolved[patch.throughputDirection ?? "read"],
                }),
            };
    }

    return assertNever(kind);
}
