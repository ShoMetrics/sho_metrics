import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ColorCompensationSampleFocus } from "../../color-compensation/patterns";
import {
    COLOR_COMPENSATION_ADJUSTMENT_MAXIMUM,
    COLOR_COMPENSATION_ADJUSTMENT_MINIMUM,
    type ColorCompensationProfile,
    type ColorCompensationStepId,
} from "../../color-compensation/types";
import {
    buildColorCompensationCancelMessage,
    buildColorCompensationCommitMessage,
    buildColorCompensationPreviewMessage,
    buildColorCompensationResetMessage,
    buildColorCompensationStartMessage,
} from "../../color-compensation/messages";
import { renderColorCompensationSampleSvg } from "../../view-rendering/color-compensation-patterns";
import { SteppedSlider } from "../components/SteppedSlider";
import type { StreamDeckPropertyInspectorClient } from "../stream-deck/stream-deck-client";
import {
    COLOR_COMPENSATION_WIZARD_STEPS,
    colorCompensationWizardReducer,
    createColorCompensationWizardState,
    readStepValue,
    type ColorCompensationReviewMode,
} from "./color-compensation-reducer";

interface ColorCompensationWizardProps {
    readonly client: StreamDeckPropertyInspectorClient;
    readonly initialProfile: ColorCompensationProfile;
    readonly onProfileSave: (profile: ColorCompensationProfile) => Promise<void>;
    readonly onProfileReset: () => Promise<void>;
    readonly onClose: () => void;
}

interface StepCopy {
    readonly title: string;
    readonly instruction: string;
    readonly lowerLabel: string;
    readonly upperLabel: string;
}

const stepCopyById: Record<ColorCompensationStepId, StepCopy> = {
    saturation: {
        title: "Color Strength",
        instruction: "Adjust until the colored blocks on your Stream Deck key look closest to the monitor sample.",
        lowerLabel: "Muted",
        upperLabel: "Vivid",
    },
    brightness: {
        title: "Overall Brightness",
        instruction: "Adjust until the gray field on your Stream Deck key looks closest to the gray field on your monitor.",
        lowerLabel: "Dimmer",
        upperLabel: "Brighter",
    },
    gamma: {
        title: "Midtones",
        instruction: "Adjust until the gray gradient on your Stream Deck key looks closest to the monitor sample.",
        lowerLabel: "Darker",
        upperLabel: "Lighter",
    },
    shadow: {
        title: "Dark Detail",
        instruction: "Adjust until the dark blocks on your Stream Deck key look closest to the dark blocks on your monitor.",
        lowerLabel: "Flat",
        upperLabel: "Deep",
    },
};

