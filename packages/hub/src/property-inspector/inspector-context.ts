import { resolveWidgetSettings } from "../settings/resolver";
import type {
    GlobalSettings,
    SettingsContext,
    WidgetStoredSettings,
} from "../settings/widget-settings";
import type { VisibilityContext } from "./types";

export function buildPropertyInspectorContext(options: {
    storedSettings: WidgetStoredSettings;
    globalSettings: GlobalSettings;
    actionKind: SettingsContext["actionKind"];
    isWindows: boolean;
}): VisibilityContext {
    const context: SettingsContext = {
        actionKind: options.actionKind,
        isWindows: options.isWindows,
    };

    return {
        ...context,
        settings: options.storedSettings,
        globalSettings: options.globalSettings,
        resolved: resolveWidgetSettings({
            storedSettings: options.storedSettings,
            globalSettings: options.globalSettings,
            context,
        }),
    };
}
