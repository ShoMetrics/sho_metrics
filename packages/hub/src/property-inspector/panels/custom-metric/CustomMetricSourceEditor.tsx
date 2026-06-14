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
import type { LocalizedMessage } from "../../../i18n/types";
import {
    CUSTOM_HTTP_RESPONSE_LIMIT_BYTES,
} from "../../../runtime/sources/custom-http/custom-http-fetch-limits";
import {
    estimateCustomHttpWorstCaseFetchMilliseconds,
    type ResolvedCustomHttpFetchPolicy,
} from "../../../runtime/sources/custom-http/custom-http-request-policy";
import { normalizeCustomHttpSourceUrlInput } from "../../../runtime/sources/custom-http/custom-http-url";
import type { StreamDeckPropertyInspectorClient } from "../../stream-deck/stream-deck-client";
import { InspectorItem } from "../../components/InspectorItem";
import { SelectSetting } from "../../controls/SelectSetting";
import { TextAreaSetting } from "../../controls/TextAreaSetting";
import { TextSetting } from "../../controls/TextSetting";
import { SettingsSection } from "../SettingsSection";
import {
    customHttpRetryCountOptionList,
    customHttpTimeoutSecondOptionList,
} from "../setting-options";
import { buildCustomMetricPrompt } from "./prompt";
import {
    hasCurrentSample,
    readSampleState,
    sendFetchSampleRequest,
    sendTransformTestRequest,
} from "./source-editor-state";
import type {
    CopyStatus,
    CustomMetricSourceEditorSettingsProps,
    SourceEditorCommand,
    SourceEditorState,
} from "./types";

