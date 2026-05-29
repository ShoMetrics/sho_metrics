import { MetricUnit } from "../runtime/sources/metric-source";

// Keep this map exhaustive: tsc must fail when the generated MetricUnit enum
// gains a value. Runtime-only future numeric values still degrade below.
const METRIC_UNIT_TEXT_BY_UNIT = {
    [MetricUnit.UNSPECIFIED]: "",
    [MetricUnit.PERCENT]: "%",
    [MetricUnit.CELSIUS]: "C",
    [MetricUnit.VOLTS]: "V",
    [MetricUnit.AMPERES]: "A",
    [MetricUnit.WATTS]: "W",
    [MetricUnit.HERTZ]: "Hz",
    [MetricUnit.BYTES]: "B",
    [MetricUnit.BYTES_PER_SECOND]: "B/s",
    [MetricUnit.REVOLUTIONS_PER_MINUTE]: "RPM",
    [MetricUnit.LITERS_PER_HOUR]: "L/h",
    [MetricUnit.UNITLESS]: "",
    [MetricUnit.SECONDS]: "s",
    [MetricUnit.WATT_HOURS]: "Wh",
    [MetricUnit.DECIBELS_A_WEIGHTED]: "dBA",
    [MetricUnit.SIEMENS_PER_CENTIMETER]: "S/cm",
    [MetricUnit.MILLISECONDS]: "ms",
} satisfies Record<MetricUnit, string>;

export function formatMetricUnit(unit: MetricUnit): string {
    // Protobuf enums are open at runtime. A newer helper may send a unit this
    // plugin does not know yet; keep display code usable and persist no unit hint.
    return readKnownMetricUnitText(unit) ?? "";
}

export function normalizeKnownMetricUnit(unit: MetricUnit | undefined): MetricUnit {
    return unit !== undefined && readKnownMetricUnitText(unit) !== undefined
        ? unit
        : MetricUnit.UNSPECIFIED;
}

function readKnownMetricUnitText(unit: MetricUnit): string | undefined {
    return METRIC_UNIT_TEXT_BY_UNIT[unit as keyof typeof METRIC_UNIT_TEXT_BY_UNIT];
}
