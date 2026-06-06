import { createContext, useContext, useMemo } from "react";
import { formatMessage } from "./format";
import type { HubLocale, LocalizedMessage, PlaceholderValues } from "./types";

export interface I18n {
    readonly locale: HubLocale;
    t(message: LocalizedMessage, values?: PlaceholderValues): string;
}

const englishI18n: I18n = {
    locale: "en",
    t: (message, values) => formatMessage("en", message, values),
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
    }), [locale]);

    return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>;
}

/**
 * Reads the active i18n context for PI React components.
 */
export function useI18n(): I18n {
    return useContext(I18nContext);
}
