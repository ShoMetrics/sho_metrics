import { useEffect, useMemo, useState } from "react";
import { InspectorItem } from "./components/InspectorItem";
import { PluginSettingsTab } from "./PluginSettingsTab";
import { WidgetSettingsTab } from "./panels/WidgetSettingsTab";
import {
    resolveActionKind,
    type ActionKind,
} from "./settings";
import {
    sanitizeWidgetSettings,
    type GlobalSettings,
    type WidgetStoredSettings,
} from "../settings/widget-settings";
import {
    classifyRawWidgetSettings,
    readGlobalSettings,
    readWidgetSettings,
    writeGlobalSettings,
    writeWidgetSettings,
    type RawWidgetSettingsClassification,
} from "../settings/codec";
import { resolveGlobalSettings } from "../settings/resolver";
import {
    type ConnectionInfo,
    readActionUuid,
    resolveIsWindowsPropertyInspector,
    type StreamDeckPropertyInspectorClient,
} from "./stream-deck-client";
import type { InspectorSettingTarget } from "./types";
import {
    buildInspectorBindingContext,
    updateWidgetStoredSettings,
} from "./widget-setting-bindings";
import { applyGlobalSettingsPatch } from "./plugin-settings-updates";

interface AppProps {
    client: StreamDeckPropertyInspectorClient;
}

interface PropertyInspectorState {
    actionKind: ActionKind;
    isWindows: boolean;
    storedSettings: WidgetStoredSettings;
    globalSettings: GlobalSettings;
    settingsNotice: SettingsNotice | null;
    activeTab: "widget" | "plugin";
    loadError: string | null;
}

type SettingsNoticeKind = "loading" | "warning";

interface SettingsNotice {
    kind: SettingsNoticeKind;
    text: string;
}

const initialState: PropertyInspectorState = {
    actionKind: "unknown",
    isWindows: false,
    storedSettings: sanitizeWidgetSettings({}),
    globalSettings: {},
    settingsNotice: null,
    activeTab: "widget",
    loadError: null,
};

export function App({ client }: AppProps): React.JSX.Element {
    const [state, setState] = useState<PropertyInspectorState>(initialState);
    const resolvedGlobalSettings = useMemo(
        () => resolveGlobalSettings(state.globalSettings),
        [state.globalSettings],
    );
    const visibilityContext = useMemo(() => buildInspectorBindingContext({
        storedSettings: state.storedSettings,
        globalSettings: state.globalSettings,
        actionKind: state.actionKind,
        isWindows: state.isWindows,
    }), [state.storedSettings, state.globalSettings, state.actionKind, state.isWindows]);
    const isGlobalAppearanceOverrideEnabled = resolvedGlobalSettings.overrideWidgetAppearance;

    const updateSetting = (changedTarget: InspectorSettingTarget, changedValue: string): void => {
        setState((currentState) => {
            const currentContext = buildContextFromState(currentState);

            const nextStoredSettings = updateWidgetStoredSettings({
                storedSettings: currentState.storedSettings,
                target: changedTarget,
                value: changedValue,
                context: currentContext,
            });

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
            const nextStoredSettings = sanitizeWidgetSettings({});

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
            const initialSettings = readInitialWidgetSettings(connectionInfo);

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
                const nextState: PropertyInspectorState = {
                    ...currentState,
                    activeTab: "widget",
                    loadError: null,
                };

                if (settingsResult.status === "fulfilled") {
                    const refreshedSettings = readRefreshedWidgetSettings(settingsResult.value.settings);
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
                    nextState.globalSettings = readGlobalSettings(readSettingsRecord(globalSettingsResult.value));
                } else {
                    nextState.settingsNotice = {
                        kind: "warning",
                        text: "We couldn't load plugin settings, so defaults are shown.",
                    };
                }

                return nextState;
            });
        }

        client.didReceiveSettings.subscribe((event) => {
            setState((currentState) => {
                const refreshedSettings = readRefreshedWidgetSettings(event.payload.settings);

                return {
                    ...currentState,
                    storedSettings: refreshedSettings.classification === "present"
                        ? refreshedSettings.storedSettings
                        : currentState.storedSettings,
                    settingsNotice: null,
                };
            });
        });

        client.didReceiveGlobalSettings.subscribe((event) => {
            setState((currentState) => {
                const globalSettings = readGlobalSettings(readSettingsRecord(event));

                return {
                    ...currentState,
                    globalSettings,
                    settingsNotice: currentState.settingsNotice,
                };
            });
        });

        loadSettings().catch((error: Error) => {
            setState((currentState) => ({
                ...currentState,
                loadError: `Failed to load settings: ${error.message}`,
            }));
        });

        return () => {
            isDisposed = true;
        };
    }, [client]);

    return (
        <div>
            <div className="settings-tab-list" role="tablist" aria-label="Settings">
                <button
                    className="settings-tab"
                    type="button"
                    role="tab"
                    aria-selected={state.activeTab === "widget"}
                    data-selected={state.activeTab === "widget" ? "true" : "false"}
                    onClick={() => setState(currentState => ({ ...currentState, activeTab: "widget" }))}
                >
                    Widget
                </button>
                <button
                    className="settings-tab"
                    type="button"
                    role="tab"
                    aria-selected={state.activeTab === "plugin"}
                    data-selected={state.activeTab === "plugin" ? "true" : "false"}
                    onClick={() => setState(currentState => ({ ...currentState, activeTab: "plugin" }))}
                >
                    Plugin
                </button>
            </div>

            <SettingsNoticeSlot notice={state.settingsNotice} loadError={state.loadError} />

            {state.activeTab === "widget" ? (
                <WidgetSettingsTab
                    actionKind={state.actionKind}
                    context={visibilityContext}
                    isGlobalAppearanceOverrideEnabled={isGlobalAppearanceOverrideEnabled}
                    onSettingChange={updateSetting}
                    onResetWidgetSettings={resetWidgetSettings}
                />
            ) : (
                <PluginSettingsTab
                    resolvedSettings={resolvedGlobalSettings}
                    onSettingsPatch={updateGlobalSettings}
                />
            )}
        </div>
    );
}

