import type { ActionKind } from "../../shared/stream-deck-actions";
import type { ResolvedWidgetSettings } from "../../settings/resolved-settings";
import type { WidgetRuntimeCache } from "../../runtime/widget-runtime-cache";

export type SelectOptionValue = string | number;

export interface SelectOption<TValue extends SelectOptionValue = string> {
    value: TValue;
    label: string;
    disabled?: boolean;
}

export interface VisibilityContext {
    actionKind: ActionKind;
    isWindows: boolean;
    runtimeCache: WidgetRuntimeCache;
    resolved: ResolvedWidgetSettings;
}
