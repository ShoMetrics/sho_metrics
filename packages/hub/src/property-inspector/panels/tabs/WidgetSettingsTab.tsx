import { useEffect, useState } from "react";
import { InspectorItem } from "../../components/InspectorItem";
import { commonMessages } from "../../../i18n/message-groups/shell";
import { widgetMessages } from "../../../i18n/message-groups/widgets";
import { useI18n } from "../../../i18n/react";
import type { StoredWidgetSettingsPatch } from "../../../settings/storage/patch/widget-settings-patch";
import type { StoredCustomHttpCredentialInput } from "../../../settings/storage/global-settings-patch";
import type { StoredGlobalSettingsPatch } from "../../../settings/storage/global-settings-patch";
import type { VisibilityContext } from "../../inspector/types";
import type { ColorCompensationProfile } from "../../../color-compensation/types";
import { ColorCompensationControls } from "../controls/ColorCompensationControls";
import { DenseMultiMetricWidgetSettings } from "../widget-roots/DenseMultiMetricWidgetSettings";
import { HardwareSummaryWidgetSettings } from "../widget-roots/HardwareSummaryWidgetSettings";
import { MetricSourceDiagnostic } from "../controls/MetricSourceDiagnostic";
import { SettingsSection } from "../controls/SettingsSection";
import { SingleMetricWidgetSettings } from "../widget-roots/SingleMetricWidgetSettings";
import { StackedMetricWidgetSettings } from "../widget-roots/StackedMetricWidgetSettings";

interface WidgetSettingsTabProps {
    context: VisibilityContext;
    isGlobalViewOverrideEnabled: boolean;
    isGlobalThemeOverrideEnabled: boolean;
    isGlobalTransparentSurfaceOverrideEnabled: boolean;
    isGlobalPaintOverrideEnabled: boolean;
    colorCompensationProfile: ColorCompensationProfile;
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
    onGlobalSettingsPatch?: ((patch: StoredGlobalSettingsPatch) => void) | undefined;
    onCustomHttpCredentialUpsert?: ((credential: StoredCustomHttpCredentialInput) => void) | undefined;
    onCustomHttpCredentialDelete?: ((credentialId: string) => void) | undefined;
    onResetWidgetSettings: () => void;
    onOpenColorCompensation: () => void;
}
const WIDGET_SETTINGS_PENDING_NOTICE_DELAY_MS = 1000;

