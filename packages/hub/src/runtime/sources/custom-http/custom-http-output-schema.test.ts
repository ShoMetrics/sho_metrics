import assert from "node:assert/strict";
import test from "node:test";
import { MetricUnit } from "../metric-source";
import { validateCustomHttpMetricTransformOutput } from "./custom-http-output-schema";

test("validateCustomHttpMetricTransformOutput accepts one scalar metric object", () => {
    const result = validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TEMP",
            value: 21.5,
            unit: "celsius",
            maximum: 100,
        },
    });

    assert.deepEqual(result, {
        ok: true,
        output: {
            label: "TEMP",
            value: 21.5,
            unit: MetricUnit.CELSIUS,
            maximum: 100,
        },
    });
});

test("validateCustomHttpMetricTransformOutput accepts custom units", () => {
    const result = validateCustomHttpMetricTransformOutput({
        metric: {
            label: "Wind",
            value: 12,
            unit: "custom",
            customUnit: "km/h",
        },
    });

    assert.deepEqual(result, {
        ok: true,
        output: {
            label: "Wind",
            value: 12,
            unit: MetricUnit.UNSPECIFIED,
            customUnit: "km/h",
        },
    });
});

test("validateCustomHttpMetricTransformOutput normalizes safe string input", () => {
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "  Clock  ",
            value: " 1234 ",
            unit: "  Hertz ",
            maximum: " 5000 ",
        },
    }), {
        ok: true,
        output: {
            label: "Clock",
            value: 1234,
            unit: MetricUnit.HERTZ,
            maximum: 5000,
        },
    });

    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "Rate",
            value: 12,
            unit: "bytes per second",
        },
    }), {
        ok: true,
        output: {
            label: "Rate",
            value: 12,
            unit: MetricUnit.BYTES_PER_SECOND,
        },
    });
});

test("validateCustomHttpMetricTransformOutput maps normalized unit strings through MetricUnit names", () => {
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "Power",
            value: 75,
            unit: " WATTS ",
        },
    }), {
        ok: true,
        output: {
            label: "Power",
            value: 75,
            unit: MetricUnit.WATTS,
        },
    });

    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "Data",
            value: 1024,
            unit: "Bytes-Per-Second",
        },
    }), {
        ok: true,
        output: {
            label: "Data",
            value: 1024,
            unit: MetricUnit.BYTES_PER_SECOND,
        },
    });

    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "Fan",
            value: 1400,
            unit: "revolutions_per_minute",
        },
    }), {
        ok: true,
        output: {
            label: "Fan",
            value: 1400,
            unit: MetricUnit.REVOLUTIONS_PER_MINUTE,
        },
    });
});

test("validateCustomHttpMetricTransformOutput accepts prompt-supported time and Fahrenheit units", () => {
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "ETA",
            value: 90,
            unit: "seconds",
        },
    }), {
        ok: true,
        output: {
            label: "ETA",
            value: 90,
            unit: MetricUnit.SECONDS,
        },
    });

    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "PING",
            value: 12,
            unit: "milliseconds",
        },
    }), {
        ok: true,
        output: {
            label: "PING",
            value: 12,
            unit: MetricUnit.MILLISECONDS,
        },
    });

    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TEMP",
            value: 70,
            unit: "fahrenheit",
        },
    }), {
        ok: true,
        output: {
            label: "TEMP",
            value: 70,
            unit: MetricUnit.UNSPECIFIED,
            customUnit: "F",
        },
    });
});

test("validateCustomHttpMetricTransformOutput accepts rpm only as a compatibility alias", () => {
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "Fan",
            value: 1400,
            unit: "rpm",
        },
    }), {
        ok: true,
        output: {
            label: "Fan",
            value: 1400,
            unit: MetricUnit.REVOLUTIONS_PER_MINUTE,
        },
    });
});

test("validateCustomHttpMetricTransformOutput accepts valid suggested Lucide icons", () => {
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TEMP",
            value: 21,
            unit: "celsius",
            suggestedLucideIconId: " Cloud Sun ",
        },
    }), {
        ok: true,
        output: {
            label: "TEMP",
            value: 21,
            unit: MetricUnit.CELSIUS,
            suggestedLucideIconId: "cloud-sun",
        },
    });
});

test("validateCustomHttpMetricTransformOutput ignores invalid suggested Lucide icons", () => {
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TEMP",
            value: 21,
            unit: "celsius",
            suggestedLucideIconId: "not-a-real-icon",
        },
    }), {
        ok: true,
        output: {
            label: "TEMP",
            value: 21,
            unit: MetricUnit.CELSIUS,
        },
    });
});

test("validateCustomHttpMetricTransformOutput rejects customUnit on Fahrenheit shorthand", () => {
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TEMP",
            value: 70,
            unit: "fahrenheit",
            customUnit: "degF",
        },
    }), {
        ok: false,
        reason: "customUnit must be omitted unless unit is custom.",
    });
});

test("validateCustomHttpMetricTransformOutput rejects invalid metric output", () => {
    assert.deepEqual(validateCustomHttpMetricTransformOutput({}), {
        ok: false,
        reason: "metric must be an object.",
    });
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TemperatureIsTooLong",
            value: 21,
            unit: "celsius",
        },
    }), {
        ok: false,
        reason: "label must be 12 characters or shorter.",
    });
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TEMP",
            value: "not-a-number",
            unit: "celsius",
        },
    }), {
        ok: false,
        reason: "value must be a finite number.",
    });
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TEMP",
            value: "0x10",
            unit: "celsius",
        },
    }), {
        ok: false,
        reason: "value must be a finite number.",
    });
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TEMP",
            value: "1e3",
            unit: "celsius",
        },
    }), {
        ok: false,
        reason: "value must be a finite number.",
    });
    assert.deepEqual(validateCustomHttpMetricTransformOutput({
        metric: {
            label: "TEMP",
            value: 21,
            unit: "unknown",
        },
    }), {
        ok: false,
        reason: "unit is not supported.",
    });
});
