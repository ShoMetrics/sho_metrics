import type { HubLocale, LocalizedMessage, PlaceholderValues } from "./types";

const PLACEHOLDER_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/gu;
const RICH_TAG_PATTERN = /<([a-z][A-Za-z0-9]*)>([^<>]+)<\/\1>/gu;
const TAG_LIKE_PATTERN = /<\/?[a-z][A-Za-z0-9]*>/u;

export type RichMessageSegment =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "tag"; readonly name: string; readonly text: string };

/**
 * Formats one localized message with v1 named placeholder interpolation.
 */
export function formatMessage(
    locale: HubLocale,
    message: LocalizedMessage,
    values: PlaceholderValues = {},
    strict = false,
): string {
    return formatMessageText(selectLocalizedMessageTemplate(locale, message), values, strict);
}

/**
 * Formats placeholders only after rich-text tags have been isolated.
 *
 * Interpolating first would let a runtime placeholder value synthesize a rich
 * tag and choose a renderer such as an external link.
 */
export function formatMessageText(
    template: string,
    values: PlaceholderValues = {},
    strict = false,
): string {
    return template.replace(PLACEHOLDER_PATTERN, (_match, placeholderName: string) => {
        const value = values[placeholderName];
        if (value === undefined && strict) {
            throw new Error(`Missing i18n placeholder value: ${placeholderName}`);
        }

        return value === undefined ? "" : String(value);
    });
}

/** Selects the locale-specific text for one complete localized message. */
export function selectLocalizedMessageTemplate(locale: HubLocale, message: LocalizedMessage): string {
    return message[locale] ?? message.en;
}

/** Splits one non-nested rich-text template into literal text and named tag segments. */
export function parseRichMessageSegments(template: string): readonly RichMessageSegment[] {
    const segmentList: RichMessageSegment[] = [];
    let previousMatchEndIndex = 0;

    for (const match of template.matchAll(RICH_TAG_PATTERN)) {
        const matchStartIndex = match.index ?? 0;
        const tagName = match[1];
        const tagText = match[2];
        if (tagName === undefined || tagText === undefined) {
            continue;
        }

        appendTextSegment(segmentList, template.slice(previousMatchEndIndex, matchStartIndex));
        segmentList.push({ kind: "tag", name: tagName, text: tagText });
        previousMatchEndIndex = matchStartIndex + match[0].length;
    }

    appendTextSegment(segmentList, template.slice(previousMatchEndIndex));
    return segmentList;
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

/** Lists unique rich-text tag names used by one message template. */
export function extractRichTagNames(messageText: string): readonly string[] {
    const tagNameSet = new Set<string>();

    for (const segment of parseRichMessageSegments(messageText)) {
        if (segment.kind === "tag") {
            tagNameSet.add(segment.name);
        }
    }

    return [...tagNameSet].sort();
}

/**
 * Returns malformed tag syntax and tag-name mismatches across one localized message.
 *
 * This validator runs over every catalog message, so `<name>` is globally
 * reserved rich-text syntax and has no literal escape sequence today.
 */
export function validateLocalizedMessageTags(message: LocalizedMessage): readonly string[] {
    const errorList: string[] = [];
    const hasMalformedEnglishTagSyntax = hasMalformedRichTagSyntax(message.en);
    const englishTagNames = hasMalformedEnglishTagSyntax ? [] : extractRichTagNames(message.en);

    for (const [locale, localizedText] of Object.entries(message)) {
        if (hasMalformedRichTagSyntax(localizedText)) {
            errorList.push(`${locale} invalid rich tag syntax`);
            continue;
        }

        const localizedTagNames = extractRichTagNames(localizedText);
        if (!hasMalformedEnglishTagSyntax && !areStringArraysEqual(englishTagNames, localizedTagNames)) {
            errorList.push(`${locale} rich tag mismatch`);
        }
    }

    return errorList;
}

function appendTextSegment(segmentList: RichMessageSegment[], text: string): void {
    if (text !== "") {
        segmentList.push({ kind: "text", text });
    }
}

function hasMalformedRichTagSyntax(template: string): boolean {
    return template.replace(RICH_TAG_PATTERN, "").match(TAG_LIKE_PATTERN) !== null;
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
