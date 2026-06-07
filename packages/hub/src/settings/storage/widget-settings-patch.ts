import { create } from "@bufbuild/protobuf";
import {
    AppearanceSettingsSchema,
    AppearanceThemeSettingsSchema,
    AppearanceViewSettingsSchema,
    ColorFilledMultiColorPaintSettingsSchema,
    ColorFilledPaintSettingsSchema,
    ColorFilledThemeSettingsSchema,
    ColorFilledSolidPaintSettingsSchema,
    CupertinoGlassThemeSettingsSchema,
    CatalogMetricTargetSchema,
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    CpuMetricTargetSchema,
    DenseMetricSlotSchema,
    DiskMetricTargetSchema,
    DiskThroughputDisplaySettingsSchema,
    FlatThemeSettingsSchema,
    GpuMetricTargetSchema,
    MemoryMetricTarget_Kind as StoredMemoryMetricKind,
    MemoryMetricTargetSchema,
    MetricMultiColorChannelColorsSchema,
    MetricMultiColorPaintSettingsSchema,
    MetricPaintSettingsSchema,
    MetricSelectionSchema,
    MetricSourcePolicySchema,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    MetricSlotSchema,
    MetricSolidChannelColorsSchema,
    MetricSolidPaintSettingsSchema,
    MultiColorSetSchema,
    NetworkDisplaySettingsSchema,
    NetworkMetricTarget_Kind as StoredNetworkMetricKind,
    NetworkMetricTarget_PingSchema,
    NetworkMetricTargetSchema,
    NetworkMetricTarget_TrafficSchema,
    PixelWindowThemeSettingsSchema,
    TerminalPaintSettingsSchema,
    TerminalThemeSettingsSchema,
    TransparentSurfaceSettingsSchema,
    SlotOverridesSchema,
    SingleMetricWidgetSchema,
    StackedMetricRotationSettingsSchema,
    StackedMetricSlotSchema,
    StoredWidgetSettingsSchema,
    LineAppearanceSettingsSchema,
    WidgetPreferencesSchema,
    type AppearanceSettings as StoredAppearanceSettings,
    type CatalogMetricTarget as StoredCatalogMetricTarget,
    type DenseMetricSlot as StoredDenseMetricSlot,
    type DenseMultiMetricWidget as StoredDenseMultiMetricWidget,
    type ColorFilledPaintSettings as StoredColorFilledPaintSettings,
    type CpuMetricTarget as StoredCpuMetricTarget,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type MetricPaintSettings as StoredMetricPaintSettings,
    type MetricMultiColorPaintSettings as StoredMetricMultiColorPaintSettings,
    type MetricSelection as StoredMetricSelection,
    type MetricSlot as StoredMetricSlot,
    type MetricSolidPaintSettings as StoredMetricSolidPaintSettings,
    type MultiColorSet as StoredMultiColorSet,
    type NetworkMetricTarget as StoredNetworkMetricTarget,
    type SlotOverrides as StoredSlotOverrides,
    type SingleMetricWidget as StoredSingleMetricWidget,
    type StackedMetricSlot as StoredStackedMetricSlot,
    type StackedMetricWidget as StoredStackedMetricWidget,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    CatalogMetricCategory,
    CatalogMetricReadingKind,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    ResolvedNetworkReading,
    ResolvedCpuReading,
    ResolvedGpuReading,
    ScaleMode,
    SourceFailureMode,
    TemperatureUnit,
} from "../resolved-settings";
import type { MetricUnit } from "../../runtime/sources/metric-source";
import type {
    ResolvedAppearanceSettingsOverride,
    ResolvedColorFilledPaintSettingsOverride,
    ResolvedMetricPaintSettingsOverride,
    ResolvedMultiColorSetOverride,
} from "../appearance-overrides";
import { normalizeNetworkPingTargetInput } from "../network-ping-target";
import { BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID } from "../../runtime/sources/source-ids";
import {
    readStoredWidgetSettings,
    writeStoredWidgetSettings,
    type StoredSettingsJsonObject,
} from "./codec";
import {
    createDefaultSlotId,
    createUniqueSlotId,
    type SlotIdGenerator,
} from "./slot-id";
import {
    DENSE_MULTI_METRIC_MAX_SLOT_COUNT,
    DENSE_MULTI_METRIC_MIN_SLOT_COUNT,
} from "./dense-multi-metric-constraints";
import {
    STACKED_METRIC_MAX_INTERVAL_SECONDS,
    STACKED_METRIC_MAX_SLOT_COUNT,
    STACKED_METRIC_MIN_INTERVAL_SECONDS,
    STACKED_METRIC_MIN_SLOT_COUNT,
} from "./stacked-metric-constraints";
import {
    storedCatalogMetricCategoryByResolved,
    storedCatalogMetricReadingKindByResolved,
    storedCircleViewVariantByResolved,
    storedColorModeByResolved,
    storedCpuMetricKindByResolved,
    storedDiskMetricKindByResolved,
    storedDiskThroughputDirectionByResolved,
    storedDiskUsageDisplayModeByResolved,
    storedGpuMetricKindByResolved,
    storedGridLineTypeByResolved,
    storedGridLineVisibilityByResolved,
    storedNetworkDirectionByResolved,
    storedNetworkTrafficDisplayModeByResolved,
    storedNetworkUnitBaseByResolved,
    storedTerminalPalettePresetByResolved,
    storedTerminalThemeVariantByResolved,
    storedTextViewVariantByResolved,
    storedScaleModeByResolved,
    storedMetricViewByResolved,
    storedNetworkMetricKindByResolved,
    storedSourceFailureModeByResolved,
    storedTemperatureUnitByResolved,
    storedThemeByResolved,
} from "./enum-maps";
import { applyStoredTransparentSurfacePatch } from "./transparent-surface-patch";

