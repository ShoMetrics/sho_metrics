import assert from "node:assert/strict";
import test from "node:test";
import {
    buildColorCompensationCancelMessage,
    buildColorCompensationCommitMessage,
    buildColorCompensationPreviewMessage,
    buildColorCompensationResetMessage,
    COLOR_COMPENSATION_MESSAGE_TYPE,
    readColorCompensationPluginMessage,
} from "./messages";

test("preview messages round-trip through the untrusted payload reader", () => {
    const message = buildColorCompensationPreviewMessage({
        kind: "brightness",
        profile: {
            brightnessAdjustment: 12,
            shadowAdjustment: -12,
            gammaAdjustment: 1,
            saturationAdjustment: 0,
        },
    });

    assert.deepEqual(readColorCompensationPluginMessage(message), {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        command: "preview",
        preview: {
            kind: "brightness",
            profile: {
                brightnessAdjustment: 10,
                shadowAdjustment: -10,
                gammaAdjustment: 1,
                saturationAdjustment: 0,
            },
        },
    });
});

test("commit cancel and reset messages are accepted", () => {
    assert.equal(
        readColorCompensationPluginMessage(buildColorCompensationPreviewMessage({
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
    assert.equal(readColorCompensationPluginMessage(buildColorCompensationCancelMessage())?.command, "cancel");
    assert.equal(readColorCompensationPluginMessage(buildColorCompensationResetMessage())?.command, "reset");
    assert.equal(
        readColorCompensationPluginMessage(buildColorCompensationCommitMessage({
            brightnessAdjustment: 1,
            shadowAdjustment: 2,
            gammaAdjustment: 3,
            saturationAdjustment: 4,
        }))?.command,
        "commit",
    );
});

test("malformed color compensation messages are ignored", () => {
    assert.equal(readColorCompensationPluginMessage(null), null);
    assert.equal(readColorCompensationPluginMessage({ type: "other" }), null);
    assert.equal(readColorCompensationPluginMessage({
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        command: "preview",
        preview: {
            kind: "unknown",
        },
    }), null);
});
