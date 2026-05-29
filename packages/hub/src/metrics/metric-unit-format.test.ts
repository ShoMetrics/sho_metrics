import assert from "node:assert/strict";
import test from "node:test";
import { MetricUnit } from "../runtime/sources/metric-source";
import { formatMetricUnit, normalizeKnownMetricUnit } from "./metric-unit-format";

test("formatMetricUnit formats known metric units", () => {
    assert.equal(formatMetricUnit(MetricUnit.PERCENT), "%");
    assert.equal(formatMetricUnit(MetricUnit.CELSIUS), "C");
    assert.equal(formatMetricUnit(MetricUnit.VOLTS), "V");
    assert.equal(formatMetricUnit(MetricUnit.AMPERES), "A");
    assert.equal(formatMetricUnit(MetricUnit.WATTS), "W");
    assert.equal(formatMetricUnit(MetricUnit.HERTZ), "Hz");
    assert.equal(formatMetricUnit(MetricUnit.BYTES), "B");
    assert.equal(formatMetricUnit(MetricUnit.BYTES_PER_SECOND), "B/s");
    assert.equal(formatMetricUnit(MetricUnit.REVOLUTIONS_PER_MINUTE), "RPM");
    assert.equal(formatMetricUnit(MetricUnit.LITERS_PER_HOUR), "L/h");
    assert.equal(formatMetricUnit(MetricUnit.SECONDS), "s");
    assert.equal(formatMetricUnit(MetricUnit.WATT_HOURS), "Wh");
    assert.equal(formatMetricUnit(MetricUnit.DECIBELS_A_WEIGHTED), "dBA");
    assert.equal(formatMetricUnit(MetricUnit.SIEMENS_PER_CENTIMETER), "S/cm");
    assert.equal(formatMetricUnit(MetricUnit.MILLISECONDS), "ms");
});

test("formatMetricUnit returns empty text for non-display units and future enum values", () => {
    assert.equal(formatMetricUnit(MetricUnit.UNSPECIFIED), "");
    assert.equal(formatMetricUnit(MetricUnit.UNITLESS), "");
    assert.equal(formatMetricUnit(999 as MetricUnit), "");
});

test("normalizeKnownMetricUnit keeps known units and clamps future enum values", () => {
    assert.equal(normalizeKnownMetricUnit(MetricUnit.WATTS), MetricUnit.WATTS);
    assert.equal(normalizeKnownMetricUnit(MetricUnit.UNSPECIFIED), MetricUnit.UNSPECIFIED);
    assert.equal(normalizeKnownMetricUnit(undefined), MetricUnit.UNSPECIFIED);
    assert.equal(normalizeKnownMetricUnit(999 as MetricUnit), MetricUnit.UNSPECIFIED);
});
