import {
    defaultPluginGlobalSettings,
    normalizeWidgetStoredSettings,
    type ActionKind,
} from "../settings/widget-settings";
import { readWidgetSettings } from "../settings/codec";
import type { InspectorControlValue, PropertyInspectorSettingKey, VisibilityContext } from "./schema";
import { buildInspectorBindingContext } from "./widget-setting-bindings";

export type InspectorTestSettings = Partial<Record<PropertyInspectorSettingKey, InspectorControlValue>>;

export function buildVisibilityContext(options: {
    actionKind?: ActionKind;
    isWindows?: boolean;
    settings?: InspectorTestSettings;
} = {}): VisibilityContext {
    const settings = options.settings ?? {};
    const storedSettings = normalizeWidgetStoredSettings(readWidgetSettings({
        appearanceOverrides: settings,
        metric: settings,
        local: settings,
        networkOverrides: settings,
        diskThroughputOverrides: settings,
        runtimeCache: settings,
    }));

    return buildInspectorBindingContext({
        storedSettings,
        globalSettings: { ...defaultPluginGlobalSettings },
        actionKind: options.actionKind ?? "cpu-usage",
        isWindows: options.isWindows ?? false,
    });
}