export function ColorCompensationWizard({
    client,
    initialProfile,
    onProfileSave,
    onProfileReset,
    onClose,
}: ColorCompensationWizardProps): React.JSX.Element {
    const [state, dispatch] = useReducer(
        colorCompensationWizardReducer,
        initialProfile,
        createColorCompensationWizardState,
    );
    const [noticeText, setNoticeText] = useState<string | null>(null);
    const shouldCancelOnUnmountRef = useRef(true);
    const sessionIdRef = useRef(createColorCompensationSessionId());
    const activeStepId = COLOR_COMPENSATION_WIZARD_STEPS[state.stepIndex] ?? COLOR_COMPENSATION_WIZARD_STEPS[0];
    const sessionId = sessionIdRef.current;
    const sendMessage = useCallback((message: unknown): void => {
        client.send("sendToPlugin", message).catch((error: Error) => {
            setNoticeText(`Preview update failed: ${error.message}`);
        });
    }, [client]);

    useEffect(() => {
        sendMessage(buildColorCompensationStartMessage(sessionId));
    }, [sendMessage, sessionId]);

    useEffect(() => {
        if (state.page === "intro") {
            return;
        }

        if (state.page === "profile") {
            sendMessage(buildColorCompensationPreviewMessage({
                sessionId,
                kind: state.reviewMode === "before" ? "widget-before" : "widget-after",
                profile: state.profile,
            }));
            return;
        }

        if (state.page === "preflight") {
            sendMessage(buildColorCompensationPreviewMessage({
                sessionId,
                kind: "preflight",
                profile: state.profile,
            }));
            return;
        }

        if (state.page === "step") {
            sendMessage(buildColorCompensationPreviewMessage({
                sessionId,
                kind: activeStepId,
                profile: state.profile,
            }));
            return;
        }

        sendMessage(buildColorCompensationPreviewMessage({
            sessionId,
            kind: state.reviewMode === "before" ? "review-before" : "review-after",
            profile: state.profile,
        }));
    }, [activeStepId, sendMessage, sessionId, state.page, state.profile, state.reviewMode]);

    useEffect(() => () => {
        if (shouldCancelOnUnmountRef.current) {
            client.send("sendToPlugin", buildColorCompensationCancelMessage(sessionId)).catch(() => undefined);
        }
    }, [client, sessionId]);

    const closeWithoutSaving = useCallback((): void => {
        shouldCancelOnUnmountRef.current = false;
        sendMessage(buildColorCompensationCancelMessage(sessionId));
        onClose();
    }, [onClose, sendMessage, sessionId]);

    const commitProfile = useCallback((): void => {
        onProfileSave(state.profile)
            .then(() => {
                shouldCancelOnUnmountRef.current = false;
                sendMessage(buildColorCompensationCommitMessage(sessionId));
                onClose();
            })
            .catch((error: unknown) => {
                setNoticeText(`Failed to save color compensation: ${readErrorMessage(error)}`);
            });
    }, [onClose, onProfileSave, sendMessage, sessionId, state.profile]);

    const resetSavedProfile = useCallback((): void => {
        onProfileReset()
            .then(() => {
                sendMessage(buildColorCompensationResetMessage(sessionId));
                dispatch({ type: "profileReset" });
            })
            .catch((error: unknown) => {
                setNoticeText(`Failed to reset color compensation: ${readErrorMessage(error)}`);
            });
    }, [onProfileReset, sendMessage, sessionId]);

    const resetDraft = useCallback((): void => {
        dispatch({ type: "draftReset" });
    }, []);

    const skippedStepText = useMemo(() => {
        if (state.skippedStepIds.length === 0) {
            return null;
        }

        return `${state.skippedStepIds.length} step${state.skippedStepIds.length === 1 ? "" : "s"} skipped.`;
    }, [state.skippedStepIds.length]);

    return (
        <div className="color-compensation-shell">
            {state.page === "profile" ? (
                <ExistingProfilePage
                    reviewMode={state.reviewMode}
                    onReviewModeChange={(reviewMode) => dispatch({ type: "reviewModeChanged", reviewMode })}
                    onSetupAgain={() => dispatch({ type: "setupRequested" })}
                    onReset={resetSavedProfile}
                    onDone={closeWithoutSaving}
                />
            ) : null}
            {state.page === "intro" ? (
                <IntroPage
                    onStart={() => dispatch({ type: "started" })}
                    onCancel={closeWithoutSaving}
                />
            ) : null}
            {state.page === "preflight" ? (
                <PreflightPage
                    onBack={() => dispatch({ type: "backRequested" })}
                    onConfirm={() => dispatch({ type: "preflightConfirmed" })}
                    onCancel={closeWithoutSaving}
                />
            ) : null}
            {state.page === "step" ? (
                <StepPage
                    stepId={activeStepId}
                    stepNumber={state.stepIndex + 1}
                    stepCount={COLOR_COMPENSATION_WIZARD_STEPS.length}
                    value={readStepValue(state.profile, activeStepId)}
                    onValueChange={(value) => dispatch({ type: "stepValueChanged", stepId: activeStepId, value })}
                    onBack={() => dispatch({ type: "backRequested" })}
                    onSkip={() => dispatch({ type: "stepSkipped" })}
                    onNext={() => dispatch({ type: "nextRequested" })}
                    onCancel={closeWithoutSaving}
                />
            ) : null}
            {state.page === "review" ? (
                <ReviewPage
                    profile={state.profile}
                    reviewMode={state.reviewMode}
                    skippedStepText={skippedStepText}
                    onReviewModeChange={(reviewMode) => dispatch({ type: "reviewModeChanged", reviewMode })}
                    onProfileStepChange={(stepId, value) => dispatch({ type: "stepValueChanged", stepId, value })}
                    onResetDraft={resetDraft}
                    onBack={() => dispatch({ type: "backRequested" })}
                    onRedo={() => dispatch({ type: "redoRequested" })}
                    onDone={commitProfile}
                    onCancel={closeWithoutSaving}
                />
            ) : null}
            {noticeText ? <p className="color-compensation-notice">{noticeText}</p> : null}
        </div>
    );
}

function ExistingProfilePage({
    reviewMode,
    onReviewModeChange,
    onSetupAgain,
    onReset,
    onDone,
}: {
    readonly reviewMode: ColorCompensationReviewMode;
    readonly onReviewModeChange: (reviewMode: ColorCompensationReviewMode) => void;
    readonly onSetupAgain: () => void;
    readonly onReset: () => void;
    readonly onDone: () => void;
}): React.JSX.Element {
    return (
        <section className="color-compensation-page">
            <h1>Color Compensation</h1>
            <p>You already have a saved compensation profile.</p>
            <HoldBeforeButton
                reviewMode={reviewMode}
                onReviewModeChange={onReviewModeChange}
            />
            <div className="color-compensation-actions">
                <button className="inline-action-button" type="button" onClick={onSetupAgain}>Set Up Again</button>
                <button className="inline-action-button" type="button" onClick={onReset}>Reset</button>
                <button className="inline-action-button" type="button" onClick={onDone}>Done</button>
            </div>
        </section>
    );
}

