const ARRAY_SAMPLE_COUNT = 3;
const MAXIMUM_OBJECT_KEY_COUNT = 40;
const MAXIMUM_DIGEST_DEPTH = 8;
const MAXIMUM_STRING_LENGTH = 80;
const MAXIMUM_DIGEST_TEXT_LENGTH = 12_000;

export interface CustomHttpJsonDigest {
    readonly sampleJson: string;
    readonly isTruncated: boolean;
    readonly arraySummaries: readonly string[];
}

/**
 * Builds a generic prompt summary of a large JSON response.
 *
 * Keep this deliberately schema-agnostic: it only preserves representative
 * structure and array sizes. jq path exploration should run through the normal
 * transform tester instead of growing field-name heuristics here.
 */
export function buildCustomHttpJsonDigest(value: unknown): CustomHttpJsonDigest {
    const arrayLengthByPath = new Map<string, number>();
    const prunedValue = pruneJsonValue({
        value,
        path: "$",
        depth: 0,
        arrayLengthByPath,
    });

    const sampleJson = JSON.stringify(prunedValue, null, 2);

    return {
        sampleJson: truncateDigestText(sampleJson),
        isTruncated: sampleJson.length > MAXIMUM_DIGEST_TEXT_LENGTH,
        arraySummaries: buildBoundedArraySummaries(arrayLengthByPath),
    };
}

function buildBoundedArraySummaries(arrayLengthByPath: ReadonlyMap<string, number>): readonly string[] {
    const summaries = [...arrayLengthByPath]
        .map(([path, length]) => `${path}: ${length} items; first ${Math.min(length, ARRAY_SAMPLE_COUNT)} shown`);

    return truncateDigestText(summaries.join("\n"))
        .split("\n")
        .filter(summary => summary.length > 0);
}

function truncateDigestText(sampleJson: string): string {
    return sampleJson.length <= MAXIMUM_DIGEST_TEXT_LENGTH
        ? sampleJson
        : `${sampleJson.slice(0, MAXIMUM_DIGEST_TEXT_LENGTH)}...`;
}

interface PruneJsonValueInput {
    readonly value: unknown;
    readonly path: string;
    readonly depth: number;
    readonly arrayLengthByPath: Map<string, number>;
}

function pruneJsonValue(input: PruneJsonValueInput): unknown {
    if (input.depth >= MAXIMUM_DIGEST_DEPTH) {
        return readCompactJsonPrimitive(input.value);
    }

    if (Array.isArray(input.value)) {
        if (input.value.length > ARRAY_SAMPLE_COUNT) {
            input.arrayLengthByPath.set(input.path, input.value.length);
        }

        return input.value
            .slice(0, ARRAY_SAMPLE_COUNT)
            .map((item, index) => pruneJsonValue({
                value: item,
                path: `${input.path}[${index}]`,
                depth: input.depth + 1,
                arrayLengthByPath: input.arrayLengthByPath,
            }));
    }

    if (isJsonObject(input.value)) {
        const prunedObject: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input.value).slice(0, MAXIMUM_OBJECT_KEY_COUNT)) {
            prunedObject[key] = pruneJsonValue({
                value,
                path: `${input.path}.${key}`,
                depth: input.depth + 1,
                arrayLengthByPath: input.arrayLengthByPath,
            });
        }

        return prunedObject;
    }

    return readCompactJsonPrimitive(input.value);
}

function readCompactJsonPrimitive(value: unknown): unknown {
    return typeof value === "string" && value.length > MAXIMUM_STRING_LENGTH
        ? `${value.slice(0, MAXIMUM_STRING_LENGTH)}...`
        : value;
}

function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object"
        && value !== null
        && !Array.isArray(value);
}
