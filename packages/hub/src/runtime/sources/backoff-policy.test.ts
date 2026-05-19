import assert from "node:assert/strict";
import test from "node:test";
import { BackoffPolicy } from "./backoff-policy";

test("backoff policy blocks attempts until the recorded delay expires", () => {
    let currentTimestampMilliseconds = 1000;
    const backoffPolicy = new BackoffPolicy({
        now: () => currentTimestampMilliseconds,
        initialDelayMilliseconds: 2000,
        maximumDelayMilliseconds: 30000,
    });

    assert.equal(backoffPolicy.canAttempt(), true);
    assert.equal(backoffPolicy.recordFailure(), 2000);
    assert.equal(backoffPolicy.failureCount, 1);
    assert.equal(backoffPolicy.canAttempt(), false);
    assert.equal(backoffPolicy.remainingDelayMilliseconds(), 2000);

    currentTimestampMilliseconds = 3000;

    assert.equal(backoffPolicy.canAttempt(), true);
    assert.equal(backoffPolicy.remainingDelayMilliseconds(), 0);
});

test("backoff policy grows exponentially and caps at the maximum delay", () => {
    let currentTimestampMilliseconds = 0;
    const backoffPolicy = new BackoffPolicy({
        now: () => currentTimestampMilliseconds,
        initialDelayMilliseconds: 2000,
        maximumDelayMilliseconds: 10000,
        factor: 2.5,
    });

    assert.equal(backoffPolicy.recordFailure(), 2000);
    currentTimestampMilliseconds = 2000;
    assert.equal(backoffPolicy.recordFailure(), 5000);
    currentTimestampMilliseconds = 7000;
    assert.equal(backoffPolicy.recordFailure(), 10000);
    currentTimestampMilliseconds = 17000;
    assert.equal(backoffPolicy.recordFailure(), 10000);
});

test("backoff policy supports flat retry delays", () => {
    let currentTimestampMilliseconds = 0;
    const backoffPolicy = BackoffPolicy.flat(() => currentTimestampMilliseconds, 2000);

    assert.equal(backoffPolicy.recordFailure(), 2000);
    currentTimestampMilliseconds = 2000;
    assert.equal(backoffPolicy.recordFailure(), 2000);
    assert.equal(backoffPolicy.failureCount, 2);
});

test("backoff policy resets after success", () => {
    let currentTimestampMilliseconds = 1000;
    const backoffPolicy = new BackoffPolicy({
        now: () => currentTimestampMilliseconds,
        initialDelayMilliseconds: 2000,
        maximumDelayMilliseconds: 30000,
    });

    backoffPolicy.recordFailure();
    assert.equal(backoffPolicy.canAttempt(), false);

    backoffPolicy.recordSuccess();

    assert.equal(backoffPolicy.failureCount, 0);
    assert.equal(backoffPolicy.canAttempt(), true);
    currentTimestampMilliseconds = 2000;
    assert.equal(backoffPolicy.recordFailure(), 2000);
});
