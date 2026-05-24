import { useEffect, useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { StoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import type { VisibilityContext } from "../inspector/types";
import type { ColorCompensationProfile } from "../../color-compensation/types";
import { ColorCompensationControls } from "./ColorCompensationControls";
import { CpuWidgetSettings } from "./CpuWidgetSettings";
import { DefaultWidgetSettings } from "./DefaultWidgetSettings";
import { DiskWidgetSettings } from "./DiskWidgetSettings";
import { GpuWidgetSettings } from "./GpuWidgetSettings";
import { MetricSourceDiagnostic } from "./MetricSourceDiagnostic";
import { NetworkWidgetSettings } from "./NetworkWidgetSettings";
import { SettingsSection } from "./SettingsSection";

interface WidgetSettingsTabProps {
    context: VisibilityContext;
    isGlobalViewOverrideEnabled: boolean;
    isGlobalThemeOverrideEnabled: boolean;
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
    isGlobalPaintOverrideEnabled,
    colorCompensationProfile,
    onSettingsPatch,
    onResetWidgetSettings,
    onOpenColorCompensation,
}: WidgetSettingsTabProps): React.JSX.Element {
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
                    <p className="section-note">Loading widget settings...</p>
                </InspectorItem>
            )
            : <></>;
    }

    const panelProps = {
        context,
        onSettingsPatch,
        viewDisabled: isGlobalViewOverrideEnabled,
        themeDisabled: isGlobalThemeOverrideEnabled,
        colorDisabled: isGlobalPaintOverrideEnabled,
    };
    const hasGlobalOverride = isGlobalViewOverrideEnabled
        || isGlobalThemeOverrideEnabled
        || isGlobalPaintOverrideEnabled;

    return (
        <>
            {hasGlobalOverride && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">Some settings are disabled since global override is enabled.</p>
                </InspectorItem>
            )}
            {renderMetricPanel(panelProps)}
            <SettingsSection title="Advanced">
                <ColorCompensationControls
                    profile={colorCompensationProfile}
                    onOpenColorCompensation={onOpenColorCompensation}
                />
                <InspectorItem className="widget-reset-item" label="Reset">
                    <div className="advanced-action-stack">
                        <button
                            className="inline-action-button"
                            type="button"
                            onClick={onResetWidgetSettings}
                        >
                            Reset Widget Settings
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
        case "memory":
            return <DefaultWidgetSettings {...panelProps} />;
    }
}

function DomainMismatchNotice(): React.JSX.Element {
    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">
                Stored metric settings do not match this action. Reset widget settings to continue.
            </p>
        </InspectorItem>
    );
}
