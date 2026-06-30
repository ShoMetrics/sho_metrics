import { StandardColorSettings } from "../controls/ColorSettings";
import { AppearanceSettings } from "../controls/AppearanceSettings";
import { PollingSettings } from "../controls/PollingSettings";
import { LineSettings } from "../controls/LineSettings";
import type { WidgetSettingsPanelProps as PanelProps } from "../panel-props";

export function DefaultWidgetSettings(props: PanelProps): React.JSX.Element {
    return (
        <>
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            <StandardColorSettings {...props} />
            {props.showPolling !== false && <PollingSettings {...props} />}
        </>
    );
}
