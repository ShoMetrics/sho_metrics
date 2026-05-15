import type { StoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import type { VisibilityContext } from "../inspector/types";

export interface WidgetSettingsPanelProps {
    context: VisibilityContext;
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
    graphDisabled?: boolean | undefined;
    themeDisabled?: boolean | undefined;
    colorDisabled?: boolean | undefined;
}
