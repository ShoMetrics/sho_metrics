import { useEffect, useMemo, useRef, useState } from "react";
import { FieldRenderer } from "./components/FieldRenderer";
import { PluginSettingsTab } from "./PluginSettingsTab";
import { SectionHeading } from "./components/SectionHeading";
import { readControlValue } from "./control-events";
import {
    resolveInspectorSectionList,
} from "./scenarios";
import {
    basePropertyInspectorSettings,
    resolveActionKind,
    type ActionKind,
    type PropertyInspectorSettings,
} from "./settings";
import {
    defaultPluginGlobalSettings,
    normalizePluginGlobalSettings,
    normalizeWidgetStoredSettings,
    resolveWidgetSettings,
    setWidgetFieldOverride,
    type PluginGlobalSettings,
    type WidgetStoredSettingKey,
    type WidgetStoredSettings,
} from "../settings/widget-settings";
import {
    readActionUuid,
    resolveIsWindowsPropertyInspector,
    type StreamDeckPropertyInspectorClient,
} from "./stream-deck-client";
import type { PropertyInspectorSettingKey, VisibilityContext } from "./schema";
import type { ScenarioSectionId } from "./scenario-model";

interface AppProps {
    client: StreamDeckPropertyInspectorClient;
}

interface PropertyInspectorState {
    actionKind: ActionKind;
    isWindows: boolean;
    storedSettings: WidgetStoredSettings;
    settings: PropertyInspectorSettings;
    globalSettings: PluginGlobalSettings;
    activeTab: "widget" | "plugin";
    loadError: string | null;
}

const initialState: PropertyInspectorState = {
    actionKind: "unknown",
    isWindows: false,
    storedSettings: normalizeWidgetStoredSettings({}, { actionKind: "unknown", isWindows: false }),
    settings: { ...basePropertyInspectorSettings },
    globalSettings: { ...defaultPluginGlobalSettings },
    activeTab: "widget",
    loadError: null,
};

