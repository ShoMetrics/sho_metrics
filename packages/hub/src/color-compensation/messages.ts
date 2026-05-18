import {
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    normalizeColorCompensationProfile,
    type ColorCompensationProfile,
    type ColorCompensationStepId,
} from "./types";

export const COLOR_COMPENSATION_MESSAGE_TYPE = "shometrics.colorCompensation";

export type ColorCompensationPreviewKind =
    | ColorCompensationStepId
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
        readonly command: "preview";
        readonly preview: ColorCompensationPreview;
    }
    | {
        readonly type: typeof COLOR_COMPENSATION_MESSAGE_TYPE;
        readonly command: "commit";
        readonly profile: ColorCompensationProfile;
    }
    | {
        readonly type: typeof COLOR_COMPENSATION_MESSAGE_TYPE;
        readonly command: "cancel";
    }
    | {
        readonly type: typeof COLOR_COMPENSATION_MESSAGE_TYPE;
        readonly command: "reset";
    };

export function buildColorCompensationPreviewMessage(options: {
    readonly kind: ColorCompensationPreviewKind;
    readonly profile: ColorCompensationProfile;
}): ColorCompensationPluginMessage {
    return {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        command: "preview",
        preview: {
            kind: options.kind,
            profile: normalizeColorCompensationProfile(options.profile),
        },
    };
}

export function buildColorCompensationCommitMessage(
    profile: ColorCompensationProfile,
): ColorCompensationPluginMessage {
    return {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        command: "commit",
        profile: normalizeColorCompensationProfile(profile),
    };
}

export function buildColorCompensationCancelMessage(): ColorCompensationPluginMessage {
    return {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        command: "cancel",
    };
}

export function buildColorCompensationResetMessage(): ColorCompensationPluginMessage {
    return {
        type: COLOR_COMPENSATION_MESSAGE_TYPE,
        command: "reset",
    };
}

export function readColorCompensationPluginMessage(payload: unknown): ColorCompensationPluginMessage | null {
    if (!isRecord(payload) || payload.type !== COLOR_COMPENSATION_MESSAGE_TYPE) {
        return null;
    }

    switch (payload.command) {
        case "preview":
            return readPreviewMessage(payload);
        case "commit":
            return readCommitMessage(payload);
        case "cancel":
            return buildColorCompensationCancelMessage();
        case "reset":
            return buildColorCompensationResetMessage();
        default:
            return null;
    }
}

function readPreviewMessage(payload: Record<string, unknown>): ColorCompensationPluginMessage | null {
    if (!isRecord(payload.preview)) {
        return null;
    }

    const previewKind = readPreviewKind(payload.preview.kind);
    const profile = readColorCompensationProfile(payload.preview.profile);

    if (!previewKind || !profile) {
        return null;
    }

    return buildColorCompensationPreviewMessage({
        kind: previewKind,
        profile,
    });
}

function readCommitMessage(payload: Record<string, unknown>): ColorCompensationPluginMessage | null {
    const profile = readColorCompensationProfile(payload.profile);

    return profile ? buildColorCompensationCommitMessage(profile) : null;
}

function readPreviewKind(value: unknown): ColorCompensationPreviewKind | null {
    switch (value) {
        case "brightness":
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
