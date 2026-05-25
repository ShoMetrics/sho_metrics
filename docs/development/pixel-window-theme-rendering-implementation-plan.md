# Pixel Window Theme Rendering Implementation Plan

## Purpose

This plan defines the rendering work needed before ShoMetrics adds themes with
fonts that differ materially from the current Inter/SF and terminal monospace
families. It is written so a zero-context agent can review the plan or execute
it without relying on prior chat context.

This is not speculative infrastructure for an unapproved theme. The product
direction is that themes may own their typography. The Win98/NSO-inspired visual
direction is only the first pressure test for that requirement; the selectable
theme itself remains a separate product slice.

The selected direction is **font-safe rendering**:

- support theme-owned fonts with predictable value, unit, label, and title
  placement;
- keep current layouts stable while adding new theme typography;
- avoid per-widget, per-font coordinate patches;
- make production-grade visual tests the first implementation step.
- keep title-card on its current Japanese serif typography for this slice,
  while still covering it in visual tests.

This plan does not implement arbitrary user font import. It prepares the
renderer so future theme fonts, and later normal user-provided fonts, do not
require broad primitive rewrites.

## Decisions Already Made

- Implement direction **B: font-safe rendering**, not a one-off pixel-font fix.
- Reject direction **A: only patch the specific pixel font**.
- Build visual tests as production-grade coverage, not a small smoke suite.
- Use the full visual matrix target:

```txt
view case x theme x render surface x data state
```

- Treat user-imported arbitrary font UI, storage, deletion, migration, and
  persistence as out of scope for this plan.
- Future font support only targets normal fonts. It does not promise support for
  extreme fonts whose glyphs are several times larger than a normal UI font.
- Use **DotGothic16** as the primary balanced pixel-font driver for this work.
- Treat **Pixelify Sans** and **PixelMplus10** as secondary comparison/fallback
  candidates, not mandatory production assets.
- Font assets do not have to use OFL/SIL specifically. They must be freely
  usable in this product, have clear redistribution terms, and be sourced from
  an upstream package that includes the applicable license text.
- Do not rely on operating-system pixel fonts as theme fonts.
- Keep broad resvg system font loading disabled.
- Do not use title-card as the first font-safe typography driver. Title-card may
  keep its current Japanese serif font unless a later product slice explicitly
  pixelizes that view.

## Pixel Window Theme Addendum

The font-safe renderer work is the prerequisite for a formal `pixel-window`
theme slice. That slice should not copy the reference game's name, character
assets, icons, or exact Rainmeter layout. It should express the usable visual
idea in ShoMetrics-owned terms:

- a small desktop-window frame around existing widget content;
- a title bar and hard-edged pixel borders;
- flat color fills with no gradients;
- DotGothic16 through `PIXEL_RENDER_TEXT_STYLES`;
- existing widget bodies rendered directly inside a frame-owned client area.

Theme name candidates:

| Candidate | Renderer id | Notes |
| --- | --- | --- |
| Pixel Window | `pixel-window` | Recommended implementation name. Most direct and safest. Describes the frame without tying the theme to a color or external IP. |
| Retro Window | `retro-window` | Stronger desktop-era signal, still generic. |
| Pixel Desktop | `pixel-desktop` | Emphasizes the desktop UI reference; less specific about the window frame. |
| Tiny Window | `tiny-window` | Friendly and compact, but less clearly pixel-themed. |
| Window Pixel | `window-pixel` | Distinct, but less natural as a product name. |

Use **Pixel Window** / `pixel-window` as the implementation name for this plan.
If product naming changes before release, rename the renderer id, visual matrix
case, and snapshots in one final naming pass.

Avoid names that include a color word such as `pastel`, `purple`, or `pink`.
Future theme color customization is expected, so the name should survive palette
changes.

### Future Color Customization Policy

The first product slice does not need to add custom color UI, custom-color
settings/proto fields, import/export behavior, or Property Inspector color
controls. However, the theme implementation must not make future color
customization require a rewrite.

Implementation rules:

- Define the initial colors as theme paint tokens or a narrow default palette,
  not as scattered literals across frame drawing code.
- Keep frame geometry separate from color selection.
- Route colors through the same renderer appearance or paint-resolution layer
  used by existing themes where possible.
- Do not encode the default palette in the theme name, renderer id, snapshot
  axis name, or text style preset name.
- Keep the default palette in one renderer-owned token module and document it as
  the default palette.

Future custom color support should be a settings/PI slice that changes how the
palette is resolved, not a rewrite of the frame renderer.

### Body Viewport Requirement

The pixel-window title bar and border consume pixels that current primitives
expect to own. Do not fix that by editing each primitive. Add a frame-level body
viewport owned by `ThemeStyle`, and let the view frame render the existing widget
body directly at the viewport size.

Do not use arbitrary SVG scale for Pixel Window body content. DotGothic16 is a
pixel font, and non-integer SVG scaling blurs the glyph grid. The client body
should be rendered at its final logical size, then placed into the frame with an
integer translate and a clip path.

Chosen body layout approach:

- Treat the client viewport as the body render surface.
- Render primitives directly at `viewport.width` x `viewport.height`.
- Place the rendered body into the frame with integer `translate(...)`.
- Clip the body to the viewport.
- Do not apply SVG `scale(...)` to the body.
- Do not apply different X/Y scale factors.

This is not stretching or flattening the widget body. Existing primitives receive
a smaller logical canvas and run their normal responsive layout against that
canvas. Circular views should continue to derive circular geometry from
`min(width, height)`; text should be laid out for the viewport instead of being
scaled after raster-style composition.

Rejected alternatives:

- Fractional uniform scale, such as rendering at `144x144` and scaling to
  `128x110`, because it blurs pixel-font glyph grids.
- Integer snap scale, such as `0.5`, because it preserves pixel edges but makes
  small widget text too small.
- Non-uniform `scaleX/scaleY`, because it distorts circles and text.

Expected ownership:

- `contracts/proto/shometrics/v1/settings.proto`: selectable theme enum.
- `packages/hub/src/settings/*`: stored/resolved theme mapping, render
  appearance, paint, text styles, and theme effects.
- `packages/hub/src/property-inspector/*`: theme option and preview coverage.
- `widgets/styles/theme-style.ts`: optional body viewport contract.
- `view-rendering/metric-view-frame.ts`: resolves body render size from the
  theme viewport before rendering primitives.
- `view-rendering/metric-frame.ts`: translates and clips the already-sized body
  into the frame.
- `widgets/styles/*`: the pixel-window frame drawing.
- `view-rendering/pixel-window-theme-tokens.ts`: shared renderer-owned default
  palette tokens used by both paint resolution and frame drawing.
- `tests/visual/*`: full matrix coverage for the new selectable theme.

Expected code size is roughly `500-900 LOC`, excluding generated proto output
and visual snapshots.

Pixel Window is a real selectable theme in this plan. Do not implement it as a
hidden renderer-only preset.

## Font Driver Decision

The implementation must not design the metrics contract without a real font.
The current product priority is:

- text must stay visible inside small pixel-themed widget frames;
- the font should evoke the game's small framed UI, not dialogue text;
- license clarity and redistribution safety are required, but OFL/SIL is not
  the only acceptable license family.

Use these fonts as concrete drivers and references:

- Primary driver: `DotGothic16-Regular.ttf`.
  - License: SIL Open Font License 1.1.
  - Role: primary small-widget pixel UI font and primary Win98/NSO-style
    typography pressure test.
  - Reason: It is the best current balance of legibility and visible pixel
    character in the small widget previews. It is less soft than PixelMplus10
    and less width-hostile than display fonts such as Press Start 2P.
- Secondary comparison driver: `Pixelify Sans`.
  - License: SIL Open Font License 1.1.
  - Role: Latin fallback candidate and second font metrics pressure test, not a
    Slice 5 production asset.
  - Reason: It is a normal OFL pixel-like Latin font with different proportions
    from DotGothic16, useful for proving the helper is not tuned to one font.
