import assert from "node:assert/strict";
import test from "node:test";
import { RingBuffer } from "./ring-buffer";

test("empty buffer has no values or latest sample", () => {
    const ringBuffer = new RingBuffer<number>(3);

    assert.deepEqual(ringBuffer.toArray(), []);
    assert.equal(ringBuffer.latest, undefined);
    assert.equal(ringBuffer.length, 0);
});

test("single value is returned as the latest chronological sample", () => {
    const ringBuffer = new RingBuffer<number>(3);

    ringBuffer.push(42);

    assert.deepEqual(ringBuffer.toArray(), [42]);
    assert.equal(ringBuffer.latest, 42);
    assert.equal(ringBuffer.length, 1);
});

test("capacity overflow keeps the newest values in chronological order", () => {
    const ringBuffer = new RingBuffer<number>(3);

    ringBuffer.push(1);
    ringBuffer.push(2);
    ringBuffer.push(3);
    ringBuffer.push(4);

    assert.deepEqual(ringBuffer.toArray(), [2, 3, 4]);
    assert.equal(ringBuffer.latest, 4);
    assert.equal(ringBuffer.length, 3);
});

test("wraparound preserves chronological order across multiple rotations", () => {
    const ringBuffer = new RingBuffer<string>(2);

    ringBuffer.push("first");
    ringBuffer.push("second");
    ringBuffer.push("third");
    ringBuffer.push("fourth");

    assert.deepEqual(ringBuffer.toArray(), ["third", "fourth"]);
    assert.equal(ringBuffer.latest, "fourth");
});
