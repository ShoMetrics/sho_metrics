import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { prepareCustomHttpRequest, type CustomHttpPreparedAuth } from "./custom-http-auth";
import { NodeCustomHttpFetcher } from "./custom-http-fetcher";

test("NodeCustomHttpFetcher fetches HTTP JSON without exposing query-string identity", async () => {
    const fetcher = new NodeCustomHttpFetcher({
        fetch: async url => new Response(JSON.stringify({ host: url.hostname })),
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data?secret=hidden"), {
        ok: true,
        responseText: "{\"host\":\"api.example.com\"}",
    });
});

test("NodeCustomHttpFetcher passes request headers to fetch", async () => {
    let requestHeaders: RequestInit["headers"] | undefined;
    const fetcher = new NodeCustomHttpFetcher({
        fetch: async (_url, init) => {
            requestHeaders = init?.headers;
            return new Response("{}");
        },
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data", {
        headers: {
            Authorization: "Bearer secret",
            "X-Api-Key": "token",
        },
    }), {
        ok: true,
        responseText: "{}",
    });
    assert.deepEqual(requestHeaders, {
        Authorization: "Bearer secret",
        "X-Api-Key": "token",
    });
});

for (const authCase of [
    {
        name: "Basic",
        auth: {
            authKind: "basic",
            username: "111111",
            password: "111111",
        },
        expectedHeaderName: "authorization",
        expectedHeaderValue: "Basic MTExMTExOjExMTExMQ==",
        requestPath: "/data.json",
        expectedPath: "/data.json",
    },
    {
        name: "Bearer",
        auth: {
            authKind: "bearer",
            token: "bearer-token",
        },
        expectedHeaderName: "authorization",
        expectedHeaderValue: "Bearer bearer-token",
        requestPath: "/data.json",
        expectedPath: "/data.json",
    },
    {
        name: "API key header",
        auth: {
            authKind: "header",
            headerName: "X-API-Key",
            token: "header-token",
        },
        expectedHeaderName: "x-api-key",
        expectedHeaderValue: "header-token",
        requestPath: "/data.json",
        expectedPath: "/data.json",
    },
    {
        name: "API key query",
        auth: {
            authKind: "query",
            queryParameterName: "api_key",
            token: "query-token",
        },
        expectedHeaderName: undefined,
        expectedHeaderValue: undefined,
        requestPath: "/data.json?api_key=old&mode=current",
        expectedPath: "/data.json?api_key=query-token&mode=current",
    },
] satisfies readonly {
    readonly name: string;
    readonly auth: CustomHttpPreparedAuth;
    readonly expectedHeaderName: string | undefined;
    readonly expectedHeaderValue: string | undefined;
    readonly requestPath: string;
    readonly expectedPath: string;
}[]) {
    test(`NodeCustomHttpFetcher sends prepared ${authCase.name} auth to a real local HTTP server`, async () => {
        let requestUrl: string | undefined;
        let requestHeader: string | undefined;

        await withHttpServer((request, response) => {
            requestUrl = request.url;
            requestHeader = authCase.expectedHeaderName === undefined
                ? undefined
                : readSingleHeaderValue(request, authCase.expectedHeaderName);
            response.end("{}");
        }, async serverUrl => {
            const preparedRequest = prepareCustomHttpRequest({
                url: new URL(authCase.requestPath, serverUrl).toString(),
                auth: authCase.auth,
            });
            if (!preparedRequest.ok) {
                assert.fail(preparedRequest.detail);
            }

            const fetcher = new NodeCustomHttpFetcher();
            const options = preparedRequest.headers === undefined
                ? undefined
                : { headers: preparedRequest.headers };

            assert.deepEqual(await fetcher.fetchJson(preparedRequest.url, options), {
                ok: true,
                responseText: "{}",
            });
        });

        assert.equal(requestUrl, authCase.expectedPath);
        assert.equal(requestHeader, authCase.expectedHeaderValue);
    });
}