- Candidate reference: `PixelMplus10`.
  - License: M+ Font License.
  - Role: license-acceptable pixel UI comparison font and possible fallback
    candidate if later visual review prefers it for a specific role.
  - Reason: The Rainmeter reference uses `PixelMplus10` heavily for settings,
    tooltip, and body-style UI text. It is not the main small Task Manager
    value/title font in the reference, and current visual review finds it less
    pixel-forward than DotGothic16 on the small widget surfaces.
- Reference-only value font: `Press Start 2P`.
  - License: SIL Open Font License 1.1 when sourced from Google Fonts or the
    upstream project.
  - Role: future value-role reference, not a general UI font.
  - Reason: The Rainmeter Task Manager skin uses it for large numeric values.
    It is visually close for numbers, but too wide and display-oriented to be
    the default font for labels, units, or dense small-widget text.

Silkscreen is not the production driver for this plan. It remains a possible
future accent font, but current visual review found several small glyphs too
blurred for the widget surfaces.

Do not use fonts from the Rainmeter reference package as production assets
unless their redistribution license is independently verified and the upstream
source is used. Known examples:

- `zpix` is not acceptable for this plan because its public licensing terms are
  not free for this product's redistribution requirements and include commercial
  product licensing requirements.
- `PixelMplus10` is acceptable as a candidate when sourced from the upstream
  PixelMplus package and distributed with the M+ Font License. It is not blocked
  merely because it is not OFL.
- `DinkieBitmap-7px` is a visual reference only. Its public source describes
  commercial licensing through the author, so do not bundle it unless a product
  license is purchased and recorded.
- `PerfectDOSVGA437` requires further license verification and is not an
  approved driver for this plan.

### System Font Fallback Policy

Do not use platform-default pixel fonts as part of the theme typography chain.

Reasons:

- Windows and macOS do not provide a stable, cross-version default pixel font
  contract.
- Some old Windows pixel-looking fonts are bitmap or legacy raster fonts, not
  normal TTF/OTF assets that resvg can reliably load from `fontFiles`.
- Even when a platform font exists, using it changes snapshots and production
  output by OS version and installed language packs.
- Theme layout metrics must be derived from bundled fonts, not user-machine
  fonts.

System fonts may remain as last-resort glyph fallbacks for scripts or symbols
not covered by bundled fonts, using explicit file-path candidates only. Keep
`loadSystemFonts: false`; do not ask resvg to scan the whole system font
database. The current resolver caches font options, so explicit fallback file
checks are low risk. Broad system font loading is not allowed for this plan
because it weakens deterministic visual tests and can add startup/rendering
work depending on the host font database.

## Current Context

ShoMetrics renders Stream Deck widgets through this path:

```txt
settings/storage/resolver.ts
-> settings/resolved-settings.ts
-> settings/render-appearance-builder.ts
-> view-updates/runner.ts
-> view-rendering/metric-view-frame.ts
-> view-rendering/single-metric-view.ts or dual-metric-view.ts
-> widgets/primitives/*
-> view-rendering/metric-frame.ts
-> view-rendering/rasterizer.ts
-> Stream Deck setImage()
```

Rendering uses `@resvg/resvg-js`; native Stream Deck SVG rendering is not the
runtime contract. This is important because custom fonts and exact visual
snapshots are feasible only because ShoMetrics prerasterizes SVG into PNG.

Current text ownership:

- `view-rendering/render-text-style.ts` defines `RenderTextStyle` and
  `RenderTextStyles`.
- `settings/render-text-style-resolver.ts` selects the active text styles from
  resolved appearance settings.
- `settings/render-appearance-builder.ts` includes `textStyles` in
  `MetricRenderAppearance`.
- `widgets/primitives/*` draw actual SVG text.
- `view-rendering/svg-utils.ts` contains `renderConstrainedSvgText()` and a
  low-cost text width estimator.
- `view-rendering/resvg-font-options.ts` chooses font files for resvg.
- `widgets/primitives/title-card-text-metric.ts` currently uses the Japanese
  serif render font directly. That is a managed exception for this plan: the
  title-card view may keep this typography, but the hardcoded ownership should
  stay explicit and covered by visual tests.

Current `RenderTextStyle` only carries:

```ts
interface RenderTextStyle {
    readonly fontFamily: string;
    readonly fontWeight: number;
    readonly fontSizeScale: number;
    readonly filter: string | undefined;
}
```

This is not enough for fonts with different vertical metrics. Pixel fonts showed
the failure mode clearly: units can clip, labels can sit too close to the top or
bottom, and different widget primitives fail in different ways.

## Problem Statement

Many primitive layouts currently assume the baseline, glyph box, and apparent
height of the current primary fonts. Those assumptions are spread across:

- fixed SVG `x` and `y` coordinates;
- direct `<text>` elements with `dominant-baseline`;
- clip paths whose height is based on a fixed multiplier;
- helper calls that scale font size but do not adjust baseline or line box;
- title-card code that intentionally uses its own Japanese serif font family;
- width estimation tuned for ordinary sans/mono fonts.

Changing only `fontFamily` and `fontSizeScale` cannot reliably preserve layout.
It changes rendered glyph shape without giving the renderer a way to correct
baseline, clip height, or width estimation for that font.

## Why Reject A: Specific Pixel-Font Patch

Direction A means adding only the pixel font needed for the Win98/NSO-inspired
theme and patching whichever primitives visually break.

Expected code size: roughly 150-350 LOC.

Reasons to reject it:

- It creates scattered font-specific offsets inside primitives.
- It makes future fonts repeat the same failure cycle.
- It does not establish a stable place for theme typography behavior.
- It risks changing current layout because shared primitive coordinates become
  the fix surface.
- It hides whether a coordinate is real layout or a font workaround.
- It makes visual tests reactive. Tests only catch the next broken font after a
  user sees it or a developer happens to notice.

Direction A is acceptable only if the pixel font is the last non-current font the
product will ever support. That is not the expected product direction.

## Why Choose B: Font-Safe Rendering

Direction B adds a renderer-owned typography metrics layer and routes widget
text through shared helpers. New theme fonts should usually require only:

- a font asset;
- a font resolver entry;
- a `RenderTextStyles` metrics preset;
- visual snapshots for the new theme.

Expected code size: roughly 350-800 LOC before visual snapshots. The visual
matrix itself will add more test fixture and snapshot volume.

Reasons to choose it:

- It contains font-specific behavior in rendering tokens.
- It keeps primitive geometry meaningful.
- It makes current default typography a protected baseline.
- It reduces the risk that future themes move existing layouts.
- It supports the later user-font path without implementing user font import
  now.

## Scope

In scope:

- Extend renderer-facing text style tokens with font metrics.
- Add shared text layout helpers for baseline, clip height, and width fitting.
- Migrate high-risk text drawing call sites to the shared helpers.
- Add theme-owned font metrics presets.
- Add bundled theme font resolver support for DotGothic16 and any selected
  secondary fallback fonts once their asset locations are part of the
  implementation.
- Add production-grade visual coverage for the full current render matrix.
- Prove existing layouts are stable before and after the refactor.
- Keep title-card's current Japanese serif typography stable and visually
  covered.

Out of scope:

- User font import UI.
- User font file persistence.
- Settings/proto fields for user-selected font files.
- Property Inspector font management.
- Profile export/import for custom fonts.
- Handling extreme decorative fonts with abnormal glyph dimensions.
- Replacing string-based SVG primitives with a typed SVG scene graph.
- Adding the Win98/NSO-inspired theme itself, unless done as a separate product
  slice after this prerequisite work.
- Broad system font scanning or platform font selection as theme typography.
- Pixelizing title-card typography.
- Adding title-card-specific flags or fields to the generic text metrics
  contract.

