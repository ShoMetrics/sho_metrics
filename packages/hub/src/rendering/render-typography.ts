export interface RenderTypographyTokens {
    readonly labelFontFamily: string;
    readonly valueFontFamily: string;
}

const DEFAULT_RENDER_FONT_FAMILY = "'Inter','SF Pro Display','Segoe UI',sans-serif";

export const DEFAULT_RENDER_TYPOGRAPHY_TOKENS = {
    labelFontFamily: DEFAULT_RENDER_FONT_FAMILY,
    valueFontFamily: DEFAULT_RENDER_FONT_FAMILY,
} satisfies RenderTypographyTokens;
