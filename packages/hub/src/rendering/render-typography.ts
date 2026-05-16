export interface RenderTypographyTokens {
    readonly labelFontFamily: string;
    readonly valueFontFamily: string;
}

const DEFAULT_RENDER_FONT_FAMILY = "'Inter','SF Pro Display','Segoe UI',sans-serif";
const OLD_CRT_LABEL_FONT_FAMILY = "'Share Tech Mono','Inter','SF Pro Display','Segoe UI',monospace";
const OLD_CRT_VALUE_FONT_FAMILY = "'Share Tech Mono','Inter','SF Pro Display','Segoe UI',monospace";

export const DEFAULT_RENDER_TYPOGRAPHY_TOKENS = {
    labelFontFamily: DEFAULT_RENDER_FONT_FAMILY,
    valueFontFamily: DEFAULT_RENDER_FONT_FAMILY,
} satisfies RenderTypographyTokens;

export const OLD_CRT_RENDER_TYPOGRAPHY_TOKENS = {
    labelFontFamily: OLD_CRT_LABEL_FONT_FAMILY,
    valueFontFamily: OLD_CRT_VALUE_FONT_FAMILY,
} satisfies RenderTypographyTokens;