## Boundary Rules

Rendering owns font metrics.

Allowed owners:

- `view-rendering/render-text-style.ts`: text style and metrics contracts.
- `settings/render-text-style-resolver.ts`: map resolved theme intent to render
  text styles.
- `settings/render-appearance-builder.ts`: include render text styles in
  `MetricRenderAppearance`.
- `view-rendering/svg-utils.ts`: shared text layout and fitting helpers.
- `view-rendering/resvg-font-options.ts`: resvg font file resolution.
- `widgets/primitives/*`: consume already-resolved render text styles.
- `tests/visual/*`: matrix coverage and PNG snapshots.

Disallowed for this plan:

- Do not add generated settings/proto fields.
- Do not add Property Inspector UI.
- Do not import generated storage schema into renderers.
- Do not mutate action view builders to solve font layout.
- Do not add per-widget font knobs to settings.
- Do not persist renderer-facing metrics.
- Do not add compatibility paths or manual parser layers.

If a change requires settings/proto or PI UI, stop and split that into a separate
product decision.

## Target Text Metrics Contract

Add font metrics to the renderer-facing text style only after the DotGothic16
single-primitive spike proves which fields are actually needed. Exact names can
be adjusted during implementation, but the final contract is expected to express
these concepts:

```ts
export interface RenderTextStyle {
    readonly fontFamily: string;
    readonly fontWeight: number;
    readonly fontSizeScale: number;
    readonly baselineShiftEm: number;
    readonly clipHeightEm: number;
    readonly widthScale: number;
    readonly minimumFontScale: number;
    readonly filter: string | undefined;
}
```

Field semantics:

- `fontSizeScale`: scales the primitive-authored font size.
- `baselineShiftEm`: moves the text baseline by a font-relative amount after
  font size is resolved. Positive values move the final SVG `y` coordinate
  downward. Implement this by calculating the final SVG `y` coordinate, not by
  relying on SVG `baseline-shift`. This is a per-role correction calibrated
  against the current renderer's visual/bbox-center anchor; it is not a
  per-string cap-height or glyph-shape layout engine.
- `clipHeightEm`: controls the vertical clip box height for text that uses the
  shared constrained-text helper.
- `widthScale`: adjusts the low-cost width estimator for wider or narrower font
  families. It multiplies the raw estimated text width before the width guard
  is applied:
  `guardedWidth = rawEstimatedWidth * widthScale * widthGuardRatio`.
  When tuning a measured font width ratio, set `widthScale` to that ratio and
  do not pre-divide it by the guard ratio.
- `minimumFontScale`: sets the default lower bound for font shrinking before
  `textLength` compression is used. A primitive may pass a layout-specific
  minimum when the available text box is intentionally tighter than the role
  default. Keep `widthScale` font-owned; do not use per-call `widthScale`
  overrides as font workarounds.
- `filter`: keeps existing theme glow/filter behavior.

Neutral defaults must preserve the current layout. The values below are
illustrative placeholders only:

```ts
baselineShiftEm: 0
clipHeightEm: <measured current helper clip height>
widthScale: 1
minimumFontScale: <measured current helper minimum scale>
```

Do not copy the illustrative placeholders into code. Before accepting neutral
defaults, measure the current helper behavior with `@resvg/resvg-js#getBBox()`
or the existing helper behavior and record the source in the implementation
note:

- current resolved font size from `fontSizeScale`;
- current clip-box height multiplier used by constrained text;
- current minimum shrink behavior before `textLength` compression;
- current width-estimator output for representative strings.

Neutral metrics must reproduce those measured values. The first metrics commit
should produce no intentional visual changes.

Neutral `widthScale` is `1`. That default relies on the current width guard
ratio of `1.08`; do not lower the guard ratio without remeasuring current and
pixel-font strings.

`getBBox()` is allowed for spike and test measurement only. It should not run in
the hot widget render path because it requires constructing a `Resvg` instance
and repeats SVG parse/layout/font shaping work before the real render.

`widthScale` is intentionally a coarse estimate. It works best for monospace,
pixel, and broadly regular UI fonts. It is not a precise model for proportional
fonts whose relative width changes by character mix. SVG `textLength` remains
the final fit guard.

If later primitive measurements show `requiredClipHeightEm > 1.30` for any
normal role, treat that as a review trigger for `clipHeightEm` rather than
waiting for visible clipping in snapshots.

## Shared Text Layout Helpers

Extend `view-rendering/svg-utils.ts` or add a tightly owned
`view-rendering/render-text-layout.ts` helper. The helper must centralize:

- resolved font size;
- baseline shift;
- clip height;
- text width estimation;
- font-specific width scale;
- `textLength` and `lengthAdjust` fit attributes;
- SVG escaping;
- clip-path id sanitization.

Preferred shape:

```ts
renderStyledSvgText({
    id,
    text,
    xCoordinate,
    yCoordinate,
    maxWidth,
    baseFontSize,
    fill,
    textStyle,
    textAnchor,
    dominantBaseline,
})
```

The helper should call existing lower-level utilities where possible. Do not
duplicate SVG escaping or id sanitization logic.

For multi-run text, such as value plus unit rows, either:

- extend the existing row helper to consume `RenderTextStyle`, or
- add a multi-run helper that shares the same width estimator and baseline
  logic.

Do not add native text measurement in the hot path. The current design relies on
a deterministic low-cost estimator plus SVG fit guards because resvg rendering
already occurs on every widget render.

## Primitive Migration Targets

Migrate text drawing in these areas:

- `widgets/primitives/progress-circle.ts`
  - large value
  - unit
  - label
  - gauge labels
- `widgets/primitives/dual-channel-progress-circle.ts`
  - dual values
  - dual units
  - gauge row labels
  - center labels
- `widgets/primitives/text-metric.ts`
  - centered single text
  - centered dual text
  - unit text
- `widgets/primitives/progress-bar.ts`
  - title
  - value
  - unit
  - secondary/channel labels
- `widgets/primitives/sparkline.ts`
  - title
  - current value
  - unit
  - small labels
- `widgets/primitives/mirrored-traffic.ts`
  - top channel labels
- `widgets/primitives/title-card-text-metric.ts`
  - no pixel-font migration in this plan
  - keep current Japanese serif typography stable
  - keep title-card covered by visual matrix cases

Title-card currently uses `JAPANESE_SERIF_RENDER_FONT_FAMILY` directly in many
text elements. For this plan, that is acceptable because title-card is not the
font-safe driver and remains a strongly styled view. This is an intentional
scope decision, not an accidental missed migration: title-card keeps its current
Japanese serif typography until a separate product decision changes that view's
identity. Do not add title-card-specific fields to the generic `RenderTextStyle`
contract. If the direct usages are touched for nearby work, keep the font choice
renderer-owned and explicit, but do not force title-card into the pixel theme
font chain.

## Visual Test Standard

Visual tests are the first implementation phase. Do not refactor text layout
before baseline coverage exists.

Visual tests must render deterministic SVG through the production renderer and
compare PNG snapshots through Playwright. Current command policy stays in place:

```powershell
cd packages\hub
npm.cmd run test:visual
npm.cmd run test:visual:update
```

Visual tests remain opt-in during ordinary development, but this work must use
them as the primary regression gate.

### Full Matrix Axes

The target matrix is:

```txt
view case x theme x render surface x data state
```

View case axis:

- single circle full-ring
- single circle minimal
- single circle gauge
- single centered text
- single title-card text
- single progress bar
- single sparkline
- dual circle full-ring
- dual circle minimal
- dual circle gauge
- dual centered text
- dual title-card text
- dual sparkline overlay
- dual sparkline mirrored
- multi-channel progress bar data path

