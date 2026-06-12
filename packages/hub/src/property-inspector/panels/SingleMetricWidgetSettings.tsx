import type { ResolvedMetricTarget } from "../../settings/resolved-settings";
import { CatalogMetricWidgetSettings } from "./CatalogMetricWidgetSettings";
import { CpuWidgetSettings } from "./CpuWidgetSettings";
import { CustomMetricWidgetSettings } from "./CustomMetricWidgetSettings";
import { DefaultWidgetSettings } from "./DefaultWidgetSettings";
import { DiskWidgetSettings } from "./DiskWidgetSettings";
import { GpuWidgetSettings } from "./GpuWidgetSettings";
import { NetworkWidgetSettings } from "./NetworkWidgetSettings";
import type { WidgetSettingsPanelProps } from "./panel-props";

export function SingleMetricWidgetSettings(props: WidgetSettingsPanelProps & {
    target: ResolvedMetricTarget;
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
            return <CustomMetricWidgetSettings {...props} target={props.target} />;
        case "memory":
            return <DefaultWidgetSettings {...props} />;
    }
}
