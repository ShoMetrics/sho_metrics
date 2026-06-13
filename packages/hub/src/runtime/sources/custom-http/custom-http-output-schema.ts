import { MetricUnit } from "../metric-source";
import { normalizeCustomMetricIconId } from "../../../widgets/icons/custom-metric-icons";

export const CUSTOM_HTTP_TRANSFORM_OUTPUT_LIMIT_BYTES = 64 * 1024;

const MAX_LABEL_LENGTH = 12;
const MAX_CUSTOM_UNIT_LENGTH = 12;
const CUSTOM_HTTP_CUSTOM_UNIT_NAME = "custom";
const CUSTOM_HTTP_FAHRENHEIT_UNIT_NAME = "fahrenheit";
const CUSTOM_HTTP_NON_ENUM_PROMPT_UNIT_NAMES = [
    CUSTOM_HTTP_FAHRENHEIT_UNIT_NAME,
    CUSTOM_HTTP_CUSTOM_UNIT_NAME,
] as const;
export const CUSTOM_HTTP_PROMPT_UNIT_NAMES = readCustomHttpPromptUnitNames();

const CUSTOM_HTTP_UNIT_ALIASES = new Map<string, string>([
    ["rpm", "revolutions_per_minute"],
]);

export interface CustomHttpMetricTransformOutput {
    readonly label: string;
    readonly value: number;
    readonly unit: MetricUnit;
    readonly customUnit?: string;
    readonly maximum?: number;
    readonly suggestedLucideIconId?: string;
}

export type CustomHttpMetricTransformValidationResult =
    | {
        readonly ok: true;
        readonly output: CustomHttpMetricTransformOutput;
    }
    | {
        readonly ok: false;
        readonly reason: string;
    };

/**
 * Validates the final Custom HTTP jq output contract.
 *
 * The transform must emit one top-level metric wrapper. Runtime intentionally
 * keeps this schema in one module so the future PI tester and prompt exam
 * cannot grow a second subtly different validator.
 */
export function validateCustomHttpMetricTransformOutput(
    output: unknown,
): CustomHttpMetricTransformValidationResult {
    if (!isPlainObject(output)) {
        return invalid("Output must be an object.");
    }

    const metric = output["metric"];
    if (!isPlainObject(metric)) {
        return invalid("metric must be an object.");
    }

    const rawLabel = metric["label"];
    if (typeof rawLabel !== "string") {
        return invalid("label must be a non-empty string.");
    }
    const label = rawLabel.trim();
    if (label.length === 0) {
        return invalid("label must be a non-empty string.");
    }
    if (label.length > MAX_LABEL_LENGTH) {
        return invalid(`label must be ${MAX_LABEL_LENGTH} characters or shorter.`);
    }

    const valueResult = readFiniteNumber(metric["value"], "value");
    if (!valueResult.ok) {
        return invalid(valueResult.reason);
    }

    const unitResult = parseCustomHttpMetricUnit(metric["unit"], metric["customUnit"]);
    if (!unitResult.ok) {
        return invalid(unitResult.reason);
    }

    const maximumResult = readOptionalPositiveNumber(metric["maximum"]);
    if (!maximumResult.ok) {
        return invalid(maximumResult.reason);
    }
    const suggestedLucideIconId = readSuggestedLucideIconId(metric["suggestedLucideIconId"]);

    return {
        ok: true,
        output: {
            label,
            value: valueResult.value,
            unit: unitResult.unit,
            ...(unitResult.customUnit ? { customUnit: unitResult.customUnit } : {}),
            ...(maximumResult.value !== undefined ? { maximum: maximumResult.value } : {}),
            ...(suggestedLucideIconId === undefined ? {} : { suggestedLucideIconId }),
        },
    };
}

