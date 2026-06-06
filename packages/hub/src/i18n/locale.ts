import type { HubLocale } from "./types";

/**
 * Maps an untrusted Stream Deck language value to the Hub locale set.
 */
export function normalizeHubLocale(value: unknown): HubLocale {
    if (value === "en" || value === "zh_CN" || value === "ja") {
        return value;
    }

    return "en";
}
