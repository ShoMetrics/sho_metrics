import {
    CUSTOM_HTTP_FETCH_TIMEOUT_MILLISECONDS,
    CUSTOM_HTTP_RESPONSE_LIMIT_BYTES,
} from "./custom-http-fetch-limits";
import { logger } from "../../../logging/logger";
import { lookup as lookupDns } from "node:dns/promises";

const log = logger.for("Source:CustomHTTP:Fetch");
const CUSTOM_HTTP_FETCH_LOG_THROTTLE_MILLISECONDS = 30_000;
const CUSTOM_HTTP_DNS_DIAGNOSTIC_TIMEOUT_MILLISECONDS = 750;

export type CustomHttpFetchFailureReason =
    | "invalidUrl"
    | "unsupportedProtocol"
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
    };

/**
 * Fetches the raw JSON text for one Custom HTTP metric definition.
 *
 * This boundary intentionally stops before JSON.parse and jq execution so the
 * source client can report fetch, parse, and transform failures separately.
 */
export interface CustomHttpFetcher {
    fetchJson(url: string): Promise<CustomHttpFetchResult>;
}

type FetchLike = (url: URL, init?: RequestInit) => Promise<Response>;
type DnsLookupLike = (hostname: string) => Promise<readonly DnsLookupAddress[]>;

interface DnsLookupAddress {
    readonly address: string;
    readonly family: number;
}

export class NodeCustomHttpFetcher implements CustomHttpFetcher {
    private readonly fetch: FetchLike;
    private readonly dnsLookup: DnsLookupLike;
    private readonly responseLimitBytes: number;
    private readonly timeoutMilliseconds: number;

    constructor(options: {
        readonly fetch?: FetchLike;
        readonly dnsLookup?: DnsLookupLike;
        readonly responseLimitBytes?: number;
        readonly timeoutMilliseconds?: number;
    } = {}) {
        this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
        this.dnsLookup = options.dnsLookup ?? (hostname => lookupDns(hostname, { all: true }));
        this.responseLimitBytes = options.responseLimitBytes ?? CUSTOM_HTTP_RESPONSE_LIMIT_BYTES;
        this.timeoutMilliseconds = options.timeoutMilliseconds ?? CUSTOM_HTTP_FETCH_TIMEOUT_MILLISECONDS;
    }

    /**
     * Reads only HTTP(S) GET responses and enforces the byte cap while the body
     * streams in. The returned detail strings are deliberately URL/body-free.
     */
    async fetchJson(url: string): Promise<CustomHttpFetchResult> {
        let parsedUrl: URL;

        try {
            parsedUrl = new URL(url);
        } catch {
            return failure("invalidUrl", "URL is invalid.");
        }

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            return failure("unsupportedProtocol", "Only HTTP and HTTPS URLs are supported.");
        }

        const startedAtMilliseconds = performance.now();
        const targetSummary = summarizeUrlForLog(parsedUrl);

        let response: Response;
        try {
            response = await this.fetch(parsedUrl, {
                redirect: "follow",
                signal: AbortSignal.timeout(this.timeoutMilliseconds),
            });
        } catch (error) {
            const dnsDiagnostic = await readDnsDiagnostic(parsedUrl.hostname, this.dnsLookup);
            const detail = [
                "HTTP request failed.",
                `elapsed=${formatElapsedMilliseconds(startedAtMilliseconds)}ms.`,
                `timeout=${this.timeoutMilliseconds}ms.`,
                formatBoundedErrorDetail(error),
                dnsDiagnostic,
            ].join(" ");
            log.atWarn()
                .everyMs(`custom-http-fetch-failure:${targetSummary}`, CUSTOM_HTTP_FETCH_LOG_THROTTLE_MILLISECONDS)
                .log(() => `Custom HTTP fetch failed. target=${targetSummary} detail=${detail}`);
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
            return failure("httpFailure", `HTTP status ${response.status}.`);
        }

        const responseTextResult = await readResponseTextBounded(response, this.responseLimitBytes);
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

async function readResponseTextBounded(
    response: Response,
    responseLimitBytes: number,
): Promise<CustomHttpFetchResult> {
    try {
        if (!response.body) {
            const responseText = await response.text();
            if (Buffer.byteLength(responseText, "utf8") > responseLimitBytes) {
                return failure("responseTooLarge", `Response exceeded ${responseLimitBytes} bytes.`);
            }

            return {
                ok: true,
                responseText,
            };
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        try {
            while (true) {
                const readResult = await reader.read();
                if (readResult.done) {
                    break;
                }

                totalBytes += readResult.value.byteLength;
                if (totalBytes > responseLimitBytes) {
                    await reader.cancel().catch(() => {
                        // The owner-visible failure is the size cap, not cleanup.
                    });
                    return failure("responseTooLarge", `Response exceeded ${responseLimitBytes} bytes.`);
                }

                chunks.push(readResult.value);
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
        };
    } catch (error) {
        return failure("networkFailure", `Response body read failed. ${formatBoundedErrorDetail(error)}`);
    }
}

function failure(reason: CustomHttpFetchFailureReason, detail: string): CustomHttpFetchResult {
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
