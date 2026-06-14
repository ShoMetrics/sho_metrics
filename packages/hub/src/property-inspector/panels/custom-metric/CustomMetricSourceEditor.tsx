import {
    createElement,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import {
    CircleCheck,
    CircleQuestionMark,
    CircleX,
    type IconNode,
} from "lucide";
import { customMetricMessages } from "../../../i18n/message-groups/widgets";
import { useI18n } from "../../../i18n/react";
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
    CustomMetricSourceEditorSettingsProps,
    ExplorationOutputPreview as ExplorationOutputPreviewState,
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
    pendingRequestIds,
    setSourceEditorState,
    onBack,
    ...props
}: CustomMetricSourceEditorSettingsProps & {
    readonly url: string;
    readonly userIntent: string;
    readonly jqTransform: string;
    readonly requestSettings: ResolvedCustomHttpFetchPolicy;
    readonly client: StreamDeckPropertyInspectorClient;
    readonly sourceEditorState: SourceEditorState;
    readonly pendingRequestIds: RefObject<Map<string, SourceEditorCommand>>;
    readonly setSourceEditorState: Dispatch<SetStateAction<SourceEditorState>>;
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
                        <CopyTextButton
                            text={promptText}
                            disabled={!hasSample}
                            label={t(customMetricMessages.copyPromptButton)}
                        />
                    )}
                />
                {!hasSample && (
                    <InspectorItem>
                        <div className="advanced-action-stack">
                            <GoToFetchSampleButton fetchSampleButtonRef={fetchSampleButtonRef} />
                        </div>
                    </InspectorItem>
                )}
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
                                const requestTransform = readSingleFencedCodeBlock(jqTransform) ?? jqTransform;
                                if (requestTransform !== jqTransform) {
                                    props.onSettingsPatch({
                                        customMetric: { jqTransform: requestTransform },
                                    });
                                }
                                sendTransformTestRequest(
                                    client,
                                    props.customHttpConsumerSlug,
                                    requestUrl,
                                    requestTransform,
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
                                <GoToFetchSampleButton fetchSampleButtonRef={fetchSampleButtonRef} />
                            </>
                        )}
                    </div>
                </InspectorItem>
                <TransformOutcomeNote state={sourceEditorState} />
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

function GoToFetchSampleButton({
    fetchSampleButtonRef,
}: {
    readonly fetchSampleButtonRef: RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
    const { t } = useI18n();
    return (
        <button
            className="inline-action-button"
            type="button"
            onClick={() => focusFetchSampleButton(fetchSampleButtonRef)}
        >
            {t(customMetricMessages.goToFetchSampleButton)}
        </button>
    );
}

type CopyButtonState = "idle" | "copied" | "failed";

function CopyTextButton({
    text,
    disabled = false,
    label,
}: {
    readonly text: string;
    readonly disabled?: boolean;
    readonly label: string;
}): React.JSX.Element {
    const { t } = useI18n();
    const [copyButtonState, setCopyButtonState] = useState<CopyButtonState>("idle");
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        setCopyButtonState("idle");
    }, [text, disabled]);

    useEffect(() => () => {
        if (resetTimerRef.current !== undefined) {
            clearTimeout(resetTimerRef.current);
        }
    }, []);

    const buttonLabel = copyButtonState === "copied"
        ? t(customMetricMessages.copyButtonCopiedLabel)
        : copyButtonState === "failed"
            ? t(customMetricMessages.copyButtonFailedLabel)
            : label;

    return (
        <button
            className="inline-action-button"
            type="button"
            disabled={disabled}
            onClick={() => {
                if (resetTimerRef.current !== undefined) {
                    clearTimeout(resetTimerRef.current);
                }

                copyText(text).then((copied) => {
                    setCopyButtonState(copied ? "copied" : "failed");
                    resetTimerRef.current = setTimeout(() => {
                        setCopyButtonState("idle");
                    }, 2000);
                });
            }}
        >
            {buttonLabel}
        </button>
    );
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

