import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    readStoredGlobalSettings,
    writeStoredGlobalSettings,
    type StoredSettingsReadWarning,
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
    widgetSettingsNotice: SettingsNotice | null;
    pluginSettingsNotice: SettingsNotice | null;
    widgetLoadError: string | null;
    pluginLoadError: string | null;
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
    widgetSettingsNotice: null,
    pluginSettingsNotice: null,
    widgetLoadError: null,
    pluginLoadError: null,
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
        () => resolveStoredGlobalSettings(readStoredGlobalSettings(state.rawGlobalSettings).settings),
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
                widgetSettingsNotice: null,
                widgetLoadError: null,
            };
        });

        void nextState;
        client.setSettings(settingsJsonToPersist ?? {}).catch((error: Error) => {
            commitState((errorState) => ({
                ...errorState,
                widgetLoadError: `Failed to save widget settings: ${error.message}`,
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
                widgetSettingsNotice: null,
                widgetLoadError: null,
            };
        });

        void nextState;
        client.setSettings(settingsJsonToPersist ?? {}).catch((error: Error) => {
            commitState((errorState) => ({
                ...errorState,
                widgetLoadError: `Failed to save widget settings: ${error.message}`,
            }));
        });
    };

    const updateGlobalSettings = (patch: StoredGlobalSettingsPatch): void => {
        let settingsJsonToPersist: StoredSettingsJsonObject | undefined;
        const nextState = commitState((currentState) => {
            const globalSettingsRead = readStoredGlobalSettings(currentState.rawGlobalSettings);
            const nextRawGlobalSettings = writeStoredGlobalSettingsPatch(
                writeStoredGlobalSettings(globalSettingsRead.settings),
                patch,
            );
            settingsJsonToPersist = nextRawGlobalSettings;

            return {
                ...currentState,
                rawGlobalSettings: nextRawGlobalSettings,
                pluginSettingsNotice: null,
                pluginLoadError: null,
            };
        });

        void nextState;
        client.setGlobalSettings(settingsJsonToPersist ?? {}).catch((error: Error) => {
            commitState((errorState) => ({
                ...errorState,
                pluginLoadError: `Failed to save plugin settings: ${error.message}`,
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

            commitState((currentState) => {
                const quickStartSettings = resolveQuickStartStoredWidgetSettings(
                    connectionInfo.actionInfo?.payload?.settings ?? currentState.rawSettings,
                    actionKind,
                );
                writeSettingsReadWarningLog(client, "widget", quickStartSettings.readWarning);

                return {
                    ...currentState,
                    actionKind,
                    isWindows,
                    rawSettings: quickStartSettings.rawSettings,
                    widgetSettingsNotice: readWarningNotice("widget", quickStartSettings.readWarning),
                    widgetLoadError: null,
                };
            });

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
                    widgetLoadError: null,
                    pluginLoadError: null,
                };

                if (settingsResult.status === "fulfilled") {
                    const quickStartSettings = resolveQuickStartStoredWidgetSettings(
                        settingsResult.value.settings,
                        currentState.actionKind,
                    );
                    writeSettingsReadWarningLog(client, "widget", quickStartSettings.readWarning);
                    nextState.rawSettings = quickStartSettings.rawSettings;
                    nextState.widgetSettingsNotice = readWarningNotice("widget", quickStartSettings.readWarning);
                } else {
                    nextState.widgetSettingsNotice = {
                        kind: "warning",
                        text: "We couldn't load this widget's saved settings, so defaults are shown.",
                    };
                }

                if (globalSettingsResult.status === "fulfilled") {
                    const globalSettingsRead = readStoredGlobalSettings(globalSettingsResult.value.settings);
                    writeSettingsReadWarningLog(client, "plugin", globalSettingsRead.warning);
                    nextState.rawGlobalSettings = writeStoredGlobalSettings(globalSettingsRead.settings);
                    nextState.pluginSettingsNotice = readWarningNotice("plugin", globalSettingsRead.warning);
                } else {
                    nextState.pluginSettingsNotice = {
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
                const quickStartSettings = resolveQuickStartStoredWidgetSettings(
                    event.payload.settings,
                    currentState.actionKind,
                );
                writeSettingsReadWarningLog(client, "widget", quickStartSettings.readWarning);

                return {
                    ...currentState,
                    rawSettings: quickStartSettings.rawSettings,
                    widgetSettingsNotice: readWarningNotice("widget", quickStartSettings.readWarning),
                };
            });
        });

        const unsubscribeGlobalSettings = client.didReceiveGlobalSettings.subscribe((event) => {
            if (isDisposed) {
                return;
            }

            commitState((currentState) => {
                const globalSettingsRead = readStoredGlobalSettings(event.payload.settings);
                writeSettingsReadWarningLog(client, "plugin", globalSettingsRead.warning);

                return {
                    ...currentState,
                    rawGlobalSettings: writeStoredGlobalSettings(globalSettingsRead.settings),
                    pluginSettingsNotice: readWarningNotice("plugin", globalSettingsRead.warning),
                };
            });
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
                widgetLoadError: `Failed to load settings: ${error.message}`,
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
        widgetSettingsNotice: state.widgetSettingsNotice,
        pluginSettingsNotice: state.pluginSettingsNotice,
        widgetLoadError: state.widgetLoadError,
        pluginLoadError: state.pluginLoadError,
        updateWidgetSettings,
        resetWidgetSettings,
        updateGlobalSettings,
    };
}

function writeSettingsReadWarningLog(
    client: StreamDeckPropertyInspectorClient,
    settingsScope: "widget" | "plugin",
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
    settingsScope: "widget" | "plugin",
    warning: StoredSettingsReadWarning | null,
): SettingsNotice | null {
    if (!warning) {
        return null;
    }

    const label = settingsScope === "widget" ? "Widget" : "Plugin";

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
