import type { ResolvedMetricTarget } from "../../../settings/resolved-settings";
import { CUSTOM_HTTP_SINGLE_CONSUMER_SLUG } from "../../../runtime/sources/custom-http/custom-http-metric-key";
import { CatalogMetricWidgetSettings } from "../metric-targets/CatalogMetricWidgetSettings";
import { CpuWidgetSettings } from "../metric-targets/CpuWidgetSettings";
import { CustomMetricWidgetSettings } from "../metric-targets/CustomMetricWidgetSettings";
import { DefaultWidgetSettings } from "./DefaultWidgetSettings";
import { DiskWidgetSettings } from "../metric-targets/DiskWidgetSettings";
import { GpuWidgetSettings } from "../metric-targets/GpuWidgetSettings";
import { NetworkWidgetSettings } from "../metric-targets/NetworkWidgetSettings";
import { SystemWidgetSettings } from "../metric-targets/SystemWidgetSettings";
import type { WidgetSettingsPanelProps } from "../panel-props";

export function SingleMetricWidgetSettings(props: WidgetSettingsPanelProps & {
    target: ResolvedMetricTarget;
    readonly customHttpConsumerSlug?: string | undefined;
}): React.JSX.Element {
    switch (props.target.domain) {
        case "network":
            return <NetworkWidgetSettings {...props} target={props.target} />;
        case "disk":
            return <DiskWidgetSettings {...props} target={props.target} />;
        case "gpu":
            return <GpuWidgetSettings {...props} target={props.target} />;
        case "cpu":
            return <CpuWidgetSettings {...props} target={props.target} />;
        case "catalog":
            return <CatalogMetricWidgetSettings {...props} target={props.target} />;
        case "customMetric":
            return (
                <CustomMetricWidgetSettings
                    {...props}
                    target={props.target}
                    customHttpConsumerSlug={props.customHttpConsumerSlug ?? CUSTOM_HTTP_SINGLE_CONSUMER_SLUG}
                />
            );
        case "memory":
            return <DefaultWidgetSettings {...props} />;
        case "system":
            return <SystemWidgetSettings {...props} target={props.target} />;
    }
}
