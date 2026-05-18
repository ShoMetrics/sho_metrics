import {
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    normalizeColorCompensationProfile,
    type ColorCompensationProfile,
} from "./types";
import { readStoredColorCompensationProfile } from "../settings/storage/color-compensation-settings";

type StoredGlobalSettingsInput = Parameters<typeof readStoredColorCompensationProfile>[0];

type ColorCompensationPreviewState =
    | {
        readonly kind: "pattern";
    }
    | {
        readonly kind: "widget";
        readonly profile: ColorCompensationProfile;
    };

export interface ColorCompensationTargetContext {
    readonly streamDeckDeviceId: string | undefined;
    readonly surfaceId: string | undefined;
}

export interface ColorCompensationProfileRequest extends ColorCompensationTargetContext {
    readonly actionId: string;
}

export class ColorCompensationRuntimeStore {
    private committedProfile = DEFAULT_COLOR_COMPENSATION_PROFILE;
    private readonly activeSessionIds = new Map<string, string>();
    private readonly previewStates = new Map<string, ColorCompensationPreviewState>();

    updateCommittedProfileFromStoredSettings(storedGlobalSettings: StoredGlobalSettingsInput): void {
        this.committedProfile = readStoredColorCompensationProfile(storedGlobalSettings);
    }

    startPreviewSession(options: {
        readonly actionId: string;
        readonly sessionId: string;
    }): void {
        this.activeSessionIds.set(options.actionId, options.sessionId);
        this.previewStates.delete(options.actionId);
    }

    setPatternPreview(options: {
        readonly actionId: string;
        readonly sessionId: string;
    }): boolean {
        if (!this.acceptsSession(options.actionId, options.sessionId)) {
            return false;
        }

        this.previewStates.set(options.actionId, {
            kind: "pattern",
        });
        return true;
    }

    setWidgetPreview(options: {
        readonly actionId: string;
        readonly sessionId: string;
        readonly profile: ColorCompensationProfile;
    }): boolean {
        if (!this.acceptsSession(options.actionId, options.sessionId)) {
            return false;
        }

        this.previewStates.set(options.actionId, {
            kind: "widget",
            profile: normalizeColorCompensationProfile(options.profile),
        });
        return true;
    }

    clearPreview(actionId: string): void {
        this.activeSessionIds.delete(actionId);
        this.previewStates.delete(actionId);
    }

    clearPreviewSession(options: {
        readonly actionId: string;
        readonly sessionId: string;
    }): boolean {
        if (this.activeSessionIds.get(options.actionId) !== options.sessionId) {
            return false;
        }

        this.activeSessionIds.delete(options.actionId);
        this.previewStates.delete(options.actionId);
        return true;
    }

    shouldSuppressMetricView(actionId: string): boolean {
        return this.previewStates.get(actionId)?.kind === "pattern";
    }

    resolveHardwareProfile({ actionId }: ColorCompensationProfileRequest): ColorCompensationProfile {
        const previewState = this.previewStates.get(actionId);

        return previewState?.kind === "widget" ? previewState.profile : this.committedProfile;
    }

    private acceptsSession(actionId: string, sessionId: string): boolean {
        const activeSessionId = this.activeSessionIds.get(actionId);

        if (!activeSessionId) {
            this.activeSessionIds.set(actionId, sessionId);
            return true;
        }

        return activeSessionId === sessionId;
    }
}

export const colorCompensationRuntimeStore = new ColorCompensationRuntimeStore();

export function updateCommittedColorCompensationProfileFromStoredSettings(
    storedGlobalSettings: StoredGlobalSettingsInput,
): void {
    colorCompensationRuntimeStore.updateCommittedProfileFromStoredSettings(storedGlobalSettings);
}

export function startColorCompensationPreviewSession(options: {
    readonly actionId: string;
    readonly sessionId: string;
}): void {
    colorCompensationRuntimeStore.startPreviewSession(options);
}

export function setColorCompensationPatternPreview(options: {
    readonly actionId: string;
    readonly sessionId: string;
}): boolean {
    return colorCompensationRuntimeStore.setPatternPreview(options);
}

export function setColorCompensationWidgetPreview(options: {
    readonly actionId: string;
    readonly sessionId: string;
    readonly profile: ColorCompensationProfile;
}): boolean {
    return colorCompensationRuntimeStore.setWidgetPreview(options);
}

export function clearColorCompensationPreview(actionId: string): void {
    colorCompensationRuntimeStore.clearPreview(actionId);
}

export function clearColorCompensationPreviewSession(options: {
    readonly actionId: string;
    readonly sessionId: string;
}): boolean {
    return colorCompensationRuntimeStore.clearPreviewSession(options);
}

export function shouldSuppressMetricViewForColorCompensation(actionId: string): boolean {
    return colorCompensationRuntimeStore.shouldSuppressMetricView(actionId);
}

export function resolveHardwareColorCompensationProfile(
    request: ColorCompensationProfileRequest,
): ColorCompensationProfile {
    return colorCompensationRuntimeStore.resolveHardwareProfile(request);
}
