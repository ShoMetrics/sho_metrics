import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import { customMetricMessages } from "../../../i18n/message-groups/widgets";
import { useI18n } from "../../../i18n/react";
import {
    CUSTOM_HTTP_FETCH_RETRY_COUNT,
    CUSTOM_HTTP_FETCH_TIMEOUT_MILLISECONDS,
    CUSTOM_HTTP_RESPONSE_LIMIT_BYTES,
} from "../../../runtime/sources/custom-http/custom-http-fetch-limits";
import type { StreamDeckPropertyInspectorClient } from "../../stream-deck/stream-deck-client";
import { InspectorItem } from "../../components/InspectorItem";
import { TextAreaSetting } from "../../controls/TextAreaSetting";
import { TextSetting } from "../../controls/TextSetting";
import { SettingsSection } from "../SettingsSection";
import { buildCustomMetricPrompt } from "./prompt";
import {
    hasCurrentSample,
    readSampleState,
    sendFetchSampleRequest,
    sendTransformTestRequest,
} from "./test-state";
import type {
    CopyStatus,
    CustomMetricWidgetSettingsProps,
    TestCommand,
    TestState,
} from "./types";

export function CustomMetricSourceEditor({
    url,
    userIntent,
    jqTransform,
    client,
    testState,
    promptCopyStatus,
    pendingRequestIds,
    setTestState,
    setPromptCopyStatus,
    onBack,
    ...props
}: CustomMetricWidgetSettingsProps & {
    readonly url: string;
    readonly userIntent: string;
    readonly jqTransform: string;
    readonly client: StreamDeckPropertyInspectorClient;
    readonly testState: TestState;
    readonly promptCopyStatus: CopyStatus;
    readonly pendingRequestIds: RefObject<Map<string, TestCommand>>;
    readonly setTestState: Dispatch<SetStateAction<TestState>>;
    readonly setPromptCopyStatus: Dispatch<SetStateAction<CopyStatus>>;
    readonly onBack: () => void;
}): React.JSX.Element {
    const { locale, t } = useI18n();
    const hasSample = hasCurrentSample(testState, url);
    const [userIntentDraft, setUserIntentDraft] = useState(userIntent);
    const lastSettingsUserIntentRef = useRef(userIntent);
    const fetchSampleButtonRef = useRef<HTMLButtonElement | null>(null);
    const promptText = useMemo(() => buildCustomMetricPrompt({
        locale,
        userIntent: userIntentDraft,
        sample: readSampleState(testState),
    }), [locale, userIntentDraft, testState]);

    useEffect(() => {
        if (userIntent !== lastSettingsUserIntentRef.current) {
            setUserIntentDraft(userIntent);
            lastSettingsUserIntentRef.current = userIntent;
        }
    }, [userIntent]);

    return (
        <>
            <SettingsSection title={t(customMetricMessages.editSourceSection)}>
                <InspectorItem>
                    <div className="advanced-action-stack">
                        <button
                            className="inline-action-button"
                            type="button"
                            onClick={onBack}
                        >
                            {t(customMetricMessages.backToWidgetButton)}
                        </button>
                    </div>
                </InspectorItem>
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(customMetricMessages.editSourceNote)}</p>
                </InspectorItem>
                <TextSetting
                    label={t(customMetricMessages.urlLabel)}
                    value={url}
                    placeholder={t(customMetricMessages.urlPlaceholder)}
                    validationMessage={resolveUrlValidationMessage(props.target, t)}
                    onValueChange={(nextUrl) => props.onSettingsPatch({
                        customMetric: { url: nextUrl },
                    })}
                />
                <TextAreaSetting
                    label={t(customMetricMessages.userIntentLabel)}
                    value={userIntentDraft}
                    placeholder={t(customMetricMessages.userIntentPlaceholder)}
                    rows={3}
                    hint={t(customMetricMessages.userIntentHint)}
                    onValueChange={(nextUserIntent) => {
                        setUserIntentDraft(nextUserIntent);
                        const nextStoredUserIntent = nextUserIntent.trim().length === 0
                            ? undefined
                            : nextUserIntent;
                        lastSettingsUserIntentRef.current = nextStoredUserIntent ?? "";
                        props.onSettingsPatch({
                            customMetric: { userIntent: nextStoredUserIntent },
                        });
                    }}
                />
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(customMetricMessages.noSecretsNote)}</p>
                </InspectorItem>
                <InspectorItem>
                    <div className="advanced-action-stack">
                        <button
                            ref={fetchSampleButtonRef}
                            className="inline-action-button"
                            type="button"
                            disabled={url.trim().length === 0 || testState.kind === "pending"}
                            onClick={() => sendFetchSampleRequest(client, url, pendingRequestIds, setTestState)}
                        >
                            {t(customMetricMessages.fetchSampleButton)}
                        </button>
                        <TestStatusNote state={testState} command="fetchSample" />
                        <p className="section-note">
                            {t(customMetricMessages.fetchLimitsNote, {
                                timeoutSeconds: CUSTOM_HTTP_FETCH_TIMEOUT_MILLISECONDS / 1000,
                                retryCount: CUSTOM_HTTP_FETCH_RETRY_COUNT,
                                responseLimitKiB: CUSTOM_HTTP_RESPONSE_LIMIT_BYTES / 1024,
                            })}
                        </p>
                    </div>
                </InspectorItem>
                <FailureDetails state={testState} command="fetchSample" />
                <SamplePreview state={testState} />
            </SettingsSection>
            <SettingsSection title={t(customMetricMessages.resultSection)}>
                <TextAreaSetting
                    label={t(customMetricMessages.promptLabel)}
                    value={promptText}
                    rows={10}
                    readOnly
                    hint={t(hasSample
                        ? customMetricMessages.promptHint
                        : customMetricMessages.promptNeedsSampleHint)}
                    onValueChange={() => undefined}
                    actionButton={(
                        <button
                            className="inline-action-button"
                            type="button"
                            disabled={!hasSample}
                            onClick={() => {
                                copyText(promptText).then((copied) => {
                                    setPromptCopyStatus(copied ? "copied" : "failed");
                                });
                            }}
                        >
                            {t(customMetricMessages.copyPromptButton)}
                        </button>
                    )}
                />
                <CopyStatusNote
                    copyStatus={promptCopyStatus}
                    copiedMessage={customMetricMessages.promptCopiedNote}
                />
            </SettingsSection>
            <SettingsSection title={t(customMetricMessages.transformSection)}>
                <TextAreaSetting
                    label={t(customMetricMessages.jqTransformLabel)}
                    value={jqTransform}
                    placeholder={t(customMetricMessages.jqTransformPlaceholder)}
                    rows={6}
                    hint={t(customMetricMessages.jqTransformHint)}
                    validationMessage={resolveTransformValidationMessage(props.target, t)}
                    onValueChange={(nextTransform) => props.onSettingsPatch({
                        customMetric: { jqTransform: nextTransform },
                    })}
                />
                <InspectorItem>
                    <div className="advanced-action-stack">
                        <button
                            className="inline-action-button"
                            type="button"
                            disabled={
                                url.trim().length === 0
                                || jqTransform.trim().length === 0
                                || !hasSample
                                || testState.kind === "pending"
                            }
                            onClick={() => sendTransformTestRequest(
                                client,
                                url,
                                jqTransform,
                                pendingRequestIds,
                                setTestState,
                            )}
                        >
                            {t(customMetricMessages.testTransformButton)}
                        </button>
                        {!hasSample && (
                            <>
                                <p className="section-note">{t(customMetricMessages.fetchSampleFirstNote)}</p>
                                <button
                                    className="inline-action-button"
                                    type="button"
                                    onClick={() => focusFetchSampleButton(fetchSampleButtonRef)}
                                >
                                    {t(customMetricMessages.goToFetchSampleButton)}
                                </button>
                            </>
                        )}
                    </div>
                </InspectorItem>
                <MetricResultPreview state={testState} />
                <FailureDetails state={testState} command="testTransform" />
            </SettingsSection>
        </>
    );
}

