import { useEffect, useState } from "react";
import { I18nProvider } from "../i18n/react";
import { resolveHubLocale } from "../i18n/locale";
import type { HubLocale } from "../i18n/types";
import { App } from "./App";
import {
    readPropertyInspectorLanguageValue,
    type StreamDeckPropertyInspectorClient,
} from "./stream-deck/stream-deck-client";

interface PropertyInspectorRootProps {
    readonly client: StreamDeckPropertyInspectorClient;
}

export function PropertyInspectorRoot({ client }: PropertyInspectorRootProps): React.JSX.Element | null {
    const [locale, setLocale] = useState<HubLocale | null>(null);

    useEffect(() => {
        let isMounted = true;

        void client.getConnectionInfo()
            .then((connectionInfo) => {
                if (isMounted) {
                    setLocale(resolveHubLocale(readPropertyInspectorLanguageValue(connectionInfo)));
                }
            })
            .catch(() => {
                if (isMounted) {
                    setLocale("en");
                }
            });

        return () => {
            isMounted = false;
        };
    }, [client]);

    if (locale === null) {
        return null;
    }

    return (
        <I18nProvider locale={locale}>
            <App client={client} />
        </I18nProvider>
    );
}
