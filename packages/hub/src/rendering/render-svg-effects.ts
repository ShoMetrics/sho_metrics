export interface RenderGraphicEffectTokens {
    readonly iconFilter: string | undefined;
    readonly metricFilter: string | undefined;
    readonly subtleFilter: string | undefined;
}

export const OLD_CRT_VALUE_GLOW_FILTER_ID = "old-crt-value-glow";
export const OLD_CRT_LABEL_GLOW_FILTER_ID = "old-crt-label-glow";
export const OLD_CRT_METRIC_GLOW_FILTER_ID = "old-crt-metric-glow";
export const OLD_CRT_SUBTLE_GLOW_FILTER_ID = "old-crt-subtle-glow";

export const DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS = {
    iconFilter: undefined,
    metricFilter: undefined,
    subtleFilter: undefined,
} satisfies RenderGraphicEffectTokens;

export const OLD_CRT_RENDER_GRAPHIC_EFFECT_TOKENS = {
    iconFilter: `url(#${OLD_CRT_LABEL_GLOW_FILTER_ID})`,
    metricFilter: `url(#${OLD_CRT_METRIC_GLOW_FILTER_ID})`,
    subtleFilter: `url(#${OLD_CRT_SUBTLE_GLOW_FILTER_ID})`,
} satisfies RenderGraphicEffectTokens;

export function buildSvgFilterAttributes(filter: string | undefined): readonly string[] {
    return filter ? [`filter="${filter}"`] : [];
}