function SettingsNoticeSlot(options: {
    notice: SettingsNotice | null;
    loadError: string | null;
}): React.JSX.Element | null {
    const notice = options.loadError
        ? {
            kind: "warning" as const,
            text: options.loadError,
        }
        : options.notice;

    if (!notice) {
        return null;
    }

    return <SettingsNoticeView notice={notice} />;
}

function SettingsNoticeView({ notice }: { notice: SettingsNotice }): React.JSX.Element {
    return (
        <InspectorItem className={`settings-notice settings-notice-${notice.kind}`}>
            <p className="section-note">{notice.text}</p>
        </InspectorItem>
    );
}

function buildContextFromState(state: PropertyInspectorState): ReturnType<typeof buildInspectorBindingContext> {
    return buildInspectorBindingContext({
        storedSettings: state.storedSettings,
        globalSettings: state.globalSettings,
        actionKind: state.actionKind,
        isWindows: state.isWindows,
    });
}

function readSettingsRecord(payload: unknown): Record<string, unknown> {
    if (isSettingsPayload(payload)) {
        return payload.settings;
    }

    if (isSettingsPayload((payload as { payload?: unknown }).payload)) {
        return (payload as { payload: { settings: Record<string, unknown> } }).payload.settings;
    }

    if (payload && typeof payload === "object") {
        return payload as Record<string, unknown>;
    }

    return {};
}

function readInitialWidgetSettings(connectionInfo: ConnectionInfo): {
    classification: RawWidgetSettingsClassification;
    storedSettings: WidgetStoredSettings;
} {
    const rawSettings = connectionInfo.actionInfo?.payload?.settings;
    const classification = classifyRawWidgetSettings(rawSettings);

    return {
        classification,
        storedSettings: classification === "present"
            ? sanitizeWidgetSettings(readWidgetSettings(rawSettings))
            : sanitizeWidgetSettings({}),
    };
}

function readRefreshedWidgetSettings(rawSettings: unknown): {
    classification: RawWidgetSettingsClassification;
    storedSettings: WidgetStoredSettings;
} {
    const classification = classifyRawWidgetSettings(rawSettings);

    return {
        classification,
        storedSettings: classification === "present"
            ? sanitizeWidgetSettings(readWidgetSettings(rawSettings))
            : sanitizeWidgetSettings({}),
    };
}

function isSettingsPayload(payload: unknown): payload is { settings: Record<string, unknown> } {
    return Boolean(
        payload
            && typeof payload === "object"
            && "settings" in payload
            && typeof (payload as { settings?: unknown }).settings === "object"
            && (payload as { settings?: unknown }).settings !== null,
    );
}
