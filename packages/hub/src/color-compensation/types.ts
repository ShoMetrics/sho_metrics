export type ColorCompensationAdjustmentId = "brightness" | "shadow" | "gamma" | "saturation";

export const COLOR_COMPENSATION_ADJUSTMENT_IDS: readonly ColorCompensationAdjustmentId[] = [
    "saturation",
    "brightness",
    "gamma",
    "shadow",
];

export interface ColorCompensationProfile {
    readonly brightnessAdjustment: number;
    readonly shadowAdjustment: number;
    readonly gammaAdjustment: number;
    readonly saturationAdjustment: number;
}

export const COLOR_COMPENSATION_ADJUSTMENT_MINIMUM = -10;
export const COLOR_COMPENSATION_ADJUSTMENT_MAXIMUM = 10;
export const COLOR_COMPENSATION_ADJUSTMENT_DEFAULT = 0;

export const DEFAULT_COLOR_COMPENSATION_PROFILE: ColorCompensationProfile = {
    brightnessAdjustment: COLOR_COMPENSATION_ADJUSTMENT_DEFAULT,
    shadowAdjustment: COLOR_COMPENSATION_ADJUSTMENT_DEFAULT,
    gammaAdjustment: COLOR_COMPENSATION_ADJUSTMENT_DEFAULT,
    saturationAdjustment: COLOR_COMPENSATION_ADJUSTMENT_DEFAULT,
};

export function normalizeColorCompensationProfile(profile: ColorCompensationProfile): ColorCompensationProfile {
    return {
        brightnessAdjustment: normalizeColorCompensationAdjustment(profile.brightnessAdjustment),
        shadowAdjustment: normalizeColorCompensationAdjustment(profile.shadowAdjustment),
        gammaAdjustment: normalizeColorCompensationAdjustment(profile.gammaAdjustment),
        saturationAdjustment: normalizeColorCompensationAdjustment(profile.saturationAdjustment),
    };
}

export function hasColorCompensationProfileEffect(profile: ColorCompensationProfile): boolean {
    const normalizedProfile = normalizeColorCompensationProfile(profile);

    return normalizedProfile.brightnessAdjustment !== COLOR_COMPENSATION_ADJUSTMENT_DEFAULT
        || normalizedProfile.shadowAdjustment !== COLOR_COMPENSATION_ADJUSTMENT_DEFAULT
        || normalizedProfile.gammaAdjustment !== COLOR_COMPENSATION_ADJUSTMENT_DEFAULT
        || normalizedProfile.saturationAdjustment !== COLOR_COMPENSATION_ADJUSTMENT_DEFAULT;
}

export function normalizeColorCompensationAdjustment(value: number): number {
    if (!Number.isFinite(value)) {
        return COLOR_COMPENSATION_ADJUSTMENT_DEFAULT;
    }

    return Math.min(
        Math.max(Math.round(value), COLOR_COMPENSATION_ADJUSTMENT_MINIMUM),
        COLOR_COMPENSATION_ADJUSTMENT_MAXIMUM,
    );
}
