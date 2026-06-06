import { createContext, useContext, useMemo } from "react";
import { formatMessage } from "./format";
import type { HubLocale, LocalizedMessage, PlaceholderValues } from "./types";

export interface I18n {
    readonly locale: HubLocale;
    t(message: LocalizedMessage, values?: PlaceholderValues): string;
}

const I18nContext = createContext<I18n | null>(null);

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
    const i18n = useContext(I18nContext);

    if (!i18n) {
        throw new Error("I18nProvider is required.");
    }

    return i18n;
}
