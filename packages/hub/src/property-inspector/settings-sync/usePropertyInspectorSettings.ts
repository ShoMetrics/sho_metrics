import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { resolveStreamDeckActionKind } from "../../shared/stream-deck-actions";
import type { ActionKind } from "../inspector/settings-types";

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
        const nextState = commitState((currentState) => {
            const nextStoredSettings = mergeWidgetSettingsPatch(currentState.storedSettings, patch);

            return {
                ...currentState,
                storedSettings: nextStoredSettings,
                loadError: null,
            };
        });

        client.setSettings(writeWidgetSettings(nextState.storedSettings)).catch((error: Error) => {
            commitState((errorState) => ({
                ...errorState,
                loadError: `Failed to save settings: ${error.message}`,
            }));
        });
    };

    const resetWidgetSettings = (): void => {
        const nextState = commitState((currentState) => {
            const nextStoredSettings: WidgetStoredSettings = {};

            return {
                ...currentState,
                storedSettings: nextStoredSettings,
                loadError: null,
            };
        });

        client.setSettings(writeWidgetSettings(nextState.storedSettings)).catch((error: Error) => {
            commitState((errorState) => ({
                ...errorState,
                loadError: `Failed to save settings: ${error.message}`,
            }));
        });
    };

    const updateGlobalSettings = (patch: GlobalSettings): void => {
        const nextState = commitState((currentState) => {
            const nextGlobalSettings = applyGlobalSettingsPatch(currentState.globalSettings, patch);

            return {
                ...currentState,
                globalSettings: nextGlobalSettings,
                loadError: null,
            };
        });

        client.setGlobalSettings(writeGlobalSettings(nextState.globalSettings)).catch((error: Error) => {
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
            const initialSettings = readWidgetSettingsResult(connectionInfo.actionInfo?.payload?.settings);

            if (isDisposed) {
                return;
            }

            commitState((currentState) => ({
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

            commitState((currentState) => {
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

            commitState((currentState) => {
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

            commitState((currentState) => ({
                ...currentState,
                globalSettings: readGlobalSettings(event.payload.settings),
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
