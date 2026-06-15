import {
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    normalizeColorCompensationProfile,
    type ColorCompensationProfile,
    type ColorCompensationGuidedAdjustmentId,
} from "./types";

export const COLOR_COMPENSATION_MESSAGE_TYPE = "shometrics.colorCompensation";

export type ColorCompensationPreviewKind =
    | ColorCompensationGuidedAdjustmentId
    | "preflight"
    | "review-before"
    | "review-after"
    | "widget-before"
    | "widget-after";

export interface ColorCompensationPreview {
    readonly kind: ColorCompensationPreviewKind;
    readonly profile: ColorCompensationProfile;
}

export type ColorCompensationPluginMessage =
    | {
        readonly type: typeof COLOR_COMPENSATION_MESSAGE_TYPE;
        readonly sessionId: string;
        readonly command: "start";
    }
    | {
        readonly type: typeof COLOR_COMPENSATION_MESSAGE_TYPE;
        readonly sessionId: string;
        readonly command: "preview";
        readonly preview: ColorCompensationPreview;
    }
    | {
        readonly type: typeof COLOR_COMPENSATION_MESSAGE_TYPE;
        readonly sessionId: string;
        readonly command: "commit";
    }
    | {
        readonly type: typeof COLOR_COMPENSATION_MESSAGE_TYPE;
        readonly sessionId: string;
        readonly command: "cancel";
    }
    | {
        readonly type: typeof COLOR_COMPENSATION_MESSAGE_TYPE;
        readonly sessionId: string;
        readonly command: "reset";
    };

interface StreamDeckPluginMessageSender {
    send(event: "sendToPlugin", payload: ColorCompensationPluginMessage): Promise<void>;
}

export function sendColorCompensationPluginMessage(
    sender: StreamDeckPluginMessageSender,
    message: ColorCompensationPluginMessage,
): Promise<void> {
    return sender.send("sendToPlugin", message);
}

export function buildColorCompensationStartMessage(sessionId: string): ColorCompensationPluginMessage {
    return {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        sessionId,
        command: "start",
    };
}

export function buildColorCompensationPreviewMessage(options: {
    readonly sessionId: string;
    readonly kind: ColorCompensationPreviewKind;
    readonly profile: ColorCompensationProfile;
}): ColorCompensationPluginMessage {
    return {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        sessionId: options.sessionId,
        command: "preview",
        preview: {
            kind: options.kind,
            profile: normalizeColorCompensationProfile(options.profile),
        },
    };
}

export function buildColorCompensationCommitMessage(sessionId: string): ColorCompensationPluginMessage {
    return {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        sessionId,
        command: "commit",
    };
}

export function buildColorCompensationCancelMessage(sessionId: string): ColorCompensationPluginMessage {
    return {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        sessionId,
        command: "cancel",
    };
}

export function buildColorCompensationResetMessage(sessionId: string): ColorCompensationPluginMessage {
    return {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        sessionId,
        command: "reset",
    };
}

export function readColorCompensationPluginMessage(payload: unknown): ColorCompensationPluginMessage | null {
    if (!isRecord(payload) || payload.type !== COLOR_COMPENSATION_MESSAGE_TYPE) {
        return null;
    }

    const sessionId = readSessionId(payload.sessionId);

    if (!sessionId) {
        return null;
    }

    switch (payload.command) {
        case "start":
            return buildColorCompensationStartMessage(sessionId);
        case "preview":
            return readPreviewMessage(sessionId, payload);
        case "commit":
            return buildColorCompensationCommitMessage(sessionId);
        case "cancel":
            return buildColorCompensationCancelMessage(sessionId);
        case "reset":
            return buildColorCompensationResetMessage(sessionId);
        default:
            return null;
    }
}

function readPreviewMessage(sessionId: string, payload: Record<string, unknown>): ColorCompensationPluginMessage | null {
    if (!isRecord(payload.preview)) {
        return null;
    }

    const previewKind = readPreviewKind(payload.preview.kind);
    const profile = readColorCompensationProfile(payload.preview.profile);

    if (!previewKind || !profile) {
        return null;
    }

    return buildColorCompensationPreviewMessage({
        sessionId,
        kind: previewKind,
        profile,
    });
}

function readPreviewKind(value: unknown): ColorCompensationPreviewKind | null {
    switch (value) {
        case "shadow":
        case "gamma":
        case "saturation":
        case "preflight":
        case "review-before":
        case "review-after":
        case "widget-before":
        case "widget-after":
            return value;
        default:
            return null;
    }
}

function readColorCompensationProfile(value: unknown): ColorCompensationProfile | null {
    if (!isRecord(value)) {
        return null;
    }

    return normalizeColorCompensationProfile({
        brightnessAdjustment: readNumber(
            value.brightnessAdjustment,
            DEFAULT_COLOR_COMPENSATION_PROFILE.brightnessAdjustment,
        ),
        shadowAdjustment: readNumber(value.shadowAdjustment, DEFAULT_COLOR_COMPENSATION_PROFILE.shadowAdjustment),
        gammaAdjustment: readNumber(value.gammaAdjustment, DEFAULT_COLOR_COMPENSATION_PROFILE.gammaAdjustment),
        saturationAdjustment: readNumber(
            value.saturationAdjustment,
            DEFAULT_COLOR_COMPENSATION_PROFILE.saturationAdjustment,
        ),
    });
}

function readNumber(value: unknown, fallbackValue: number): number {
    return typeof value === "number" ? value : fallbackValue;
}

function readSessionId(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
