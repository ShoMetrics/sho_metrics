import { useEffect, useState } from "react";
import { helperMessages } from "../../../i18n/message-groups/widgets";
import { useI18n } from "../../../i18n/react";
import {
    readHelperUpdateNoticeResultMessage,
    sendHelperUpdateNoticeRequestMessage,
} from "../../helper-update-notice-messages";
import type { StreamDeckPropertyInspectorClient } from "../../stream-deck/stream-deck-client";
import type { HelperUpdateNotice } from "../../../runtime/helper-update/helper-update-notice";
import { HelperDownloadLink } from "../external-link";
import { PropertyInspectorNotice } from "./PropertyInspectorNotice";
import { hasHelperUpdateNoticeBehavior } from "./helper-update-notice-behaviors";

/**
 * Reads the Helper update notice the plugin has already resolved.
 *
 * The panel does not wait for an answer to be computed: the plugin reads the feed
 * on its own schedule and replies from that, because a notice that arrives a
 * network round trip after the panel opens arrives after the user has scrolled
 * past the place it would have appeared.
 *
 * Asking does make the plugin bring the notice up to date first. That is free
 * when it already holds the feed, and it is what makes the reply true for a user
 * who has just installed the Helper we asked them to install. Only a panel that
 * opens before the feed was ever read causes a feed read, and the plugin pushes
 * that notice when it lands rather than making this wait for it.
 */
export function useHelperUpdateNotice(client: StreamDeckPropertyInspectorClient): HelperUpdateNotice {
    const [notice, setNotice] = useState<HelperUpdateNotice>({ state: "none" });

    useEffect(() => {
        // The plugin also pushes a notice when a later check resolves one, which
        // covers a panel that opened before the first check finished.
        const unsubscribe = client.sendToPropertyInspector.subscribe((event) => {
            const result = readHelperUpdateNoticeResultMessage(event.payload);
            if (result !== null) {
                setNotice(result.notice);
            }
        });

        sendHelperUpdateNoticeRequestMessage(client).catch(() => {
            // A plugin that cannot answer leaves the notice absent. The runtime
            // connection notice already reports a plugin that is not responding.
        });

        return unsubscribe;
    }, [client]);

    return notice;
}

/** Renders the Helper update notice, if the installed Helper is behind a release. */
export function HelperUpdateNoticeSlot({
    notice,
}: {
    readonly notice: HelperUpdateNotice;
}): React.JSX.Element | null {
    const { rich, t } = useI18n();

    if (notice.state !== "updateAvailable") {
        return null;
    }

    if (!hasHelperUpdateNoticeBehavior(notice.urgency, "showInPropertyInspectorPanel")) {
        return null;
    }

    const isRequired = hasHelperUpdateNoticeBehavior(notice.urgency, "emphasizeAsRequired");
    const message = isRequired
        ? helperMessages.helperUpdateRequiredNotice
        : helperMessages.helperUpdateAvailableNotice;

    return (
        <PropertyInspectorNotice tone={isRequired ? "critical" : "plain"}>
            <p className="section-note">
                {rich(
                    message,
                    { download: (children) => <HelperDownloadLink>{children}</HelperDownloadLink> },
                    { version: notice.availableVersion },
                )}
            </p>
            {isRequired && (
                <p className="section-note">{t(helperMessages.helperUpdateRequiredDetail)}</p>
            )}
        </PropertyInspectorNotice>
    );
}
