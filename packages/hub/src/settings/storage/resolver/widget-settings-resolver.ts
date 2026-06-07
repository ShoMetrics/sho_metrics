
import {
    type DenseMetricSlot as StoredDenseMetricSlot,
    type DenseMultiMetricWidget as StoredDenseMultiMetricWidget,
    type MetricSlot as StoredMetricSlot,
    type StoredWidgetSettings,
} from "../../../generated/shometrics/v1/settings_pb.js";
import type {
    ResolvedDenseMetricSlot,
    ResolvedDenseMultiMetricWidget,
    ResolvedGlobalSettings,
    ResolvedMetricSlot,
    ResolvedMetricTarget,
    ResolvedWidgetPreferences,
    ResolvedWidgetSettings,
} from "../../resolved-settings";
import {
    DENSE_MULTI_METRIC_MAX_SLOT_COUNT,
    DENSE_MULTI_METRIC_MIN_SLOT_COUNT,
} from "../dense-multi-metric-constraints";
import {
    resolveDiskThroughputDisplaySettings,
    resolveNetworkDisplaySettings,
} from "./display-settings-resolver";
import {
    applyGlobalPaintOverride,
    applyGlobalThemeOverride,
    applyGlobalTransparentSurfaceOverride,
    applyGlobalViewOverride,
    mergeAppearanceSettings,
    resolveDefaultAppearanceSettings,
    resolveDenseAppearanceSettings,
} from "./appearance-resolver";
import { resolveMetricSelection } from "./metric-target-resolver";
import { resolveStoredGlobalSettings } from "./global-settings-resolver";
import type { ResolveStoredSettingsRuntimeContext, ResolveStoredWidgetSettingsOptions } from "./resolver-types";
import {
    normalizeOptionalText,
    throwUnexpectedStoredSettingsState,
} from "./resolver-helpers";

const DEFAULT_WIDGET_PREFERENCES: ResolvedWidgetPreferences = {
    pollingFrequencySeconds: 1,
};

const DEFAULT_DISK_USAGE_POLLING_FREQUENCY_SECONDS = 60;

export function resolveStoredWidgetSettings(
    options: ResolveStoredWidgetSettingsOptions,
): ResolvedWidgetSettings {
    const globalSettings = resolveStoredGlobalSettings(options.storedGlobalSettings);

    switch (options.storedWidgetSettings.widget.case) {
        case "denseMultiMetric":
            return {
                widget: resolveDenseMultiMetricWidget(
                    options.storedWidgetSettings.widget.value,
                    globalSettings,
                    options.runtime,
                ),
                preferences: resolveWidgetPreferences(options.storedWidgetSettings),
            };
        case "singleMetric":
        case undefined: {
            const slot = resolveMetricSlot(
                resolveStoredSingleMetricSlot(options.storedWidgetSettings),
                globalSettings,
                options.runtime,
            );

            return {
                widget: {
                    widgetKind: "singleMetric",
                    slot,
                },
                preferences: resolveWidgetPreferences(options.storedWidgetSettings, slot.metric.target),
            };
        }
    }
}

/** Resolves stored global defaults, overrides, and source profiles. */

function resolveStoredSingleMetricSlot(storedWidgetSettings: StoredWidgetSettings): StoredMetricSlot | undefined {
    switch (storedWidgetSettings.widget.case) {
        case "singleMetric":
            return storedWidgetSettings.widget.value.slot;
        case undefined:
            return undefined;
    }
}