function parseCustomHttpMetricUnit(
    unit: unknown,
    customUnit: unknown,
): { readonly ok: true; readonly unit: MetricUnit; readonly customUnit?: string }
    | { readonly ok: false; readonly reason: string } {
    if (typeof unit !== "string") {
        return invalid("unit must be a string.");
    }

    const normalizedUnit = normalizeCustomHttpUnitName(unit);
    if (normalizedUnit === CUSTOM_HTTP_CUSTOM_UNIT_NAME) {
        if (typeof customUnit !== "string") {
            return invalid("customUnit must be a non-empty string when unit is custom.");
        }
        const normalizedCustomUnit = customUnit.trim();
        if (normalizedCustomUnit.length === 0) {
            return invalid("customUnit must be a non-empty string when unit is custom.");
        }
        if (normalizedCustomUnit.length > MAX_CUSTOM_UNIT_LENGTH) {
            return invalid(`customUnit must be ${MAX_CUSTOM_UNIT_LENGTH} characters or shorter.`);
        }

        return {
            ok: true,
            unit: MetricUnit.UNSPECIFIED,
            customUnit: normalizedCustomUnit,
        };
    }

    if (normalizedUnit === CUSTOM_HTTP_FAHRENHEIT_UNIT_NAME) {
        if (customUnit !== undefined) {
            return invalid("customUnit must be omitted unless unit is custom.");
        }

        return {
            ok: true,
            unit: MetricUnit.UNSPECIFIED,
            customUnit: "F",
        };
    }

    const metricUnit = readMetricUnitByNormalizedName(normalizedUnit);
    if (metricUnit === undefined) {
        return invalid("unit is not supported.");
    }

    if (customUnit !== undefined) {
        return invalid("customUnit must be omitted unless unit is custom.");
    }

    return {
        ok: true,
        unit: metricUnit,
    };
}

function readFiniteNumber(value: unknown, fieldName: string): { readonly ok: true; readonly value: number }
    | { readonly ok: false; readonly reason: string } {
    const parsedValue = typeof value === "string"
        ? readStrictDecimalNumber(value)
        : value;
    if (typeof parsedValue !== "number" || !Number.isFinite(parsedValue)) {
        return invalid(`${fieldName} must be a finite number.`);
    }

    return {
        ok: true,
        value: parsedValue,
    };
}

function readStrictDecimalNumber(value: string): number | undefined {
    const trimmedValue = value.trim();
    // Accept only ordinary decimal strings as a tolerance layer for provider
    // APIs that encode numbers as JSON strings. Avoid JavaScript Number()
    // syntax such as hex and scientific notation because prompts do not teach it.
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmedValue)) {
        return undefined;
    }

    return Number(trimmedValue);
}

function readOptionalPositiveNumber(value: unknown): { readonly ok: true; readonly value?: number }
    | { readonly ok: false; readonly reason: string } {
    if (value === undefined) {
        return {
            ok: true,
        };
    }

    const maximumResult = readFiniteNumber(value, "maximum");
    if (!maximumResult.ok) {
        return maximumResult;
    }

    if (maximumResult.value <= 0) {
        return invalid("maximum must be a positive finite number when present.");
    }

    return {
        ok: true,
        value: maximumResult.value,
    };
}

function readMetricUnitByNormalizedName(normalizedUnit: string): MetricUnit | undefined {
    // Prefer MetricUnit enum names as the source of truth so adding a normal
    // protobuf unit does not require another string-to-enum table entry here.
    const enumKey = (CUSTOM_HTTP_UNIT_ALIASES.get(normalizedUnit) ?? normalizedUnit).toUpperCase();
    const metricUnit = (MetricUnit as Readonly<Record<string, unknown>>)[enumKey];
    return typeof metricUnit === "number" && metricUnit !== MetricUnit.UNSPECIFIED
        ? metricUnit as MetricUnit
        : undefined;
}

function readCustomHttpPromptUnitNames(): readonly string[] {
    const metricUnitNames = Object.entries(MetricUnit)
        .flatMap(([name, value]) => typeof value === "number" && value !== MetricUnit.UNSPECIFIED
            ? [{ name: name.toLowerCase(), value }]
            : [])
        .sort((left, right) => left.value - right.value)
        .map(entry => entry.name);

    return [
        ...metricUnitNames,
        ...CUSTOM_HTTP_NON_ENUM_PROMPT_UNIT_NAMES,
    ];
}

function normalizeCustomHttpUnitName(unit: string): string {
    return unit.trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function readSuggestedLucideIconId(value: unknown): string | undefined {
    return typeof value === "string"
        ? normalizeCustomMetricIconId(value)
        : undefined;
}

function invalid(reason: string): { readonly ok: false; readonly reason: string } {
    return {
        ok: false,
        reason,
    };
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object"
        && value !== null
        && !Array.isArray(value);
}
