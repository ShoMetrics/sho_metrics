# Touch Strip Wide Frame Layout Plan

## Purpose

This plan defines the rendering work needed for Stream Deck+ touch strip
widgets whose output should occupy the full `200x100` touch strip region.

The first implementation target is narrow:

- make touch strip circle views render a full `200x100` outer image;
- keep the circle metric body visually equivalent to the current centered
  square rendering;
- keep theme support generic: every theme should render at `200x100` unless a
  concrete future theme proves otherwise;
- do not edit widget primitives to solve a touch strip framing problem;
- leave room for a later two-circle touch strip view without implementing that
  future view now.

## Background

Stream Deck+ gives each dial action a `200x100` touch strip quarter.
ShoMetrics currently has two touch strip layout paths:

```txt
wide   -> layout rect [0, 0, 200, 100], PNG 200x100
square -> layout rect [50, 0, 100, 100], PNG 100x100
```

Before Step 1, the relevant code is:

- `packages/hub/src/view-rendering/widget-data.ts`
  - `TOUCH_STRIP_LOGICAL_SIZE = { width: 200, height: 100 }`
  - `TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE = { width: 200, height: 100 }`
- `packages/hub/src/view-rendering/metric-view-frame.ts`
  - `resolveTouchStripMetricLayout()` sends circle views to the square layout.
- `packages/hub/com.ez.sho-metrics.sdPlugin/layouts/single-metric-touchstrip-square.json`
  - previously placed `metricImage` at `[50, 0, 100, 100]`.
  - Step 1 removes this layout file once no production render path references
    it.
- `packages/hub/com.ez.sho-metrics.sdPlugin/layouts/single-metric-touchstrip-wide.json`
  - places `metricImage` at `[0, 0, 200, 100]`.

Because circle views currently use the square layout, Stream Deck receives only
a centered `100x100` image for those touch strip views. Theme backgrounds and
frames are clipped to the same square.

That is the wrong ownership model. A theme should be able to draw any supplied
outer render size. Whether the metric body is square, wide, or later split into
two slots is a view presentation decision, not a theme support decision.

Existing non-circle views such as bars, centered text, and sparklines already
use the full `200x100` touch strip path. This plan corrects the circle path so
it follows the same outer-region rule.

## Product Goal

For circle views on touch strip:

```txt
touch strip image region: 200x100
theme background/frame:   fills 200x100
metric body content:      remains centered square content
```

Examples:

- `pixel-window` draws a `200x100` window frame instead of a small `100x100`
  window.
- `color-filled` fills the whole touch strip region instead of a centered
  square.
- `cupertino-glass` draws its glass panel across the full touch strip region.
- `flat` and other existing themes still render as they do now inside the body,
  but the side regions are explicitly filled by the active theme background.

The side regions should use the active theme background/fill, not transparency.
Transparent output makes visual tests and real Stream Deck composition depend on
whatever is behind the image. The correct default is deterministic: draw the
same background the theme would already draw for the provided outer size.

This plan does not change circle primitive geometry, icon size, text placement,
or metric data rendering.

## Future Goal

A later slice may add views where one `200x100` touch strip region contains two
independent `100x100` circle bodies.

Initial expected use cases:

- network upload/download;
- disk read/write.

Possible later use cases:

- two GPU widgets in one touch strip region;
- other paired metrics that naturally fit as two square touch strip slots.

This future goal should influence naming and boundaries, but it must not cause
the first slice to build a generic multi-slot layout engine before it is needed.

## Non-Goals

Do not implement these in Step 1:

- dual-circle touch strip rendering;
- new persisted settings/proto fields;
- new Property Inspector controls;
- primitive-specific layout patches;
- per-theme primitive conditionals;
- theme allow lists or ban lists;
- support for arbitrary slot counts;
- changing non-circle touch strip views;
- changing existing key render behavior.

## Design Principles

- The touch strip feedback image should be `200x100` by default.
- Theme styles should render the outer size they are given. Do not encode
  "wide support" per theme unless a concrete future theme cannot render wide.
- View presentation decides where the metric body goes inside the outer image.
- Touch strip layout policy belongs in `metric-view-frame.ts`, not in widget
  primitives.
- Theme frame drawing belongs in `widgets/styles/*` through `ThemeStyle`.
- Primitives should keep receiving a normal render size and should not need to
  know whether the output is a key, a square body inside a touch strip, or a
  future two-slot touch strip.
- The first slice may add one explicit layout kind for the new behavior. Do not
  introduce a general-purpose slot layout model until the dual-circle slice
  actually needs it.
- Visual tests are the acceptance mechanism for the outer/background change.

## Step 1: Wide Outer Frame With One Square Body

### Intent

Add a touch strip render mode where the output image is `200x100`, the theme
background is drawn over `200x100`, and the existing single circle body is
placed into a centered square body slot.

Suggested layout name:

```txt
wide-frame-square-body
```

This name is intentionally descriptive:

- `wide-frame`: the outer theme frame/background uses the full touch strip;
- `square-body`: the metric body remains square.

### Files To Inspect