test("NodeCustomHttpFetcher blocks cross-origin redirects when request headers are attached", async () => {
    const requestedHosts: string[] = [];
    const fetcher = new NodeCustomHttpFetcher({
        fetch: async url => {
            requestedHosts.push(url.host);
            return new Response("", {
                status: 302,
                headers: {
                    Location: "https://evil.example.net/data",
                },
            });
        },
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data", {
        headers: { "X-Api-Key": "secret" },
    }), {
        ok: false,
        reason: "redirectBlocked",
        detail: "Cross-origin redirect blocked while credentials are attached. Use the redirected URL directly.",
        blockedRedirect: {
            fromOrigin: "https://api.example.com",
            toOrigin: "https://evil.example.net",
            redirectedUrl: "https://evil.example.net/data",
        },
    });
    assert.deepEqual(requestedHosts, ["api.example.com"]);
});

test("NodeCustomHttpFetcher follows safe redirects when request headers are attached", async () => {
    const requestedUrls: string[] = [];
    const fetcher = new NodeCustomHttpFetcher({
        fetch: async url => {
            requestedUrls.push(url.toString());
            return requestedUrls.length === 1
                ? new Response("", {
                    status: 301,
                    headers: {
                        Location: "https://api.example.com/data",
                    },
                })
                : new Response("{}");
        },
    });

    assert.deepEqual(await fetcher.fetchJson("http://api.example.com/data", {
        headers: { "X-Api-Key": "secret" },
    }), {
        ok: true,
        responseText: "{}",
    });
    assert.deepEqual(requestedUrls, [
        "http://api.example.com/data",
        "https://api.example.com/data",
    ]);
});

test("Node fetch manual redirect exposes status and location in the current runtime", async () => {
    await withHttpServer((_request, response) => {
        response.writeHead(302, { Location: "/target" });
        response.end();
    }, async serverUrl => {
        const response = await fetch(serverUrl, { redirect: "manual" });

        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), "/target");
    });
});

test("NodeCustomHttpFetcher does not carry query credentials to redirected URLs", async () => {
    let redirectedRequestUrl: string | undefined;
    let redirectedReferer: string | undefined;

    await withHttpServer((request, response) => {
        redirectedRequestUrl = request.url;
        redirectedReferer = request.headers.referer;
        response.end("{}");
    }, async redirectedServerUrl => {
        await withHttpServer((_request, response) => {
            response.writeHead(302, { Location: redirectedServerUrl });
            response.end();
        }, async sourceServerUrl => {
            const fetcher = new NodeCustomHttpFetcher();

            assert.deepEqual(await fetcher.fetchJson(`${sourceServerUrl}?api_key=secret`), {
                ok: true,
                responseText: "{}",
            });
        });
    });

    assert.equal(redirectedRequestUrl, "/");
    assert.equal(redirectedReferer, undefined);
});

test("NodeCustomHttpFetcher rejects unsupported protocols and invalid URLs", async () => {
    const fetcher = new NodeCustomHttpFetcher({
        fetch: async () => new Response("{}"),
    });

    assert.deepEqual(await fetcher.fetchJson("file:///tmp/data.json"), {
        ok: false,
        reason: "unsupportedProtocol",
        detail: "Only HTTP and HTTPS URLs are supported.",
    });
    assert.deepEqual(await fetcher.fetchJson("not a url"), {
        ok: false,
        reason: "invalidUrl",
        detail: "URL is invalid.",
    });
});

async function withHttpServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void,
    run: (serverUrl: string) => Promise<void>,
): Promise<void> {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    try {
        const address = server.address();
        if (!isAddressInfo(address)) {
            throw new Error("Expected HTTP test server to listen on a TCP address.");
        }

        await run(`http://127.0.0.1:${address.port}/`);
    } finally {
        server.close();
        await once(server, "close");
    }
}

function isAddressInfo(address: string | AddressInfo | null): address is AddressInfo {
    return address !== null && typeof address === "object";
}

