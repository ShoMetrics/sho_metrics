import type { SendToPluginEvent, WillAppearEvent } from "@elgato/streamdeck";
import {
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    type ColorCompensationProfile,
} from "./types";
import {
    readColorCompensationPluginMessage,
    type ColorCompensationPreview,
} from "./messages";
import {
    clearColorCompensationPreview,
    clearColorCompensationPreviewSession,
    setColorCompensationWidgetPreview,
    startColorCompensationPreviewSession,
} from "./runtime-store";
import { logger } from "../logging/logger";
import {
    showColorCompensationSamplePreview,
} from "../view-updates/color-compensation-preview";

const log = logger.for("ColorCompensationPluginController");

interface ColorCompensationPluginMessageOptions {
    readonly event: SendToPluginEvent<never, Record<string, never>>;
    readonly activeActionEvent: WillAppearEvent | undefined;
    readonly refreshActiveAction: () => void;
}

export function handleColorCompensationPluginMessage(options: ColorCompensationPluginMessageOptions): void {
    const message = readColorCompensationPluginMessage(options.event.payload);

    if (!message || !options.activeActionEvent) {
        return;
    }

    switch (message.command) {
        case "start":
            startColorCompensationPreviewSession({
                actionId: options.event.action.id,
                sessionId: message.sessionId,
            });
            break;
        case "preview":
            previewColorCompensation({
                activeActionEvent: options.activeActionEvent,
                sessionId: message.sessionId,
                preview: message.preview,
                refreshActiveAction: options.refreshActiveAction,
            });
            break;
        case "commit":
        case "cancel":
        case "reset":
            clearColorCompensationSessionAndRefresh({
                activeActionEvent: options.activeActionEvent,
                sessionId: message.sessionId,
                refreshActiveAction: options.refreshActiveAction,
            });
            break;
    }
}

export function clearColorCompensationActionPreview(actionId: string): void {
    clearColorCompensationPreview(actionId);
}

function previewColorCompensation(options: {
    readonly activeActionEvent: WillAppearEvent;
    readonly sessionId: string;
    readonly preview: ColorCompensationPreview;
    readonly refreshActiveAction: () => void;
}): void {
    switch (options.preview.kind) {
        case "preflight":
        case "shadow":
        case "gamma":
        case "saturation":
            showColorCompensationSamplePreview({
                event: options.activeActionEvent,
                sessionId: options.sessionId,
                focus: options.preview.kind,
                profile: options.preview.profile,
            }).catch(error => {
                clearColorCompensationSessionAfterPreviewFailure(options);
                log.warn(() => `Failed to render color compensation preview: ${String(error)}`);
                options.activeActionEvent.action.showAlert().catch(alertError => {
                    log.warn(() => `Failed to show color compensation preview alert: ${String(alertError)}`);
                });
            });
            break;
        case "review-before":
            showColorCompensationSamplePreview({
                event: options.activeActionEvent,
                sessionId: options.sessionId,
                focus: "review",
                profile: DEFAULT_COLOR_COMPENSATION_PROFILE,
            }).catch(error => {
                clearColorCompensationSessionAfterPreviewFailure(options);
                log.warn(() => `Failed to render color compensation before preview: ${String(error)}`);
            });
            break;
        case "review-after":
            showColorCompensationSamplePreview({
                event: options.activeActionEvent,
                sessionId: options.sessionId,
                focus: "review",
                profile: options.preview.profile,
            }).catch(error => {
                clearColorCompensationSessionAfterPreviewFailure(options);
                log.warn(() => `Failed to render color compensation after preview: ${String(error)}`);
            });
            break;
        case "widget-before":
            setWidgetPreviewAndRefresh({
                activeActionEvent: options.activeActionEvent,
                sessionId: options.sessionId,
                profile: DEFAULT_COLOR_COMPENSATION_PROFILE,
                refreshActiveAction: options.refreshActiveAction,
            });
            break;
        case "widget-after":
            setWidgetPreviewAndRefresh({
                activeActionEvent: options.activeActionEvent,
                sessionId: options.sessionId,
                profile: options.preview.profile,
                refreshActiveAction: options.refreshActiveAction,
            });
            break;
    }
}

function setWidgetPreviewAndRefresh(options: {
    readonly activeActionEvent: WillAppearEvent;
    readonly sessionId: string;
    readonly profile: ColorCompensationProfile;
    readonly refreshActiveAction: () => void;
}): void {
    if (!setColorCompensationWidgetPreview({
        actionId: options.activeActionEvent.action.id,
        sessionId: options.sessionId,
        profile: options.profile,
    })) {
        return;
    }

    options.refreshActiveAction();
}

function clearColorCompensationSessionAndRefresh(options: {
    readonly activeActionEvent: WillAppearEvent;
    readonly sessionId: string;
    readonly refreshActiveAction: () => void;
}): void {
    if (!clearColorCompensationPreviewSession({
        actionId: options.activeActionEvent.action.id,
        sessionId: options.sessionId,
    })) {
        return;
    }

    options.refreshActiveAction();
}

function clearColorCompensationSessionAfterPreviewFailure(options: {
    readonly activeActionEvent: WillAppearEvent;
    readonly sessionId: string;
    readonly refreshActiveAction: () => void;
}): void {
    clearColorCompensationPreviewSession({
        actionId: options.activeActionEvent.action.id,
        sessionId: options.sessionId,
    });
    options.refreshActiveAction();
}
