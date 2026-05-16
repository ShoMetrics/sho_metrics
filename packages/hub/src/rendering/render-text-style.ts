import {
    OLD_CRT_LABEL_GLOW_FILTER_ID,
    OLD_CRT_SUBTLE_GLOW_FILTER_ID,
    OLD_CRT_VALUE_GLOW_FILTER_ID,
} from "./render-svg-effects";

export interface RenderTextStyle {
    readonly fontFamily: string;
    readonly fontWeight: number;
    readonly fontSizeScale: number;
    readonly filter: string | undefined;
}

export interface RenderTextStyles {
    readonly value: RenderTextStyle;
    readonly unit: RenderTextStyle;
    readonly title: RenderTextStyle;
    readonly label: RenderTextStyle;
    readonly smallLabel: RenderTextStyle;
}

const MINIMUM_TEXT_STYLE_FONT_SIZE_SCALE = 0.9;
const MAXIMUM_TEXT_STYLE_FONT_SIZE_SCALE = 1.12;
const DEFAULT_RENDER_FONT_FAMILY = "'Inter','SF Pro Display','Segoe UI',sans-serif";
const OLD_CRT_FONT_FAMILY = "'Share Tech Mono','Inter','SF Pro Display','Segoe UI',monospace";

export const DEFAULT_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: 900,
        fontSizeScale: 1,
        filter: undefined,
    }),
    unit: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: 800,
        fontSizeScale: 1,
        filter: undefined,
    }),
    title: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: 850,
        fontSizeScale: 1,
        filter: undefined,
    }),
    label: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: 800,
        fontSizeScale: 1,
        filter: undefined,
    }),
    smallLabel: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: 750,
        fontSizeScale: 1,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

export const OLD_CRT_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: OLD_CRT_FONT_FAMILY,
        fontWeight: 820,
        fontSizeScale: 1,
        filter: `url(#${OLD_CRT_VALUE_GLOW_FILTER_ID})`,
    }),
    unit: createRenderTextStyle({
        fontFamily: OLD_CRT_FONT_FAMILY,
        fontWeight: 680,
        fontSizeScale: 1.04,
        filter: `url(#${OLD_CRT_SUBTLE_GLOW_FILTER_ID})`,
    }),
    title: createRenderTextStyle({
        fontFamily: OLD_CRT_FONT_FAMILY,
        fontWeight: 760,
        fontSizeScale: 1,
        filter: `url(#${OLD_CRT_LABEL_GLOW_FILTER_ID})`,
    }),
    label: createRenderTextStyle({
        fontFamily: OLD_CRT_FONT_FAMILY,
        fontWeight: 760,
        fontSizeScale: 1,
        filter: `url(#${OLD_CRT_LABEL_GLOW_FILTER_ID})`,
    }),
    smallLabel: createRenderTextStyle({
        fontFamily: OLD_CRT_FONT_FAMILY,
        fontWeight: 620,
        fontSizeScale: 1.08,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

export function resolveRenderTextStyleFontSize(baseFontSize: number, textStyle: RenderTextStyle): number {
    return baseFontSize * textStyle.fontSizeScale;
}

function createRenderTextStyle(textStyle: RenderTextStyle): RenderTextStyle {
    return {
        ...textStyle,
        fontSizeScale: Math.min(
            Math.max(textStyle.fontSizeScale, MINIMUM_TEXT_STYLE_FONT_SIZE_SCALE),
            MAXIMUM_TEXT_STYLE_FONT_SIZE_SCALE,
        ),
    };
}
