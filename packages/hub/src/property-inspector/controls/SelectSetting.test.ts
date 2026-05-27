import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectSetting } from "./SelectSetting";
import {
    findFirstEnabledOptionIndex,
    findLastEnabledOptionIndex,
    findEnabledOptionIndexByTextPrefix,
    moveActiveOptionIndex,
    normalizeRepeatedCharacterSearchText,
    resolveActiveOptionIndex,
} from "./select-navigation";
import { resolveSelectListboxLayout } from "./select-layout";
import type { SelectOption } from "../inspector/types";

const colorModeOptions = [
    { value: "range", label: "Range Colors" },
    { value: "solid", label: "Solid Color" },
    { value: "black-white", label: "Black & White" },
] as const satisfies readonly SelectOption[];

test("custom select renders a combobox without native select markup", () => {
    const markup = renderToStaticMarkup(createElement(SelectSetting, {
        label: "Color Mode",
        value: "black-white",
        optionList: colorModeOptions,
        onValueChange: () => undefined,
    }));

    assert.doesNotMatch(markup, /<select/);
    assert.match(markup, /role="combobox"/);
    assert.match(markup, /aria-haspopup="listbox"/);
    assert.match(markup, /<label id="[^"]+-label" for="[^"]+">Color Mode:<\/label>/);
    assert.match(markup, /aria-labelledby="[^"]+-label [^"]+-value"/);
    assert.match(markup, /Black &amp; White/);
    assert.doesNotMatch(markup, /screen-reader-only/);
});

test("custom select can render the selected option preview", () => {
    const markup = renderToStaticMarkup(createElement(SelectSetting, {
        label: "Variant",
        value: "solid",
        optionList: colorModeOptions,
        buildOptionPreviewUri: (value) => `data:image/svg+xml,${value}`,
        optionPreviewSizePixels: 32,
        onValueChange: () => undefined,
    }));

    assert.match(markup, /data-has-preview="true"/);
    assert.match(markup, /--custom-select-preview-size:32px/);
    assert.match(markup, /--custom-select-option-height:40px/);
    assert.match(markup, /class="custom-select-preview" src="data:image\/svg\+xml,solid"/);
});

test("custom select navigation skips disabled options without wrapping", () => {
    const optionList = [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta", disabled: true },
        { value: "c", label: "Charlie" },
    ] as const satisfies readonly SelectOption[];

    assert.equal(moveActiveOptionIndex({
        optionList,
        activeOptionIndex: 0,
        direction: "next",
    }), 2);
    assert.equal(moveActiveOptionIndex({
        optionList,
        activeOptionIndex: 2,
        direction: "next",
    }), 2);
    assert.equal(moveActiveOptionIndex({
        optionList,
        activeOptionIndex: 2,
        direction: "previous",
    }), 0);
    assert.equal(moveActiveOptionIndex({
        optionList,
        activeOptionIndex: 0,
        direction: "previous",
    }), 0);
});

test("custom select navigation resolves first and last enabled options", () => {
    const optionList = [
        { value: "a", label: "Alpha", disabled: true },
        { value: "b", label: "Beta" },
        { value: "c", label: "Charlie", disabled: true },
        { value: "d", label: "Delta" },
    ] as const satisfies readonly SelectOption[];

    assert.equal(findFirstEnabledOptionIndex(optionList), 1);
    assert.equal(findLastEnabledOptionIndex(optionList), 3);
});

test("custom select navigation handles an empty enabled option set", () => {
    const optionList = [
        { value: "a", label: "Alpha", disabled: true },
        { value: "b", label: "Beta", disabled: true },
    ] as const satisfies readonly SelectOption[];

    assert.equal(findFirstEnabledOptionIndex(optionList), -1);
    assert.equal(findLastEnabledOptionIndex(optionList), -1);
    assert.equal(resolveActiveOptionIndex(optionList, "a"), -1);
});

test("custom select active option falls back to the first enabled option", () => {
    const optionList = [
        { value: "a", label: "Alpha", disabled: true },
        { value: "b", label: "Beta" },
        { value: "c", label: "Charlie" },
    ] as const satisfies readonly SelectOption[];

    assert.equal(resolveActiveOptionIndex(optionList, "a"), 1);
    assert.equal(resolveActiveOptionIndex(optionList, "missing"), 1);
    assert.equal(resolveActiveOptionIndex(optionList, "c"), 2);
});

test("custom select typeahead ignores disabled options and supports repeated letters", () => {
    const optionList = [
        { value: "a", label: "Alpha" },
        { value: "ap", label: "Apricot", disabled: true },
        { value: "b", label: "Beta" },
        { value: "br", label: "Bravo" },
    ] as const satisfies readonly SelectOption[];

    assert.equal(findEnabledOptionIndexByTextPrefix({
        optionList,
        searchText: "ap",
        startIndex: 1,
    }), -1);
    assert.equal(findEnabledOptionIndexByTextPrefix({
        optionList,
        searchText: "br",
        startIndex: 0,
    }), 3);
    assert.equal(findEnabledOptionIndexByTextPrefix({
        optionList,
        searchText: "al",
        startIndex: 2,
    }), 0);
    assert.equal(normalizeRepeatedCharacterSearchText("bbb"), "b");
});

test("custom select layout opens below when the viewport has room", () => {
    assert.deepEqual(resolveSelectListboxLayout({
        optionCount: 3,
        triggerRect: {
            bottom: 128,
            top: 100,
        },
        viewportHeight: 500,
    }), {
        maxHeight: 92,
        placement: "bottom",
    });
});

test("custom select layout shows polling frequency options without forced scrolling", () => {
    assert.deepEqual(resolveSelectListboxLayout({
        optionCount: 8,
        triggerRect: {
            bottom: 120,
            top: 92,
        },
        viewportHeight: 520,
    }), {
        maxHeight: 232,
        placement: "bottom",
    });
});

test("custom select layout uses the caller option height", () => {
    assert.deepEqual(resolveSelectListboxLayout({
        optionCount: 2,
        optionHeightPixels: 40,
        triggerRect: {
            bottom: 120,
            top: 92,
        },
        viewportHeight: 520,
    }), {
        maxHeight: 88,
        placement: "bottom",
    });
});

test("custom select layout opens above when the bottom edge would clip the listbox", () => {
    assert.deepEqual(resolveSelectListboxLayout({
        optionCount: 4,
        triggerRect: {
            bottom: 388,
            top: 360,
        },
        viewportHeight: 420,
    }), {
        maxHeight: 120,
        placement: "top",
    });
});

test("custom select layout limits height to the available viewport space", () => {
    assert.deepEqual(resolveSelectListboxLayout({
        optionCount: 10,
        triggerRect: {
            bottom: 48,
            top: 20,
        },
        viewportHeight: 110,
    }), {
        maxHeight: 51,
        placement: "bottom",
    });
});
