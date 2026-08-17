import { RenderFontWeight } from "./render-font-weight";
import {
    TERMINAL_LABEL_GLOW_FILTER_ID,
    TERMINAL_SUBTLE_GLOW_FILTER_ID,
    TERMINAL_VALUE_GLOW_FILTER_ID,
} from "./render-svg-effects";

export interface RenderTextStyle {
    /** Font family string written to SVG text elements. */
    readonly fontFamily: string;
    /** Closed semantic font weight used for this text role. */
    readonly fontWeight: RenderFontWeight;
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

/**
 * Text roles a primitive selects from.
 *
 * A role carries font family, weight, filter, fit metrics, and a
 * `fontSizeScale`. It does not own the base font size or the position: every
 * primitive owns those in its own layout constants. The scale still moves the
 * final size, by a factor the preset sets for the whole theme, so a role never
 * decides how big one particular string is.
 *
 * Select the role from where the text came from, never from where it lands or
 * how large it is. Two invariants keep that honest:
 *
 * 1. One semantic text source maps to exactly one role wherever it is
 *    rendered, across every view, variant, and key size. The circle renders
 *    `data.label` inside the ring and the gauge renders it under the ring; both
 *    are `heading`. Read "source" wider than `WidgetData`: the dual views take
 *    their key name as a `titleText` prop and their channel names as
 *    `labelText`, and those are sources too.
 * 2. `label` appears only when one key carries several readings at once. A
 *    single-reading view names its reading with `heading` and never uses
 *    `label`.
 *
 * Invariant 1 runs one way only: every `data.label` is a `heading`, but not
 * every `heading` is a `data.label`. Two places already use `heading` for text
 * with no metric behind it. `renderMetricNoticeBody` does it deliberately, for
 * action-owned copy such as `Install helper` that stands in for the key's
 * identity. The title-card caption column does it too, for decorative chrome
 * that `title-card-text-content.ts` derives from the action and its content,
 * which does not identify the key; that one is a known misfit, kept only to
 * avoid unrelated visual churn during this migration. Treat it as legacy, not
 * as precedent. A role picked because the text is big or important is the exact
 * mistake this vocabulary replaced.
 *
 * Sizes overlap across roles and always will: `footnote` renders at 20px in the
 * circle footer while `label` renders at 11.5px in the gauge panel.
 */
export interface RenderTextStyles {
    /** The reading itself, such as `82` or `14.2`. */
    readonly value: RenderTextStyle;
    /** The unit sitting beside a value, such as `%`, `GB`, or `MB/s`. */
    readonly unit: RenderTextStyle;
    /** What the whole key is. Every `data.label` lands here, wherever the view puts it. */
    readonly heading: RenderTextStyle;
    /**
     * Which reading this is, when one key shows several: dense list rows, gauge
     * panel secondary rows, and dual text and title-card channel rows.
     */
    readonly label: RenderTextStyle;
    /**
     * Supplementary text that names neither the key nor a reading: the bar
     * secondary row and the sparkline time axis.
     */
    readonly footnote: RenderTextStyle;
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
//
// Weights below were tuned by eye on hardware, judged in device pixels, which
// are half the logical size on a keypad (144 logical renders on a 72 px key).
// What that tuning found: somewhere around 7 device px, Inter stops reaching
// full white at Regular and wants SemiBold, and above that extra weight only
// closes the counters.
//
// Treat that 7 as where this looked right on the devices at hand, not as a
// threshold anything can be derived from. No probe or screenshot in this repo
// reproduces it; retuning means going back to hardware, and a different panel
// or a different family can move it. It is Inter on a Stream Deck keypad, so it
// applies to this preset only. The other four presets deliberately keep their
// own weights: see the note above each one for what a weight does, and does
// not do, there.
export const DEFAULT_RENDER_TEXT_STYLES = {
    /*
     * Medium is a compromise, not an optimum. `value` spans about 6 device px
     * (a six-row dense list) to 41 (the square text numeral), and the two ends
     * want different weights: the small end wants SemiBold, the large end reads
     * fine at Regular. Medium is the least wrong single answer, chosen for the
     * small end. Do not raise it for the large numeral; nothing there needs it.
     */
    value: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1,
        filter: undefined,
    }),
    unit: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.Bold,
        fontSizeScale: 1,
        filter: undefined,
    }),
    heading: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.SemiBold,
        fontSizeScale: 1,
        filter: undefined,
    }),
    label: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.SemiBold,
        fontSizeScale: 1,
        filter: undefined,
    }),
    footnote: createRenderTextStyle({
        fontFamily: DEFAULT_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.Bold,
        fontSizeScale: 1,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

// Share Tech Mono ships as Regular only and resvg cannot synthesize a heavier
// face, so no weight here changes a glyph it covers. Tuning them is wasted
// effort; the size scales and glow filters are the levers that work.
//
// They are not dead either, which is the trap: weights feed the font-agnostic
// width estimator in svg-utils, so changing one can still move text in or out
// of textLength compression.
//
// So these are chosen to reproduce the estimator ratio this preset had before
// the static-font migration, not to match the default preset. The migration
// replaced raw numbers with closed members, and the old estimator bucketed
// weights as `>= 850 -> 1.03`, `>= 700 -> 1.015`, else `1`. Every value here
// was 700-760, which bucketed to 1.015, which is what Medium gives. That is why
// the migration renders this preset identically to before.
//
// Leave them alone. An edit costs a snapshot churn and buys nothing visible.
export const TERMINAL_CLEAN_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1.02,
        filter: `url(#${TERMINAL_VALUE_GLOW_FILTER_ID})`,
    }),
    unit: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1.04,
        filter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    }),
    heading: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    }),
    label: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    }),
    footnote: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1.08,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

