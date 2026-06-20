/**
 * OpenLogi-isomorphic one-shot inventory retry orchestration.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hid/src/inventory.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 */

import {
    OPENLOGI_HIDPP_ONESHOT_RETRY_DELAY_MILLISECONDS,
    shouldRetryOpenLogiOneShotEnumeration,
} from "./openlogi-hidpp-transport";

export interface OpenLogiInventoryEnumerationResult<Inventory> {
    readonly inventories: readonly Inventory[];
    readonly allNodesHealthy: boolean;
}

export interface OpenLogiInventoryEnumerationRuntime<Inventory> {
    enumerateReportingHealth(): Promise<OpenLogiInventoryEnumerationResult<Inventory>>;
    sleep(milliseconds: number): Promise<void>;
}

/**
 * Retries one-shot inventory enumeration through transient unhealthy probes.
 *
 * OpenLogi's long-running watcher lets the node ledger replay a previous
 * snapshot. A one-shot caller starts with an empty ledger, so OpenLogi retries a
 * few times with the same enumerator before returning an empty or partial list.
 */
export async function enumerateOpenLogiInventoryOnce<Inventory>(
    runtime: OpenLogiInventoryEnumerationRuntime<Inventory>,
): Promise<readonly Inventory[]> {
    for (let attempt = 1; ; attempt += 1) {
        const result = await runtime.enumerateReportingHealth();
        if (!shouldRetryOpenLogiOneShotEnumeration({
            allNodesHealthy: result.allNodesHealthy,
            attempt,
        })) {
            return result.inventories;
        }

        await runtime.sleep(OPENLOGI_HIDPP_ONESHOT_RETRY_DELAY_MILLISECONDS);
    }
}
