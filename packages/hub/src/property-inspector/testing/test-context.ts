import {
    type ActionKind,
    type WidgetStoredSettings,
} from "../../settings/widget-settings";
import { buildPropertyInspectorContext } from "../inspector/context";
import type { VisibilityContext } from "../inspector/types";

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
