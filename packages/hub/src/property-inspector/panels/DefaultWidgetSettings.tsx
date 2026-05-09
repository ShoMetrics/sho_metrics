import {
    LayoutSettings,
    PollingSettings,
    SparklineSettings,
    StandardColorSettings,
    type WidgetSettingsPanelProps,
} from "./CommonSettings";

export function DefaultWidgetSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <LayoutSettings {...props} />
            <SparklineSettings {...props} />
            <StandardColorSettings {...props} />
            <PollingSettings {...props} />
        </>
    );
}