function resolveMetricSlot(
    storedSlot: StoredMetricSlot | undefined,
    globalSettings: ResolvedGlobalSettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedMetricSlot {
    const networkDisplay = resolveNetworkDisplaySettings(
        globalSettings.defaults.network,
        storedSlot?.overrides?.network,
        runtime,
    );
    const diskThroughputDisplay = resolveDiskThroughputDisplaySettings(
        globalSettings.defaults.diskThroughput,
        storedSlot?.overrides?.diskThroughput,
        runtime,
    );
    const metric = resolveMetricSelection(
        storedSlot?.metric,
        networkDisplay,
        diskThroughputDisplay,
        runtime,
    );
    const slotAppearance = mergeAppearanceSettings(
        resolveDefaultAppearanceSettings(metric.target),
        storedSlot?.overrides?.appearance,
    );
    const appearanceWithViewOverride = globalSettings.viewOverride
        ? applyGlobalViewOverride(slotAppearance, globalSettings.viewOverride)
        : slotAppearance;
    const appearanceWithThemeOverride = globalSettings.themeOverride
        ? applyGlobalThemeOverride(appearanceWithViewOverride, globalSettings.themeOverride)
        : appearanceWithViewOverride;
    const appearanceWithPaintOverride = globalSettings.paintOverride
        ? applyGlobalPaintOverride(appearanceWithThemeOverride, globalSettings.paintOverride)
        : appearanceWithThemeOverride;
    const appearance = globalSettings.transparentSurfaceOverride
        ? applyGlobalTransparentSurfaceOverride(appearanceWithPaintOverride, globalSettings.transparentSurfaceOverride)
        : appearanceWithPaintOverride;

    return {
        metric,
        appearance,
    };
}

function resolveDenseMultiMetricWidget(
    storedWidget: StoredDenseMultiMetricWidget,
    globalSettings: ResolvedGlobalSettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedDenseMultiMetricWidget {
    const storedSlots = readDenseMetricSlots(storedWidget);

    return {
        widgetKind: "denseMultiMetric",
        slots: storedSlots.map((storedSlot) => resolveDenseMetricSlot(storedSlot, globalSettings, runtime)),
        appearance: resolveDenseAppearanceSettings(storedWidget.appearance, globalSettings),
    };
}

function readDenseMetricSlots(storedWidget: StoredDenseMultiMetricWidget): readonly StoredDenseMetricSlot[] {
    // Resolved dense widgets promise stable row bounds and identity even when
    // callers construct stored proto objects without going through the codec.
    if (
        storedWidget.slots.length < DENSE_MULTI_METRIC_MIN_SLOT_COUNT
        || storedWidget.slots.length > DENSE_MULTI_METRIC_MAX_SLOT_COUNT
    ) {
        return throwUnexpectedStoredSettingsState(
            `Dense multi metric widgets must have ${DENSE_MULTI_METRIC_MIN_SLOT_COUNT}`
            + ` to ${DENSE_MULTI_METRIC_MAX_SLOT_COUNT} metric slots.`,
        );
    }

    const slotIds = new Set<string>();
    for (const storedSlot of storedWidget.slots) {
        if (storedSlot.slotId === "") {
            return throwUnexpectedStoredSettingsState("Dense metric slot is missing its stable slot id.");
        }
        if (slotIds.has(storedSlot.slotId)) {
            return throwUnexpectedStoredSettingsState("Dense metric slot ids must be unique.");
        }
        slotIds.add(storedSlot.slotId);
    }

    return storedWidget.slots;
}

function resolveDenseMetricSlot(
    storedSlot: StoredDenseMetricSlot,
    globalSettings: ResolvedGlobalSettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedDenseMetricSlot {
    return {
        slotId: storedSlot.slotId,
        slot: resolveMetricSlot(storedSlot.slot, globalSettings, runtime),
        customLabel: normalizeOptionalText(storedSlot.customLabel),
        customMaximumValue: storedSlot.customMaximumValue,
    };
}

function resolveWidgetPreferences(
    storedWidgetSettings: StoredWidgetSettings,
    resolvedTarget?: ResolvedMetricTarget,
): ResolvedWidgetPreferences {
    return {
        pollingFrequencySeconds: storedWidgetSettings.preferences?.pollingFrequencySeconds
            ?? (resolvedTarget === undefined
                ? DEFAULT_WIDGET_PREFERENCES.pollingFrequencySeconds
                : defaultPollingFrequencySeconds(resolvedTarget)),
    };
}

function defaultPollingFrequencySeconds(resolvedTarget: ResolvedMetricTarget): number {
    if (resolvedTarget.domain === "disk" && resolvedTarget.reading.kind === "usage") {
        return DEFAULT_DISK_USAGE_POLLING_FREQUENCY_SECONDS;
    }

    return DEFAULT_WIDGET_PREFERENCES.pollingFrequencySeconds;
}
