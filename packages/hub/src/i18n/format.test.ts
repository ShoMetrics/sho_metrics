import assert from "node:assert/strict";
import test from "node:test";
import {
    extractPlaceholderNames,
    formatMessage,
    validateLocalizedMessagePlaceholders,
} from "./format";

test("formats localized messages with simple placeholders", () => {
    const message = {
        en: "Open {scope} settings",
        zh_CN: "打开{scope}设置",
        ja: "{scope}設定を開く",
    };

    assert.equal(formatMessage("en", message, { scope: "widget" }), "Open widget settings");
    assert.equal(formatMessage("zh_CN", message, { scope: "组件" }), "打开组件设置");
    assert.equal(formatMessage("ja", message, { scope: "ウィジェット" }), "ウィジェット設定を開く");
});

test("removes missing placeholders instead of showing raw braces in production text", () => {
    const message = {
        en: "Open {scope} settings",
        zh_CN: "打开{scope}设置",
        ja: "{scope}設定を開く",
    };

    assert.equal(formatMessage("en", message), "Open  settings");
});

test("throws on missing placeholders when strict formatting is enabled", () => {
    const message = {
        en: "Open {scope} settings",
        zh_CN: "打开{scope}设置",
        ja: "{scope}設定を開く",
    };

    assert.throws(
        () => formatMessage("en", message, {}, true),
        /Missing i18n placeholder value: scope/,
    );
});

test("extracts and validates placeholder names across locales", () => {
    assert.deepEqual(extractPlaceholderNames("{scope} {count} {scope}"), ["count", "scope"]);

    assert.deepEqual(validateLocalizedMessagePlaceholders({
        en: "Open {scope} settings",
        zh_CN: "打开{scope}设置",
        ja: "{scope}設定を開く",
    }), []);

    assert.deepEqual(validateLocalizedMessagePlaceholders({
        en: "Open {scope} settings",
        zh_CN: "打开设置",
        ja: "{scope}設定を開く",
    }), ["zh_CN"]);
});
