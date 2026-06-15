import {
    useEffect,
    useRef,
    useState,
} from "react";
import {
    readCustomHttpSourceEditorResponse,
} from "../../../runtime/sources/custom-http/custom-http-source-editor-messages";
import { resolveCustomHttpFetchPolicy } from "../../../runtime/sources/custom-http/custom-http-request-policy";
import type {
    ResolvedCustomMetricSource,
    ResolvedCustomHttpRequestAuth,
    ResolvedSingleCustomHttpRequest,
} from "../../../settings/resolved-settings";
import { useStreamDeckClient } from "../../stream-deck/stream-deck-client-context";
import { CustomMetricSourceEditor } from "./CustomMetricSourceEditor";
import {
    applySourceEditorResponse,
} from "./source-editor-state";
import type {
    CustomMetricSourceEditorPageProps,
    CustomMetricSourceEditorSettingsProps,
    SourceEditorCommand,
    SourceEditorState,
} from "./types";

/**
 * Composes the focused Custom HTTP editor page used directly by Dense and by single-metric settings.
 */
export function CustomMetricSourceEditorPanel({
    onBack,
    ...props
}: CustomMetricSourceEditorPageProps): React.JSX.Element {
    const client = useStreamDeckClient();
    const request = readCustomMetricRequest(props.target);
    const url = request?.url ?? "";
    const userIntent = request?.userIntent ?? "";
    const jqTransform = request?.jqTransform ?? "";
    const requestSettings = request?.requestSettings ?? resolveCustomHttpFetchPolicy({});
    const auth = request?.auth ?? defaultRequestAuth();
    const [sourceEditorState, setSourceEditorState] = useState<SourceEditorState>({ kind: "idle" });
    const pendingRequestIds = useRef(new Map<string, SourceEditorCommand>());
    const onWidgetChromeSuppressionChangeRef = useRef(props.onWidgetChromeSuppressionChange);

    useEffect(() => {
        setSourceEditorState({ kind: "idle" });
        pendingRequestIds.current.clear();
    }, [url]);

    useEffect(() => {
        onWidgetChromeSuppressionChangeRef.current = props.onWidgetChromeSuppressionChange;
    }, [props.onWidgetChromeSuppressionChange]);

    useEffect(() => {
        onWidgetChromeSuppressionChangeRef.current?.(true);

        return () => {
            onWidgetChromeSuppressionChangeRef.current?.(false);
        };
    }, []);

    useEffect(() => client.sendToPropertyInspector.subscribe((event) => {
        const response = readCustomHttpSourceEditorResponse(event.payload);
        if (response === undefined || pendingRequestIds.current.get(response.requestId) !== response.command) {
            return;
        }

        pendingRequestIds.current.delete(response.requestId);
        setSourceEditorState(previousState => applySourceEditorResponse(previousState, url, response));
    }), [client, url]);

    return (
        <CustomMetricSourceEditor
            {...props}
            url={url}
            userIntent={userIntent}
            jqTransform={jqTransform}
            requestSettings={requestSettings}
            auth={auth}
            client={client}
            sourceEditorState={sourceEditorState}
            pendingRequestIds={pendingRequestIds}
            setSourceEditorState={setSourceEditorState}
            onBack={onBack}
        />
    );
}

function defaultRequestAuth(): ResolvedCustomHttpRequestAuth {
    return {
        credentialId: undefined,
        allowPublicHttpCredentials: false,
    };
}

function readCustomMetricRequest(
    target: CustomMetricSourceEditorSettingsProps["target"],
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