// Same reasoning as terminal-clean above. The two Regular entries are not a
// style choice: unit 680 and footnote 620 fell below the old estimator's 700
// cutoff and bucketed to 1.0, which only Regular reproduces.
export const TERMINAL_VINTAGE_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_VALUE_GLOW_FILTER_ID})`,
    }),
    unit: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Regular,
        fontSizeScale: 1.04,
        filter: `url(#${TERMINAL_SUBTLE_GLOW_FILTER_ID})`,
    }),
    heading: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_LABEL_GLOW_FILTER_ID})`,
    }),
    label: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1,
        filter: `url(#${TERMINAL_LABEL_GLOW_FILTER_ID})`,
    }),
    footnote: createRenderTextStyle({
        fontFamily: TERMINAL_FONT_FAMILY,
        fontWeight: RenderFontWeight.Regular,
        fontSizeScale: 1.08,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

// Initial DotGothic16 metrics from the Slice 2 font-driver spike.
// DotGothic16 ships as Regular only, so no weight here changes its own glyphs;
// a heavier dot-matrix face would mean a different pixel grid, not a thicker
// stroke. As with terminal above, weights still reach the font-agnostic width
// estimator, so these reproduce the pre-migration estimator ratio rather than
// matching the default preset: 900 and 850 bucketed to 1.03 (SemiBold), 800 and
// 750 bucketed to 1.015 (Medium). Leave them alone; tune the baseline shifts,
// width scale, and letter spacing instead.
export const PIXEL_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.SemiBold,
        fontSizeScale: 1,
        baselineShiftEm: 0.02,
        widthScale: 0.9,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
    unit: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1,
        baselineShiftEm: 0.08,
        widthScale: 0.9,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
    heading: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.SemiBold,
        fontSizeScale: 1,
        baselineShiftEm: 0.02,
        widthScale: 0.9,
        letterSpacingEm: 0.1,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
    label: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1,
        baselineShiftEm: 0.02,
        widthScale: 0.9,
        letterSpacingEm: 0.2,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
    footnote: createRenderTextStyle({
        fontFamily: PIXEL_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.Medium,
        fontSizeScale: 1,
        baselineShiftEm: 0.03,
        widthScale: 0.9,
        letterSpacingEm: 0.2,
        clipHorizontalBleedPixels: 2,
        filter: undefined,
    }),
} satisfies RenderTextStyles;

/**
 * Defines the fixed Japanese serif text treatment for title-card metrics.
 *
 * Unlike terminal and pixel, weights here are live on a real machine, and how
 * live depends on the machine. The family is a system stack, so the faces come
 * from `resolveJapaneseSerifPreferredFontFileCandidates`: Windows registers Yu
 * Mincho Light, Regular, and Demibold (300/400/600), Linux registers Noto Serif
 * CJK Regular and Bold, and macOS registers the Hiragino Mincho collections.
 * Only the bundled BIZ UDPMincho fallback is Regular-only.
 *
 * Two consequences. First, the visual tests register bundled fonts only, so
 * every weight here renders through Regular BIZ UDPMincho in a snapshot. Those
 * snapshots still cover layout, family fallback, and clipping; what they cannot
 * cover is which system face a weight selects, so a weight judgement needs a
 * machine with a system Mincho installed. Second, no static table can constrain
 * the weights here the way one can for the bundled single-weight families,
 * because the available set is a runtime property of the user's font folder.
 *
 * Weight matching against Yu Mincho is not intuitive. Measured on Windows with
 * the three Yu Mincho faces registered and family fallback ruled out:
 *
 *     300                -> Light
 *     400, 500, 750, 850 -> Regular
 *     600, 700, 800, 900 -> Demibold
 *
 * It is not monotonic: 750 and 850 land on Regular while 800 between them lands
 * on Demibold. Do not predict this mapping, measure it.
 *
 * That measurement is why the roles below are not all one weight. Before the
 * static-font migration they asked for 900, 800, 900, 850, and 750, which on a
 * Windows device rendered as Demibold, Demibold, Demibold, Regular, Regular.
 * The values below reproduce that: SemiBold selects Demibold, and Regular is
 * what `label` and `footnote` actually rendered as for months, whatever the
 * original 850 and 750 were reaching for. Preserving what devices render beats
 * preserving what the author appears to have intended.
 *
 * This is a Windows and Yu Mincho result. Linux registers Noto Serif CJK
 * Regular and Bold and macOS registers the Hiragino Mincho collections, and
 * neither mapping has been measured, so on those platforms this preset is
 * unverified rather than preserved. Windows is where the metric source runs,
 * which is why it is the one that was checked.
 *
 * These values have never been tuned for appearance against a system Mincho;
 * they are a behaviour-preserving port. Bundling a second face to make them
 * deterministic everywhere would cost about 6 MB, which is why none is bundled.
 */
export const TITLE_CARD_RENDER_TEXT_STYLES = {
    value: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.SemiBold,
        fontSizeScale: 1,
        filter: undefined,
    }),
    unit: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.SemiBold,
        fontSizeScale: 1,
        filter: undefined,
    }),
    heading: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.SemiBold,
        fontSizeScale: 1,
        filter: undefined,
    }),
    // Regular, not SemiBold: 850 and 750 both selected the Regular face, so
    // SemiBold would make these two heavier than any device has rendered them.
    label: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.Regular,
        fontSizeScale: 1,
        filter: undefined,
    }),
    footnote: createRenderTextStyle({
        fontFamily: JAPANESE_SERIF_RENDER_FONT_FAMILY,
        fontWeight: RenderFontWeight.Regular,
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
