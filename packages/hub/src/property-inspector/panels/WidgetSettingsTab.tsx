import { InspectorItem } from "../components/InspectorItem";
import type { StoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import type { VisibilityContext } from "../inspector/types";
import { DefaultWidgetSettings } from "./DefaultWidgetSettings";
import { DiskWidgetSettings } from "./DiskWidgetSettings";
import { GpuWidgetSettings } from "./GpuWidgetSettings";
import { NetworkWidgetSettings } from "./NetworkWidgetSettings";

interface WidgetSettingsTabProps {
    context: VisibilityContext;
    isGlobalAppearanceOverrideEnabled: boolean;
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
    onResetWidgetSettings: () => void;
}

export function WidgetSettingsTab({
    context,
    isGlobalAppearanceOverrideEnabled,
    onSettingsPatch,
    onResetWidgetSettings,
}: WidgetSettingsTabProps): React.JSX.Element {
    const panelProps = {
        context,
        onSettingsPatch,
        appearanceDisabled: isGlobalAppearanceOverrideEnabled,
    };

    return (
        <>
            <InspectorItem className="widget-reset-item">
                <button
                    className="inline-action-button"
                    type="button"
                    onClick={onResetWidgetSettings}
                >
                    Reset Widget Settings
                </button>
            </InspectorItem>
            {isGlobalAppearanceOverrideEnabled && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">Some settings are disabled since global override is enabled.</p>
                </InspectorItem>
            )}
            {renderMetricPanel(panelProps)}
        </>
    );
}

function renderMetricPanel(
    panelProps: {
        context: VisibilityContext;
        onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
        appearanceDisabled: boolean;
    },
): React.JSX.Element {
    const target = panelProps.context.resolved.widget.slot.metric.target;

    switch (target.domain) {
        case "network":
            return <NetworkWidgetSettings {...panelProps} target={target} />;
        case "disk":
            return <DiskWidgetSettings {...panelProps} target={target} />;
        case "gpu":
            return <GpuWidgetSettings {...panelProps} />;
        case "cpu":
        case "memory":
        case "catalog":
            return <DefaultWidgetSettings {...panelProps} />;
    }
}
