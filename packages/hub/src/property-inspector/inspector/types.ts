import type {
    ActionKind,
    GlobalSettings,
    ResolvedWidgetSettings,
    WidgetStoredSettings,
} from "../../settings/widget-settings";

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
    globalSettings: GlobalSettings;
    resolved: ResolvedWidgetSettings;
}