This axis is intentionally named `view case`, not `primitive`. Some cases are
variants of the same primitive file, such as full-ring, minimal, and gauge
variants in `progress-circle.ts`. Some cases are data shapes through the same
primitive, such as the multi-channel progress bar path. The manifest should be
grouped by render shape and behavior, not only by primitive file name.

Theme axis:

- flat
- cupertino-glass
- color-filled
- terminal clean
- terminal vintage

When a pixel-font theme is added later, it must join the same matrix instead of
getting a smaller special-case suite.

Render surface axis:

- keypad square render path
- touch-strip wide render path
- touch-strip square render path for views that use the square touch-strip
  layout

The render surface axis is production-valid, not a blind Cartesian product.
Circle views use the touch-strip square render path because production renders
them as a 144x144 layout downsampled to a 100x100 PNG. Non-circle views use the
touch-strip wide render path because production renders them as 200x100. The
visual matrix must not generate 100x100 logical-layout cases; those are not a
production surface and can create severe false layout failures.

Data state axis:

- data present
- no-data placeholder

Use representative fixture values that stress text layout:

- `%`
- `deg C` or the current render-normalized degree unit
- `MB/s`
- compact data-rate units
- single digit values
- two digit values containing `9`
- three digit values
- `N/A`
- dual-channel labels such as `UP`, `DN`, `RD`, `WR`

### Matrix Implementation Requirements

Implement the visual matrix with a manifest, not ad hoc copied test cases.
Matrix cases must render through the production frame boundary
`composeMetricViewFrame()` so render target, effective circle variant,
touch-strip layout, render size, PNG size, no-data handling, and theme paint
lowering come from production code. Test support may still use lower-level
primitive helpers for primitive-specific smoke tests, but those lower-level
helpers are not the production visual matrix authority.

Recommended files:

- `tests/visual/widget-visual-matrix.ts`
- `tests/visual/widget-visual-matrix.visual.spec.ts`
- `tests/visual/widget-visual-test-support.ts`

The manifest must make coverage auditable in code:

```ts
interface WidgetVisualMatrixCase {
    readonly snapshotName: string;
    readonly viewCase: ...;
    readonly themeCase: ...;
    readonly surfaceCase: ...;
    readonly dataCase: ...;
}
```

Add a unit or visual support test that fails if a required production-valid
theme, view case, render surface, or data state is missing from the manifest.
Do not rely only on the number of generated snapshots. Invalid surface
combinations must be excluded by manifest rules, not silently skipped in the
test loop.

Snapshot names must encode all matrix axes, for example:

```txt
flat-key-data-single-circle-full-ring.png
terminal-vintage-touch-strip-wide-no-data-dual-sparkline-mirrored.png
```

The matrix can be split into multiple spec files for review size, but the
coverage rules must still be centralized.

The full matrix may produce several hundred snapshots. That volume is accepted
for this plan. The implementation must make review tractable rather than
reducing the target silently:

- split matrix specs by stable axes, such as surface or view family;
- keep a central manifest so coverage is still auditable;
- support explicit manifest exclusions for combinations that cannot render,
  with a reason string in code;
- run a small deterministic sample repeatedly before expanding the matrix;
- start with the existing snapshot comparison tolerance;
- introduce any non-zero pixel-diff tolerance only after repeated-run evidence
  proves nondeterminism and the tolerance is documented in test support code.

### Visual Review Rules

- Generate baseline snapshots before text metrics refactoring.
- Review all newly generated snapshots before accepting them.
- During the refactor, default-theme snapshots should not change unless a
  change is explicitly documented and reviewed.
- Pixel-font or future-font snapshots may differ because they intentionally use
  different text metrics.
- Do not run `npm.cmd run test:visual:update` as a blind fix.

## Implementation Steps

This plan is optimized for fast local implementation. The steps below are
logical work slices, not a requirement to create one PR per step. A single local
branch can carry several slices when diffs remain reviewable.

Expected TypeScript and test-support code size, excluding generated snapshots
and font assets:

- Slice 1: inventory plus visual matrix support: roughly 250-450 LOC.
- Slice 2: font-driver spike and measurement note: roughly 80-180 LOC, all under
  tests.
- Slice 3: metrics contract plus shared helper: roughly 250-450 LOC.
- Slice 4: primitive migrations, excluding title-card pixelization: roughly
  220-480 LOC.
- Slice 5: bundled font resolver entries and pixel text preset: roughly
  80-180 LOC.

The total expected TypeScript change is roughly 800-1,700 LOC, plus visual
snapshots and font assets. If a slice grows well past its range, stop and
re-check whether the change is mixing unrelated cleanup into the renderer
contract work.

### Step 1: Inventory Current Text Call Sites

Search:

```powershell
rg -n "fontFamily|font-size|dominant-baseline|clipHeight|renderConstrainedSvgText|resolveRenderTextStyleFontSize" packages/hub/src/widgets packages/hub/src/view-rendering
```

Record the high-risk text call sites in the implementation note or a follow-up
note. High-risk means the call site has a fixed `y`, fixed clip height, manual
`<text>`, or direct font family.

Expected result:

- No code changes required except optional notes.
- The implementer knows which primitive files must migrate.

### Step 2: Add Production Visual Matrix

Build the full matrix described above before changing typography behavior.

Required checks:

```powershell
cd packages\hub
npm.cmd run test:visual
```

If snapshots are missing because this is the first run:

```powershell
npm.cmd run test:visual:update
```

Then review generated PNGs before continuing.

Completion criteria:

- The full matrix exists.
- Snapshot names encode every matrix axis.
- A coverage guard fails when a matrix axis value is omitted.
- Current visual snapshots pass.

### Step 3: Prove The Font Driver On One Primitive

Before adding a shared metrics contract, load DotGothic16 and Pixelify Sans in a
temporary or tightly scoped preview/test path and validate one high-risk
primitive end to end.

The spike artifact must live under `packages/hub/tests/visual/` or another
test-only directory. It must not be imported by production renderer code, and it
must not create a second authoritative preview path. Before Step 7 is complete,
delete the spike files or convert them into formal manifest-driven visual matrix
cases.

Use `text-metric.ts` or `progress-circle.ts` as the first primitive. Do not use
title-card as the first driver. The spike must answer:

- whether baseline movement is needed;
- whether clip height needs a font-specific value;
- whether width estimation needs a font-specific scale;
- whether `minimumFontScale` needs to be theme-owned;
- whether DotGothic16 plus Pixelify Sans covers the expected static text and
  metric units.

Do not leave temporary preview plumbing in production code. The output of this
step is the minimal metrics field set and initial DotGothic16/Pixelify Sans
metrics values.

Completion criteria:

- The chosen primitive renders current default fonts without movement.
- The same primitive renders DotGothic16 without clipping in representative
  values and units.
- The implementation note records which metrics fields were proven necessary.
- The spike records the measured neutral defaults that Step 4 must use.

### Step 4: Add Neutral Metrics Fields

Extend `RenderTextStyle` with font metrics fields and update all existing
style constants with neutral values. Use the measurements recorded in Step 3 as
the neutral defaults. Do not copy the illustrative placeholders from the Target
Text Metrics Contract section.

Required default behavior:

- `DEFAULT_RENDER_TEXT_STYLES` renders the same as before.
- `TERMINAL_CLEAN_RENDER_TEXT_STYLES` renders the same as before unless a
  reviewed terminal-specific adjustment is intentionally made later.
- `TERMINAL_VINTAGE_RENDER_TEXT_STYLES` renders the same as before unless a
  reviewed terminal-specific adjustment is intentionally made later.

Required checks:

```powershell
cd packages\hub
npm.cmd run test:unit
npm.cmd run test:visual
npm.cmd run build
```

Completion criteria:

- TypeScript compiles.
- Unit tests pass.
- Visual snapshots show no intentional default layout movement.

### Step 5: Add Shared Styled Text Helper