function IntroPage({
    onStart,
    onCancel,
}: {
    readonly onStart: () => void;
    readonly onCancel: () => void;
}): React.JSX.Element {
    return (
        <section className="color-compensation-page">
            <h1>Color Compensation</h1>
            <p>
                Stream Deck hardware colors may look different from your monitor. This wizard adjusts the{" "}
                display result on <strong>Stream Deck</strong> so it looks closer to what you see on your monitor.
            </p>
            <p>
                Each step shows the same sample on both screens.{" "}
                <strong>The sample you see on your monitor stays the same. The Stream Deck sample updates as you move the slider.</strong>{" "}
                Adjust until they look as close as possible.
            </p>
            <ul className="color-compensation-bullet-list">
                <li>Set Stream Deck global brightness to a comfortable level before starting</li>
                <li>This wizard takes about 1 minute</li>
                <li>Affects all Stream Deck keys controlled by Sho Metrics</li>
            </ul>
            <div className="color-compensation-actions">
                <button className="inline-action-button" type="button" onClick={onStart}>Start</button>
                <button className="inline-action-button" type="button" onClick={onCancel}>Cancel</button>
            </div>
        </section>
    );
}

function PreflightPage({
    onBack,
    onConfirm,
    onCancel,
}: {
    readonly onBack: () => void;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
}): React.JSX.Element {
    return (
        <section className="color-compensation-page">
            <h1>Check Your Key</h1>
            <div className="color-compensation-preflight-summary">
                <SampleWidgetPreview focus="preflight" />
                <div className="color-compensation-preflight-copy">
                    <p className="color-compensation-instruction">
                        Find the Stream Deck key showing this image.
                    </p>
                    <p className="color-compensation-instruction">
                        In the next steps, compare that key with the reference sample on your monitor.
                    </p>
                </div>
            </div>
            <p className="section-note">
                If you set a custom icon for this key, live preview is blocked for this key and setup will not work.
            </p>
            <div className="color-compensation-actions color-compensation-actions-wide">
                <button className="inline-action-button" type="button" onClick={onBack}>Back</button>
                <button className="inline-action-button" type="button" onClick={onConfirm}>I See It</button>
                <button className="inline-action-button" type="button" onClick={onCancel}>Cancel</button>
            </div>
        </section>
    );
}

function StepPage({
    stepId,
    stepNumber,
    stepCount,
    value,
    onValueChange,
    onBack,
    onSkip,
    onNext,
    onCancel,
}: {
    readonly stepId: ColorCompensationStepId;
    readonly stepNumber: number;
    readonly stepCount: number;
    readonly value: number;
    readonly onValueChange: (value: number) => void;
    readonly onBack: () => void;
    readonly onSkip: () => void;
    readonly onNext: () => void;
    readonly onCancel: () => void;
}): React.JSX.Element {
    const stepCopy = stepCopyById[stepId];

    return (
        <section className="color-compensation-page">
            <p className="color-compensation-progress">Step {stepNumber} of {stepCount}: {stepCopy.title}</p>
            <SampleWidgetPreview focus={stepId} />
            <p className="color-compensation-instruction">{stepCopy.instruction}</p>
            <SteppedSlider
                value={value}
                minimum={COLOR_COMPENSATION_ADJUSTMENT_MINIMUM}
                maximum={COLOR_COMPENSATION_ADJUSTMENT_MAXIMUM}
                lowerLabel={stepCopy.lowerLabel}
                upperLabel={stepCopy.upperLabel}
                ariaLabel={stepCopy.title}
                onValueChange={onValueChange}
            />
            <div className="color-compensation-actions color-compensation-actions-wide">
                <button className="inline-action-button" type="button" onClick={onBack}>Back</button>
                <button className="inline-action-button" type="button" onClick={onSkip}>Skip</button>
                <button className="inline-action-button" type="button" onClick={onNext}>Next</button>
                <button className="inline-action-button" type="button" onClick={onCancel}>Cancel</button>
            </div>
        </section>
    );
}

