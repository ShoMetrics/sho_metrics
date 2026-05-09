import { InspectorItem } from "../components/InspectorItem";
import type { InspectorSettingTarget, VisibilityContext } from "../schema";
import type { ActionKind } from "../settings";
import { DefaultWidgetSettings } from "./DefaultWidgetSettings";
import { DiskWidgetSettings } from "./DiskWidgetSettings";
import { GpuWidgetSettings } from "./GpuWidgetSettings";
import { NetworkWidgetSettings } from "./NetworkWidgetSettings";

interface WidgetSettingsTabProps {
    actionKind: ActionKind;
    context: VisibilityContext;
    isGlobalAppearanceOverrideEnabled: boolean;
    onSettingChange: (target: InspectorSettingTarget, value: string) => void;
    onResetWidgetSettings: () => void;
}

export function WidgetSettingsTab({
    actionKind,
    context,
    isGlobalAppearanceOverrideEnabled,
    onSettingChange,
    onResetWidgetSettings,
}: WidgetSettingsTabProps): React.JSX.Element {
    const panelProps = {
        context,
        onSettingChange,
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
            {renderActionPanel(actionKind, panelProps)}
        </>
    );
}

function renderActionPanel(
    actionKind: ActionKind,
    panelProps: {
        context: VisibilityContext;
        onSettingChange: (target: InspectorSettingTarget, value: string) => void;
        appearanceDisabled: boolean;
    },
): React.JSX.Element | null {
    if (actionKind === "net-speed") {
        return <NetworkWidgetSettings {...panelProps} />;
    }

    if (actionKind === "disk") {
        return <DiskWidgetSettings {...panelProps} />;
    }

    if (actionKind === "gpu-temp" || actionKind === "gpu-power") {
        return <GpuWidgetSettings {...panelProps} actionKind={actionKind} />;
    }

    if (
        actionKind === "cpu-usage"
        || actionKind === "ram"
        || actionKind === "gpu-usage"
        || actionKind === "gpu-vram"
    ) {
        return <DefaultWidgetSettings {...panelProps} />;
    }

    return null;
}
