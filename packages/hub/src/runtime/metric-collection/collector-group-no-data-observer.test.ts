import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveCollectorGroupNoDataLogLevel } from "./collector-group-no-data-observer";

test("collector group no-data recovery is informational", () => {
    assert.equal(resolveCollectorGroupNoDataLogLevel("collectorGroupNoDataEntered"), "warn");
    assert.equal(resolveCollectorGroupNoDataLogLevel("collectorGroupNoDataSustained"), "warn");
    assert.equal(resolveCollectorGroupNoDataLogLevel("collectorGroupNoDataRecovered"), "info");
});
