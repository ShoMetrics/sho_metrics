import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    readStoredGlobalSettings,
    type StoredSettingsJsonObject,
} from "../../settings/storage/codec";
import { resolveStoredGlobalSettings } from "../../settings/storage/resolver";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../settings/storage/widget-settings-patch";
import {
    emptyWidgetRuntimeCache,
    mergeWidgetRuntimeCache,
    WIDGET_RUNTIME_CACHE_MESSAGE_TYPE,
    type WidgetRuntimeCache,
    type WidgetRuntimeCacheMessage,
    type WidgetRuntimeCachePatch,
} from "../../runtime/widget-runtime-cache";
import { buildPropertyInspectorContext } from "../inspector/context";
import {
    readActionUuid,
    resolveIsWindowsPropertyInspector,
    type StreamDeckPropertyInspectorClient,
} from "../stream-deck/stream-deck-client";
import { resolveStreamDeckActionKind } from "../../shared/stream-deck-actions";
import type { ActionKind } from "../inspector/settings-types";
import {
    writeStoredGlobalSettingsPatch,
    type StoredGlobalSettingsPatch,
} from "../../settings/storage/global-settings-patch";

interface SettingsSyncState {
    actionKind: ActionKind;
    isWindows: boolean;
    rawSettings: unknown;
    runtimeCache: WidgetRuntimeCache;
    rawGlobalSettings: unknown;
    settingsNotice: SettingsNotice | null;
    loadError: string | null;
}

export interface SettingsNotice {
    kind: "loading" | "warning";
    text: string;
}

const initialState: SettingsSyncState = {
    actionKind: "unknown",
    isWindows: false,
    rawSettings: undefined,
    runtimeCache: { ...emptyWidgetRuntimeCache },
    rawGlobalSettings: undefined,
    settingsNotice: null,
    loadError: null,
};

