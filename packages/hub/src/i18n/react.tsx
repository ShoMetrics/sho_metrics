import { Fragment, createContext, useContext, useMemo } from "react";
import {
    formatMessage,
    formatMessageText,
    parseRichMessageSegments,
    selectLocalizedMessageTemplate,
} from "./format";
import type { HubLocale, LocalizedMessage, PlaceholderValues } from "./types";

/**
 * Maps one localized rich-text tag name to its React renderer.
 *
 * Children are already-interpolated text and can contain runtime data. Render
 * them as text only; never treat them as a URL, HTML, or other executable value.
 */
export type RichMessageTagRenderers = Readonly<Record<string, (children: string) => React.ReactNode>>;

export interface I18n {
    readonly locale: HubLocale;
    t(message: LocalizedMessage, values?: PlaceholderValues): string;
    /** Formats one localized message with its named rich-text tags rendered as React nodes. */
    rich(message: LocalizedMessage, renderers: RichMessageTagRenderers, values?: PlaceholderValues): React.ReactNode;
}

const englishI18n: I18n = {
    locale: "en",
    t: (message, values) => formatMessage("en", message, values),
    rich: (message, renderers, values) => formatRichMessage("en", message, renderers, values),
};

const I18nContext = createContext<I18n>(englishI18n);

/**
 * Provides the active Hub locale and formatter to PI React components.
 */
export function I18nProvider({
    children,
    locale,
}: {
    readonly children: React.ReactNode;
    readonly locale: HubLocale;
}): React.JSX.Element {
    const i18n = useMemo<I18n>(() => ({
        locale,
        t: (message, values) => formatMessage(locale, message, values),
        rich: (message, renderers, values) => formatRichMessage(locale, message, renderers, values),
    }), [locale]);

    return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>;
}

/**
 * Reads the active i18n context for PI React components.
 */
export function useI18n(): I18n {
    return useContext(I18nContext);
}

function formatRichMessage(
    locale: HubLocale,
    message: LocalizedMessage,
    renderers: RichMessageTagRenderers,
    values: PlaceholderValues | undefined,
): React.ReactNode {
    const template = selectLocalizedMessageTemplate(locale, message);

    return parseRichMessageSegments(template).map((segment, index) => {
        const children = formatMessageText(segment.text, values);
        if (segment.kind === "text") {
            return children;
        }

        const renderTag = renderers[segment.name];
        return renderTag === undefined
            ? children
            : <Fragment key={`${segment.name}-${index}`}>{renderTag(children)}</Fragment>;
    });
}
