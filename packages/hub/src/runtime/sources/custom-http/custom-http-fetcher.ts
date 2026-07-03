import {
    CUSTOM_HTTP_DNS_DIAGNOSTIC_TIMEOUT_MILLISECONDS,
    CUSTOM_HTTP_RESPONSE_LIMIT_BYTES,
} from "./custom-http-fetch-limits";
import {
    resolveCustomHttpFetchPolicy,
    resolveCustomHttpRetryDelayMilliseconds,
} from "./custom-http-request-policy";
import { logger } from "../../../logging/node-logger";
import { lookup as lookupDns } from "node:dns/promises";

const log = logger.for("Source:CustomHTTP:Fetch");
const CUSTOM_HTTP_FETCH_LOG_THROTTLE_MILLISECONDS = 30_000;

export type CustomHttpFetchFailureReason =
    | "invalidUrl"
    | "unsupportedProtocol"
    | "redirectBlocked"
    | "httpFailure"
    | "responseTooLarge"
    | "networkFailure";

export type CustomHttpFetchResult =
    | {
        readonly ok: true;
        readonly responseText: string;
    }
    | {
        readonly ok: false;
        readonly reason: CustomHttpFetchFailureReason;
        readonly detail: string;
        readonly responseTextPreview?: string;
        readonly isResponseTextPreviewTruncated?: boolean;
        readonly blockedRedirect?: CustomHttpBlockedRedirect | undefined;
    };

export type CustomHttpFetchFailureResult = Exclude<CustomHttpFetchResult, { ok: true }>;

export interface CustomHttpBlockedRedirect {
    readonly fromOrigin: string;
    readonly toOrigin: string;
    readonly redirectedUrl: string;
}

export interface CustomHttpFetchOptions {
    readonly timeoutSeconds?: number | undefined;
    readonly retryCount?: number | undefined;
    readonly includeFailureResponsePreview?: boolean | undefined;
    readonly headers?: Readonly<Record<string, string>> | undefined;
}

/**
 * Fetches the raw JSON text for one Custom HTTP metric definition.
 *
 * This boundary intentionally stops before JSON.parse and jq execution so the
 * source client can report fetch, parse, and transform failures separately.
 */
export interface CustomHttpFetcher {
    fetchJson(url: string, options?: CustomHttpFetchOptions): Promise<CustomHttpFetchResult>;
}

type FetchLike = (url: URL, init?: RequestInit) => Promise<Response>;
type DnsLookupLike = (hostname: string) => Promise<readonly DnsLookupAddress[]>;
type DelayLike = (delayMilliseconds: number) => Promise<void>;
type FetchAttemptResult =
    | {
        readonly ok: true;
        readonly response: Response;
    }
    | {
        readonly ok: false;
        readonly failure: CustomHttpFetchFailureResult;
    };

const CUSTOM_HTTP_CREDENTIAL_REDIRECT_LIMIT = 5;

interface DnsLookupAddress {
    readonly address: string;
    readonly family: number;
}

export class NodeCustomHttpFetcher implements CustomHttpFetcher {
    private readonly fetch: FetchLike;
    private readonly dnsLookup: DnsLookupLike;
    private readonly responseLimitBytes: number;
    private readonly defaultTimeoutMilliseconds: number | undefined;
    private readonly delay: DelayLike;
    private readonly random: () => number;

    constructor(options: {
        readonly fetch?: FetchLike;
        readonly dnsLookup?: DnsLookupLike;
        readonly responseLimitBytes?: number;
        /** Test-only default. Per-call timeoutSeconds is the product policy. */
        readonly defaultTimeoutMilliseconds?: number;
        readonly delay?: DelayLike;
        readonly random?: () => number;
    } = {}) {
        this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
        this.dnsLookup = options.dnsLookup ?? (hostname => lookupDns(hostname, { all: true }));
        this.responseLimitBytes = options.responseLimitBytes ?? CUSTOM_HTTP_RESPONSE_LIMIT_BYTES;
        this.defaultTimeoutMilliseconds = options.defaultTimeoutMilliseconds;
        this.delay = options.delay ?? (delayMilliseconds => new Promise(resolve => {
            setTimeout(resolve, delayMilliseconds);
        }));
        this.random = options.random ?? Math.random;
    }

