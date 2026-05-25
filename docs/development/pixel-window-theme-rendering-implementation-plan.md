# Font-Safe Rendering Implementation Plan

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
  - Role: Latin fallback candidate and second font metrics pressure test.
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
  `effectiveEstimatedWidth = rawEstimatedWidth * widthScale`.
- `minimumFontScale`: lets a theme choose how aggressively text may shrink
  before `textLength` compression is used.
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
- `widgets/primitives/title-card-text-metric.ts`
  - no pixel-font migration in this plan
  - keep current Japanese serif typography stable
  - keep title-card covered by visual matrix cases

Title-card currently uses `JAPANESE_SERIF_RENDER_FONT_FAMILY` directly in many
text elements. For this plan, that is acceptable because title-card is not the
font-safe driver and remains a strongly styled view. Do not add title-card
specific fields to the generic `RenderTextStyle` contract. If the direct usages
are touched for nearby work, keep the font choice renderer-owned and explicit,
but do not force title-card into the pixel theme font chain.

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

### Step 6: Migrate Primitive Text In Small Groups

Migrate primitives group by group:

1. `text-metric.ts`
2. `progress-circle.ts`
3. `dual-channel-progress-circle.ts`
4. `progress-bar.ts`
5. `sparkline.ts`

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
- `widgets/primitives/mirrored-traffic.ts`: uses direct `<text>` elements with
  fixed `y` coordinates instead of the constrained text helper.
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
