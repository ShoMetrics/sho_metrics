import {
    DEFAULT_RENDER_OUTLINE_COLOR,
    DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS,
    type RenderOutlineTokens,
    type RenderTransparentSurfaceTokens,
} from "../view-rendering/render-appearance";
import { resolveActiveTransparentSurface } from "./appearance-overrides";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

/**
 * Resolves transparent-surface settings into renderer drawing tokens.
 *
 * Settings own product intent and percentages. Renderers only receive concrete
 * background opacity and outline strength tokens.
 */
export function resolveRenderTransparentSurface(settings: ResolvedAppearanceSettings): RenderTransparentSurfaceTokens {
    const transparentSurface = resolveActiveTransparentSurface(settings);

    if (!transparentSurface.enabled) {
        return DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS;
    }

    return {
        backgroundOpacity: resolvePercentRatio(transparentSurface.backgroundOpacityPercent),
        textOutline: resolveOutlineTokens(transparentSurface.textOutlinePercent),
        shapeOutline: resolveOutlineTokens(transparentSurface.shapeOutlinePercent),
    };
}

function resolveOutlineTokens(percent: number): RenderOutlineTokens {
    const ratio = resolvePercentRatio(percent);

    return {
        color: DEFAULT_RENDER_OUTLINE_COLOR,
        strength: ratio,
    };
}

function resolvePercentRatio(percent: number): number {
    if (!Number.isFinite(percent)) {
        return 0;
    }

    return Math.min(Math.max(percent, 0), 100) / 100;
}
