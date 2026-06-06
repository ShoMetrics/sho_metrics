import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHubLocale } from "./locale";

test("normalizes Stream Deck languages to the Hub v1 locale set", () => {
    assert.equal(normalizeHubLocale("en"), "en");
    assert.equal(normalizeHubLocale("zh_CN"), "zh_CN");
    assert.equal(normalizeHubLocale("ja"), "ja");
    assert.equal(normalizeHubLocale("zh_TW"), "en");
    assert.equal(normalizeHubLocale("fr"), "en");
    assert.equal(normalizeHubLocale(undefined), "en");
});