function TransformOutcomeNote({ state }: { readonly state: SourceEditorState }): React.JSX.Element | null {
    const { t } = useI18n();

    if (state.kind === "metricReady") {
        return (
            <StatusNote
                tone="success"
                iconNode={CircleCheck}
                text={t(customMetricMessages.transformStatusMetricReady)}
            />
        );
    }

    if (state.kind === "explorationReady") {
        return (
            <StatusNote
                tone="continuing"
                iconNode={CircleQuestionMark}
                text={t(customMetricMessages.transformStatusExplorationReady)}
            />
        );
    }

    if (state.kind === "failed" && state.command === "testTransform") {
        return (
            <StatusNote
                tone="danger"
                iconNode={CircleX}
                text={t(customMetricMessages.transformStatusFailed)}
            />
        );
    }

    return null;
}

function StatusNote({
    tone,
    iconNode,
    text,
}: {
    readonly tone: "success" | "continuing" | "danger";
    readonly iconNode: IconNode;
    readonly text: string;
}): React.JSX.Element {
    return (
        <InspectorItem className="note-item note-item-caption">
            <p className={`section-note custom-http-transform-status custom-http-transform-status-${tone}`}>
                <LucideInlineIcon iconNode={iconNode} />
                <span>{text}</span>
            </p>
        </InspectorItem>
    );
}

function LucideInlineIcon({ iconNode }: { readonly iconNode: IconNode }): React.JSX.Element {
    return (
        <svg
            className="custom-http-transform-status-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {iconNode.map(([tagName, attributes], index) => createElement(tagName, {
                ...attributes,
                key: index,
            }))}
        </svg>
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

    if (state.kind !== "explorationReady") {
        return null;
    }

    const explorationOutputText = buildExplorationOutputText(state.explorationOutput);
    const hint = [
        t(customMetricMessages.explorationOutputHint),
        t(customMetricMessages.explorationSchemaNote, {
            detail: state.explorationOutput.schemaFailureDetail,
        }),
    ].join(" ");

    return (
        <TextAreaSetting
            label={t(customMetricMessages.explorationOutputLabel)}
            value={explorationOutputText}
            rows={8}
            readOnly
            hint={hint}
            onValueChange={() => undefined}
            actionButton={(
                <CopyTextButton
                    text={explorationOutputText}
                    label={t(customMetricMessages.copyExplorationOutputButton)}
                />
            )}
        />
    );
}

function buildExplorationOutputText(explorationOutput: ExplorationOutputPreviewState): string {
    const outputFence = explorationOutput.text.includes("```") ? "````" : "```";
    return [
        "This jq ran successfully, but the output is not a valid final metric.",
        `Not a valid final metric: ${explorationOutput.schemaFailureDetail}`,
        "",
        "Use the output below as exploration data:",
        "- If you are confident, write one final jq filter that returns exactly one {metric:{...}} object.",
        "- If more information is needed, write one more jq exploration query and ask the user to run it in Stream Deck.",
        "",
        outputFence,
        explorationOutput.text,
        outputFence,
    ].join("\n");
}

function readSingleFencedCodeBlock(text: string): string | undefined {
    const codeBlockPattern = /```[^\r\n`]*\r?\n([\s\S]*?)```/gu;
    const matches = [...text.matchAll(codeBlockPattern)];
    if (matches.length !== 1) {
        return undefined;
    }

    return matches[0]?.[1]?.trim();
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
    const hint = t(command === "testTransform"
        ? customMetricMessages.transformFailureDetailsHint
        : customMetricMessages.failureDetailsHint);

    return (
        <TextAreaSetting
            label={t(customMetricMessages.failureDetailsLabel)}
            value={failureText}
            rows={3}
            readOnly
            hint={hint}
            onValueChange={() => undefined}
            actionButton={(
                <CopyTextButton
                    text={failureText}
                    label={t(customMetricMessages.copyDetailsButton)}
                />
            )}
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