Add or extend a helper that consumes `RenderTextStyle` directly.

The helper must:

- apply `fontSizeScale`;
- apply `baselineShiftEm`;
- use `clipHeightEm`;
- apply `widthScale` to the estimator;
- apply `minimumFontScale` to fit options;
- preserve existing escaping and id sanitization behavior;
- allow current callers to keep existing geometry inputs.

Do not migrate every primitive in the same edit unless the visual diffs remain
small and reviewable.

Required unit tests:

- neutral metrics produce the same font size, clip height, and baseline as the
  current helper;
- positive and negative `baselineShiftEm` move text in opposite directions;
- `clipHeightEm` changes clip height without changing font size;
- `widthScale` changes fit decisions;
- `minimumFontScale` is clamped to safe bounds.
- The legacy absolute `clipHeight` option remains only for existing title-card
  callers that are outside this migration. Do not add new callers. Delete the
  absolute option once all remaining callers can use `clipHeightEm`.

### Step 6: Migrate Primitive Text In Small Groups

Migrate primitives group by group:

1. `text-metric.ts`
2. `progress-circle.ts`
3. `dual-channel-progress-circle.ts`
4. `progress-bar.ts`
5. `sparkline.ts`
6. `mirrored-traffic.ts`

After each group:

```powershell
cd packages\hub
npm.cmd run test:unit
npm.cmd run test:visual
```

Completion criteria for each group:

- Existing default snapshots do not move unexpectedly.
- Any intended visual change is documented in the implementation note.
- Primitive code no longer has unmanaged font assumptions for migrated text.

### Step 7: Add Theme-Owned Pixel Font Metrics

Only after the neutral migration is stable, add the DotGothic16 primary preset
needed by the future pixel theme.

Secondary fonts are optional product choices, not automatic bundle additions.
`Pixelify Sans`, `PixelMplus10`, and `Press Start 2P` may be used as comparison
or role-specific candidates, but do not ship them merely because they were used
for measurement. When adding any font asset, record its upstream source,
license, and file size in the implementation note.

This step may include:

- bundled DotGothic16 font assets;
- selected secondary font assets, only when a product decision chooses them;
- font resolver entries in `resvg-font-options.ts`;
- a `PIXEL_RENDER_TEXT_STYLES` preset;
- visual snapshots for the pixel theme or temporary preview harness.

This step must not:

- change default font metrics;
- add settings/proto fields unless implementing a real selectable theme in a
  separate product slice;
- patch primitive coordinates specifically for the pixel font.
- enable broad system font loading.

If the pixel font still clips after metrics tuning, adjust the metrics preset or
shared helper. Do not add local `if pixel font` branches to primitives.

Required pixel-font verification:

- Render `metric-text-row` with the pixel preset and non-zero
  `baselineShiftEm` values. Verify the unit `tspan` is not clipped. If it clips,
  revisit row clip-centering strategy at that point instead of adding
  primitive-local pixel-font patches.

### Step 8: Document Future User Font Path

Add a short note to the final implementation note or docs stating that later
user font support can reuse this layer but still needs separate product work:

- UI;
- settings/proto;
- storage;
- font file validation;
- import/export policy;
- error handling for missing or corrupt fonts.

Do not implement those items in this plan.

### Step 9: Add Selectable Pixel Window Theme

This is the next implementation step. Pixel Window is a real product theme, not
a hidden renderer preset.

Use:

```txt
product name: Pixel Window
settings theme id: pixel-window
renderer preset id: pixel-window
```

Do not add custom color UI in this step. The first Pixel Window slice ships with
a centralized default palette. Future custom color support should add
theme-owned settings and PI controls without rewriting the frame renderer.

Do not change action view builders. The theme must flow through settings,
resolved appearance, renderer appearance, and frame style contracts.

#### Step 9.1: Add The Stored Theme Enum

Edit:

```txt
contracts/proto/shometrics/v1/settings.proto
```

Add one enum value:

```proto
enum MetricTheme {
  METRIC_THEME_UNSPECIFIED = 0;
  METRIC_THEME_FLAT = 1;
  METRIC_THEME_CUPERTINO_GLASS = 2;
  METRIC_THEME_COLOR_FILLED = 3;
  METRIC_THEME_TERMINAL = 4;
  METRIC_THEME_PIXEL_WINDOW = 5;
}
```

Do not add an empty `PixelWindowThemeSettings` message in this slice. Empty
stored messages create schema surface without persisted user intent. A later
custom color slice can add a `pixel_window` field to `AppearanceThemeSettings`
with a new field number and migrate no existing data.

Run after the proto edit:

```powershell
cd packages\hub
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run generate:proto
```

Expected code size: `1-5 LOC` in proto, plus generated output.

#### Step 9.2: Update Stored And Resolved Settings

Edit:

```txt
packages/hub/src/settings/resolved-settings.ts
packages/hub/src/settings/storage/enum-maps.ts
packages/hub/src/settings/storage/resolver.ts
packages/hub/src/settings/storage/resolver.test.ts
packages/hub/src/settings/storage/widget-settings-patch.ts
packages/hub/src/settings/storage/widget-settings-patch.test.ts
packages/hub/src/settings/storage/global-settings-patch.ts
packages/hub/src/settings/storage/global-settings-patch.test.ts
packages/hub/src/settings/appearance-overrides.ts
```

Required changes:

- Add `"pixel-window"` to the `MetricTheme` union.
- Add both stored/resolved enum mappings:
  - `StoredMetricTheme.PIXEL_WINDOW -> "pixel-window"`
  - `"pixel-window" -> StoredMetricTheme.PIXEL_WINDOW`
- Add `"pixel-window"` to all exhaustive `selectedTheme` switches.
- Keep `DEFAULT_APPEARANCE_SETTINGS.theme.selectedTheme` as `"flat"`.
- Do not add resolved `pixelWindow` settings until real pixel-window settings
  exist.

Paint behavior for this slice:

- Pixel Window uses a theme-owned default palette.
- Global metric paint overrides should not mutate Pixel Window until a future
  Pixel Window color settings slice exists.
- In `appearance-overrides.ts`, functions that build metric paint overrides
  should return no pixel-window paint patch unless a future pixel-window paint
  contract exists.

Required tests:

- Resolver reads `METRIC_THEME_PIXEL_WINDOW` as `"pixel-window"`.
- Widget patch writes `"pixel-window"` as `StoredMetricTheme.PIXEL_WINDOW`.
- Global theme override writes `"pixel-window"` as
  `StoredMetricTheme.PIXEL_WINDOW`.
- Existing theme resolver tests still pass.

Expected code size: `80-180 LOC`.

#### Step 9.3: Update Render Appearance Resolution

Edit:

```txt
packages/hub/src/widgets/widget-contract.ts
packages/hub/src/settings/render-appearance-builder.ts
packages/hub/src/settings/render-appearance-builder.test.ts
packages/hub/src/settings/render-text-style-resolver.ts
packages/hub/src/settings/render-theme-effects-resolver.ts
packages/hub/src/settings/render-paint-resolver.ts
```

Required changes:

- Add `"pixel-window"` to `ThemePresetName`.
- Map `selectedTheme: "pixel-window"` to `themePreset: "pixel-window"`.
- Resolve `PIXEL_RENDER_TEXT_STYLES` for `selectedTheme: "pixel-window"`.
- Resolve default/no-op theme effects for Pixel Window unless the frame style
  introduces a real renderer-owned effect.
- Add `pixel-window` branches to every exhaustive paint switch.

Paint behavior:

- `buildColorConfigFromAppearance()` should return a Pixel Window body accent
  config from a centralized renderer-owned default palette.
- Put that palette in a renderer-owned token module, not in settings and not in
  the style implementation:

```txt
packages/hub/src/view-rendering/pixel-window-theme-tokens.ts
```

