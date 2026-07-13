import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { logger } from "../../logging/node-logger";
import { parseAppcastItems, type AppcastItem } from "./appcast-parser";
import { type HelperUpdateChannel } from "./helper-update-notice";
import { readPhasedRolloutGroup } from "./phased-rollout";

/**
 * Reads the published Helper appcast.
 *
 * These endpoint constants must stay equal to ProdAppcastUrl and
 * StagingAppcastUrl in UpdateAppcastClient.cs and to the files served from
 * site/static/update. Test-WindowsInstallerInvariants.ps1 asserts that, because
 * a plugin pointed at a feed nobody publishes would report "no update" forever,
 * and would do it silently.
 */
export const PROD_APPCAST_URL = "https://shometrics.github.io/update/windows-appcast.xml";
export const STAGING_APPCAST_URL = "https://shometrics.github.io/update/windows-appcast-staging.xml";

const log = logger.for("HelperUpdateFeed");

const APPCAST_REQUEST_TIMEOUT_MILLISECONDS = 8_000;

/** Largest appcast this reads, enforced while streaming so an endless body is cut off. */
export const MAXIMUM_APPCAST_RESPONSE_BYTES = 1024 * 1024;
const APPCAST_FILE_SCHEME = "file:";
const HTTPS_SCHEME = "https:";

/** Where the update feed is read from, and how this user is placed in a staged release. */
export interface HelperUpdateEndpoint {
    readonly appcastUrl: string;
    readonly channel: HelperUpdateChannel;
    readonly phasedRolloutGroup: number | undefined;
}

interface HelperUpdateFeedDependencies {
    fetchAppcast(appcastUrl: string): Promise<string>;
    resolveEndpoint(): Promise<HelperUpdateEndpoint>;
}

/**
 * What the feed publishes, and who this user is to it.
 *
 * Deliberately says nothing about the installed Helper. The releases change when
 * we publish one, which is rarely and over the network; which release the user is
 * behind changes when they install one, which is locally and for free. Answering
 * both questions in one call would tie the cheap one to the expensive one, and a
 * user who installs the update we asked them to install would keep being asked
 * until the next network read came around.
 */
export interface HelperUpdateReleases {
    readonly items: readonly AppcastItem[];
    readonly channel: HelperUpdateChannel;
    readonly phasedRolloutGroup: number | undefined;
}

/** Reads the releases the publisher is offering. */
export interface HelperUpdateFeed {
    readReleases(): Promise<HelperUpdateReleases>;
}

/** Reads the published Helper update feed. */
export const helperUpdateFeed = createHelperUpdateFeed({
    fetchAppcast: fetchAppcastOverHttps,
    resolveEndpoint: resolveHelperUpdateEndpoint,
});

/** Creates a Helper update feed reader with network and identity seams for tests. */
export function createHelperUpdateFeed(dependencies: HelperUpdateFeedDependencies): HelperUpdateFeed {
    return {
        async readReleases(): Promise<HelperUpdateReleases> {
            const endpoint = await dependencies.resolveEndpoint();
            const xml = await dependencies.fetchAppcast(endpoint.appcastUrl);

            return {
                items: parseAppcastItems(xml),
                channel: endpoint.channel,
                phasedRolloutGroup: endpoint.phasedRolloutGroup,
            };
        },
    };
}

async function resolveHelperUpdateEndpoint(): Promise<HelperUpdateEndpoint> {
    const endpoint: HelperUpdateEndpoint = {
        appcastUrl: resolveAppcastUrl(),
        channel: resolveChannel(),
        phasedRolloutGroup: await readPhasedRolloutGroup(),
    };

    // Without this, neither of the two questions a missing update notice raises
    // can be answered: which feed was read, and whether this user's rollout group
    // had come up yet. It also confirms an override was actually accepted rather
    // than silently rejected back to the published feed.
    log.info(() => [
        "helperUpdateFeedResolved",
        `appcastUrl=${endpoint.appcastUrl}`,
        `channel=${endpoint.channel}`,
        `phasedRolloutGroup=${endpoint.phasedRolloutGroup ?? "none"}`,
    ].join(" "));

    return endpoint;
}

