import type {
    GlobalSettings,
    WidgetSettings,
} from "./model";

export type JsonPrimitive = boolean | number | string | null | undefined;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
    [key: string]: JsonValue;
};

export function readWidgetSettings(rawSettings: unknown): WidgetSettings {
    if (!rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
        return {};
    }

    return rawSettings as WidgetSettings;
}

export function readPluginGlobalSettings(rawSettings: unknown): GlobalSettings {
    if (!rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
        return {};
    }

    return rawSettings as GlobalSettings;
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
