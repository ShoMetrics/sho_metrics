import {
    useEffect,
    useRef,
    useState,
} from "react";
import { customMetricMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import {
    readCustomHttpPiTestResponse,
} from "../../runtime/sources/custom-http/custom-http-pi-test-messages";
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
    applyTestResponse,
} from "./custom-metric/test-state";
import type {
    CopyStatus,
    CustomMetricWidgetSettingsProps,
    TestCommand,
    TestState,
} from "./custom-metric/types";

export function CustomMetricWidgetSettings(props: CustomMetricWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const client = useStreamDeckClient();
    const request = readCustomMetricRequest(props.target);
    const url = request?.url ?? "";
    const userIntent = request?.userIntent ?? "";
    const jqTransform = request?.jqTransform ?? "";
    const requestSettings = request?.requestSettings ?? resolveCustomHttpFetchPolicy({});
    const [isEditingSource, setIsEditingSource] = useState(false);
    const [testState, setTestState] = useState<TestState>({ kind: "idle" });
    const [promptCopyStatus, setPromptCopyStatus] = useState<CopyStatus>("idle");
    const pendingRequestIds = useRef(new Map<string, TestCommand>());

    useEffect(() => {
        setTestState({ kind: "idle" });
        pendingRequestIds.current.clear();
    }, [url]);

    useEffect(() => {
        props.onWidgetChromeSuppressionChange?.(isEditingSource);

        return () => {
            props.onWidgetChromeSuppressionChange?.(false);
        };
    }, [isEditingSource, props.onWidgetChromeSuppressionChange]);

    useEffect(() => client.sendToPropertyInspector.subscribe((event) => {
        const response = readCustomHttpPiTestResponse(event.payload);
        if (response === undefined || pendingRequestIds.current.get(response.requestId) !== response.command) {
            return;
        }

        pendingRequestIds.current.delete(response.requestId);
        setTestState(previousState => applyTestResponse(previousState, url, response));
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
                testState={testState}
                promptCopyStatus={promptCopyStatus}
                pendingRequestIds={pendingRequestIds}
                setTestState={setTestState}
                setPromptCopyStatus={setPromptCopyStatus}
                onBack={() => setIsEditingSource(false)}
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
            {props.target.configuration.state === "configured" && (
                <CustomMetricIconSettings
                    iconId={props.target.iconId}
                    onIconIdChange={(iconId) => props.onSettingsPatch({
                        customMetric: { iconId },
                    })}
                />
            )}
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            <StandardColorSettings {...props} />
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
