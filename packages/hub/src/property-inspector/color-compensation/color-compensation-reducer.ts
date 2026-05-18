import {
    COLOR_COMPENSATION_ADJUSTMENT_DEFAULT,
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    hasColorCompensationProfileEffect,
    normalizeColorCompensationProfile,
    type ColorCompensationAdjustmentId,
    type ColorCompensationGuidedAdjustmentId,
    type ColorCompensationProfile,
} from "../../color-compensation/types";

export type ColorCompensationWizardPage = "profile" | "intro" | "preflight" | "step" | "review";
export type ColorCompensationReviewMode = "before" | "after";

export const COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS: readonly ColorCompensationGuidedAdjustmentId[] = [
    "saturation",
    "gamma",
    "shadow",
];

export interface ColorCompensationWizardState {
    readonly page: ColorCompensationWizardPage;
    readonly stepIndex: number;
    readonly profile: ColorCompensationProfile;
    readonly skippedAdjustmentIds: readonly ColorCompensationAdjustmentId[];
    readonly reviewMode: ColorCompensationReviewMode;
}

export type ColorCompensationWizardAction =
    | { readonly type: "started" }
    | { readonly type: "setupRequested" }
    | { readonly type: "profileReset" }
    | { readonly type: "preflightConfirmed" }
    | { readonly type: "adjustmentValueChanged"; readonly adjustmentId: ColorCompensationAdjustmentId; readonly value: number }
    | { readonly type: "stepSkipped" }
    | { readonly type: "nextRequested" }
    | { readonly type: "backRequested" }
    | { readonly type: "reviewModeChanged"; readonly reviewMode: ColorCompensationReviewMode }
    | { readonly type: "draftReset" }
    | { readonly type: "redoRequested" };

export function createColorCompensationWizardState(
    initialProfile: ColorCompensationProfile,
): ColorCompensationWizardState {
    const profile = normalizeColorCompensationProfile(initialProfile);

    return {
        page: hasColorCompensationProfileEffect(profile) ? "profile" : "intro",
        stepIndex: 0,
        profile,
        skippedAdjustmentIds: [],
        reviewMode: "after",
    };
}

export function colorCompensationWizardReducer(
    state: ColorCompensationWizardState,
    action: ColorCompensationWizardAction,
): ColorCompensationWizardState {
    switch (action.type) {
        case "started":
        case "setupRequested":
            return {
                ...state,
                page: "preflight",
                stepIndex: 0,
                reviewMode: "after",
            };
        case "profileReset":
            return {
                ...state,
                page: "intro",
                stepIndex: 0,
                profile: DEFAULT_COLOR_COMPENSATION_PROFILE,
                skippedAdjustmentIds: [],
                reviewMode: "after",
            };
        case "preflightConfirmed":
            return {
                ...state,
                page: "step",
                stepIndex: 0,
                reviewMode: "after",
            };
        case "adjustmentValueChanged":
            return {
                ...state,
                profile: writeAdjustmentValue(state.profile, action.adjustmentId, action.value),
            };
        case "stepSkipped":
            return moveToNextStep({
                ...state,
                profile: writeAdjustmentValue(
                    state.profile,
                    currentWizardAdjustmentId(state),
                    COLOR_COMPENSATION_ADJUSTMENT_DEFAULT,
                ),
                skippedAdjustmentIds: state.skippedAdjustmentIds.includes(currentWizardAdjustmentId(state))
                    ? state.skippedAdjustmentIds
                    : [...state.skippedAdjustmentIds, currentWizardAdjustmentId(state)],
            });
        case "nextRequested":
            return moveToNextStep(state);
        case "backRequested":
            if (state.page === "review") {
                return {
                    ...state,
                    page: "step",
                    stepIndex: COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS.length - 1,
                };
            }

            if (state.page === "preflight") {
                return {
                    ...state,
                    page: "intro",
                };
            }

            if (state.stepIndex === 0) {
                return {
                    ...state,
                    page: "preflight",
                };
            }

            return {
                ...state,
                stepIndex: state.stepIndex - 1,
            };
        case "reviewModeChanged":
            return {
                ...state,
                reviewMode: action.reviewMode,
            };
        case "draftReset":
            return {
                ...state,
                profile: DEFAULT_COLOR_COMPENSATION_PROFILE,
                skippedAdjustmentIds: [],
                reviewMode: "after",
            };
        case "redoRequested":
            return {
                ...createColorCompensationWizardState(DEFAULT_COLOR_COMPENSATION_PROFILE),
                page: "step",
            };
    }
}

export function readAdjustmentValue(
    profile: ColorCompensationProfile,
    adjustmentId: ColorCompensationAdjustmentId,
): number {
    switch (adjustmentId) {
        case "brightness":
            return profile.brightnessAdjustment;
        case "shadow":
            return profile.shadowAdjustment;
        case "gamma":
            return profile.gammaAdjustment;
        case "saturation":
            return profile.saturationAdjustment;
    }
}

function writeAdjustmentValue(
    profile: ColorCompensationProfile,
    adjustmentId: ColorCompensationAdjustmentId,
    value: number,
): ColorCompensationProfile {
    switch (adjustmentId) {
        case "brightness":
            return normalizeColorCompensationProfile({ ...profile, brightnessAdjustment: value });
        case "shadow":
            return normalizeColorCompensationProfile({ ...profile, shadowAdjustment: value });
        case "gamma":
            return normalizeColorCompensationProfile({ ...profile, gammaAdjustment: value });
        case "saturation":
            return normalizeColorCompensationProfile({ ...profile, saturationAdjustment: value });
    }
}

function moveToNextStep(state: ColorCompensationWizardState): ColorCompensationWizardState {
    const nextStepIndex = state.stepIndex + 1;

    if (nextStepIndex >= COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS.length) {
        return {
            ...state,
            page: "review",
            reviewMode: "after",
        };
    }

    return {
        ...state,
        stepIndex: nextStepIndex,
    };
}

function currentWizardAdjustmentId(state: ColorCompensationWizardState): ColorCompensationGuidedAdjustmentId {
    return COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS[state.stepIndex] ?? COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS[0];
}
