import assert from "node:assert/strict";
import { test } from "vitest";
import { SPARKLE_NAMESPACE_URI } from "./appcast-parser";
import {
    MAXIMUM_APPCAST_RESPONSE_BYTES,
    PROD_APPCAST_URL,
    STAGING_APPCAST_URL,
    createHelperUpdateFeed,
    fetchAppcastOverHttps,
} from "./helper-update-feed";
import { selectHelperUpdateNotice } from "./helper-update-notice";

test("reports the releases the published feed offers", async () => {
    const feed = createHelperUpdateFeed({
        fetchAppcast: () => Promise.resolve(buildAppcast()),
        resolveEndpoint: () => Promise.resolve({
            appcastUrl: PROD_APPCAST_URL,
            channel: "prod",
            phasedRolloutGroup: undefined,
        }),
    });

    const releases = await feed.readReleases();

    assert.equal(releases.channel, "prod");
    assert.deepEqual(releases.items.map(item => item.version), ["0.2.0", "0.2.1"]);

    // The feed says what is published; which release a Helper is behind is not
    // its question to answer, and asking it here is what lets the notifier answer
    // it again later without reading the feed a second time.
    assert.deepEqual(
        selectHelperUpdateNotice({
            ...releases,
            installedVersion: "0.1.0",
            nowTimestampMilliseconds: Date.parse("2025-06-01T00:00:00Z"),
        }),
        { state: "updateAvailable", urgency: "required", availableVersion: "0.2.1" },
    );
});

test("reads the feed the resolved endpoint points at", async () => {
    const requestedUrls: string[] = [];
    const feed = createHelperUpdateFeed({
        fetchAppcast: (appcastUrl) => {
            requestedUrls.push(appcastUrl);
            return Promise.resolve(buildAppcast());
        },
        resolveEndpoint: () => Promise.resolve({
            appcastUrl: STAGING_APPCAST_URL,
            channel: "staging",
            phasedRolloutGroup: undefined,
        }),
    });

    await feed.readReleases();

    assert.deepEqual(requestedUrls, [STAGING_APPCAST_URL]);
});

// The feed URL and channel are fixed when the plugin is built, so there is no
// runtime input to validate and no allowlist to get right: a shipped build has
// no way to be pointed at another feed. rollup.config.mjs refuses to substitute
// a development URL into any other build, and check-production-bundle.mjs
// asserts the shipped bundle really does read the published feed.

test("reads an appcast served over https", async () => {
    const xml = await fetchAppcastOverHttps(
        PROD_APPCAST_URL,
        () => Promise.resolve(buildResponse(PROD_APPCAST_URL, [Buffer.from("<rss />", "utf8")])),
    );

    assert.equal(xml, "<rss />");
});

test("refuses an appcast that a redirect took off https", async () => {
    // Node follows redirects and enforces neither mixed content nor HSTS, so this
    // asserts where the body came from rather than trusting the runtime not to
    // walk off https on its way there. The published feed redirects nowhere: a
    // live probe of it answers 200 in zero hops.
    await assert.rejects(
        async () => await fetchAppcastOverHttps(
            PROD_APPCAST_URL,
            () => Promise.resolve(buildResponse(
                "http://shometrics.github.io.evil.test/update/windows-appcast.xml",
                [Buffer.from("<rss />", "utf8")],
            )),
        ),
        /ended on a non-https URL/u,
    );
});

test("stops reading an appcast body that runs past the cap", async () => {
    // The cap has to hold while the body streams, not after it lands: a host that
    // answers with an endless body would otherwise exhaust the plugin's memory
    // before its size was ever known. Asserting that the later chunks are never
    // pulled is what separates that from a check made after the fact.
    const chunkBytes = Math.ceil(MAXIMUM_APPCAST_RESPONSE_BYTES * 0.6);
    const chunks = Array.from({ length: 5 }, () => Buffer.alloc(chunkBytes, 0x20));
    const pulledChunkCounter = { count: 0 };

    await assert.rejects(
        async () => await fetchAppcastOverHttps(
            PROD_APPCAST_URL,
            () => Promise.resolve(buildResponse(PROD_APPCAST_URL, chunks, pulledChunkCounter)),
        ),
        /too large/u,
    );

    assert.equal(pulledChunkCounter.count, 2);
});

function buildResponse(
    url: string,
    chunks: readonly Uint8Array[],
    pulledChunkCounter: { count: number } = { count: 0 },
): Response {
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            const chunk = chunks[pulledChunkCounter.count];
            if (chunk === undefined) {
                controller.close();
                return;
            }

            pulledChunkCounter.count++;
            controller.enqueue(chunk);
        },
    // A stream reads one chunk ahead of its consumer by default, which would make
    // the count report the stream's buffering rather than what the reader asked
    // for. Nothing here needs the read-ahead, and without it the count says
    // exactly how far the reader got.
    }, { highWaterMark: 0 });
    const response = new Response(body, { status: 200 });

    // Response.url is where the body actually came from, and it is read-only
    // because only a real fetch is meant to set it. That is exactly the field
    // under test, so the test has to say what a redirect would have left there.
    Object.defineProperty(response, "url", { value: url });

    return response;
}

function buildAppcast(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
        <rss version="2.0" xmlns:sparkle="${SPARKLE_NAMESPACE_URI}">
          <channel>
            <item>
              <sparkle:version>0.2.0</sparkle:version>
              <sparkle:criticalUpdate />
            </item>
            <item>
              <sparkle:version>0.2.1</sparkle:version>
            </item>
          </channel>
        </rss>`;
}