function focusFetchSampleButton(fetchSampleButtonRef: RefObject<HTMLButtonElement | null>): void {
    const fetchSampleButton = fetchSampleButtonRef.current;
    if (fetchSampleButton === null) {
        return;
    }

    const scrollIntoView = fetchSampleButton.scrollIntoView;
    if (typeof scrollIntoView === "function") {
        scrollIntoView.call(fetchSampleButton, { block: "center" });
    }
    fetchSampleButton.focus();
}

function TestStatusNote({
    state,
    command,
}: {
    readonly state: TestState;
    readonly command: TestCommand;
}): React.JSX.Element | null {
    const { t } = useI18n();

    switch (state.kind) {
        case "pending":
            if (state.command !== command) {
                return null;
            }

            return <p className="section-note">{t(customMetricMessages.testingNote)}</p>;
        case "sampleReady":
        case "metricReady":
            return (
                <p className="section-note">
                    {t(customMetricMessages.sampleReadyNote, { bytes: state.sample.responseBytes })}
                </p>
            );
        case "failed":
            if (state.command !== command) {
                return null;
            }

            return (
                <p className="section-note">
                    {t(command === "fetchSample"
                        ? customMetricMessages.fetchSampleFailedNote
                        : customMetricMessages.testFailedNote)}
                </p>
            );
        case "idle":
            return null;
    }
}

