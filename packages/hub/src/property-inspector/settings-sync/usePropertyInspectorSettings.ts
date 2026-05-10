import { useEffect, useMemo, useState } from "react";
import {
    type GlobalSettings,
    type WidgetSettings,
    type WidgetStoredSettings,
} from "../../settings/widget-settings";
import { mergeWidgetSettingsPatch } from "../../settings/updates";
import {
    classifyRawWidgetSettings,
    readGlobalSettings,
    readWidgetSettings,
    writeGlobalSettings,
    writeWidgetSettings,
    type RawWidgetSettingsClassification,
} from "../../settings/codec";
import { resolveGlobalSettings } from "../../settings/resolver";
import { buildPropertyInspectorContext } from "../inspector/context";
import { applyGlobalSettingsPatch } from "./plugin-settings-updates";
import {
    readActionUuid,
    resolveIsWindowsPropertyInspector,
    type StreamDeckPropertyInspectorClient,
} from "../stream-deck/stream-deck-client";
import {
    resolveActionKind,
    type ActionKind,
} from "../inspector/action-kind";

interface SettingsSyncState {
    actionKind: ActionKind;
    isWindows: boolean;
    storedSettings: WidgetStoredSettings;
    globalSettings: GlobalSettings;
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
    storedSettings: {},
    globalSettings: {},
    settingsNotice: null,
    loadError: null,
};

export function usePropertyInspectorSettings(
    client: StreamDeckPropertyInspectorClient,
) {
    const [state, setState] = useState<SettingsSyncState>(initialState);
    const resolvedGlobalSettings = useMemo(
        () => resolveGlobalSettings(state.globalSettings),
        [state.globalSettings],
    );
    const visibilityContext = useMemo(() => buildPropertyInspectorContext({
        storedSettings: state.storedSettings,
        globalSettings: state.globalSettings,
        actionKind: state.actionKind,
        isWindows: state.isWindows,
    }), [state.storedSettings, state.globalSettings, state.actionKind, state.isWindows]);

    const updateWidgetSettings = (patch: WidgetSettings): void => {
        setState((currentState) => {
            const nextStoredSettings = mergeWidgetSettingsPatch(currentState.storedSettings, patch);

            client.setSettings(writeWidgetSettings(nextStoredSettings)).catch((error: Error) => {
                setState((errorState) => ({
                    ...errorState,
                    loadError: `Failed to save settings: ${error.message}`,
                }));
            });

            return {
                ...currentState,
                storedSettings: nextStoredSettings,
                loadError: null,
            };
        });
    };

    const resetWidgetSettings = (): void => {
        setState((currentState) => {
            const nextStoredSettings: WidgetStoredSettings = {};

            client.setSettings(writeWidgetSettings(nextStoredSettings)).catch((error: Error) => {
                setState((errorState) => ({
                    ...errorState,
                    loadError: `Failed to save settings: ${error.message}`,
                }));
            });

            return {
                ...currentState,
                storedSettings: nextStoredSettings,
                loadError: null,
            };
        });
    };

    const updateGlobalSettings = (patch: GlobalSettings): void => {
        setState((currentState) => {
            const nextGlobalSettings = applyGlobalSettingsPatch(currentState.globalSettings, patch);

            client.setGlobalSettings(writeGlobalSettings(nextGlobalSettings)).catch((error: Error) => {
                setState((errorState) => ({
                    ...errorState,
                    loadError: `Failed to save global settings: ${error.message}`,
                }));
            });

            return {
                ...currentState,
                globalSettings: nextGlobalSettings,
                loadError: null,
            };
        });
    };

    useEffect(() => {
        let isDisposed = false;

        async function loadSettings(): Promise<void> {
            const connectionInfo = await client.getConnectionInfo();
            const actionKind = resolveActionKind(readActionUuid(connectionInfo));
            const isWindows = resolveIsWindowsPropertyInspector(connectionInfo);
            const initialSettings = readWidgetSettingsResult(connectionInfo.actionInfo?.payload?.settings);

            if (isDisposed) {
                return;
            }

            setState((currentState) => ({
                ...currentState,
                actionKind,
                isWindows,
                storedSettings: initialSettings.classification === "present"
                    ? initialSettings.storedSettings
                    : currentState.storedSettings,
                settingsNotice: initialSettings.classification === "missing"
                    ? {
                        kind: "loading",
                        text: "Loading settings...",
                    }
                    : null,
                loadError: null,
            }));

            const [settingsResult, globalSettingsResult] = await Promise.allSettled([
                client.getSettings(),
                client.getGlobalSettings(),
            ]);

            if (isDisposed) {
                return;
            }

            setState((currentState) => {
                const nextState: SettingsSyncState = {
                    ...currentState,
                    loadError: null,
                };

                if (settingsResult.status === "fulfilled") {
                    const refreshedSettings = readWidgetSettingsResult(settingsResult.value.settings);
                    if (refreshedSettings.classification === "present") {
                        nextState.storedSettings = refreshedSettings.storedSettings;
                    }
                    nextState.settingsNotice = null;
                } else {
                    nextState.settingsNotice = {
                        kind: "warning",
                        text: "We couldn't load this widget's saved settings, so defaults are shown.",
                    };
                }

                if (globalSettingsResult.status === "fulfilled") {
                    nextState.globalSettings = readGlobalSettings(globalSettingsResult.value.settings);
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

            setState((currentState) => {
                const refreshedSettings = readWidgetSettingsResult(event.payload.settings);

                return {
                    ...currentState,
                    storedSettings: refreshedSettings.classification === "present"
                        ? refreshedSettings.storedSettings
                        : currentState.storedSettings,
                    settingsNotice: null,
                };
            });
        });

        const unsubscribeGlobalSettings = client.didReceiveGlobalSettings.subscribe((event) => {
            if (isDisposed) {
                return;
            }

            setState((currentState) => ({
                ...currentState,
                globalSettings: readGlobalSettings(event.payload.settings),
                settingsNotice: currentState.settingsNotice,
            }));
        });

        loadSettings().catch((error: Error) => {
            if (isDisposed) {
                return;
            }

            setState((currentState) => ({
                ...currentState,
                loadError: `Failed to load settings: ${error.message}`,
            }));
        });

        return () => {
            isDisposed = true;
            unsubscribeSettings();
            unsubscribeGlobalSettings();
        };
    }, [client]);

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

function readWidgetSettingsResult(rawSettings: unknown): {
    classification: RawWidgetSettingsClassification;
    storedSettings: WidgetStoredSettings;
} {
    const classification = classifyRawWidgetSettings(rawSettings);

    return {
        classification,
        storedSettings: classification === "present"
            ? readWidgetSettings(rawSettings)
            : {},
    };
}
