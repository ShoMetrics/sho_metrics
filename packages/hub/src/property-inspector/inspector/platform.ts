import type { MetricSupportPlatform } from "../../runtime/source-capabilities/metric-support-platform";

export type PropertyInspectorPlatform = MetricSupportPlatform;

const NODE_PLATFORM_VALUES: readonly NodeJS.Platform[] = [
    "aix",
    "android",
    "darwin",
    "freebsd",
    "haiku",
    "linux",
    "openbsd",
    "sunos",
    "win32",
    "cygwin",
    "netbsd",
];

/**
 * Normalizes Stream Deck PI host platform strings into the Hub platform vocabulary.
 *
 * The Stream Deck registration payload is the best platform signal available
 * to the browser-based PI. Keep known host strings distinct so unsupported
 * platforms can degrade conservatively without being mistaken for Windows or
 * macOS.
 */
export function normalizePropertyInspectorHostPlatform(platformValue: unknown): PropertyInspectorPlatform {
    const normalizedPlatformValue = String(platformValue ?? "").toLowerCase();
    const nodePlatform = resolveNodePlatform(normalizedPlatformValue);

    if (nodePlatform !== undefined) {
        return nodePlatform;
    }

    if (normalizedPlatformValue.includes("mac") || normalizedPlatformValue.includes("darwin")) {
        return "darwin";
    }

    if (normalizedPlatformValue.includes("win")) {
        return "win32";
    }

    return "other";
}

function resolveNodePlatform(normalizedPlatformValue: string): NodeJS.Platform | undefined {
    return NODE_PLATFORM_VALUES.find(platform =>
        normalizedPlatformValue === platform
            || normalizedPlatformValue.startsWith(`${platform} `)
            || normalizedPlatformValue.startsWith(`${platform}-`)
            || normalizedPlatformValue.startsWith(`${platform}_`),
    );
}
