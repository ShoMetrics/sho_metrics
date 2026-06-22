import assert from "node:assert/strict";
import { test } from "vitest";
import {
    estimateCustomHttpWorstCaseFetchMilliseconds,
    resolveCustomHttpFetchPolicy,
    resolveCustomHttpRetryDelayMilliseconds,
} from "./custom-http-request-policy";

test("Custom HTTP fetch policy resolves defaults and clamps unsafe values", () => {
    assert.deepEqual(resolveCustomHttpFetchPolicy({}), { timeoutSeconds: 5, retryCount: 0 });
    assert.deepEqual(
        resolveCustomHttpFetchPolicy({ timeoutSeconds: 999, retryCount: 999 }),
        { timeoutSeconds: 30, retryCount: 3 },
    );
    assert.deepEqual(
        resolveCustomHttpFetchPolicy({ timeoutSeconds: -1, retryCount: -1 }),
        { timeoutSeconds: 1, retryCount: 0 },
    );
});

test("Custom HTTP retry delay uses capped exponential backoff with jitter", () => {
    assert.equal(resolveCustomHttpRetryDelayMilliseconds(0, () => 0.5), 500);
    assert.equal(resolveCustomHttpRetryDelayMilliseconds(1, () => 0.5), 1000);
    assert.equal(resolveCustomHttpRetryDelayMilliseconds(2, () => 0.5), 2000);
    assert.equal(resolveCustomHttpRetryDelayMilliseconds(3, () => 0.5), 2000);
    assert.equal(resolveCustomHttpRetryDelayMilliseconds(0, () => 0), 400);
    assert.equal(resolveCustomHttpRetryDelayMilliseconds(0, () => 1), 600);
});

test("Custom HTTP worst-case estimate includes every attempt and maximum retry jitter", () => {
    assert.equal(
        estimateCustomHttpWorstCaseFetchMilliseconds({ timeoutSeconds: 30, retryCount: 3 }),
        30_000 * 4 + 600 + 1200 + 2400 + 750,
    );
});