export interface StoredWidgetSettingsPatch {
    /** Replaces the metric source policy as a complete metric-level routing preference. */
    readonly source?: {
        readonly primarySourceProfileId: string | undefined;
        readonly fallbackSourceProfileIds: readonly string[];
        readonly failureMode: SourceFailureMode;
    } | undefined;
    readonly preferences?: {
        readonly pollingFrequencySeconds?: number | undefined;
    } | undefined;
    readonly appearance?: ResolvedAppearanceSettingsOverride | undefined;
    readonly network?: Partial<{
        readonly kind: ResolvedNetworkReading["kind"];
        readonly direction: NetworkDirection;
        readonly interfaceId: string;
        readonly trafficDisplayMode: NetworkTrafficDisplayMode;
        readonly pingTargetHost: string;
        readonly scaleMode: ScaleMode;
        readonly maximumDownloadSpeedMegabitsPerSecond: number | undefined;
        readonly maximumUploadSpeedMegabitsPerSecond: number | undefined;
        readonly unitBase: NetworkUnitBase;
    }>;
    readonly disk?: Partial<{
        readonly kind: "usage" | "throughput";
        readonly volumeId: string;
        readonly throughputDirection: DiskThroughputDirection;
        readonly usageDisplayMode: DiskUsageDisplayMode;
        readonly barLabel: string;
        readonly scaleMode: ScaleMode;
        readonly maximumReadThroughputMebibytesPerSecond: number | undefined;
        readonly maximumWriteThroughputMebibytesPerSecond: number | undefined;
    }>;
    readonly cpu?: Partial<{
        readonly kind: ResolvedCpuReading["kind"];
        readonly temperatureUnit: TemperatureUnit;
        readonly maximumTemperatureCelsius: number;
        readonly maximumPowerWatts: number | undefined;
    }>;
    readonly gpu?: Partial<{
        readonly kind: ResolvedGpuReading["kind"];
        readonly temperatureUnit: TemperatureUnit;
        readonly maximumTemperatureCelsius: number;
        readonly maximumPowerWatts: number | undefined;
    }>;
    readonly catalog?: Partial<{
        readonly metricId: string;
        readonly detectedLabel: string | undefined;
        readonly detectedUnit: MetricUnit | undefined;
        readonly detectedCategory: CatalogMetricCategory | undefined;
        readonly detectedReadingKind: CatalogMetricReadingKind | undefined;
        readonly customLabel: string | undefined;
        readonly customMaximumValue: number | undefined;
    }>;
    readonly dense?: DenseWidgetSettingsPatch | undefined;
    readonly stacked?: StackedWidgetSettingsPatch | undefined;
}