/**
 * Resolves the update channel this build belongs to.
 *
 * A development build reads the production channel rather than a channel of its
 * own: what it is for is seeing what a user would see. A developer who wants a
 * different feed points the build at one with SHO_METRICS_DEV_APPCAST_URL, which
 * is a clearer thing to say than a channel name that silently filters items.
 */
function resolveChannel(): HelperUpdateChannel {
    return __BUILD_MODE__ === "staging" ? "staging" : "prod";
}

/**
 * Resolves the feed this build reads.
 *
 * The URL is fixed when the plugin is built, not read from the environment at
 * run time. Stream Deck, not the developer's shell, spawns the plugin process,
 * so an exported variable never reaches it: only a persisted machine-wide one
 * would, and only after Stream Deck itself is restarted. That surprise is what
 * the compile-time constant removes, and it matches how the locale override
 * already works.
 *
 * A shipped build therefore has no way to be pointed at another feed at all.
 * There is no allowlist to get right, because there is no untrusted input: the
 * rollup config refuses to substitute a development URL into any other build.
 */
function resolveAppcastUrl(): string {
    if (typeof __DEV_APPCAST_URL__ === "string") {
        return __DEV_APPCAST_URL__;
    }

    return __BUILD_MODE__ === "staging" ? STAGING_APPCAST_URL : PROD_APPCAST_URL;
}

/** Fetches an appcast, refusing anything the redirect chain turned into plaintext. */
export async function fetchAppcastOverHttps(
    appcastUrl: string,
    fetchResponse: typeof fetch = fetch,
): Promise<string> {
    // Only a development build can be built with a file URL, so a shipped plugin
    // never reaches this branch. It exists so a test feed can be iterated on
    // without publishing anything, including feeds no publisher would produce: a
    // malformed item, an oversized body, an entity-expansion attempt.
    if (appcastUrl.startsWith(APPCAST_FILE_SCHEME)) {
        return readFile(fileURLToPath(appcastUrl), "utf8");
    }

    const response = await fetchResponse(appcastUrl, {
        signal: AbortSignal.timeout(APPCAST_REQUEST_TIMEOUT_MILLISECONDS),
        headers: { accept: "application/xml" },
    });

    // Node follows redirects and has no notion of mixed content or HSTS, so
    // nothing in the platform stops a chain that starts on https from ending on
    // plaintext http. This checks where the response actually came from rather
    // than asserting what the runtime's redirect policy is, which is the only
    // form of this guard that stays true when that policy changes under us. The
    // published feed redirects nowhere, so this only ever fires on a feed that is
    // not the one we asked for.
    if (!response.url.startsWith(HTTPS_SCHEME)) {
        throw new Error(`Appcast request ended on a non-https URL: ${response.url}`);
    }

    if (!response.ok) {
        throw new Error(`Appcast request failed with status ${response.status}.`);
    }

    return readBoundedResponseText(response, MAXIMUM_APPCAST_RESPONSE_BYTES);
}

/**
 * Reads a response body, stopping as soon as it exceeds the allowed size.
 *
 * The cap is enforced while streaming rather than after reading, so a feed host
 * that answers with an endless body cannot exhaust the plugin's memory before
 * the size is known. Content-Length is not trusted for this: it is a claim by
 * the same party that sends the body.
 */
async function readBoundedResponseText(response: Response, maximumBytes: number): Promise<string> {
    if (response.body === null) {
        throw new Error("Appcast response has no body.");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        totalBytes += value.byteLength;
        if (totalBytes > maximumBytes) {
            await reader.cancel();
            throw new Error("Appcast response is too large.");
        }

        chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return new TextDecoder("utf-8").decode(body);
}
