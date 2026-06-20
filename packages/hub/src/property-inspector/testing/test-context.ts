import type { ActionKind } from "../../shared/stream-deck-actions";
import {
    emptyWidgetRuntimeCache,
    mergeWidgetRuntimeCache,
    type WidgetRuntimeCachePatch,
} from "../../runtime/widget-runtime-cache";
import { buildPropertyInspectorContext } from "../inspector/context";
import type { PropertyInspectorPlatform } from "../inspector/platform";
import type { PropertyInspectorRuntimeCacheStatus, VisibilityContext } from "../inspector/types";

export type InspectorTestSettings = unknown;

export function buildVisibilityContext(options: {
    actionKind?: ActionKind;
    platform?: PropertyInspectorPlatform;
    isWindows?: boolean;
    settings?: InspectorTestSettings;
    globalSettings?: InspectorTestSettings;
    runtimeCache?: WidgetRuntimeCachePatch;
    runtimeCacheStatus?: Partial<PropertyInspectorRuntimeCacheStatus>;
} = {}): VisibilityContext {
    return buildPropertyInspectorContext({
        rawSettings: options.settings,
        rawGlobalSettings: options.globalSettings,
        runtimeCache: mergeWidgetRuntimeCache(emptyWidgetRuntimeCache, options.runtimeCache ?? {}),
        runtimeCacheStatus: {
            diskVolumeOptionsStatus: options.runtimeCacheStatus?.diskVolumeOptionsStatus ?? "pending",
            batteryDeviceOptionsStatus: options.runtimeCacheStatus?.batteryDeviceOptionsStatus ?? "pending",
            catalogMetricDescriptorStatus: options.runtimeCacheStatus?.catalogMetricDescriptorStatus ?? "pending",
        },
        actionKind: options.actionKind ?? "cpu",
        platform: options.platform ?? (options.isWindows === true ? "win32" : "darwin"),
        isWindows: options.isWindows ?? false,
    });
}
