import assert from "node:assert/strict";
import test from "node:test";
import { OpenLogiPendingResponseQueue } from "./openlogi-hidpp-channel";

test("OpenLogi pending response queue removes a request when its response matches", () => {
    const queue = new OpenLogiPendingResponseQueue();
    queue.addPendingResponse(report => report[0] === 0x20);

    assert.deepEqual(queue.matchIncomingResponse([0x20]), {
        matched: true,
        pendingResponseId: 1,
    });
    assert.equal(queue.pendingResponseCount(), 0);
});

test("OpenLogi pending response queue timeout removes only its own request", () => {
    const queue = new OpenLogiPendingResponseQueue();
    const timedOut = queue.addPendingResponse(report => report[0] === 0x20);
    queue.addPendingResponse(report => report[0] === 0x21);

    queue.removePendingResponse(timedOut);

    assert.deepEqual(queue.matchIncomingResponse([0x21]), {
        matched: true,
        pendingResponseId: 2,
    });
    assert.equal(queue.pendingResponseCount(), 0);
});

test("OpenLogi pending response queue ignores late responses after timeout", () => {
    const queue = new OpenLogiPendingResponseQueue();
    const listenerEvents: Array<{ readonly report: readonly number[]; readonly matched: boolean }> = [];
    queue.addMessageListener((report, matched) => listenerEvents.push({ report, matched }));
    const timedOut = queue.addPendingResponse(report => report[0] === 0x20);

    queue.removePendingResponse(timedOut);

    assert.deepEqual(queue.matchIncomingResponse([0x20]), {
        matched: false,
    });

    queue.addPendingResponse(report => report[0] === 0x40);
    assert.deepEqual(queue.matchIncomingResponse([0x40]), {
        matched: true,
        pendingResponseId: 2,
    });
    assert.deepEqual(listenerEvents, [
        {
            report: [0x20],
            matched: false,
        },
        {
            report: [0x40],
            matched: true,
        },
    ]);
});

test("OpenLogi pending response queue removes message listeners by handle", () => {
    const queue = new OpenLogiPendingResponseQueue();
    const listenerEvents: boolean[] = [];
    const listenerId = queue.addMessageListener((_report, matched) => listenerEvents.push(matched));

    assert.equal(queue.removeMessageListener(listenerId), true);
    assert.deepEqual(queue.matchIncomingResponse([0x20]), {
        matched: false,
    });

    assert.deepEqual(listenerEvents, []);
});
