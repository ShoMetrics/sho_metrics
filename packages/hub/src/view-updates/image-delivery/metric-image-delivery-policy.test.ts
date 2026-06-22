import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveMetricImageDeliveryPolicy } from "./metric-image-delivery-policy";

test("first render schedules near-term and trailing key image resends", () => {
    const policy = resolveMetricImageDeliveryPolicy({
        updateReason: "metric-tick",
        pollingIntervalMilliseconds: 1_000,
        isFirstRenderedImageForAction: true,
        currentAvailability: "fresh",
    });

    assert.deepEqual(policy.resendDelaysMilliseconds, [3_000, 5_000]);
    assert.equal(policy.forceSendUnchangedImage, true);
    assert.deepEqual(policy.reason, { kind: "first-render" });
});

test("first render also resends no-data images", () => {
    const policy = resolveMetricImageDeliveryPolicy({
        updateReason: "metric-tick",
        pollingIntervalMilliseconds: 1_000,
        isFirstRenderedImageForAction: true,
        currentAvailability: "no-data",
    });

    assert.deepEqual(policy.resendDelaysMilliseconds, [3_000, 5_000]);
    assert.deepEqual(policy.reason, { kind: "first-render" });
});

test("fresh short-poll updates do not add key image resends", () => {
    const policy = resolveMetricImageDeliveryPolicy({
        updateReason: "metric-tick",
        pollingIntervalMilliseconds: 4_999,
        isFirstRenderedImageForAction: false,
        currentAvailability: "fresh",
    });

    assert.deepEqual(policy.resendDelaysMilliseconds, []);
    assert.deepEqual(policy.reason, { kind: "none" });
});

test("sustained no-data updates do not add long-poll key image resends", () => {
    const policy = resolveMetricImageDeliveryPolicy({
        updateReason: "metric-tick",
        pollingIntervalMilliseconds: 1_800_000,
        isFirstRenderedImageForAction: false,
        currentAvailability: "no-data",
    });

    assert.deepEqual(policy.resendDelaysMilliseconds, []);
    assert.equal(policy.forceSendUnchangedImage, false);
    assert.deepEqual(policy.reason, { kind: "none" });
});

test("non-first no-data updates do not add long-poll key image resends", () => {
    const policy = resolveMetricImageDeliveryPolicy({
        updateReason: "metric-tick",
        pollingIntervalMilliseconds: 1_800_000,
        isFirstRenderedImageForAction: false,
        currentAvailability: "no-data",
    });

    assert.deepEqual(policy.resendDelaysMilliseconds, []);
    assert.equal(policy.forceSendUnchangedImage, false);
    assert.deepEqual(policy.reason, { kind: "none" });
});

test("fresh updates below ten minutes do not add key image resends", () => {
    const policy = resolveMetricImageDeliveryPolicy({
        updateReason: "metric-tick",
        pollingIntervalMilliseconds: 599_999,
        isFirstRenderedImageForAction: false,
        currentAvailability: "fresh",
    });

    assert.deepEqual(policy.resendDelaysMilliseconds, []);
    assert.deepEqual(policy.reason, { kind: "none" });
});

test("fresh updates at ten minutes schedule the long-poll resend policy", () => {
    const policy = resolveMetricImageDeliveryPolicy({
        updateReason: "metric-tick",
        pollingIntervalMilliseconds: 600_000,
        isFirstRenderedImageForAction: false,
        currentAvailability: "fresh",
    });

    assert.deepEqual(policy.resendDelaysMilliseconds, [1_000, 10_000, 60_000]);
    assert.deepEqual(policy.reason, {
        kind: "long-poll-interval-at-least",
        thresholdMilliseconds: 600_000,
    });
});

test("settings changes force one unchanged image send without delayed resends", () => {
    const policy = resolveMetricImageDeliveryPolicy({
        updateReason: "settings-change",
        pollingIntervalMilliseconds: 1_000,
        isFirstRenderedImageForAction: false,
        currentAvailability: "fresh",
    });

    assert.deepEqual(policy.resendDelaysMilliseconds, []);
    assert.equal(policy.forceSendUnchangedImage, true);
    assert.deepEqual(policy.reason, { kind: "settings-change" });
});
