# Render Appearance 2A Plan

## Purpose

This plan upgrades the SVG rendering appearance boundary enough to support a
Black & White color mode and future visual complexity without jumping to a full
typed SVG scene graph.

The selected direction is **Option 2A: paint-token-first RenderAppearance**.
It centralizes paint ownership, theme paint construction, and renderer-facing
paint lowering while keeping the current string-based SVG primitives.

## Boundary Invariant

```txt
stored settings express user intent
resolved settings express app-level intent
visual-adapter converts resolved settings into renderer-facing appearance
renderer primitives consume already-lowered renderer paint data
final SVG audit proves B&W is a whole-widget color-mode property
```

Do not bypass this boundary to make B&W cheaper locally.

## Current Structure

The current runtime rendering flow is:

```txt
stored settings
-> settings/storage/resolver.ts
-> settings/resolved-settings.ts
-> settings/visual-adapter.ts
-> metric-view-runner/display-model.ts
-> metric-view-runner/runner.ts
-> rendering/single-metric-view.ts or rendering/dual-metric-view.ts
-> widgets/primitives/*
-> rendering/metric-frame.ts
-> rendering/rasterizer.ts
-> Stream Deck setImage() or setFeedback()
```

Current ownership:

- `contracts/proto/shometrics/v1/settings.proto` owns the persisted settings
  contract.
- `settings/storage/*` owns generated proto decoding, sparse patches,
  validation, and stored-to-resolved conversion.
- `settings/resolved-settings.ts` owns the app-level resolved settings contract.
- `settings/visual-adapter.ts` currently converts resolved appearance to a
  renderer-facing contract, but that contract is still close to resolved
  settings.
- `metric-view-runner/*` owns render scheduling, display queueing, no-data
  placeholder decisions, touch strip layout selection, and dispatch.
- `rendering/*` composes single/dual metric views, wraps frames, and rasterizes.
- `widgets/primitives/*` render SVG string fragments.
- `widgets/styles/*` render frame style defs, background, and overlay.

Current appearance shape before this refactor:

- `ResolvedAppearanceSettings.colorMode` is `"threshold" | "solid"`.
- `settings/visual-adapter.ts` builds one primary `ColorConfig`.
- Single-metric primitives mostly receive `ColorConfig`.
- Dual-channel render paths pass a mix of `ColorConfig`, `positiveColor`, and
  `negativeColor`.
- Many paint values are hardcoded in primitives and frame styles, including
  text, icon, track, grid, divider, background, overlay, glow, and gradient
  colors.

Current weakness:

```txt
ColorConfig controls metric paint, not total SVG paint.
```

So adding B&W only to `ColorConfig` would leave other colored SVG values outside
the policy.

## Target Structure

The target flow after 2A is:

```txt
stored settings
-> resolved settings
-> visual-adapter builds RenderAppearance
-> metric-view-runner passes RenderAppearance
-> views/primitives consume semantic paint tokens and lowered ColorConfig
-> metric-frame consumes semantic paint tokens
-> B&W SVG audit tests final SVG output
-> rasterizer
-> Stream Deck
```

`RenderAppearance` is renderer-facing app data. It is not a second settings
model and it is not persisted.

Conceptual shape:

```ts
interface RenderAppearance {
    readonly layout: "circular" | "text" | "linear" | "sparkline";
    readonly circleStyle: "value" | "compact" | "gauge";
    readonly theme: "flat" | "cupertino-glass" | "color-filled";
    readonly colorMode: "threshold" | "solid" | "black-white";
    readonly paintConstraint: "none" | "black-white";
    readonly paints: RenderPaintTokens;
    readonly lineSmoothingPercent: number;
    readonly gridLineVisibility: SparklineGridLineVisibility;
    readonly gridLineType: SparklineGridLineType;
}

interface RenderPaintTokens {
    readonly background: string;
    readonly surface: string;
    readonly textPrimary: string;
    readonly textSecondary: string;
    readonly textMuted: string;
    readonly icon: string;
    readonly metricPrimary: ColorConfig;
    readonly track: string;
    readonly grid: string;
    readonly divider: string;
}
```

The exact TypeScript names can change during implementation. The important
contract is semantic ownership, not this draft's field spelling.

Dual-channel color configs may remain separate renderer-facing inputs while the
string renderer is still in place. The visual adapter should provide the shared
lowering helper, but it should not guess `channelPositive` or `channelNegative`
from a generic appearance object when only an action-specific view builder knows
what those channels mean.

