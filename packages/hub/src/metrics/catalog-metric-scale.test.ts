import assert from "node:assert/strict";
import test from "node:test";
import { MetricUnit } from "../runtime/sources/metric-source";
import {
    readCatalogMetricMaximumInputValue,
    resolveCatalogMetricDefaultMaximumValue,
    resolveCatalogMetricMaximumInputLabel,
    resolveCatalogMetricMaximumInputMaximum,
    writeCatalogMetricMaximumInputValue,
} from "./catalog-metric-scale";

test("catalog metric default maximums use detected unit category and reading", () => {
    assert.equal(resolveCatalogMetricDefaultMaximumValue(MetricUnit.PERCENT, "gpu", "temperature"), 100);
    assert.equal(resolveCatalogMetricDefaultMaximumValue(MetricUnit.WATTS, "cpu", "power"), 250);
    assert.equal(resolveCatalogMetricDefaultMaximumValue(MetricUnit.WATTS, "gpu", "power"), 450);
    assert.equal(resolveCatalogMetricDefaultMaximumValue(MetricUnit.HERTZ, "gpu", "clock"), 3_000_000_000);
    assert.equal(resolveCatalogMetricDefaultMaximumValue(MetricUnit.BYTES, "memory", "data"), 64 * 1024 ** 3);
    assert.equal(resolveCatalogMetricDefaultMaximumValue(MetricUnit.BYTES, "gpu", "data"), 32 * 1024 ** 3);
    assert.equal(resolveCatalogMetricDefaultMaximumValue(MetricUnit.SECONDS, "memory", "timing"), 100e-9);
    assert.equal(
        resolveCatalogMetricDefaultMaximumValue(MetricUnit.BYTES_PER_SECOND, "network", "throughput"),
        125 * 1000 ** 2,
    );
});

test("catalog metric maximum input converts readable units to stored raw values", () => {
    assert.equal(resolveCatalogMetricMaximumInputLabel(MetricUnit.BYTES, "memory"), "Max (GB)");
    assert.equal(
        readCatalogMetricMaximumInputValue(64 * 1024 ** 3, MetricUnit.BYTES, "memory"),
        64,
    );
    assert.equal(
        writeCatalogMetricMaximumInputValue(64, MetricUnit.BYTES, "memory"),
        64 * 1024 ** 3,
    );
    assert.equal(resolveCatalogMetricMaximumInputLabel(MetricUnit.HERTZ, "cpu"), "Max (GHz)");
    assert.equal(readCatalogMetricMaximumInputValue(3_000_000_000, MetricUnit.HERTZ, "cpu"), 3);
    assert.equal(writeCatalogMetricMaximumInputValue(3, MetricUnit.HERTZ, "cpu"), 3_000_000_000);
});

test("catalog metric throughput maximum input uses network decimal MB/s and storage binary MB/s", () => {
    assert.equal(resolveCatalogMetricMaximumInputLabel(MetricUnit.BYTES_PER_SECOND, "network"), "Max (MB/s)");
    assert.equal(
        writeCatalogMetricMaximumInputValue(125, MetricUnit.BYTES_PER_SECOND, "network"),
        125 * 1000 ** 2,
    );
    assert.equal(
        writeCatalogMetricMaximumInputValue(1_500, MetricUnit.BYTES_PER_SECOND, "disk"),
        1_500 * 1024 ** 2,
    );
});

test("catalog metric maximum input limits mirror the stored raw maximum", () => {
    assert.equal(resolveCatalogMetricMaximumInputMaximum(MetricUnit.WATTS, "gpu"), 1_000_000_000_000_000);
    assert.equal(resolveCatalogMetricMaximumInputMaximum(MetricUnit.BYTES, "memory"), 1_000_000_000_000_000 / 1024 ** 3);
    assert.equal(resolveCatalogMetricMaximumInputMaximum(MetricUnit.HERTZ, "cpu"), 1_000_000);
    assert.equal(
        resolveCatalogMetricMaximumInputMaximum(MetricUnit.BYTES_PER_SECOND, "network"),
        1_000_000_000,
    );
    assert.equal(
        resolveCatalogMetricMaximumInputMaximum(MetricUnit.BYTES_PER_SECOND, "disk"),
        1_000_000_000_000_000 / 1024 ** 2,
    );
});

test("catalog metric scale helpers degrade future runtime metric units", () => {
    const futureMetricUnit = 999_999 as MetricUnit;

    assert.equal(resolveCatalogMetricDefaultMaximumValue(futureMetricUnit, "gpu", "power"), 100);
    assert.equal(resolveCatalogMetricMaximumInputLabel(futureMetricUnit, "gpu"), "Max");
    assert.equal(readCatalogMetricMaximumInputValue(42, futureMetricUnit, "gpu"), 42);
    assert.equal(writeCatalogMetricMaximumInputValue(42, futureMetricUnit, "gpu"), 42);
});
