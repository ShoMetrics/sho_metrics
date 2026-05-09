import type {
    ActionKind,
    AppearanceColorRampKey,
    AppearanceScalarSettings,
    ColorRamp,
    DiskThroughputDefaultSettings,
    GlobalSettings,
    MetricSettings,
    NetworkDefaultSettings,
    ResolvedWidgetSettings,
    WidgetLocalSettings,
    WidgetStoredSettings,
} from "../settings/widget-settings";

export type InspectorControlValue = string | number | boolean | null | undefined;
export type PropertyInspectorSettingKey =
    | Extract<keyof AppearanceScalarSettings, string>
    | Extract<keyof MetricSettings, string>
    | Extract<keyof WidgetLocalSettings, string>
    | Extract<keyof NetworkDefaultSettings, string>
    | Extract<keyof DiskThroughputDefaultSettings, string>
    | "availableNetworkInterfaces"
    | "availableDiskVolumes";

export interface AppearanceColorTarget {
    rampKey: AppearanceColorRampKey;
    colorKey: keyof ColorRamp;
}

export type InspectorSettingTarget = PropertyInspectorSettingKey | AppearanceColorTarget;

export interface SelectOption<TValue extends string = string> {
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