    /**
     * Reads only HTTP(S) GET responses and enforces the byte cap while the body
     * streams in. The returned detail strings are deliberately URL/body-free.
     */
    async fetchJson(url: string, options: CustomHttpFetchOptions = {}): Promise<CustomHttpFetchResult> {
        let parsedUrl: URL;

        try {
            parsedUrl = new URL(url);
        } catch {
            return failure("invalidUrl", "URL is invalid.");
        }

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            return failure("unsupportedProtocol", "Only HTTP and HTTPS URLs are supported.");
        }

        const policy = resolveCustomHttpFetchPolicy(options);
        const timeoutMilliseconds = options.timeoutSeconds === undefined && this.defaultTimeoutMilliseconds !== undefined
            ? this.defaultTimeoutMilliseconds
            : policy.timeoutSeconds * 1000;
        let retryIndex = 0;

        while (true) {
            const isFinalAttempt = retryIndex >= policy.retryCount;
            const attemptResult = await this.fetchJsonAttempt(parsedUrl, {
                timeoutMilliseconds,
                includeDnsDiagnostic: isFinalAttempt,
                includeFailureResponsePreview: options.includeFailureResponsePreview === true,
                headers: options.headers,
            });
            if (attemptResult.ok || !canRetryFetchFailure(attemptResult.reason) || retryIndex >= policy.retryCount) {
                return attemptResult;
            }

            await this.delay(resolveCustomHttpRetryDelayMilliseconds(retryIndex, this.random));
            retryIndex += 1;
        }
    }

    private async fetchJsonAttempt(
        parsedUrl: URL,
        options: {
            readonly timeoutMilliseconds: number;
            readonly includeDnsDiagnostic: boolean;
            readonly includeFailureResponsePreview: boolean;
            readonly headers: Readonly<Record<string, string>> | undefined;
        },
    ): Promise<CustomHttpFetchResult> {
        const startedAtMilliseconds = performance.now();
        const targetSummary = summarizeUrlForLog(parsedUrl);

        let response: Response;
        try {
            const fetchResult = await fetchWithCredentialRedirectPolicy(this.fetch, parsedUrl, {
                headers: options.headers,
                signal: AbortSignal.timeout(options.timeoutMilliseconds),
            });
            if (!fetchResult.ok) {
                return fetchResult.failure;
            }

            response = fetchResult.response;
        } catch (error) {
            const dnsDiagnostic = options.includeDnsDiagnostic
                ? await readDnsDiagnostic(parsedUrl.hostname, this.dnsLookup)
                : undefined;
            const detail = [
                "HTTP request failed.",
                `elapsed=${formatElapsedMilliseconds(startedAtMilliseconds)}ms.`,
                `timeout=${options.timeoutMilliseconds}ms.`,
                formatBoundedErrorDetail(error),
                dnsDiagnostic,
            ].filter(value => value !== undefined).join(" ");
            log.atWarn()
                .everyMs(`custom-http-fetch-failure:${targetSummary}`, CUSTOM_HTTP_FETCH_LOG_THROTTLE_MILLISECONDS)
                .log(() => `Custom HTTP fetch failed. target=${targetSummary}`);
            return failure("networkFailure", detail);
        }

        if (!response.ok) {
            log.atWarn()
                .everyMs(`custom-http-fetch-status:${targetSummary}:${response.status}`, CUSTOM_HTTP_FETCH_LOG_THROTTLE_MILLISECONDS)
                .log(() => [
                    "Custom HTTP fetch returned non-success status.",
                    `target=${targetSummary}`,
                    `status=${response.status}`,
                    `elapsedMs=${formatElapsedMilliseconds(startedAtMilliseconds)}`,
                ].join(" "));
            if (!options.includeFailureResponsePreview) {
                return failure("httpFailure", `HTTP status ${response.status}.`);
            }

            const httpFailure = await readHttpFailureResult(response, this.responseLimitBytes);
            return httpFailure;
        }

        const responseTextResult = await readBoundedResponseText(response, this.responseLimitBytes);
        if (!responseTextResult.ok) {
            log.atWarn()
                .everyMs(`custom-http-fetch-body:${targetSummary}:${responseTextResult.reason}`, CUSTOM_HTTP_FETCH_LOG_THROTTLE_MILLISECONDS)
                .log(() => [
                    "Custom HTTP response read failed.",
                    `target=${targetSummary}`,
                    `reason=${responseTextResult.reason}`,
                    `detail=${responseTextResult.detail}`,
                    `elapsedMs=${formatElapsedMilliseconds(startedAtMilliseconds)}`,
                ].join(" "));
            return responseTextResult;
        }

        return {
            ok: true,
            responseText: responseTextResult.responseText,
        };
    }
}

