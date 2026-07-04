export const CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE = "custom-http-source-editor";

export type CustomHttpSourceEditorRequest =
    | {
        readonly type: typeof CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE;
        readonly command: "fetchSample";
        readonly requestId: string;
        /**
         * Identifies the widget consumer inside one Stream Deck action.
         *
         * Single Custom Metric uses one fixed consumer. Dense and Stacked pass
         * row/slot-derived consumers so editor sample caches cannot overwrite
         * each other within the same action.
         */
        readonly consumerSlug: string;
        readonly url: string;
        readonly requestSettings: CustomHttpSourceEditorRequestSettings;
        readonly auth: CustomHttpSourceEditorRequestAuth;
    }
    | {
        readonly type: typeof CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE;
        readonly command: "testTransform";
        readonly requestId: string;
        /**
         * Identifies the widget consumer inside one Stream Deck action.
         *
         * Single Custom Metric uses one fixed consumer. Dense and Stacked pass
         * row/slot-derived consumers so transform checks use the matching
         * fetched sample.
         */
        readonly consumerSlug: string;
        readonly url: string;
        readonly jqTransform: string;
        readonly requestSettings: CustomHttpSourceEditorRequestSettings;
        readonly auth: CustomHttpSourceEditorRequestAuth;
    };

export interface CustomHttpSourceEditorRequestSettings {
    readonly timeoutSeconds: number;
    readonly retryCount: number;
}

export interface CustomHttpSourceEditorRequestAuth {
    readonly credentialId: string | undefined;
    readonly allowPublicHttpCredentials: boolean;
}

interface StreamDeckPluginMessageSender {
    send(event: "sendToPlugin", payload: CustomHttpSourceEditorRequest): Promise<void>;
}

export function buildCustomHttpSourceEditorFetchSampleRequest(options: {
    readonly requestId: string;
    readonly consumerSlug: string;
    readonly url: string;
    readonly requestSettings: CustomHttpSourceEditorRequestSettings;
    readonly auth: CustomHttpSourceEditorRequestAuth;
}): CustomHttpSourceEditorRequest {
    return {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: options.requestId,
        consumerSlug: options.consumerSlug,
        url: options.url,
        requestSettings: options.requestSettings,
        auth: options.auth,
    };
}

export function buildCustomHttpSourceEditorTestTransformRequest(options: {
    readonly requestId: string;
    readonly consumerSlug: string;
    readonly url: string;
    readonly jqTransform: string;
    readonly requestSettings: CustomHttpSourceEditorRequestSettings;
    readonly auth: CustomHttpSourceEditorRequestAuth;
}): CustomHttpSourceEditorRequest {
    return {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: options.requestId,
        consumerSlug: options.consumerSlug,
        url: options.url,
        jqTransform: options.jqTransform,
        requestSettings: options.requestSettings,
        auth: options.auth,
    };
}

export function sendCustomHttpSourceEditorRequest(
    sender: StreamDeckPluginMessageSender,
    request: CustomHttpSourceEditorRequest,
): Promise<void> {
    return sender.send("sendToPlugin", request);
}

export type CustomHttpSourceEditorResponse =
    | {
        readonly type: typeof CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE;
        readonly command: "fetchSample";
        readonly requestId: string;
        readonly result: CustomHttpSourceEditorFetchSampleResult;
    }
    | {
        readonly type: typeof CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE;
        readonly command: "testTransform";
        readonly requestId: string;
        readonly result: CustomHttpSourceEditorTransformResult;
    };

export type CustomHttpSourceEditorFetchSampleResult =
    | {
        readonly ok: true;
        readonly responseBytes: number;
        readonly elapsedMilliseconds: number;
        readonly samplePreview: string;
        readonly isSamplePreviewTruncated: boolean;
        readonly promptSample: CustomHttpSourceEditorPromptSample;
    }
    | CustomHttpSourceEditorFailureResult;

/**
 * Describes the sample material that is safe to paste into an AI prompt.
 *
 * Use a separate kind when truncation changes prompt framing or rules, such as
 * capped JSON digests. Keep a boolean only when truncation changes explanatory
 * copy for the same prompt behavior, such as raw invalid JSON previews.
 */
