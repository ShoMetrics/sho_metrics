import assert from "node:assert/strict";
import test from "node:test";
import {
    buildMetricImageResendJitterKey,
    computeStableMetricImageResendJitterMilliseconds,
} from "./metric-image-resend-jitter";

test("metric image resend jitter key is based on physical device key slot", () => {
    assert.equal(buildMetricImageResendJitterKey({
        deviceId: "device-a",
        controller: "Keypad",
        row: 2,
        column: 3,
    }), "device-a:Keypad:2:3");

    assert.notEqual(
        buildMetricImageResendJitterKey({
            deviceId: "device-a",
            controller: "Keypad",
            row: 2,
            column: 3,
        }),
        buildMetricImageResendJitterKey({
            deviceId: "device-a",
            controller: "Keypad",
            row: 2,
            column: 4,
        }),
    );

    assert.notEqual(
        buildMetricImageResendJitterKey({
            deviceId: "device-a",
            controller: "Keypad",
            row: 1,
            column: 1,
        }),
        buildMetricImageResendJitterKey({
            deviceId: "device-b",
            controller: "Keypad",
            row: 1,
            column: 1,
        }),
    );
});

test("metric image resend jitter is bounded", () => {
    const jitterKey = buildMetricImageResendJitterKey({
        deviceId: "device-a",
        controller: "Keypad",
        row: 1,
        column: 4,
    });
    const jitterMilliseconds = computeStableMetricImageResendJitterMilliseconds(jitterKey, 3_000);

    assert.equal(jitterMilliseconds >= 0, true);
    assert.equal(jitterMilliseconds < 3_000, true);
});

test("metric image resend jitter degrades to zero for invalid windows", () => {
    const jitterKey = "0:0";

    assert.equal(computeStableMetricImageResendJitterMilliseconds(jitterKey, 0), 0);
    assert.equal(computeStableMetricImageResendJitterMilliseconds(jitterKey, -1), 0);
    assert.equal(computeStableMetricImageResendJitterMilliseconds(jitterKey, 1.5), 0);
});
