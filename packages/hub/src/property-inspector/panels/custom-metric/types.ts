import type { ResolvedCustomMetricTarget } from "../../../settings/resolved-settings";
import type { WidgetSettingsPanelProps } from "../panel-props";

export type CustomMetricWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedCustomMetricTarget;
};

export type TestCommand = "fetchSample" | "testTransform";
export type CopyStatus = "idle" | "copied" | "failed";

export interface SampleState {
    readonly url: string;
    readonly responseBytes: number;
    readonly samplePreview: string;
    readonly isSamplePreviewTruncated: boolean;
}

export interface MetricPreview {
    readonly label: string;
    readonly value: number;
    readonly unitText: string;
    readonly maximum?: number;
    readonly suggestedLucideIconId?: string;
}

export type TestState =
    | { readonly kind: "idle" }
    | { readonly kind: "pending"; readonly command: TestCommand; readonly sample?: SampleState }
    | { readonly kind: "sampleReady"; readonly sample: SampleState }
    | { readonly kind: "metricReady"; readonly sample: SampleState; readonly metric: MetricPreview }
    | {
        readonly kind: "failed";
        readonly command: TestCommand;
        readonly stage: string;
        readonly detail: string;
        readonly sample?: SampleState;
    };
