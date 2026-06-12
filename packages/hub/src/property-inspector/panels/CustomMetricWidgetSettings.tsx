import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from "react";
import { TextAreaSetting } from "../controls/TextAreaSetting";
import { TextSetting } from "../controls/TextSetting";
import { InspectorItem } from "../components/InspectorItem";
import { customMetricMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import {
    CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
    readCustomHttpPiTestResponse,
    type CustomHttpPiTestResponse,
} from "../../runtime/sources/custom-http/custom-http-pi-test-messages";
import {
    CUSTOM_HTTP_FETCH_RETRY_COUNT,
    CUSTOM_HTTP_FETCH_TIMEOUT_MILLISECONDS,
    CUSTOM_HTTP_RESPONSE_LIMIT_BYTES,
} from "../../runtime/sources/custom-http/custom-http-fetch-limits";
import { useStreamDeckClient } from "../stream-deck/stream-deck-client-context";
import type {
    ResolvedCustomMetricSource,
    ResolvedCustomMetricTarget,
    ResolvedSingleCustomHttpRequest,
} from "../../settings/resolved-settings";
import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import type { StreamDeckPropertyInspectorClient } from "../stream-deck/stream-deck-client";

type CustomMetricWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedCustomMetricTarget;
};

let nextRequestId = 0;

type TestCommand = "fetchSample" | "testTransform";
type CopyStatus = "idle" | "copied" | "failed";

interface SampleState {
    readonly url: string;
    readonly responseBytes: number;
    readonly samplePreview: string;
    readonly isSamplePreviewTruncated: boolean;
}

const SAMPLE_JSON_PROMPT_PLACEHOLDER = "[SAMPLE JSON HERE, DO NOT SEND OUT WITHOUT GIVING SAMPLE]";

type TestState =
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

interface MetricPreview {
    readonly label: string;
    readonly value: number;
    readonly unitText: string;
    readonly maximum?: number;
}

export function CustomMetricWidgetSettings(props: CustomMetricWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const client = useStreamDeckClient();
    const request = readCustomMetricRequest(props.target);
    const url = request?.url ?? "";
    const userIntent = request?.userIntent ?? "";
    const jqTransform = request?.jqTransform ?? "";
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
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            <StandardColorSettings {...props} />
            {props.showPolling !== false && <PollingSettings {...props} />}
        </>
    );
}

