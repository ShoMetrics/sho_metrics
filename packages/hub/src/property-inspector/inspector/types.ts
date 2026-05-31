import type { ActionKind } from "../../shared/stream-deck-actions";
import type { ResolvedWidgetSettings } from "../../settings/resolved-settings";
import type { WidgetRuntimeCache } from "../../runtime/widget-runtime-cache";
import type { PropertyInspectorPlatform } from "./platform";

/** Primitive value accepted by Property Inspector select controls. */
export type SelectOptionValue = string | number;

/** Readiness of an external Property Inspector input, not stored/resolved settings validity. */
export type LoadStatus = "pending" | "ready" | "failed";

/** Option rendered by Property Inspector select controls. */
export interface SelectOption<TValue extends SelectOptionValue = string> {
    value: TValue;
    label: string;
    disabled?: boolean;
}

/** Resolved widget and runtime context consumed by Property Inspector panels. */
export interface VisibilityContext {
    actionKind: ActionKind;
    platform: PropertyInspectorPlatform;
    isWindows: boolean;
    runtimeCache: WidgetRuntimeCache;
    runtimeCacheStatus: PropertyInspectorRuntimeCacheStatus;
    resolved: ResolvedWidgetSettings;
}

/** Readiness for runtime-only option lists delivered to Property Inspector through Stream Deck SDK IPC. */
export interface PropertyInspectorRuntimeCacheStatus {
    diskVolumeOptionsStatus: LoadStatus;
    catalogMetricDescriptorStatus: LoadStatus;
}
