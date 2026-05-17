import { useState } from "react";
import { InspectorItem } from "./components/InspectorItem";
import { GlobalSettingsTab } from "./panels/GlobalSettingsTab";
import { WidgetSettingsTab } from "./panels/WidgetSettingsTab";
import {
    usePropertyInspectorSettings,
    type SettingsNotice,
} from "./settings-sync/usePropertyInspectorSettings";
import type { StreamDeckPropertyInspectorClient } from "./stream-deck/stream-deck-client";

interface AppProps {
    client: StreamDeckPropertyInspectorClient;
}

const settingsTabs = [
    { id: "widget", label: "Widget" },
    { id: "global", label: "Global" },
] as const;

type SettingsTabId = typeof settingsTabs[number]["id"];

export function App({ client }: AppProps): React.JSX.Element {
    const [activeTab, setActiveTab] = useState<SettingsTabId>("widget");
    const {
        visibilityContext,
        resolvedGlobalSettings,
        globalSettingsStatus,
        widgetSettingsNotice,
        globalSettingsNotice,
        updateWidgetSettings,
        resetWidgetSettings,
        updateGlobalSettings,
    } = usePropertyInspectorSettings(client);
    const isGlobalSettingsReady = globalSettingsStatus === "ready";
    const isGlobalViewOverrideEnabled =
        isGlobalSettingsReady && resolvedGlobalSettings.viewOverride !== undefined;
    const isGlobalThemeOverrideEnabled =
        isGlobalSettingsReady && resolvedGlobalSettings.themeOverride !== undefined;
    const isGlobalPaintOverrideEnabled =
        isGlobalSettingsReady && resolvedGlobalSettings.paintOverride !== undefined;

    return (
        <div>
            <div className="settings-tab-list" role="tablist" aria-label="Settings">
                {settingsTabs.map((tab) => (
                    <button
                        key={tab.id}
                        className="settings-tab"
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        data-selected={activeTab === tab.id ? "true" : "false"}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <SettingsNoticeSlot
                notice={activeTab === "widget" ? widgetSettingsNotice : globalSettingsNotice}
            />

            {activeTab === "widget" ? (
                <WidgetSettingsTab
                    context={visibilityContext}
                    isGlobalViewOverrideEnabled={isGlobalViewOverrideEnabled}
                    isGlobalThemeOverrideEnabled={isGlobalThemeOverrideEnabled}
                    isGlobalPaintOverrideEnabled={isGlobalPaintOverrideEnabled}
                    onSettingsPatch={updateWidgetSettings}
                    onResetWidgetSettings={resetWidgetSettings}
                />
            ) : (
                <GlobalSettingsTab
                    resolvedSettings={resolvedGlobalSettings}
                    onSettingsPatch={updateGlobalSettings}
                />
            )}
        </div>
    );
}

function SettingsNoticeSlot(options: {
    notice: SettingsNotice | null;
}): React.JSX.Element | null {
    if (!options.notice) {
        return null;
    }

    return <SettingsNoticeView notice={options.notice} />;
}

function SettingsNoticeView({ notice }: { notice: SettingsNotice }): React.JSX.Element {
    return (
        <InspectorItem className={`settings-notice settings-notice-${notice.kind}`}>
            <p className="section-note">{notice.text}</p>
        </InspectorItem>
    );
}