`colorMode` is the user-facing color choice. It answers how the widget should
use color:

- `threshold`: metric values choose dynamic colors.
- `solid`: metric paint uses one selected color.
- `black-white`: the whole widget renders with neutral paint.

This replaces the older metric-only interpretation of color mode. B&W is a
peer of threshold and solid in stored/resolved settings because that matches the
Property Inspector control and user intent.

`theme` answers the whole-widget visual preset. Current frame styles such as
flat and glass are the first theme values. Future themes may change paint,
shape, typography, frame chrome, or overlays.

`paintConstraint` is a renderer-facing derived value. It answers the final color
rule for the rendered SVG after the visual adapter has interpreted `colorMode`.
B&W becomes a paint constraint at the renderer boundary because it constrains
theme paint, metric paint, text, icons, tracks, grids, dividers, gradients, and
overlays. This derived value must not be persisted in settings proto.

This is an intentional boundary translation:

```txt
stored/resolved colorMode: "black-white"
-> visual-adapter derives paintConstraint: "black-white"
-> renderer consumes neutral lowered paints
```

Widget-level B&W constrains only that widget's final paint. Global B&W lives in
the global color override section. It constrains every widget's final paint only
when global override and its color subsection are enabled. It must not override
each widget's layout, graph variant, shape style, or theme unless the separate
global layout/style subsection is enabled.

The global override UX is a master switch with owned subsections:

```txt
global override
-> layout/style override
-> color override
```

When the master switch is enabled, omitted subsection switches resolve to
enabled so one click applies both layout/style and color. Explicit subsection
`false` stores the user's choice to hide and skip that subsection. This
presence-based default lives in the resolver; do not persist resolved `true`
defaults only to make proto booleans look checked.

`layout` plus `circleStyle` can remain during 2A because paint ownership does
not require flattening graph variants. Before adding a new graph such as volume
bars, revisit the renderer-facing contract and consider flattening it into a
single `graphicVariant` enum:

```ts
type GraphicVariant =
    | "circular-full"
    | "circular-gauge"
    | "circular-minimal-notch"
    | "text"
    | "linear-progress"
    | "sparkline"
    | "volume-bars";
```

The Property Inspector may still display grouped controls. The renderer contract
should express the final graph variant it needs to draw, not mirror the UI
grouping. This keeps later dispatch logic from growing around invalid
combinations such as non-circular layouts carrying circular-only style fields.

## Paint Token Rules

Paint tokens describe semantic roles, not primitive internals.

Good token names:

- `background`
- `surface`
- `textPrimary`
- `textSecondary`
- `textMuted`
- `icon`
- `metricPrimary`
- `track`
- `grid`
- `divider`

Bad token names:

- `sparklineStroke`
- `arcTrack`
- `gaugeNeedle`
- `badgeBackground`
- `linearBarFill`

New paint tokens require one of these justifications:

- The color role is shared by multiple primitives.
- A theme must control this semantic role independently.
- The role is visible in the product language, not only in one implementation.

If a future primitive needs a local shade, derive it from the nearest semantic
token in the primitive or a shared paint helper. Do not add a new global token
only because one primitive has a new SVG part.

Effect paint such as glow colors, filter flood colors, and gradient stops should
also be derived from semantic paint tokens unless a theme must control that
effect color independently. Do not add a `glow` token in 2A only because one
current style has a glow implementation.

## Known Future Theme Classes

Themes should be classified by the renderer capability they require, not by
their product name.

A theme is **paint-only** if it can be fully expressed by changing
`RenderPaintTokens` values and lowered `ColorConfig` values.

Examples:

- Color filled: colored background plus gray foreground paint.
- Monochrome green: neutral or green-tinted paint values with no geometry
  changes.

A theme requires **shape tokens** only if it must change geometry that affects
multiple primitives or the frame/chrome contract.

Examples:

- Old CRT green screen: hard frame edges, possible screen inset, scanline
  treatment, and monochrome paint.
- MMO UI: stylized rings, bars, borders, typography treatment, or decorative
  geometry shared across widgets.

A theme requires an **overlay/effect system** if it adds visual elements outside
the widget's data layer.

Examples:

- Snowfall, scanlines, static, noise, shimmer, or animated decorative assets.

2A implements paint ownership only. Shape tokens and overlay/effect ownership
are explicit future work. Do not add unused placeholder fields such as
`overlay?: never` to production contracts only to reserve space.

## Color Mode Decision

