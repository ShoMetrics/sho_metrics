import { create } from "@bufbuild/protobuf";

import {
    ColorCompensationProfileSchema,
    ColorCompensationSettingsSchema,
    type ColorCompensationProfile as StoredColorCompensationProfile,
    type StoredGlobalSettings,
} from "../../generated/proto/shometrics/v1/settings_pb.js";
import {
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    normalizeColorCompensationProfile,
    type ColorCompensationProfile,
} from "../../color-compensation/types";
import {
    readStoredGlobalSettings,
    writeStoredGlobalSettings,
    type StoredSettingsJsonObject,
} from "./codec";

export function readStoredColorCompensationProfile(
    storedGlobalSettings: StoredGlobalSettings | undefined,
): ColorCompensationProfile {
    const storedProfile = storedGlobalSettings?.colorCompensation?.fallbackProfile;

    return storedProfile
        ? readColorCompensationProfile(storedProfile)
        : DEFAULT_COLOR_COMPENSATION_PROFILE;
}

export function writeStoredColorCompensationProfile(
    rawGlobalSettings: unknown,
    profile: ColorCompensationProfile,
): StoredSettingsJsonObject {
    const settings = readStoredGlobalSettings(rawGlobalSettings).settings;
    const colorCompensation = settings.colorCompensation ??= create(ColorCompensationSettingsSchema);

    colorCompensation.fallbackProfile = writeColorCompensationProfile(profile);

    return writeStoredGlobalSettings(settings);
}

export function clearStoredColorCompensationProfile(rawGlobalSettings: unknown): StoredSettingsJsonObject {
    const settings = readStoredGlobalSettings(rawGlobalSettings).settings;

    if (settings.colorCompensation) {
        settings.colorCompensation.fallbackProfile = undefined;
    }

    return writeStoredGlobalSettings(settings);
}

function readColorCompensationProfile(storedProfile: StoredColorCompensationProfile): ColorCompensationProfile {
    return normalizeColorCompensationProfile({
        brightnessAdjustment: storedProfile.brightnessAdjustment
            ?? DEFAULT_COLOR_COMPENSATION_PROFILE.brightnessAdjustment,
        shadowAdjustment: storedProfile.shadowAdjustment
            ?? DEFAULT_COLOR_COMPENSATION_PROFILE.shadowAdjustment,
        gammaAdjustment: storedProfile.gammaAdjustment
            ?? DEFAULT_COLOR_COMPENSATION_PROFILE.gammaAdjustment,
        saturationAdjustment: storedProfile.saturationAdjustment
            ?? DEFAULT_COLOR_COMPENSATION_PROFILE.saturationAdjustment,
    });
}

function writeColorCompensationProfile(profile: ColorCompensationProfile): StoredColorCompensationProfile {
    const normalizedProfile = normalizeColorCompensationProfile(profile);

    return create(ColorCompensationProfileSchema, {
        brightnessAdjustment: normalizedProfile.brightnessAdjustment,
        shadowAdjustment: normalizedProfile.shadowAdjustment,
        gammaAdjustment: normalizedProfile.gammaAdjustment,
        saturationAdjustment: normalizedProfile.saturationAdjustment,
    });
}
