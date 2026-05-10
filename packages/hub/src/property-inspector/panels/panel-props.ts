import type { WidgetSettings } from "../../settings/widget-settings";
import type { VisibilityContext } from "../inspector/types";

export interface WidgetSettingsPanelProps {
    context: VisibilityContext;
    onSettingsPatch: (patch: WidgetSettings) => void;
    appearanceDisabled?: boolean;
}
