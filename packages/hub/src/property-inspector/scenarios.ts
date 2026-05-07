import {
    basePropertyInspectorSettings,
    normalizeDiskMetricKind,
    normalizeDiskThroughputDirection,
    normalizeDiskUsageDisplayMode,
    normalizeNetworkDirection,
    normalizeOptionalPositiveNumber,
    normalizePollingFrequency,
    normalizePositiveNumber,
    normalizePropertyInspectorSettings,
    normalizeScaleMode,
    normalizeTemperatureUnit,
    normalizeThreshold,
    resolveDefaultDiskPollingFrequency,
    resolveDefaultSolidColor,
    type NormalizeSettingsContext,
    type PropertyInspectorSettings,
    type SettingValue,
} from "./settings";
import {
    resolveScenarioFieldList,
    type InspectorScenario,
    type PropertyInspectorState,
} from "./scenario-model";
import type { FieldSchema, VisibilityContext } from "./schema";
import { resolveDefaultScenario } from "./scenarios/default";
import { resolveDiskScenario } from "./scenarios/disk";
import { resolveGpuPowerScenario, resolveGpuTempScenario } from "./scenarios/gpu";
import { resolveNetSpeedScenario } from "./scenarios/net-speed";

export function resolveInspectorFieldList(context: VisibilityContext): readonly FieldSchema[] {
    const scenario = resolveInspectorScenario(context);

    return resolveScenarioFieldList(scenario, context)
        .filter(field => isFieldAllowedInScenario(field, scenario, context));
}

export function normalizeSettings(
    rawSettings: Record<string, SettingValue>,
    context: NormalizeSettingsContext,
): PropertyInspectorSettings {
    const normalizedSettings = normalizePropertyInspectorSettings(rawSettings, context);
    const scenario = resolveInspectorScenario({
        actionKind: context.actionKind,
        isWindows: context.isWindows,
        settings: normalizedSettings,
    });

    return scenario.settingsNormalizer(rawSettings, context, normalizedSettings);
}

export function normalizeNextSettings(options: {
    changedKey: string;
    changedValue: string;
    state: PropertyInspectorState;
}): PropertyInspectorSettings {
    const rawSettings: Record<string, SettingValue> = {
        ...options.state.settings,
        [options.changedKey]: options.changedValue,
    };
    const diskMetricKind = normalizeDiskMetricKind(
        options.changedKey === "diskMetricKind" ? options.changedValue : options.state.settings.diskMetricKind,
        options.state.isWindows,
    );
    const lowThreshold = normalizeThreshold(rawSettings.lowThreshold, basePropertyInspectorSettings.lowThreshold);
    const highThreshold = normalizeThreshold(rawSettings.highThreshold, basePropertyInspectorSettings.highThreshold);
    const orderedThresholds = resolveOrderedThresholds(options.changedKey, lowThreshold, highThreshold);
    const networkDirection = normalizeNetworkDirection(rawSettings.networkDirection);

    return normalizeSettings({
        ...rawSettings,
        pollingFrequencySeconds: options.changedKey === "diskMetricKind"
            ? resolveDefaultDiskPollingFrequency(diskMetricKind)
            : normalizePollingFrequency(rawSettings.pollingFrequencySeconds),
        diskMetricKind,
        diskUsageDisplayMode: normalizeDiskUsageDisplayMode(rawSettings.diskUsageDisplayMode),
        diskThroughputDirection: normalizeDiskThroughputDirection(rawSettings.diskThroughputDirection),
        networkScaleMode: options.changedKey === "maximumDownloadSpeedMbps"
            || options.changedKey === "maximumUploadSpeedMbps"
            ? "custom"
            : normalizeScaleMode(rawSettings.networkScaleMode),
        diskThroughputScaleMode: options.changedKey === "maximumDiskReadThroughputMebibytesPerSecond"
            || options.changedKey === "maximumDiskWriteThroughputMebibytesPerSecond"
            ? "custom"
            : normalizeScaleMode(rawSettings.diskThroughputScaleMode),
        maximumDiskReadThroughputMebibytesPerSecond: normalizeOptionalPositiveNumber(
            rawSettings.maximumDiskReadThroughputMebibytesPerSecond,
        ),
        maximumDiskWriteThroughputMebibytesPerSecond: normalizeOptionalPositiveNumber(
            rawSettings.maximumDiskWriteThroughputMebibytesPerSecond,
        ),
        maximumTemperatureCelsius: normalizePositiveNumber(
            rawSettings.maximumTemperatureCelsius,
            basePropertyInspectorSettings.maximumTemperatureCelsius,
        ),
        maximumGpuPowerWatts: normalizeOptionalPositiveNumber(rawSettings.maximumGpuPowerWatts),
        maximumDownloadSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.maximumDownloadSpeedMbps),
        maximumUploadSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.maximumUploadSpeedMbps),
        networkDirection,
        networkUnitBase: rawSettings.networkUnitBase === "bit" ? "bit" : "byte",
        temperatureUnit: normalizeTemperatureUnit(rawSettings.temperatureUnit),
        lowThreshold: orderedThresholds.lowThreshold,
        highThreshold: orderedThresholds.highThreshold,
        solidColor: resolveNextSolidColor({
            changedKey: options.changedKey,
            changedValue: options.changedValue,
            networkDirection,
            state: options.state,
        }),
        netSpeedDefaultsApplied: options.state.actionKind === "net-speed"
            ? true
            : options.state.settings.netSpeedDefaultsApplied,
        diskDefaultsApplied: options.state.actionKind === "disk"
            ? true
            : options.state.settings.diskDefaultsApplied,
    }, {
        actionKind: options.state.actionKind,
        isWindows: options.state.isWindows,
    });
}

