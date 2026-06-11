const CUSTOM_HTTP_RESPONSE_LIMIT_BYTES = 256 * 1024;
const CUSTOM_HTTP_FETCH_TIMEOUT_MILLISECONDS = 5000;

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

export class NodeCustomHttpFetcher implements CustomHttpFetcher {
    private readonly fetch: FetchLike;
    private readonly responseLimitBytes: number;
    private readonly timeoutMilliseconds: number;

    constructor(options: {
        readonly fetch?: FetchLike;
        readonly responseLimitBytes?: number;
        readonly timeoutMilliseconds?: number;
    } = {}) {
        this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
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

        let response: Response;
        try {
            response = await this.fetch(parsedUrl, {
                redirect: "follow",
                signal: AbortSignal.timeout(this.timeoutMilliseconds),
            });
        } catch {
            return failure("networkFailure", "HTTP request failed.");
        }

        if (!response.ok) {
            return failure("httpFailure", `HTTP status ${response.status}.`);
        }

        const responseTextResult = await readResponseTextBounded(response, this.responseLimitBytes);
        if (!responseTextResult.ok) {
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
    } catch {
        return failure("networkFailure", "Response body read failed.");
    }
}

function failure(reason: CustomHttpFetchFailureReason, detail: string): CustomHttpFetchResult {
    return {
        ok: false,
        reason,
        detail,
    };
}
