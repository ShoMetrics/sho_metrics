import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ColorCompensationSampleFocus } from "../../color-compensation/patterns";
import {
    COLOR_COMPENSATION_ADJUSTMENT_IDS,
    COLOR_COMPENSATION_ADJUSTMENT_MAXIMUM,
    COLOR_COMPENSATION_ADJUSTMENT_MINIMUM,
    type ColorCompensationAdjustmentId,
    type ColorCompensationGuidedAdjustmentId,
    type ColorCompensationProfile,
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
    COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS,
    colorCompensationWizardReducer,
    createColorCompensationWizardState,
    readAdjustmentValue,
    type ColorCompensationReviewMode,
} from "./color-compensation-reducer";

interface ColorCompensationWizardProps {
    readonly client: StreamDeckPropertyInspectorClient;
    readonly initialProfile: ColorCompensationProfile;
    readonly onProfileSave: (profile: ColorCompensationProfile) => Promise<void>;
    readonly onProfileReset: () => Promise<void>;
    readonly onClose: () => void;
}

interface ManualAdjustmentCopy {
    readonly title: string;
    readonly lowerLabel: string;
    readonly upperLabel: string;
}

interface GuidedAdjustmentCopy extends ManualAdjustmentCopy {
    readonly instruction: string;
}

const guidedInstructionByAdjustmentId: Record<ColorCompensationGuidedAdjustmentId, string> = {
    saturation: "Adjust until the colored blocks on your Stream Deck key look closest to the monitor sample.",
    gamma: "Adjust until the gray gradient on your Stream Deck key looks closest to the monitor sample.",
    shadow: "Adjust until the dark blocks on your Stream Deck key look closest to the dark blocks on your monitor.",
};

const manualAdjustmentCopyById: Record<ColorCompensationAdjustmentId, ManualAdjustmentCopy> = {
    saturation: {
        title: "Color Strength",
        lowerLabel: "Muted",
        upperLabel: "Vivid",
    },
    brightness: {
        title: "Overall Brightness",
        lowerLabel: "Dimmer",
        upperLabel: "Brighter",
    },
    gamma: {
        title: "Midtones",
        lowerLabel: "Darker",
        upperLabel: "Lighter",
    },
    shadow: {
        title: "Dark Detail",
        lowerLabel: "Flat",
        upperLabel: "Deep",
    },
};

function buildGuidedAdjustmentCopy(adjustmentId: ColorCompensationGuidedAdjustmentId): GuidedAdjustmentCopy {
    return {
        ...manualAdjustmentCopyById[adjustmentId],
        instruction: guidedInstructionByAdjustmentId[adjustmentId],
    };
}

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
    const activeAdjustmentId = COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS[state.stepIndex]
        ?? COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS[0];
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
                kind: activeAdjustmentId,
                profile: state.profile,
            }));
            return;
        }

        sendMessage(buildColorCompensationPreviewMessage({
            sessionId,
            kind: state.reviewMode === "before" ? "review-before" : "review-after",
            profile: state.profile,
        }));
    }, [activeAdjustmentId, sendMessage, sessionId, state.page, state.profile, state.reviewMode]);

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
        if (state.skippedAdjustmentIds.length === 0) {
            return null;
        }

        return `${state.skippedAdjustmentIds.length} step${state.skippedAdjustmentIds.length === 1 ? "" : "s"} skipped.`;
    }, [state.skippedAdjustmentIds.length]);

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
                    adjustmentId={activeAdjustmentId}
                    stepNumber={state.stepIndex + 1}
                    stepCount={COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS.length}
                    value={readAdjustmentValue(state.profile, activeAdjustmentId)}
                    onValueChange={(value) => dispatch({
                        type: "adjustmentValueChanged",
                        adjustmentId: activeAdjustmentId,
                        value,
                    })}
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
                    onProfileAdjustmentChange={(adjustmentId, value) => dispatch({
                        type: "adjustmentValueChanged",
                        adjustmentId,
                        value,
                    })}
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
    adjustmentId,
    stepNumber,
    stepCount,
    value,
    onValueChange,
    onBack,
    onSkip,
    onNext,
    onCancel,
}: {
    readonly adjustmentId: ColorCompensationGuidedAdjustmentId;
    readonly stepNumber: number;
    readonly stepCount: number;
    readonly value: number;
    readonly onValueChange: (value: number) => void;
    readonly onBack: () => void;
    readonly onSkip: () => void;
    readonly onNext: () => void;
    readonly onCancel: () => void;
}): React.JSX.Element {
    const stepCopy = buildGuidedAdjustmentCopy(adjustmentId);

    return (
        <section className="color-compensation-page">
            <p className="color-compensation-progress">Step {stepNumber} of {stepCount}: {stepCopy.title}</p>
            <SampleWidgetPreview focus={adjustmentId} />
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
    onProfileAdjustmentChange,
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
    readonly onProfileAdjustmentChange: (adjustmentId: ColorCompensationAdjustmentId, value: number) => void;
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
                    onProfileAdjustmentChange={onProfileAdjustmentChange}
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
    onProfileAdjustmentChange,
}: {
    readonly profile: ColorCompensationProfile;
    readonly onProfileAdjustmentChange: (adjustmentId: ColorCompensationAdjustmentId, value: number) => void;
}): React.JSX.Element {
    return (
        <div className="color-compensation-manual-sliders">
            {COLOR_COMPENSATION_ADJUSTMENT_IDS.map((adjustmentId) => {
                const adjustmentCopy = manualAdjustmentCopyById[adjustmentId];

                return (
                    <div key={adjustmentId} className="color-compensation-manual-slider">
                        <p>{adjustmentCopy.title}</p>
                        <SteppedSlider
                            value={readAdjustmentValue(profile, adjustmentId)}
                            minimum={COLOR_COMPENSATION_ADJUSTMENT_MINIMUM}
                            maximum={COLOR_COMPENSATION_ADJUSTMENT_MAXIMUM}
                            lowerLabel={adjustmentCopy.lowerLabel}
                            upperLabel={adjustmentCopy.upperLabel}
                            ariaLabel={adjustmentCopy.title}
                            onValueChange={(value) => onProfileAdjustmentChange(adjustmentId, value)}
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
