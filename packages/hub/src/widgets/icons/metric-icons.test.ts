import assert from "node:assert/strict";
import { test } from "vitest";
import { GENERATED_METRIC_LUCIDE_ICON_ENTRIES } from "../../generated/metric-lucide-search-index.generated";
import {
    METRIC_ICON_SEARCH_RESULT_LIMIT,
    searchMetricIconOptions,
} from "./metric-icon-search";
import {
    getMetricIconFragment,
    isMetricIconId,
} from "./metric-icons";

test("generated metric Lucide icon index covers the full icon set", () => {
    assert.equal(GENERATED_METRIC_LUCIDE_ICON_ENTRIES.length > 1000, true);

    for (const entry of GENERATED_METRIC_LUCIDE_ICON_ENTRIES) {
        assert.equal(typeof entry.id, "string");
        assert.equal(typeof entry.label, "string");
        assert.equal(typeof entry.exportName, "string");
        assert.equal(Array.isArray(entry.terms), true);
        assert.equal(entry.id.length > 0, true);
        assert.equal(entry.label.length > 0, true);
        assert.equal(entry.exportName.length > 0, true);
        assert.equal(entry.terms.length > 0, true);
        assert.equal(isMetricIconId(entry.id), true);
    }
});

test("generated metric Lucide icon search terms are lower-case", () => {
    for (const entry of GENERATED_METRIC_LUCIDE_ICON_ENTRIES) {
        for (const term of entry.terms) {
            assert.equal(term, term.toLowerCase());
        }
    }
});

test("metric icon search hides autocomplete results for empty query", () => {
    const searchResult = searchMetricIconOptions("");

    assert.equal(searchResult.options.length, 0);
    assert.equal(searchResult.totalMatchCount, 0);
});

test("metric icon search lowercases queries and uses Lucide metadata terms", () => {
    const searchResult = searchMetricIconOptions("4k");
    const upperCaseSearchResult = searchMetricIconOptions("TV");

    assert.equal(searchResult.options.some(option => option.id === "tv"), true);
    assert.equal(upperCaseSearchResult.options.some(option => option.id === "tv"), true);
});

test("metric icon search matches substrings inside metadata terms", () => {
    const searchResult = searchMetricIconOptions("igh-definition");

    assert.equal(searchResult.options.some(option => option.id === "tv"), true);
});

test("metric icon search keeps DOM results bounded", () => {
    const searchResult = searchMetricIconOptions("c");

    assert.equal(searchResult.options.length, METRIC_ICON_SEARCH_RESULT_LIMIT);
    assert.equal(searchResult.totalMatchCount > METRIC_ICON_SEARCH_RESULT_LIMIT, true);
});

test("metric icon renderer resolves generated Lucide ids", () => {
    assert.match(getMetricIconFragment("tv") ?? "", /<rect/);
    assert.match(getMetricIconFragment("circle-gauge") ?? "", /<path/);
});
