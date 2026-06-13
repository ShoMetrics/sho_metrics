import type { ResolvedCustomMetricTarget } from "../../../settings/resolved-settings";
import type { WidgetSettingsPanelProps } from "../panel-props";

export type CustomMetricWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedCustomMetricTarget;
    /**
     * Runtime consumer segment used to isolate single, Dense row, and Stacked slot
     * Custom HTTP editor checks and metric keys within one Stream Deck action.
     */
    readonly customHttpConsumerSlug: string;
    /** Whether this panel should open directly into HTTP source editing. */
    readonly initiallyEditingSource?: boolean | undefined;
    /** Handles the HTTP source editor back action when an outer owner provides the drill-in page. */
    readonly onSourceEditorBack?: (() => void) | undefined;
    /**
     * Whether to show widget-owned visual controls.
     *
     * Dense rows reuse this panel only for Custom HTTP source editing; their
     * row visuals stay owned by Dense row settings.
     */
    readonly showVisualSettings?: boolean | undefined;
};

export type SourceEditorCommand = "fetchSample" | "testTransform";
export type CopyStatus = "idle" | "copied" | "failed";

export interface SampleState {
    readonly url: string;
    readonly responseBytes: number;
    readonly elapsedMilliseconds: number;
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

export type SourceEditorState =
    | { readonly kind: "idle" }
    | { readonly kind: "pending"; readonly command: SourceEditorCommand; readonly sample?: SampleState }
    | { readonly kind: "sampleReady"; readonly sample: SampleState }
    | { readonly kind: "metricReady"; readonly sample: SampleState; readonly metric: MetricPreview }
    | {
        readonly kind: "failed";
        readonly command: SourceEditorCommand;
        readonly stage: string;
        readonly detail: string;
        readonly sample?: SampleState;
    };
