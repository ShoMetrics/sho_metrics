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
import type { PropertyInspectorPlatform } from "../inspector/platform";
import type { LoadStatus, PropertyInspectorRuntimeCacheStatus } from "../inspector/types";
import { settingsNoticeMessages } from "../../i18n/message-groups/settings";
import type { LocalizedMessage, PlaceholderValues } from "../../i18n/types";

export interface SettingsSyncState {
    readonly actionKind: ActionKind;
    readonly platform: PropertyInspectorPlatform;
    readonly isWindows: boolean;
    readonly rawSettings: unknown;
    readonly widgetSettingsStatus: LoadStatus;
    readonly runtimeCache: WidgetRuntimeCache;
    readonly runtimeCacheStatus: PropertyInspectorRuntimeCacheStatus;
    readonly rawGlobalSettings: unknown;
    readonly globalSettingsStatus: LoadStatus;
    readonly widgetSettingsNotice: SettingsNotice | null;
    readonly globalSettingsNotice: SettingsNotice | null;
}

export interface InspectorWidgetSettingsRead {
    readonly rawSettings: unknown;
    readonly notice: SettingsNotice | null;
    readonly readWarning: StoredSettingsReadWarning | null;
}

export interface InspectorGlobalSettingsRead {
    readonly rawGlobalSettings: StoredSettingsJsonObject;
    readonly notice: SettingsNotice | null;
    readonly readWarning: StoredSettingsReadWarning | null;
}

export interface SettingsNotice {
    readonly kind: "loading" | "warning";
    readonly message: LocalizedMessage;
    readonly values?: PlaceholderValues | undefined;
}

export type SettingsSyncAction =
    | {
        readonly type: "connectionLoaded";
        readonly actionKind: ActionKind;
        readonly platform: PropertyInspectorPlatform;
        readonly isWindows: boolean;
        readonly widgetSettingsRead: InspectorWidgetSettingsRead;
    }
    | {
        readonly type: "widgetSettingsRead";
        readonly read: InspectorWidgetSettingsRead;
    }
    | {
        readonly type: "globalSettingsRead";
        readonly read: InspectorGlobalSettingsRead;
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
        readonly type: "globalSettingsPatched";
        readonly rawGlobalSettings: StoredSettingsJsonObject;
    }
    | {
        readonly type: "widgetLoadFailed";
        readonly errorMessage?: string | undefined;
    }
    | {
        readonly type: "globalLoadFailed";
    }
    | {
        readonly type: "widgetSaveFailed";
        readonly errorMessage: string;
    }
    | {
        readonly type: "globalSaveFailed";
        readonly errorMessage: string;
    };

export type SettingsSyncDispatch = (action: SettingsSyncAction) => void;

export const initialSettingsSyncState: SettingsSyncState = {
    actionKind: "unknown",
    platform: "other",
    isWindows: false,
    rawSettings: undefined,
    widgetSettingsStatus: "pending",
    runtimeCache: { ...emptyWidgetRuntimeCache },
    runtimeCacheStatus: {
        diskVolumeOptionsStatus: "pending",
        catalogMetricDescriptorStatus: "pending",
    },
    rawGlobalSettings: undefined,
    globalSettingsStatus: "pending",
    widgetSettingsNotice: null,
    globalSettingsNotice: null,
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
                platform: action.platform,
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
        case "globalSettingsRead":
            return {
                ...state,
                rawGlobalSettings: action.read.rawGlobalSettings,
                globalSettingsStatus: "ready",
                globalSettingsNotice: action.read.notice,
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
        case "globalSettingsPatched":
            return {
                ...state,
                rawGlobalSettings: action.rawGlobalSettings,
                globalSettingsStatus: "ready",
                globalSettingsNotice: null,
            };
        case "widgetLoadFailed":
            return {
                ...state,
                widgetSettingsStatus: "failed",
                widgetSettingsNotice: action.errorMessage
                    ? settingsLoadFailureNoticeWithError(action.errorMessage)
                    : settingsLoadFailureNotice("widget"),
            };
        case "globalLoadFailed":
            return {
                ...state,
                globalSettingsStatus: "failed",
                globalSettingsNotice: settingsLoadFailureNotice("global"),
            };
        case "widgetSaveFailed":
            return {
                ...state,
                widgetSettingsNotice: {
                    kind: "warning",
                    message: settingsNoticeMessages.widgetSettingsSaveFailed,
                    values: { errorMessage: action.errorMessage },
                },
            };
        case "globalSaveFailed":
            return {
                ...state,
                globalSettingsNotice: {
                    kind: "warning",
                    message: settingsNoticeMessages.globalSettingsSaveFailed,
                    values: { errorMessage: action.errorMessage },
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
        catalogMetricDescriptorStatus: patch.catalogMetricDescriptorLoadState
            ?? runtimeCacheStatus.catalogMetricDescriptorStatus,
    };
}

function settingsLoadFailureNotice(settingsScope: "widget" | "global"): SettingsNotice {
    if (settingsScope === "widget") {
        return {
            kind: "warning",
            message: settingsNoticeMessages.widgetSettingsLoadDefaults,
        };
    }

    return {
        kind: "warning",
        message: settingsNoticeMessages.globalSettingsLoadDefaults,
    };
}

function settingsLoadFailureNoticeWithError(errorMessage: string): SettingsNotice {
    return {
        kind: "warning",
        message: settingsNoticeMessages.settingsLoadFailedWithError,
        values: { errorMessage },
    };
}

function assertNever(value: never): never {
    throw new Error(`Unhandled settings sync action: ${String(value)}`);
}
