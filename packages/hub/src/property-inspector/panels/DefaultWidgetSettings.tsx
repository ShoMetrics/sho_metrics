import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import type { WidgetSettingsPanelProps as PanelProps } from "./panel-props";

export function DefaultWidgetSettings(props: PanelProps): React.JSX.Element {
    return (
        <>
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            <StandardColorSettings {...props} />
            <PollingSettings {...props} />
        </>
    );
}