export type CustomHttpSourceEditorPromptSample =
    | {
        readonly kind: "jsonSample";
        readonly text: string;
    }
    | {
        readonly kind: "jsonDigest";
        readonly text: string;
        readonly arraySummaries: readonly string[];
    }
    | {
        readonly kind: "truncatedJsonDigest";
        readonly text: string;
        readonly arraySummaries: readonly string[];
    }
    | {
        readonly kind: "rawPreview";
        readonly text: string;
        readonly hasTruncatedInvalidJsonPreview: boolean;
    };

export type CustomHttpSourceEditorTransformResult =
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
    | {
        readonly ok: true;
        readonly explorationOutput: string;
        readonly schemaFailureDetail: string;
    }
    | CustomHttpSourceEditorFailureResult;

export interface CustomHttpSourceEditorFailureResult {
    readonly ok: false;
    readonly stage: string;
    readonly detail: string;
    readonly blockedRedirect?: CustomHttpSourceEditorBlockedRedirect | undefined;
}

export interface CustomHttpSourceEditorBlockedRedirect {
    readonly fromOrigin: string;
    readonly toOrigin: string;
    readonly redirectedUrl: string;
}

/**
 * Reads an untrusted Stream Deck PI-to-plugin payload as a Custom HTTP editor request.
 *
 * The Stream Deck SDK delivers plugin messages as arbitrary JSON. Keep the
 * parameter `unknown` at this wire boundary, then narrow before action code
 * handles the request. Malformed matching messages are ignored here rather
 * than logged per event: this narrow editor channel can contain URL and auth
 * references, and shape drift should fail closed without leaking those details
 * into logs.
 */
export function readCustomHttpSourceEditorRequest(payload: unknown): CustomHttpSourceEditorRequest | undefined {
    if (!isRecord(payload) || payload["type"] !== CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE) {
        return undefined;
    }

    const command = payload["command"];
    const requestId = payload["requestId"];
    const consumerSlug = payload["consumerSlug"];
    const url = payload["url"];
    const requestSettings = readRequestSettings(payload["requestSettings"]);
    const auth = readRequestAuth(payload["auth"]);
    if (
        typeof requestId !== "string"
        || typeof consumerSlug !== "string"
        || typeof url !== "string"
        || requestSettings === undefined
        || auth === undefined
    ) {
        return undefined;
    }

    if (command === "fetchSample") {
        return buildCustomHttpSourceEditorFetchSampleRequest({
            requestId,
            consumerSlug,
            url,
            requestSettings,
            auth,
        });
    }

    if (command === "testTransform") {
        const jqTransform = payload["jqTransform"];
        if (typeof jqTransform !== "string") {
            return undefined;
        }

        return buildCustomHttpSourceEditorTestTransformRequest({
            requestId,
            consumerSlug,
            url,
            jqTransform,
            requestSettings,
            auth,
        });
    }

    return undefined;
}

/**
 * Reads an untrusted plugin-to-PI payload as a Custom HTTP editor response.
 *
 * Responses cross the same Stream Deck JSON boundary as requests. Property
 * Inspector code should receive this typed union only after this reader has
 * validated the payload shape. Invalid response payloads are ignored instead of
 * rendered so version skew cannot display a partially trusted result.
 */
export function readCustomHttpSourceEditorResponse(payload: unknown): CustomHttpSourceEditorResponse | undefined {
    if (!isRecord(payload) || payload["type"] !== CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE) {
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
                type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
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
                type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
                command,
                requestId,
                result: transformResult,
            };
    }

    return undefined;
}

