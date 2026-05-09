import type {
    GlobalSettings,
    WidgetSettings,
    WidgetStoredSettings,
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

export function writeWidgetSettings(settings: WidgetStoredSettings): JsonObject {
    return {
        metric: { ...settings.metric } as JsonObject,
        local: { ...settings.local } as JsonObject,
        appearanceOverrides: { ...settings.appearanceOverrides } as JsonObject,
        networkOverrides: { ...settings.networkOverrides } as JsonObject,
        diskThroughputOverrides: { ...settings.diskThroughputOverrides } as JsonObject,
        runtimeCache: { ...settings.runtimeCache } as JsonObject,
    };
}
