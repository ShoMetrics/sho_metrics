import assert from "node:assert/strict";
import { test } from "vitest";
import { ProcessResumeDetector, type ProcessResumeEvent } from "./process-resume-detector";

test("process resume detector emits after a large wall-clock gap", () => {
    const detector = new ProcessResumeDetector(90_000);
    const events: ProcessResumeEvent[] = [];
    detector.subscribe(event => {
        events.push(event);
    });

    assert.equal(detector.observe("render", 1_000), undefined);
    assert.equal(detector.observe("render", 60_000), undefined);
    const event = detector.observe("render", 151_000);

    assert.deepEqual(event, {
        owner: "render",
        gapMilliseconds: 91_000,
        observedAtTimestampMilliseconds: 151_000,
        previousObservedAtTimestampMilliseconds: 60_000,
    });
    assert.deepEqual(events, [event]);
});

test("process resume detector updates the baseline after emitting", () => {
    const detector = new ProcessResumeDetector(90_000);

    detector.observe("render", 1_000);
    const resumeEvent = detector.observe("render", 100_000);
    const normalEvent = detector.observe("render", 101_000);

    assert.ok(resumeEvent);
    assert.equal(normalEvent, undefined);
});

test("process resume detector unsubscribe stops notifications", () => {
    const detector = new ProcessResumeDetector(90_000);
    const events: ProcessResumeEvent[] = [];
    const unsubscribe = detector.subscribe(event => {
        events.push(event);
    });

    detector.observe("render", 1_000);
    unsubscribe();
    detector.observe("render", 100_000);

    assert.deepEqual(events, []);
});
