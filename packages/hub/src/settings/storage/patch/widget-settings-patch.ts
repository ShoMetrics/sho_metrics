import { create } from "@bufbuild/protobuf";
import {
    AppearanceSettingsSchema,
    StoredWidgetSettingsSchema,
    WidgetPreferencesSchema,
    type SingleMetricWidget as StoredSingleMetricWidget,
    type StoredWidgetSettings,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import {
    readStoredWidgetSettings,
    writeStoredWidgetSettings,
    type StoredSettingsJsonObject,
} from "../codec";
import {
    createDefaultSlotId,
    type SlotIdGenerator,
} from "../slot-id";
import { applyAppearancePatch } from "./appearance-settings-patch";
import { applyDensePatch } from "./dense-widget-settings-patch";
import { applyHardwareSummaryPatch } from "./hardware-summary-widget-settings-patch";
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
    ensureSlotOverrides,
    requireCatalogTarget,
    requireCpuTarget,
    requireCustomMetricTarget,
    requireDenseMultiMetricWidget,
    requireDiskTarget,
    requireGpuTarget,
    requireMetricSelection,
    requireNetworkTarget,
    requireSingleMetricSlot,
    requireStackedMetricWidget,
    requireSystemBatteryTarget,
} from "./patch-require";
import { applyStackedPatch } from "./stacked-widget-settings-patch";
import { applySystemPatch } from "./system-target-settings-patch";
import type {
    SingleMetricWidgetSettingsPatch,
    StoredWidgetSettingsPatch,
    WriteStoredWidgetSettingsPatchOptions,
} from "./widget-settings-patch-types";

export type {
    DenseMetricSlotPatch,
    DenseMetricTargetPatch,
    DenseWidgetSettingsPatch,
    HardwareSummaryWidgetSettingsPatch,
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
        applyStackedPatch(requireStackedMetricWidget(settings), patch.stacked, {
            createSlotId,
            applySingleMetricWidgetPatch,
        });
    }

    if (patch.hardwareSummary) {
        applyHardwareSummaryPatch(settings, patch.hardwareSummary);
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

function applyPreferencesPatch(
    settings: StoredWidgetSettings,
    patch: NonNullable<StoredWidgetSettingsPatch["preferences"]>,
): void {
    settings.preferences ??= create(WidgetPreferencesSchema);
    settings.preferences.pollingFrequencySeconds = patch.pollingFrequencySeconds;
}
