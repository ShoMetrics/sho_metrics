/**
 * Closed set of renderable font weights.
 *
 * Values are the SVG numbers themselves, so nothing converts between this
 * vocabulary and the `font-weight` attribute.
 *
 * The set is closed because of Inter: resvg-js 2.6.2 cannot drive a variable
 * font's `wght` axis, so an Inter weight is only visible when its own static
 * face ships. `STATIC_INTER_FONT_FILE_NAME_BY_WEIGHT` pairs every member with
 * that face, and being a `Record` makes a member without a face a type error.
 *
 * That guarantee stops at Inter. Share Tech Mono, DotGothic16, and the bundled
 * BIZ UDPMincho fallback each ship one Regular face, and the terminal, pixel,
 * and title-card presets deliberately ask them for weights that face does not
 * have. This is intentional. resvg renders the only face either way, so the
 * weight changes no glyph there; it is chosen for what it does to the
 * font-agnostic width estimate in `svg-utils.ts`. Read the note above the
 * preset in `render-text-style.ts` before "correcting" one of those values: an
 * edit costs a snapshot churn and a silent layout shift, and buys nothing.
 *
 * ExtraBold 800 and Black 900 are intentionally absent. Each weight costs a
 * bundled static face of about 410 KB, and measured at Stream Deck key sizes
 * neither buys stroke solidity over Bold while both close the counters further.
 * Do not bring a face back without a rendering need that Bold provably cannot
 * meet; "the design calls for heavier" is not such a need.
 */
export const RenderFontWeight = {
    Regular: 400,
    Medium: 500,
    SemiBold: 600,
    Bold: 700,
} as const;

export type RenderFontWeight = typeof RenderFontWeight[keyof typeof RenderFontWeight];

/**
 * The bundled static Inter face that makes each weight visible.
 *
 * Every site that registers Inter with resvg derives its file list from here:
 * production font options, the native weight test, the visual harness, and the
 * rasterization benchmarks. A face only some of them know about is a weight
 * that renders one way in tests and another way on a user's key, and resvg has
 * no error path for a missing face to make that loud.
 *
 * Do not encode meaning in the order. What is established is narrow: resvg
 * selects a face by matching the requested weight against each file's own
 * metadata, and `resvg-inter-font-weights.test.ts` verifies that each member
 * picks a different face at the current registration order. Whether order
 * affects anything else, in fallback or family matching, has not been
 * established here and the resvg-js API makes no promise about it. The pairing
 * is the invariant, which is why this is a `Record` and not an ordered list.
 */
export const STATIC_INTER_FONT_FILE_NAME_BY_WEIGHT: Record<RenderFontWeight, string> = {
    [RenderFontWeight.Regular]: "Inter-Regular.ttf",
    [RenderFontWeight.Medium]: "Inter-Medium.ttf",
    [RenderFontWeight.SemiBold]: "Inter-SemiBold.ttf",
    [RenderFontWeight.Bold]: "Inter-Bold.ttf",
};

/** Every bundled static Inter face, for callers that register them all. */
export const STATIC_INTER_FONT_FILE_NAMES: readonly string[] = Object.values(
    STATIC_INTER_FONT_FILE_NAME_BY_WEIGHT,
);
