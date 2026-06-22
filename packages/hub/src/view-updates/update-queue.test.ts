import assert from "node:assert/strict";
import { test } from "vitest";
import { MetricViewUpdateQueue } from "./update-queue";

test("settings changes are dequeued before ordinary metric ticks", () => {
    const queue = new MetricViewUpdateQueue();

    queue.enqueue("metric-a", "metric-tick");
    queue.enqueue("metric-b", "metric-tick");
    queue.enqueue("settings-a", "settings-change");

    assert.equal(queue.dequeue(), "settings-a");
    assert.equal(queue.dequeue(), "metric-a");
    assert.equal(queue.dequeue(), "metric-b");
    assert.equal(queue.dequeue(), undefined);
});

test("settings change promotes an already queued metric tick without duplicating it", () => {
    const queue = new MetricViewUpdateQueue();

    queue.enqueue("action-a", "metric-tick");
    queue.enqueue("action-b", "metric-tick");
    queue.enqueue("action-a", "settings-change");

    assert.equal(queue.length, 2);
    assert.equal(queue.dequeue(), "action-a");
    assert.equal(queue.dequeue(), "action-b");
    assert.equal(queue.dequeue(), undefined);
});

test("metric ticks do not demote an already queued settings change", () => {
    const queue = new MetricViewUpdateQueue();

    queue.enqueue("action-a", "settings-change");
    queue.enqueue("action-b", "metric-tick");
    queue.enqueue("action-a", "metric-tick");

    assert.equal(queue.length, 2);
    assert.equal(queue.dequeue(), "action-a");
    assert.equal(queue.dequeue(), "action-b");
});

test("remove drops queued action ids from either priority lane", () => {
    const queue = new MetricViewUpdateQueue();

    queue.enqueue("settings-a", "settings-change");
    queue.enqueue("metric-a", "metric-tick");
    queue.remove("settings-a");
    queue.remove("metric-a");

    assert.equal(queue.length, 0);
    assert.equal(queue.has("settings-a"), false);
    assert.equal(queue.has("metric-a"), false);
});
