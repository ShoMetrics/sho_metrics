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
    TriangleAlert,
    type IconNode,
} from "lucide";
import { customMetricMessages } from "../../../../i18n/message-groups/widgets";
import { useI18n } from "../../../../i18n/react";
import {
    CUSTOM_HTTP_RESPONSE_LIMIT_BYTES,
} from "../../../../runtime/sources/custom-http/custom-http-fetch-limits";
import type { LocalizedMessage } from "../../../../i18n/types";
import {
    estimateCustomHttpWorstCaseFetchMilliseconds,
    type ResolvedCustomHttpFetchPolicy,
} from "../../../../runtime/sources/custom-http/custom-http-request-policy";
import { normalizeCustomHttpSourceUrlInput } from "../../../../runtime/sources/custom-http/custom-http-url";
import type { StreamDeckPropertyInspectorClient } from "../../../stream-deck/stream-deck-client";
import type {
    ResolvedCustomHttpCredentialSummary,
    ResolvedCustomHttpRequestAuth,
} from "../../../../settings/resolved-settings";
import type { CustomHttpSourceEditorBlockedRedirect } from "../../../../runtime/sources/custom-http/custom-http-source-editor-messages";
import { InspectorItem } from "../../../components/InspectorItem";
import { SelectSetting } from "../../../controls/SelectSetting";
import { TextAreaSetting } from "../../../controls/TextAreaSetting";
import { TextSetting } from "../../../controls/TextSetting";
import { propertyInspectorExternalUrls } from "../../../external-urls";
import { PropertyInspectorExternalLink } from "../../external-link";
import { SettingsSection } from "../../controls/SettingsSection";
import {
    customHttpRetryCountOptionList,
    customHttpTimeoutSecondOptionList,
} from "../../setting-options";
import { buildCustomMetricPrompt } from "./prompt";
import {
    hasCurrentSample,
    readSampleState,
    sendFetchSampleRequest,
    sendTransformTestRequest,
} from "./source-editor-state";
import {
    canUseCustomHttpCredentialForUrl,
    CustomMetricAuthSettings,
} from "./CustomMetricAuthSettings";
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
    auth,
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
    readonly auth: ResolvedCustomHttpRequestAuth;
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
    const fetchSampleActionState = resolveFetchSampleActionState({
        normalizedUrl: normalizedUrlDraft,
        auth,
        credentials: props.context.globalSettings.customHttpCredentials,
        state: sourceEditorState,
    });
    const canFetchSample = fetchSampleActionState.kind === "enabled";
    const canTestTransform = canFetchSample && jqTransform.trim().length > 0 && hasSample;
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
    const useRedirectedUrl = (redirectedUrl: string): void => {
        isUrlInputFocusedRef.current = false;
        setUrlDraft(redirectedUrl);
        props.onSettingsPatch({
            customMetric: {
                url: redirectedUrl,
                allowPublicHttpCredentials: false,
            },
        });
        setSourceEditorState({ kind: "idle" });
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
                    <p className="section-note">
                        <PropertyInspectorExternalLink url={propertyInspectorExternalUrls.customHttpMetricFaq}>
                            {t(customMetricMessages.customHttpMetricFaqLink)}
                        </PropertyInspectorExternalLink>
                    </p>
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
            <SettingsSection title={t(customMetricMessages.fetchSampleSection)}>
                <InspectorItem>
                    <div className="advanced-action-stack">
                        <button
                            ref={fetchSampleButtonRef}
                            className="inline-action-button"
                            type="button"
                            disabled={fetchSampleActionState.kind !== "enabled"}
                            onClick={() => {
                                if (fetchSampleActionState.kind !== "enabled") {
                                    return;
                                }

                                const requestUrl = commitNormalizedUrlDraft();
                                sendFetchSampleRequest(
                                    client,
                                    props.customHttpConsumerSlug,
                                    requestUrl,
                                    requestSettings,
                                    auth,
                                    pendingRequestIds,
                                    setSourceEditorState,
                                );
                            }}
                        >
                            {fetchSampleActionState.kind === "pending"
                                ? t(customMetricMessages.fetchSamplePendingButton)
                                : t(customMetricMessages.fetchSampleButton)}
                        </button>
                        <TestStatusNote state={sourceEditorState} command="fetchSample" />
                        <ActionUnavailableNote state={fetchSampleActionState} />
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
                    onUseRedirectedUrl={useRedirectedUrl}
                />
                <SamplePreview state={sourceEditorState} />
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
            <CustomMetricAuthSettings
                normalizedUrl={normalizedUrlDraft}
                auth={auth}
                credentials={props.context.globalSettings.customHttpCredentials}
                onSettingsPatch={props.onSettingsPatch}
                onCustomHttpCredentialUpsert={props.onCustomHttpCredentialUpsert}
                onCustomHttpCredentialDelete={props.onCustomHttpCredentialDelete}
            />
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
                            disabled={!canTestTransform}
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
                                    auth,
                                    pendingRequestIds,
                                    setSourceEditorState,
                                );
                            }}
                        >
                            {sourceEditorState.kind === "pending" && sourceEditorState.command === "testTransform"
                                ? t(customMetricMessages.testingNote)
                                : t(customMetricMessages.testTransformButton)}
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
                    onUseRedirectedUrl={useRedirectedUrl}
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

