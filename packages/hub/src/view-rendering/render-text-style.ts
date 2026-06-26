import {
    TERMINAL_LABEL_GLOW_FILTER_ID,
    TERMINAL_SUBTLE_GLOW_FILTER_ID,
    TERMINAL_VALUE_GLOW_FILTER_ID,
} from "./render-svg-effects";

export interface RenderTextStyle {
    /** Font family string written to SVG text elements. */
    readonly fontFamily: string;
    /** Numeric SVG font weight used for this text role. */
    readonly fontWeight: number;
    /** Multiplier applied to the primitive-authored base font size. */
    readonly fontSizeScale: number;
    /** Positive values increase the SVG y coordinate and move text downward. */
    readonly baselineShiftEm: number;
    /** Vertical clip box height, expressed as a multiple of resolved font size. */
    readonly clipHeightEm: number;
    /** Multiplier applied to estimated text width before the guard ratio. */
    readonly widthScale: number;
    /** Additional glyph spacing, expressed as a multiple of resolved font size. */
    readonly letterSpacingEm: number;
    /** Smallest font-size scale allowed before SVG textLength compression guards the text. */
    readonly minimumFontScale: number;
    /** Per-side horizontal clip bleed for fonts that paint outside their SVG textLength box. */
    readonly clipHorizontalBleedPixels: number;
    /** Optional SVG filter reference applied to this text role. */
    readonly filter: string | undefined;
}

type RenderTextStyleMetrics = Pick<
    RenderTextStyle,
    | "baselineShiftEm"
    | "clipHeightEm"
    | "widthScale"
    | "letterSpacingEm"
    | "minimumFontScale"
    | "clipHorizontalBleedPixels"
>;

// Internal preset input only. Keep this private so runtime renderers consume
// complete RenderTextStyle objects instead of partial style definitions.
type RenderTextStylePreset =
    & Omit<RenderTextStyle, keyof RenderTextStyleMetrics>
    & Partial<RenderTextStyleMetrics>;

export interface RenderTextStyles {
    readonly value: RenderTextStyle;
    readonly unit: RenderTextStyle;
    readonly title: RenderTextStyle;
    readonly label: RenderTextStyle;
    readonly smallLabel: RenderTextStyle;
}

const MINIMUM_TEXT_STYLE_FONT_SIZE_SCALE = 0.9;
const MAXIMUM_TEXT_STYLE_FONT_SIZE_SCALE = 1.12;
export const DEFAULT_RENDER_TEXT_BASELINE_SHIFT_EM = 0;
export const DEFAULT_RENDER_TEXT_CLIP_HEIGHT_EM = 1.45;
export const DEFAULT_RENDER_TEXT_WIDTH_SCALE = 1;
export const DEFAULT_RENDER_TEXT_LETTER_SPACING_EM = 0;
export const DEFAULT_RENDER_TEXT_MINIMUM_FONT_SCALE = 0.78;
const DEFAULT_RENDER_FONT_FAMILY = "'SF Pro Display','Helvetica Neue','Inter','Segoe UI',sans-serif";
const TERMINAL_FONT_FAMILY = "'Share Tech Mono','SF Pro Display','Helvetica Neue','Inter','Segoe UI',monospace";
export const PIXEL_RENDER_FONT_FAMILY = "'DotGothic16','Inter','Segoe UI',sans-serif";
export const JAPANESE_SERIF_RENDER_FONT_FAMILY = [
    "'Yu Mincho'",
    "'YuMincho'",
    "'Hiragino Mincho ProN'",
    "'Hiragino Mincho Pro'",
    "'Noto Serif CJK JP'",
    "'Noto Serif JP'",
    "'Source Han Serif JP'",
    "'Source Han Serif'",
    "'IPAexMincho'",
    "'IPAMincho'",
    "'BIZ UDMincho'",
    "'BIZ UDPMincho'",
    "'MS Mincho'",
    "'MS PMincho'",
    "'Songti SC'",
    "'SimSun'",
    "'MingLiU'",
    "serif",
].join(",");