function readFetchSampleResult(result: Readonly<Record<string, unknown>>): CustomHttpSourceEditorFetchSampleResult | undefined {
    if (result["ok"] === true) {
        const responseBytes = result["responseBytes"];
        const elapsedMilliseconds = result["elapsedMilliseconds"];
        const samplePreview = result["samplePreview"];
        const isSamplePreviewTruncated = result["isSamplePreviewTruncated"];
        const promptSample = readPromptSample(result["promptSample"]);
        return (
            isNonNegativeFiniteNumber(responseBytes)
            && isNonNegativeFiniteNumber(elapsedMilliseconds)
            && typeof samplePreview === "string"
            && typeof isSamplePreviewTruncated === "boolean"
            && promptSample !== undefined
        )
            ? { ok: true, responseBytes, elapsedMilliseconds, samplePreview, isSamplePreviewTruncated, promptSample }
            : undefined;
    }

    return readFailureResult(result);
}

function readPromptSample(value: unknown): CustomHttpSourceEditorPromptSample | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const kind = value["kind"];
    const text = value["text"];
    if (typeof text !== "string") {
        return undefined;
    }

    if (kind === "jsonSample") {
        return { kind, text };
    }

    if (kind === "jsonDigest" || kind === "truncatedJsonDigest") {
        const arraySummaries = readStringList(value["arraySummaries"]);
        return arraySummaries === undefined
            ? undefined
            : {
                kind,
                text,
                arraySummaries,
            };
    }

    if (kind === "rawPreview") {
        const hasTruncatedInvalidJsonPreview = value["hasTruncatedInvalidJsonPreview"];
        return typeof hasTruncatedInvalidJsonPreview === "boolean"
            ? { kind, text, hasTruncatedInvalidJsonPreview }
            : undefined;
    }

    return undefined;
}

function readStringList(value: unknown): readonly string[] | undefined {
    return Array.isArray(value) && value.every(item => typeof item === "string")
        ? value
        : undefined;
}

function readTransformResult(result: Readonly<Record<string, unknown>>): CustomHttpSourceEditorTransformResult | undefined {
    if (result["ok"] === true) {
        const metric = result["metric"];
        if (isRecord(metric)) {
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

        const explorationOutput = result["explorationOutput"];
        const schemaFailureDetail = result["schemaFailureDetail"];
        return typeof explorationOutput === "string" && typeof schemaFailureDetail === "string"
            ? { ok: true, explorationOutput, schemaFailureDetail }
            : undefined;
    }

    return readFailureResult(result);
}

function readFailureResult(result: Readonly<Record<string, unknown>>): CustomHttpSourceEditorFailureResult | undefined {
    if (result["ok"] !== false) {
        return undefined;
    }

    const stage = result["stage"];
    const detail = result["detail"];
    const blockedRedirect = readBlockedRedirect(result["blockedRedirect"]);
    return typeof stage === "string" && typeof detail === "string" && blockedRedirect !== false
        ? {
            ok: false,
            stage,
            detail,
            ...(blockedRedirect === undefined ? {} : { blockedRedirect }),
        }
        : undefined;
}

function readBlockedRedirect(value: unknown): CustomHttpSourceEditorBlockedRedirect | undefined | false {
    if (value === undefined) {
        return undefined;
    }

    if (!isRecord(value)) {
        return false;
    }

    const fromOrigin = value["fromOrigin"];
    const toOrigin = value["toOrigin"];
    const redirectedUrl = value["redirectedUrl"];
    return typeof fromOrigin === "string"
        && typeof toOrigin === "string"
        && typeof redirectedUrl === "string"
        ? { fromOrigin, toOrigin, redirectedUrl }
        : false;
}

function readRequestSettings(value: unknown): CustomHttpSourceEditorRequestSettings | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const timeoutSeconds = value["timeoutSeconds"];
    const retryCount = value["retryCount"];
    return typeof timeoutSeconds === "number" && typeof retryCount === "number"
        ? { timeoutSeconds, retryCount }
        : undefined;
}

function readRequestAuth(value: unknown): CustomHttpSourceEditorRequestAuth | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const credentialId = value["credentialId"];
    const allowPublicHttpCredentials = value["allowPublicHttpCredentials"];
    return (credentialId === undefined || typeof credentialId === "string")
        && typeof allowPublicHttpCredentials === "boolean"
        ? { credentialId, allowPublicHttpCredentials }
        : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object"
        && value !== null
        && !Array.isArray(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
    return typeof value === "number"
        && Number.isFinite(value)
        && value >= 0;
}
