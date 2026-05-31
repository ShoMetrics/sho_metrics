import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
    readStoredGlobalSettings,
    writeStoredGlobalSettings,
    type StoredSettingsReadWarning,
} from "../../settings/storage/codec";
import { resolveStoredGlobalSettings } from "../../settings/storage/resolver";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../settings/storage/widget-settings-patch";
import {
    WIDGET_RUNTIME_CACHE_MESSAGE_TYPE,
    type WidgetRuntimeCacheMessage,
    type WidgetRuntimeCachePatch,
} from "../../runtime/widget-runtime-cache";
import { buildPropertyInspectorContext } from "../inspector/context";
import {
    readPropertyInspectorPlatformValue,
    readActionUuid,
    type StreamDeckPropertyInspectorClient,
} from "../stream-deck/stream-deck-client";
import { normalizePropertyInspectorHostPlatform } from "../inspector/platform";
import { resolveStreamDeckActionKind } from "../../shared/stream-deck-actions";
import type { ActionKind } from "../inspector/settings-types";
import {
    writeStoredGlobalSettingsPatch,
    type StoredGlobalSettingsPatch,
} from "../../settings/storage/global-settings-patch";
import {
    clearStoredColorCompensationProfile,
    readStoredColorCompensationProfile,
    writeStoredColorCompensationProfile,
} from "../../settings/storage/color-compensation-settings";
import type { ColorCompensationProfile } from "../../color-compensation/types";
import {
    initialSettingsSyncState,
    settingsSyncReducer,
    type InspectorGlobalSettingsRead,
    type InspectorWidgetSettingsRead,
    type SettingsNotice,
    type SettingsSyncDispatch,
} from "./settings-sync-state";

type SettingsScope = "widget" | "global";

interface SettingsInputSnapshot {
    readonly actionKind: ActionKind;
    readonly rawSettings: unknown;
    readonly rawGlobalSettings: unknown;
}

interface SettingsInputSnapshotRef {
    current: SettingsInputSnapshot;
}

export type { SettingsNotice } from "./settings-sync-state";

