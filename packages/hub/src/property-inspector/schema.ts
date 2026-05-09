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
import type { InspectorScope } from "./scopes";

export type InspectorControlValue = string | number | boolean | null | undefined;
export type PropertyInspectorSettingKey =
    | Extract<keyof AppearanceScalarSettings, string>
    | Extract<keyof MetricSettings, string>
    | Extract<keyof WidgetLocalSettings, string>
    | Extract<keyof NetworkDefaultSettings, string>
    | Extract<keyof DiskThroughputDefaultSettings, string>
    | "availableNetworkInterfaces"
    | "availableDiskVolumes";
export interface AppearanceColorBinding {
    kind: "appearanceColor";
    rampKey: AppearanceColorRampKey;
    colorKey: keyof ColorRamp;
}
export type InspectorSettingTarget = PropertyInspectorSettingKey | AppearanceColorBinding;
export type FieldKind =
    | "select"
    | "graphic-type-picker"
    | "circle-style-picker"
    | "color"
    | "number"
    | "range"
    | "text"
    | "readonly"
    | "note"
    | "heading"
    | "color-band";
export type OptionProviderId = "networkInterfaces" | "diskVolumes";
export type FieldValueSource = "selectedDiskVolumeLabel";
export type FieldPlaceholderSource = "diskAutoLinearLabel";
export type FieldNoteVariant = "default" | "caption";

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
    hidden?: boolean;
    hiddenOnWindows?: boolean;
}

export type SelectOptionsSource =
    | { kind: "static"; values: readonly SelectOption[] }
    | { kind: "provider"; providerId: OptionProviderId };

export interface VisibilityContext {
    actionKind: ActionKind;
    isWindows: boolean;
    settings: WidgetStoredSettings;
    globalSettings: PluginGlobalSettings;
    resolved: ResolvedWidgetSettings;
}

export interface FieldSchema {
    id: string;
    kind: FieldKind;
    allowedScopes: readonly InspectorScope[];
    key?: PropertyInspectorSettingKey;
    label?: string;
    text?: string;
    noteVariant?: FieldNoteVariant;
    defaultValue?: InspectorControlValue;
    colorBinding?: AppearanceColorBinding;
    minimum?: number;
    step?: number;
    maximum?: number;
    options?: SelectOptionsSource;
    excludeWindows?: boolean;
    valueSource?: FieldValueSource;
    placeholder?: string;
    placeholderSource?: FieldPlaceholderSource;
    disabled?: boolean;
    disabledWhen?: {
        key: PropertyInspectorSettingKey;
        equals: InspectorControlValue;
    };
}
