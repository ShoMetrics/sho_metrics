import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildHelperUpdateNoticeResultMessage,
    readHelperUpdateNoticeRequestMessage,
    readHelperUpdateNoticeResultMessage,
} from "./helper-update-notice-messages";

test("reads the notice the plugin reported", () => {
    const notice = { state: "updateAvailable", urgency: "required", availableVersion: "0.2.1" } as const;

    assert.deepEqual(
        readHelperUpdateNoticeResultMessage(buildHelperUpdateNoticeResultMessage(notice))?.notice,
        notice,
    );
    assert.deepEqual(
        readHelperUpdateNoticeResultMessage(buildHelperUpdateNoticeResultMessage({ state: "none" }))?.notice,
        { state: "none" },
    );
});

test("shows an urgency this build does not know as routine", () => {
    // A newer plugin can send an urgency an older Property Inspector bundle has
    // never heard of. Showing it as routine still tells the user an update
    // exists, which is the part they can act on. Refusing the whole notice would
    // hide it.
    const message = readHelperUpdateNoticeResultMessage({
        type: "shoMetrics.helperUpdateNotice",
        command: "result",
        notice: { state: "updateAvailable", urgency: "apocalyptic", availableVersion: "9.9.9" },
    });

    assert.deepEqual(message?.notice, {
        state: "updateAvailable",
        urgency: "routine",
        availableVersion: "9.9.9",
    });
});

test("rejects a notice that carries no version to act on", () => {
    const malformedNotices = [
        { state: "updateAvailable", urgency: "required" },
        { state: "updateAvailable", urgency: "required", availableVersion: "" },
        { state: "updateAvailable", urgency: "required", availableVersion: 21 },
        { state: "somethingElse" },
        "0.2.1",
        null,
    ];

    for (const notice of malformedNotices) {
        assert.equal(
            readHelperUpdateNoticeResultMessage({
                type: "shoMetrics.helperUpdateNotice",
                command: "result",
                notice,
            }),
            null,
            `${JSON.stringify(notice)} must not be read as a notice`,
        );
    }
});

test("ignores messages that belong to another feature", () => {
    assert.equal(readHelperUpdateNoticeRequestMessage({ type: "shoMetrics.helperControlPanel", command: "open" }), null);
    assert.equal(readHelperUpdateNoticeRequestMessage({ type: "shoMetrics.helperUpdateNotice" }), null);
    assert.equal(readHelperUpdateNoticeResultMessage({ type: "shoMetrics.helperUpdateNotice", command: "request" }), null);
    assert.notEqual(
        readHelperUpdateNoticeRequestMessage({ type: "shoMetrics.helperUpdateNotice", command: "request" }),
        null,
    );
});
