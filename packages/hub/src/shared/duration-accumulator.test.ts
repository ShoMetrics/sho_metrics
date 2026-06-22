import assert from "node:assert/strict";
import { test } from "vitest";
import {
    addDurationSample,
    createDurationAccumulator,
    summarizeDuration,
} from "./duration-accumulator";

test("duration accumulator summarizes samples and ignores null durations", () => {
    const durationAccumulator = createDurationAccumulator();

    addDurationSample(durationAccumulator, 10);
    addDurationSample(durationAccumulator, null);
    addDurationSample(durationAccumulator, 30);

    assert.deepEqual(summarizeDuration(durationAccumulator), {
        count: 2,
        averageMilliseconds: 20,
        maximumMilliseconds: 30,
    });
});

test("empty duration accumulator summarizes unknown durations", () => {
    const durationAccumulator = createDurationAccumulator();

    assert.deepEqual(summarizeDuration(durationAccumulator), {
        count: 0,
        averageMilliseconds: null,
        maximumMilliseconds: null,
    });
});