- Export a narrow constant such as `DEFAULT_PIXEL_WINDOW_PALETTE` from that
  module. Both `render-paint-resolver.ts` and `widgets/styles/pixel-window.ts`
  may import it. This keeps one palette source without making settings depend on
  widget style implementation.
- `resolveActiveMetricAccentPaint()` should return `undefined` for Pixel Window
  so existing ordinary metric color controls are not shown for this theme.
- `resolveActiveColorFilledPaint()` and `resolveActiveTerminalPaint()` remain
  specific to their current themes.
- `activePaintColorMode()` should return `"solid"` for Pixel Window until a
  future custom color slice exists.

Required tests:

- `buildMetricRenderAppearance()` maps Pixel Window to `themePreset:
  "pixel-window"`.
- Pixel Window uses `PIXEL_RENDER_TEXT_STYLES`.
- Pixel Window uses the intended no-gradient paint behavior.
- Existing terminal/flat/color-filled/cupertino render appearance tests still
  pass.

Expected code size: `100-220 LOC`.

#### Step 9.4: Add Theme Frame Viewport Support

Implement Step 9.4 and Step 9.5 in the same code slice. Step 9.4 adds the
generic frame contract; Step 9.5 adds the first real style that exercises it.
Positive viewport tests belong with Step 9.5 after `pixelWindowStyle` exists.

Edit:

```txt
packages/hub/src/widgets/styles/theme-style.ts
packages/hub/src/view-rendering/metric-view-frame.ts
packages/hub/src/view-rendering/metric-frame.ts
packages/hub/src/view-rendering/metric-frame.test.ts
```

Add a renderer-owned body viewport type:

```ts
export interface ThemeBodyViewport {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly height: number;
    readonly clipRadius?: number;
}
```

Add an optional method to `ThemeStyle`:

```ts
resolveBodyViewport?(keySize: KeySize, paints: ThemeStylePaints): ThemeBodyViewport;
```

Contract:

- Existing themes may omit the method.
- Coordinates are in the same SVG logical coordinate system as `keySize`.
- The viewport describes the client area available to widget body content after
  the frame/title bar is drawn.
- The viewport owns geometry only. It must not carry colors, fonts, theme names,
  or primitive-specific layout instructions.
- `paints` is included only for signature consistency with other `ThemeStyle`
  methods. Pixel Window should not use `paints` to change viewport geometry in
  this slice.

Update `metric-view-frame.ts` and `metric-frame.ts` so themes with a body
viewport render the body at the viewport size, then translate and clip it into
the frame. Do not render at `144x144` and apply a fractional SVG scale. The
viewport size is a new logical render surface for primitives, not a post-render
image scale.

Required data flow:

1. Resolve `themePreset`, `paints`, and frame `renderSize` in
   `buildMetricViewRenderPlan()`.
2. Resolve the active theme's `bodyViewport` before rendering the primitive
   body.
3. Use the viewport dimensions as the body render size when a viewport exists:

   ```ts
   const bodyRenderSize = bodyViewport == null
       ? renderSize
       : {
           width: bodyViewport.width,
           height: bodyViewport.height,
       };
   ```

   Pass `bodyRenderSize` to `renderSingleMetricBodyView()` or
   `renderDualMetricBodyView()`.
4. Keep `renderSize` as the outer SVG/frame size passed to `renderMetricFrame()`.
5. Pass `bodyViewport` to `renderMetricFrame()`.

The body placement wrapper should be a pure integer translate plus clip:

```txt
translateX = viewport.xCoordinate
translateY = viewport.yCoordinate
```

```svg
<g clip-path="url(#...)">
  <g transform="translate(...)">...</g>
</g>
```

All viewport geometry should resolve to integer values. If any calculation
produces a fractional result, round before it becomes `ThemeBodyViewport`.

The viewport clip path belongs in `<defs>`. Keep the id deterministic and
derived from the theme preset and viewport size, for example:

```txt
pixel-window-body-viewport-${viewport.width}-${viewport.height}
```

Muted/no-data behavior must remain body-local. If a body is both muted and
viewport-placed, the muted filter should still wrap the body content inside the
viewport translation path.

Required tests:

- Existing flat frame output has no body viewport transform.
- Existing muted flat frame output still wraps the body in the muted filter.
- Existing non-Pixel Window view-frame tests keep using the full outer render
  size for primitive body rendering.

Expected code size: `130-240 LOC`.

#### Step 9.5: Add The Pixel Window Theme Style

Add:

```txt
packages/hub/src/view-rendering/pixel-window-theme-tokens.ts
packages/hub/src/widgets/styles/pixel-window.ts
```

Edit:

```txt
packages/hub/src/view-rendering/metric-frame.ts
```

Add `pixelWindowStyle` to `resolveThemePreset()`.

The style must:

- export `pixelWindowStyle`;
- set `styleId: "pixel-window"`;
- draw the outer frame and title bar in `renderBackground()`;
- return the body client area from `resolveBodyViewport()`;
- keep `renderDefs()` and `renderOverlay()` minimal unless the visual needs a
  real effect;
- use `DEFAULT_PIXEL_WINDOW_PALETTE` from
  `view-rendering/pixel-window-theme-tokens.ts`;
- use flat colors and hard edges; no gradients.

Default palette rules:

- The first implementation may use a pastel-like default palette.
- Do not put color words in names.
- Keep colors in `view-rendering/pixel-window-theme-tokens.ts`, for example:

```ts
export const DEFAULT_PIXEL_WINDOW_PALETTE = {
    outerBorder: "...",
    innerBorder: "...",
    titleBar: "...",
    titleText: "...",
    clientBackground: "...",
    controlButton: "...",
    bodyAccent: "...",
} as const;
```

- Do not scatter color literals throughout drawing functions.
- Do not duplicate palette values in `render-paint-resolver.ts`.
- Do not add settings support for custom colors in this step.

Suggested geometry for `144x144` keypad renders:

```txt
outer margin: 4
border thickness: 2
title bar height: 18
client padding: 4
client viewport x: 8
client viewport y: 26
client viewport width: 128
client viewport height: 110
clip radius: 0 or 2
```

For non-square touch-strip sizes, derive values from dimensions but keep them
bounded:

```txt
outer margin: clamp(round(min(width, height) * 0.03), 3, 6)
border thickness: 2
title bar height: clamp(round(height * 0.13), 14, 20)
client padding: 4
```

Expected body viewport examples:

```txt
144x144 key: body render size 128x110, placed at x=8, y=26, no scale
200x100 touch strip: body render size about 184x78, placed at integer x/y, no scale
```

If a viewport makes a specific visual case too cramped, tune the Pixel Window
viewport geometry or the primitive's existing responsive layout. Do not solve it
by adding a Pixel Window-only body scale.

Use a local clamp helper if needed. Do not create a shared utility for this
single theme.

The title bar may render a generic text label. Use a ShoMetrics-owned label such
as `ShoMetrics` or `Monitor`; do not use copied reference labels. Keep the text
small enough to fit `144x144`.

Required tests:

- Pixel Window frame output contains the body viewport clip path.
- Pixel Window frame output contains a deterministic translate transform with no
  `scale(...)`.
- Muted Pixel Window output still contains both viewport clipping and muted
  filtering.
- A view-frame test proves Pixel Window passes the viewport size as the body
  render size while keeping the outer frame render size unchanged.

Expected code size: `120-260 LOC`.

#### Step 9.6: Update Property Inspector

Edit:

```txt
packages/hub/src/property-inspector/panels/setting-options.ts
packages/hub/src/property-inspector/previews/metric-option-preview.ts
packages/hub/src/property-inspector/previews/metric-view-preview.test.ts
packages/hub/src/property-inspector/panels/AppearanceSettings.tsx
packages/hub/src/property-inspector/panels/GlobalSettingsTab.tsx
packages/hub/src/property-inspector/panels/ColorSettings.tsx
packages/hub/src/property-inspector/panels/WidgetSettingsTab.test.tsx
packages/hub/src/property-inspector/panels/GlobalSettingsTab.test.tsx
```

