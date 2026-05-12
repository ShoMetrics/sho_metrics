import type { StoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import type { VisibilityContext } from "../inspector/types";

export interface WidgetSettingsPanelProps {
    context: VisibilityContext;
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
    appearanceDisabled?: boolean;
}
