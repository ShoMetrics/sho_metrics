import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildHelperControlPanelLaunchResultMessage,
    buildOpenHelperControlPanelMessage,
    readHelperControlPanelLaunchResultMessage,
    readOpenHelperControlPanelMessage,
    sendHelperControlPanelLaunchResultMessage,
    sendOpenHelperControlPanelMessage,
} from "./helper-control-panel-messages";

test("Helper Control Panel messages round-trip through the PI boundary", async () => {
    const sentMessageList: unknown[] = [];
    const sender = {
        send: async (event: "sendToPlugin", payload: unknown): Promise<void> => {
            sentMessageList.push({ event, payload });
        },
    };

    await sendOpenHelperControlPanelMessage(sender, "request-1");

    assert.deepEqual(sentMessageList, [{
        event: "sendToPlugin",
        payload: buildOpenHelperControlPanelMessage("request-1"),
    }]);
    assert.deepEqual(
        readOpenHelperControlPanelMessage(buildOpenHelperControlPanelMessage("request-1")),
        buildOpenHelperControlPanelMessage("request-1"),
    );
    assert.deepEqual(
        readHelperControlPanelLaunchResultMessage(
            buildHelperControlPanelLaunchResultMessage("request-1", "failed"),
        ),
        buildHelperControlPanelLaunchResultMessage("request-1", "failed"),
    );
});

test("Helper Control Panel launch results reach the Property Inspector", async () => {
    const sentPayloadList: unknown[] = [];
    const sender = {
        sendToPropertyInspector: async (payload: unknown): Promise<void> => {
            sentPayloadList.push(payload);
        },
    };

    await sendHelperControlPanelLaunchResultMessage(sender, "request-1", "failed");

    assert.deepEqual(sentPayloadList, [
        buildHelperControlPanelLaunchResultMessage("request-1", "failed"),
    ]);
});

test("malformed Helper Control Panel messages are ignored", () => {
    assert.equal(readOpenHelperControlPanelMessage(null), null);
    assert.equal(readOpenHelperControlPanelMessage({ type: "other", command: "open" }), null);
    assert.equal(readOpenHelperControlPanelMessage({
        type: "shoMetrics.helperControlPanel",
        command: "close",
    }), null);
    assert.equal(readHelperControlPanelLaunchResultMessage({
        type: "shoMetrics.helperControlPanel",
        command: "result",
        requestId: "request-1",
        outcome: "unknown",
    }), null);
});