Required changes:

- Add `{ value: "pixel-window", label: "Pixel Window" }` to
  `themeOptionList`.
- Ensure theme previews can render Pixel Window.
- Do not show terminal variant controls for Pixel Window.
- Do not show ordinary metric color controls for Pixel Window in this slice.
- Do not add Pixel Window custom color controls yet.
- Update tests that enumerate all themes.

Expected code size: `80-180 LOC`.

#### Step 9.7: Add Visual Matrix Coverage

Edit:

```txt
packages/hub/tests/visual/widget-visual-matrix.ts
packages/hub/tests/visual/widget-visual-matrix.visual.spec.ts
```

Add `pixel-window` to:

- `VisualMatrixThemeCaseId`;
- `VISUAL_MATRIX_THEME_CASES`;
- `THEME_CASE_DEFINITIONS`.

The theme case should use real resolved product settings:

```ts
{
    themeCase: "pixel-window",
    appearanceTheme: {
        selectedTheme: "pixel-window",
    },
}
```

Snapshot names must include `pixel-window`.

Expected matrix growth:

```txt
15 view cases x 1 new theme x 2 production-valid surfaces x 2 data states
= 60 new snapshots
```

Acceptance criteria:

- Pixel Window participates in the same matrix as all existing themes.
- Keypad square, touch-strip wide, touch-strip square, data, and no-data states
  are covered.
- No ad hoc Pixel Window-only visual harness replaces matrix coverage.

Expected code size: `10-40 LOC`, excluding snapshots.

#### Step 9.8: Verify

Run:

```powershell
cd packages\hub
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run test:unit
npm.cmd run build
npm.cmd run test:pi
npm.cmd run test:visual
```

If new snapshots are expected:

```powershell
npm.cmd run test:visual:update
```

Review all generated `pixel-window-*` snapshots before accepting them. Do not
update unrelated existing snapshots unless the diff is intentionally caused by
this theme work and documented.

Because Pixel Window gives primitives a smaller body render surface, Step 9.8
must specifically review whether any primitive has a hidden square or minimum
height assumption that fails at viewport sizes such as `128x110`. If that
happens, fix the primitive's existing responsive layout or tune Pixel Window
viewport geometry. Do not reintroduce body scaling as the workaround.

#### Step 9 Completion Criteria

Step 9 is complete when:

- `METRIC_THEME_PIXEL_WINDOW` exists in stored settings.
- `"pixel-window"` exists in resolved settings.
- Pixel Window is selectable in the Property Inspector.
- Pixel Window maps to renderer preset `pixel-window`.
- Pixel Window uses `PIXEL_RENDER_TEXT_STYLES`.
- Pixel Window draws an outer frame and title bar.
- Existing widget bodies render at the client-area size and are clipped into the
  frame without SVG scaling.
- Default colors are centralized in `pixel-window-theme-tokens.ts`.
- Pixel Window does not expose custom color controls yet.
- Existing selectable themes still render without a body viewport.
- No action view builders are changed.
- No primitive contains `pixel-window` conditionals.
- Visual matrix coverage includes Pixel Window.
- Unit, PI, build, proto, and visual checks pass.

## Slice 1 Implementation Note

Slice 1 created a manifest-driven visual matrix under `packages/hub/tests/visual`:

- `widget-visual-matrix.ts`: defines the view case, theme, surface, and data
  axes and expands them into renderable visual cases.
- `widget-visual-matrix.visual.spec.ts`: verifies matrix coverage, renders one
  representative single and dual case without snapshots, and registers the full
  snapshot matrix.

The current matrix registers 300 snapshot render cases:

```txt
15 view cases x 5 themes x 2 production-valid surfaces per view case x 2 data states
```

plus two guard/smoke tests. Circle view cases cover keypad square and
touch-strip square. Non-circle view cases cover keypad square and touch-strip
wide. Snapshot generation completed after the harness was changed to render
through `composeMetricViewFrame()`.

The matrix includes stress values for font-sensitive layout review:

- single circle full-ring uses `100%`;
- single centered text uses `999 MB/s`;
- multi-channel progress bar uses `999 KB/s`, `88 MB/s`, `RD`, and `WR`;
- no-data states use `N/A`.

Initial text call-site inventory found the expected high-risk areas:

- `view-rendering/svg-utils.ts`: `renderConstrainedSvgText()` owns shared
  clipping, `dominant-baseline`, text fitting, and the current low-cost width
  estimator. This is the first helper to make font-metrics aware.
- `widgets/primitives/metric-text-row.ts`: manually composes value and unit
  tspans, computes width fit, and clips the row. It is the shared risk point for
  value/unit baseline drift.
- `widgets/primitives/text-metric.ts`: centered single/dual text uses fixed
  coordinates and shared constrained text. This is the first non-title-card
  primitive candidate for the font-driver spike.
- `widgets/primitives/progress-circle.ts`: value, unit, label, and gauge rows
  use fixed regions and constrained text. Pixel fonts previously clipped here.
- `widgets/primitives/dual-channel-progress-circle.ts`: dual values, units,
  gauge labels, center labels, and unavailable rows use fixed coordinates and
  constrained text.
- `widgets/primitives/progress-bar.ts`: title, value, unit, and channel labels
  use fixed bar layout regions and constrained text.
- `widgets/primitives/sparkline.ts` and
  `widgets/primitives/dual-channel-sparkline.ts`: title/value/unit/small labels
  share chart space with plot geometry, so vertical metric drift can collide
  with graph regions.
- `widgets/primitives/mirrored-traffic.ts`: top labels used direct `<text>`
  elements with fixed `y` coordinates; include them in the styled text migration
  so they are not a second font island.
- `widgets/primitives/title-card-text-metric.ts`: uses
  `JAPANESE_SERIF_RENDER_FONT_FAMILY` directly. It remains a managed exception
  for this plan and should not drive the pixel-font metrics contract.

Legacy visual specs still exist alongside the matrix:

- `widget-default-theme.visual.spec.ts`
- `widget-color-filled.visual.spec.ts`
- `widget-terminal.visual.spec.ts`
- `widget-title-card.visual.spec.ts`
- `widget-single-baseline.visual.spec.ts`
- `widget-dual-baseline.visual.spec.ts`

They can remain during Slice 2 and Slice 3. After Slice 4 migrates primitive
text layout, remove legacy cases that are fully covered by the matrix and merge
any unique fixtures into the matrix so `composeMetricViewFrame()` becomes the
visual source of truth for production widget rendering.

## Slice 2 Font Driver Spike Note

Slice 2 added a local test-only spike under `packages/hub/tests/visual`:

- `font-driver-spike.visual.spec.ts`
- `font-driver-spike-assets/`
- `font-driver-spike-output/`

The spike artifacts are intentionally not production renderer code. They must
either be deleted or converted into formal matrix coverage before this plan is
finished.

The spike used:

- `DotGothic16-Regular.ttf` from `fontworks-fonts/DotGothic16`;
- `PixelifySans-Regular.ttf` from `eifetx/Pixelify-Sans`;
- the existing bundled `InterVariable.ttf` as the current neutral reference.

The selected primitive was centered text metric with the stress value
`999 MB/s`. Measurement strings included Latin value/unit stress cases,
`100%`, `N/A`, `UP DN RD WR`, and a non-blocking DotGothic16-only Japanese
sample `温度`. The spike rendered preview PNGs and used `@resvg/resvg-js`
`getBBox()` in the test path only. `getBBox()` remains disallowed in the hot
render path.

Measured current helper source values:

- default clip height: `1.45em`;
- default width guard ratio: `1.08`;
- default minimum font scale: `0.78`, recorded for centralization only. This
  spike did not prove a font-specific minimum scale.