async function fetchWithCredentialRedirectPolicy(
    fetchLike: FetchLike,
    parsedUrl: URL,
    init: {
        readonly headers: Readonly<Record<string, string>> | undefined;
        readonly signal: AbortSignal;
    },
): Promise<FetchAttemptResult> {
    if (init.headers === undefined) {
        // Requests without header credentials, including query-token URLs, can use
        // the native redirect policy. The query token stays on the original URL and
        // Node fetch does not add a Referer header by default.
        return {
            ok: true,
            response: await fetchLike(parsedUrl, {
                redirect: "follow",
                signal: init.signal,
            }),
        };
    }

    let currentUrl = parsedUrl;
    for (let redirectIndex = 0; redirectIndex <= CUSTOM_HTTP_CREDENTIAL_REDIRECT_LIMIT; redirectIndex += 1) {
        const response = await fetchLike(currentUrl, {
            redirect: "manual",
            headers: init.headers,
            signal: init.signal,
        });
        if (!isRedirectResponse(response)) {
            return {
                ok: true,
                response,
            };
        }

        const locationHeader = response.headers.get("location");
        if (locationHeader === null) {
            return {
                ok: true,
                response,
            };
        }

        const nextUrl = new URL(locationHeader, currentUrl);
        if (!canForwardCredentialHeaders(currentUrl, nextUrl)) {
            return {
                ok: false,
                failure: {
                    ...failure(
                        "redirectBlocked",
                        "Cross-origin redirect blocked while credentials are attached. Use the redirected URL directly.",
                    ),
                    blockedRedirect: {
                        fromOrigin: currentUrl.origin,
                        toOrigin: nextUrl.origin,
                        redirectedUrl: nextUrl.toString(),
                    },
                },
            };
        }

        currentUrl = nextUrl;
    }

    return {
        ok: false,
        failure: failure(
            "redirectBlocked",
            `Credential-bearing redirect chain exceeded ${CUSTOM_HTTP_CREDENTIAL_REDIRECT_LIMIT} redirects.`,
        ),
    };
}

function isRedirectResponse(response: Response): boolean {
    return response.status === 301
        || response.status === 302
        || response.status === 303
        || response.status === 307
        || response.status === 308;
}

function canForwardCredentialHeaders(currentUrl: URL, nextUrl: URL): boolean {
    return currentUrl.origin === nextUrl.origin
        || (
            currentUrl.protocol === "http:"
            && nextUrl.protocol === "https:"
            && currentUrl.hostname === nextUrl.hostname
            && currentUrl.port === nextUrl.port
        );
}

