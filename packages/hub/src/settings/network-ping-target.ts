import isFQDN from "validator/lib/isFQDN";
import isIP from "validator/lib/isIP";
import stripLow from "validator/lib/stripLow";

export const DEFAULT_NETWORK_PING_TARGET_HOST = "8.8.8.8";

export type NetworkPingTargetNormalizationStatus =
    | "normalized"
    | "defaulted";

export interface NormalizedNetworkPingTarget {
    readonly targetHost: string;
    readonly status: NetworkPingTargetNormalizationStatus;
}

const HOSTNAME_MAX_LENGTH = 253;
const HTTP_SCHEME_PATTERN = /^https?:\/\//iu;

export function normalizeNetworkPingTargetInput(input: string): NormalizedNetworkPingTarget {
    const trimmedInput = input.trim();

    if (trimmedInput.length === 0 || hasInvalidPingTargetCharacter(trimmedInput)) {
        return defaultNetworkPingTarget();
    }

    const parsedHostname = parseNetworkPingTargetHostname(trimmedInput);
    if (parsedHostname === undefined) {
        return defaultNetworkPingTarget();
    }

    const host = stripIpv6Brackets(parsedHostname);
    if (host.length === 0) {
        return defaultNetworkPingTarget();
    }

    if (isIP(host)) {
        return {
            targetHost: host,
            status: "normalized",
        };
    }

    const dnsHost = host.toLowerCase().replace(/\.$/u, "");
    if (isInvalidIpv4LikeDnsHost(dnsHost)) {
        return defaultNetworkPingTarget();
    }

    if (!isValidDnsHost(dnsHost)) {
        return defaultNetworkPingTarget();
    }

    return {
        targetHost: dnsHost,
        status: "normalized",
    };
}

function hasInvalidPingTargetCharacter(input: string): boolean {
    if (stripLow(input) !== input) {
        return true;
    }

    for (const character of input) {
        if (character.trim().length === 0) {
            return true;
        }
    }

    return false;
}

function parseNetworkPingTargetHostname(input: string): string | undefined {
    try {
        const url = new URL(HTTP_SCHEME_PATTERN.test(input) ? input : `http://${input}`);
        return url.hostname;
    } catch (error) {
        void error;
        return undefined;
    }
}

function stripIpv6Brackets(hostname: string): string {
    return hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;
}

function isValidDnsHost(host: string): boolean {
    return host.length > 0
        && host.length <= HOSTNAME_MAX_LENGTH
        && isFQDN(host, {
            require_tld: false,
            allow_underscores: false,
            allow_trailing_dot: false,
        });
}

function isInvalidIpv4LikeDnsHost(host: string): boolean {
    const labels = host.split(".");
    if (labels.length !== 4) {
        return false;
    }

    if (labels.every(label => /^\d+$/u.test(label))) {
        return true;
    }

    return labels.slice(0, 3).every(label => /^\d+$/u.test(label))
        && /^\d/u.test(labels[3]);
}

function defaultNetworkPingTarget(): NormalizedNetworkPingTarget {
    return {
        targetHost: DEFAULT_NETWORK_PING_TARGET_HOST,
        status: "defaulted",
    };
}
