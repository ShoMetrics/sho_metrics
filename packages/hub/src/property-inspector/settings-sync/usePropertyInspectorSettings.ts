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

type CommitSettingsSyncState = (
    buildNextState: (currentState: SettingsSyncState) => SettingsSyncState,
) => SettingsSyncState;

type SettingsScope = "widget" | "plugin";

interface InspectorWidgetSettingsRead {
    readonly rawSettings: unknown;
    readonly notice: SettingsNotice | null;
    readonly readWarning: StoredSettingsReadWarning | null;
}

interface InspectorPluginSettingsRead {
    readonly rawGlobalSettings: StoredSettingsJsonObject;
    readonly notice: SettingsNotice | null;
    readonly readWarning: StoredSettingsReadWarning | null;
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
    const commitState = useCallback<CommitSettingsSyncState>((buildNextState) => {
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
        let hasDisposed = false;
        const isDisposed = (): boolean => hasDisposed;
        const unsubscribePropertyInspectorEvents = subscribePropertyInspectorEvents(
            client,
            commitState,
            isDisposed,
        );

        loadPropertyInspectorSettings(client, commitState, isDisposed).catch((error: Error) => {
            if (isDisposed()) {
                return;
            }

            commitState((currentState) => ({
                ...currentState,
                widgetLoadError: `Failed to load settings: ${error.message}`,
            }));
        });

        return () => {
            hasDisposed = true;
            unsubscribePropertyInspectorEvents();
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

async function loadPropertyInspectorSettings(
    client: StreamDeckPropertyInspectorClient,
    commitState: CommitSettingsSyncState,
    isDisposed: () => boolean,
): Promise<void> {
    const connectionInfo = await client.getConnectionInfo();
    const actionKind = resolveStreamDeckActionKind(readActionUuid(connectionInfo));
    const isWindows = resolveIsWindowsPropertyInspector(connectionInfo);
    if (isDisposed()) {
        return;
    }

    commitState((currentState) => {
        const widgetSettingsRead = readInspectorWidgetSettings(
            connectionInfo.actionInfo?.payload?.settings ?? currentState.rawSettings,
            actionKind,
        );
        writeSettingsReadWarningLog(client, "widget", widgetSettingsRead.readWarning);

        return {
            ...currentState,
            actionKind,
            isWindows,
            rawSettings: widgetSettingsRead.rawSettings,
            widgetSettingsNotice: widgetSettingsRead.notice,
            widgetLoadError: null,
        };
    });

    const [settingsResult, globalSettingsResult] = await Promise.allSettled([
        client.getSettings(),
        client.getGlobalSettings(),
    ]);

    if (isDisposed()) {
        return;
    }

    applyLoadedSettingsResults(client, commitState, actionKind, settingsResult, globalSettingsResult);
}

function applyLoadedSettingsResults(
    client: StreamDeckPropertyInspectorClient,
    commitState: CommitSettingsSyncState,
    actionKind: ActionKind,
    settingsResult: PromiseSettledResult<{ settings: unknown }>,
    globalSettingsResult: PromiseSettledResult<{ settings: unknown }>,
): void {
    commitState((currentState) => {
        const nextState: SettingsSyncState = {
            ...currentState,
            widgetLoadError: null,
            pluginLoadError: null,
        };

        if (settingsResult.status === "fulfilled") {
            const widgetSettingsRead = readInspectorWidgetSettings(settingsResult.value.settings, actionKind);
            writeSettingsReadWarningLog(client, "widget", widgetSettingsRead.readWarning);
            nextState.rawSettings = widgetSettingsRead.rawSettings;
            nextState.widgetSettingsNotice = widgetSettingsRead.notice;
        } else {
            nextState.widgetSettingsNotice = settingsLoadFailureNotice("widget");
        }

        if (globalSettingsResult.status === "fulfilled") {
            const pluginSettingsRead = readInspectorPluginSettings(globalSettingsResult.value.settings);
            writeSettingsReadWarningLog(client, "plugin", pluginSettingsRead.readWarning);
            nextState.rawGlobalSettings = pluginSettingsRead.rawGlobalSettings;
            nextState.pluginSettingsNotice = pluginSettingsRead.notice;
        } else {
            nextState.pluginSettingsNotice = settingsLoadFailureNotice("plugin");
        }

        return nextState;
    });
}

function subscribePropertyInspectorEvents(
    client: StreamDeckPropertyInspectorClient,
    commitState: CommitSettingsSyncState,
    isDisposed: () => boolean,
): () => void {
    const unsubscribeSettings = client.didReceiveSettings.subscribe((event) => {
        if (isDisposed()) {
            return;
        }

        commitState((currentState) => {
            const widgetSettingsRead = readInspectorWidgetSettings(
                event.payload.settings,
                currentState.actionKind,
            );
            writeSettingsReadWarningLog(client, "widget", widgetSettingsRead.readWarning);

            return {
                ...currentState,
                rawSettings: widgetSettingsRead.rawSettings,
                widgetSettingsNotice: widgetSettingsRead.notice,
            };
        });
    });

    const unsubscribeGlobalSettings = client.didReceiveGlobalSettings.subscribe((event) => {
        if (isDisposed()) {
            return;
        }

        commitState((currentState) => {
            const pluginSettingsRead = readInspectorPluginSettings(event.payload.settings);
            writeSettingsReadWarningLog(client, "plugin", pluginSettingsRead.readWarning);

            return {
                ...currentState,
                rawGlobalSettings: pluginSettingsRead.rawGlobalSettings,
                pluginSettingsNotice: pluginSettingsRead.notice,
            };
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

        commitState((currentState) => ({
            ...currentState,
            runtimeCache: mergeWidgetRuntimeCache(currentState.runtimeCache, runtimeCachePatch),
        }));
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

function readInspectorPluginSettings(rawGlobalSettings: unknown): InspectorPluginSettingsRead {
    const globalSettingsRead = readStoredGlobalSettings(rawGlobalSettings);

    return {
        rawGlobalSettings: writeStoredGlobalSettings(globalSettingsRead.settings),
        notice: readWarningNotice("plugin", globalSettingsRead.warning),
        readWarning: globalSettingsRead.warning,
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
    settingsScope: SettingsScope,
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

function settingsLoadFailureNotice(settingsScope: SettingsScope): SettingsNotice {
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
