import { useState } from "react";
import { InspectorItem } from "./components/InspectorItem";
import { ColorCompensationWizard } from "./color-compensation/ColorCompensationWizard";
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
    const [isColorCompensationWizardOpen, setIsColorCompensationWizardOpen] = useState(false);
    const {
        visibilityContext,
        resolvedGlobalSettings,
        globalSettingsStatus,
        widgetSettingsNotice,
        globalSettingsNotice,
        colorCompensation,
        updateWidgetSettings,
        resetWidgetSettings,
        updateGlobalSettings,
    } = usePropertyInspectorSettings(client);
    const isGlobalSettingsReady = globalSettingsStatus === "ready";
    const isGlobalViewOverrideEnabled =
        isGlobalSettingsReady && resolvedGlobalSettings.viewOverride !== undefined;
    const isGlobalThemeOverrideEnabled =
        isGlobalSettingsReady && resolvedGlobalSettings.themeOverride !== undefined;
    const isGlobalTransparentSurfaceOverrideEnabled =
        isGlobalSettingsReady && resolvedGlobalSettings.transparentSurfaceOverride !== undefined;
    const isGlobalPaintOverrideEnabled =
        isGlobalSettingsReady && resolvedGlobalSettings.paintOverride !== undefined;
    if (isColorCompensationWizardOpen) {
        return (
            <ColorCompensationWizard
                client={client}
                initialProfile={colorCompensation.profile}
                onProfileSave={colorCompensation.saveProfile}
                onProfileReset={colorCompensation.resetProfile}
                onClose={() => setIsColorCompensationWizardOpen(false)}
            />
        );
    }

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
                    isGlobalTransparentSurfaceOverrideEnabled={isGlobalTransparentSurfaceOverrideEnabled}
                    isGlobalPaintOverrideEnabled={isGlobalPaintOverrideEnabled}
                    colorCompensationProfile={colorCompensation.profile}
                    onSettingsPatch={updateWidgetSettings}
                    onResetWidgetSettings={resetWidgetSettings}
                    onOpenColorCompensation={() => setIsColorCompensationWizardOpen(true)}
                />
            ) : (
                <GlobalSettingsTab
                    resolvedSettings={resolvedGlobalSettings}
                    colorCompensationProfile={colorCompensation.profile}
                    onSettingsPatch={updateGlobalSettings}
                    onOpenColorCompensation={() => setIsColorCompensationWizardOpen(true)}
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
