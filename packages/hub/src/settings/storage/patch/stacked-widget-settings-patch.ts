import { create } from "@bufbuild/protobuf";
import {
    StackedMetricRotationSettingsSchema,
    StackedMetricSlotSchema,
    type SingleMetricWidget as StoredSingleMetricWidget,
    type StackedMetricSlot as StoredStackedMetricSlot,
    type StackedMetricWidget as StoredStackedMetricWidget,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import {
    STACKED_METRIC_MAX_INTERVAL_SECONDS,
    STACKED_METRIC_MAX_SLOT_COUNT,
    STACKED_METRIC_MIN_INTERVAL_SECONDS,
    STACKED_METRIC_MIN_SLOT_COUNT,
} from "../stacked-metric-constraints";
import { createUniqueSlotId, type SlotIdGenerator } from "../slot-id";
import { throwPatchTargetMismatch } from "./patch-errors";
import {
    requireStackedMetricSlot,
    requireStackedSingleMetricWidget,
} from "./patch-require";
import { buildDefaultSingleMetricWidget } from "./single-metric-widget-settings-patch";
import type {
    SingleMetricWidgetSettingsPatch,
    StackedMetricSlotPatch,
    StackedWidgetSettingsPatch,
} from "./widget-settings-patch-types";

interface ApplyStackedPatchContext {
    readonly createSlotId: SlotIdGenerator;
    readonly applySingleMetricWidgetPatch: (
        widget: StoredSingleMetricWidget,
        patch: SingleMetricWidgetSettingsPatch,
    ) => void;
}

export function applyStackedPatch(
    widget: StoredStackedMetricWidget,
    patch: StackedWidgetSettingsPatch,
    context: ApplyStackedPatchContext,
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
            slotId: createUniqueSlotId(existingSlotIds, context.createSlotId),
            item: {
                case: "singleMetric",
                value: buildDefaultSingleMetricWidget("cpu"),
            },
        });
        applyStackedMetricSlotPatch(slot, patch.addSlot, context.applySingleMetricWidgetPatch);
        widget.slots.push(slot);
    }

    if (patch.updateSlot !== undefined) {
        applyStackedMetricSlotPatch(
            requireStackedMetricSlot(widget, patch.updateSlot.slotId),
            patch.updateSlot,
            context.applySingleMetricWidgetPatch,
        );
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
    applySingleMetricWidgetPatch: ApplyStackedPatchContext["applySingleMetricWidgetPatch"],
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
