import type { HubLocale, LocalizedMessage, PlaceholderValues } from "./types";

const PLACEHOLDER_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/gu;

/**
 * Formats one localized message with v1 named placeholder interpolation.
 */
export function formatMessage(
    locale: HubLocale,
    message: LocalizedMessage,
    values: PlaceholderValues = {},
    strict = false,
): string {
    const template = message[locale] ?? message.en;

    return template.replace(PLACEHOLDER_PATTERN, (_match, placeholderName: string) => {
        const value = values[placeholderName];
        if (value === undefined && strict) {
            throw new Error(`Missing i18n placeholder value: ${placeholderName}`);
        }

        return value === undefined ? "" : String(value);
    });
}

/**
 * Lists unique named placeholders used by one message template.
 */
export function extractPlaceholderNames(messageText: string): readonly string[] {
    const placeholderNameSet = new Set<string>();

    for (const match of messageText.matchAll(PLACEHOLDER_PATTERN)) {
        placeholderNameSet.add(match[1]);
    }

    return [...placeholderNameSet].sort();
}

/**
 * Returns locales whose placeholders differ from the English template.
 */
export function validateLocalizedMessagePlaceholders(message: LocalizedMessage): readonly string[] {
    const englishPlaceholderNames = extractPlaceholderNames(message.en);
    const mismatchList: string[] = [];

    for (const [locale, localizedText] of Object.entries(message)) {
        const localizedPlaceholderNames = extractPlaceholderNames(localizedText);
        if (!areStringArraysEqual(englishPlaceholderNames, localizedPlaceholderNames)) {
            mismatchList.push(locale);
        }
    }

    return mismatchList;
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
