import assert from "node:assert/strict";
import test from "node:test";
import { StatusEdgeDetector, type StatusEdgeDetectorEvent } from "./status-edge-detector";

test("status edge detector logs enter once for repeated no-data observations", () => {
    const detector = new StatusEdgeDetector();
    const events: string[] = [];

    observe(detector, "action:1:cpu", "noData", 1000, events);
    observe(detector, "action:1:cpu", "noData", 2000, events);

    assert.deepEqual(events, ["enter:0"]);
});

test("status edge detector logs sustained only after threshold and interval", () => {
    const detector = new StatusEdgeDetector();
    const events: string[] = [];

    observe(detector, "action:1:cpu", "noData", 1000, events);
    observe(detector, "action:1:cpu", "noData", 10_999, events);
    observe(detector, "action:1:cpu", "noData", 11_000, events);
    observe(detector, "action:1:cpu", "noData", 20_000, events);
    observe(detector, "action:1:cpu", "noData", 71_000, events);

    assert.deepEqual(events, [
        "enter:0",
        "sustained:10000",
        "sustained:70000",
    ]);
});

test("status edge detector logs recovery once when no-data returns to ok", () => {
    const detector = new StatusEdgeDetector();
    const events: string[] = [];

    observe(detector, "action:1:cpu", "noData", 1000, events);
    observe(detector, "action:1:cpu", "ok", 4000, events);
    observe(detector, "action:1:cpu", "ok", 5000, events);

    assert.deepEqual(events, [
        "enter:0",
        "recover:3000",
    ]);
});

test("status edge detector delete resets a key", () => {
    const detector = new StatusEdgeDetector();
    const events: string[] = [];

    observe(detector, "action:1:cpu", "noData", 1000, events);
    detector.delete("action:1:cpu");
    observe(detector, "action:1:cpu", "noData", 2000, events);

    assert.deepEqual(events, [
        "enter:0",
        "enter:0",
    ]);
});

test("status edge detector deleteByPrefix clears multiple action entries", () => {
    const detector = new StatusEdgeDetector();
    const events: string[] = [];

    observe(detector, "action:1:cpu", "noData", 1000, events);
    observe(detector, "action:1:gpu", "noData", 1000, events);
    observe(detector, "action:2:cpu", "noData", 1000, events);

    detector.deleteByPrefix("action:1:");

    assert.equal(detector.has("action:1:cpu"), false);
    assert.equal(detector.has("action:1:gpu"), false);
    assert.equal(detector.has("action:2:cpu"), true);
});

test("status edge detector is event fed and does not emit sustained without another observation", () => {
    const detector = new StatusEdgeDetector();
    const events: string[] = [];

    observe(detector, "action:1:cpu", "noData", 1000, events);

    assert.deepEqual(events, ["enter:0"]);
});

function observe(
    detector: StatusEdgeDetector,
    key: string,
    state: "ok" | "noData",
    nowMilliseconds: number,
    events: string[],
): void {
    detector.observe({
        key,
        state,
        nowMilliseconds,
        sustainedAfterMilliseconds: 10_000,
        sustainedLogIntervalMilliseconds: 60_000,
        logEnter: event => events.push(formatEvent("enter", event)),
        logSustained: event => events.push(formatEvent("sustained", event)),
        logRecover: event => events.push(formatEvent("recover", event)),
    });
}

function formatEvent(kind: string, event: StatusEdgeDetectorEvent): string {
    return `${kind}:${event.sustainedMilliseconds}`;
}
