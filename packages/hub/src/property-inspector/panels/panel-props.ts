import type { InspectorControlValue, InspectorSettingTarget, VisibilityContext } from "../types";

export interface WidgetSettingsPanelProps {
    context: VisibilityContext;
    onSettingChange: (target: InspectorSettingTarget, value: InspectorControlValue) => void;
    appearanceDisabled?: boolean;
}
