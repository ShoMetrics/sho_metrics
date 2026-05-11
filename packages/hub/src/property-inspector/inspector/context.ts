import { resolveWidgetSettings } from "../../settings/resolver";
import type {
    GlobalSettings,
    SettingsContext,
    WidgetStoredSettings,
} from "../../settings/widget-settings";
import type { WidgetRuntimeCache } from "../../runtime/widget-runtime-cache";
import type { VisibilityContext } from "./types";

export function buildPropertyInspectorContext(options: {
    storedSettings: WidgetStoredSettings;
    globalSettings: GlobalSettings;
    runtimeCache: WidgetRuntimeCache;
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
        runtimeCache: options.runtimeCache,
        globalSettings: options.globalSettings,
        resolved: resolveWidgetSettings({
            storedSettings: options.storedSettings,
            globalSettings: options.globalSettings,
            context,
            runtimeCache: options.runtimeCache,
        }),
    };
}
