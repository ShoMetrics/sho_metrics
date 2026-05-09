import { useEffect, useMemo, useRef, useState } from "react";
import { FieldRenderer } from "./components/FieldRenderer";
import { PluginSettingsTab } from "./PluginSettingsTab";
import { SectionHeading } from "./components/SectionHeading";
import { readControlValue } from "./control-events";
import {
    resolveInspectorSectionList,
} from "./scenarios";
import {
    resolveActionKind,
    type ActionKind,
} from "./settings";
import {
    defaultPluginGlobalSettings,
    normalizePluginGlobalSettings,
    normalizeWidgetStoredSettings,
    type PluginGlobalSettings,
    type WidgetStoredSettings,
} from "../settings/widget-settings";
import { readWidgetSettings, writeWidgetSettings } from "../settings/codec";
import {
    readActionUuid,
    resolveIsWindowsPropertyInspector,
    type StreamDeckPropertyInspectorClient,
} from "./stream-deck-client";
import type { InspectorSettingTarget, VisibilityContext } from "./schema";
import type { ScenarioSectionId } from "./scenario-model";
import {
    buildInspectorBindingContext,
    isPropertyInspectorSettingKey,
    updateWidgetStoredSettings,
} from "./widget-setting-bindings";

interface AppProps {
    client: StreamDeckPropertyInspectorClient;
}

interface PropertyInspectorState {
    actionKind: ActionKind;
    isWindows: boolean;
    storedSettings: WidgetStoredSettings;
    globalSettings: PluginGlobalSettings;
    activeTab: "widget" | "plugin";
    loadError: string | null;
}

const initialState: PropertyInspectorState = {
    actionKind: "unknown",
    isWindows: false,
    storedSettings: normalizeWidgetStoredSettings({}),
    globalSettings: { ...defaultPluginGlobalSettings },
    activeTab: "widget",
    loadError: null,
};

export function App({ client }: AppProps): React.JSX.Element {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [state, setState] = useState<PropertyInspectorState>(initialState);
    const visibilityContext = useMemo(() => buildInspectorBindingContext({
        storedSettings: state.storedSettings,
        globalSettings: state.globalSettings,
        actionKind: state.actionKind,
        isWindows: state.isWindows,
    }), [state.storedSettings, state.globalSettings, state.actionKind, state.isWindows]);
    const inspectorSectionList = useMemo(
        () => resolveInspectorSectionList(visibilityContext),
        [visibilityContext],
    );
    const isGlobalAppearanceOverrideEnabled = state.globalSettings.overrideWidgetAppearance;

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
            const nextStoredSettings = normalizeWidgetStoredSettings({});

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

    const updateGlobalSettings = (nextGlobalSettings: PluginGlobalSettings): void => {
        setState((currentState) => ({
            ...currentState,
            globalSettings: nextGlobalSettings,
            loadError: null,
        }));

        client.setGlobalSettings(nextGlobalSettings).catch((error: Error) => {
            setState((errorState) => ({
                ...errorState,
                loadError: `Failed to save global settings: ${error.message}`,
            }));
        });
    };

    useEffect(() => {
        let isDisposed = false;

        async function loadSettings(): Promise<void> {
            const connectionInfo = await client.getConnectionInfo();
            const payload = await client.getSettings();
            const globalPayload = await client.getGlobalSettings();
            const actionKind = resolveActionKind(readActionUuid(connectionInfo));
            const isWindows = resolveIsWindowsPropertyInspector(connectionInfo);
            const globalSettings = normalizePluginGlobalSettings(readSettingsRecord(globalPayload));
            const storedSettings = normalizeWidgetStoredSettings(readWidgetSettings(payload.settings));

            if (isDisposed) {
                return;
            }

            setState({
                actionKind,
                isWindows,
                storedSettings,
                globalSettings,
                activeTab: "widget",
                loadError: null,
            });
        }

        client.didReceiveSettings.subscribe((event) => {
            setState((currentState) => {
                const storedSettings = normalizeWidgetStoredSettings(readWidgetSettings(event.payload.settings));

                return {
                    ...currentState,
                    storedSettings,
                };
            });
        });

        client.didReceiveGlobalSettings.subscribe((event) => {
            setState((currentState) => {
                const globalSettings = normalizePluginGlobalSettings(readSettingsRecord(event));

                return {
                    ...currentState,
                    globalSettings,
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

    useEffect(() => {
        const root = rootRef.current;

        if (!root) {
            return;
        }

        const handleControlEvent = (event: Event): void => {
            const controlValue = readControlValue(event);

            if (!controlValue) {
                return;
            }

            if (isPropertyInspectorSettingKey(controlValue.key)) {
                updateSetting(controlValue.key, controlValue.value);
            }
        };

        root.addEventListener("input", handleControlEvent, true);
        root.addEventListener("change", handleControlEvent, true);

        return () => {
            root.removeEventListener("input", handleControlEvent, true);
            root.removeEventListener("change", handleControlEvent, true);
        };
    }, [client]);

    if (state.loadError) {
        return <div ref={rootRef}>{state.loadError}</div>;
    }

    return (
        <div ref={rootRef}>
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

            {state.activeTab === "widget" ? (
                    <WidgetSettingsTab
                        inspectorSectionList={inspectorSectionList}
                        visibilityContext={visibilityContext}
                        isGlobalAppearanceOverrideEnabled={isGlobalAppearanceOverrideEnabled}
                        onSettingChange={updateSetting}
                        onResetWidgetSettings={resetWidgetSettings}
                    />
            ) : (
                <PluginSettingsTab
                    settings={state.globalSettings}
                    onSettingsChange={updateGlobalSettings}
                />
            )}
        </div>
    );
}

function WidgetSettingsTab(options: {
    inspectorSectionList: ReturnType<typeof resolveInspectorSectionList>;
    visibilityContext: VisibilityContext;
    isGlobalAppearanceOverrideEnabled: boolean;
    onSettingChange: (target: InspectorSettingTarget, value: string) => void;
    onResetWidgetSettings: () => void;
}): React.JSX.Element {
    return (
        <>
            <sdpi-item className="widget-reset-item">
                <button
                    className="inline-action-button"
                    type="button"
                    onClick={options.onResetWidgetSettings}
                >
                    Reset Widget Settings
                </button>
            </sdpi-item>
            {options.isGlobalAppearanceOverrideEnabled && (
                <sdpi-item className="note-item note-item-caption">
                    <p className="section-note">Some settings are disabled since global override is enabled.</p>
                </sdpi-item>
            )}
            {options.inspectorSectionList.map((section) => {
                const isSectionDisabled = options.isGlobalAppearanceOverrideEnabled
                    && isGlobalAppearanceSection(section.id);

                return (
                    <section key={section.id} className="settings-section">
                        <SectionHeading text={section.label} variant="section" />
                        {section.fieldList.map((field, fieldIndex) => (
                            <FieldRenderer
                                key={`${section.id}-${field.id}-${fieldIndex}`}
                                field={field}
                                context={options.visibilityContext}
                                onSettingChange={options.onSettingChange}
                                disabled={isSectionDisabled}
                            />
                        ))}
                    </section>
                );
            })}
        </>
    );
}

function isGlobalAppearanceSection(sectionId: ScenarioSectionId): boolean {
    return sectionId === "layout" || sectionId === "colors";
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

function isSettingsPayload(payload: unknown): payload is { settings: Record<string, unknown> } {
    return Boolean(
        payload
            && typeof payload === "object"
            && "settings" in payload
            && typeof (payload as { settings?: unknown }).settings === "object"
            && (payload as { settings?: unknown }).settings !== null,
    );
}
