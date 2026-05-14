import { useState } from "react";
import { InspectorItem } from "./components/InspectorItem";
import { PluginSettingsTab } from "./panels/PluginSettingsTab";
import { WidgetSettingsTab } from "./panels/WidgetSettingsTab";
import {
    usePropertyInspectorSettings,
    type SettingsNotice,
} from "./settings-sync/usePropertyInspectorSettings";
import type { StreamDeckPropertyInspectorClient } from "./stream-deck/stream-deck-client";

interface AppProps {
    client: StreamDeckPropertyInspectorClient;
}

export function App({ client }: AppProps): React.JSX.Element {
    const [activeTab, setActiveTab] = useState<"widget" | "plugin">("widget");
    const {
        visibilityContext,
        resolvedGlobalSettings,
        widgetSettingsNotice,
        pluginSettingsNotice,
        updateWidgetSettings,
        resetWidgetSettings,
        updateGlobalSettings,
    } = usePropertyInspectorSettings(client);

    return (
        <div>
            <div className="settings-tab-list" role="tablist" aria-label="Settings">
                <button
                    className="settings-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "widget"}
                    data-selected={activeTab === "widget" ? "true" : "false"}
                    onClick={() => setActiveTab("widget")}
                >
                    Widget
                </button>
                <button
                    className="settings-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "plugin"}
                    data-selected={activeTab === "plugin" ? "true" : "false"}
                    onClick={() => setActiveTab("plugin")}
                >
                    Plugin
                </button>
            </div>

            <SettingsNoticeSlot
                notice={activeTab === "widget" ? widgetSettingsNotice : pluginSettingsNotice}
            />

            {activeTab === "widget" ? (
                <WidgetSettingsTab
                    context={visibilityContext}
                    isGlobalAppearanceOverrideEnabled={resolvedGlobalSettings.appearanceOverride !== undefined}
                    onSettingsPatch={updateWidgetSettings}
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