```txt
packages/hub/src/view-rendering/metric-view-frame.ts
packages/hub/src/view-rendering/metric-frame.ts
packages/hub/src/view-rendering/metric-view-frame.test.ts
packages/hub/src/view-rendering/widget-data.ts
packages/hub/tests/visual/widget-visual-matrix.ts
packages/hub/tests/visual/__snapshots__/
packages/hub/com.ez.sho-metrics.sdPlugin/layouts/
```

### Render Contract

Add a way for `TouchStripMetricLayout` or the render plan to express these
separate concepts:

```txt
outer render size: 200x100
PNG size:          200x100
layout path:       full-width touch strip layout
body render size:  current square body logical size
body placement:    centered square slot in the 200x100 frame
```

The implementation does not have to use these exact field names, but the
contract must keep these ideas separate. Avoid overloading `renderSize` to mean
both "frame size" and "body size".

Recommended shape:

```ts
interface TouchStripBodyPlacement {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly height: number;
    readonly renderSize: KeySize;
}
```

For Step 1:

```txt
xCoordinate: 50
yCoordinate: 0
width: 100
height: 100
renderSize: WIDGET_LOGICAL_SIZE
```

The final body transform should be equivalent to:

```txt
translate(50, 0) scale(100 / WIDGET_LOGICAL_SIZE.width)
```

`WIDGET_LOGICAL_SIZE.width` is currently `144`. Implementations must reference
the constant instead of copying the numeric value.

The body slot should clip the body to its `100x100` slot. The theme background
and overlays must not be clipped to the body slot.

### Layout Selection Policy

Use `wide-frame-square-body` for all circle touch strip renders.

Use the existing `wide` touch strip layout for non-circle views.

In Step 1, "all circle" intentionally includes dual-circle views. They still
render as one square body inside the wide frame until Step 2 introduces separate
left/right circle bodies.

Do not branch by theme. The active theme is an input to rendering, not a support
gate for wide touch strip output. If a future theme truly cannot render wide,
that exception should be introduced only when that theme exists and with a
specific reason.

This branch belongs in touch strip layout policy. It should not appear inside
`progress-circle.ts`, `dual-channel-progress-circle.ts`, or other primitives.

### Layout JSON

Reuse `single-metric-touchstrip-wide.json` for Step 1. The Stream Deck feedback
rect is already the required full-width touch strip rect:

```json
{
  "key": "metricImage",
  "type": "pixmap",
  "rect": [0, 0, 200, 100]
}
```

Do not add a new layout JSON in this slice. The body placement belongs in the
render plan and frame composition, not in the Stream Deck feedback rect.

Remove `single-metric-touchstrip-square.json` after `resolveTouchStripMetricLayout()`
stops referencing it.

### Metric Frame Behavior

`renderMetricFrame()` currently owns theme background, body placement through
`ThemeBodyViewport`, muted filtering, and overlays. Step 1 must preserve those
responsibilities.

The wide-frame square-body placement should be applied by the frame/composition
layer, not by primitives.

Required behavior:

- theme `renderBackground()` receives the `200x100` outer size;
- theme `renderOverlay()` receives the `200x100` outer size;
- the metric body is rendered once at its normal square logical size;
- the metric body is placed into a centered square body slot;
- muted/no-data filtering still applies to body content only;
- color compensation still wraps the final SVG after composition, as today.

Body placement must use this model:

1. Resolve the active theme against the `200x100` outer size.
2. Determine the available body area:
   - if the theme exposes `ThemeBodyViewport`, use the viewport rectangle as the
     available body area;
   - otherwise use the full `200x100` outer region as the available body area.
3. For `wide-frame-square-body`, derive a square body slot inside that available
   area:

```txt
slotSize = min(availableBodyArea.width, availableBodyArea.height)
slotX = availableBodyArea.xCoordinate + floor((availableBodyArea.width - slotSize) / 2)
slotY = availableBodyArea.yCoordinate + floor((availableBodyArea.height - slotSize) / 2)
```

4. Render the circle body with `WIDGET_LOGICAL_SIZE`.
5. Scale the body uniformly into `slotSize`.

For themes without a `ThemeBodyViewport`, this produces the expected centered
`100x100` slot at `x=50`, `y=0`.

For Pixel Window, the title bar and client area stay owned by
`pixel-window.ts`. The touch strip square body slot is derived inside Pixel
Window's client viewport, not around the whole `200x100` window. Do not use
`ThemeBodyViewport.body.renderSize` as the primitive render size for this
touch-strip square-body mode; use `WIDGET_LOGICAL_SIZE` and scale it into the
derived slot.

Do not push special cases into Pixel Window primitives. The accepted visual
result is:

```txt
Pixel Window frame fills 200x100.
Circle content remains visually comparable to the old centered square body.
```

### Tests

Add or update unit tests in `metric-view-frame.test.ts`:

- all circle touch strip renders use `wide-frame-square-body`;
- non-circle touch strip renders still use `wide`;
- `renderPlan.pngSize` is `200x100` for `wide-frame-square-body`;
- `renderPlan.bodyRenderSize` remains the square body logical size;
- themes without `ThemeBodyViewport` place the body at `50,0` with a `100x100`
  slot;
