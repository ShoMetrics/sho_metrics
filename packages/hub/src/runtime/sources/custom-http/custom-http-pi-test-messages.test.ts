import assert from "node:assert/strict";
import test from "node:test";
import {
    CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
    readCustomHttpPiTestResponse,
} from "./custom-http-pi-test-messages";

test("Custom HTTP PI fetch sample response accepts bounded timing metadata", () => {
    assert.deepEqual(readCustomHttpPiTestResponse({
        type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "request-1",
        result: {
            ok: true,
            responseBytes: 13,
            elapsedMilliseconds: 42,
            samplePreview: "{\"ok\":true}",
            isSamplePreviewTruncated: false,
        },
    }), {
        type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "request-1",
        result: {
            ok: true,
            responseBytes: 13,
            elapsedMilliseconds: 42,
            samplePreview: "{\"ok\":true}",
            isSamplePreviewTruncated: false,
        },
    });
});

test("Custom HTTP PI fetch sample response rejects non-finite timing metadata", () => {
    assert.equal(readCustomHttpPiTestResponse({
        type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "request-1",
        result: {
            ok: true,
            responseBytes: 13,
            elapsedMilliseconds: Number.NaN,
            samplePreview: "{\"ok\":true}",
            isSamplePreviewTruncated: false,
        },
    }), undefined);
});