Measured summary:

| Font driver | Max required clip height | Max center offset | Inferred width scale range |
| --- | ---: | ---: | ---: |
| Inter current neutral | `0.978em` | `0.091em` | `0.902-1.052` |
| DotGothic16 | `1.160em` | `0.141em` | `0.753-0.941` |
| Pixelify Sans | `0.812em` | `0.085em` | `0.854-0.947` |

Conclusions for Slice 3:

- `baselineShiftEm` is justified. In shared Latin runs, DotGothic16 differs
  from Inter by about `0.019-0.088em`, depending on glyph mix. Per-role
  adjustment should recover most of that drift, but it will not remove
  per-string residuals caused by `/`, descenders, or other glyph-shape details.
- `widthScale` is justified. The current estimator is conservative for both
  pixel drivers, especially DotGothic16. The `100%` run measured `0.753` for
  DotGothic16, which would otherwise cause unnecessary shrinking or
  `textLength` compression. Implement `widthScale` as a multiplier on raw
  estimated text width before applying the width guard.
- `clipHeightEm` should start as neutral for the selected primitive. Neither
  DotGothic16 nor Pixelify Sans exceeded the current `1.45em` clip in this
  centered-text spike, and the DotGothic16 `温度` run also stayed inside the
  current clip. Keep the field only as the renderer-owned expression of the
  existing clip multiplier and tune it later only if another migrated primitive
  proves a real need.
- `minimumFontScale` was not proven to need a font-specific value in this
  spike. If Slice 3 keeps this field, the reason should be preserving and
  centralizing existing fit behavior, not because DotGothic16 requires a custom
  minimum scale in the selected primitive.
- Visual preview review: Inter remains the neutral reference; DotGothic16 is
  legible and close to the target pixel feel in the centered text preview;
  Pixelify Sans is blockier and remains useful as a secondary comparison font.

Step 4 neutral defaults must use the measured current helper values above, not
the illustrative placeholders in the target contract section.

## Slice 5 Implementation Note

Slice 5 added the primary pixel font asset and renderer preset without adding a
selectable product theme:

- Font asset: `packages/hub/assets/fonts/dotgothic16/DotGothic16-Regular.ttf`
- Source artifact: `DotGothic16-Version1.101.zip` from
  `fontworks-fonts/DotGothic16`
- License: SIL Open Font License 1.1, stored beside the font as `LICENSE.txt`
- TTF size: `2,069,236` bytes

The initial `PIXEL_RENDER_TEXT_STYLES` preset uses DotGothic16 as the primary
font family and keeps Inter as the bundled Latin fallback. The preset records
only renderer-owned metrics:

- `value.baselineShiftEm: 0.02`
- `unit.baselineShiftEm: 0.08`
- `title.baselineShiftEm: 0.02`
- `label.baselineShiftEm: 0.02`
- `smallLabel.baselineShiftEm: 0.03`
- `widthScale: 0.9`

DotGothic16 is a single-weight font. The preset keeps role-specific
`fontWeight` values so fallback glyphs and future multi-weight pixel candidates
retain role intent, but primary DotGothic16 glyphs render at the available
Regular weight.

`metric-text-row` was verified with this non-zero baseline preset in unit tests.
The row clip remains value-centered for now; if future visual tuning finds unit
clipping, revisit the row clip-centering strategy instead of adding
primitive-local pixel-font branches.

## Slice 6 Future User Font Path Note

The renderer is now shaped so future theme fonts can be added through bundled
font assets, resvg font resolver entries, and `RenderTextStyles` presets. That
does not mean arbitrary user font import is implemented.

Future user-provided font support must be a separate product slice with its own
storage and UX decisions:

- Property Inspector controls for selecting, replacing, and clearing fonts.
- Settings/proto fields for referencing imported font assets.
- A storage location and migration policy for user font files.
- File validation for corrupt, unsupported, or excessive font files.
- Import/export behavior for profiles that reference custom fonts.
- Recovery UI and render fallback behavior when a referenced font is missing.
- License and user-responsibility copy for imported third-party fonts.

The renderer contract should remain the same for that future work: user fonts
become resolved render text styles plus explicit font files. Do not let
Property Inspector, storage schema, or action view builders own baseline,
width, or clip layout. Extreme decorative fonts remain out of scope unless a
future product decision accepts per-font visual failures or a heavier
measurement pipeline.

## Required Verification

For the full work:

```powershell
cd packages\hub
npm.cmd run test:unit
npm.cmd run build
npm.cmd run test:visual
```

Visual snapshot updates require explicit review:

```powershell
npm.cmd run test:visual:update
```

Do not run visual updates during ordinary verification. Run them only when the
visual change is intentional and reviewed.

## Acceptance Criteria

The work is complete when all of these are true:

- Full production visual matrix exists and passes.
- Existing default theme snapshots are stable through the refactor.
- `RenderTextStyle` carries font metrics sufficient for normal theme-owned
  fonts.
- Shared text helpers own baseline, clip height, and width fitting.
- High-risk primitive text call sites use shared helpers or a documented
  renderer-owned equivalent.
- Title-card keeps its current Japanese serif typography and remains covered by
  visual snapshots.
- DotGothic16 renders the selected high-risk primitive without text clipping.
- At least one selected secondary comparison font renders the same selected
  primitive without primitive geometry edits.
- Title-card font-family usage remains limited to
  `JAPANESE_SERIF_RENDER_FONT_FAMILY`; no title-card-specific fields are added
  to the generic text metrics contract.
- Primitives do not contain font-name-specific conditionals.
- Any font-driver spike files were deleted or converted into formal
  manifest-driven visual matrix cases.
- No settings/proto/PI user-font feature was added.
- No renderer imports generated storage schema.
- No action view builder owns font layout.
- Unit tests cover metrics helper behavior.
- Visual tests cover the complete matrix.

## Review Checklist For A Zero-Context Agent

Before approving implementation, verify:

- The first visual-test step happened before layout refactoring.
- Matrix coverage is manifest-driven and auditable.
- Default text metrics are neutral.
- Default snapshots did not move unexpectedly.
- DotGothic16 and at least one secondary comparison font were used before
  finalizing the metrics contract.
- Step 4 neutral defaults came from Step 3 measurements, not illustrative
  values in the contract section.
- `getBBox()` is used only in spike/test measurement, not runtime rendering.
- Pixel or future font behavior is expressed as text metrics, not primitive
  coordinate patches.
- No `if (theme === "...")` font-layout branches appear inside primitives.
- No settings/proto/PI work was introduced for user fonts.
- The resvg font resolver still avoids broad system font loading by default.
- Hot render paths do not perform native text measurement.
- Operating-system fonts are only last-resort explicit glyph fallbacks, not
  theme typography.

## Risks

Visual snapshot volume will increase. This is intentional because the target is
production-grade visual regression protection.

Some existing snapshots may reveal current layout defects. Fix those only when
they are in the same ownership area as this work. Otherwise document them and
avoid mixing unrelated visual cleanup into the font-safe refactor.

Very unusual fonts can still fail. The target is normal UI or pixel fonts whose
glyph dimensions are within a reasonable range, not arbitrary decorative fonts.

DotGothic16 does not cover all Simplified Chinese characters. It covers the
current title-card static Japanese text and normal Latin metric units, but
runtime user-provided labels can still fall through to the existing script
fallback chain. That fallback is acceptable for missing glyphs, not for theme
layout validation.

## Deferred Work

- User font import and persistence.
- Font file picker UI.
- Theme selection changes for a new Win98/NSO-inspired theme.
- Pixelizing title-card typography.
- A typed SVG scene graph.
- Real font measurement in the hot path.
- Per-device or per-surface font rendering differences.
- Using platform pixel fonts as selectable theme fonts.