function CustomMetricSourceEditor({
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
    readonly pendingRequestIds: MutableRefObject<Map<string, TestCommand>>;
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

function focusFetchSampleButton(fetchSampleButtonRef: MutableRefObject<HTMLButtonElement | null>): void {
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

    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">
                {`${t(customMetricMessages.transformPreviewLabel)}: ${metric.label} ${metric.value}${maximumText} ${metric.unitText}`}
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

function sendFetchSampleRequest(
    client: StreamDeckPropertyInspectorClient,
    url: string,
    pendingRequestIds: MutableRefObject<Map<string, TestCommand>>,
    setTestState: (state: TestState) => void,
): void {
    const requestId = createRequestId();
    pendingRequestIds.current.set(requestId, "fetchSample");
    setTestState({ kind: "pending", command: "fetchSample" });
    client.send("sendToPlugin", {
        type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
        command: "fetchSample",
        requestId,
        url,
    }).catch((error: Error) => {
        pendingRequestIds.current.delete(requestId);
        setTestState({
            kind: "failed",
            command: "fetchSample",
            stage: "send",
            detail: error.message,
        });
    });
}

function sendTransformTestRequest(
    client: StreamDeckPropertyInspectorClient,
    url: string,
    jqTransform: string,
    pendingRequestIds: MutableRefObject<Map<string, TestCommand>>,
    setTestState: Dispatch<SetStateAction<TestState>>,
): void {
    const requestId = createRequestId();
    pendingRequestIds.current.set(requestId, "testTransform");
    setTestState(previousState => ({
        kind: "pending",
        command: "testTransform",
        ...(readSampleState(previousState) === undefined ? {} : { sample: readSampleState(previousState) }),
    }));
    client.send("sendToPlugin", {
        type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
        command: "testTransform",
        requestId,
        url,
        jqTransform,
    }).catch((error: Error) => {
        pendingRequestIds.current.delete(requestId);
        setTestState(previousState => ({
            kind: "failed",
            command: "testTransform",
            stage: "send",
            detail: error.message,
            ...(readSampleState(previousState) === undefined ? {} : { sample: readSampleState(previousState) }),
        }));
    });
}

function applyTestResponse(
    previousState: TestState,
    url: string,
    response: CustomHttpPiTestResponse,
): TestState {
    if (response.command === "fetchSample") {
        return response.result.ok
            ? {
                kind: "sampleReady",
                sample: {
                    url,
                    responseBytes: response.result.responseBytes,
                    samplePreview: response.result.samplePreview,
                    isSamplePreviewTruncated: response.result.isSamplePreviewTruncated,
                },
            }
            : {
                kind: "failed",
                command: "fetchSample",
                stage: response.result.stage,
                detail: response.result.detail,
            };
    }

    if (!response.result.ok) {
        return {
            kind: "failed",
            command: "testTransform",
            stage: response.result.stage,
            detail: response.result.detail,
            ...(readSampleState(previousState) === undefined ? {} : { sample: readSampleState(previousState) }),
        };
    }

    const sample = readSampleState(previousState);
    return {
        kind: "metricReady",
        sample: sample ?? {
            url,
            responseBytes: 0,
            samplePreview: "",
            isSamplePreviewTruncated: false,
        },
        metric: response.result.metric,
    };
}

function readCustomMetricRequest(target: ResolvedCustomMetricTarget): ResolvedSingleCustomHttpRequest | undefined {
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

function resolveUrlValidationMessage(
    target: ResolvedCustomMetricTarget,
    t: ReturnType<typeof useI18n>["t"],
): string | undefined {
    return target.configuration.state === "invalid" && target.configuration.reason === "missingUrl"
        ? t(customMetricMessages.validationUrlRequired)
        : undefined;
}

function resolveTransformValidationMessage(
    target: ResolvedCustomMetricTarget,
    t: ReturnType<typeof useI18n>["t"],
): string | undefined {
    return target.configuration.state === "invalid" && target.configuration.reason === "missingJqTransform"
        ? t(customMetricMessages.validationTransformRequired)
        : undefined;
}

function hasCurrentSample(state: TestState, url: string): boolean {
    return readSampleState(state)?.url === url;
}

function readSampleState(state: TestState): SampleState | undefined {
    switch (state.kind) {
        case "sampleReady":
        case "metricReady":
        case "failed":
        case "pending":
            return state.sample;
        case "idle":
            return undefined;
    }
}

function buildCustomMetricPrompt(options: {
    readonly locale: string;
    readonly userIntent: string;
    readonly sample: SampleState | undefined;
}): string {
    const userIntent = options.userIntent.trim().length === 0
        ? "[DESCRIBE WHAT VALUE TO DISPLAY]"
        : options.userIntent.trim();
    const sampleJson = options.sample?.samplePreview ?? SAMPLE_JSON_PROMPT_PLACEHOLDER;

    return [
        "Write a jq rule that converts the input JSON into exactly one scalar metric for a Stream Deck key, or reject the task and explain what is missing.",
        "",
        "User display request:",
        userIntent,
        "",
        "Input JSON sample:",
        sampleJson,
        ...(options.sample?.isSamplePreviewTruncated === true
            ? [
                "",
                "Sample note:",
                `The sample above is a truncated preview of a ${options.sample.responseBytes}-byte response. It may not be complete valid JSON.`,
                "If the requested field is missing or the object structure is unclear, ask the user for a smaller or more focused valid JSON sample instead of guessing.",
            ]
            : []),
        "",
        "Target output JSON schema:",
        "{",
        "  \"metric\": {",
        "    \"label\": \"TEMP\",",
        "    \"value\": 23.5,",
        "    \"unit\": \"percent | celsius | fahrenheit | watts | bytes | bytes_per_second | milliseconds | seconds | hertz | revolutions_per_minute | unitless | custom\",",
        "    \"customUnit\": \"km/h\",",
        "    \"maximum\": 100",
        "  }",
        "}",
        "",
        "Before writing jq:",
        "- If the user display request is missing, too broad, or does not clearly say which value to display, do not write jq. Ask the user to clarify the exact value they want.",
        "- If Input JSON sample is a placeholder, HTML page, error page, plain text, or otherwise not usable as JSON, do not write jq. Ask the user to provide a valid JSON sample.",
        "- If Input JSON sample looks like a truncated JSON preview but still contains enough field structure to write a safe transform, you may write jq only when you are confident about the requested field path.",
        "- When you ask for a valid JSON sample or a clearer display request, reply with natural language only. Do not include jq, Markdown, code fences, or explanations of the rules.",
        ...(options.locale === "en"
            ? []
            : [`- Reply to clarification or sample-request messages in ${options.locale}.`]),
        "",
        "Jq output rules:",
        "- Write only the jq expression. Do not include Markdown, explanation, or comments.",
        "- Output exactly one JSON object with a top-level metric object.",
        "- Do not output metricId.",
        "- Extract only the value requested by the user display request.",
        "- label must be 1-12 ASCII characters or 1-6 CJK characters.",
        "- value must be numeric.",
        "- Use unit custom plus customUnit only when the provider unit is not in the enum.",
        "- maximum is optional. Include it only for an obvious range such as percent 100.",
    ].join("\n");
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function createRequestId(): string {
    nextRequestId += 1;
    return `custom-http-pi-${nextRequestId}`;
}