export function usePropertyInspectorSettings(
    client: StreamDeckPropertyInspectorClient,
) {
    const [state, dispatchSettingsAction] = useReducer(settingsSyncReducer, initialSettingsSyncState);
    const settingsInputSnapshotRef = useRef<SettingsInputSnapshot>({
        actionKind: initialSettingsSyncState.actionKind,
        rawSettings: initialSettingsSyncState.rawSettings,
        rawGlobalSettings: initialSettingsSyncState.rawGlobalSettings,
    });

    // Stream Deck callbacks can arrive between React renders. Keep only the raw
    // inputs needed to decode later events; reducer state owns the rendered UI.
    settingsInputSnapshotRef.current = {
        actionKind: state.actionKind,
        rawSettings: state.rawSettings,
        rawGlobalSettings: state.rawGlobalSettings,
    };

    const resolvedGlobalSettings = useMemo(
        () => resolveStoredGlobalSettings(readStoredGlobalSettings(state.rawGlobalSettings).settings),
        [state.rawGlobalSettings],
    );
    const colorCompensationProfile = useMemo(
        () => readStoredColorCompensationProfile(readStoredGlobalSettings(state.rawGlobalSettings).settings),
        [state.rawGlobalSettings],
    );
    const visibilityContext = useMemo(() => buildPropertyInspectorContext({
        rawSettings: state.rawSettings,
        rawGlobalSettings: state.rawGlobalSettings,
        runtimeCache: state.runtimeCache,
        runtimeCacheStatus: state.runtimeCacheStatus,
        actionKind: state.actionKind,
        platform: state.platform,
        isWindows: state.isWindows,
    }), [
        state.rawSettings,
        state.rawGlobalSettings,
        state.runtimeCache,
        state.runtimeCacheStatus,
        state.actionKind,
        state.platform,
        state.isWindows,
    ]);

    const updateWidgetSettings = useCallback((patch: StoredWidgetSettingsPatch): void => {
        const currentSnapshot = settingsInputSnapshotRef.current;
        const quickStartSettings = resolveQuickStartStoredWidgetSettings(
            currentSnapshot.rawSettings,
            currentSnapshot.actionKind,
        );
        const nextRawSettings = writeStoredWidgetSettingsPatch(quickStartSettings.rawSettings, patch);
        updateSettingsInputSnapshot(settingsInputSnapshotRef, { rawSettings: nextRawSettings });
        dispatchSettingsAction({ type: "widgetSettingsPatched", rawSettings: nextRawSettings });

        client.setSettings(nextRawSettings).catch((error: Error) => {
            dispatchSettingsAction({
                type: "widgetSaveFailed",
                errorMessage: error.message,
            });
        });
    }, [client]);

    const resetWidgetSettings = useCallback((): void => {
        const currentSnapshot = settingsInputSnapshotRef.current;
        const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, currentSnapshot.actionKind);
        const nextRawSettings = quickStartSettings.settingsJsonToPersist ?? {};
        updateSettingsInputSnapshot(settingsInputSnapshotRef, { rawSettings: nextRawSettings });
        dispatchSettingsAction({ type: "widgetSettingsPatched", rawSettings: nextRawSettings });

        client.setSettings(nextRawSettings).catch((error: Error) => {
            dispatchSettingsAction({
                type: "widgetSaveFailed",
                errorMessage: error.message,
            });
        });
    }, [client]);

    const updateGlobalSettings = useCallback((patch: StoredGlobalSettingsPatch): void => {
        const currentSnapshot = settingsInputSnapshotRef.current;
        const globalSettingsRead = readStoredGlobalSettings(currentSnapshot.rawGlobalSettings);
        const nextRawGlobalSettings = writeStoredGlobalSettingsPatch(
            writeStoredGlobalSettings(globalSettingsRead.settings),
            patch,
        );
        updateSettingsInputSnapshot(settingsInputSnapshotRef, { rawGlobalSettings: nextRawGlobalSettings });
        dispatchSettingsAction({ type: "globalSettingsPatched", rawGlobalSettings: nextRawGlobalSettings });

        client.setGlobalSettings(nextRawGlobalSettings).catch((error: Error) => {
            dispatchSettingsAction({
                type: "globalSaveFailed",
                errorMessage: error.message,
            });
        });
    }, [client]);
    const saveColorCompensationProfile = useCallback(async (profile: ColorCompensationProfile): Promise<void> => {
        const currentSnapshot = settingsInputSnapshotRef.current;
        const nextRawGlobalSettings = writeStoredColorCompensationProfile(
            currentSnapshot.rawGlobalSettings,
            profile,
        );
        updateSettingsInputSnapshot(settingsInputSnapshotRef, { rawGlobalSettings: nextRawGlobalSettings });
        dispatchSettingsAction({ type: "globalSettingsPatched", rawGlobalSettings: nextRawGlobalSettings });

        try {
            await client.setGlobalSettings(nextRawGlobalSettings);
        } catch (error) {
            dispatchSettingsAction({
                type: "globalSaveFailed",
                errorMessage: readErrorMessage(error),
            });
            throw error;
        }
    }, [client]);
    const resetColorCompensationProfile = useCallback(async (): Promise<void> => {
        const currentSnapshot = settingsInputSnapshotRef.current;
        const nextRawGlobalSettings = clearStoredColorCompensationProfile(currentSnapshot.rawGlobalSettings);
        updateSettingsInputSnapshot(settingsInputSnapshotRef, { rawGlobalSettings: nextRawGlobalSettings });
        dispatchSettingsAction({ type: "globalSettingsPatched", rawGlobalSettings: nextRawGlobalSettings });

        try {
            await client.setGlobalSettings(nextRawGlobalSettings);
        } catch (error) {
            dispatchSettingsAction({
                type: "globalSaveFailed",
                errorMessage: readErrorMessage(error),
            });
            throw error;
        }
    }, [client]);

    useEffect(() => {
        let hasDisposed = false;
        const isDisposed = (): boolean => hasDisposed;
        const unsubscribePropertyInspectorEvents = subscribePropertyInspectorEvents(
            client,
            dispatchSettingsAction,
            settingsInputSnapshotRef,
            isDisposed,
        );

        loadPropertyInspectorSettings(
            client,
            dispatchSettingsAction,
            settingsInputSnapshotRef,
            isDisposed,
        ).catch((error: Error) => {
            if (isDisposed()) {
                return;
            }

            dispatchSettingsAction({
                type: "widgetLoadFailed",
                errorMessage: error.message,
            });
        });

        return () => {
            hasDisposed = true;
            unsubscribePropertyInspectorEvents();
        };
    }, [client]);

    return {
        actionKind: state.actionKind,
        visibilityContext,
        resolvedGlobalSettings,
        widgetSettingsStatus: state.widgetSettingsStatus,
        globalSettingsStatus: state.globalSettingsStatus,
        widgetSettingsNotice: state.widgetSettingsNotice,
        globalSettingsNotice: state.globalSettingsNotice,
        colorCompensation: {
            profile: colorCompensationProfile,
            saveProfile: saveColorCompensationProfile,
            resetProfile: resetColorCompensationProfile,
        },
        updateWidgetSettings,
        resetWidgetSettings,
        updateGlobalSettings,
    };
}

