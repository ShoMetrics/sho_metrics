import assert from "node:assert/strict";
import test from "node:test";
import {
    CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
    readCustomHttpSourceEditorRequest,
    readCustomHttpSourceEditorResponse,
} from "./custom-http-source-editor-messages";

test("Custom HTTP PI fetch sample request requires a consumer slug", () => {
    assert.deepEqual(readCustomHttpSourceEditorRequest({
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "request-1",
        consumerSlug: "dense-slot-1",
        url: "https://api.example.com/data",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: { allowPublicHttpCredentials: false },
    }), {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "request-1",
        consumerSlug: "dense-slot-1",
        url: "https://api.example.com/data",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: { credentialId: undefined, allowPublicHttpCredentials: false },
    });

    assert.equal(readCustomHttpSourceEditorRequest({
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "request-1",
        url: "https://api.example.com/data",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: { allowPublicHttpCredentials: false },
    }), undefined);
});

test("Custom HTTP PI fetch sample response accepts bounded timing metadata", () => {
    assert.deepEqual(readCustomHttpSourceEditorResponse({
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "request-1",
        result: {
            ok: true,
            responseBytes: 13,
            elapsedMilliseconds: 42,
            samplePreview: "{\"ok\":true}",
            isSamplePreviewTruncated: false,
            promptSample: {
                kind: "jsonSample",
                text: "{\"ok\":true}",
            },
        },
    }), {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "request-1",
        result: {
            ok: true,
            responseBytes: 13,
            elapsedMilliseconds: 42,
            samplePreview: "{\"ok\":true}",
            isSamplePreviewTruncated: false,
            promptSample: {
                kind: "jsonSample",
                text: "{\"ok\":true}",
            },
        },
    });
});

test("Custom HTTP PI fetch sample response rejects non-finite timing metadata", () => {
    assert.equal(readCustomHttpSourceEditorResponse({
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "request-1",
        result: {
            ok: true,
            responseBytes: 13,
            elapsedMilliseconds: Number.NaN,
            samplePreview: "{\"ok\":true}",
            isSamplePreviewTruncated: false,
            promptSample: {
                kind: "jsonSample",
                text: "{\"ok\":true}",
            },
        },
    }), undefined);
});

test("Custom HTTP PI transform response accepts exploration output", () => {
    assert.deepEqual(readCustomHttpSourceEditorResponse({
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: "request-1",
        result: {
            ok: true,
            explorationOutput: "[{\"Text\":\"GPU Core\"}]",
            schemaFailureDetail: "metric must be an object.",
        },
    }), {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: "request-1",
        result: {
            ok: true,
            explorationOutput: "[{\"Text\":\"GPU Core\"}]",
            schemaFailureDetail: "metric must be an object.",
        },
    });
});
