import assert from "node:assert/strict";
import { test } from "vitest";
import {
    extractRichTagNames,
    extractPlaceholderNames,
    formatMessage,
    parseRichMessageSegments,
    validateLocalizedMessageTags,
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

test("parses non-nested rich-text tags without interpreting surrounding text", () => {
    assert.deepEqual(parseRichMessageSegments("If <helper>ShoMetrics Helper</helper> is installed."), [
        { kind: "text", text: "If " },
        { kind: "tag", name: "helper", text: "ShoMetrics Helper" },
        { kind: "text", text: " is installed." },
    ]);
});

test("validates rich-text tag names and syntax across locales", () => {
    assert.deepEqual(extractRichTagNames("<helper>ShoMetrics Helper</helper>"), ["helper"]);

    assert.deepEqual(validateLocalizedMessageTags({
        en: "If <helper>Helper</helper> is installed.",
        zh_CN: "如果已安装<helper>Helper</helper>。",
        ja: "<helper>Helper</helper> がインストールされています。",
    }), []);

    assert.deepEqual(validateLocalizedMessageTags({
        en: "If <helper>Helper</helper> is installed.",
        zh_CN: "如果已安装<download>Helper</download>。",
        ja: "<helper>Helper</helper> がインストールされています。",
    }), ["zh_CN rich tag mismatch"]);

    assert.deepEqual(validateLocalizedMessageTags({
        en: "If <helper>Helper</helper> is installed.",
        zh_CN: "如果已安装<helper>Helper</download>。",
        ja: "<helper>Helper</helper> がインストールされています。",
    }), ["zh_CN invalid rich tag syntax"]);

    assert.deepEqual(validateLocalizedMessageTags({
        en: "If <helper></helper> is installed.",
        zh_CN: "如果已安装<helper>Helper</helper>。",
        ja: "<helper>Helper</helper> がインストールされています。",
    }), ["en invalid rich tag syntax"]);

    assert.deepEqual(validateLocalizedMessageTags({
        en: "If <helper><em>Helper</em></helper> is installed.",
        zh_CN: "如果已安装<helper>Helper</helper>。",
        ja: "<helper>Helper</helper> がインストールされています。",
    }), ["en invalid rich tag syntax"]);
});
