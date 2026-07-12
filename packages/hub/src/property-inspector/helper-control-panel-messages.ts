export const HELPER_CONTROL_PANEL_MESSAGE_TYPE = "shoMetrics.helperControlPanel";

export type OpenHelperControlPanelMessage = {
    readonly type: typeof HELPER_CONTROL_PANEL_MESSAGE_TYPE;
    readonly command: "open";
    readonly requestId: string;
};

export type HelperControlPanelLaunchResultMessage = {
    readonly type: typeof HELPER_CONTROL_PANEL_MESSAGE_TYPE;
    readonly command: "result";
    readonly requestId: string;
    readonly outcome: "opened" | "failed";
};

type HelperControlPanelPluginMessage = OpenHelperControlPanelMessage | HelperControlPanelLaunchResultMessage;

interface HelperControlPanelPluginMessageSender {
    send(event: "sendToPlugin", payload: OpenHelperControlPanelMessage): Promise<void>;
}

interface HelperControlPanelLaunchResultSender {
    sendToPropertyInspector(payload: HelperControlPanelLaunchResultMessage): Promise<void>;
}

/** Builds the PI request to open the installed Windows Helper Control Panel. */
export function buildOpenHelperControlPanelMessage(requestId: string): OpenHelperControlPanelMessage {
    return {
        type: HELPER_CONTROL_PANEL_MESSAGE_TYPE,
        command: "open",
        requestId,
    };
}

/** Builds the plugin result that keeps a launch failure visible in the PI. */
export function buildHelperControlPanelLaunchResultMessage(
    requestId: string,
    outcome: HelperControlPanelLaunchResultMessage["outcome"],
): HelperControlPanelLaunchResultMessage {
    return {
        type: HELPER_CONTROL_PANEL_MESSAGE_TYPE,
        command: "result",
        requestId,
        outcome,
    };
}

/** Sends the PI request to open the installed Windows Helper Control Panel. */
export function sendOpenHelperControlPanelMessage(
    sender: HelperControlPanelPluginMessageSender,
    requestId: string,
): Promise<void> {
    return sender.send("sendToPlugin", buildOpenHelperControlPanelMessage(requestId));
}

/** Sends the plugin launch result for a prior Helper Control Panel open request. */
export function sendHelperControlPanelLaunchResultMessage(
    sender: HelperControlPanelLaunchResultSender,
    requestId: string,
    outcome: HelperControlPanelLaunchResultMessage["outcome"],
): Promise<void> {
    return sender.sendToPropertyInspector(buildHelperControlPanelLaunchResultMessage(requestId, outcome));
}

/** Reads an untrusted PI request to open the installed Windows Helper Control Panel. */
export function readOpenHelperControlPanelMessage(value: unknown): OpenHelperControlPanelMessage | null {
    const message = readHelperControlPanelPluginMessage(value);
    if (message?.command !== "open") {
        return null;
    }

    return message;
}

/** Reads an untrusted plugin result for a prior Helper Control Panel request. */
export function readHelperControlPanelLaunchResultMessage(
    value: unknown,
): HelperControlPanelLaunchResultMessage | null {
    if (!isRecord(value)) {
        return null;
    }

    const message = readHelperControlPanelPluginMessage(value);
    if (
        message?.command !== "result"
        || (value.outcome !== "opened" && value.outcome !== "failed")
    ) {
        return null;
    }

    return {
        type: message.type,
        command: "result",
        requestId: message.requestId,
        outcome: value.outcome,
    };
}

function readHelperControlPanelPluginMessage(value: unknown): HelperControlPanelPluginMessage | null {
    if (!isRecord(value)
        || value.type !== HELPER_CONTROL_PANEL_MESSAGE_TYPE
        || typeof value.requestId !== "string"
        || value.requestId.length === 0) {
        return null;
    }

    if (value.command === "open") {
        return buildOpenHelperControlPanelMessage(value.requestId);
    }

    if (value.command === "result" && (value.outcome === "opened" || value.outcome === "failed")) {
        return buildHelperControlPanelLaunchResultMessage(value.requestId, value.outcome);
    }

    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