Themes are single-select whole-widget presets for now. B&W is a color mode, not
another theme and not a separate stackable UI axis.

Allow any theme to be rendered under the B&W color mode by default. This keeps
product behavior simple and predictable:

```txt
theme builds paint tokens and optional chrome
colorMode builds metric ColorConfig or derives B&W paintConstraint
visual-adapter lowers all renderer-facing paint
renderer primitives consume already-lowered paint
```

This covers cases like an old CRT green screen theme rendering as a black and
white CRT when B&W is selected. The theme still owns shape, frame, scanline, and
screen treatment; B&W only removes chromatic paint.

Do not add a theme compatibility matrix such as "allowed", "recommended", or
"blocked" for B&W in 2A. That would add UI and resolver complexity without a
clear product rule. If a future theme introduces an external color asset or
animation that cannot satisfy B&W, handle that concrete case in the adapter by
choosing a neutral asset, disabling that overlay, or rejecting the combination
with an explicit product decision.

If product direction later requires multiple independent visual axes beyond a
single color-mode dropdown, split the renderer-facing appearance deliberately:

```ts
interface RenderAppearance {
    readonly baseTheme: BaseVisualTheme;
    readonly paintConstraint: RenderPaintConstraint;
    readonly overlayPolicy: RenderOverlayPolicy;
    readonly colorMode: "threshold" | "solid" | "black-white" | "tinted";
    readonly paints: RenderPaintTokens;
}
```

Do this only after a concrete shipped UX requires multiple overlay or paint
policy axes. Until then, keep one theme field and one user-facing color mode.

## ColorConfig Lowering

`ColorConfig` entering renderer primitives must already be lowered by
`visual-adapter`.

Rules:

- Threshold color mode lowers metric paint to a threshold `ColorConfig` with
  user-selected colors.
- Solid color mode lowers metric paint to a solid `ColorConfig` with the
  user-selected solid color.
- Theme paint construction may then choose theme-specific renderer paint.
- B&W color mode derives a B&W paint constraint and lowers every
  renderer-facing `ColorConfig` to neutral paint before primitives see it.

Default B&W lowering should use a solid neutral `ColorConfig`:

```ts
{
    mode: "solid",
    solidColor: "#e6e6e6",
    thresholds: [],
}
```

If the product later needs B&W dynamic intensity, the adapter may lower B&W to
a threshold `ColorConfig` whose colors are all neutral grays. Primitives still
must not branch on B&W.

Do not let primitives contain logic like:

```ts
if (colorMode === "black-white") {
    ...
}
```

## B&W Completion Standard

B&W is complete only when representative final SVG output passes an audit that
allows no chromatic paint values.

This audit is a test/CI boundary, not render hot-path work.

The audit should inspect paint-bearing SVG data, including:

- `fill`
- `stroke`
- `stop-color`
- `flood-color`
- `lighting-color`
- `color`
- paint values inside inline `style`

Allowed values:

- `none`
- `transparent`
- `white`
- `black`
- neutral hex values such as `#000000`, `#ffffff`, `#808080`
- `rgb(N,N,N)`
- `rgba(N,N,N,A)`
- `url(#...)`

Rejected values:

- chromatic hex values such as `#3b82f6`, `#22c55e`, `#ef4444`, `#0f0f1a`
- chromatic rgb/rgba values such as `rgba(30,30,50,0.65)`
- any future named color that is not neutral

The audit should not scan all `#...` text blindly because SVG IDs also use
`url(#id)` and `id="..."`.

## Step 1: Establish Paint Ownership

Add the renderer-facing paint contract and wire B&W as a color mode that the
visual adapter lowers into a renderer-facing paint constraint.

This is one product slice, not several tiny type-only changes. It can include:

- Add B&W to the stored `ColorMode` enum and generated mappings.
- Add B&W to resolved `ColorMode`.
- Add B&W to Property Inspector color mode options.
- Update widget and global appearance patch paths to carry color mode.
- Refactor global override into a master switch with layout/style and color
  subsections.
- Treat global B&W as part of the global color override subsection. It should
  not force a global theme, layout, graph variant, or shape style.
- Build `RenderAppearance` or the equivalent renderer-facing contract in
  `settings/visual-adapter.ts` or a small file owned by the same adapter
  boundary.
- Build semantic `RenderPaintTokens` from resolved appearance, theme, and the
  adapter-derived paint constraint.