export function WidgetSettingsTab({
    context,
    isGlobalViewOverrideEnabled,
    isGlobalThemeOverrideEnabled,
    isGlobalTransparentSurfaceOverrideEnabled,
    isGlobalPaintOverrideEnabled,
    colorCompensationProfile,
    onSettingsPatch,
    onGlobalSettingsPatch,
    onCustomHttpCredentialUpsert,
    onCustomHttpCredentialDelete,
    onResetWidgetSettings,
    onOpenColorCompensation,
}: WidgetSettingsTabProps): React.JSX.Element {
    const { t } = useI18n();
    const [canShowPendingNotice, setCanShowPendingNotice] = useState(false);
    const [isWidgetChromeSuppressed, setIsWidgetChromeSuppressed] = useState(false);
    const isSettingsPending = context.actionKind === "unknown";

    useEffect(() => {
        if (!isSettingsPending) {
            setCanShowPendingNotice(false);
            return;
        }

        const timeoutId = globalThis.setTimeout(() => {
            setCanShowPendingNotice(true);
        }, WIDGET_SETTINGS_PENDING_NOTICE_DELAY_MS);

        return () => {
            globalThis.clearTimeout(timeoutId);
        };
    }, [isSettingsPending]);

    useEffect(() => {
        setIsWidgetChromeSuppressed(false);
    }, [context.actionKind]);

    if (isSettingsPending) {
        return canShowPendingNotice
            ? (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(widgetMessages.loadingWidgetSettings)}</p>
                </InspectorItem>
            )
            : <></>;
    }

    const panelProps = {
        context,
        onSettingsPatch,
        onGlobalSettingsPatch,
        onCustomHttpCredentialUpsert,
        onCustomHttpCredentialDelete,
        onWidgetChromeSuppressionChange: setIsWidgetChromeSuppressed,
        viewDisabled: isGlobalViewOverrideEnabled,
        themeDisabled: isGlobalThemeOverrideEnabled,
        transparentSurfaceDisabled: isGlobalTransparentSurfaceOverrideEnabled,
        colorDisabled: isGlobalPaintOverrideEnabled,
    };
    const hasGlobalOverride = isGlobalViewOverrideEnabled
        || isGlobalThemeOverrideEnabled
        || isGlobalTransparentSurfaceOverrideEnabled
        || isGlobalPaintOverrideEnabled;
    const canShowMetricSourceDiagnostic = context.resolved.widget.widgetKind === "singleMetric"
        || context.resolved.widget.widgetKind === "hardwareSummary";

    return (
        <>
            {hasGlobalOverride && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(widgetMessages.globalOverrideDisabledNote)}</p>
                </InspectorItem>
            )}
            {renderMetricPanel(panelProps)}
            {!isWidgetChromeSuppressed && (
                <>
                    <SettingsSection title={t(commonMessages.advancedSection)}>
                        <ColorCompensationControls
                            profile={colorCompensationProfile}
                            onOpenColorCompensation={onOpenColorCompensation}
                        />
                        <InspectorItem className="widget-reset-item" label={t(commonMessages.resetLabel)}>
                            <div className="advanced-action-stack">
                                <button
                                    className="inline-action-button"
                                    type="button"
                                    onClick={onResetWidgetSettings}
                                >
                                    {t(widgetMessages.resetWidgetSettingsButton)}
                                </button>
                            </div>
                        </InspectorItem>
                    </SettingsSection>
                    {canShowMetricSourceDiagnostic && (
                        <MetricSourceDiagnostic
                            trace={context.runtimeCache.displayedMetricReadTrace}
                        />
                    )}
                </>
            )}
        </>
    );
}

function renderMetricPanel(
    panelProps: {
        context: VisibilityContext;
        onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
        onGlobalSettingsPatch?: ((patch: StoredGlobalSettingsPatch) => void) | undefined;
        onWidgetChromeSuppressionChange?: ((isSuppressed: boolean) => void) | undefined;
        viewDisabled: boolean;
        themeDisabled: boolean;
        transparentSurfaceDisabled: boolean;
        colorDisabled: boolean;
    },
): React.JSX.Element {
    const actionKind = panelProps.context.actionKind;
    if (panelProps.context.resolved.widget.widgetKind === "denseMultiMetric") {
        return actionKind === "denseMultiMetric"
            ? <DenseMultiMetricWidgetSettings {...panelProps} widget={panelProps.context.resolved.widget} />
            : <DomainMismatchNotice />;
    }

    if (panelProps.context.resolved.widget.widgetKind === "stackedMetric") {
        return actionKind === "stackedMetric"
            ? <StackedMetricWidgetSettings {...panelProps} widget={panelProps.context.resolved.widget} />
            : <DomainMismatchNotice />;
    }

    if (panelProps.context.resolved.widget.widgetKind === "hardwareSummary") {
        const target = panelProps.context.resolved.widget.target;
        return actionKind === target.domain
            ? <HardwareSummaryWidgetSettings {...panelProps} widget={panelProps.context.resolved.widget} />
            : <DomainMismatchNotice />;
    }

    if (panelProps.context.resolved.widget.widgetKind !== "singleMetric") {
        return <DomainMismatchNotice />;
    }

    const target = panelProps.context.resolved.widget.slot.metric.target;

    if (actionKind !== target.domain) {
        return <DomainMismatchNotice />;
    }

    return <SingleMetricWidgetSettings {...panelProps} target={target} />;
}

function DomainMismatchNotice(): React.JSX.Element {
    const { t } = useI18n();

    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">
                {t(widgetMessages.domainMismatchNotice)}
            </p>
        </InspectorItem>
    );
}