export type SingleMetricWidgetSettingsPatch = Omit<
    StoredWidgetSettingsPatch,
    "dense" | "stacked" | "preferences"
>;

export interface DenseWidgetSettingsPatch {
    readonly appearance?: ResolvedAppearanceSettingsOverride | undefined;
    readonly addSlot?: DenseMetricSlotPatch | undefined;
    readonly updateSlot?: DenseMetricSlotPatch & {
        readonly slotId: string;
    } | undefined;
    readonly moveSlot?: {
        readonly slotId: string;
        readonly direction: "up" | "down";
    } | undefined;
    readonly removeSlotId?: string | undefined;
}

export interface DenseMetricSlotPatch {
    readonly target?: DenseMetricTargetPatch | undefined;
    readonly customLabel?: string | undefined;
    readonly customMaximumValue?: number | undefined;
}

export type DenseMetricTargetPatch =
    | { readonly domain: "cpu"; readonly kind: ResolvedCpuReading["kind"] }
    | { readonly domain: "gpu"; readonly kind: ResolvedGpuReading["kind"] }
    | { readonly domain: "memory" }
    | {
        readonly domain: "disk";
        readonly kind: "usage" | "throughput";
        readonly volumeId?: string | undefined;
        readonly throughputDirection?: "read" | "write";
    }
    | { readonly domain: "network"; readonly kind: "traffic"; readonly direction: "upload" | "download" }
    | {
        readonly domain: "catalog";
        readonly metricId: string;
        readonly detectedLabel: string | undefined;
        readonly detectedUnit: MetricUnit | undefined;
        readonly detectedCategory: CatalogMetricCategory | undefined;
        readonly detectedReadingKind: CatalogMetricReadingKind | undefined;
    };

export interface StackedWidgetSettingsPatch {
    readonly rotation?: Partial<{
        readonly autoRotateEnabled: boolean;
        readonly intervalSeconds: number;
    }> | undefined;
    readonly addSlot?: StackedMetricSlotPatch | undefined;
    readonly updateSlot?: StackedMetricSlotPatch & {
        readonly slotId: string;
    } | undefined;
    readonly moveSlot?: {
        readonly slotId: string;
        readonly direction: "up" | "down";
    } | undefined;
    readonly removeSlotId?: string | undefined;
}

export interface StackedMetricSlotPatch {
    readonly singleMetric?: SingleMetricWidgetSettingsPatch | undefined;
}

export interface WriteStoredWidgetSettingsPatchOptions {
    readonly createSlotId?: SlotIdGenerator;
}

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
    if (patch.singleMetric !== undefined) {
        applySingleMetricWidgetPatch(requireStackedSingleMetricWidget(slot), patch.singleMetric);
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
    }
}

function applyPreferencesPatch(
    settings: StoredWidgetSettings,
    patch: NonNullable<StoredWidgetSettingsPatch["preferences"]>,
): void {
    settings.preferences ??= create(WidgetPreferencesSchema);
    settings.preferences.pollingFrequencySeconds = patch.pollingFrequencySeconds;
}

function applySourcePatch(
    metric: StoredMetricSelection,
    patch: NonNullable<StoredWidgetSettingsPatch["source"]>,
): void {
    const sourcePolicy = create(MetricSourcePolicySchema);

    sourcePolicy.primarySourceProfileId = patch.primarySourceProfileId;
    sourcePolicy.fallbackSourceProfileIds = [...patch.fallbackSourceProfileIds];
    sourcePolicy.failureMode = storedSourceFailureModeByResolved[patch.failureMode];
    metric.sourcePolicy = sourcePolicy;
}

