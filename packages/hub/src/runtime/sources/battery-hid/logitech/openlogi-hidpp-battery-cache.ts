/**
 * OpenLogi-isomorphic HID++ battery probe cache.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hid/src/inventory.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 */

import type {
    OpenLogiHidppBatteryProbeResult,
    OpenLogiHidppBatterySession,
    OpenLogiHidppProbedFeatures,
} from "./openlogi-hidpp-battery-reader";
import type { LogitechReceiverSlot } from "./hidpp-protocol";

// The feature table contains immutable capability/model facts, so OpenLogi only
// re-walks it periodically as a self-healing path. Volatile battery state is
// refreshed on cache hits through the memoized battery feature index below.
export const OPENLOGI_HIDPP_REFRESH_TICKS = 15;

// A receiver timeout is not enough evidence to forget a device. OpenLogi keeps
// the completed probe briefly so a sleeping or host-switched device can replay
// last-known immutable facts instead of disappearing immediately.
export const OPENLOGI_HIDPP_CACHE_MISS_GRACE = 3;

interface OpenLogiCachedProbe {
    readonly probe: OpenLogiHidppProbedFeatures;
    /** Feature index for one-round-trip battery refresh without rewalking the feature table. */
    readonly batteryFeatureIndex?: number;
    readonly probedTick: number;
}

/** Caches OpenLogi probe data while refreshing volatile battery readings. */
export class OpenLogiHidppBatteryProbeCache {
    private readonly cachedProbeByKey = new Map<string, OpenLogiCachedProbe>();
    private readonly missCountByKey = new Map<string, number>();

    readBattery(input: {
        readonly session: OpenLogiHidppBatterySession;
        readonly cacheKey?: string;
        readonly receiverSlot: LogitechReceiverSlot;
        readonly online: boolean;
        readonly tick: number;
        readonly timeoutMilliseconds?: number;
    }): OpenLogiHidppBatteryProbeResult {
        const cached = input.cacheKey === undefined
            ? undefined
            : this.cachedProbeByKey.get(input.cacheKey);

        if (input.online && (cached === undefined || isOpenLogiCachedProbeStale(cached, input.tick))) {
            // Only successful feature-table walks replace the cache. A failed
            // re-probe falls back to last-known immutable data when available.
            const fresh = input.session.probeFeatures(input.receiverSlot, input.timeoutMilliseconds);
            if (fresh.state === "probe" && fresh.probe.featureIds !== undefined) {
                if (input.cacheKey !== undefined) {
                    this.cachedProbeByKey.set(input.cacheKey, {
                        probe: fresh.probe,
                        batteryFeatureIndex: fresh.probe.batteryFeatureIndex,
                        probedTick: input.tick,
                    });
                }

                return fresh;
            }

            return cached === undefined
                ? fresh
                : {
                    state: "probe",
                    probe: cached.probe,
                };
        }

        if (cached === undefined) {
            return {
                state: "probe",
                probe: {},
            };
        }

        if (input.online && cached.batteryFeatureIndex !== undefined && input.cacheKey !== undefined) {
            // Cached devices still get a fresh battery read; only the feature
            // discovery and identity fields are reused.
            const battery = input.session.readBatteryInfo(
                input.receiverSlot,
                cached.batteryFeatureIndex,
                input.timeoutMilliseconds,
            );
            if (battery.state === "battery") {
                const updated = {
                    ...cached,
                    probe: {
                        ...cached.probe,
                        battery: battery.battery,
                    },
                };
                this.cachedProbeByKey.set(input.cacheKey, updated);
                return {
                    state: "probe",
                    probe: updated.probe,
                };
            }
        }

        return {
            state: "probe",
            probe: cached.probe,
        };
    }

    evictUnseen(seenCacheKeys: ReadonlySet<string>): void {
        for (const cacheKey of this.cachedProbeByKey.keys()) {
            if (seenCacheKeys.has(cacheKey)) {
                this.missCountByKey.delete(cacheKey);
                continue;
            }

            const nextMissCount = (this.missCountByKey.get(cacheKey) ?? 0) + 1;
            if (nextMissCount > OPENLOGI_HIDPP_CACHE_MISS_GRACE) {
                this.cachedProbeByKey.delete(cacheKey);
                this.missCountByKey.delete(cacheKey);
                continue;
            }

            this.missCountByKey.set(cacheKey, nextMissCount);
        }
    }
}

export function isOpenLogiCachedProbeStale(
    cachedProbe: Pick<OpenLogiCachedProbe, "probedTick">,
    currentTick: number,
): boolean {
    return currentTick - cachedProbe.probedTick >= OPENLOGI_HIDPP_REFRESH_TICKS;
}