export function CustomMetricSourceEditor({
    url,
    userIntent,
    jqTransform,
    requestSettings,
    client,
    sourceEditorState,
    promptCopyStatus,
    pendingRequestIds,
    setSourceEditorState,
    setPromptCopyStatus,
    onBack,
    ...props
}: CustomMetricSourceEditorSettingsProps & {
    readonly url: string;
    readonly userIntent: string;
    readonly jqTransform: string;
    readonly requestSettings: ResolvedCustomHttpFetchPolicy;
    readonly client: StreamDeckPropertyInspectorClient;
    readonly sourceEditorState: SourceEditorState;
    readonly promptCopyStatus: CopyStatus;
    readonly pendingRequestIds: RefObject<Map<string, SourceEditorCommand>>;
    readonly setSourceEditorState: Dispatch<SetStateAction<SourceEditorState>>;
    readonly setPromptCopyStatus: Dispatch<SetStateAction<CopyStatus>>;
    readonly onBack: () => void;
}): React.JSX.Element {
    const { locale, t } = useI18n();
    const [urlDraft, setUrlDraft] = useState(url);
    const [userIntentDraft, setUserIntentDraft] = useState(userIntent);
    const isUrlInputFocusedRef = useRef(false);
    const lastSettingsUserIntentRef = useRef(userIntent);
    const fetchSampleButtonRef = useRef<HTMLButtonElement | null>(null);
    const normalizedUrlDraft = normalizeCustomHttpSourceUrlInput(urlDraft);
    const hasSample = hasCurrentSample(sourceEditorState, normalizedUrlDraft);
    const promptText = useMemo(() => buildCustomMetricPrompt({
        locale,
        sourceUrl: normalizedUrlDraft,
        userIntent: userIntentDraft,
        sample: readSampleState(sourceEditorState),
    }), [locale, normalizedUrlDraft, userIntentDraft, sourceEditorState]);

    useEffect(() => {
        scrollPropertyInspectorToTop();
    }, []);

    useEffect(() => {
        if (!isUrlInputFocusedRef.current) {
            setUrlDraft(url);
        }
    }, [url]);

    useEffect(() => {
        if (userIntent !== lastSettingsUserIntentRef.current) {
            setUserIntentDraft(userIntent);
            lastSettingsUserIntentRef.current = userIntent;
        }
    }, [userIntent]);

    const commitNormalizedUrlDraft = (): string => {
        const normalizedUrl = normalizeCustomHttpSourceUrlInput(urlDraft);
        isUrlInputFocusedRef.current = false;
        setUrlDraft(normalizedUrl);
        if (normalizedUrl !== urlDraft || normalizedUrl !== url) {
            props.onSettingsPatch({
                customMetric: { url: normalizedUrl },
            });
        }

        return normalizedUrl;
    };

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
                    value={urlDraft}
                    placeholder={t(customMetricMessages.urlPlaceholder)}
                    validationMessage={resolveUrlValidationMessage(props.target, t)}
                    onFocus={() => {
                        isUrlInputFocusedRef.current = true;
                    }}
                    onBlur={() => {
                        commitNormalizedUrlDraft();
                    }}
                    onValueChange={(nextUrl) => {
                        setUrlDraft(nextUrl);
                    }}
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
            </SettingsSection>
            <SettingsSection title={t(customMetricMessages.requestSettingsSection)}>
                <SelectSetting
                    label={t(customMetricMessages.timeoutSecondsLabel)}
                    value={requestSettings.timeoutSeconds}
                    optionList={customHttpTimeoutSecondOptionList}
                    onValueChange={(timeoutSeconds) => props.onSettingsPatch({
                        customMetric: { timeoutSeconds },
                    })}
                />
                <SelectSetting
                    label={t(customMetricMessages.retryCountLabel)}
                    value={requestSettings.retryCount}
                    optionList={customHttpRetryCountOptionList}
                    onValueChange={(retryCount) => props.onSettingsPatch({
                        customMetric: { retryCount },
                    })}
                />
                <RequestBudgetWarning
                    requestSettings={requestSettings}
                    pollingFrequencySeconds={props.context.resolved.preferences.pollingFrequencySeconds}
                />
            </SettingsSection>
            <SettingsSection title={t(customMetricMessages.fetchSampleSection)}>
                <InspectorItem>
                    <div className="advanced-action-stack">
                        <button
                            ref={fetchSampleButtonRef}
                            className="inline-action-button"
                            type="button"
                            disabled={normalizedUrlDraft.length === 0 || sourceEditorState.kind === "pending"}
                            onClick={() => {
                                const requestUrl = commitNormalizedUrlDraft();
                                sendFetchSampleRequest(
                                    client,
                                    props.customHttpConsumerSlug,
                                    requestUrl,
                                    requestSettings,
                                    pendingRequestIds,
                                    setSourceEditorState,
                                );
                            }}
                        >
                            {t(customMetricMessages.fetchSampleButton)}
                        </button>
                        <TestStatusNote state={sourceEditorState} command="fetchSample" />
                        <p className="section-note">
                            {t(customMetricMessages.fetchLimitsNote, {
                                timeoutSeconds: requestSettings.timeoutSeconds,
                                retryCount: requestSettings.retryCount,
                                responseLimitKiB: CUSTOM_HTTP_RESPONSE_LIMIT_BYTES / 1024,
                            })}
                        </p>
                    </div>
                </InspectorItem>
                <FailureDetails
                    state={sourceEditorState}
                    command="fetchSample"
                    requestSettings={requestSettings}
                />
                <SamplePreview state={sourceEditorState} />
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
                                normalizedUrlDraft.length === 0
                                || jqTransform.trim().length === 0
                                || !hasSample
                                || sourceEditorState.kind === "pending"
                            }
                            onClick={() => {
                                const requestUrl = commitNormalizedUrlDraft();
                                sendTransformTestRequest(
                                    client,
                                    props.customHttpConsumerSlug,
                                    requestUrl,
                                    jqTransform,
                                    requestSettings,
                                    pendingRequestIds,
                                    setSourceEditorState,
                                );
                            }}
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
                <MetricResultPreview state={sourceEditorState} />
                <ExplorationOutputPreview state={sourceEditorState} />
                <FailureDetails
                    state={sourceEditorState}
                    command="testTransform"
                    requestSettings={requestSettings}
                />
            </SettingsSection>
        </>
    );
}