function applyAppearancePatch(appearance: StoredAppearanceSettings, patch: ResolvedAppearanceSettingsOverride): void {
    if (patch.view !== undefined) {
        const view = appearance.view ??= create(AppearanceViewSettingsSchema);
        if (patch.view.selectedView !== undefined) {
            view.selectedView = storedMetricViewByResolved[patch.view.selectedView];
        }
        if (patch.view.circleVariant !== undefined) {
            view.circleVariant = storedCircleViewVariantByResolved[patch.view.circleVariant];
        }
        if (patch.view.textVariant !== undefined) {
            view.textVariant = storedTextViewVariantByResolved[patch.view.textVariant];
        }
    }

    if (patch.theme !== undefined) {
        applyAppearanceThemePatch(appearance.theme ??= create(AppearanceThemeSettingsSchema), patch.theme);
    }

    if (patch.line !== undefined) {
        const line = appearance.line ??= create(LineAppearanceSettingsSchema);
        if (patch.line.lineSmoothingPercent !== undefined) {
            line.lineSmoothingPercent = patch.line.lineSmoothingPercent;
        }
        if (patch.line.gridLineVisibility !== undefined) {
            line.gridLineVisibility = storedGridLineVisibilityByResolved[patch.line.gridLineVisibility];
        }
        if (patch.line.gridLineType !== undefined) {
            line.gridLineType = storedGridLineTypeByResolved[patch.line.gridLineType];
        }
    }
}

function applyAppearanceThemePatch(
    theme: NonNullable<StoredAppearanceSettings["theme"]>,
    patch: NonNullable<ResolvedAppearanceSettingsOverride["theme"]>,
): void {
    if (patch.selectedTheme !== undefined) {
        theme.selectedTheme = storedThemeByResolved[patch.selectedTheme];
    }
    if (patch.terminal?.variant !== undefined) {
        theme.terminal ??= create(TerminalThemeSettingsSchema);
        theme.terminal.variant = storedTerminalThemeVariantByResolved[patch.terminal.variant];
    }
    if (patch.terminal?.paint !== undefined) {
        theme.terminal ??= create(TerminalThemeSettingsSchema);
        const paint = theme.terminal.paint ??= create(TerminalPaintSettingsSchema);
        if (patch.terminal.paint.preset !== undefined) {
            paint.preset = storedTerminalPalettePresetByResolved[patch.terminal.paint.preset];
        }
    }
    if (patch.terminal?.transparentSurface !== undefined) {
        const terminal = theme.terminal ??= create(TerminalThemeSettingsSchema);
        applyStoredTransparentSurfacePatch(
            terminal.transparentSurface ??= create(TransparentSurfaceSettingsSchema),
            patch.terminal.transparentSurface,
        );
    }
    if (patch.flat?.paint !== undefined) {
        const flat = theme.flat ??= create(FlatThemeSettingsSchema);
        applyMetricPaintPatch(flat.paint ??= create(MetricPaintSettingsSchema), patch.flat.paint);
    }
    if (patch.flat?.transparentSurface !== undefined) {
        const flat = theme.flat ??= create(FlatThemeSettingsSchema);
        applyStoredTransparentSurfacePatch(
            flat.transparentSurface ??= create(TransparentSurfaceSettingsSchema),
            patch.flat.transparentSurface,
        );
    }
    if (patch.cupertinoGlass?.paint !== undefined) {
        const cupertinoGlass = theme.cupertinoGlass ??= create(CupertinoGlassThemeSettingsSchema);
        applyMetricPaintPatch(cupertinoGlass.paint ??= create(MetricPaintSettingsSchema), patch.cupertinoGlass.paint);
    }
    if (patch.cupertinoGlass?.transparentSurface !== undefined) {
        const cupertinoGlass = theme.cupertinoGlass ??= create(CupertinoGlassThemeSettingsSchema);
        applyStoredTransparentSurfacePatch(
            cupertinoGlass.transparentSurface ??= create(TransparentSurfaceSettingsSchema),
            patch.cupertinoGlass.transparentSurface,
        );
    }
    if (patch.colorFilled?.paint !== undefined) {
        const colorFilled = theme.colorFilled ??= create(ColorFilledThemeSettingsSchema);
        applyColorFilledPaintPatch(
            colorFilled.paint ??= create(ColorFilledPaintSettingsSchema),
            patch.colorFilled.paint,
        );
    }
    if (patch.colorFilled?.transparentSurface !== undefined) {
        const colorFilled = theme.colorFilled ??= create(ColorFilledThemeSettingsSchema);
        applyStoredTransparentSurfacePatch(
            colorFilled.transparentSurface ??= create(TransparentSurfaceSettingsSchema),
            patch.colorFilled.transparentSurface,
        );
    }
    if (patch.pixelWindow?.transparentSurface !== undefined) {
        const pixelWindow = theme.pixelWindow ??= create(PixelWindowThemeSettingsSchema);
        applyStoredTransparentSurfacePatch(
            pixelWindow.transparentSurface ??= create(TransparentSurfaceSettingsSchema),
            patch.pixelWindow.transparentSurface,
        );
    }
}