export function usePropertyInspectorSettings(
    client: StreamDeckPropertyInspectorClient,
) {
    const [state, setState] = useState<SettingsSyncState>(initialState);
    const stateRef = useRef<SettingsSyncState>(initialState);
    const commitState = useCallback((
        buildNextState: (currentState: SettingsSyncState) => SettingsSyncState,
    ): SettingsSyncState => {
        const nextState = buildNextState(stateRef.current);
        stateRef.current = nextState;
        setState(nextState);

        return nextState;
    }, []);
    const resolvedGlobalSettings = useMemo(
        () => resolveStoredGlobalSettings(readStoredGlobalSettings(state.rawGlobalSettings)),
        [state.rawGlobalSettings],
    );
    const visibilityContext = useMemo(() => buildPropertyInspectorContext({
        rawSettings: state.rawSettings,
        rawGlobalSettings: state.rawGlobalSettings,
        runtimeCache: state.runtimeCache,
        actionKind: state.actionKind,
        isWindows: state.isWindows,
    }), [state.rawSettings, state.rawGlobalSettings, state.runtimeCache, state.actionKind, state.isWindows]);

    const updateWidgetSettings = (patch: StoredWidgetSettingsPatch): void => {
        let settingsJsonToPersist: StoredSettingsJsonObject | undefined;
        const nextState = commitState((currentState) => {
            const quickStartSettings = resolveQuickStartStoredWidgetSettings(
                currentState.rawSettings,
                currentState.actionKind,
            );
            const nextRawSettings = writeStoredWidgetSettingsPatch(quickStartSettings.rawSettings, patch);
            settingsJsonToPersist = nextRawSettings;

            return {
                ...currentState,
                rawSettings: nextRawSettings,
                loadError: null,
            };
        });

        void nextState;
        client.setSettings(settingsJsonToPersist ?? {}).catch((error: Error) => {
            commitState((errorState) => ({
                ...errorState,
                loadError: `Failed to save settings: ${error.message}`,
            }));
        });
    };

    const resetWidgetSettings = (): void => {
        let settingsJsonToPersist: StoredSettingsJsonObject | undefined;
        const nextState = commitState((currentState) => {
            const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, currentState.actionKind);
            const nextRawSettings = quickStartSettings.settingsJsonToPersist ?? {};
            settingsJsonToPersist = nextRawSettings;

            return {
                ...currentState,
                rawSettings: nextRawSettings,
                loadError: null,
            };
        });

        void nextState;
        client.setSettings(settingsJsonToPersist ?? {}).catch((error: Error) => {
            commitState((errorState) => ({
                ...errorState,
                loadError: `Failed to save settings: ${error.message}`,
            }));
        });
    };

    const updateGlobalSettings = (patch: StoredGlobalSettingsPatch): void => {
        let settingsJsonToPersist: StoredSettingsJsonObject | undefined;
        const nextState = commitState((currentState) => {
            const nextRawGlobalSettings = writeStoredGlobalSettingsPatch(currentState.rawGlobalSettings, patch);
            settingsJsonToPersist = nextRawGlobalSettings;

            return {
                ...currentState,
                rawGlobalSettings: nextRawGlobalSettings,
                loadError: null,
            };
        });

        void nextState;
        client.setGlobalSettings(settingsJsonToPersist ?? {}).catch((error: Error) => {
            commitState((errorState) => ({
                ...errorState,
                loadError: `Failed to save global settings: ${error.message}`,
            }));
        });
    };

    useEffect(() => {
        let isDisposed = false;

        async function loadSettings(): Promise<void> {
            const connectionInfo = await client.getConnectionInfo();
            const actionKind = resolveStreamDeckActionKind(readActionUuid(connectionInfo));
            const isWindows = resolveIsWindowsPropertyInspector(connectionInfo);
            if (isDisposed) {
                return;
            }

            commitState((currentState) => ({
                ...currentState,
                actionKind,
                isWindows,
                rawSettings: resolveQuickStartStoredWidgetSettings(
                    connectionInfo.actionInfo?.payload?.settings ?? currentState.rawSettings,
                    actionKind,
                ).rawSettings,
                settingsNotice: null,
                loadError: null,
            }));

            const [settingsResult, globalSettingsResult] = await Promise.allSettled([
                client.getSettings(),
                client.getGlobalSettings(),
            ]);

            if (isDisposed) {
                return;
            }

            commitState((currentState) => {
                const nextState: SettingsSyncState = {
                    ...currentState,
                    loadError: null,
                };

                if (settingsResult.status === "fulfilled") {
                    nextState.rawSettings = resolveQuickStartStoredWidgetSettings(
                        settingsResult.value.settings,
                        currentState.actionKind,
                    ).rawSettings;
                    nextState.settingsNotice = null;
                } else {
                    nextState.settingsNotice = {
                        kind: "warning",
                        text: "We couldn't load this widget's saved settings, so defaults are shown.",
                    };
                }

                if (globalSettingsResult.status === "fulfilled") {
                    nextState.rawGlobalSettings = globalSettingsResult.value.settings;
                } else {
                    nextState.settingsNotice = {
                        kind: "warning",
                        text: "We couldn't load plugin settings, so defaults are shown.",
                    };
                }

                return nextState;
            });
        }

        const unsubscribeSettings = client.didReceiveSettings.subscribe((event) => {
            if (isDisposed) {
                return;
            }

            commitState((currentState) => {
                return {
                    ...currentState,
                    rawSettings: resolveQuickStartStoredWidgetSettings(
                        event.payload.settings,
                        currentState.actionKind,
                    ).rawSettings,
                    settingsNotice: null,
                };
            });
        });

        const unsubscribeGlobalSettings = client.didReceiveGlobalSettings.subscribe((event) => {
            if (isDisposed) {
                return;
            }

            commitState((currentState) => ({
                ...currentState,
                rawGlobalSettings: event.payload.settings,
            }));
        });
        const unsubscribeRuntimeCache = client.sendToPropertyInspector.subscribe((event) => {
            if (isDisposed) {
                return;
            }

            const runtimeCachePatch = readWidgetRuntimeCachePatch(event.payload);
            if (!runtimeCachePatch) {
                return;
            }

            commitState((currentState) => ({
                ...currentState,
                runtimeCache: mergeWidgetRuntimeCache(currentState.runtimeCache, runtimeCachePatch),
            }));
        });

        loadSettings().catch((error: Error) => {
            if (isDisposed) {
                return;
            }

            commitState((currentState) => ({
                ...currentState,
                loadError: `Failed to load settings: ${error.message}`,
            }));
        });

        return () => {
            isDisposed = true;
            unsubscribeSettings();
            unsubscribeGlobalSettings();
            unsubscribeRuntimeCache();
        };
    }, [client, commitState]);

    return {
        actionKind: state.actionKind,
        visibilityContext,
        resolvedGlobalSettings,
        settingsNotice: state.settingsNotice,
        loadError: state.loadError,
        updateWidgetSettings,
        resetWidgetSettings,
        updateGlobalSettings,
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
