import type { HelperUpdateNotice, HelperUpdateUrgency } from "../runtime/helper-update/helper-update-notice";

export const HELPER_UPDATE_NOTICE_MESSAGE_TYPE = "shoMetrics.helperUpdateNotice";

/** Asks the plugin for the Helper update notice it has already resolved. */
export type HelperUpdateNoticeRequestMessage = {
    readonly type: typeof HELPER_UPDATE_NOTICE_MESSAGE_TYPE;
    readonly command: "request";
};

/** Reports the Helper update the installed Helper is behind, if any. */
export type HelperUpdateNoticeResultMessage = {
    readonly type: typeof HELPER_UPDATE_NOTICE_MESSAGE_TYPE;
    readonly command: "result";
    readonly notice: HelperUpdateNotice;
};

interface HelperUpdateNoticeRequestSender {
    send(event: "sendToPlugin", payload: HelperUpdateNoticeRequestMessage): Promise<void>;
}

interface HelperUpdateNoticeResultSender {
    sendToPropertyInspector(payload: HelperUpdateNoticeResultMessage): Promise<void>;
}

/** Builds the PI request for the plugin's resolved Helper update notice. */
export function buildHelperUpdateNoticeRequestMessage(): HelperUpdateNoticeRequestMessage {
    return {
        type: HELPER_UPDATE_NOTICE_MESSAGE_TYPE,
        command: "request",
    };
}

/** Builds the plugin's Helper update notice for the PI. */
export function buildHelperUpdateNoticeResultMessage(notice: HelperUpdateNotice): HelperUpdateNoticeResultMessage {
    return {
        type: HELPER_UPDATE_NOTICE_MESSAGE_TYPE,
        command: "result",
        notice,
    };
}

/** Sends the PI request for the plugin's resolved Helper update notice. */
export function sendHelperUpdateNoticeRequestMessage(sender: HelperUpdateNoticeRequestSender): Promise<void> {
    return sender.send("sendToPlugin", buildHelperUpdateNoticeRequestMessage());
}

/** Sends the plugin's Helper update notice to the PI. */
export function sendHelperUpdateNoticeResultMessage(
    sender: HelperUpdateNoticeResultSender,
    notice: HelperUpdateNotice,
): Promise<void> {
    return sender.sendToPropertyInspector(buildHelperUpdateNoticeResultMessage(notice));
}

/** Reads an untrusted PI request for the plugin's Helper update notice. */
export function readHelperUpdateNoticeRequestMessage(value: unknown): HelperUpdateNoticeRequestMessage | null {
    if (!isHelperUpdateNoticeMessage(value) || value.command !== "request") {
        return null;
    }

    return buildHelperUpdateNoticeRequestMessage();
}

/** Reads an untrusted plugin Helper update notice. */
export function readHelperUpdateNoticeResultMessage(value: unknown): HelperUpdateNoticeResultMessage | null {
    if (!isHelperUpdateNoticeMessage(value) || value.command !== "result") {
        return null;
    }

    const notice = readHelperUpdateNotice(value.notice);
    return notice === null ? null : buildHelperUpdateNoticeResultMessage(notice);
}

function readHelperUpdateNotice(value: unknown): HelperUpdateNotice | null {
    if (!isRecord(value)) {
        return null;
    }

    if (value.state === "none") {
        return { state: "none" };
    }

    if (
        value.state !== "updateAvailable"
        || typeof value.availableVersion !== "string"
        || value.availableVersion.length === 0
    ) {
        return null;
    }

    return {
        state: "updateAvailable",
        urgency: readHelperUpdateUrgency(value.urgency),
        availableVersion: value.availableVersion,
    };
}

/**
 * Reads an urgency, treating one this build does not know as routine.
 *
 * A newer plugin may publish an urgency an older Property Inspector bundle has
 * never heard of. Showing it as routine still tells the user an update exists,
 * which is the part they can act on; refusing the whole notice would hide it.
 */
function readHelperUpdateUrgency(value: unknown): HelperUpdateUrgency {
    return value === "required" ? "required" : "routine";
}

function isHelperUpdateNoticeMessage(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && value.type === HELPER_UPDATE_NOTICE_MESSAGE_TYPE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