function applyColorFilledPaintPatch(
    colorFilled: StoredColorFilledPaintSettings,
    patch: ResolvedColorFilledPaintSettingsOverride,
): void {
    if (patch.colorMode !== undefined) {
        colorFilled.colorMode = storedColorModeByResolved[patch.colorMode];
    }
    if (patch.solid !== undefined) {
        const solid = colorFilled.solid ??= create(ColorFilledSolidPaintSettingsSchema);
        if (patch.solid.color !== undefined) {
            solid.color = patch.solid.color;
        }
        if (patch.solid.isGradientEnabled !== undefined) {
            solid.gradientEnabled = patch.solid.isGradientEnabled;
        }
    }
    if (patch.multiColor !== undefined) {
        const multiColor = colorFilled.multiColor ??= create(ColorFilledMultiColorPaintSettingsSchema);
        applyMultiColorSetPatch(multiColor.colors ??= create(MultiColorSetSchema), patch.multiColor.colors);
        if (patch.multiColor.isGradientEnabled !== undefined) {
            multiColor.gradientEnabled = patch.multiColor.isGradientEnabled;
        }
    }
}

function applyMetricPaintPatch(metric: StoredMetricPaintSettings, patch: ResolvedMetricPaintSettingsOverride): void {
    if (patch.colorMode !== undefined) {
        metric.colorMode = storedColorModeByResolved[patch.colorMode];
    }
    if (patch.solid !== undefined) {
        applyMetricSolidPaintPatch(metric.solid ??= create(MetricSolidPaintSettingsSchema), patch.solid);
    }
    if (patch.multiColor !== undefined) {
        applyMetricMultiColorPaintPatch(
            metric.multiColor ??= create(MetricMultiColorPaintSettingsSchema),
            patch.multiColor,
        );
    }
}

function applyMetricSolidPaintPatch(
    solid: StoredMetricSolidPaintSettings,
    patch: NonNullable<ResolvedMetricPaintSettingsOverride["solid"]>,
): void {
    if (patch.colors !== undefined) {
        const colors = solid.colors ??= create(MetricSolidChannelColorsSchema);
        if (patch.colors.usageColor !== undefined) {
            colors.usageColor = patch.colors.usageColor;
        }
        if (patch.colors.downloadColor !== undefined) {
            colors.downloadColor = patch.colors.downloadColor;
        }
        if (patch.colors.uploadColor !== undefined) {
            colors.uploadColor = patch.colors.uploadColor;
        }
        if (patch.colors.diskReadColor !== undefined) {
            colors.diskReadColor = patch.colors.diskReadColor;
        }
        if (patch.colors.diskWriteColor !== undefined) {
            colors.diskWriteColor = patch.colors.diskWriteColor;
        }
    }
    if (patch.isGradientEnabled !== undefined) {
        solid.gradientEnabled = patch.isGradientEnabled;
    }
}

