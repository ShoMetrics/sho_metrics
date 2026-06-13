import assert from "node:assert/strict";
import test from "node:test";
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