async function readHttpFailureResult(response: Response, responseLimitBytes: number): Promise<CustomHttpFetchFailureResult> {
    const statusDetail = `HTTP status ${response.status}.`;
    const responseTextPreviewResult = await readBoundedResponseTextPreview(response, responseLimitBytes);
    if (responseTextPreviewResult.state === "failure") {
        return failure("httpFailure", `${statusDetail} ${responseTextPreviewResult.failure.detail}`);
    }

    return {
        ok: false,
        reason: "httpFailure",
        detail: statusDetail,
        responseTextPreview: responseTextPreviewResult.responseText,
        isResponseTextPreviewTruncated: responseTextPreviewResult.isTruncated,
    };
}

function canRetryFetchFailure(reason: CustomHttpFetchFailureReason): boolean {
    return reason === "networkFailure";
}

async function readBoundedResponseText(
    response: Response,
    responseLimitBytes: number,
): Promise<CustomHttpFetchResult> {
    return readResponseTextWithLimit(response, responseLimitBytes, "reject");
}

async function readBoundedResponseTextPreview(
    response: Response,
    responseLimitBytes: number,
): Promise<{
    readonly state: "ok";
    readonly responseText: string;
    readonly isTruncated: boolean;
} | {
    readonly state: "failure";
    readonly failure: CustomHttpFetchFailureResult;
}> {
    const readResult = await readResponseTextWithLimit(response, responseLimitBytes, "truncate");
    return readResult.ok
        ? {
            state: "ok",
            responseText: readResult.responseText,
            isTruncated: readResult.isTruncated,
        }
        : {
            state: "failure",
            failure: readResult,
        };
}

type ResponseOverflowPolicy = "reject" | "truncate";

async function readResponseTextWithLimit(
    response: Response,
    responseLimitBytes: number,
    overflowPolicy: ResponseOverflowPolicy,
): Promise<({
    readonly ok: true;
    readonly responseText: string;
    readonly isTruncated: boolean;
} | CustomHttpFetchFailureResult)> {
    try {
        if (!response.body) {
            const responseText = await response.text();
            return buildResponseTextFromBytes(new TextEncoder().encode(responseText), responseLimitBytes, overflowPolicy);
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        let isTruncated = false;

        try {
            while (true) {
                const readResult = await reader.read();
                if (readResult.done) {
                    break;
                }

                const nextTotalBytes = totalBytes + readResult.value.byteLength;
                if (nextTotalBytes > responseLimitBytes) {
                    if (overflowPolicy === "truncate") {
                        chunks.push(readResult.value.slice(0, Math.max(0, responseLimitBytes - totalBytes)));
                        totalBytes = responseLimitBytes;
                        isTruncated = true;
                        await reader.cancel().catch(() => {
                            // The owner-visible diagnostic is the bounded preview, not cleanup.
                        });
                        break;
                    }

                    await reader.cancel().catch(() => {
                        // The owner-visible failure is the size cap, not cleanup.
                    });
                    return failure("responseTooLarge", `Response exceeded ${responseLimitBytes} bytes.`);
                }

                chunks.push(readResult.value);
                totalBytes = nextTotalBytes;
            }
        } finally {
            reader.releaseLock();
        }

        const responseBytes = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
            responseBytes.set(chunk, offset);
            offset += chunk.byteLength;
        }

        return {
            ok: true,
            responseText: new TextDecoder().decode(responseBytes),
            isTruncated,
        };
    } catch (error) {
        return failure("networkFailure", `Response body read failed. ${formatBoundedErrorDetail(error)}`);
    }
}

function buildResponseTextFromBytes(
    responseBytes: Uint8Array,
    responseLimitBytes: number,
    overflowPolicy: ResponseOverflowPolicy,
): {
    readonly ok: true;
    readonly responseText: string;
    readonly isTruncated: boolean;
} | CustomHttpFetchFailureResult {
    const isTruncated = responseBytes.byteLength > responseLimitBytes;
    if (isTruncated && overflowPolicy === "reject") {
        return failure("responseTooLarge", `Response exceeded ${responseLimitBytes} bytes.`);
    }

    return {
        ok: true,
        responseText: new TextDecoder().decode(isTruncated ? responseBytes.slice(0, responseLimitBytes) : responseBytes),
        isTruncated,
    };
}

