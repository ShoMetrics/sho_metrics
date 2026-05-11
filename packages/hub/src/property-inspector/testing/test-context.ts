import {
    type ActionKind,
    type WidgetStoredSettings,
} from "../../settings/widget-settings";
import {
    emptyWidgetRuntimeCache,
    mergeWidgetRuntimeCache,
    type WidgetRuntimeCachePatch,
} from "../../runtime/widget-runtime-cache";
import { buildPropertyInspectorContext } from "../inspector/context";
import type { VisibilityContext } from "../inspector/types";

export type InspectorTestSettings = WidgetStoredSettings;

export function buildVisibilityContext(options: {
    actionKind?: ActionKind;
    isWindows?: boolean;
    settings?: InspectorTestSettings;
    runtimeCache?: WidgetRuntimeCachePatch;
} = {}): VisibilityContext {
    const storedSettings = options.settings ?? {};

    return buildPropertyInspectorContext({
        storedSettings,
        globalSettings: {},
        runtimeCache: mergeWidgetRuntimeCache(emptyWidgetRuntimeCache, options.runtimeCache ?? {}),
        actionKind: options.actionKind ?? "cpu-usage",
        isWindows: options.isWindows ?? false,
    });
}
