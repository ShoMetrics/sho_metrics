export interface RenderForegroundEffectTokens {
    readonly valueFilter: string | undefined;
    readonly labelFilter: string | undefined;
    readonly iconFilter: string | undefined;
    readonly metricFilter: string | undefined;
    readonly subtleFilter: string | undefined;
}

export const OLD_CRT_VALUE_GLOW_FILTER_ID = "old-crt-value-glow";
export const OLD_CRT_LABEL_GLOW_FILTER_ID = "old-crt-label-glow";
export const OLD_CRT_METRIC_GLOW_FILTER_ID = "old-crt-metric-glow";
export const OLD_CRT_SUBTLE_GLOW_FILTER_ID = "old-crt-subtle-glow";

export const DEFAULT_RENDER_FOREGROUND_EFFECT_TOKENS = {
    valueFilter: undefined,
    labelFilter: undefined,
    iconFilter: undefined,
    metricFilter: undefined,
    subtleFilter: undefined,
} satisfies RenderForegroundEffectTokens;

export const OLD_CRT_RENDER_FOREGROUND_EFFECT_TOKENS = {
    valueFilter: `url(#${OLD_CRT_VALUE_GLOW_FILTER_ID})`,
    labelFilter: `url(#${OLD_CRT_LABEL_GLOW_FILTER_ID})`,
    iconFilter: `url(#${OLD_CRT_LABEL_GLOW_FILTER_ID})`,
    metricFilter: `url(#${OLD_CRT_METRIC_GLOW_FILTER_ID})`,
    subtleFilter: `url(#${OLD_CRT_SUBTLE_GLOW_FILTER_ID})`,
} satisfies RenderForegroundEffectTokens;

export function buildSvgFilterAttributes(filter: string | undefined): readonly string[] {
    return filter ? [`filter="${filter}"`] : [];
}