function failure(reason: CustomHttpFetchFailureReason, detail: string): CustomHttpFetchFailureResult {
    return {
        ok: false,
        reason,
        detail,
    };
}

function formatBoundedErrorDetail(error: unknown): string {
    if (!(error instanceof Error)) {
        return "Unknown error.";
    }

    const name = error.name.trim().length === 0 ? "Error" : error.name;
    const message = error.message.trim().length === 0 ? "No message." : error.message;
    const cause = readErrorCause(error);
    return `${name}: ${message}${cause === undefined ? "" : ` Cause: ${cause}`}`.slice(0, 360);
}

function readErrorCause(error: Error): string | undefined {
    const cause = error.cause;
    if (cause instanceof Error) {
        const name = cause.name.trim().length === 0 ? "Error" : cause.name;
        const message = cause.message.trim().length === 0 ? "No message." : cause.message;
        const code = readStringRecordValue(cause, "code");
        return `${name}: ${message}${code === undefined ? "" : ` code=${code}`}`;
    }

    if (!cause || typeof cause !== "object") {
        return undefined;
    }

    const code = readStringRecordValue(cause, "code");
    return code === undefined ? undefined : `code=${code}`;
}

function readStringRecordValue(value: object, key: string): string | undefined {
    const entry = (value as Record<string, unknown>)[key];
    return typeof entry === "string" && entry.trim().length > 0 ? entry : undefined;
}

async function readDnsDiagnostic(hostname: string, dnsLookup: DnsLookupLike): Promise<string> {
    const startedAtMilliseconds = performance.now();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<"timeout">(resolve => {
        timeoutHandle = setTimeout(() => resolve("timeout"), CUSTOM_HTTP_DNS_DIAGNOSTIC_TIMEOUT_MILLISECONDS);
    });

    try {
        const addresses = await Promise.race([dnsLookup(hostname), timeout]);
        if (addresses === "timeout") {
            return [
                `dnsElapsed=${formatElapsedMilliseconds(startedAtMilliseconds)}ms.`,
                `dnsTimeout=${CUSTOM_HTTP_DNS_DIAGNOSTIC_TIMEOUT_MILLISECONDS}ms.`,
            ].join(" ");
        }

        return [
            `dnsElapsed=${formatElapsedMilliseconds(startedAtMilliseconds)}ms.`,
            `dnsFamilies=${summarizeDnsFamilies(addresses)}.`,
        ].join(" ");
    } catch (error) {
        return [
            `dnsElapsed=${formatElapsedMilliseconds(startedAtMilliseconds)}ms.`,
            `dnsFailure=${formatBoundedErrorDetail(error)}`,
        ].join(" ");
    } finally {
        if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle);
        }
    }
}

function summarizeDnsFamilies(addresses: readonly DnsLookupAddress[]): string {
    const ipv4Count = addresses.filter(address => address.family === 4).length;
    const ipv6Count = addresses.filter(address => address.family === 6).length;
    const otherCount = Math.max(0, addresses.length - ipv4Count - ipv6Count);

    return [
        `ipv4:${ipv4Count}`,
        `ipv6:${ipv6Count}`,
        otherCount === 0 ? undefined : `other:${otherCount}`,
    ].filter(value => value !== undefined).join(",");
}

function formatElapsedMilliseconds(startedAtMilliseconds: number): number {
    return Math.max(0, Math.round(performance.now() - startedAtMilliseconds));
}

function summarizeUrlForLog(url: URL): string {
    return `${url.protocol}//${url.host}`;
}
