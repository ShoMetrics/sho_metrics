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
        actionKind,
        visibilityContext,
        resolvedGlobalSettings,
        settingsNotice,
        loadError,
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

            <SettingsNoticeSlot notice={settingsNotice} loadError={loadError} />

            {activeTab === "widget" ? (
                <WidgetSettingsTab
                    actionKind={actionKind}
                    context={visibilityContext}
                    isGlobalAppearanceOverrideEnabled={resolvedGlobalSettings.overrideWidgetAppearance}
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
