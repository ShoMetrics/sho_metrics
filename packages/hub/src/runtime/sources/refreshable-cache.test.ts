import assert from "node:assert/strict";
import test from "node:test";
import { RefreshableCache } from "./refreshable-cache";

test("refreshable cache returns fresh cached values without refreshing", async () => {
    let currentTimestampMilliseconds = 1000;
    let refreshCount = 0;
    const cache = new RefreshableCache<string>({
        now: () => currentTimestampMilliseconds,
        ttlMilliseconds: 10000,
        maximumStaleMilliseconds: 30000,
        refresh: async () => {
            refreshCount += 1;
            return `value-${refreshCount}`;
        },
    });

    const firstResult = await cache.read();
    currentTimestampMilliseconds = 5000;
    const secondResult = await cache.read();

    assert.equal(firstResult.state, "fresh");
    assert.equal(firstResult.value, "value-1");
    assert.equal(secondResult.state, "fresh");
    assert.equal(secondResult.value, "value-1");
    assert.equal(secondResult.ageMilliseconds, 4000);
    assert.equal(refreshCount, 1);
});

test("refreshable cache coalesces overlapping refreshes", async () => {
    let resolveRefresh: (value: string) => void = () => {
        throw new Error("Refresh resolver was not initialized");
    };
    let refreshCount = 0;
    const cache = new RefreshableCache<string>({
        now: () => 1000,
        ttlMilliseconds: 10000,
        maximumStaleMilliseconds: 30000,
        refresh: () => {
            refreshCount += 1;
            return new Promise<string>(resolve => {
                resolveRefresh = resolve;
            });
        },
    });

    const firstReadPromise = cache.read();
    const secondReadPromise = cache.read();
    assert.equal(refreshCount, 1);
    assert.equal(cache.hasPendingRefresh(), true);

    resolveRefresh("coalesced");
    const [firstResult, secondResult] = await Promise.all([firstReadPromise, secondReadPromise]);

    assert.equal(firstResult.state, "fresh");
    assert.equal(firstResult.value, "coalesced");
    assert.equal(secondResult.state, "fresh");
    assert.equal(secondResult.value, "coalesced");
    assert.equal(cache.hasPendingRefresh(), false);
});

test("refreshable cache returns stale cached value when refresh fails inside stale budget", async () => {
    let currentTimestampMilliseconds = 1000;
    let shouldFail = false;
    const cache = new RefreshableCache<string>({
        now: () => currentTimestampMilliseconds,
        ttlMilliseconds: 10000,
        maximumStaleMilliseconds: 30000,
        refresh: async () => {
            if (shouldFail) {
                throw new Error("refresh failed");
            }

            return "last-good";
        },
    });

    await cache.read();
    currentTimestampMilliseconds = 15000;
    shouldFail = true;
    const staleResult = await cache.read();

    assert.equal(staleResult.state, "stale");
    assert.equal(staleResult.value, "last-good");
    assert.equal(staleResult.ageMilliseconds, 14000);
    assert.ok(staleResult.error instanceof Error);
});

test("refreshable cache returns unavailable when stale budget expires", async () => {
    let currentTimestampMilliseconds = 1000;
    let shouldFail = false;
    const cache = new RefreshableCache<string>({
        now: () => currentTimestampMilliseconds,
        ttlMilliseconds: 10000,
        maximumStaleMilliseconds: 30000,
        refresh: async () => {
            if (shouldFail) {
                throw new Error("refresh failed");
            }

            return "expired";
        },
    });

    await cache.read();
    currentTimestampMilliseconds = 31000;
    shouldFail = true;
    const unavailableResult = await cache.read();

    assert.equal(unavailableResult.state, "unavailable");
    assert.equal(unavailableResult.ageMilliseconds, 30000);
    assert.ok(unavailableResult.error instanceof Error);
});

test("refreshable cache returns unavailable on cold refresh failure", async () => {
    const cache = new RefreshableCache<string>({
        now: () => 1000,
        ttlMilliseconds: 10000,
        maximumStaleMilliseconds: 30000,
        refresh: async () => {
            throw new Error("cold failure");
        },
    });

    const result = await cache.read();

    assert.equal(result.state, "unavailable");
    assert.equal(result.ageMilliseconds, null);
    assert.ok(result.error instanceof Error);
});
