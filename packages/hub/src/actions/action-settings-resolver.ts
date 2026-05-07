import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    normalizeWidgetStoredSettings,
    resolveFlatWidgetSettings,
    type ActionKind,
    type FlatWidgetSettings,
    type WidgetStoredSettings,
} from "../settings/widget-settings";

type JsonPrimitive = boolean | number | string | null | undefined;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = {
    [key: string]: JsonValue;
};

export function resolveActionSettings(rawSettings: Record<string, unknown>, actionKind: ActionKind): FlatWidgetSettings {
    const storedSettings = normalizeActionStoredSettings(rawSettings, actionKind);

    return resolveFlatWidgetSettings({
        actionKind,
        isWindows: process.platform === "win32",
        storedSettings,
        globalSettings: pluginGlobalSettingsStore.get(),
    });
}

export function normalizeActionStoredSettings(rawSettings: Record<string, unknown>, actionKind: ActionKind): WidgetStoredSettings {
    return normalizeWidgetStoredSettings(rawSettings, {
        actionKind,
        isWindows: process.platform === "win32",
    });
}

export function serializeActionStoredSettings(storedSettings: WidgetStoredSettings): JsonObject {
    return {
        metric: { ...storedSettings.metric } as JsonObject,
        local: { ...storedSettings.local } as JsonObject,
        appearanceOverrides: { ...storedSettings.appearanceOverrides } as JsonObject,
        networkOverrides: { ...storedSettings.networkOverrides } as JsonObject,
        diskThroughputOverrides: { ...storedSettings.diskThroughputOverrides } as JsonObject,
        runtimeCache: { ...storedSettings.runtimeCache } as JsonObject,
    };
}
