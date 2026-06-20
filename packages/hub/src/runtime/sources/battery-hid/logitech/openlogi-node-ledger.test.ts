import assert from "node:assert/strict";
import test from "node:test";
import {
    OPENLOGI_CHANNEL_EVICT_AFTER,
    OPENLOGI_NODE_MISS_GRACE,
    OpenLogiNodeLedger,
} from "./openlogi-node-ledger";

test("OpenLogi node ledger replays the last good snapshot within the grace window", () => {
    const ledger = new OpenLogiNodeLedger<number, string>();
    ledger.settle({ nodeKey: 1, healthy: true, liveSnapshot: "bolt" });

    for (let failureCount = 0; failureCount < OPENLOGI_NODE_MISS_GRACE; failureCount += 1) {
        assert.deepEqual(ledger.settle({ nodeKey: 1, healthy: false }), {
            snapshot: "bolt",
            evictChannel: failureCount + 1 >= OPENLOGI_CHANNEL_EVICT_AFTER,
        });
    }
});

test("OpenLogi node ledger expires replay grace to the live result", () => {
    const ledger = new OpenLogiNodeLedger<number, string>();
    ledger.settle({ nodeKey: 1, healthy: true, liveSnapshot: "bolt" });
    for (let failureCount = 0; failureCount < OPENLOGI_NODE_MISS_GRACE; failureCount += 1) {
        ledger.settle({ nodeKey: 1, healthy: false });
    }

    assert.deepEqual(ledger.settle({
        nodeKey: 1,
        healthy: false,
        liveSnapshot: "partial",
    }), {
        snapshot: "partial",
        evictChannel: true,
    });
    assert.deepEqual(ledger.settle({ nodeKey: 1, healthy: false }), {
        evictChannel: true,
    });
});

test("OpenLogi node ledger healthy tick resets the failure count", () => {
    const ledger = new OpenLogiNodeLedger<number, string>();
    ledger.settle({ nodeKey: 1, healthy: true, liveSnapshot: "bolt" });
    for (let failureCount = 0; failureCount < OPENLOGI_NODE_MISS_GRACE; failureCount += 1) {
        ledger.settle({ nodeKey: 1, healthy: false });
    }

    ledger.settle({ nodeKey: 1, healthy: true, liveSnapshot: "bolt" });

    assert.deepEqual(ledger.settle({ nodeKey: 1, healthy: false }), {
        snapshot: "bolt",
        evictChannel: false,
    });
});

test("OpenLogi node ledger requests channel eviction from the threshold onward", () => {
    const ledger = new OpenLogiNodeLedger<number, string>();
    ledger.settle({ nodeKey: 1, healthy: true, liveSnapshot: "bolt" });

    for (let failureCount = 1; failureCount <= OPENLOGI_NODE_MISS_GRACE + 2; failureCount += 1) {
        assert.equal(
            ledger.settle({ nodeKey: 1, healthy: false }).evictChannel,
            failureCount >= OPENLOGI_CHANNEL_EVICT_AFTER,
        );
    }

    assert.equal(ledger.settle({
        nodeKey: 1,
        healthy: true,
        liveSnapshot: "bolt",
    }).evictChannel, false);
});

test("OpenLogi node ledger healthy empty result clears replay state", () => {
    const ledger = new OpenLogiNodeLedger<number, string>();
    ledger.settle({ nodeKey: 1, healthy: true, liveSnapshot: "bolt" });
    ledger.settle({ nodeKey: 1, healthy: true });

    assert.deepEqual(ledger.settle({ nodeKey: 1, healthy: false }), {
        evictChannel: false,
    });
});

test("OpenLogi node ledger drops vanished nodes", () => {
    const ledger = new OpenLogiNodeLedger<number, string>();
    ledger.settle({ nodeKey: 1, healthy: true, liveSnapshot: "kept" });
    ledger.settle({ nodeKey: 2, healthy: true, liveSnapshot: "gone" });

    ledger.retainNodes(new Set([1]));

    assert.equal(ledger.settle({ nodeKey: 1, healthy: false }).snapshot, "kept");
    assert.deepEqual(ledger.settle({ nodeKey: 2, healthy: false }), {
        evictChannel: false,
    });
});