export function App({ client }: AppProps): React.JSX.Element {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [state, setState] = useState<PropertyInspectorState>(initialState);
    const visibilityContext = useMemo(() => ({
        actionKind: state.actionKind,
        isWindows: state.isWindows,
        settings: state.settings,
    }), [state.actionKind, state.isWindows, state.settings]);
    const inspectorSectionList = useMemo(
        () => resolveInspectorSectionList(visibilityContext),
        [visibilityContext],
    );
    const isGlobalAppearanceOverrideEnabled = state.globalSettings.overrideWidgetAppearance;

    const updateSetting = (changedKey: PropertyInspectorSettingKey, changedValue: string): void => {
        setState((currentState) => {
            const nextStoredSettings = setWidgetFieldOverride(
                currentState.storedSettings,
                changedKey as WidgetStoredSettingKey,
                changedValue,
            );
            const nextSettings = buildResolvedPropertyInspectorSettings({
                storedSettings: nextStoredSettings,
                globalSettings: currentState.globalSettings,
                actionKind: currentState.actionKind,
                isWindows: currentState.isWindows,
            });

            client.setSettings(nextStoredSettings).catch((error: Error) => {
                setState((errorState) => ({
                    ...errorState,
                    loadError: `Failed to save settings: ${error.message}`,
                }));
            });

            return {
                ...currentState,
                storedSettings: nextStoredSettings,
                settings: nextSettings,
                loadError: null,
            };
        });
    };

    const resetWidgetSettings = (): void => {
        setState((currentState) => {
            const nextStoredSettings = normalizeWidgetStoredSettings({}, {
                actionKind: currentState.actionKind,
                isWindows: currentState.isWindows,
            });
            const nextSettings = buildResolvedPropertyInspectorSettings({
                storedSettings: nextStoredSettings,
                globalSettings: currentState.globalSettings,
                actionKind: currentState.actionKind,
                isWindows: currentState.isWindows,
            });

            client.setSettings(nextStoredSettings).catch((error: Error) => {
                setState((errorState) => ({
                    ...errorState,
                    loadError: `Failed to save settings: ${error.message}`,
                }));
            });

            return {
                ...currentState,
                storedSettings: nextStoredSettings,
                settings: nextSettings,
                loadError: null,
            };
        });
    };

    const updateGlobalSettings = (nextGlobalSettings: PluginGlobalSettings): void => {
        setState((currentState) => ({
            ...currentState,
            globalSettings: nextGlobalSettings,
            settings: buildResolvedPropertyInspectorSettings({
                storedSettings: currentState.storedSettings,
                globalSettings: nextGlobalSettings,
                actionKind: currentState.actionKind,
                isWindows: currentState.isWindows,
            }),
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
            const storedSettings = normalizeWidgetStoredSettings(payload.settings, { actionKind, isWindows });

            if (isDisposed) {
                return;
            }

            setState({
                actionKind,
                isWindows,
                storedSettings,
                settings: buildResolvedPropertyInspectorSettings({
                    storedSettings,
                    globalSettings,
                    actionKind,
                    isWindows,
                }),
                globalSettings,
                activeTab: "widget",
                loadError: null,
            });
        }

        client.didReceiveSettings.subscribe((event) => {
            setState((currentState) => {
                const storedSettings = normalizeWidgetStoredSettings(event.payload.settings, {
                    actionKind: currentState.actionKind,
                    isWindows: currentState.isWindows,
                });

                return {
                    ...currentState,
                    storedSettings,
                    settings: buildResolvedPropertyInspectorSettings({
                        storedSettings,
                        globalSettings: currentState.globalSettings,
                        actionKind: currentState.actionKind,
                        isWindows: currentState.isWindows,
                    }),
                };
            });
        });

        client.didReceiveGlobalSettings.subscribe((event) => {
            setState((currentState) => {
                const globalSettings = normalizePluginGlobalSettings(readSettingsRecord(event));

                return {
                    ...currentState,
                    globalSettings,
                    settings: buildResolvedPropertyInspectorSettings({
                        storedSettings: currentState.storedSettings,
                        globalSettings,
                        actionKind: currentState.actionKind,
                        isWindows: currentState.isWindows,
                    }),
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

            updateSetting(controlValue.key, controlValue.value);
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
    onSettingChange: (key: PropertyInspectorSettingKey, value: string) => void;
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

function buildResolvedPropertyInspectorSettings(options: {
    storedSettings: WidgetStoredSettings;
    globalSettings: PluginGlobalSettings;
    actionKind: ActionKind;
    isWindows: boolean;
}): PropertyInspectorSettings {
    const resolvedSettings = resolveWidgetSettings(options);

    return {
        ...resolvedSettings.appearance,
        ...resolvedSettings.metric,
        ...resolvedSettings.local,
        ...resolvedSettings.network,
        ...resolvedSettings.diskThroughput,
        maximumGpuPowerWatts: toInspectorOptionalNumber(resolvedSettings.local.maximumGpuPowerWatts),
        maximumDownloadSpeedMbps: toInspectorOptionalNumber(resolvedSettings.network.maximumDownloadSpeedMbps),
        maximumUploadSpeedMbps: toInspectorOptionalNumber(resolvedSettings.network.maximumUploadSpeedMbps),
        maximumDiskReadThroughputMebibytesPerSecond: toInspectorOptionalNumber(
            resolvedSettings.diskThroughput.maximumDiskReadThroughputMebibytesPerSecond,
        ),
        maximumDiskWriteThroughputMebibytesPerSecond: toInspectorOptionalNumber(
            resolvedSettings.diskThroughput.maximumDiskWriteThroughputMebibytesPerSecond,
        ),
        availableNetworkInterfaces: options.storedSettings.runtimeCache.availableNetworkInterfaces,
        availableDiskVolumes: options.storedSettings.runtimeCache.availableDiskVolumes,
        netSpeedDefaultsApplied: true,
        diskDefaultsApplied: true,
    };
}

function toInspectorOptionalNumber(value: number | undefined): number | "" {
    return value ?? "";
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