- Lower all renderer-facing `ColorConfig` values in the adapter.
- Preserve existing global override ownership without adding a duplicated
  global-only B&W model or a renderer-only global hack.

Required checks:

- Unit tests prove stored enum mapping, resolved settings, patches, and PI
  option wiring.
- Unit tests prove B&W lowers to neutral renderer paint data.
- Renderer-facing code does not import generated storage schema.
- No resolved defaults are written back to settings.

## Step 2: Make B&W True At Final SVG

Route the paint contract through the render path until final SVG audit passes.

This can include:

- Pass the renderer-facing appearance from `metric-view-runner` into
  `renderMetricFrame`, single-metric views, dual-metric views, and primitives.
- Move frame background and overlay colors behind semantic paint tokens.
- Move primary metric, channel, text, icon, track, grid, divider, glow/filter
  colors, and gradient stop paint behind tokens, derived semantic paint, or
  lowered `ColorConfig` as needed by the audit.
- Keep primitive geometry and layout constants local unless a real second theme
  needs to control them.
- Add a final SVG audit helper for B&W output.
- Test representative outputs across:
  - flat frame
  - cupertino glass frame
  - circular
  - text
  - linear
  - sparkline
  - dual-channel circular or sparkline
  - icons that currently render inline SVG fragments

The step is complete when the audit passes. It is not complete just because the
main metric color is gray.

Required checks:

- B&W final SVG audit fails on a deliberately chromatic paint value.
- B&W final SVG audit passes representative widgets.
- Existing non-B&W SVG tests still verify normal threshold and solid colors.
- Rasterizer performance is not changed by recurring SVG text scanning or
  per-frame audits.

## Step 3: Keep The Path Open To A Typed SVG Scene Graph

Do not implement a scene graph now. Use 2A to remove the color-policy risk first.

After 2A, a future Option 3 can change this:

```txt
primitive returns SVG string
```

to this:

```txt
primitive returns typed SvgNode
-> shared serializer emits SVG string
```

The following should stay stable during that future migration:

- stored settings contract
- resolved settings contract
- `visual-adapter` ownership
- `RenderAppearance`
- semantic paint tokens
- B&W color-mode-to-paint-constraint lowering location
- B&W final SVG audit behavior
- metric-view-runner scheduling and dispatch ownership

What Option 3 would replace later:

- raw string concatenation inside primitives
- manual XML escaping at each text/attribute call site
- ad hoc defs/id emission
- final SVG serialization

2A should make Option 3 less painful than going from the current structure
directly to a scene graph because paint semantics and B&W policy will already be
outside primitive string construction.

## Deferred Work

Do not add `RenderShapeTokens` or `RenderEffectTokens` in the first 2A pass.

Add shape tokens only when a concrete paint-plus-shape theme is being
implemented and the required geometry controls are known. Examples:

- one theme needs a different arc stroke width;
- one theme needs a different grid density or opacity rule;
- one theme needs a different glow strength;
- one theme needs a different frame radius that affects multiple renderers.

Do not move current constants into tokens only to make a token system look
complete.

Add an overlay/effect system only when a concrete overlay theme starts. Animated
or time-varying overlays are lifecycle and performance work, not paint token
work. They need explicit ownership for scheduling, throttling, cleanup, and
cache invalidation before entering production code.

## Non-Goals

- Do not build a typed SVG scene graph in this work.
- Do not add a schema-driven UI registry.
- Do not add a duplicated Property Inspector settings model.
- Do not add a renderer import of generated storage schema.
- Do not add compatibility paths for legacy string color modes.
- Do not model B&W as a theme.
- Do not persist renderer-facing `PaintConstraint`.
- Do not make global color mode a top-level sibling of global appearance
  override.
- Do not add a theme compatibility matrix for B&W in 2A.
- Do not persist resolved defaults.
- Do not make B&W a render-time grayscale filter only. The final SVG must not
  contain chromatic paint values.
- Do not run the final SVG audit on every render.
- Do not add unused overlay or effect placeholder fields before an overlay owner
  exists.

## Architecture Self-Check

Before implementation is considered complete:

- No duplicated PI settings model.
- No resolved defaults persisted.
- No renderer import of storage schema.
- No legacy string compatibility path.
- No broad option bag or pass-through wrapper added only to move data around.
- No defensive parser added for settings already validated at the storage
  boundary.
- Render paint tokens are semantic roles, not primitive part names.
- B&W is enforced by final SVG audit tests.
- Hot render paths do not scan broad SVG strings or settings objects per frame.
