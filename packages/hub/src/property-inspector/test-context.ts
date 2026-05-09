import {
    sanitizeWidgetSettings,
    type ActionKind,
    type WidgetStoredSettings,
} from "../settings/widget-settings";
import type { VisibilityContext } from "./types";
import { buildInspectorBindingContext } from "./widget-setting-bindings";

export type InspectorTestSettings = WidgetStoredSettings;

export function buildVisibilityContext(options: {
    actionKind?: ActionKind;
    isWindows?: boolean;
    settings?: InspectorTestSettings;
} = {}): VisibilityContext {
    const storedSettings = sanitizeWidgetSettings(options.settings ?? {});

    return buildInspectorBindingContext({
        storedSettings,
        globalSettings: {},
        actionKind: options.actionKind ?? "cpu-usage",
        isWindows: options.isWindows ?? false,
    });
}
