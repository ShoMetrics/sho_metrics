/**
 * OpenLogi-isomorphic stateful inventory enumerator over native HID nodes.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hid/src/inventory.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 *
 * This ports OpenLogi's enumerator state machine. The node opener is injected
 * so the isolated port can stay independent of ShoMetrics descriptor models.
 */

import {
    LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
    LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
    LOGITECH_HIDPP_SHORT_USAGE,
    LOGITECH_HIDPP_VENDOR_ID,
    LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
} from "./hidpp-protocol";
import {
    OPENLOGI_HIDPP_PROBE_BUDGET_MILLISECONDS,
} from "./openlogi-hidpp-transport";
import type {
    NativeHidDevice,
    NativeHidDeviceInfo,
    NativeHidModule,
} from "../native-hid-loader-internal";
import { OpenLogiHidppBatteryProbeCache } from "./openlogi-hidpp-battery-cache";
import { OpenLogiHidppBatterySession } from "./openlogi-hidpp-battery-reader";
import { enumerateOpenLogiInventoryOnce } from "./openlogi-inventory-enumerator";
import { OpenLogiNodeLedger } from "./openlogi-node-ledger";
import {
    isOpenLogiLogitechHidppLongCollection,
    isOpenLogiLongOnlyCollection,
    isOpenLogiReceiverChildSysfsPath,
    normalizeOpenLogiWindowsCollectionPath,
} from "./openlogi-hidpp-transport";
import {
    OpenLogiNativeHidppTransport,
    OpenLogiNativeReceiverWalkRuntime,
} from "./openlogi-native-hidpp-transport";
import {
    assembleOpenLogiDirectDevice,
    type OpenLogiReceiverInventoryLike,
} from "./openlogi-receiver-inventory";
import {
    type OpenLogiReceiverWalkResult,
    type OpenLogiReceiverWalkRuntime,
    walkOpenLogiBoltReceiver,
    walkOpenLogiUnifyingReceiver,
} from "./openlogi-receiver-walk";

export type OpenLogiNativeInventoryNodeKind = "bolt" | "unifying" | "direct";

export interface OpenLogiNativeInventoryCandidate {
    readonly nodeKey: string;
    readonly name: string;
    readonly vendorId: number;
    readonly productId: number;
    readonly nodeKind: OpenLogiNativeInventoryNodeKind;
}

export interface OpenLogiNativeInventoryOpenedNode extends OpenLogiNativeInventoryCandidate {
    readonly receiverWalkRuntime: OpenLogiReceiverWalkRuntime;
}

export interface OpenLogiNativeInventoryRuntime {
    enumerateCandidates(): readonly OpenLogiNativeInventoryCandidate[];
    openNode(
        candidate: OpenLogiNativeInventoryCandidate,
        batteryProbeCache: OpenLogiHidppBatteryProbeCache,
    ): OpenLogiNativeInventoryOpenedNode | undefined;
}

export interface OpenLogiNativeInventoryEnumerationResult {
    readonly inventories: readonly OpenLogiReceiverInventoryLike[];
    readonly allNodesHealthy: boolean;
}

interface OpenLogiNativeHidppNode {
    readonly candidate: OpenLogiNativeInventoryCandidate;
    readonly longReportPath: string;
    readonly shortReportPath?: string;
    readonly supportsShortReports: boolean;
    readonly supportsLongReports: boolean;
}

/** Builds the concrete native HID runtime used by the isolated OpenLogi port. */
export function createOpenLogiNativeInventoryRuntime(nativeHidModule: NativeHidModule): OpenLogiNativeInventoryRuntime {
    return new OpenLogiNodeHidInventoryRuntime(nativeHidModule);
}

/** Maintains OpenLogi's channel ledger and probe cache behavior across ticks. */
export class OpenLogiNativeInventoryEnumerator {
    private readonly openedNodeByKey = new Map<string, OpenLogiNativeInventoryOpenedNode>();
    private readonly batteryProbeCacheByNodeKey = new Map<string, OpenLogiHidppBatteryProbeCache>();
    private readonly nodeLedger = new OpenLogiNodeLedger<string, OpenLogiReceiverInventoryLike>();
    private tick = 0;

    constructor(private readonly runtime: OpenLogiNativeInventoryRuntime) {}

    async enumerate(): Promise<readonly OpenLogiReceiverInventoryLike[]> {
        // Keep the same enumerator across one-shot retries so the node ledger,
        // opened channels, and battery cache can warm up like OpenLogi's watcher.
        return enumerateOpenLogiInventoryOnce({
            enumerateReportingHealth: () => Promise.resolve(this.enumerateReportingHealth()),
            sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
        });
    }

