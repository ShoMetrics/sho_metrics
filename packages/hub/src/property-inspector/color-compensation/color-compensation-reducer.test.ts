import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import {
    COLOR_COMPENSATION_WIZARD_STEPS,
    colorCompensationWizardReducer,
    createColorCompensationWizardState,
    readStepValue,
} from "./color-compensation-reducer";

test("wizard orders coarse adjustments before finer tonal adjustments", () => {
    assert.deepEqual(COLOR_COMPENSATION_WIZARD_STEPS, [
        "saturation",
        "brightness",
        "gamma",
        "shadow",
    ]);
});

test("started wizard shows preflight before setup steps", () => {
    const state = createColorCompensationWizardState(DEFAULT_COLOR_COMPENSATION_PROFILE);
    const preflightState = colorCompensationWizardReducer(state, { type: "started" });
    const stepState = colorCompensationWizardReducer(preflightState, { type: "preflightConfirmed" });

    assert.equal(preflightState.page, "preflight");
    assert.equal(stepState.page, "step");
});

test("existing stored profile starts on profile page", () => {
    const state = createColorCompensationWizardState({
        brightnessAdjustment: 1,
        shadowAdjustment: 0,
        gammaAdjustment: 0,
        saturationAdjustment: 0,
    });

    assert.equal(state.page, "profile");
});

test("step changes write profile adjustments", () => {
    const state = createColorCompensationWizardState(DEFAULT_COLOR_COMPENSATION_PROFILE);
    const changedState = colorCompensationWizardReducer(state, {
        type: "stepValueChanged",
        stepId: "saturation",
        value: 3,
    });

    assert.equal(readStepValue(changedState.profile, "saturation"), 3);
    assert.deepEqual(changedState.profile, {
        brightnessAdjustment: 0,
        saturationAdjustment: 3,
        gammaAdjustment: 0,
        shadowAdjustment: 0,
    });
});
