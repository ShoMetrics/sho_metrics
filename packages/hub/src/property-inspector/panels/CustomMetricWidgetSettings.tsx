import {
    useEffect,
    useRef,
    useState,
} from "react";
import { customMetricMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import {
    readCustomHttpSourceEditorResponse,
} from "../../runtime/sources/custom-http/custom-http-source-editor-messages";
import { resolveCustomHttpFetchPolicy } from "../../runtime/sources/custom-http/custom-http-request-policy";
import type {
    ResolvedCustomMetricSource,
    ResolvedSingleCustomHttpRequest,
} from "../../settings/resolved-settings";
import { useStreamDeckClient } from "../stream-deck/stream-deck-client-context";
import { InspectorItem } from "../components/InspectorItem";
import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import { customHttpPollingFrequencyOptionList } from "./setting-options";
import { CustomMetricIconSettings } from "./custom-metric/CustomMetricIconSettings";
import { CustomMetricSourceEditor } from "./custom-metric/CustomMetricSourceEditor";
import {
    applySourceEditorResponse,
} from "./custom-metric/source-editor-state";
import type {
    CopyStatus,
    CustomMetricWidgetSettingsProps,
    SourceEditorCommand,
    SourceEditorState,
} from "./custom-metric/types";

export function CustomMetricWidgetSettings(props: CustomMetricWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const client = useStreamDeckClient();
    const request = readCustomMetricRequest(props.target);
    const url = request?.url ?? "";
    const userIntent = request?.userIntent ?? "";
    const jqTransform = request?.jqTransform ?? "";
    const requestSettings = request?.requestSettings ?? resolveCustomHttpFetchPolicy({});
    const showVisualSettings = props.showVisualSettings !== false;
    const [isEditingSource, setIsEditingSource] = useState(props.initiallyEditingSource === true);
    const [sourceEditorState, setSourceEditorState] = useState<SourceEditorState>({ kind: "idle" });
    const [promptCopyStatus, setPromptCopyStatus] = useState<CopyStatus>("idle");
    const pendingRequestIds = useRef(new Map<string, SourceEditorCommand>());

    useEffect(() => {
        setSourceEditorState({ kind: "idle" });
        pendingRequestIds.current.clear();
    }, [url]);

    useEffect(() => {
        props.onWidgetChromeSuppressionChange?.(isEditingSource);

        return () => {
            props.onWidgetChromeSuppressionChange?.(false);
        };
    }, [isEditingSource, props.onWidgetChromeSuppressionChange]);

    useEffect(() => client.sendToPropertyInspector.subscribe((event) => {
        const response = readCustomHttpSourceEditorResponse(event.payload);
        if (response === undefined || pendingRequestIds.current.get(response.requestId) !== response.command) {
            return;
        }

        pendingRequestIds.current.delete(response.requestId);
        setSourceEditorState(previousState => applySourceEditorResponse(previousState, url, response));
    }), [client, url]);

    if (isEditingSource) {
        return (
            <CustomMetricSourceEditor
                {...props}
                url={url}
                userIntent={userIntent}
                jqTransform={jqTransform}
                requestSettings={requestSettings}
                client={client}
                sourceEditorState={sourceEditorState}
                promptCopyStatus={promptCopyStatus}
                pendingRequestIds={pendingRequestIds}
                setSourceEditorState={setSourceEditorState}
                setPromptCopyStatus={setPromptCopyStatus}
                onBack={props.onSourceEditorBack ?? (() => setIsEditingSource(false))}
            />
        );
    }

    return (
        <>
            <SettingsSection title={t(customMetricMessages.sourceSection)}>
                <InspectorItem label={t(customMetricMessages.sourceSummaryLabel)}>
                    <div className="advanced-action-stack">
                        <button
                            className="inline-action-button"
                            type="button"
                            onClick={() => setIsEditingSource(true)}
                        >
                            {t(customMetricMessages.editSourceButton)}
                        </button>
                        <p className="section-note">
                            {props.target.configuration.state === "configured"
                                ? t(customMetricMessages.sourceConfiguredSummary)
                                : t(customMetricMessages.sourceNeedsSetupSummary)}
                        </p>
                    </div>
                </InspectorItem>
            </SettingsSection>
            {showVisualSettings && props.target.configuration.state === "configured" && (
                <CustomMetricIconSettings
                    iconId={props.target.iconId}
                    onIconIdChange={(iconId) => props.onSettingsPatch({
                        customMetric: { iconId },
                    })}
                />
            )}
            {showVisualSettings && (
                <>
                    <AppearanceSettings {...props} />
                    <LineSettings {...props} />
                    <StandardColorSettings {...props} />
                </>
            )}
            {props.showPolling !== false && (
                <PollingSettings
                    {...props}
                    optionList={customHttpPollingFrequencyOptionList}
                />
            )}
        </>
    );
}

function readCustomMetricRequest(
    target: CustomMetricWidgetSettingsProps["target"],
): ResolvedSingleCustomHttpRequest | undefined {
    const configuration = target.configuration;
    return configuration.state === "unconfigured"
        ? undefined
        : readSingleHttpRequest(configuration.source);
}

function readSingleHttpRequest(source: ResolvedCustomMetricSource): ResolvedSingleCustomHttpRequest | undefined {
    return source.kind === "http" && source.plan.kind === "singleRequest"
        ? source.plan.request
        : undefined;
}
