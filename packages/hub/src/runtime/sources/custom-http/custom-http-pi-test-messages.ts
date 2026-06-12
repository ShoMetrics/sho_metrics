export const CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE = "custom-http-pi-test";

export type CustomHttpPiTestRequest =
    | {
        readonly type: typeof CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE;
        readonly command: "fetchSample";
        readonly requestId: string;
        readonly url: string;
    }
    | {
        readonly type: typeof CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE;
        readonly command: "testTransform";
        readonly requestId: string;
        readonly url: string;
        readonly jqTransform: string;
    };

export type CustomHttpPiTestResponse =
    | {
        readonly type: typeof CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE;
        readonly command: "fetchSample";
        readonly requestId: string;
        readonly result: CustomHttpPiFetchSampleResult;
    }
    | {
        readonly type: typeof CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE;
        readonly command: "testTransform";
        readonly requestId: string;
        readonly result: CustomHttpPiTransformResult;
    };

export type CustomHttpPiFetchSampleResult =
    | {
        readonly ok: true;
        readonly responseBytes: number;
        readonly samplePreview: string;
        readonly isSamplePreviewTruncated: boolean;
    }
    | CustomHttpPiFailureResult;

export type CustomHttpPiTransformResult =
    | {
        readonly ok: true;
        readonly metric: {
            readonly label: string;
            readonly value: number;
            readonly unitText: string;
            readonly maximum?: number;
            readonly suggestedLucideIconId?: string;
        };
    }
    | CustomHttpPiFailureResult;

export interface CustomHttpPiFailureResult {
    readonly ok: false;
    readonly stage: string;
    readonly detail: string;
}

export function readCustomHttpPiTestRequest(payload: unknown): CustomHttpPiTestRequest | undefined {
    if (!isRecord(payload) || payload["type"] !== CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE) {
        return undefined;
    }

    const command = payload["command"];
    const requestId = payload["requestId"];
    const url = payload["url"];
    if (typeof requestId !== "string" || typeof url !== "string") {
        return undefined;
    }

    if (command === "fetchSample") {
        return {
            type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
            command,
            requestId,
            url,
        };
    }

    if (command === "testTransform") {
        const jqTransform = payload["jqTransform"];
        if (typeof jqTransform !== "string") {
            return undefined;
        }

        return {
            type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
            command,
            requestId,
            url,
            jqTransform,
        };
    }

    return undefined;
}

export function readCustomHttpPiTestResponse(payload: unknown): CustomHttpPiTestResponse | undefined {
    if (!isRecord(payload) || payload["type"] !== CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE) {
        return undefined;
    }

    const command = payload["command"];
    const requestId = payload["requestId"];
    const result = payload["result"];
    if (typeof requestId !== "string" || !isRecord(result)) {
        return undefined;
    }

    if (command === "fetchSample") {
        const fetchResult = readFetchSampleResult(result);
        return fetchResult === undefined
            ? undefined
            : {
                type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
                command,
                requestId,
                result: fetchResult,
            };
    }

    if (command === "testTransform") {
        const transformResult = readTransformResult(result);
        return transformResult === undefined
            ? undefined
            : {
                type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
                command,
                requestId,
                result: transformResult,
            };
    }

    return undefined;
}

function readFetchSampleResult(result: Readonly<Record<string, unknown>>): CustomHttpPiFetchSampleResult | undefined {
    if (result["ok"] === true) {
        const responseBytes = result["responseBytes"];
        const samplePreview = result["samplePreview"];
        const isSamplePreviewTruncated = result["isSamplePreviewTruncated"];
        return (
            typeof responseBytes === "number"
            && typeof samplePreview === "string"
            && typeof isSamplePreviewTruncated === "boolean"
        )
            ? { ok: true, responseBytes, samplePreview, isSamplePreviewTruncated }
            : undefined;
    }

    return readFailureResult(result);
}

function readTransformResult(result: Readonly<Record<string, unknown>>): CustomHttpPiTransformResult | undefined {
    if (result["ok"] === true) {
        const metric = result["metric"];
        if (!isRecord(metric)) {
            return undefined;
        }

        const label = metric["label"];
        const value = metric["value"];
        const unitText = metric["unitText"];
        const maximum = metric["maximum"];
        const suggestedLucideIconId = metric["suggestedLucideIconId"];
        if (
            typeof label !== "string"
            || typeof value !== "number"
            || typeof unitText !== "string"
            || (maximum !== undefined && typeof maximum !== "number")
            || (suggestedLucideIconId !== undefined && typeof suggestedLucideIconId !== "string")
        ) {
            return undefined;
        }

        return {
            ok: true,
            metric: {
                label,
                value,
                unitText,
                ...(maximum === undefined ? {} : { maximum }),
                ...(suggestedLucideIconId === undefined ? {} : { suggestedLucideIconId }),
            },
        };
    }

    return readFailureResult(result);
}

function readFailureResult(result: Readonly<Record<string, unknown>>): CustomHttpPiFailureResult | undefined {
    if (result["ok"] !== false) {
        return undefined;
    }

    const stage = result["stage"];
    const detail = result["detail"];
    return typeof stage === "string" && typeof detail === "string"
        ? { ok: false, stage, detail }
        : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object"
        && value !== null
        && !Array.isArray(value);
}