    enumerateReportingHealth(): OpenLogiNativeInventoryEnumerationResult {
        this.tick = (this.tick + 1) >>> 0;
        const candidates = this.runtime.enumerateCandidates();
        const seenNodeKeys = new Set(candidates.map(candidate => candidate.nodeKey));
        // Vanished HID nodes are real disconnects. Probe failures for still-seen
        // nodes are handled by the ledger below instead of dropping the device.
        this.dropVanishedNodes(seenNodeKeys);

        const inventories: OpenLogiReceiverInventoryLike[] = [];
        const seenCacheKeys = new Set<string>();
        let allNodesHealthy = true;

        for (const candidate of candidates) {
            const openedNode = this.openOrReuseNode(candidate);
            if (openedNode === undefined) {
                allNodesHealthy = false;
                appendSettledInventory(inventories, this.nodeLedger.settle({
                    nodeKey: candidate.nodeKey,
                    healthy: false,
                }).snapshot);
                continue;
            }

            const probe = probeOpenLogiNativeInventoryNode(openedNode, this.tick);
            allNodesHealthy &&= probe.healthy;
            for (const seenCacheKey of probe.seenCacheKeys) {
                seenCacheKeys.add(seenCacheKey);
            }
            const settled = this.nodeLedger.settle({
                nodeKey: candidate.nodeKey,
                healthy: probe.healthy,
                liveSnapshot: probe.inventory,
            });
            if (settled.evictChannel) {
                // OpenLogi reopens channels after repeated unhealthy reads while
                // still replaying bounded last-good inventory for the node.
                this.closeOpenedNode(candidate.nodeKey);
            }
            appendSettledInventory(inventories, settled.snapshot);
        }
        for (const batteryProbeCache of this.batteryProbeCacheByNodeKey.values()) {
            batteryProbeCache.evictUnseen(seenCacheKeys);
        }

        return {
            inventories,
            allNodesHealthy,
        };
    }

    private openOrReuseNode(candidate: OpenLogiNativeInventoryCandidate): OpenLogiNativeInventoryOpenedNode | undefined {
        const openedNode = this.openedNodeByKey.get(candidate.nodeKey);
        if (openedNode !== undefined) {
            return openedNode;
        }

        const newlyOpenedNode = this.runtime.openNode(candidate, this.batteryProbeCacheForNode(candidate.nodeKey));
        if (newlyOpenedNode !== undefined) {
            this.openedNodeByKey.set(candidate.nodeKey, newlyOpenedNode);
        }

        return newlyOpenedNode;
    }

    private dropVanishedNodes(seenNodeKeys: ReadonlySet<string>): void {
        for (const nodeKey of this.openedNodeByKey.keys()) {
            if (!seenNodeKeys.has(nodeKey)) {
                this.closeOpenedNode(nodeKey);
                this.batteryProbeCacheByNodeKey.delete(nodeKey);
            }
        }

        this.nodeLedger.retainNodes(seenNodeKeys);
    }

    private closeOpenedNode(nodeKey: string): void {
        const openedNode = this.openedNodeByKey.get(nodeKey);
        if (openedNode !== undefined) {
            openedNode.receiverWalkRuntime.close?.();
            this.openedNodeByKey.delete(nodeKey);
        }
    }

    private batteryProbeCacheForNode(nodeKey: string): OpenLogiHidppBatteryProbeCache {
        const existing = this.batteryProbeCacheByNodeKey.get(nodeKey);
        if (existing !== undefined) {
            return existing;
        }

        const created = new OpenLogiHidppBatteryProbeCache();
        this.batteryProbeCacheByNodeKey.set(nodeKey, created);
        return created;
    }
}

class OpenLogiNodeHidInventoryRuntime implements OpenLogiNativeInventoryRuntime {
    private nodeByKey = new Map<string, OpenLogiNativeHidppNode>();

    constructor(private readonly nativeHidModule: NativeHidModule) {}

    enumerateCandidates(): readonly OpenLogiNativeInventoryCandidate[] {
        const nodes = enumerateOpenLogiNativeHidppNodes(this.nativeHidModule.devices());
        this.nodeByKey = new Map(nodes.map(node => [node.candidate.nodeKey, node]));
        return nodes.map(node => node.candidate);
    }

    openNode(
        candidate: OpenLogiNativeInventoryCandidate,
        batteryProbeCache: OpenLogiHidppBatteryProbeCache,
    ): OpenLogiNativeInventoryOpenedNode | undefined {
        const node = this.nodeByKey.get(candidate.nodeKey);
        if (node === undefined) {
            return undefined;
        }

        const longReportDevice = openNativeHidDevice(this.nativeHidModule, node.longReportPath);
        if (longReportDevice === undefined) {
            return undefined;
        }

        const shortReportDevice = node.shortReportPath === undefined
            ? undefined
            : openNativeHidDevice(this.nativeHidModule, node.shortReportPath);

        const supportsShortReports = node.supportsShortReports &&
            (node.shortReportPath === undefined || shortReportDevice !== undefined);
        const readDevices = shortReportDevice === undefined
            ? [longReportDevice]
            : [shortReportDevice, longReportDevice];
        const transport = new OpenLogiNativeHidppTransport(
            {
                shortReportDevice: supportsShortReports ? shortReportDevice ?? longReportDevice : undefined,
                longReportDevice,
            },
            readDevices,
            {
                supportsShortReports,
                supportsLongReports: node.supportsLongReports,
            },
        );

        return {
            ...candidate,
            receiverWalkRuntime: new OpenLogiNativeReceiverWalkRuntime(
                transport,
                new OpenLogiHidppBatterySession(transport),
                batteryProbeCache,
            ),
        };
    }
}