function resolveInspectorScenario(context: VisibilityContext): InspectorScenario {
    if (context.actionKind === "disk") {
        return resolveDiskScenario(context);
    }

    if (context.actionKind === "net-speed") {
        return resolveNetSpeedScenario(context);
    }

    if (context.actionKind === "gpu-temp") {
        return resolveGpuTempScenario(context.settings.graphicType);
    }

    if (context.actionKind === "gpu-power") {
        return resolveGpuPowerScenario(context.settings.graphicType);
    }

    return resolveDefaultScenario(context.actionKind, context.settings.graphicType);
}

function isFieldAllowedInScenario(
    field: FieldSchema,
    scenario: InspectorScenario,
    context: VisibilityContext,
): boolean {
    if (field.excludeWindows === true && context.isWindows) {
        return false;
    }

    if (field.allowedScopes.includes(scenario.scope)) {
        return true;
    }

    if (isDevelopmentEnvironment()) {
        throw new Error(`Field "${field.id}" is not allowed in scope "${scenario.scope}".`);
    }

    return false;
}

function resolveOrderedThresholds(
    changedKey: string,
    lowThreshold: number,
    highThreshold: number,
): { lowThreshold: number; highThreshold: number } {
    if (lowThreshold <= highThreshold) {
        return { lowThreshold, highThreshold };
    }

    if (changedKey === "lowThreshold") {
        return { lowThreshold, highThreshold: lowThreshold };
    }

    return { lowThreshold: highThreshold, highThreshold };
}

function resolveNextSolidColor(options: {
    changedKey: string;
    changedValue: SettingValue;
    networkDirection: SettingValue;
    state: PropertyInspectorState;
}): string {
    if (options.changedKey !== "networkDirection" || options.state.actionKind !== "net-speed") {
        return typeof options.state.settings.solidColor === "string"
            ? options.state.settings.solidColor
            : resolveDefaultSolidColor(options.networkDirection);
    }

    const currentDefaultColor = resolveDefaultSolidColor(options.state.settings.networkDirection);

    if (options.state.settings.solidColor && options.state.settings.solidColor !== currentDefaultColor) {
        return options.state.settings.solidColor;
    }

    return resolveDefaultSolidColor(options.changedValue);
}

function isDevelopmentEnvironment(): boolean {
    return typeof process !== "undefined"
        && typeof process.env === "object"
        && process.env.NODE_ENV === "development";
}
