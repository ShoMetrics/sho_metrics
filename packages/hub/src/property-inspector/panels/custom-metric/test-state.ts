import type {
    Dispatch,
    RefObject,
    SetStateAction,
} from "react";
import {
    CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
    type CustomHttpPiRequestSettings,
    type CustomHttpPiTestResponse,
} from "../../../runtime/sources/custom-http/custom-http-pi-test-messages";
import type { StreamDeckPropertyInspectorClient } from "../../stream-deck/stream-deck-client";
import type { SampleState, TestCommand, TestState } from "./types";

let nextRequestId = 0;

export function sendFetchSampleRequest(
    client: StreamDeckPropertyInspectorClient,
    url: string,
    requestSettings: CustomHttpPiRequestSettings,
    pendingRequestIds: RefObject<Map<string, TestCommand>>,
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
        requestSettings,
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

export function sendTransformTestRequest(
    client: StreamDeckPropertyInspectorClient,
    url: string,
    jqTransform: string,
    requestSettings: CustomHttpPiRequestSettings,
    pendingRequestIds: RefObject<Map<string, TestCommand>>,
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
        requestSettings,
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

export function applyTestResponse(
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
                    elapsedMilliseconds: response.result.elapsedMilliseconds,
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
            elapsedMilliseconds: 0,
            samplePreview: "",
            isSamplePreviewTruncated: false,
        },
        metric: response.result.metric,
    };
}

export function hasCurrentSample(state: TestState, url: string): boolean {
    return readSampleState(state)?.url === url;
}

export function readSampleState(state: TestState): SampleState | undefined {
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

function createRequestId(): string {
    nextRequestId += 1;
    return `custom-http-pi-${nextRequestId}`;
}