interface ActionUnavailableReason {
    readonly tone: "continuing" | "danger";
    readonly message: LocalizedMessage;
}

type FetchSampleActionState =
    | { readonly kind: "enabled" }
    | { readonly kind: "pending" }
    | { readonly kind: "unavailable"; readonly reason: ActionUnavailableReason };

function resolveFetchSampleActionState({
    normalizedUrl,
    auth,
    credentials,
    state,
}: {
    readonly normalizedUrl: string;
    readonly auth: ResolvedCustomHttpRequestAuth;
    readonly credentials: readonly ResolvedCustomHttpCredentialSummary[];
    readonly state: SourceEditorState;
}): FetchSampleActionState {
    if (state.kind === "pending") {
        return { kind: "pending" };
    }

    if (normalizedUrl.length === 0) {
        return {
            kind: "unavailable",
            reason: {
                tone: "continuing",
                message: customMetricMessages.fetchUnavailableMissingUrl,
            },
        };
    }

    if (!isValidHttpUrl(normalizedUrl)) {
        return {
            kind: "unavailable",
            reason: {
                tone: "danger",
                message: customMetricMessages.fetchUnavailableInvalidUrl,
            },
        };
    }

    if (
        auth.credentialId !== undefined
        && !credentials.some(credential => credential.id === auth.credentialId)
    ) {
        return {
            kind: "unavailable",
            reason: {
                tone: "danger",
                message: customMetricMessages.fetchUnavailableMissingCredential,
            },
        };
    }

    if (!canUseCustomHttpCredentialForUrl(auth, normalizedUrl)) {
        return {
            kind: "unavailable",
            reason: {
                tone: "continuing",
                message: customMetricMessages.fetchUnavailablePublicHttpCredentialConsent,
            },
        };
    }

    return { kind: "enabled" };
}

function isValidHttpUrl(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
        return false;
    }
}

function ActionUnavailableNote({ state }: { readonly state: FetchSampleActionState }): React.JSX.Element | null {
    const { t } = useI18n();
    if (state.kind !== "unavailable") {
        return null;
    }

    const { reason } = state;
    return (
        <p className={`section-note custom-http-status-note-${reason.tone}`}>
            {t(reason.message, {
                authenticationSection: t(customMetricMessages.authenticationSection),
            })}
        </p>
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
            <p className={`section-note custom-http-status-note custom-http-status-note-${tone}`}>
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
    onUseRedirectedUrl,
}: {
    readonly state: SourceEditorState;
    readonly command: SourceEditorCommand;
    readonly requestSettings: ResolvedCustomHttpFetchPolicy;
    readonly onUseRedirectedUrl: (redirectedUrl: string) => void;
}): React.JSX.Element | null {
    const { t } = useI18n();
    if (state.kind !== "failed" || state.command !== command) {
        return null;
    }

    const failureText = [
        `Stage: ${state.stage}`,
        `Detail: ${state.detail}`,
        ...(state.blockedRedirect === undefined
            ? []
            : [
                `Redirect: ${state.blockedRedirect.fromOrigin} -> ${state.blockedRedirect.toOrigin}`,
                `Redirected URL: ${state.blockedRedirect.redirectedUrl}`,
            ]),
        `Settings: timeout=${requestSettings.timeoutSeconds}s, retryCount=${requestSettings.retryCount}, responseLimit=${CUSTOM_HTTP_RESPONSE_LIMIT_BYTES / 1024}KiB`,
    ].join("\n");
    const hint = t(command === "testTransform"
        ? customMetricMessages.transformFailureDetailsHint
        : customMetricMessages.failureDetailsHint);
    const blockedRedirect = state.blockedRedirect;

    return (
        <>
            {blockedRedirect !== undefined && (
                <RedirectBlockedNotice
                    blockedRedirect={blockedRedirect}
                    onUseRedirectedUrl={onUseRedirectedUrl}
                />
            )}
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
        </>
    );
}

function RedirectBlockedNotice({
    blockedRedirect,
    onUseRedirectedUrl,
}: {
    readonly blockedRedirect: CustomHttpSourceEditorBlockedRedirect;
    readonly onUseRedirectedUrl: (redirectedUrl: string) => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const redirectedUrl = blockedRedirect.redirectedUrl;
    return (
        <InspectorItem className="note-item note-item-caption">
            <div className="custom-http-redirect-notice">
                <p className="section-note custom-http-status-note custom-http-status-note-continuing">
                    <LucideInlineIcon iconNode={TriangleAlert} />
                    <span>
                        {t(customMetricMessages.redirectBlockedNotice)}
                    </span>
                </p>
                <p className="section-note custom-http-status-note-continuing">
                    {t(customMetricMessages.redirectBlockedSummary, {
                        fromOrigin: blockedRedirect.fromOrigin,
                        toOrigin: blockedRedirect.toOrigin,
                        redirectedUrl,
                    })}
                </p>
                <div className="advanced-action-stack">
                    <button
                        className="inline-action-button"
                        type="button"
                        onClick={() => onUseRedirectedUrl(redirectedUrl)}
                    >
                        {t(customMetricMessages.useRedirectedUrlButton)}
                    </button>
                    <CopyTextButton
                        text={redirectedUrl}
                        label={t(customMetricMessages.copyRedirectedUrlButton)}
                    />
                </div>
            </div>
        </InspectorItem>
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