- themes with `ThemeBodyViewport` derive the square body slot inside the theme
  viewport;
- no test encodes a per-theme wide allow list.

Add or update `metric-frame.test.ts` if the body placement wrapper is added
there:

- body placement transform is emitted for wide-frame square-body;
- theme background still uses `200x100`;
- body clip path is present and deterministic;
- muted output still contains both the muted filter and body placement.

Visual tests:

- update the visual matrix surface coverage so circle touch strip cases produce
  `200x100` snapshots;
- review all theme circle touch strip snapshots manually;
- ensure non-circle touch strip snapshots stay unchanged unless the existing
  baseline was already using a square path incorrectly.

### Step 1 Completion Criteria

Step 1 is complete when:

- all themes render circle touch strip images as `200x100`;
- theme backgrounds/frames fill the full touch strip width;
- side regions are filled by the active theme background rather than left
  transparent;
- circle metric bodies remain centered and square;
- circle primitives contain no touch strip or theme-specific branches;
- existing key renders are unchanged;
- existing non-circle touch strip views are unchanged;
- unit tests and visual tests pass.

## Step 2: Two Circle Bodies In One Touch Strip

### Intent

Add a touch strip view that renders two independent `100x100` circle bodies
inside the same `200x100` touch strip region.

This is not part of Step 1. Step 1 should not build the multi-body engine early.

### Expected First Use Cases

- network upload/download;
- disk read/write.

The later implementation should not hard-code those domains as the only
possible paired-circle source. However, it also should not model arbitrary
dashboards, drag-and-drop slots, or user-authored grids in advance.

### Likely Render Contract

Step 2 can extend the Step 1 single body placement into two explicit placements:

```txt
left slot:  x=0,   y=0, width=100, height=100
right slot: x=100, y=0, width=100, height=100
```

Each slot renders one existing square circle body. The first implementation
should support exactly two slots because the product requirement is exactly two
circle bodies in a `200x100` strip.

Do not implement variable slot counts until a concrete product requirement
needs it.

### View Ownership

This should be a view/composition feature, not a primitive feature.

Expected owners:

- action view builders decide whether a metric supports paired circle data;
- `single-metric-view.ts` / `dual-metric-view.ts` or a new narrow touch-strip
  composer renders the two body fragments;
- `metric-view-frame.ts` places the body fragments into slots;
- circle primitives remain unaware of the touch strip pair layout.

Do not add two-circle behavior to `progress-circle.ts` itself.

### Settings And PI

Step 2 may require product decisions:

- whether paired-circle touch strip mode is automatic for upload/download and
  read/write;
- whether users can select it;
- what labels/icons appear in each circle;
- whether two unrelated metrics, such as GPU 1 and GPU 2, can be paired.

If user-selectable behavior is required, Step 2 must include settings/proto and
Property Inspector work. Do not add hidden settings in Step 1.

### Step 2 Completion Criteria

Step 2 is complete when:

- network upload/download and disk read/write can render as two independent
  circle bodies in a `200x100` touch strip;
- each body remains visually equivalent to an existing square circle body;
- the layout is represented in the render plan, not hard-coded in primitives;
- visual tests cover both data and no-data states;
- any user-selectable behavior has explicit settings and PI coverage.

## Risks

- Pixel Window has a title bar and body viewport. Full-width framing derives the
  square body slot inside Pixel Window's client viewport. If the client area is
  visually too short, adjust frame/body placement, not circle primitive
  internals.
- Existing visual tests historically distinguished `touch-strip-wide` and
  `touch-strip-square`. Step 1 should rename the circle surface case to
  `touch-strip-wide-frame-square-body` so reviewers can see which behavior is
  expected.
- Step 1 reuses `single-metric-touchstrip-wide.json`. Test names and render-plan
  assertions must carry the `wide-frame-square-body` distinction because the
  layout JSON name will not.
- Do not let Step 1 become the dual-circle implementation. If the first slice
  starts adding arrays of slots, domain pairing rules, or PI settings, split the
  work.

## Required Verification

For Step 1:

```powershell
cd packages\hub
npm.cmd run test:unit
npm.cmd run build
npm.cmd run test:visual
```

If snapshots intentionally change:

```powershell
npm.cmd run test:visual:update
```

Review changed `touch-strip` snapshots before accepting them.

## Review Checklist

- Do all circle touch strip renders use a `200x100` outer image?
- Are primitive files free of touch strip layout conditionals?
- Does the render plan clearly separate outer frame size, PNG size, body render
  size, and body placement?
- Does every theme fill the side regions with its active background/frame rather
  than leaving them transparent?
- Does Pixel Window fill `200x100` without shrinking or distorting the circle
  body unexpectedly?
- Did key snapshots stay unchanged?
- Did non-circle touch strip snapshots stay unchanged?
- Is Step 2 still deferred, with no hidden pairing settings or generic slot
  engine added early?