async function loadPropertyInspectorSettings(
    client: StreamDeckPropertyInspectorClient,
    dispatchSettingsAction: SettingsSyncDispatch,
    settingsInputSnapshotRef: SettingsInputSnapshotRef,
    isDisposed: () => boolean,
): Promise<void> {
    const connectionInfo = await client.getConnectionInfo();
    const actionKind = resolveStreamDeckActionKind(readActionUuid(connectionInfo));
    const platform = normalizePropertyInspectorHostPlatform(readPropertyInspectorPlatformValue(connectionInfo));
    const isWindows = platform === "win32";
    if (isDisposed()) {
        return;
    }

    const widgetSettingsRead = readInspectorWidgetSettings(
        connectionInfo.actionInfo?.payload?.settings ?? settingsInputSnapshotRef.current.rawSettings,
        actionKind,
    );
    writeSettingsReadWarningLog(client, "widget", widgetSettingsRead.readWarning);
    updateSettingsInputSnapshot(settingsInputSnapshotRef, {
        actionKind,
        rawSettings: widgetSettingsRead.rawSettings,
    });
    dispatchSettingsAction({
        type: "connectionLoaded",
        actionKind,
        platform,
        isWindows,
        widgetSettingsRead,
    });

    void refreshWidgetSettings(client, dispatchSettingsAction, settingsInputSnapshotRef, actionKind, isDisposed);
    void refreshGlobalSettings(client, dispatchSettingsAction, settingsInputSnapshotRef, isDisposed);
}

async function refreshWidgetSettings(
    client: StreamDeckPropertyInspectorClient,
    dispatchSettingsAction: SettingsSyncDispatch,
    settingsInputSnapshotRef: SettingsInputSnapshotRef,
    actionKind: ActionKind,
    isDisposed: () => boolean,
): Promise<void> {
    try {
        const payload = await client.getSettings();
        if (isDisposed()) {
            return;
        }

        const widgetSettingsRead = readInspectorWidgetSettings(payload.settings, actionKind);
        writeSettingsReadWarningLog(client, "widget", widgetSettingsRead.readWarning);
        updateSettingsInputSnapshot(settingsInputSnapshotRef, { rawSettings: widgetSettingsRead.rawSettings });
        dispatchSettingsAction({
            type: "widgetSettingsRead",
            read: widgetSettingsRead,
        });
    } catch {
        if (isDisposed()) {
            return;
        }

        dispatchSettingsAction({ type: "widgetLoadFailed" });
    }
}

async function refreshGlobalSettings(
    client: StreamDeckPropertyInspectorClient,
    dispatchSettingsAction: SettingsSyncDispatch,
    settingsInputSnapshotRef: SettingsInputSnapshotRef,
    isDisposed: () => boolean,
): Promise<void> {
    try {
        const payload = await client.getGlobalSettings();
        if (isDisposed()) {
            return;
        }

        const globalSettingsRead = readInspectorGlobalSettings(payload.settings);
        writeSettingsReadWarningLog(client, "global", globalSettingsRead.readWarning);
        updateSettingsInputSnapshot(settingsInputSnapshotRef, {
            rawGlobalSettings: globalSettingsRead.rawGlobalSettings,
        });
        dispatchSettingsAction({
            type: "globalSettingsRead",
            read: globalSettingsRead,
        });
    } catch {
        if (isDisposed()) {
            return;
        }

        dispatchSettingsAction({ type: "globalLoadFailed" });
    }
}

