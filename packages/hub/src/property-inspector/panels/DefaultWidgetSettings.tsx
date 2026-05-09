import { StandardColorSettings } from "./ColorSettings";
import { LayoutSettings } from "./LayoutSettings";
import { PollingSettings } from "./PollingSettings";
import { SparklineSettings } from "./SparklineSettings";
import type { WidgetSettingsPanelProps as PanelProps } from "./panel-props";

export function DefaultWidgetSettings(props: PanelProps): React.JSX.Element {
    return (
        <>
            <LayoutSettings {...props} />
            <SparklineSettings {...props} />
            <StandardColorSettings {...props} />
            <PollingSettings {...props} />
        </>
    );
}
