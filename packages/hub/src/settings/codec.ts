import type {
    GlobalSettings,
    WidgetSettings,
} from "./model";

type JsonPrimitive = boolean | number | string | null | undefined;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
    [key: string]: JsonValue;
};
export type RawWidgetSettingsClassification = "missing" | "present";

export function readWidgetSettings(rawSettings: unknown): WidgetSettings {
    if (!rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
        return {};
    }

    return rawSettings as WidgetSettings;
}

export function readGlobalSettings(rawSettings: unknown): GlobalSettings {
    if (!rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
        return {};
    }

    return rawSettings as GlobalSettings;
}

export function classifyRawWidgetSettings(rawSettings: unknown): RawWidgetSettingsClassification {
    if (!rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
        return "missing";
    }

    // TODO: When proto/Zod owns this codec boundary, return an explicit
    // invalid/corrupt result from real decode/parse failures. During the
    // pre-contract cleanup we intentionally do not validate raw settings.
    return Object.keys(rawSettings).length === 0 ? "missing" : "present";
}

export function writeWidgetSettings(settings: WidgetSettings): JsonObject {
    const output: JsonObject = {};

    if (settings.metric) {
        output.metric = { ...settings.metric } as JsonObject;
    }

    if (settings.local) {
        output.local = { ...settings.local } as JsonObject;
    }

    if (settings.appearanceOverrides) {
        output.appearanceOverrides = { ...settings.appearanceOverrides } as JsonObject;
    }

    if (settings.networkOverrides) {
        output.networkOverrides = { ...settings.networkOverrides } as JsonObject;
    }

    if (settings.diskThroughputOverrides) {
        output.diskThroughputOverrides = { ...settings.diskThroughputOverrides } as JsonObject;
    }

    if (settings.runtimeCache) {
        output.runtimeCache = { ...settings.runtimeCache } as JsonObject;
    }

    return output;
}

export function writeGlobalSettings(settings: GlobalSettings): JsonObject {
    const output: JsonObject = {};

    if (settings.overrideWidgetAppearance !== undefined) {
        output.overrideWidgetAppearance = settings.overrideWidgetAppearance;
    }

    if (settings.appearanceDefaults) {
        output.appearanceDefaults = { ...settings.appearanceDefaults } as JsonObject;
    }

    if (settings.networkDefaults) {
        output.networkDefaults = { ...settings.networkDefaults } as JsonObject;
    }

    if (settings.diskThroughputDefaults) {
        output.diskThroughputDefaults = { ...settings.diskThroughputDefaults } as JsonObject;
    }

    return output;
}
