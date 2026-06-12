import assert from "node:assert/strict";
import { test } from "node:test";
import { GENERATED_CUSTOM_METRIC_LUCIDE_ICON_ENTRIES } from "../../generated/custom-metric-lucide-search-index.generated";
import {
    CUSTOM_METRIC_ICON_SEARCH_RESULT_LIMIT,
    formatCustomMetricIconPromptList,
    searchCustomMetricIconOptions,
} from "./custom-metric-icon-search";
import {
    getCustomMetricIconFragment,
    isCustomMetricIconId,
} from "./custom-metric-icons";

test("generated Custom Metric Lucide icon index covers the full icon set", () => {
    assert.equal(GENERATED_CUSTOM_METRIC_LUCIDE_ICON_ENTRIES.length > 1000, true);

    for (const entry of GENERATED_CUSTOM_METRIC_LUCIDE_ICON_ENTRIES) {
        assert.equal(typeof entry.id, "string");
        assert.equal(typeof entry.label, "string");
        assert.equal(typeof entry.exportName, "string");
        assert.equal(Array.isArray(entry.terms), true);
        assert.equal(entry.id.length > 0, true);
        assert.equal(entry.label.length > 0, true);
        assert.equal(entry.exportName.length > 0, true);
        assert.equal(entry.terms.length > 0, true);
        assert.equal(isCustomMetricIconId(entry.id), true);
    }
});

test("generated Custom Metric Lucide icon search terms are lower-case", () => {
    for (const entry of GENERATED_CUSTOM_METRIC_LUCIDE_ICON_ENTRIES) {
        for (const term of entry.terms) {
            assert.equal(term, term.toLowerCase());
        }
    }
});

test("Custom Metric icon search hides autocomplete results for empty query", () => {
    const searchResult = searchCustomMetricIconOptions("");

    assert.equal(searchResult.options.length, 0);
    assert.equal(searchResult.totalMatchCount, 0);
});

test("Custom Metric icon search lowercases queries and uses Lucide metadata terms", () => {
    const searchResult = searchCustomMetricIconOptions("4k");
    const upperCaseSearchResult = searchCustomMetricIconOptions("TV");

    assert.equal(searchResult.options.some(option => option.id === "tv"), true);
    assert.equal(upperCaseSearchResult.options.some(option => option.id === "tv"), true);
});

test("Custom Metric icon search matches substrings inside metadata terms", () => {
    const searchResult = searchCustomMetricIconOptions("igh-definition");

    assert.equal(searchResult.options.some(option => option.id === "tv"), true);
});

test("Custom Metric icon search keeps DOM results bounded", () => {
    const searchResult = searchCustomMetricIconOptions("c");

    assert.equal(searchResult.options.length, CUSTOM_METRIC_ICON_SEARCH_RESULT_LIMIT);
    assert.equal(searchResult.totalMatchCount > CUSTOM_METRIC_ICON_SEARCH_RESULT_LIMIT, true);
});

test("Custom Metric prompt icon examples stay short", () => {
    const promptList = formatCustomMetricIconPromptList();

    assert.equal(promptList.includes("thermometer"), true);
    assert.equal(promptList.includes("tv"), true);
    assert.equal(promptList.split(", ").length <= 25, true);
});

test("Custom Metric icon renderer resolves generated Lucide ids", () => {
    assert.match(getCustomMetricIconFragment("tv") ?? "", /<rect/);
    assert.match(getCustomMetricIconFragment("circle-gauge") ?? "", /<path/);
});
