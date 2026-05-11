import type {
    ActionKind,
    GlobalSettings,
    ResolvedWidgetSettings,
    WidgetStoredSettings,
} from "../../settings/widget-settings";
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
    settings: WidgetStoredSettings;
    runtimeCache: WidgetRuntimeCache;
    globalSettings: GlobalSettings;
    resolved: ResolvedWidgetSettings;
}