function applyMetricMultiColorPaintPatch(
    multiColor: StoredMetricMultiColorPaintSettings,
    patch: NonNullable<ResolvedMetricPaintSettingsOverride["multiColor"]>,
): void {
    if (patch.lowThresholdPercent !== undefined) {
        multiColor.lowThresholdPercent = patch.lowThresholdPercent;
    }
    if (patch.highThresholdPercent !== undefined) {
        multiColor.highThresholdPercent = patch.highThresholdPercent;
    }
    if (patch.isGradientEnabled !== undefined) {
        multiColor.gradientEnabled = patch.isGradientEnabled;
    }
    if (patch.colors !== undefined) {
        const colors = multiColor.colors ??= create(MetricMultiColorChannelColorsSchema);
        applyMultiColorSetPatch(colors.usage ??= create(MultiColorSetSchema), patch.colors.usage);
        applyMultiColorSetPatch(colors.download ??= create(MultiColorSetSchema), patch.colors.download);
        applyMultiColorSetPatch(colors.upload ??= create(MultiColorSetSchema), patch.colors.upload);
        applyMultiColorSetPatch(colors.diskRead ??= create(MultiColorSetSchema), patch.colors.diskRead);
        applyMultiColorSetPatch(colors.diskWrite ??= create(MultiColorSetSchema), patch.colors.diskWrite);
    }
}

function applyMultiColorSetPatch(colors: StoredMultiColorSet, patch: ResolvedMultiColorSetOverride | undefined): void {
    if (patch?.lowColor !== undefined) {
        colors.lowColor = patch.lowColor;
    }
    if (patch?.mediumColor !== undefined) {
        colors.mediumColor = patch.mediumColor;
    }
    if (patch?.highColor !== undefined) {
        colors.highColor = patch.highColor;
    }
}

function applyNetworkPatch(
    target: StoredNetworkMetricTarget,
    overrides: StoredSlotOverrides,
    patch: NonNullable<StoredWidgetSettingsPatch["network"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedNetworkMetricKindByResolved[patch.kind];
        if (patch.kind === "traffic") {
            target.traffic ??= create(NetworkMetricTarget_TrafficSchema);
            target.ping = undefined;
        } else {
            target.ping ??= create(NetworkMetricTarget_PingSchema);
            target.traffic = undefined;
        }
    }

    if (patch.direction !== undefined) {
        const traffic = ensureNetworkTrafficTarget(target);
        traffic.direction = storedNetworkDirectionByResolved[patch.direction];
    }
    if (patch.interfaceId !== undefined) {
        const traffic = ensureNetworkTrafficTarget(target);
        traffic.interfaceId = patch.interfaceId;
    }
    if (patch.trafficDisplayMode !== undefined) {
        const traffic = ensureNetworkTrafficTarget(target);
        traffic.trafficDisplayMode = storedNetworkTrafficDisplayModeByResolved[patch.trafficDisplayMode];
    }

    if (patch.pingTargetHost !== undefined) {
        target.kind = StoredNetworkMetricKind.PING;
        const ping = target.ping ??= create(NetworkMetricTarget_PingSchema);
        ping.targetHost = normalizeNetworkPingTargetInput(patch.pingTargetHost).targetHost;
    }

    if (target.kind === StoredNetworkMetricKind.PING || !hasNetworkDisplayPatch(patch)) {
        return;
    }

    const display = overrides.network ??= create(NetworkDisplaySettingsSchema);

    if (patch.scaleMode !== undefined) {
        display.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumDownloadSpeedMegabitsPerSecond" in patch) {
        display.maximumDownloadSpeedMegabitsPerSecond = patch.maximumDownloadSpeedMegabitsPerSecond;
    }
    if ("maximumUploadSpeedMegabitsPerSecond" in patch) {
        display.maximumUploadSpeedMegabitsPerSecond = patch.maximumUploadSpeedMegabitsPerSecond;
    }
    if (patch.unitBase !== undefined) {
        display.unitBase = storedNetworkUnitBaseByResolved[patch.unitBase];
    }
}

function ensureNetworkTrafficTarget(
    target: StoredNetworkMetricTarget,
): NonNullable<StoredNetworkMetricTarget["traffic"]> {
    if (target.kind !== StoredNetworkMetricKind.TRAFFIC) {
        target.kind = StoredNetworkMetricKind.TRAFFIC;
        target.ping = undefined;
    }

    return target.traffic ??= create(NetworkMetricTarget_TrafficSchema);
}

