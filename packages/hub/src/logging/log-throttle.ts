/**
 * Resolves production-only log throttling.
 *
 * Development and staging builds keep logs unthrottled so local diagnosis can
 * follow rapid event sequences. Production builds use the caller-owned interval
 * to keep repeated failures and bursty lifecycle events bounded.
 */
export function resolveProductionLogThrottleMilliseconds(productionMilliseconds: number): number {
    return typeof __BUILD_MODE__ !== "undefined" && __BUILD_MODE__ === "production"
        ? productionMilliseconds
        : 0;
}
