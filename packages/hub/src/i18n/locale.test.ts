import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeHubLocale, resolveHubLocale } from "./locale";

test("normalizes Stream Deck languages to the Hub v1 locale set", () => {
    assert.equal(normalizeHubLocale("en"), "en");
    assert.equal(normalizeHubLocale("zh_CN"), "zh_CN");
    assert.equal(normalizeHubLocale("ja"), "ja");
    assert.equal(normalizeHubLocale("zh_TW"), "en");
    assert.equal(normalizeHubLocale("fr"), "en");
    assert.equal(normalizeHubLocale(undefined), "en");
});

test("resolves to Stream Deck language normalization when no build-time override is active", () => {
    assert.equal(resolveHubLocale("en"), normalizeHubLocale("en"));
    assert.equal(resolveHubLocale("zh_CN"), normalizeHubLocale("zh_CN"));
    assert.equal(resolveHubLocale("ja"), normalizeHubLocale("ja"));
    assert.equal(resolveHubLocale("zh_TW"), normalizeHubLocale("zh_TW"));
});
