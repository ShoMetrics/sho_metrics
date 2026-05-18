import {
    COLOR_COMPENSATION_ADJUSTMENT_DEFAULT,
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    hasColorCompensationProfileEffect,
    normalizeColorCompensationProfile,
    type ColorCompensationProfile,
    type ColorCompensationStepId,
} from "../../color-compensation/types";

export type ColorCompensationWizardPage = "profile" | "intro" | "preflight" | "step" | "review";
export type ColorCompensationReviewMode = "before" | "after";

export const COLOR_COMPENSATION_WIZARD_STEPS: readonly ColorCompensationStepId[] = [
    "saturation",
    "brightness",
    "gamma",
    "shadow",
];

export interface ColorCompensationWizardState {
    readonly page: ColorCompensationWizardPage;
    readonly stepIndex: number;
    readonly profile: ColorCompensationProfile;
    readonly skippedStepIds: readonly ColorCompensationStepId[];
    readonly reviewMode: ColorCompensationReviewMode;
}

export type ColorCompensationWizardAction =
    | { readonly type: "started" }
    | { readonly type: "setupRequested" }
    | { readonly type: "profileReset" }
    | { readonly type: "preflightConfirmed" }
    | { readonly type: "stepValueChanged"; readonly stepId: ColorCompensationStepId; readonly value: number }
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
        skippedStepIds: [],
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
                skippedStepIds: [],
                reviewMode: "after",
            };
        case "preflightConfirmed":
            return {
                ...state,
                page: "step",
                stepIndex: 0,
                reviewMode: "after",
            };
        case "stepValueChanged":
            return {
                ...state,
                profile: writeStepValue(state.profile, action.stepId, action.value),
            };
        case "stepSkipped":
            return moveToNextStep({
                ...state,
                profile: writeStepValue(state.profile, currentStepId(state), COLOR_COMPENSATION_ADJUSTMENT_DEFAULT),
                skippedStepIds: state.skippedStepIds.includes(currentStepId(state))
                    ? state.skippedStepIds
                    : [...state.skippedStepIds, currentStepId(state)],
            });
        case "nextRequested":
            return moveToNextStep(state);
        case "backRequested":
            if (state.page === "review") {
                return {
                    ...state,
                    page: "step",
                    stepIndex: COLOR_COMPENSATION_WIZARD_STEPS.length - 1,
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
                skippedStepIds: [],
                reviewMode: "after",
            };
        case "redoRequested":
            return {
                ...createColorCompensationWizardState(DEFAULT_COLOR_COMPENSATION_PROFILE),
                page: "step",
            };
    }
}

export function readStepValue(profile: ColorCompensationProfile, stepId: ColorCompensationStepId): number {
    switch (stepId) {
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

function writeStepValue(
    profile: ColorCompensationProfile,
    stepId: ColorCompensationStepId,
    value: number,
): ColorCompensationProfile {
    const normalizedProfile = normalizeColorCompensationProfile(profile);

    switch (stepId) {
        case "brightness":
            return normalizeColorCompensationProfile({ ...normalizedProfile, brightnessAdjustment: value });
        case "shadow":
            return normalizeColorCompensationProfile({ ...normalizedProfile, shadowAdjustment: value });
        case "gamma":
            return normalizeColorCompensationProfile({ ...normalizedProfile, gammaAdjustment: value });
        case "saturation":
            return normalizeColorCompensationProfile({ ...normalizedProfile, saturationAdjustment: value });
    }
}

function moveToNextStep(state: ColorCompensationWizardState): ColorCompensationWizardState {
    const nextStepIndex = state.stepIndex + 1;

    if (nextStepIndex >= COLOR_COMPENSATION_WIZARD_STEPS.length) {
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

function currentStepId(state: ColorCompensationWizardState): ColorCompensationStepId {
    return COLOR_COMPENSATION_WIZARD_STEPS[state.stepIndex] ?? COLOR_COMPENSATION_WIZARD_STEPS[0];
}