// Renderer-owned text style presets stay in this file so metrics defaults do
// not drift through hand-written RenderTextStyle literals in production code.
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

export const TERMINAL_CLEAN_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 760,
        fontSizeScale: 1.02,
        filter: `url(#${TERMINAL_VALUE_GLOW_FILTER_ID})`,
    }),
    unit: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 700,
        fontSizeScale: 1.04,
        filter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    }),
    title: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 760,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    }),
    label: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 760,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    }),
    smallLabel: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 700,
        fontSizeScale: 1.08,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

export const TERMINAL_VINTAGE_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 820,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_VALUE_GLOW_FILTER_ID})`,
    }),
    unit: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 680,
        fontSizeScale: 1.04,
        filter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    }),
    title: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 760,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_LABEL_GLOW_FILTER_ID})`,
    }),
    label: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 760,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_LABEL_GLOW_FILTER_ID})`,
    }),
    smallLabel: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: 620,
        fontSizeScale: 1.08,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

// Initial DotGothic16 metrics from the Slice 2 font-driver spike.
// DotGothic16 ships as Regular only; these weights preserve role intent and
// fallback behavior, but they do not make primary DotGothic16 glyphs bolder.
export const PIXEL_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: 900,
        fontSizeScale: 1,
        baselineShiftEm: 0.02,
        widthScale: 0.9,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
    unit: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: 800,
        fontSizeScale: 1,
        baselineShiftEm: 0.08,
        widthScale: 0.9,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
    title: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: 850,
        fontSizeScale: 1,
        baselineShiftEm: 0.02,
        widthScale: 0.9,
        letterSpacingEm: 0.1,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
    label: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: 800,
        fontSizeScale: 1,
        baselineShiftEm: 0.02,
        widthScale: 0.9,
        letterSpacingEm: 0.2,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
    smallLabel: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: 750,
        fontSizeScale: 1,
        baselineShiftEm: 0.03,
        widthScale: 0.9,
        letterSpacingEm: 0.2,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

/** Defines the fixed Japanese serif text treatment for title-card metrics. */
export const TITLE_CARD_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: 900,
        fontSizeScale: 1,
        filter: undefined,
    }),
    unit: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: 800,
        fontSizeScale: 1,
        filter: undefined,
    }),
    title: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: 900,
        fontSizeScale: 1,
        filter: undefined,
    }),
    label: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: 850,
        fontSizeScale: 1,
        filter: undefined,
    }),
    smallLabel: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: 750,
        fontSizeScale: 1,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

export function resolveRenderTextStyleFontSize(baseFontSize: number, textStyle: RenderTextStyle): number {
    return baseFontSize * textStyle.fontSizeScale;
}

function createRenderTextStyle(textStyle: RenderTextStylePreset): RenderTextStyle {
    return {
        ...textStyle,
        fontSizeScale: Math.min(
            Math.max(textStyle.fontSizeScale, MINIMUM_TEXT_STYLE_FONT_SIZE_SCALE),
            MAXIMUM_TEXT_STYLE_FONT_SIZE_SCALE,
        ),
        baselineShiftEm: textStyle.baselineShiftEm ?? DEFAULT_RENDER_TEXT_BASELINE_SHIFT_EM,
        clipHeightEm: textStyle.clipHeightEm ?? DEFAULT_RENDER_TEXT_CLIP_HEIGHT_EM,
        widthScale: textStyle.widthScale ?? DEFAULT_RENDER_TEXT_WIDTH_SCALE,
        letterSpacingEm: textStyle.letterSpacingEm ?? DEFAULT_RENDER_TEXT_LETTER_SPACING_EM,
        minimumFontScale: textStyle.minimumFontScale ?? DEFAULT_RENDER_TEXT_MINIMUM_FONT_SCALE,
        clipHorizontalBleedPixels: textStyle.clipHorizontalBleedPixels ?? 0,
    };
}
