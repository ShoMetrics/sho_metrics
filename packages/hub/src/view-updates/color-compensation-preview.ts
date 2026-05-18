import { Target, type WillAppearEvent } from "@elgato/streamdeck";
import type { ColorCompensationProfile } from "../color-compensation/types";
import type { ColorCompensationSampleFocus } from "../color-compensation/patterns";
import {
    clearColorCompensationPreview as clearColorCompensationRuntimePreview,
    setColorCompensationPatternPreview,
    setColorCompensationWidgetPreview as setColorCompensationRuntimeWidgetPreview,
} from "../color-compensation/runtime-store";
import { logger } from "../logging/logger";
import { wrapSvgWithColorCompensationFilter } from "../view-rendering/color-compensation-filter";
import { renderColorCompensationSampleSvg } from "../view-rendering/color-compensation-patterns";
import { rasterizeSvgToPngDataUrl } from "../view-rendering/rasterizer";
import { KEYPAD_PNG_SIZE } from "../view-rendering/widget-data";

const log = logger.for("ColorCompensationPreview");

export async function showColorCompensationSamplePreview(options: {
    readonly event: WillAppearEvent;
    readonly focus: ColorCompensationSampleFocus;
    readonly profile: ColorCompensationProfile;
}): Promise<void> {
    const actionId = options.event.action.id;
    const softwareSvg = renderColorCompensationSampleSvg(options.focus);
    const hardwareSvg = wrapSvgWithColorCompensationFilter(softwareSvg, options.profile);
    const softwarePngDataUrl = rasterizeSvgToPngDataUrl(softwareSvg, KEYPAD_PNG_SIZE);
    const hardwarePngDataUrl = rasterizeSvgToPngDataUrl(hardwareSvg, KEYPAD_PNG_SIZE);

    if (!softwarePngDataUrl || !hardwarePngDataUrl) {
        throw new Error("Color compensation preview rasterization failed.");
    }

    if (!options.event.action.isKey()) {
        throw new Error("Color compensation preview is only supported for key actions.");
    }

    setColorCompensationPatternPreview(actionId);

    try {
        await options.event.action.setTitle("");
        await options.event.action.setImage(softwarePngDataUrl, { target: Target.Software });
        await options.event.action.setImage(hardwarePngDataUrl, { target: Target.Hardware });
    } catch (error) {
        clearColorCompensationRuntimePreview(actionId);
        log.warn(() => `Failed to show color compensation pattern preview: ${String(error)}`);
        throw error;
    }
}

export function setColorCompensationWidgetPreview(options: {
    readonly actionId: string;
    readonly profile: ColorCompensationProfile;
}): void {
    setColorCompensationRuntimeWidgetPreview(options);
}

export function clearColorCompensationPreview(actionId: string): void {
    clearColorCompensationRuntimePreview(actionId);
}
