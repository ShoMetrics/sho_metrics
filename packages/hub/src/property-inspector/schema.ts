import type {
    ActionKind,
    AppearanceColorRampKey,
    AppearanceScalarSettings,
    ColorRamp,
    DiskThroughputDefaultSettings,
    MetricSettings,
    NetworkDefaultSettings,
    PluginGlobalSettings,
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

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface VisibilityContext {
    actionKind: ActionKind;
    isWindows: boolean;
    settings: WidgetStoredSettings;
    globalSettings: PluginGlobalSettings;
    resolved: ResolvedWidgetSettings;
}

export function resolveSettingTargetName(target: InspectorSettingTarget): string {
    if (typeof target === "string") {
        return target;
    }

    return `${target.rampKey}.${String(target.colorKey)}`;
}
