import {
    emptyWidgetRuntimeCache,
    mergeWidgetRuntimeCache,
    type WidgetRuntimeCache,
    type WidgetRuntimeCachePatch,
} from "../../runtime/widget-runtime-cache";
import type {
    StoredSettingsJsonObject,
    StoredSettingsReadWarning,
} from "../../settings/storage/codec";
import type { ActionKind } from "../inspector/settings-types";
import type { LoadStatus, PropertyInspectorRuntimeCacheStatus } from "../inspector/types";

export interface SettingsSyncState {
    readonly actionKind: ActionKind;
    readonly isWindows: boolean;
    readonly rawSettings: unknown;
    readonly widgetSettingsStatus: LoadStatus;
    readonly runtimeCache: WidgetRuntimeCache;
    readonly runtimeCacheStatus: PropertyInspectorRuntimeCacheStatus;
    readonly rawGlobalSettings: unknown;
    readonly globalSettingsStatus: LoadStatus;
    readonly widgetSettingsNotice: SettingsNotice | null;
    readonly pluginSettingsNotice: SettingsNotice | null;
}

export interface InspectorWidgetSettingsRead {
    readonly rawSettings: unknown;
    readonly notice: SettingsNotice | null;
    readonly readWarning: StoredSettingsReadWarning | null;
}

export interface InspectorPluginSettingsRead {
    readonly rawGlobalSettings: StoredSettingsJsonObject;
    readonly notice: SettingsNotice | null;
    readonly readWarning: StoredSettingsReadWarning | null;
}

export interface SettingsNotice {
    readonly kind: "loading" | "warning";
    readonly text: string;
}

export type SettingsSyncAction =
    | {
        readonly type: "connectionLoaded";
        readonly actionKind: ActionKind;
        readonly isWindows: boolean;
        readonly widgetSettingsRead: InspectorWidgetSettingsRead;
    }
    | {
        readonly type: "widgetSettingsRead";
        readonly read: InspectorWidgetSettingsRead;
    }
    | {
        readonly type: "pluginSettingsRead";
        readonly read: InspectorPluginSettingsRead;
    }
    | {
        readonly type: "runtimeCachePatch";
        readonly patch: WidgetRuntimeCachePatch;
    }
    | {
        readonly type: "widgetSettingsPatched";
        readonly rawSettings: StoredSettingsJsonObject;
    }
    | {
        readonly type: "pluginSettingsPatched";
        readonly rawGlobalSettings: StoredSettingsJsonObject;
    }
    | {
        readonly type: "widgetLoadFailed";
        readonly errorMessage?: string | undefined;
    }
    | {
        readonly type: "pluginLoadFailed";
    }
    | {
        readonly type: "widgetSaveFailed";
        readonly errorMessage: string;
    }
    | {
        readonly type: "pluginSaveFailed";
        readonly errorMessage: string;
    };

export type SettingsSyncDispatch = (action: SettingsSyncAction) => void;

export const initialSettingsSyncState: SettingsSyncState = {
    actionKind: "unknown",
    isWindows: false,
    rawSettings: undefined,
    widgetSettingsStatus: "pending",
    runtimeCache: { ...emptyWidgetRuntimeCache },
    runtimeCacheStatus: {
        diskVolumeOptionsStatus: "pending",
    },
    rawGlobalSettings: undefined,
    globalSettingsStatus: "pending",
    widgetSettingsNotice: null,
    pluginSettingsNotice: null,
};

export function settingsSyncReducer(
    state: SettingsSyncState,
    action: SettingsSyncAction,
): SettingsSyncState {
    switch (action.type) {
        case "connectionLoaded":
            return {
                ...state,
                actionKind: action.actionKind,
                isWindows: action.isWindows,
                rawSettings: action.widgetSettingsRead.rawSettings,
                widgetSettingsStatus: "ready",
                widgetSettingsNotice: action.widgetSettingsRead.notice,
            };
        case "widgetSettingsRead":
            return {
                ...state,
                rawSettings: action.read.rawSettings,
                widgetSettingsStatus: "ready",
                widgetSettingsNotice: action.read.notice,
            };
        case "pluginSettingsRead":
            return {
                ...state,
                rawGlobalSettings: action.read.rawGlobalSettings,
                globalSettingsStatus: "ready",
                pluginSettingsNotice: action.read.notice,
            };
        case "runtimeCachePatch":
            return {
                ...state,
                runtimeCache: mergeWidgetRuntimeCache(state.runtimeCache, action.patch),
                runtimeCacheStatus: updateRuntimeCacheStatus(state.runtimeCacheStatus, action.patch),
            };
        case "widgetSettingsPatched":
            return {
                ...state,
                rawSettings: action.rawSettings,
                widgetSettingsStatus: "ready",
                widgetSettingsNotice: null,
            };
        case "pluginSettingsPatched":
            return {
                ...state,
                rawGlobalSettings: action.rawGlobalSettings,
                globalSettingsStatus: "ready",
                pluginSettingsNotice: null,
            };
        case "widgetLoadFailed":
            return {
                ...state,
                widgetSettingsStatus: "failed",
                widgetSettingsNotice: action.errorMessage
                    ? settingsLoadFailureNoticeWithError(action.errorMessage)
                    : settingsLoadFailureNotice("widget"),
            };
        case "pluginLoadFailed":
            return {
                ...state,
                globalSettingsStatus: "failed",
                pluginSettingsNotice: settingsLoadFailureNotice("plugin"),
            };
        case "widgetSaveFailed":
            return {
                ...state,
                widgetSettingsNotice: {
                    kind: "warning",
                    text: `Failed to save widget settings: ${action.errorMessage}`,
                },
            };
        case "pluginSaveFailed":
            return {
                ...state,
                pluginSettingsNotice: {
                    kind: "warning",
                    text: `Failed to save plugin settings: ${action.errorMessage}`,
                },
            };
        default:
            return assertNever(action);
    }
}

function updateRuntimeCacheStatus(
    runtimeCacheStatus: PropertyInspectorRuntimeCacheStatus,
    patch: WidgetRuntimeCachePatch,
): PropertyInspectorRuntimeCacheStatus {
    return {
        diskVolumeOptionsStatus: "availableDiskVolumes" in patch
            ? "ready"
            : runtimeCacheStatus.diskVolumeOptionsStatus,
    };
}

function settingsLoadFailureNotice(settingsScope: "widget" | "plugin"): SettingsNotice {
    if (settingsScope === "widget") {
        return {
            kind: "warning",
            text: "We couldn't load this widget's saved settings, so defaults are shown.",
        };
    }

    return {
        kind: "warning",
        text: "We couldn't load plugin settings, so defaults are shown.",
    };
}

function settingsLoadFailureNoticeWithError(errorMessage: string): SettingsNotice {
    return {
        kind: "warning",
        text: `Failed to load settings: ${errorMessage}`,
    };
}

function assertNever(value: never): never {
    throw new Error(`Unhandled settings sync action: ${String(value)}`);
}
