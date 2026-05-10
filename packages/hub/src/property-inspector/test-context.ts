import {
    type ActionKind,
    type WidgetStoredSettings,
} from "../settings/widget-settings";
import type { VisibilityContext } from "./inspector/types";
import { buildPropertyInspectorContext } from "./inspector/context";

export type InspectorTestSettings = WidgetStoredSettings;

export function buildVisibilityContext(options: {
    actionKind?: ActionKind;
    isWindows?: boolean;
    settings?: InspectorTestSettings;
} = {}): VisibilityContext {
    const storedSettings = options.settings ?? {};

    return buildPropertyInspectorContext({
        storedSettings,
        globalSettings: {},
        actionKind: options.actionKind ?? "cpu-usage",
        isWindows: options.isWindows ?? false,
    });
}
