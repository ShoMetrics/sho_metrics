import assert from "node:assert/strict";
import test from "node:test";
import {
    buildColorCompensationCancelMessage,
    buildColorCompensationCommitMessage,
    buildColorCompensationPreviewMessage,
    buildColorCompensationResetMessage,
    buildColorCompensationStartMessage,
    COLOR_COMPENSATION_MESSAGE_TYPE,
    readColorCompensationPluginMessage,
    sendColorCompensationPluginMessage,
} from "./messages";

test("preview messages round-trip through the untrusted payload reader", () => {
    const message = buildColorCompensationPreviewMessage({
        sessionId: "session-1",
        kind: "saturation",
        profile: {
            brightnessAdjustment: 12,
            shadowAdjustment: -12,
            gammaAdjustment: 1,
            saturationAdjustment: 0,
        },
    });

    assert.deepEqual(readColorCompensationPluginMessage(message), {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        sessionId: "session-1",
        command: "preview",
        preview: {
            kind: "saturation",
            profile: {
                brightnessAdjustment: 10,
                shadowAdjustment: -10,
                gammaAdjustment: 1,
                saturationAdjustment: 0,
            },
        },
    });
});

test("start commit cancel and reset messages are accepted", () => {
    assert.equal(readColorCompensationPluginMessage(buildColorCompensationStartMessage("session-1"))?.command, "start");
    assert.equal(
        readColorCompensationPluginMessage(buildColorCompensationPreviewMessage({
            sessionId: "session-1",
            kind: "widget-before",
            profile: {
                brightnessAdjustment: 0,
                shadowAdjustment: 0,
                gammaAdjustment: 0,
                saturationAdjustment: 0,
            },
        }))?.command,
        "preview",
    );
    assert.equal(readColorCompensationPluginMessage(buildColorCompensationCancelMessage("session-1"))?.command, "cancel");
    assert.equal(readColorCompensationPluginMessage(buildColorCompensationResetMessage("session-1"))?.command, "reset");
    assert.equal(
        readColorCompensationPluginMessage(buildColorCompensationCommitMessage("session-1"))?.command,
        "commit",
    );
});

test("typed color compensation sender uses the Stream Deck plugin event", async () => {
    const sentMessages: Array<{ readonly event: string; readonly payload: unknown }> = [];
    const message = buildColorCompensationStartMessage("session-1");

    await sendColorCompensationPluginMessage({
        send: (event, payload) => {
            sentMessages.push({ event, payload });
            return Promise.resolve();
        },
    }, message);

    assert.deepEqual(sentMessages, [{
        event: "sendToPlugin",
        payload: message,
    }]);
});

test("malformed color compensation messages are ignored", () => {
    assert.equal(readColorCompensationPluginMessage(null), null);
    assert.equal(readColorCompensationPluginMessage({ type: "other" }), null);
    assert.equal(readColorCompensationPluginMessage({
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        command: "preview",
        sessionId: "session-1",
        preview: {
            kind: "unknown",
        },
    }), null);
    assert.equal(readColorCompensationPluginMessage({
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        command: "preview",
        sessionId: "session-1",
        preview: {
            kind: "brightness",
        },
    }), null);
    assert.equal(readColorCompensationPluginMessage({
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        command: "cancel",
    }), null);
});