function CopyStatusNote({
    copyStatus,
    copiedMessage,
}: {
    readonly copyStatus: CopyStatus;
    readonly copiedMessage: typeof customMetricMessages.promptCopiedNote;
}): React.JSX.Element | null {
    const { t } = useI18n();
    if (copyStatus === "idle") {
        return null;
    }

    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">
                {t(copyStatus === "copied" ? copiedMessage : customMetricMessages.promptCopyFailedNote)}
            </p>
        </InspectorItem>
    );
}

function SamplePreview({ state }: { readonly state: TestState }): React.JSX.Element | null {
    const sample = readSampleState(state);
    const { t } = useI18n();
    if (sample === undefined) {
        return null;
    }

    return (
        <TextAreaSetting
            label={t(customMetricMessages.samplePreviewLabel)}
            value={sample.samplePreview}
            rows={6}
            readOnly
            hint={sample.isSamplePreviewTruncated
                ? t(customMetricMessages.samplePreviewTruncatedHint)
                : undefined}
            onValueChange={() => undefined}
        />
    );
}

function MetricResultPreview({ state }: { readonly state: TestState }): React.JSX.Element | null {
    const { t } = useI18n();
    if (state.kind !== "metricReady") {
        return null;
    }

    const metric = state.metric;
    const maximumText = metric.maximum === undefined ? "" : ` / ${metric.maximum}`;
    const iconText = metric.suggestedLucideIconId === undefined ? "" : ` icon=${metric.suggestedLucideIconId}`;

    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">
                {`${t(customMetricMessages.transformPreviewLabel)}: ${metric.label} ${metric.value}${maximumText} ${metric.unitText}${iconText}`}
            </p>
        </InspectorItem>
    );
}

function FailureDetails({
    state,
    command,
}: {
    readonly state: TestState;
    readonly command: TestCommand;
}): React.JSX.Element | null {
    const { t } = useI18n();
    if (state.kind !== "failed" || state.command !== command) {
        return null;
    }

    const failureText = `Stage: ${state.stage}\nDetail: ${state.detail}`;

    return (
        <TextAreaSetting
            label={t(customMetricMessages.failureDetailsLabel)}
            value={failureText}
            rows={3}
            readOnly
            onValueChange={() => undefined}
        />
    );
}

function resolveUrlValidationMessage(
    target: CustomMetricWidgetSettingsProps["target"],
    t: ReturnType<typeof useI18n>["t"],
): string | undefined {
    return target.configuration.state === "invalid" && target.configuration.reason === "missingUrl"
        ? t(customMetricMessages.validationUrlRequired)
        : undefined;
}

function resolveTransformValidationMessage(
    target: CustomMetricWidgetSettingsProps["target"],
    t: ReturnType<typeof useI18n>["t"],
): string | undefined {
    return target.configuration.state === "invalid" && target.configuration.reason === "missingJqTransform"
        ? t(customMetricMessages.validationTransformRequired)
        : undefined;
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