function probeOpenLogiNativeInventoryNode(
    openedNode: OpenLogiNativeInventoryOpenedNode,
    tick: number,
): OpenLogiReceiverWalkResult {
    switch (openedNode.nodeKind) {
        case "bolt":
            return walkOpenLogiBoltReceiver({
                runtime: openedNode.receiverWalkRuntime,
                vendorId: openedNode.vendorId,
                productId: openedNode.productId,
                tick,
            });
        case "unifying":
            return walkOpenLogiUnifyingReceiver({
                runtime: openedNode.receiverWalkRuntime,
                vendorId: openedNode.vendorId,
                productId: openedNode.productId,
                tick,
            });
        case "direct": {
            // Direct HID++ devices use self index `0xff`. The probe budget keeps
            // an unresponsive Bluetooth or wired node from wedging enumeration.
            const probe = openedNode.receiverWalkRuntime.readBatteryProbe({
                receiverSlot: LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
                cacheKey: `direct:${openedNode.nodeKey}`,
                online: true,
                tick,
                timeoutMilliseconds: OPENLOGI_HIDPP_PROBE_BUDGET_MILLISECONDS,
            });
            const assembly = assembleOpenLogiDirectDevice({
                nodeId: openedNode.nodeKey,
                name: openedNode.name,
                vendorId: openedNode.vendorId,
                productId: openedNode.productId,
                probe: probe.state === "probe" ? probe.probe : {},
            });
            return {
                inventory: assembly.inventory,
                healthy: assembly.healthy,
                seenCacheKeys: new Set([assembly.cacheKey]),
            };
        }
    }
}

function enumerateOpenLogiNativeHidppNodes(
    devices: readonly NativeHidDeviceInfo[],
): readonly OpenLogiNativeHidppNode[] {
    const shortReportPathByNodeKey = new Map<string, string>();
    for (const device of devices) {
        if (isOpenLogiShortCollection(device)) {
            const path = device.path;
            if (path !== undefined) {
                shortReportPathByNodeKey.set(buildOpenLogiNativeNodeKey(path), path);
            }
        }
    }

    const nodes: OpenLogiNativeHidppNode[] = [];
    for (const device of devices) {
        if (!isOpenLogiNativeHidppLongDevice(device)) {
            continue;
        }

        const path = device.path;
        if (path === undefined) {
            continue;
        }

        const nodeKey = buildOpenLogiNativeNodeKey(path);
        const longOnly = isOpenLogiLongOnlyCollection({
            usagePage: device.usagePage ?? 0,
            usageId: device.usage ?? 0,
        });
        // The long collection is the canonical node. When a sibling short
        // collection exists, native transport writes short reports there and
        // falls back to long reports for long-only nodes.
        nodes.push({
            candidate: {
                nodeKey,
                name: device.product ?? "Logitech HID++ device",
                vendorId: device.vendorId ?? 0,
                productId: device.productId ?? 0,
                nodeKind: resolveOpenLogiNativeNodeKind(device.productId ?? 0),
            },
            longReportPath: path,
            shortReportPath: shortReportPathByNodeKey.get(nodeKey),
            supportsShortReports: !longOnly,
            supportsLongReports: true,
        });
    }

    return nodes;
}

function isOpenLogiNativeHidppLongDevice(device: NativeHidDeviceInfo): boolean {
    const path = device.path;
    return isOpenLogiLogitechHidppLongCollection({
        vendorId: device.vendorId ?? 0,
        usagePage: device.usagePage ?? 0,
        usageId: device.usage ?? 0,
    }) && (path === undefined || !isOpenLogiReceiverChildSysfsPath(path));
}

function isOpenLogiShortCollection(device: NativeHidDeviceInfo): boolean {
    return (device.vendorId ?? 0) === LOGITECH_HIDPP_VENDOR_ID &&
        (device.usagePage ?? 0) === 0xFF00 &&
        (device.usage ?? 0) === LOGITECH_HIDPP_SHORT_USAGE;
}

function resolveOpenLogiNativeNodeKind(productId: number): OpenLogiNativeInventoryNodeKind {
    if (productId === LOGITECH_BOLT_RECEIVER_PRODUCT_ID) {
        return "bolt";
    }

    if (productId === LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID ||
        productId === LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID) {
        return "unifying";
    }

    return "direct";
}

function buildOpenLogiNativeNodeKey(path: string): string {
    return path.includes("#")
        ? normalizeOpenLogiWindowsCollectionPath(path)
        : path;
}

function openNativeHidDevice(
    nativeHidModule: NativeHidModule,
    path: string,
): NativeHidDevice | undefined {
    try {
        return new nativeHidModule.HID(path, { nonExclusive: true });
    } catch {
        return undefined;
    }
}

function appendSettledInventory(
    inventories: OpenLogiReceiverInventoryLike[],
    inventory: OpenLogiReceiverInventoryLike | undefined,
): void {
    if (inventory !== undefined) {
        inventories.push(inventory);
    }
}
