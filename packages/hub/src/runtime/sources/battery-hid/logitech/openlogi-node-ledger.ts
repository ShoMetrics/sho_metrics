/**
 * OpenLogi-isomorphic per-node probe-health ledger.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hid/src/node_ledger.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 */

// Failed probes mean "could not check this node", not "the device is gone".
// Vanished HID nodes are handled separately by `retainNodes()`.
export const OPENLOGI_NODE_MISS_GRACE = 3;

// Repeated unhealthy probes evict the open channel before the replay grace ends,
// forcing the next tick to reopen the HID handles.
export const OPENLOGI_CHANNEL_EVICT_AFTER = 2;

export interface OpenLogiSettledNode<Snapshot> {
    readonly snapshot?: Snapshot;
    readonly evictChannel: boolean;
}

/**
 * Replays a node's last completed inventory through transient probe failures.
 *
 * OpenLogi stores a `DeviceInventory` here. This port keeps the payload generic
 * so the behavior is isomorphic without importing OpenLogi's app data model.
 */
export class OpenLogiNodeLedger<NodeKey, Snapshot> {
    private readonly lastGoodSnapshotByNode = new Map<NodeKey, Snapshot>();
    private readonly failureCountByNode = new Map<NodeKey, number>();

    settle(input: {
        readonly nodeKey: NodeKey;
        readonly healthy: boolean;
        readonly liveSnapshot?: Snapshot;
    }): OpenLogiSettledNode<Snapshot> {
        if (input.healthy) {
            this.failureCountByNode.delete(input.nodeKey);
            if (input.liveSnapshot === undefined) {
                this.lastGoodSnapshotByNode.delete(input.nodeKey);
                return {
                    evictChannel: false,
                };
            }

            this.lastGoodSnapshotByNode.set(input.nodeKey, input.liveSnapshot);
            return {
                snapshot: input.liveSnapshot,
                evictChannel: false,
            };
        }

        const failureCount = (this.failureCountByNode.get(input.nodeKey) ?? 0) + 1;
        this.failureCountByNode.set(input.nodeKey, failureCount);
        const lastGoodSnapshot = this.lastGoodSnapshotByNode.get(input.nodeKey);
        if (lastGoodSnapshot !== undefined && failureCount <= OPENLOGI_NODE_MISS_GRACE) {
            // Replay bounded last-good inventory through transient sleeps,
            // host-switches, or receiver timeouts.
            return {
                snapshot: lastGoodSnapshot,
                evictChannel: failureCount >= OPENLOGI_CHANNEL_EVICT_AFTER,
            };
        }

        if (lastGoodSnapshot !== undefined) {
            this.lastGoodSnapshotByNode.delete(input.nodeKey);
        }

        return {
            ...snapshotField(input.liveSnapshot),
            evictChannel: failureCount >= OPENLOGI_CHANNEL_EVICT_AFTER,
        };
    }

    retainNodes(seenNodeKeys: ReadonlySet<NodeKey>): void {
        for (const nodeKey of this.lastGoodSnapshotByNode.keys()) {
            if (!seenNodeKeys.has(nodeKey)) {
                this.lastGoodSnapshotByNode.delete(nodeKey);
            }
        }

        for (const nodeKey of this.failureCountByNode.keys()) {
            if (!seenNodeKeys.has(nodeKey)) {
                this.failureCountByNode.delete(nodeKey);
            }
        }
    }
}

function snapshotField<Snapshot>(snapshot: Snapshot | undefined): Pick<OpenLogiSettledNode<Snapshot>, "snapshot"> {
    return snapshot === undefined ? {} : { snapshot };
}