function readSingleHeaderValue(request: IncomingMessage, headerName: string): string | undefined {
    const value = request.headers[headerName];
    return Array.isArray(value) ? value[0] : value;
}

test("NodeCustomHttpFetcher enforces response size before JSON parse", async () => {
    const fetcher = new NodeCustomHttpFetcher({
        responseLimitBytes: 4,
        fetch: async () => new Response("12345"),
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data"), {
        ok: false,
        reason: "responseTooLarge",
        detail: "Response exceeded 4 bytes.",
    });
});

test("NodeCustomHttpFetcher reports HTTP failures without putting response bodies in detail", async () => {
    let fetchCallCount = 0;
    const fetcher = new NodeCustomHttpFetcher({
        fetch: async () => {
            fetchCallCount += 1;
            return new Response("secret body", { status: 500 });
        },
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data", { retryCount: 3 }), {
        ok: false,
        reason: "httpFailure",
        detail: "HTTP status 500.",
    });
    assert.equal(fetchCallCount, 1);
});

test("NodeCustomHttpFetcher skips HTTP failure response previews unless requested", async () => {
    const responseBody = new ReadableStream<Uint8Array>({
        pull() {
            assert.fail("Failure body should not be read without preview opt-in.");
        },
    });
    const fetcher = new NodeCustomHttpFetcher({
        fetch: async () => new Response(responseBody, { status: 500 }),
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data"), {
        ok: false,
        reason: "httpFailure",
        detail: "HTTP status 500.",
    });
});

test("NodeCustomHttpFetcher includes bounded raw response previews on HTTP failures", async () => {
    const fetcher = new NodeCustomHttpFetcher({
        fetch: async () => new Response(
            JSON.stringify({
                reason: "Daily API request limit exceeded. Please try again tomorrow.",
                error: true,
            }),
            { status: 429 },
        ),
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data", {
        includeFailureResponsePreview: true,
    }), {
        ok: false,
        reason: "httpFailure",
        detail: "HTTP status 429.",
        responseTextPreview: "{\"reason\":\"Daily API request limit exceeded. Please try again tomorrow.\",\"error\":true}",
        isResponseTextPreviewTruncated: false,
    });
});

test("NodeCustomHttpFetcher truncates raw response previews on HTTP failures", async () => {
    const fetcher = new NodeCustomHttpFetcher({
        responseLimitBytes: 4,
        fetch: async () => new Response("12345", { status: 500 }),
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data", {
        includeFailureResponsePreview: true,
    }), {
        ok: false,
        reason: "httpFailure",
        detail: "HTTP status 500.",
        responseTextPreview: "1234",
        isResponseTextPreviewTruncated: true,
    });
});

test("NodeCustomHttpFetcher retries network failures with bounded retry count", async () => {
    let fetchCallCount = 0;
    let dnsLookupCallCount = 0;
    const fetcher = new NodeCustomHttpFetcher({
        dnsLookup: async () => {
            dnsLookupCallCount += 1;
            return [];
        },
        delay: async () => undefined,
        random: () => 0.5,
        fetch: async () => {
            fetchCallCount += 1;
            return fetchCallCount < 3
                ? Promise.reject(new Error("temporary network failure"))
                : new Response("{\"ok\":true}");
        },
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data", { retryCount: 2 }), {
        ok: true,
        responseText: "{\"ok\":true}",
    });
    assert.equal(fetchCallCount, 3);
    assert.equal(dnsLookupCallCount, 0);
});

test("NodeCustomHttpFetcher runs DNS diagnostics only after the final network failure", async () => {
    let fetchCallCount = 0;
    let dnsLookupCallCount = 0;
    const fetcher = new NodeCustomHttpFetcher({
        dnsLookup: async () => {
            dnsLookupCallCount += 1;
            return [{ address: "192.0.2.1", family: 4 }];
        },
        delay: async () => undefined,
        random: () => 0.5,
        fetch: async () => {
            fetchCallCount += 1;
            throw new Error("temporary network failure");
        },
    });

    const result = await fetcher.fetchJson("https://api.example.com/data", { retryCount: 2 });

    if (result.ok) {
        assert.fail("Expected fetch failure.");
    }

    assert.equal(result.reason, "networkFailure");
    assert.equal(fetchCallCount, 3);
    assert.equal(dnsLookupCallCount, 1);
    assert.match(result.detail, /dnsFamilies=ipv4:1,ipv6:0\.$/);
});