function RequestBudgetWarning({
    requestSettings,
    pollingFrequencySeconds,
}: {
    readonly requestSettings: ResolvedCustomHttpFetchPolicy;
    readonly pollingFrequencySeconds: number;
}): React.JSX.Element | null {
    const { t } = useI18n();
    const worstCaseMilliseconds = estimateCustomHttpWorstCaseFetchMilliseconds(requestSettings);

    if (worstCaseMilliseconds <= pollingFrequencySeconds * 1000) {
        return null;
    }

    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">
                {t(customMetricMessages.requestBudgetWarning, {
                    worstCaseSeconds: Math.ceil(worstCaseMilliseconds / 1000),
                    pollingSeconds: pollingFrequencySeconds,
                })}
            </p>
        </InspectorItem>
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

function scrollPropertyInspectorToTop(): void {
    if (document.scrollingElement != null) {
        document.scrollingElement.scrollTop = 0;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
}

function TestStatusNote({
    state,
    command,
}: {
    readonly state: SourceEditorState;
    readonly command: SourceEditorCommand;
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
        case "explorationReady":
            return (
                <p className="section-note">
                    {t(customMetricMessages.sampleReadyNote, {
                        bytes: state.sample.responseBytes,
                        elapsedMilliseconds: state.sample.elapsedMilliseconds,
                    })}
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
    readonly copiedMessage: LocalizedMessage;
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

function SamplePreview({ state }: { readonly state: SourceEditorState }): React.JSX.Element | null {
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

function MetricResultPreview({ state }: { readonly state: SourceEditorState }): React.JSX.Element | null {
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

function ExplorationOutputPreview({
    state,
}: {
    readonly state: SourceEditorState;
}): React.JSX.Element | null {
    const { t } = useI18n();
    const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
    const explorationText = state.kind === "explorationReady" ? state.explorationOutput.text : "";
    useEffect(() => {
        setCopyStatus("idle");
    }, [explorationText]);

    if (state.kind !== "explorationReady") {
        return null;
    }

    const hint = [
        t(customMetricMessages.explorationOutputHint),
        t(customMetricMessages.explorationSchemaNote, {
            detail: state.explorationOutput.schemaFailureDetail,
        }),
    ].join(" ");

    return (
        <>
            <TextAreaSetting
                label={t(customMetricMessages.explorationOutputLabel)}
                value={state.explorationOutput.text}
                rows={8}
                readOnly
                hint={hint}
                onValueChange={() => undefined}
                actionButton={(
                    <button
                        className="inline-action-button"
                        type="button"
                        onClick={() => {
                            copyText(state.explorationOutput.text).then((copied) => {
                                setCopyStatus(copied ? "copied" : "failed");
                            });
                        }}
                    >
                        {t(customMetricMessages.copyExplorationOutputButton)}
                    </button>
                )}
            />
            <CopyStatusNote
                copyStatus={copyStatus}
                copiedMessage={customMetricMessages.explorationOutputCopiedNote}
            />
        </>
    );
}

function FailureDetails({
    state,
    command,
    requestSettings,
}: {
    readonly state: SourceEditorState;
    readonly command: SourceEditorCommand;
    readonly requestSettings: ResolvedCustomHttpFetchPolicy;
}): React.JSX.Element | null {
    const { t } = useI18n();
    if (state.kind !== "failed" || state.command !== command) {
        return null;
    }

    const failureText = [
        `Stage: ${state.stage}`,
        `Detail: ${state.detail}`,
        `Settings: timeout=${requestSettings.timeoutSeconds}s, retryCount=${requestSettings.retryCount}, responseLimit=${CUSTOM_HTTP_RESPONSE_LIMIT_BYTES / 1024}KiB`,
    ].join("\n");

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
    target: CustomMetricSourceEditorSettingsProps["target"],
    t: ReturnType<typeof useI18n>["t"],
): string | undefined {
    return target.configuration.state === "invalid" && target.configuration.reason === "missingUrl"
        ? t(customMetricMessages.validationUrlRequired)
        : undefined;
}

function resolveTransformValidationMessage(
    target: CustomMetricSourceEditorSettingsProps["target"],
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
