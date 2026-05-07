import type { ActionKind, PropertyInspectorSettings, SettingValue } from "./settings";
import type { InspectorScope } from "./scopes";

export type PropertyInspectorSettingKey = Extract<keyof PropertyInspectorSettings, string>;
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
    settings: PropertyInspectorSettings;
}

export interface FieldSchema {
    id: string;
    kind: FieldKind;
    allowedScopes: readonly InspectorScope[];
    key?: PropertyInspectorSettingKey;
    label?: string;
    text?: string;
    noteVariant?: FieldNoteVariant;
    defaultValue?: SettingValue;
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
        equals: SettingValue;
    };
}
