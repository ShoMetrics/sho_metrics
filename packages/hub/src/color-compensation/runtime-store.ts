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
    private readonly previewStates = new Map<string, ColorCompensationPreviewState>();

    updateCommittedProfileFromStoredSettings(storedGlobalSettings: StoredGlobalSettingsInput): void {
        this.committedProfile = readStoredColorCompensationProfile(storedGlobalSettings);
    }

    setPatternPreview(actionId: string): void {
        this.previewStates.set(actionId, { kind: "pattern" });
    }

    setWidgetPreview(actionId: string, profile: ColorCompensationProfile): void {
        this.previewStates.set(actionId, {
            kind: "widget",
            profile: normalizeColorCompensationProfile(profile),
        });
    }

    clearPreview(actionId: string): void {
        this.previewStates.delete(actionId);
    }

    shouldSuppressMetricView(actionId: string): boolean {
        return this.previewStates.get(actionId)?.kind === "pattern";
    }

    resolveHardwareProfile({ actionId }: ColorCompensationProfileRequest): ColorCompensationProfile {
        const previewState = this.previewStates.get(actionId);

        return previewState?.kind === "widget" ? previewState.profile : this.committedProfile;
    }
}

export const colorCompensationRuntimeStore = new ColorCompensationRuntimeStore();

export function updateCommittedColorCompensationProfileFromStoredSettings(
    storedGlobalSettings: StoredGlobalSettingsInput,
): void {
    colorCompensationRuntimeStore.updateCommittedProfileFromStoredSettings(storedGlobalSettings);
}

export function setColorCompensationPatternPreview(actionId: string): void {
    colorCompensationRuntimeStore.setPatternPreview(actionId);
}

export function setColorCompensationWidgetPreview(options: {
    readonly actionId: string;
    readonly profile: ColorCompensationProfile;
}): void {
    colorCompensationRuntimeStore.setWidgetPreview(options.actionId, options.profile);
}

export function clearColorCompensationPreview(actionId: string): void {
    colorCompensationRuntimeStore.clearPreview(actionId);
}

export function shouldSuppressMetricViewForColorCompensation(actionId: string): boolean {
    return colorCompensationRuntimeStore.shouldSuppressMetricView(actionId);
}

export function resolveHardwareColorCompensationProfile(
    request: ColorCompensationProfileRequest,
): ColorCompensationProfile {
    return colorCompensationRuntimeStore.resolveHardwareProfile(request);
}
