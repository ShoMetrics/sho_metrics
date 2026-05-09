import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    writeWidgetSettings,
    type JsonObject,
} from "../settings/codec";
import {
    normalizeWidgetStoredSettings,
    resolveWidgetSettings,
    type ActionKind,
    type ResolvedWidgetSettings,
    type WidgetStoredSettings,
} from "../settings/widget-settings";

export function resolveActionSettings(rawSettings: unknown, actionKind: ActionKind): ResolvedWidgetSettings {
    const storedSettings = normalizeActionStoredSettings(rawSettings, actionKind);

    return resolveWidgetSettings({
        actionKind,
        isWindows: process.platform === "win32",
        storedSettings,
        globalSettings: pluginGlobalSettingsStore.get(),
    });
}

export function normalizeActionStoredSettings(rawSettings: unknown, actionKind: ActionKind): WidgetStoredSettings {
    return normalizeWidgetStoredSettings(rawSettings, {
        actionKind,
        isWindows: process.platform === "win32",
    });
}

export function serializeActionStoredSettings(storedSettings: WidgetStoredSettings): JsonObject {
    return writeWidgetSettings(storedSettings);
}
