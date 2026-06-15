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
    sendColorCompensationPluginMessage,
    type ColorCompensationPluginMessage,
} from "../../color-compensation/messages";
import { renderColorCompensationSampleSvg } from "../../view-rendering/color-compensation-patterns";
import { SteppedSlider } from "../components/SteppedSlider";
import { colorCompensationMessages } from "../../i18n/message-groups/color-compensation";
import { commonMessages } from "../../i18n/message-groups/shell";
import { useI18n } from "../../i18n/react";
import type { StreamDeckPropertyInspectorClient } from "../stream-deck/stream-deck-client";
import {
    COLOR_COMPENSATION_GUIDED_ADJUSTMENT_IDS,
    colorCompensationWizardReducer,
    createColorCompensationWizardState,
    readAdjustmentValue,
    type ColorCompensationReviewMode,
} from "./color-compensation-reducer";
import { wallClockNowMilliseconds } from "../../shared/clock";

interface ColorCompensationWizardProps {
    readonly client: StreamDeckPropertyInspectorClient;
    readonly initialProfile: ColorCompensationProfile;
    readonly onProfileSave: (profile: ColorCompensationProfile) => Promise<void>;
    readonly onProfileReset: () => Promise<void>;
    readonly onClose: () => void;
}

interface ManualAdjustmentCopy {
    readonly title: keyof typeof colorCompensationMessages;
    readonly lowerLabel: keyof typeof colorCompensationMessages;
    readonly upperLabel: keyof typeof colorCompensationMessages;
}

interface GuidedAdjustmentCopy extends ManualAdjustmentCopy {
    readonly instruction: keyof typeof colorCompensationMessages;
}

const guidedInstructionByAdjustmentId: Record<ColorCompensationGuidedAdjustmentId, keyof typeof colorCompensationMessages> = {
    saturation: "colorCompensationSaturationInstruction",
    gamma: "colorCompensationGammaInstruction",
    shadow: "colorCompensationShadowInstruction",
};

