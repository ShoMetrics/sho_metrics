import type { InspectorSettingTarget, VisibilityContext } from "../types";

export interface WidgetSettingsPanelProps {
    context: VisibilityContext;
    onSettingChange: (target: InspectorSettingTarget, value: string) => void;
    appearanceDisabled?: boolean;
}
