import { pluginGlobalSettingsStore } from "../../settings/global-settings-store";
import { readWidgetSettings } from "../../settings/codec";
import {
    type ActionKind,
    type ResolvedWidgetSettings,
} from "../../settings/widget-settings";
import { resolveWidgetSettings } from "../../settings/resolver";

export function resolveActionSettings(rawSettings: unknown, actionKind: ActionKind): ResolvedWidgetSettings {
    const context = {
        actionKind,
        isWindows: process.platform === "win32",
    };
    const storedSettings = readWidgetSettings(rawSettings);

    return resolveWidgetSettings({
        storedSettings,
        globalSettings: pluginGlobalSettingsStore.get(),
        context,
    });
}
