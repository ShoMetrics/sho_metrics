import type { ResolvedCustomMetricTarget } from "../../../../settings/resolved-settings";
import type {
    CustomHttpSourceEditorBlockedRedirect,
    CustomHttpSourceEditorPromptSample,
} from "../../../../runtime/sources/custom-http/custom-http-source-editor-messages";
import type { WidgetSettingsPanelProps } from "../../panel-props";

export type CustomMetricSourceEditorSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedCustomMetricTarget;
    /**
     * Runtime consumer segment used to isolate single, Dense row, and Stacked slot
     * Custom HTTP editor checks and metric keys within one Stream Deck action.
     */
    readonly customHttpConsumerSlug: string;
};

export type CustomMetricSourceEditorPageProps = CustomMetricSourceEditorSettingsProps & {
    readonly onBack: () => void;
};

export type CustomMetricWidgetSettingsProps = CustomMetricSourceEditorSettingsProps;

export type SourceEditorCommand = "fetchSample" | "testTransform";

export interface SampleState {
    readonly url: string;
    readonly responseBytes: number;
    readonly elapsedMilliseconds: number;
    readonly samplePreview: string;
    readonly isSamplePreviewTruncated: boolean;
    readonly promptSample: CustomHttpSourceEditorPromptSample;
}

export interface MetricPreview {
    readonly label: string;
    readonly value: number;
    readonly unitText: string;
    readonly maximum?: number;
    readonly suggestedLucideIconId?: string;
}

export interface ExplorationOutputPreview {
    readonly text: string;
    readonly schemaFailureDetail: string;
}

export type SourceEditorState =
    | { readonly kind: "idle" }
    | { readonly kind: "pending"; readonly command: SourceEditorCommand; readonly sample?: SampleState }
    | { readonly kind: "sampleReady"; readonly sample: SampleState }
    | { readonly kind: "metricReady"; readonly sample: SampleState; readonly metric: MetricPreview }
    | { readonly kind: "explorationReady"; readonly sample: SampleState; readonly explorationOutput: ExplorationOutputPreview }
    | {
        readonly kind: "failed";
        readonly command: SourceEditorCommand;
        readonly stage: string;
        readonly detail: string;
        readonly blockedRedirect?: CustomHttpSourceEditorBlockedRedirect | undefined;
        readonly sample?: SampleState;
    };
