import assert from "node:assert/strict";
import { test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../../i18n/react";
import type { HubLocale } from "../../../i18n/types";
import { StreamDeckClientProvider } from "../../stream-deck/stream-deck-client-context";
import { TestPropertyInspectorClient } from "../../testing/test-property-inspector-client";
import type { HelperUpdateNotice } from "../../../runtime/helper-update/helper-update-notice";
import { HelperUpdateNoticeSlot } from "./HelperUpdateNoticeSlot";

test("says nothing while the installed Helper is current", () => {
    const { container } = renderNotice({ state: "none" });

    assert.equal(container.textContent, "");
});

test("announces a routine update without demanding action", () => {
    renderNotice({ state: "updateAvailable", urgency: "routine", availableVersion: "0.2.1" });

    assert.notEqual(screen.queryByText(/ShoMetrics Helper 0\.2\.1 is available\./u), null);
    assert.notEqual(screen.queryByRole("link", { name: "Download the update." }), null);
    // Colour and the "install before continuing" wording are reserved for an
    // update the user has to act on. A routine one is worth reading, not worth
    // interrupting for, and spending either here leaves nothing for the update
    // that has to. It renders as ordinary note text: no red, and no yellow.
    assert.equal(screen.queryByText(/before continuing normal use/u), null);
    assert.equal(document.querySelector(".settings-notice-critical"), null);
    assert.equal(document.querySelector(".settings-notice-warning"), null);
});

test("demands action for a required update", () => {
    renderNotice({ state: "updateAvailable", urgency: "required", availableVersion: "0.2.1" });

    assert.notEqual(screen.queryByText(/update required: 0\.2\.1/u), null);
    assert.notEqual(screen.queryByText(/before continuing normal use/u), null);
    assert.notEqual(document.querySelector(".settings-notice-critical"), null);
    assert.notEqual(screen.queryByRole("link", { name: "Download the update." }), null);
});

test("opens the download page rather than a link taken from the feed", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });

    render(
        <StreamDeckClientProvider client={client}>
            <I18nProvider locale="en">
                <HelperUpdateNoticeSlot
                    notice={{ state: "updateAvailable", urgency: "required", availableVersion: "0.2.1" }}
                />
            </I18nProvider>
        </StreamDeckClientProvider>,
    );

    await user.click(screen.getByRole("link", { name: "Download the update." }));

    // No URL in the appcast reaches the Property Inspector, which is what keeps
    // release links out of the plugin's trust surface entirely.
    assert.deepEqual(client.sentMessages.at(-1), {
        event: "openUrl",
        payload: { url: "https://shometrics.github.io/download/" },
    });
});

test("places the update link where each language needs it", () => {
    renderNotice(
        { state: "updateAvailable", urgency: "required", availableVersion: "0.2.1" },
        "ja",
    );

    const notice = document.querySelector(".settings-notice-critical");
    assert.notEqual(notice, null);
    assert.match(notice?.textContent ?? "", /ShoMetrics Helper の更新が必要です：0\.2\.1。更新をダウンロードしてください。/u);
});

function renderNotice(notice: HelperUpdateNotice, locale: HubLocale = "en") {
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });

    return render(
        <StreamDeckClientProvider client={client}>
            <I18nProvider locale={locale}>
                <HelperUpdateNoticeSlot notice={notice} />
            </I18nProvider>
        </StreamDeckClientProvider>,
    );
}
