import { LRUCache } from "lru-cache";

export type RefreshableCacheReadResult<T> =
    | RefreshableCacheAvailableResult<T>
    | RefreshableCacheUnavailableResult;

export interface RefreshableCacheAvailableResult<T> {
    readonly state: "fresh" | "stale";
    readonly value: Awaited<T>;
    readonly storedAtMonotonicMilliseconds: number;
    readonly ageMilliseconds: number;
    readonly error?: unknown;
}

export interface RefreshableCacheUnavailableResult {
    readonly state: "unavailable";
    readonly storedAtMonotonicMilliseconds: number | null;
    readonly ageMilliseconds: number | null;
    readonly error?: unknown;
}

export interface RefreshableCacheOptions<T> {
    /**
     * Monotonic timestamp provider for TTL/staleness checks.
     */
    readonly now: () => number;
    readonly ttlMilliseconds: number;
    readonly maximumStaleMilliseconds: number;
    readonly refresh: () => Promise<T>;
}

interface RefreshableCacheEntry<T> {
    readonly value: Awaited<T>;
    readonly storedAtMonotonicMilliseconds: number;
}

const CACHE_KEY = "value";

/**
 * Caches async collector results with TTL, in-flight refresh dedupe, and
 * stale-on-refresh-error semantics.
 *
 * `lru-cache` supplies mature storage and fetch coalescing, but its TTL is not
 * a strong freshness contract: expired entries are not preemptively pruned by
 * default. Keep ShoMetrics freshness policy in this facade so source callers
 * only see `fresh`, `stale`, or `unavailable` based on explicit timestamps and
 * max-stale budgets, not raw LRU/TTL behavior.
 */
export class RefreshableCache<T> {
    private readonly cache: LRUCache<string, RefreshableCacheEntry<T>>;
    private pendingRefreshPromise: Promise<RefreshableCacheReadResult<T>> | null = null;

    public constructor(private readonly options: RefreshableCacheOptions<T>) {
        this.cache = new LRUCache({
            max: 1,
            ttl: Number.isFinite(options.maximumStaleMilliseconds)
                ? options.maximumStaleMilliseconds
                : undefined,
            allowStaleOnFetchRejection: true,
            noDeleteOnStaleGet: true,
            perf: {
                now: options.now,
            },
            fetchMethod: async () => ({
                value: await options.refresh(),
                storedAtMonotonicMilliseconds: options.now(),
            }),
        });
    }

    public current(): RefreshableCacheReadResult<T> {
        const cachedEntry = this.cache.peek(CACHE_KEY, { allowStale: true });
        return this.buildResult(cachedEntry);
    }

    public hasPendingRefresh(): boolean {
        return this.pendingRefreshPromise !== null;
    }

    public async read(): Promise<RefreshableCacheReadResult<T>> {
        const currentResult = this.current();
        if (currentResult.state === "fresh") {
            return currentResult;
        }

        if (this.pendingRefreshPromise) {
            return this.pendingRefreshPromise;
        }

        this.pendingRefreshPromise = this.refresh()
            .finally(() => {
                this.pendingRefreshPromise = null;
            });

        return this.pendingRefreshPromise;
    }

    private async refresh(): Promise<RefreshableCacheReadResult<T>> {
        const status: LRUCache.Status<string, RefreshableCacheEntry<T>> = {};
        const cachedEntry = await this.cache.fetch(CACHE_KEY, {
            forceRefresh: true,
            status,
        });

        return this.buildResult(cachedEntry, status.fetchError);
    }

    private buildResult(
        cachedEntry: RefreshableCacheEntry<T> | undefined,
        error?: unknown,
    ): RefreshableCacheReadResult<T> {
        if (!cachedEntry) {
            return {
                state: "unavailable",
                storedAtMonotonicMilliseconds: null,
                ageMilliseconds: null,
                ...(error === undefined ? {} : { error }),
            };
        }

        const ageMilliseconds = this.options.now() - cachedEntry.storedAtMonotonicMilliseconds;

        if (ageMilliseconds < this.options.ttlMilliseconds) {
            return {
                state: "fresh",
                value: cachedEntry.value,
                storedAtMonotonicMilliseconds: cachedEntry.storedAtMonotonicMilliseconds,
                ageMilliseconds,
                ...(error === undefined ? {} : { error }),
            };
        }

        if (ageMilliseconds < this.options.maximumStaleMilliseconds) {
            return {
                state: "stale",
                value: cachedEntry.value,
                storedAtMonotonicMilliseconds: cachedEntry.storedAtMonotonicMilliseconds,
                ageMilliseconds,
                ...(error === undefined ? {} : { error }),
            };
        }

        return {
            state: "unavailable",
            storedAtMonotonicMilliseconds: cachedEntry.storedAtMonotonicMilliseconds,
            ageMilliseconds,
            ...(error === undefined ? {} : { error }),
        };
    }
}