function hasNetworkDisplayPatch(patch: NonNullable<StoredWidgetSettingsPatch["network"]>): boolean {
    return patch.scaleMode !== undefined
        || "maximumDownloadSpeedMegabitsPerSecond" in patch
        || "maximumUploadSpeedMegabitsPerSecond" in patch
        || patch.unitBase !== undefined;
}

function applyDiskPatch(
    target: StoredDiskMetricTarget,
    overrides: StoredSlotOverrides,
    patch: NonNullable<StoredWidgetSettingsPatch["disk"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedDiskMetricKindByResolved[patch.kind];
    }
    applyDefinedValue(target, "volumeId", patch.volumeId);
    if (patch.throughputDirection !== undefined) {
        target.throughputDirection = storedDiskThroughputDirectionByResolved[patch.throughputDirection];
    }
    if (patch.usageDisplayMode !== undefined) {
        target.usageDisplayMode = storedDiskUsageDisplayModeByResolved[patch.usageDisplayMode];
    }
    applyDefinedValue(target, "barLabel", patch.barLabel);

    const display = overrides.diskThroughput ??= create(DiskThroughputDisplaySettingsSchema);

    if (patch.scaleMode !== undefined) {
        display.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumReadThroughputMebibytesPerSecond" in patch) {
        display.maximumReadThroughputMebibytesPerSecond = patch.maximumReadThroughputMebibytesPerSecond;
    }
    if ("maximumWriteThroughputMebibytesPerSecond" in patch) {
        display.maximumWriteThroughputMebibytesPerSecond = patch.maximumWriteThroughputMebibytesPerSecond;
    }
}

function applyCpuPatch(
    target: StoredCpuMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["cpu"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedCpuMetricKindByResolved[patch.kind];
    }
    if (patch.temperatureUnit !== undefined) {
        target.temperatureUnit = storedTemperatureUnitByResolved[patch.temperatureUnit];
    }
    applyDefinedValue(target, "maximumTemperatureCelsius", patch.maximumTemperatureCelsius);
    if ("maximumPowerWatts" in patch) {
        target.maximumPowerWatts = patch.maximumPowerWatts;
    }
}

function applyGpuPatch(
    target: StoredGpuMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["gpu"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedGpuMetricKindByResolved[patch.kind];
    }
    if (patch.temperatureUnit !== undefined) {
        target.temperatureUnit = storedTemperatureUnitByResolved[patch.temperatureUnit];
    }
    applyDefinedValue(target, "maximumTemperatureCelsius", patch.maximumTemperatureCelsius);
    if ("maximumPowerWatts" in patch) {
        target.maximumPowerWatts = patch.maximumPowerWatts;
    }
}

function applyCatalogPatch(
    target: StoredCatalogMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["catalog"]>,
): void {
    if (patch.metricId !== undefined) {
        target.metricId = patch.metricId;
    }
    if ("detectedLabel" in patch) {
        target.detectedLabel = patch.detectedLabel;
    }
    if ("detectedUnit" in patch) {
        target.detectedUnit = patch.detectedUnit;
    }
    if ("detectedCategory" in patch) {
        target.detectedCategory = patch.detectedCategory === undefined
            ? undefined
            : storedCatalogMetricCategoryByResolved[patch.detectedCategory];
    }
    if ("detectedReadingKind" in patch) {
        target.detectedReadingKind = patch.detectedReadingKind === undefined
            ? undefined
            : storedCatalogMetricReadingKindByResolved[patch.detectedReadingKind];
    }
    if ("customLabel" in patch) {
        target.customLabel = patch.customLabel;
    }
    if ("customMaximumValue" in patch) {
        target.customMaximumValue = patch.customMaximumValue;
    }
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

function throwPatchTargetMismatch(message: string): never {
    throw new Error(message);
}

function applyDefinedValue<TObject extends object, TKey extends keyof TObject>(
    object: TObject,
    key: TKey,
    value: TObject[TKey] | undefined,
): void {
    if (value !== undefined) {
        object[key] = value;
    }
}
