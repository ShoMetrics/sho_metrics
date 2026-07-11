import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { I18nProvider, useI18n } from "./react";

const helperMessage = {
    en: "If <helper>ShoMetrics Helper</helper> is installed.",
    zh_CN: "如果已安装 <helper>ShoMetrics Helper</helper>。",
    ja: "<helper>ShoMetrics Helper</helper> がインストールされています。",
};

test("renders rich tags in each locale's word order", () => {
    const markup = renderToStaticMarkup(createElement(
        I18nProvider,
        {
            locale: "ja",
            children: createElement(RichMessageFixture),
        },
    ));

    assert.equal(markup, "<a href=\"#helper\">ShoMetrics Helper</a> がインストールされています。");
});

test("renders an unconfigured rich tag as text", () => {
    const markup = renderToStaticMarkup(createElement(
        I18nProvider,
        {
            locale: "en",
            children: createElement(UnconfiguredRichMessageFixture),
        },
    ));

    assert.equal(markup, "If ShoMetrics Helper is installed.");
});

test("does not let placeholder values synthesize rich tags", () => {
    const markup = renderToStaticMarkup(createElement(
        I18nProvider,
        {
            locale: "en",
            children: createElement(PlaceholderRichMessageFixture),
        },
    ));

    assert.equal(markup, "Source: &lt;helper&gt;evil&lt;/helper&gt;");
});

function RichMessageFixture(): React.ReactNode {
    const { rich } = useI18n();

    return rich(helperMessage, {
        helper: (children) => createElement("a", { href: "#helper" }, children),
    });
}

function UnconfiguredRichMessageFixture(): React.ReactNode {
    const { rich } = useI18n();
    return rich(helperMessage, {});
}

function PlaceholderRichMessageFixture(): React.ReactNode {
    const { rich } = useI18n();

    return rich({
        en: "Source: {name}",
        zh_CN: "来源：{name}",
        ja: "ソース: {name}",
    }, {
        helper: (children) => createElement("a", { href: "#helper" }, children),
    }, {
        name: "<helper>evil</helper>",
    });
}