test("NodeCustomHttpFetcher bounds hanging requests with an abort signal", async () => {
    const fetcher = new NodeCustomHttpFetcher({
        defaultTimeoutMilliseconds: 1,
        dnsLookup: async () => [
            { address: "192.0.2.1", family: 4 },
            { address: "2001:db8::1", family: 6 },
        ],
        fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    });

    const result = await fetcher.fetchJson("https://api.example.com/data");

    if (result.ok) {
        assert.fail("Expected fetch failure.");
    }

    assert.equal(result.reason, "networkFailure");
    assert.match(
        result.detail,
        /^HTTP request failed\. elapsed=\d+ms\. timeout=1ms\. Error: aborted dnsElapsed=\d+ms\. dnsFamilies=ipv4:1,ipv6:1\.$/,
    );
});

test("NodeCustomHttpFetcher includes bounded DNS failures in network diagnostics", async () => {
    const fetcher = new NodeCustomHttpFetcher({
        defaultTimeoutMilliseconds: 1,
        dnsLookup: async () => {
            throw new Error("lookup failed");
        },
        fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    });

    const result = await fetcher.fetchJson("https://api.example.com/data");

    if (result.ok) {
        assert.fail("Expected fetch failure.");
    }

    assert.equal(result.reason, "networkFailure");
    assert.match(
        result.detail,
        /^HTTP request failed\. elapsed=\d+ms\. timeout=1ms\. Error: aborted dnsElapsed=\d+ms\. dnsFailure=Error: lookup failed$/,
    );
});

test("NodeCustomHttpFetcher bounds slow DNS diagnostics after request failures", async () => {
    const fetcher = new NodeCustomHttpFetcher({
        defaultTimeoutMilliseconds: 1,
        dnsLookup: async () => new Promise(() => {
            // A hung DNS diagnostic must not extend the user-visible fetch failure.
        }),
        fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    });

    const result = await fetcher.fetchJson("https://api.example.com/data");

    if (result.ok) {
        assert.fail("Expected fetch failure.");
    }

    assert.equal(result.reason, "networkFailure");
    assert.match(
        result.detail,
        /^HTTP request failed\. elapsed=\d+ms\. timeout=1ms\. Error: aborted dnsElapsed=\d+ms\. dnsTimeout=750ms\.$/,
    );
});

test("NodeCustomHttpFetcher reports response body read failures as network failures", async () => {
    const failingBody = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
            controller.error(new Error("connection reset"));
        },
    });
    const fetcher = new NodeCustomHttpFetcher({
        fetch: async () => new Response(failingBody),
    });

    const result = await fetcher.fetchJson("https://api.example.com/data");

    if (result.ok) {
        assert.fail("Expected body read failure.");
    }

    assert.equal(result.reason, "networkFailure");
    assert.equal(result.detail, "Response body read failed. Error: connection reset");
});

test("NodeCustomHttpFetcher preserves response-too-large failures when body cleanup fails", async () => {
    const oversizedBody = new ReadableStream<Uint8Array>({
        pull(controller) {
            controller.enqueue(new TextEncoder().encode("12345"));
        },
        cancel() {
            throw new Error("cancel failed");
        },
    });
    const fetcher = new NodeCustomHttpFetcher({
        responseLimitBytes: 4,
        fetch: async () => new Response(oversizedBody),
    });

    assert.deepEqual(await fetcher.fetchJson("https://api.example.com/data"), {
        ok: false,
        reason: "responseTooLarge",
        detail: "Response exceeded 4 bytes.",
    });
});
