import type {
    Dispatch,
    RefObject,
    SetStateAction,
} from "react";
import {
    buildCustomHttpSourceEditorFetchSampleRequest,
    buildCustomHttpSourceEditorTestTransformRequest,
    sendCustomHttpSourceEditorRequest,
    type CustomHttpSourceEditorRequestAuth,
    type CustomHttpSourceEditorRequestSettings,
    type CustomHttpSourceEditorResponse,
} from "../../../runtime/sources/custom-http/custom-http-source-editor-messages";
import type { StreamDeckPropertyInspectorClient } from "../../stream-deck/stream-deck-client";
import type { SampleState, SourceEditorCommand, SourceEditorState } from "./types";

let nextRequestId = 0;

/**
 * Sends a sample fetch command and records the pending request id locally.
 *
 * Stream Deck PI messages are async and may return out of order, so callers
 * keep `pendingRequestIds` outside React state and reconcile responses by id.
 */
export function sendFetchSampleRequest(
    client: StreamDeckPropertyInspectorClient,
    consumerSlug: string,
    url: string,
    requestSettings: CustomHttpSourceEditorRequestSettings,
    auth: CustomHttpSourceEditorRequestAuth,
    pendingRequestIds: RefObject<Map<string, SourceEditorCommand>>,
    setSourceEditorState: (state: SourceEditorState) => void,
): void {
    const requestId = createRequestId();
    pendingRequestIds.current.set(requestId, "fetchSample");
    setSourceEditorState({ kind: "pending", command: "fetchSample" });
    sendCustomHttpSourceEditorRequest(client, buildCustomHttpSourceEditorFetchSampleRequest({
        requestId,
        consumerSlug,
        url,
        requestSettings,
        auth,
    })).catch((error: Error) => {
        pendingRequestIds.current.delete(requestId);
        setSourceEditorState({
            kind: "failed",
            command: "fetchSample",
            stage: "send",
            detail: error.message,
        });
    });
}

/**
 * Sends a transform test command while preserving the last fetched sample UI.
 *
 * The plugin owns the real cached sample; PI state keeps only a preview so the
 * editor can keep useful context visible while the transform check is pending.
 */
export function sendTransformTestRequest(
    client: StreamDeckPropertyInspectorClient,
    consumerSlug: string,
    url: string,
    jqTransform: string,
    requestSettings: CustomHttpSourceEditorRequestSettings,
    auth: CustomHttpSourceEditorRequestAuth,
    pendingRequestIds: RefObject<Map<string, SourceEditorCommand>>,
    setSourceEditorState: Dispatch<SetStateAction<SourceEditorState>>,
): void {
    const requestId = createRequestId();
    pendingRequestIds.current.set(requestId, "testTransform");
    setSourceEditorState(previousState => ({
        kind: "pending",
        command: "testTransform",
        ...(readSampleState(previousState) === undefined ? {} : { sample: readSampleState(previousState) }),
    }));
    sendCustomHttpSourceEditorRequest(client, buildCustomHttpSourceEditorTestTransformRequest({
        requestId,
        consumerSlug,
        url,
        jqTransform,
        requestSettings,
        auth,
    })).catch((error: Error) => {
        pendingRequestIds.current.delete(requestId);
        setSourceEditorState(previousState => ({
            kind: "failed",
            command: "testTransform",
            stage: "send",
            detail: error.message,
            ...(readSampleState(previousState) === undefined ? {} : { sample: readSampleState(previousState) }),
        }));
    });
}

/**
 * Applies a validated plugin response to the source editor state machine.
 */
export function applySourceEditorResponse(
    previousState: SourceEditorState,
    url: string,
    response: CustomHttpSourceEditorResponse,
): SourceEditorState {
    if (response.command === "fetchSample") {
        return response.result.ok
            ? {
                kind: "sampleReady",
                sample: {
                    url,
                    responseBytes: response.result.responseBytes,
                    elapsedMilliseconds: response.result.elapsedMilliseconds,
                    samplePreview: response.result.samplePreview,
                    isSamplePreviewTruncated: response.result.isSamplePreviewTruncated,
                    promptSample: response.result.promptSample,
                },
            }
            : {
                kind: "failed",
                command: "fetchSample",
                stage: response.result.stage,
                detail: response.result.detail,
                ...(response.result.blockedRedirect === undefined ? {} : {
                    blockedRedirect: response.result.blockedRedirect,
                }),
            };
    }

    if (!response.result.ok) {
        return {
            kind: "failed",
            command: "testTransform",
            stage: response.result.stage,
            detail: response.result.detail,
            ...(response.result.blockedRedirect === undefined ? {} : {
                blockedRedirect: response.result.blockedRedirect,
            }),
            ...(readSampleState(previousState) === undefined ? {} : { sample: readSampleState(previousState) }),
        };
    }

    const sample = readSampleState(previousState);
    if ("explorationOutput" in response.result) {
        return {
            kind: "explorationReady",
            sample: sample ?? {
                url,
                responseBytes: 0,
                elapsedMilliseconds: 0,
                samplePreview: "",
                isSamplePreviewTruncated: false,
                promptSample: { kind: "rawPreview", text: "", hasTruncatedInvalidJsonPreview: false },
            },
            explorationOutput: {
                text: response.result.explorationOutput,
                schemaFailureDetail: response.result.schemaFailureDetail,
            },
        };
    }

    return {
        kind: "metricReady",
        sample: sample ?? {
            url,
            responseBytes: 0,
            elapsedMilliseconds: 0,
            samplePreview: "",
            isSamplePreviewTruncated: false,
            promptSample: { kind: "rawPreview", text: "", hasTruncatedInvalidJsonPreview: false },
        },
        metric: response.result.metric,
    };
}

/**
 * Checks whether the editor has a fetched sample for the currently edited URL.
 */
export function hasCurrentSample(state: SourceEditorState, url: string): boolean {
    return readSampleState(state)?.url === url;
}

/**
 * Reads the preserved sample preview from any source editor state that can carry it.
 */
export function readSampleState(state: SourceEditorState): SampleState | undefined {
    switch (state.kind) {
        case "sampleReady":
        case "metricReady":
        case "explorationReady":
        case "failed":
        case "pending":
            return state.sample;
        case "idle":
            return undefined;
    }
}

function createRequestId(): string {
    nextRequestId += 1;
    return `custom-http-pi-${nextRequestId}`;
}