function subscribePropertyInspectorEvents(
    client: StreamDeckPropertyInspectorClient,
    dispatchSettingsAction: SettingsSyncDispatch,
    settingsInputSnapshotRef: SettingsInputSnapshotRef,
    isDisposed: () => boolean,
): () => void {
    const unsubscribeSettings = client.didReceiveSettings.subscribe((event) => {
        if (isDisposed()) {
            return;
        }

        const widgetSettingsRead = readInspectorWidgetSettings(
            event.payload.settings,
            settingsInputSnapshotRef.current.actionKind,
        );
        writeSettingsReadWarningLog(client, "widget", widgetSettingsRead.readWarning);
        updateSettingsInputSnapshot(settingsInputSnapshotRef, { rawSettings: widgetSettingsRead.rawSettings });
        dispatchSettingsAction({
            type: "widgetSettingsRead",
            read: widgetSettingsRead,
        });
    });

    const unsubscribeGlobalSettings = client.didReceiveGlobalSettings.subscribe((event) => {
        if (isDisposed()) {
            return;
        }

        const globalSettingsRead = readInspectorGlobalSettings(event.payload.settings);
        writeSettingsReadWarningLog(client, "global", globalSettingsRead.readWarning);
        updateSettingsInputSnapshot(settingsInputSnapshotRef, {
            rawGlobalSettings: globalSettingsRead.rawGlobalSettings,
        });
        dispatchSettingsAction({
            type: "globalSettingsRead",
            read: globalSettingsRead,
        });
    });

    const unsubscribeRuntimeCache = client.sendToPropertyInspector.subscribe((event) => {
        if (isDisposed()) {
            return;
        }

        const runtimeCachePatch = readWidgetRuntimeCachePatch(event.payload);
        if (!runtimeCachePatch) {
            return;
        }

        dispatchSettingsAction({
            type: "runtimeCachePatch",
            patch: runtimeCachePatch,
        });
    });

    return () => {
        unsubscribeSettings();
        unsubscribeGlobalSettings();
        unsubscribeRuntimeCache();
    };
}

function readInspectorWidgetSettings(
    rawSettings: unknown,
    actionKind: ActionKind,
): InspectorWidgetSettingsRead {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(rawSettings, actionKind);

    return {
        rawSettings: quickStartSettings.rawSettings,
        notice: readWarningNotice("widget", quickStartSettings.readWarning),
        readWarning: quickStartSettings.readWarning,
    };
}

function readInspectorGlobalSettings(rawGlobalSettings: unknown): InspectorGlobalSettingsRead {
    const globalSettingsRead = readStoredGlobalSettings(rawGlobalSettings);

    return {
        rawGlobalSettings: writeStoredGlobalSettings(globalSettingsRead.settings),
        notice: readWarningNotice("global", globalSettingsRead.warning),
        readWarning: globalSettingsRead.warning,
    };
}

function updateSettingsInputSnapshot(
    settingsInputSnapshotRef: SettingsInputSnapshotRef,
    patch: Partial<SettingsInputSnapshot>,
): void {
    // Call this immediately before dispatching an action that changes these
    // inputs. Reducer state commits asynchronously, but SDK callbacks can fire
    // before the next React render and still need the latest values for patches.
    settingsInputSnapshotRef.current = {
        ...settingsInputSnapshotRef.current,
        ...patch,
    };
}

function writeSettingsReadWarningLog(
    client: StreamDeckPropertyInspectorClient,
    settingsScope: SettingsScope,
    warning: StoredSettingsReadWarning | null,
): void {
    if (!warning) {
        return;
    }

    client.send("logMessage", {
        message: `[warn] Property Inspector ${settingsScope} settings read warning: ${warning.message}`,
    }).catch(() => {
        return;
    });
}

function readWarningNotice(
    settingsScope: SettingsScope,
    warning: StoredSettingsReadWarning | null,
): SettingsNotice | null {
    if (!warning) {
        return null;
    }

    const label = settingsScope === "widget" ? "Widget" : "Global";

    if (warning.reason === "unknownFieldsDiscarded") {
        return {
            kind: "warning",
            text:
                `${label} settings contain fields this version does not understand. ` +
                `They will be removed the next time ${settingsScope} settings are saved.`,
        };
    }

    return {
        kind: "warning",
        text:
            `${label} settings could not be read. Defaults are shown; ` +
            `saving ${settingsScope} settings will replace the unreadable settings.`,
    };
}

function readWidgetRuntimeCachePatch(payload: unknown): WidgetRuntimeCachePatch | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
    }

    const message = payload as Partial<WidgetRuntimeCacheMessage>;
    if (message.type !== WIDGET_RUNTIME_CACHE_MESSAGE_TYPE || !message.patch) {
        return null;
    }

    return message.patch;
}

function readErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
