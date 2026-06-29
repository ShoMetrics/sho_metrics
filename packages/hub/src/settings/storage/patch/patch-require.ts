import { create } from "@bufbuild/protobuf";
import {
    SlotOverridesSchema,
    type CatalogMetricTarget as StoredCatalogMetricTarget,
    type CpuHardwareSummaryTarget as StoredCpuHardwareSummaryTarget,
    type CpuMetricTarget as StoredCpuMetricTarget,
    type CustomMetricTarget as StoredCustomMetricTarget,
    type DenseMetricSlot as StoredDenseMetricSlot,
    type DenseMultiMetricWidget as StoredDenseMultiMetricWidget,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type GpuHardwareSummaryTarget as StoredGpuHardwareSummaryTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type HardwareSummaryWidget as StoredHardwareSummaryWidget,
    type MetricSelection as StoredMetricSelection,
    type MetricSlot as StoredMetricSlot,
    type NetworkMetricTarget as StoredNetworkMetricTarget,
    type SingleMetricWidget as StoredSingleMetricWidget,
    type SlotOverrides as StoredSlotOverrides,
    type StackedMetricSlot as StoredStackedMetricSlot,
    type StackedMetricWidget as StoredStackedMetricWidget,
    type StoredWidgetSettings,
    type SystemBatteryMetricTarget as StoredSystemBatteryMetricTarget,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import { throwPatchTargetMismatch } from "./patch-errors";

export function requireSingleMetricSlot(settings: StoredWidgetSettings): StoredMetricSlot {
    if (settings.widget.case !== "singleMetric") {
        return throwPatchTargetMismatch("Cannot patch widget settings before quick-start widget initialization.");
    }

    if (!settings.widget.value.slot) {
        return throwPatchTargetMismatch("Cannot patch widget settings before quick-start slot initialization.");
    }

    return settings.widget.value.slot;
}

export function requireDenseMultiMetricWidget(settings: StoredWidgetSettings): StoredDenseMultiMetricWidget {
    if (settings.widget.case !== "denseMultiMetric") {
        return throwPatchTargetMismatch("Cannot apply a dense widget patch to a non-dense widget.");
    }

    return settings.widget.value;
}

export function requireStackedMetricWidget(settings: StoredWidgetSettings): StoredStackedMetricWidget {
    if (settings.widget.case !== "stackedMetric") {
        return throwPatchTargetMismatch("Cannot apply a stacked widget patch to a non-stacked widget.");
    }

    return settings.widget.value;
}

export function requireCpuHardwareSummaryTarget(widget: StoredHardwareSummaryWidget): StoredCpuHardwareSummaryTarget {
    if (widget.target.case !== "cpu") {
        return throwPatchTargetMismatch("Cannot apply a CPU summary patch to a non-CPU summary widget.");
    }

    return widget.target.value;
}

export function requireGpuHardwareSummaryTarget(widget: StoredHardwareSummaryWidget): StoredGpuHardwareSummaryTarget {
    if (widget.target.case !== "gpu") {
        return throwPatchTargetMismatch("Cannot apply a GPU summary patch to a non-GPU summary widget.");
    }

    return widget.target.value;
}

export function requireDenseMetricSlot(
    widget: StoredDenseMultiMetricWidget,
    slotId: string,
): StoredDenseMetricSlot {
    const slot = widget.slots.find((candidateSlot) => candidateSlot.slotId === slotId);
    if (slot === undefined) {
        return throwPatchTargetMismatch("Cannot update an unknown dense metric slot.");
    }

    return slot;
}

export function requireStackedMetricSlot(
    widget: StoredStackedMetricWidget,
    slotId: string,
): StoredStackedMetricSlot {
    const slot = widget.slots.find((candidateSlot) => candidateSlot.slotId === slotId);
    if (slot === undefined) {
        return throwPatchTargetMismatch("Cannot update an unknown stacked metric slot.");
    }

    return slot;
}

export function requireStackedSingleMetricWidget(slot: StoredStackedMetricSlot): StoredSingleMetricWidget {
    if (slot.item.case !== "singleMetric") {
        return throwPatchTargetMismatch("Cannot update a stacked metric slot without a single metric widget.");
    }

    return slot.item.value;
}

export function ensureSlotOverrides(slot: StoredMetricSlot): StoredSlotOverrides {
    slot.overrides ??= create(SlotOverridesSchema);
    return slot.overrides;
}

export function requireMetricSelection(slot: StoredMetricSlot): StoredMetricSelection {
    if (!slot.metric) {
        return throwPatchTargetMismatch("Cannot patch widget settings before quick-start metric initialization.");
    }

    return slot.metric;
}

export function requireNetworkTarget(metric: StoredMetricSelection): StoredNetworkMetricTarget {
    if (metric.target.case !== "network") {
        return throwPatchTargetMismatch("Cannot apply a network settings patch to a non-network metric.");
    }

    return metric.target.value;
}

export function requireDiskTarget(metric: StoredMetricSelection): StoredDiskMetricTarget {
    if (metric.target.case !== "disk") {
        return throwPatchTargetMismatch("Cannot apply a disk settings patch to a non-disk metric.");
    }

    return metric.target.value;
}

export function requireCpuTarget(metric: StoredMetricSelection): StoredCpuMetricTarget {
    if (metric.target.case !== "cpu") {
        return throwPatchTargetMismatch("Cannot apply a CPU settings patch to a non-CPU metric.");
    }

    return metric.target.value;
}

export function requireGpuTarget(metric: StoredMetricSelection): StoredGpuMetricTarget {
    if (metric.target.case !== "gpu") {
        return throwPatchTargetMismatch("Cannot apply a GPU settings patch to a non-GPU metric.");
    }

    return metric.target.value;
}

export function requireCatalogTarget(metric: StoredMetricSelection): StoredCatalogMetricTarget {
    if (metric.target.case !== "catalog") {
        return throwPatchTargetMismatch("Cannot apply a catalog settings patch to a non-catalog metric.");
    }

    return metric.target.value;
}

export function requireCustomMetricTarget(metric: StoredMetricSelection): StoredCustomMetricTarget {
    if (metric.target.case !== "custom") {
        return throwPatchTargetMismatch("Cannot apply a Custom Metric settings patch to a non-Custom Metric.");
    }

    return metric.target.value;
}

export function requireSystemBatteryTarget(metric: StoredMetricSelection): StoredSystemBatteryMetricTarget {
    if (metric.target.case !== "system") {
        return throwPatchTargetMismatch("Cannot apply a System settings patch to a non-System metric.");
    }

    if (metric.target.value.reading.case !== "battery") {
        return throwPatchTargetMismatch("Cannot apply a System battery settings patch to a non-battery System metric.");
    }

    return metric.target.value.reading.value;
}
