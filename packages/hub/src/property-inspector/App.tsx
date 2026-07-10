import { useState } from "react";
import { shellMessages } from "../i18n/message-groups/shell";
import { useI18n } from "../i18n/react";
import { InspectorItem } from "./components/InspectorItem";
import { ColorCompensationWizard } from "./color-compensation/ColorCompensationWizard";
import { propertyInspectorExternalUrls } from "./external-urls";
import { PropertyInspectorExternalLink } from "./panels/external-link";
import { GlobalSettingsTab } from "./panels/tabs/GlobalSettingsTab";
import { WidgetSettingsTab } from "./panels/tabs/WidgetSettingsTab";
import {
    usePropertyInspectorSettings,
    type SettingsNotice,
} from "./settings-sync/usePropertyInspectorSettings";
import type { StreamDeckPropertyInspectorClient } from "./stream-deck/stream-deck-client";
import { StreamDeckClientProvider } from "./stream-deck/stream-deck-client-context";
import {
    type PluginRuntimeConnectionStatus,
    usePluginRuntimeConnectionStatus,
} from "./usePluginRuntimeConnectionStatus";

interface AppProps {
    client: StreamDeckPropertyInspectorClient;
}

const settingsTabs = [
    { id: "widget", label: shellMessages.widgetTab },
    { id: "global", label: shellMessages.globalTab },
] as const;

type SettingsTabId = typeof settingsTabs[number]["id"];

export function App({ client }: AppProps): React.JSX.Element {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<SettingsTabId>("widget");
    const [isColorCompensationWizardOpen, setIsColorCompensationWizardOpen] = useState(false);
    const pluginRuntimeConnectionStatus = usePluginRuntimeConnectionStatus(client);
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
        upsertCustomHttpCredential,
        deleteCustomHttpCredential,
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

    return (
        <StreamDeckClientProvider client={client}>
            {isColorCompensationWizardOpen ? (
                <ColorCompensationWizard
                    client={client}
                    initialProfile={colorCompensation.profile}
                    onProfileSave={colorCompensation.saveProfile}
                    onProfileReset={colorCompensation.resetProfile}
                    onClose={() => setIsColorCompensationWizardOpen(false)}
                />
            ) : (
                <div>
                    <div className="settings-tab-list" role="tablist" aria-label={t(shellMessages.settingsTabListLabel)}>
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
                                {t(tab.label)}
                            </button>
                        ))}
                    </div>

                    <PluginRuntimeConnectionNoticeSlot status={pluginRuntimeConnectionStatus} />

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
                            onGlobalSettingsPatch={updateGlobalSettings}
                            onCustomHttpCredentialUpsert={upsertCustomHttpCredential}
                            onCustomHttpCredentialDelete={deleteCustomHttpCredential}
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
            )}
        </StreamDeckClientProvider>
    );
}

function PluginRuntimeConnectionNoticeSlot(options: {
    status: PluginRuntimeConnectionStatus;
}): React.JSX.Element | null {
    const { t } = useI18n();

    // "checking" and "connected" render nothing, and this is deliberately the
    // only state that draws anything. Do not add a "checking..." note during the
    // pre-timeout window: the tabs below already show "Loading widget settings..."
    // / "Loading metrics..." in this same area while settings load, so a second
    // in-progress note would overlap and read as redundant noise. Only the
    // terminal "unresponsive" verdict carries information those loading notes do
    // not, so only it surfaces a message.
    if (options.status !== "unresponsive") {
        return null;
    }

    // The link text is the literal URL, not hidden behind label words: in this
    // exact failure the shared Node runtime may be missing and Stream Deck can
    // drop the openUrl command, so the user must still be able to read and copy
    // the address by hand. The link stays clickable for the common case where
    // opening works.
    return (
        <InspectorItem className="settings-notice settings-notice-warning plugin-runtime-connection-notice">
            <p className="section-note">{t(shellMessages.pluginRuntimeUnresponsive)}</p>
            <p className="section-note">
                <PropertyInspectorExternalLink url={propertyInspectorExternalUrls.pluginEngineNotRespondingFaq}>
                    {propertyInspectorExternalUrls.pluginEngineNotRespondingFaq}
                </PropertyInspectorExternalLink>
            </p>
        </InspectorItem>
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
    const { t } = useI18n();

    return (
        <InspectorItem className={`settings-notice settings-notice-${notice.kind}`}>
            <p className="section-note">{t(notice.message, notice.values)}</p>
        </InspectorItem>
    );
}
