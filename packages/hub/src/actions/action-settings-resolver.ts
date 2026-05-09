import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    writeWidgetSettings,
    type JsonObject,
} from "../settings/codec";
import {
    normalizeWidgetStoredSettings,
    type ActionKind,
    type ResolvedWidgetSettings,
    type WidgetStoredSettings,
} from "../settings/widget-settings";
import { resolveWidgetSettings } from "../settings/resolver";

interface ActionSettingsEvent {
    payload: {
        settings?: unknown;
    };
}

export function resolveActionSettings(rawSettings: unknown, actionKind: ActionKind): ResolvedWidgetSettings {
    const context = {
        actionKind,
        isWindows: process.platform === "win32",
    };
    const storedSettings = normalizeActionStoredSettings(rawSettings);

    return resolveWidgetSettings({
        storedSettings,
        globalSettings: pluginGlobalSettingsStore.get(),
        context,
    });
}

function normalizeActionStoredSettings(rawSettings: unknown): WidgetStoredSettings {
    return normalizeWidgetStoredSettings(rawSettings);
}

export function readActionStoredSettings(event: ActionSettingsEvent): WidgetStoredSettings {
    return normalizeActionStoredSettings(event.payload.settings);
}

export function serializeActionStoredSettings(storedSettings: WidgetStoredSettings): JsonObject {
    return writeWidgetSettings(storedSettings);
}
