export interface RenderThemeEffectTokens {
    readonly iconFilter: string | undefined;
    readonly metricFilter: string | undefined;
    readonly subtleFilter: string | undefined;
}

export const TERMINAL_VALUE_GLOW_FILTER_ID = "terminal-value-glow";
export const TERMINAL_LABEL_GLOW_FILTER_ID = "terminal-label-glow";
export const TERMINAL_METRIC_GLOW_FILTER_ID = "terminal-metric-glow";
export const TERMINAL_SUBTLE_GLOW_FILTER_ID = "terminal-subtle-glow";

export const DEFAULT_RENDER_THEME_EFFECT_TOKENS = {
    iconFilter: undefined,
    metricFilter: undefined,
    subtleFilter: undefined,
} satisfies RenderThemeEffectTokens;

export const TERMINAL_CLEAN_RENDER_THEME_EFFECT_TOKENS = {
    iconFilter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    metricFilter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    subtleFilter: undefined,
} satisfies RenderThemeEffectTokens;

export const TERMINAL_VINTAGE_RENDER_THEME_EFFECT_TOKENS = {
    iconFilter: `url(#${TERMINAL_LABEL_GLOW_FILTER_ID})`,
    metricFilter: `url(#${TERMINAL_METRIC_GLOW_FILTER_ID})`,
    subtleFilter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
} satisfies RenderThemeEffectTokens;

export function buildSvgFilterAttributes(filter: string | undefined): readonly string[] {
    return filter ? [`filter="${filter}"`] : [];
}
