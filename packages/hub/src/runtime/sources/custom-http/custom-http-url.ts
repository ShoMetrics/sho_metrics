/**
 * Normalizes user-entered Custom HTTP source URLs before fetch/runtime use.
 *
 * The Property Inspector applies this on blur so the user can see the final URL.
 * Settings resolution also applies it as a safety net for imported or hand-edited
 * settings that did not pass through the editor.
 */
export function normalizeCustomHttpSourceUrlInput(url: string): string {
    const trimmedUrl = url.trim();
    if (trimmedUrl.length === 0 || ABSOLUTE_URL_SCHEME_PATTERN.test(trimmedUrl)) {
        return trimmedUrl;
    }

    if (BROKEN_HTTP_SCHEME_PREFIX_PATTERN.test(trimmedUrl)) {
        return trimmedUrl;
    }

    if (trimmedUrl.startsWith("//")) {
        return `https:${trimmedUrl}`;
    }

    return `${readDefaultUrlScheme(trimmedUrl)}://${trimmedUrl}`;
}

const ABSOLUTE_URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const BROKEN_HTTP_SCHEME_PREFIX_PATTERN = /^https?[:/\\]/i;

function readDefaultUrlScheme(urlWithoutScheme: string): "http" | "https" {
    const host = readUrlHostWithoutScheme(urlWithoutScheme);
    if (host === undefined) {
        return "https";
    }

    return isLocalHttpHost(host) ? "http" : "https";
}

function readUrlHostWithoutScheme(urlWithoutScheme: string): string | undefined {
    try {
        return new URL(`http://${urlWithoutScheme}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    } catch {
        return undefined;
    }
}

function isLocalHttpHost(host: string): boolean {
    // Keep this conservative: only common local development and private LAN targets
    // default to HTTP. Other special-purpose ranges still default to HTTPS.
    if (host === "localhost" || host.endsWith(".localhost") || host === "::1") {
        return true;
    }

    return isPrivateOrLoopbackIpv4Host(host);
}

function isPrivateOrLoopbackIpv4Host(host: string): boolean {
    const parts = host.split(".");
    if (parts.length !== 4) {
        return false;
    }

    const firstOctet = readIpv4Octet(parts[0]);
    const secondOctet = readIpv4Octet(parts[1]);
    const thirdOctet = readIpv4Octet(parts[2]);
    const fourthOctet = readIpv4Octet(parts[3]);
    if (
        firstOctet === undefined
        || secondOctet === undefined
        || thirdOctet === undefined
        || fourthOctet === undefined
    ) {
        return false;
    }

    return firstOctet === 10
        || firstOctet === 127
        || (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31)
        || (firstOctet === 192 && secondOctet === 168);
}

function readIpv4Octet(value: string | undefined): number | undefined {
    if (value === undefined || !/^\d{1,3}$/.test(value)) {
        return undefined;
    }

    const octet = Number(value);
    return octet >= 0 && octet <= 255 ? octet : undefined;
}