const manualAdjustmentCopyById: Record<ColorCompensationAdjustmentId, ManualAdjustmentCopy> = {
    saturation: {
        title: "colorStrengthTitle",
        lowerLabel: "mutedLabel",
        upperLabel: "vividLabel",
    },
    brightness: {
        title: "overallBrightnessTitle",
        lowerLabel: "dimmerLabel",
        upperLabel: "brighterLabel",
    },
    gamma: {
        title: "midtonesTitle",
        lowerLabel: "darkerLabel",
        upperLabel: "lighterLabel",
    },
    shadow: {
        title: "darkDetailTitle",
        lowerLabel: "flatLabel",
        upperLabel: "deepLabel",
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
    const { t } = useI18n();
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
    const sendMessage = useCallback((message: ColorCompensationPluginMessage): void => {
        sendColorCompensationPluginMessage(client, message).catch((error: Error) => {
            setNoticeText(t(colorCompensationMessages.colorCompensationPreviewFailed, { errorMessage: error.message }));
        });
    }, [client, t]);

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
            sendColorCompensationPluginMessage(client, buildColorCompensationCancelMessage(sessionId))
                .catch(() => undefined);
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
                setNoticeText(t(colorCompensationMessages.colorCompensationSaveFailed, {
                    errorMessage: readErrorMessage(error),
                }));
            });
    }, [t, onClose, onProfileSave, sendMessage, sessionId, state.profile]);

    const resetSavedProfile = useCallback((): void => {
        onProfileReset()
            .then(() => {
                sendMessage(buildColorCompensationResetMessage(sessionId));
                dispatch({ type: "profileReset" });
            })
            .catch((error: unknown) => {
                setNoticeText(t(colorCompensationMessages.colorCompensationResetFailed, {
                    errorMessage: readErrorMessage(error),
                }));
            });
    }, [t, onProfileReset, sendMessage, sessionId]);

    const resetDraft = useCallback((): void => {
        dispatch({ type: "draftReset" });
    }, []);

    const skippedStepText = useMemo(() => {
        if (state.skippedAdjustmentIds.length === 0) {
            return null;
        }

        return t(colorCompensationMessages.colorCompensationSkippedSteps, {
            count: state.skippedAdjustmentIds.length,
        });
    }, [state.skippedAdjustmentIds.length, t]);

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
    const { t } = useI18n();

    return (
        <section className="color-compensation-page">
            <h1>{t(colorCompensationMessages.colorCompensationTitle)}</h1>
            <p>{t(colorCompensationMessages.colorCompensationExistingProfile)}</p>
            <HoldBeforeButton
                reviewMode={reviewMode}
                onReviewModeChange={onReviewModeChange}
            />
            <div className="color-compensation-actions">
                <button className="inline-action-button" type="button" onClick={onSetupAgain}>{t(colorCompensationMessages.setUpAgainButton)}</button>
                <button className="inline-action-button" type="button" onClick={onReset}>{t(commonMessages.resetLabel)}</button>
                <button className="inline-action-button" type="button" onClick={onDone}>{t(colorCompensationMessages.doneButton)}</button>
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
    const { t } = useI18n();

    return (
        <section className="color-compensation-page">
            <h1>{t(colorCompensationMessages.colorCompensationTitle)}</h1>
            <p>
                {t(colorCompensationMessages.colorCompensationIntro1)}
            </p>
            <p>
                {t(colorCompensationMessages.colorCompensationIntro2)}
            </p>
            <ul className="color-compensation-bullet-list">
                <li>{t(colorCompensationMessages.colorCompensationBulletBrightness)}</li>
                <li>{t(colorCompensationMessages.colorCompensationBulletDuration)}</li>
                <li>{t(colorCompensationMessages.colorCompensationBulletScope)}</li>
            </ul>
            <div className="color-compensation-actions">
                <button className="inline-action-button" type="button" onClick={onStart}>{t(colorCompensationMessages.startButton)}</button>
                <button className="inline-action-button" type="button" onClick={onCancel}>{t(colorCompensationMessages.cancelButton)}</button>
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
    const { t } = useI18n();

    return (
        <section className="color-compensation-page">
            <h1>{t(colorCompensationMessages.checkYourKeyTitle)}</h1>
            <div className="color-compensation-preflight-summary">
                <SampleWidgetPreview focus="preflight" />
                <div className="color-compensation-preflight-copy">
                    <p className="color-compensation-instruction">
                        {t(colorCompensationMessages.findStreamDeckKeyInstruction)}
                    </p>
                    <p className="color-compensation-instruction">
                        {t(colorCompensationMessages.compareKeyInstruction)}
                    </p>
                </div>
            </div>
            <p className="section-note">
                {t(colorCompensationMessages.customIconPreviewBlockedNote)}
            </p>
            <div className="color-compensation-actions color-compensation-actions-wide">
                <button className="inline-action-button" type="button" onClick={onBack}>{t(colorCompensationMessages.backButton)}</button>
                <button className="inline-action-button" type="button" onClick={onConfirm}>{t(colorCompensationMessages.iSeeItButton)}</button>
                <button className="inline-action-button" type="button" onClick={onCancel}>{t(colorCompensationMessages.cancelButton)}</button>
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
    const { t } = useI18n();
    const stepCopy = buildGuidedAdjustmentCopy(adjustmentId);

    return (
        <section className="color-compensation-page">
            <p className="color-compensation-progress">
                {t(colorCompensationMessages.colorCompensationStepProgress, {
                    stepNumber,
                    stepCount,
                    title: t(colorCompensationMessages[stepCopy.title]),
                })}
            </p>
            <SampleWidgetPreview focus={adjustmentId} />
            <p className="color-compensation-instruction">{t(colorCompensationMessages[stepCopy.instruction])}</p>
            <SteppedSlider
                value={value}
                minimum={COLOR_COMPENSATION_ADJUSTMENT_MINIMUM}
                maximum={COLOR_COMPENSATION_ADJUSTMENT_MAXIMUM}
                lowerLabel={t(colorCompensationMessages[stepCopy.lowerLabel])}
                upperLabel={t(colorCompensationMessages[stepCopy.upperLabel])}
                ariaLabel={t(colorCompensationMessages[stepCopy.title])}
                onValueChange={onValueChange}
            />
            <div className="color-compensation-actions color-compensation-actions-wide">
                <button className="inline-action-button" type="button" onClick={onBack}>{t(colorCompensationMessages.backButton)}</button>
                <button className="inline-action-button" type="button" onClick={onSkip}>{t(colorCompensationMessages.skipButton)}</button>
                <button className="inline-action-button" type="button" onClick={onNext}>{t(colorCompensationMessages.nextButton)}</button>
                <button className="inline-action-button" type="button" onClick={onCancel}>{t(colorCompensationMessages.cancelButton)}</button>
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
    const { t } = useI18n();

    return (
        <section className="color-compensation-page">
            <h1>{t(colorCompensationMessages.compensationReadyTitle)}</h1>
            <SampleWidgetPreview focus="review" />
            <p className="color-compensation-instruction">{t(colorCompensationMessages.holdBeforeInstruction)}</p>
            {skippedStepText ? <p className="color-compensation-notice">{skippedStepText}</p> : null}
            <HoldBeforeButton
                reviewMode={reviewMode}
                onReviewModeChange={onReviewModeChange}
            />
            <details className="color-compensation-details">
                <summary>{t(colorCompensationMessages.fineTuneManuallySummary)}</summary>
                <ManualProfileSliders
                    profile={profile}
                    onProfileAdjustmentChange={onProfileAdjustmentChange}
                />
                <div className="color-compensation-manual-actions">
                    <button className="inline-action-button" type="button" onClick={onResetDraft}>
                        {t(colorCompensationMessages.resetCompensationButton)}
                    </button>
                </div>
            </details>
            <p className="section-note">
                {t(colorCompensationMessages.rerunColorCompensationNote)}
            </p>
            <div className="color-compensation-actions color-compensation-actions-wide">
                <button className="inline-action-button" type="button" onClick={onBack}>{t(colorCompensationMessages.backButton)}</button>
                <button className="inline-action-button" type="button" onClick={onRedo}>{t(colorCompensationMessages.redoButton)}</button>
                <button
                    className="inline-action-button"
                    type="button"
                    onClick={onDone}
                >
                    {t(colorCompensationMessages.doneButton)}
                </button>
                <button className="inline-action-button" type="button" onClick={onCancel}>{t(colorCompensationMessages.cancelButton)}</button>
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
    const { t } = useI18n();
    const showBefore = useCallback((): void => {
        onReviewModeChange("before");
    }, [onReviewModeChange]);
    const showAfter = useCallback((): void => {
        onReviewModeChange("after");
    }, [onReviewModeChange]);

    return (
        <div className="color-compensation-hold-preview" role="group" aria-label={t(colorCompensationMessages.beforeAfterPreviewLabel)}>
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
                {t(colorCompensationMessages.holdForBeforeButton)}
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
    const { t } = useI18n();

    return (
        <div className="color-compensation-manual-sliders">
            {COLOR_COMPENSATION_ADJUSTMENT_IDS.map((adjustmentId) => {
                const adjustmentCopy = manualAdjustmentCopyById[adjustmentId];

                return (
                    <div key={adjustmentId} className="color-compensation-manual-slider">
                        <p>{t(colorCompensationMessages[adjustmentCopy.title])}</p>
                        <SteppedSlider
                            value={readAdjustmentValue(profile, adjustmentId)}
                            minimum={COLOR_COMPENSATION_ADJUSTMENT_MINIMUM}
                            maximum={COLOR_COMPENSATION_ADJUSTMENT_MAXIMUM}
                            lowerLabel={t(colorCompensationMessages[adjustmentCopy.lowerLabel])}
                            upperLabel={t(colorCompensationMessages[adjustmentCopy.upperLabel])}
                            ariaLabel={t(colorCompensationMessages[adjustmentCopy.title])}
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
    const { t } = useI18n();
    const previewUri = `data:image/svg+xml,${encodeURIComponent(renderColorCompensationSampleSvg(focus))}`;

    return (
        <img
            className="color-compensation-sample-widget"
            src={previewUri}
            alt={t(colorCompensationMessages.colorCompensationSampleAlt)}
        />
    );
}

function readErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function createColorCompensationSessionId(): string {
    return `${wallClockNowMilliseconds().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
