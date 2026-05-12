import type { ActionKind } from "../../shared/stream-deck-actions";
import {
    emptyWidgetRuntimeCache,
    mergeWidgetRuntimeCache,
    type WidgetRuntimeCachePatch,
} from "../../runtime/widget-runtime-cache";
import { buildPropertyInspectorContext } from "../inspector/context";
import type { VisibilityContext } from "../inspector/types";

export type InspectorTestSettings = unknown;

export function buildVisibilityContext(options: {
    actionKind?: ActionKind;
    isWindows?: boolean;
    settings?: InspectorTestSettings;
    runtimeCache?: WidgetRuntimeCachePatch;
} = {}): VisibilityContext {
    return buildPropertyInspectorContext({
        rawSettings: options.settings,
        rawGlobalSettings: undefined,
        runtimeCache: mergeWidgetRuntimeCache(emptyWidgetRuntimeCache, options.runtimeCache ?? {}),
        actionKind: options.actionKind ?? "cpu-usage",
        isWindows: options.isWindows ?? false,
    });
}
