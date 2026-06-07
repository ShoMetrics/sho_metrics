import { useEffect, useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import { commonMessages } from "../../i18n/message-groups/shell";
import { widgetMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import type { StoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import type { VisibilityContext } from "../inspector/types";
import type { ColorCompensationProfile } from "../../color-compensation/types";
import { ColorCompensationControls } from "./ColorCompensationControls";
import { CpuWidgetSettings } from "./CpuWidgetSettings";
import { CatalogMetricWidgetSettings } from "./CatalogMetricWidgetSettings";
import { DefaultWidgetSettings } from "./DefaultWidgetSettings";
import { DenseMultiMetricWidgetSettings } from "./DenseMultiMetricWidgetSettings";
import { DiskWidgetSettings } from "./DiskWidgetSettings";
import { GpuWidgetSettings } from "./GpuWidgetSettings";
import { MetricSourceDiagnostic } from "./MetricSourceDiagnostic";
import { NetworkWidgetSettings } from "./NetworkWidgetSettings";
import { SettingsSection } from "./SettingsSection";

interface WidgetSettingsTabProps {
    context: VisibilityContext;
    isGlobalViewOverrideEnabled: boolean;
    isGlobalThemeOverrideEnabled: boolean;
    isGlobalTransparentSurfaceOverrideEnabled: boolean;
    isGlobalPaintOverrideEnabled: boolean;
    colorCompensationProfile: ColorCompensationProfile;
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
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
    onResetWidgetSettings,
    onOpenColorCompensation,
}: WidgetSettingsTabProps): React.JSX.Element {
    const { t } = useI18n();
    const [canShowPendingNotice, setCanShowPendingNotice] = useState(false);
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
        viewDisabled: isGlobalViewOverrideEnabled,
        themeDisabled: isGlobalThemeOverrideEnabled,
        transparentSurfaceDisabled: isGlobalTransparentSurfaceOverrideEnabled,
        colorDisabled: isGlobalPaintOverrideEnabled,
    };
    const hasGlobalOverride = isGlobalViewOverrideEnabled
        || isGlobalThemeOverrideEnabled
        || isGlobalTransparentSurfaceOverrideEnabled
        || isGlobalPaintOverrideEnabled;

    return (
        <>
            {hasGlobalOverride && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(widgetMessages.globalOverrideDisabledNote)}</p>
                </InspectorItem>
            )}
            {renderMetricPanel(panelProps)}
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
            <MetricSourceDiagnostic
                attribution={context.runtimeCache.displayedMetricReadAttribution}
            />
        </>
    );
}

function renderMetricPanel(
    panelProps: {
        context: VisibilityContext;
        onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
        viewDisabled: boolean;
        themeDisabled: boolean;
        colorDisabled: boolean;
    },
): React.JSX.Element {
    const actionKind = panelProps.context.actionKind;
    if (panelProps.context.resolved.widget.widgetKind === "denseMultiMetric") {
        return actionKind === "denseMultiMetric"
            ? <DenseMultiMetricWidgetSettings {...panelProps} widget={panelProps.context.resolved.widget} />
            : <DomainMismatchNotice />;
    }

    if (panelProps.context.resolved.widget.widgetKind !== "singleMetric") {
        return <DomainMismatchNotice />;
    }

    const target = panelProps.context.resolved.widget.slot.metric.target;

    if (actionKind !== target.domain) {
        return <DomainMismatchNotice />;
    }

    switch (target.domain) {
        case "network":
            return <NetworkWidgetSettings {...panelProps} target={target} />;
        case "disk":
            return <DiskWidgetSettings {...panelProps} target={target} />;
        case "gpu":
            return <GpuWidgetSettings {...panelProps} target={target} />;
        case "cpu":
            return <CpuWidgetSettings {...panelProps} target={target} />;
        case "catalog":
            return <CatalogMetricWidgetSettings {...panelProps} target={target} />;
        case "memory":
            return <DefaultWidgetSettings {...panelProps} />;
    }
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
