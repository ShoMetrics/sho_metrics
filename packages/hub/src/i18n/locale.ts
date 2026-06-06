import type { HubLocale } from "./types";

/**
 * Maps an untrusted Stream Deck language value to the Hub locale set.
 */
export function normalizeHubLocale(value: unknown): HubLocale {
    return readSupportedHubLocale(value) ?? "en";
}

/**
 * Resolves the PI locale, including the development-only manual override.
 */
export function resolveHubLocale(streamDeckLanguage: unknown): HubLocale {
    const devOverride = readDevLocaleOverride();

    return devOverride ?? normalizeHubLocale(streamDeckLanguage);
}

function readDevLocaleOverride(): HubLocale | null {
    if (typeof __BUILD_MODE__ === "undefined" || __BUILD_MODE__ !== "development") {
        return null;
    }

    return typeof __DEV_LOCALE_OVERRIDE__ === "undefined"
        ? null
        : __DEV_LOCALE_OVERRIDE__;
}

function readSupportedHubLocale(value: unknown): HubLocale | null {
    if (value === "en" || value === "zh_CN" || value === "ja") {
        return value;
    }

    return null;
}