function ReviewPage({
    profile,
    reviewMode,
    skippedStepText,
    onReviewModeChange,
    onProfileStepChange,
    onResetDraft,
    onBack,
    onRedo,
    onDone,
    onCancel,
}: {
    readonly profile: ColorCompensationProfile;
    readonly reviewMode: ColorCompensationReviewMode;
    readonly skippedStepText: string | null;
    readonly onReviewModeChange: (reviewMode: ColorCompensationReviewMode) => void;
    readonly onProfileStepChange: (stepId: ColorCompensationStepId, value: number) => void;
    readonly onResetDraft: () => void;
    readonly onBack: () => void;
    readonly onRedo: () => void;
    readonly onDone: () => void;
    readonly onCancel: () => void;
}): React.JSX.Element {
    return (
        <section className="color-compensation-page">
            <h1>Compensation Ready</h1>
            <SampleWidgetPreview focus="review" />
            <p className="color-compensation-instruction">Hold the button below to preview Stream Deck without compensation.</p>
            {skippedStepText ? <p className="color-compensation-notice">{skippedStepText}</p> : null}
            <HoldBeforeButton
                reviewMode={reviewMode}
                onReviewModeChange={onReviewModeChange}
            />
            <details className="color-compensation-details">
                <summary>Fine-tune manually</summary>
                <ManualProfileSliders
                    profile={profile}
                    onProfileStepChange={onProfileStepChange}
                />
                <div className="color-compensation-manual-actions">
                    <button className="inline-action-button" type="button" onClick={onResetDraft}>
                        Reset Compensation
                    </button>
                </div>
            </details>
            <p className="section-note">
                Re-run this if you change Stream Deck global brightness, switch monitors, or enable HDR.
            </p>
            <div className="color-compensation-actions color-compensation-actions-wide">
                <button className="inline-action-button" type="button" onClick={onBack}>Back</button>
                <button className="inline-action-button" type="button" onClick={onRedo}>Redo</button>
                <button
                    className="inline-action-button"
                    type="button"
                    onClick={onDone}
                >
                    Done
                </button>
                <button className="inline-action-button" type="button" onClick={onCancel}>Cancel</button>
            </div>
        </section>
    );
}

function HoldBeforeButton({
    reviewMode,
    onReviewModeChange,
}: {
    readonly reviewMode: ColorCompensationReviewMode;
    readonly onReviewModeChange: (reviewMode: ColorCompensationReviewMode) => void;
}): React.JSX.Element {
    const showBefore = useCallback((): void => {
        onReviewModeChange("before");
    }, [onReviewModeChange]);
    const showAfter = useCallback((): void => {
        onReviewModeChange("after");
    }, [onReviewModeChange]);

    return (
        <div className="color-compensation-hold-preview" role="group" aria-label="Before and after preview">
            <button
                className="inline-action-button"
                type="button"
                aria-pressed={reviewMode === "before"}
                data-selected={reviewMode === "before" ? "true" : "false"}
                onPointerDown={showBefore}
                onPointerUp={showAfter}
                onPointerCancel={showAfter}
                onPointerLeave={showAfter}
                onBlur={showAfter}
                onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                        showBefore();
                    }
                }}
                onKeyUp={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                        showAfter();
                    }
                }}
            >
                Hold for Before
            </button>
        </div>
    );
}

function ManualProfileSliders({
    profile,
    onProfileStepChange,
}: {
    readonly profile: ColorCompensationProfile;
    readonly onProfileStepChange: (stepId: ColorCompensationStepId, value: number) => void;
}): React.JSX.Element {
    return (
        <div className="color-compensation-manual-sliders">
            {COLOR_COMPENSATION_WIZARD_STEPS.map((stepId) => {
                const stepCopy = stepCopyById[stepId];

                return (
                    <div key={stepId} className="color-compensation-manual-slider">
                        <p>{stepCopy.title}</p>
                        <SteppedSlider
                            value={readStepValue(profile, stepId)}
                            minimum={COLOR_COMPENSATION_ADJUSTMENT_MINIMUM}
                            maximum={COLOR_COMPENSATION_ADJUSTMENT_MAXIMUM}
                            lowerLabel={stepCopy.lowerLabel}
                            upperLabel={stepCopy.upperLabel}
                            ariaLabel={stepCopy.title}
                            onValueChange={(value) => onProfileStepChange(stepId, value)}
                        />
                    </div>
                );
            })}
        </div>
    );
}

function SampleWidgetPreview({
    focus,
}: {
    readonly focus: ColorCompensationSampleFocus;
}): React.JSX.Element {
    const previewUri = `data:image/svg+xml,${encodeURIComponent(renderColorCompensationSampleSvg(focus))}`;

    return (
        <img
            className="color-compensation-sample-widget"
            src={previewUri}
            alt="Color compensation sample widget"
        />
    );
}

function readErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function createColorCompensationSessionId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
