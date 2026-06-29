import { create } from "@bufbuild/protobuf";
import {
    AppearanceSettingsSchema,
    CpuHardwareSummaryReadingSchema,
    CpuHardwareSummaryTargetSchema,
    CpuMetricTarget_PowerSchema,
    CpuMetricTarget_TemperatureSchema,
    CpuMetricTarget_UsageSchema,
    CpuMetricTargetSchema,
    GpuHardwareSummaryReadingSchema,
    GpuHardwareSummaryTargetSchema,
    GpuMetricTarget_PowerSchema,
    GpuMetricTarget_TemperatureSchema,
    GpuMetricTarget_UsageSchema,
    GpuMetricTarget_VramSchema,
    GpuMetricTargetSchema,
    HardwareSummaryWidgetSchema,
    MetricSourcePolicySchema,
    type CpuHardwareSummaryReading as StoredCpuHardwareSummaryReading,
    type CpuHardwareSummaryTarget as StoredCpuHardwareSummaryTarget,
    type CpuMetricTarget as StoredCpuMetricTarget,
    type GpuHardwareSummaryReading as StoredGpuHardwareSummaryReading,
    type GpuHardwareSummaryTarget as StoredGpuHardwareSummaryTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type HardwareSummaryWidget as StoredHardwareSummaryWidget,
    type MetricSelection as StoredMetricSelection,
    type StoredWidgetSettings,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import { applyAppearancePatch } from "./appearance-settings-patch";
import {
    buildDefaultCpuMetricReading,
    buildDefaultGpuMetricReading,
} from "./metric-reading-builders";
import { throwPatchTargetMismatch } from "./patch-errors";
import {
    ensureSlotOverrides,
    requireCpuHardwareSummaryTarget,
    requireGpuHardwareSummaryTarget,
} from "./patch-require";
import { buildDefaultSingleMetricWidget } from "./single-metric-widget-settings-patch";
import {
    storedSourceFailureModeByResolved,
    storedTemperatureUnitByResolved,
} from "../resolved-to-stored-enum-maps";
import type { HardwareSummaryWidgetSettingsPatch, StoredWidgetSettingsPatch } from "./widget-settings-patch-types";

type StoredCpuReadingCase = NonNullable<StoredCpuMetricTarget["reading"]["case"]>;
type StoredGpuReadingCase = NonNullable<StoredGpuMetricTarget["reading"]["case"]>;

export function applyHardwareSummaryPatch(
    settings: StoredWidgetSettings,
    patch: HardwareSummaryWidgetSettingsPatch,
): void {
    if (patch.switchTo !== undefined) {
        applyHardwareSummaryModePatch(settings, patch.switchTo);
    }

    if (settings.widget.case !== "hardwareSummary") {
        return;
    }

    const widget = settings.widget.value;
    if (patch.appearance !== undefined) {
        applyAppearancePatch(widget.appearance ??= create(AppearanceSettingsSchema), patch.appearance);
    }
    if (patch.source !== undefined) {
        widget.sourcePolicy = buildStoredMetricSourcePolicy(patch.source);
    }
    if (patch.orderedReadings !== undefined) {
        applyHardwareSummaryOrderedReadingsPatch(widget, patch.orderedReadings);
    }
    if (patch.cpu !== undefined) {
        applyCpuHardwareSummaryPatch(requireCpuHardwareSummaryTarget(widget), patch.cpu);
    }
    if (patch.gpu !== undefined) {
        applyGpuHardwareSummaryPatch(requireGpuHardwareSummaryTarget(widget), patch.gpu);
    }
}

function applyHardwareSummaryModePatch(
    settings: StoredWidgetSettings,
    patch: NonNullable<HardwareSummaryWidgetSettingsPatch["switchTo"]>,
): void {
    switch (patch.widgetKind) {
        case "hardwareSummary":
            settings.widget = {
                case: "hardwareSummary",
                value: buildDefaultHardwareSummaryWidget(settings, patch.domain),
            };
            return;
        case "singleMetric":
            settings.widget = {
                case: "singleMetric",
                value: buildDefaultSingleMetricWidgetFromCurrentSettings(settings, patch),
            };
            return;
    }
}

function buildDefaultHardwareSummaryWidget(
    settings: StoredWidgetSettings,
    domain: "cpu" | "gpu",
): StoredHardwareSummaryWidget {
    const singleMetric = settings.widget.case === "singleMetric" ? settings.widget.value : undefined;
    const summary = create(HardwareSummaryWidgetSchema, {
        sourcePolicy: singleMetric?.slot?.metric?.sourcePolicy,
        appearance: singleMetric?.slot?.overrides?.appearance === undefined
            ? undefined
            : create(AppearanceSettingsSchema, singleMetric.slot.overrides.appearance),
        target: buildDefaultHardwareSummaryTarget(domain),
    });

    return summary;
}

function buildDefaultSingleMetricWidgetFromCurrentSettings(
    settings: StoredWidgetSettings,
    patch: Extract<
        NonNullable<HardwareSummaryWidgetSettingsPatch["switchTo"]>,
        { readonly widgetKind: "singleMetric" }
    >,
) {
    const summary = settings.widget.case === "hardwareSummary" ? settings.widget.value : undefined;
    const widget = buildDefaultSingleMetricWidget(patch.domain);
    const metric = widget.slot?.metric;
    if (metric === undefined) {
        return throwPatchTargetMismatch("Cannot build a single metric widget without a metric selection.");
    }

    metric.sourcePolicy = summary?.sourcePolicy;
    switch (patch.domain) {
        case "cpu":
            metric.target = {
                case: "cpu",
                value: create(CpuMetricTargetSchema, {
                    reading: readCpuSummaryReading(summary, patch.kind) ?? buildDefaultCpuMetricReading(patch.kind),
                }),
            };
            break;
        case "gpu":
            metric.target = {
                case: "gpu",
                value: create(GpuMetricTargetSchema, {
                    reading: readGpuSummaryReading(summary, patch.kind) ?? buildDefaultGpuMetricReading(patch.kind),
                }),
            };
            break;
    }

    if (summary?.appearance !== undefined && widget.slot !== undefined) {
        const overrides = ensureSlotOverrides(widget.slot);
        overrides.appearance = create(AppearanceSettingsSchema, summary.appearance);
    }

    return widget;
}

function readCpuSummaryReading(
    summary: StoredHardwareSummaryWidget | undefined,
    kind: StoredCpuReadingCase,
): StoredCpuMetricTarget["reading"] | undefined {
    if (summary?.target.case !== "cpu") {
        return undefined;
    }

    const reading = summary.target.value.orderedReadings.find(candidateReading => candidateReading.reading.case === kind)
        ?.reading;
    if (reading?.case !== kind) {
        return undefined;
    }

    switch (reading.case) {
        case "usage":
            return { case: "usage", value: create(CpuMetricTarget_UsageSchema) };
        case "temperature":
            return {
                case: "temperature",
                value: create(CpuMetricTarget_TemperatureSchema, reading.value),
            };
        case "power":
            return {
                case: "power",
                value: create(CpuMetricTarget_PowerSchema, reading.value),
            };
    }
}

function readGpuSummaryReading(
    summary: StoredHardwareSummaryWidget | undefined,
    kind: StoredGpuReadingCase,
): StoredGpuMetricTarget["reading"] | undefined {
    if (summary?.target.case !== "gpu") {
        return undefined;
    }

    const reading = summary.target.value.orderedReadings.find(candidateReading => candidateReading.reading.case === kind)
        ?.reading;
    if (reading?.case !== kind) {
        return undefined;
    }

    switch (reading.case) {
        case "usage":
            return { case: "usage", value: create(GpuMetricTarget_UsageSchema) };
        case "temperature":
            return {
                case: "temperature",
                value: create(GpuMetricTarget_TemperatureSchema, reading.value),
            };
        case "vram":
            return { case: "vram", value: create(GpuMetricTarget_VramSchema) };
        case "power":
            return {
                case: "power",
                value: create(GpuMetricTarget_PowerSchema, reading.value),
            };
    }
}

function buildDefaultHardwareSummaryTarget(domain: "cpu" | "gpu"): StoredHardwareSummaryWidget["target"] {
    switch (domain) {
        case "cpu":
            return {
                case: "cpu",
                value: create(CpuHardwareSummaryTargetSchema, {
                    orderedReadings: [
                        create(CpuHardwareSummaryReadingSchema, { reading: buildDefaultCpuMetricReading("usage") }),
                        create(CpuHardwareSummaryReadingSchema, { reading: buildDefaultCpuMetricReading("temperature") }),
                        create(CpuHardwareSummaryReadingSchema, { reading: buildDefaultCpuMetricReading("power") }),
                    ],
                }),
            };
        case "gpu":
            return {
                case: "gpu",
                value: create(GpuHardwareSummaryTargetSchema, {
                    orderedReadings: [
                        create(GpuHardwareSummaryReadingSchema, { reading: buildDefaultGpuMetricReading("usage") }),
                        create(GpuHardwareSummaryReadingSchema, { reading: buildDefaultGpuMetricReading("temperature") }),
                        create(GpuHardwareSummaryReadingSchema, { reading: buildDefaultGpuMetricReading("vram") }),
                    ],
                }),
            };
    }
}

function applyHardwareSummaryOrderedReadingsPatch(
    widget: StoredHardwareSummaryWidget,
    orderedReadings: NonNullable<HardwareSummaryWidgetSettingsPatch["orderedReadings"]>,
): void {
    switch (widget.target.case) {
        case "cpu":
            widget.target.value.orderedReadings = orderedReadings.map(buildCpuHardwareSummaryReading);
            return;
        case "gpu":
            widget.target.value.orderedReadings = orderedReadings.map(buildGpuHardwareSummaryReading);
            return;
        case undefined:
            return throwPatchTargetMismatch("Cannot update summary readings before choosing CPU or GPU.");
    }
}

function buildCpuHardwareSummaryReading(
    reading: NonNullable<HardwareSummaryWidgetSettingsPatch["orderedReadings"]>[number],
): StoredCpuHardwareSummaryReading {
    switch (reading.kind) {
        case "usage":
            return create(CpuHardwareSummaryReadingSchema, {
                reading: { case: "usage", value: create(CpuMetricTarget_UsageSchema) },
            });
        case "temperature":
            return create(CpuHardwareSummaryReadingSchema, {
                reading: {
                    case: "temperature",
                    value: create(CpuMetricTarget_TemperatureSchema, {
                        maximumTemperatureCelsius: reading.maximumCelsius,
                        temperatureUnit: storedTemperatureUnitByResolved[reading.unit],
                    }),
                },
            });
        case "power":
            return create(CpuHardwareSummaryReadingSchema, {
                reading: {
                    case: "power",
                    value: create(CpuMetricTarget_PowerSchema, {
                        maximumPowerWatts: reading.maximumWatts,
                    }),
                },
            });
        case "vram":
            return throwPatchTargetMismatch("CPU hardware summary cannot use VRAM.");
    }
}

function buildGpuHardwareSummaryReading(
    reading: NonNullable<HardwareSummaryWidgetSettingsPatch["orderedReadings"]>[number],
): StoredGpuHardwareSummaryReading {
    switch (reading.kind) {
        case "usage":
            return create(GpuHardwareSummaryReadingSchema, {
                reading: { case: "usage", value: create(GpuMetricTarget_UsageSchema) },
            });
        case "temperature":
            return create(GpuHardwareSummaryReadingSchema, {
                reading: {
                    case: "temperature",
                    value: create(GpuMetricTarget_TemperatureSchema, {
                        maximumTemperatureCelsius: reading.maximumCelsius,
                        temperatureUnit: storedTemperatureUnitByResolved[reading.unit],
                    }),
                },
            });
        case "vram":
            return create(GpuHardwareSummaryReadingSchema, {
                reading: { case: "vram", value: create(GpuMetricTarget_VramSchema) },
            });
        case "power":
            return create(GpuHardwareSummaryReadingSchema, {
                reading: {
                    case: "power",
                    value: create(GpuMetricTarget_PowerSchema, {
                        maximumPowerWatts: reading.maximumWatts,
                    }),
                },
            });
    }
}

function applyCpuHardwareSummaryPatch(
    target: StoredCpuHardwareSummaryTarget,
    patch: NonNullable<HardwareSummaryWidgetSettingsPatch["cpu"]>,
): void {
    if (patch.temperatureUnit !== undefined) {
        ensureCpuHardwareSummaryTemperatureReading(target).temperatureUnit =
            storedTemperatureUnitByResolved[patch.temperatureUnit];
    }
    if (patch.maximumTemperatureCelsius !== undefined) {
        ensureCpuHardwareSummaryTemperatureReading(target).maximumTemperatureCelsius =
            patch.maximumTemperatureCelsius;
    }
    if ("maximumPowerWatts" in patch) {
        ensureCpuHardwareSummaryPowerReading(target).maximumPowerWatts = patch.maximumPowerWatts;
    }
}

function applyGpuHardwareSummaryPatch(
    target: StoredGpuHardwareSummaryTarget,
    patch: NonNullable<HardwareSummaryWidgetSettingsPatch["gpu"]>,
): void {
    if (patch.temperatureUnit !== undefined) {
        ensureGpuHardwareSummaryTemperatureReading(target).temperatureUnit =
            storedTemperatureUnitByResolved[patch.temperatureUnit];
    }
    if (patch.maximumTemperatureCelsius !== undefined) {
        ensureGpuHardwareSummaryTemperatureReading(target).maximumTemperatureCelsius =
            patch.maximumTemperatureCelsius;
    }
    if ("maximumPowerWatts" in patch) {
        ensureGpuHardwareSummaryPowerReading(target).maximumPowerWatts = patch.maximumPowerWatts;
    }
}

function ensureCpuHardwareSummaryTemperatureReading(
    target: StoredCpuHardwareSummaryTarget,
) {
    const reading = target.orderedReadings.find((candidateReading) => candidateReading.reading.case === "temperature");
    if (reading?.reading.case !== "temperature") {
        return throwPatchTargetMismatch("Cannot patch CPU summary temperature settings when temperature is not selected.");
    }

    return reading.reading.value;
}

function ensureCpuHardwareSummaryPowerReading(
    target: StoredCpuHardwareSummaryTarget,
) {
    const reading = target.orderedReadings.find((candidateReading) => candidateReading.reading.case === "power");
    if (reading?.reading.case !== "power") {
        return throwPatchTargetMismatch("Cannot patch CPU summary power settings when power is not selected.");
    }

    return reading.reading.value;
}

function ensureGpuHardwareSummaryTemperatureReading(
    target: StoredGpuHardwareSummaryTarget,
) {
    const reading = target.orderedReadings.find((candidateReading) => candidateReading.reading.case === "temperature");
    if (reading?.reading.case !== "temperature") {
        return throwPatchTargetMismatch("Cannot patch GPU summary temperature settings when temperature is not selected.");
    }

    return reading.reading.value;
}

function ensureGpuHardwareSummaryPowerReading(
    target: StoredGpuHardwareSummaryTarget,
) {
    const reading = target.orderedReadings.find((candidateReading) => candidateReading.reading.case === "power");
    if (reading?.reading.case !== "power") {
        return throwPatchTargetMismatch("Cannot patch GPU summary power settings when power is not selected.");
    }

    return reading.reading.value;
}

function buildStoredMetricSourcePolicy(
    patch: NonNullable<StoredWidgetSettingsPatch["source"]>,
): StoredMetricSelection["sourcePolicy"] {
    const sourcePolicy = create(MetricSourcePolicySchema);
    sourcePolicy.primarySourceProfileId = patch.primarySourceProfileId;
    sourcePolicy.fallbackSourceProfileIds = [...patch.fallbackSourceProfileIds];
    sourcePolicy.failureMode = storedSourceFailureModeByResolved[patch.failureMode];
    return sourcePolicy;
}
