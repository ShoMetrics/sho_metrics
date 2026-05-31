# Transparent Background Support Implementation

This document is the implementation contract for transparent background support. It is written so a new agent can continue without prior conversation.

## Goal

Add transparent surface controls:

- Enable transparent surface support.
- Control theme-owned background opacity.
- Control metric text outline strength.
- Control metric shape outline strength.

The feature exists for users who place their own background behind the plugin image. The renderer cannot inspect that external background. Do not implement background detection, automatic contrast detection, or image analysis.

## Product Decisions

Implement these exact decisions:

- All themes default to transparent surface support disabled.
- Flat / Default stores these default values for when the user enables the feature:
  - `backgroundOpacityPercent: 0`
  - `textOutlinePercent: 85`
  - `shapeOutlinePercent: 85`
- Every other theme stores these default values for when the user enables the feature:
  - `backgroundOpacityPercent: 50`
  - `textOutlinePercent: 85`
  - `shapeOutlinePercent: 85`
- Widget settings store transparent surface settings per theme.
- Global override stores one transparent surface override independent of theme. This is intentionally different from widget settings: global transparent surface expresses cross-widget readability for the user's background, while widget settings remember theme-specific tuning.
- Pixel Window supports the same setting group, defaults disabled, and uses background opacity for the window chrome/background layer. Pixel Window metric body text/shape outlines use the same renderer token path as other themes. Pixel Window chrome text and window-control glyphs are theme chrome and are not outlined.
- The Property Inspector exposes one toggle and three sliders:
  - `Transparent background`
  - `Background opacity`
  - `Text outline`
  - `Shape outline`
- Sliders are percentages from `0` to `100`, step `1`.
- `Background opacity` controls theme-owned background and decorative theme chrome only. It must never fade metric content and it cannot affect a user's external background image.
- When the toggle is off, current rendering behavior must remain unchanged.
- Do not make Flat / Default transparent by default in this implementation. Manual verification will decide whether that can become a future default.

## Data Boundary Rules

Respect these boundaries:

- Stored settings express user intent: whether transparent support is enabled and what percentages the user selected.
- Resolved settings hold complete per-theme values.
- Render appearance resolves those settings into numeric drawing tokens.
- Low-level SVG primitives must not know product intent such as "transparent background support is enabled." They receive concrete drawing instructions:
  - background opacity as `0..1`
  - text outline opacity and width as concrete values
  - shape outline opacity and width as concrete values
- Theme styles keep owning theme-specific background/chrome drawing.
- Do not add a separate background rendering module between existing theme rendering and `setImage`. Integrate opacity into the existing frame/theme rendering path.

## Implementation Steps

Complete these steps in order. They are intentionally coarse enough for one local development pass, but each step has a distinct contract boundary. Do not merge steps across storage, render tokens, primitive drawing, PI, or tests.

### Step 1: Add Stored And Resolved Settings

Locations:

- [settings.proto](../../contracts/proto/shometrics/v1/settings.proto)
- [resolved-settings.ts](../../packages/hub/src/settings/resolved-settings.ts)
- [default-appearance-settings.ts](../../packages/hub/src/settings/default-appearance-settings.ts)

Work:

- Add `TransparentSurfaceSettings` to proto.
- Add per-theme transparent surface fields, including the new `PixelWindowThemeSettings`.
- Regenerate proto outputs from `packages/hub` with `npm run generate:proto`.
- Add resolved interfaces and defaults.
- Preserve the product defaults exactly: Flat `0/85/85`, all non-Flat themes `50/85/85`, all disabled.

Why this step stands alone:

- It defines the stored and resolved contract. Later steps must consume this contract rather than inventing ad hoc renderer-only state.

### Step 2: Wire Storage Resolve, Patch, Merge, And Global Override

Locations:

- [resolver.ts](../../packages/hub/src/settings/storage/resolver.ts)
- [appearance-overrides.ts](../../packages/hub/src/settings/appearance-overrides.ts)
- [widget-settings-patch.ts](../../packages/hub/src/settings/storage/widget-settings-patch.ts)
- [global-settings-patch.ts](../../packages/hub/src/settings/storage/global-settings-patch.ts)

Work:

- Resolve `transparentSurface` for every theme.
- Add `pixelWindow` to resolved theme settings.
- Add sparse override types and merge logic for every theme.
- Add widget patch writing for every theme.
- Add global transparent surface override patch writing as one global setting, independent of global theme override.
- Ensure global theme override preserves widget-level per-theme `transparentSurface`; only the independent global transparent surface override may replace those values.
- Use a local storage-specific `resolveStoredPercent` helper, not renderer/SVG helpers.

Why this step stands alone:

- It completes the settings pipeline. Render code must not read stored protobuf objects or patch objects directly.

### Step 3: Add Render Tokens And Frame Background Opacity

Locations:

- [render-appearance.ts](../../packages/hub/src/view-rendering/render-appearance.ts)
- `packages/hub/src/settings/render-transparent-surface-resolver.ts`
- [render-appearance-builder.ts](../../packages/hub/src/settings/render-appearance-builder.ts)
- [metric-frame.ts](../../packages/hub/src/view-rendering/metric-frame.ts)
- [metric-view-frame.ts](../../packages/hub/src/view-rendering/metric-view-frame.ts)

Work:

- Add `RenderOutlineTokens` and `RenderTransparentSurfaceTokens`.
- Resolve active per-theme settings into concrete renderer tokens.
- Pass `transparentSurface` through `MetricRenderAppearance`.
- Apply `backgroundOpacity` only to theme-owned background/chrome fragments in `metric-frame.ts`.
- Do not wrap metric body SVG or any content passed through `placedBodies`.

Why this step stands alone:

- It converts product settings into renderer instructions and changes frame composition. Primitive work must depend on these tokens, not on settings.

### Step 4: Add Shared SVG Outline Helpers And Text Outline Plumbing

Locations:

- [svg-utils.ts](../../packages/hub/src/view-rendering/svg-utils.ts)
- [metric-text-row.ts](../../packages/hub/src/widgets/primitives/metric-text-row.ts)
- [title-card-text-metric.ts](../../packages/hub/src/widgets/primitives/title-card-text-metric.ts)
- [text-metric.ts](../../packages/hub/src/widgets/primitives/text-metric.ts)
- [progress-circle.ts](../../packages/hub/src/widgets/primitives/progress-circle.ts)
- [dual-channel-progress-circle.ts](../../packages/hub/src/widgets/primitives/dual-channel-progress-circle.ts)
- [progress-bar.ts](../../packages/hub/src/widgets/primitives/progress-bar.ts)
- [sparkline.ts](../../packages/hub/src/widgets/primitives/sparkline.ts)
- [dual-channel-sparkline.ts](../../packages/hub/src/widgets/primitives/dual-channel-sparkline.ts)

Work:

- Add shared text outline helper functions in `svg-utils.ts`.
- Add shared shape outline helper functions in `svg-utils.ts`.
- Thread text outline tokens through existing text helper configs.
- Ensure disabled text outline emits no new attributes.

Why this step stands alone:

- It creates the shared drawing primitives used by both text and shape implementations. Primitive files should not duplicate outline math or attribute formatting.

### Step 5: Add Shape Backing To Metric Primitives

Locations:

- [progress-circle.ts](../../packages/hub/src/widgets/primitives/progress-circle.ts)
- [progress-circle-range.ts](../../packages/hub/src/widgets/primitives/progress-circle-range.ts)
- [dual-channel-progress-circle.ts](../../packages/hub/src/widgets/primitives/dual-channel-progress-circle.ts)
- [dual-channel-gauge-ring.ts](../../packages/hub/src/widgets/primitives/dual-channel-gauge-ring.ts)
- [progress-bar.ts](../../packages/hub/src/widgets/primitives/progress-bar.ts)
- [sparkline.ts](../../packages/hub/src/widgets/primitives/sparkline.ts)
- [dual-channel-sparkline.ts](../../packages/hub/src/widgets/primitives/dual-channel-sparkline.ts)
- [single-metric-view.ts](../../packages/hub/src/view-rendering/single-metric-view.ts)
- [dual-metric-view.ts](../../packages/hub/src/view-rendering/dual-metric-view.ts)

Work:

- Pass `transparentSurface.shapeOutline` into primitive configs.
- Add backing shapes only when `isSvgOutlineEnabled(outline)` is true.
- Use stroke-style backing for stroked rings, lines, arcs, and dots.
- Use larger filled rounded rectangle backing for progress bar track/fill.
- Keep grid lines, dividers, chart panel borders, theme chrome, Pixel Window chrome text, and icons unoutlined.
- Keep disabled output stable by not emitting hidden or zero-opacity backing elements.

Why this step stands alone:

- It changes actual metric drawing. It must happen after shared helpers exist and before visual/test verification.

### Step 6: Add Property Inspector Controls

Locations:

- `packages/hub/src/property-inspector/controls/TransparentSurfaceSetting.tsx`
- [AppearanceSettings.tsx](../../packages/hub/src/property-inspector/panels/AppearanceSettings.tsx)
- [GlobalSettingsTab.tsx](../../packages/hub/src/property-inspector/panels/GlobalSettingsTab.tsx)
- [RangeSetting.tsx](../../packages/hub/src/property-inspector/controls/RangeSetting.tsx)

Work:

- Create `TransparentSurfaceSetting.tsx`.
- Render the toggle and three sliders.
- Render helper copy: `Affects theme background and chrome only. Metrics stay opaque.`
- Patch only the active selected theme.
- Add the same controls to global Theme Override.
- Keep sliders visible and enabled when the toggle is off.

Why this step stands alone:

- It is the user-facing settings surface. It must patch the same per-theme contract implemented in storage and render.

### Step 7: Add Tests And Run Verification

Locations:

- [resolver.test.ts](../../packages/hub/src/settings/storage/resolver.test.ts)
- [widget-settings-patch.test.ts](../../packages/hub/src/settings/storage/widget-settings-patch.test.ts)
- [global-settings-patch.test.ts](../../packages/hub/src/settings/storage/global-settings-patch.test.ts)
- [render-appearance-builder.test.ts](../../packages/hub/src/settings/render-appearance-builder.test.ts)
- [metric-frame.test.ts](../../packages/hub/src/view-rendering/metric-frame.test.ts)
- [primitive-smoke.test.ts](../../packages/hub/src/widgets/primitives/primitive-smoke.test.ts)
- [sparkline.test.ts](../../packages/hub/src/widgets/primitives/sparkline.test.ts)
- [dual-channel-sparkline.test.ts](../../packages/hub/src/widgets/primitives/dual-channel-sparkline.test.ts)
- [WidgetSettingsTab.test.ts](../../packages/hub/src/property-inspector/panels/WidgetSettingsTab.test.ts)
- [GlobalSettingsTab.test.ts](../../packages/hub/src/property-inspector/panels/GlobalSettingsTab.test.ts)
- [GlobalSettingsTab.pi.test.tsx](../../packages/hub/src/property-inspector/panels/GlobalSettingsTab.pi.test.tsx)
- [transparent-background-contrast-demo.html](../../artifacts/transparent-background-contrast-demo.html)

Work:

- Add the required unit and PI tests listed in the Required Tests section.
- Run from `packages/hub`:

```powershell
npm run test:unit
npm run test:pi
npm run build
```

- Perform the Manual Verification section.

Why this step stands alone:

- The feature touches storage, rendering, primitives, and PI. Verification must cover all boundaries after implementation is complete.

## Stored Schema

Edit [settings.proto](../../contracts/proto/shometrics/v1/settings.proto).

Add this message near the theme settings messages:

```proto
message TransparentSurfaceSettings {
  optional bool enabled = 1;
  optional uint32 background_opacity_percent = 2 [(buf.validate.field).uint32.lte = 100];
  optional uint32 text_outline_percent = 3 [(buf.validate.field).uint32.lte = 100];
  optional uint32 shape_outline_percent = 4 [(buf.validate.field).uint32.lte = 100];
}
```

Extend theme messages:

```proto
message AppearanceThemeSettings {
  optional MetricTheme selected_theme = 1 [(buf.validate.field).enum = {
    defined_only: true
    not_in: [0]
  }];

  FlatThemeSettings flat = 2;
  CupertinoGlassThemeSettings cupertino_glass = 3;
  ColorFilledThemeSettings color_filled = 4;
  TerminalThemeSettings terminal = 5;
  PixelWindowThemeSettings pixel_window = 6;
}

message FlatThemeSettings {
  MetricPaintSettings paint = 1;
  TransparentSurfaceSettings transparent_surface = 2;
}

message CupertinoGlassThemeSettings {
  MetricPaintSettings paint = 1;
  TransparentSurfaceSettings transparent_surface = 2;
}

message ColorFilledThemeSettings {
  ColorFilledPaintSettings paint = 1;
  TransparentSurfaceSettings transparent_surface = 2;
}

message TerminalThemeSettings {
  optional TerminalThemeVariant variant = 1 [(buf.validate.field).enum = {
    defined_only: true
    not_in: [0]
  }];

  TerminalPaintSettings paint = 2;
  TransparentSurfaceSettings transparent_surface = 3;
}

message PixelWindowThemeSettings {
  TransparentSurfaceSettings transparent_surface = 1;
}
```

Run proto generation from `packages/hub`:

```powershell
npm run generate:proto
```

Do not hand-edit generated files.

## Resolved Settings

Edit [resolved-settings.ts](../../packages/hub/src/settings/resolved-settings.ts).

Add:

```ts
export interface ResolvedTransparentSurfaceSettings {
    readonly enabled: boolean;
    readonly backgroundOpacityPercent: number;
    readonly textOutlinePercent: number;
    readonly shapeOutlinePercent: number;
}
```

Add `transparentSurface: ResolvedTransparentSurfaceSettings` to:

- `ResolvedFlatThemeSettings`
- `ResolvedCupertinoGlassThemeSettings`
- `ResolvedColorFilledThemeSettings`
- `ResolvedTerminalThemeSettings`

Add:

```ts
export interface ResolvedPixelWindowThemeSettings {
    readonly transparentSurface: ResolvedTransparentSurfaceSettings;
}
```

Add `pixelWindow: ResolvedPixelWindowThemeSettings` to `ResolvedAppearanceThemeSettings`.

Edit [default-appearance-settings.ts](../../packages/hub/src/settings/default-appearance-settings.ts).

Add constants:

```ts
const DEFAULT_FLAT_TRANSPARENT_SURFACE_SETTINGS = {
    enabled: false,
    backgroundOpacityPercent: 0,
    textOutlinePercent: 85,
    shapeOutlinePercent: 85,
} satisfies ResolvedTransparentSurfaceSettings;

const DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS = {
    enabled: false,
    backgroundOpacityPercent: 50,
    textOutlinePercent: 85,
    shapeOutlinePercent: 85,
} satisfies ResolvedTransparentSurfaceSettings;
```

Assign them to each theme default:

- `flat.transparentSurface = DEFAULT_FLAT_TRANSPARENT_SURFACE_SETTINGS`
- `cupertinoGlass.transparentSurface = DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS`
- `colorFilled.transparentSurface = DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS`
- `terminal.transparentSurface = DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS`
- `pixelWindow.transparentSurface = DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS`

## Storage Resolver

Edit [resolver.ts](../../packages/hub/src/settings/storage/resolver.ts).

Add imports for the generated transparent surface and pixel window schema/types.

Add a resolver:

```ts
function resolveTransparentSurfaceSettings(
    defaults: ResolvedTransparentSurfaceSettings,
    stored: StoredTransparentSurfaceSettings | undefined,
): ResolvedTransparentSurfaceSettings {
    return {
        enabled: stored?.enabled ?? defaults.enabled,
        backgroundOpacityPercent: resolveStoredPercent(
            stored?.backgroundOpacityPercent,
            defaults.backgroundOpacityPercent,
        ),
        textOutlinePercent: resolveStoredPercent(stored?.textOutlinePercent, defaults.textOutlinePercent),
        shapeOutlinePercent: resolveStoredPercent(stored?.shapeOutlinePercent, defaults.shapeOutlinePercent),
    };
}
```

Use a local percent resolver in this storage resolver file. Do not import `clamp` from SVG or renderer modules; storage must not depend on rendering. The helper must be specific to percentage settings, not a fourth general-purpose clamp:

```ts
function resolveStoredPercent(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(Math.max(value, 0), 100);
}
```

Use `resolveStoredPercent` for all transparent surface percentage fields.

Update theme resolvers:

- `resolveFlatThemeSettings` resolves `transparentSurface`.
- `resolveCupertinoGlassThemeSettings` resolves `transparentSurface`.
- `resolveColorFilledThemeSettings` resolves `transparentSurface`.
- `resolveTerminalThemeSettings` resolves `transparentSurface`.
- Add `resolvePixelWindowThemeSettings`.
- `resolveAppearanceThemeSettings` returns `pixelWindow`.

## Appearance Overrides and Patches

Edit [appearance-overrides.ts](../../packages/hub/src/settings/appearance-overrides.ts).

Add override interface:

```ts
export interface ResolvedTransparentSurfaceSettingsOverride {
    readonly enabled?: boolean | undefined;
    readonly backgroundOpacityPercent?: number | undefined;
    readonly textOutlinePercent?: number | undefined;
    readonly shapeOutlinePercent?: number | undefined;
}
```

Add `transparentSurface?: ResolvedTransparentSurfaceSettingsOverride` to each theme override, including a new `ResolvedPixelWindowThemeSettingsOverride`.

Update `ResolvedAppearanceThemeSettingsOverride` with `pixelWindow`.

Update `mergeResolvedAppearanceSettings` so every theme merges `transparentSurface` shallowly:

```ts
transparentSurface: {
    ...settings.theme.flat.transparentSurface,
    ...override.theme?.flat?.transparentSurface,
}
```

Do the same for `cupertinoGlass`, `colorFilled`, `terminal`, and `pixelWindow`.

Edit [widget-settings-patch.ts](../../packages/hub/src/settings/storage/widget-settings-patch.ts).

Add `applyTransparentSurfacePatch`:

```ts
function applyTransparentSurfacePatch(
    transparentSurface: StoredTransparentSurfaceSettings,
    patch: ResolvedTransparentSurfaceSettingsOverride,
): void {
    if (patch.enabled !== undefined) {
        transparentSurface.enabled = patch.enabled;
    }
    if (patch.backgroundOpacityPercent !== undefined) {
        transparentSurface.backgroundOpacityPercent = patch.backgroundOpacityPercent;
    }
    if (patch.textOutlinePercent !== undefined) {
        transparentSurface.textOutlinePercent = patch.textOutlinePercent;
    }
    if (patch.shapeOutlinePercent !== undefined) {
        transparentSurface.shapeOutlinePercent = patch.shapeOutlinePercent;
    }
}
```

Call it for every theme in `applyAppearanceThemePatch`.

Edit [global-settings-patch.ts](../../packages/hub/src/settings/storage/global-settings-patch.ts).

Add `transparentSurfaceOverrideEnabled?: boolean` and `transparentSurface?: ResolvedTransparentSurfaceSettingsOverride` to `StoredGlobalSettingsPatch`.

`applyTransparentSurfaceOverridePatch` must write one `GlobalTransparentSurfaceOverride.transparentSurface` value by calling the same storage transparent patch helper. Do not write global transparent surface values into `GlobalThemeOverride.theme.*`; global transparent surface is a single cross-widget override and must not force global theme override on.

## Render Tokens

Edit [render-appearance.ts](../../packages/hub/src/view-rendering/render-appearance.ts).

Add:

```ts
export interface RenderOutlineTokens {
    /**
     * V1 always resolves this to black. Keep it in the token so primitives
     * receive concrete drawing instructions instead of hard-coding color.
     * Do not expose a PI color setting in V1.
     */
    readonly color: string;
    /** Single 0..1 outline value from the text/shape outline slider. */
    readonly strength: number;
}

export interface RenderTransparentSurfaceTokens {
    readonly backgroundOpacity: number;
    readonly textOutline: RenderOutlineTokens;
    readonly shapeOutline: RenderOutlineTokens;
}
```

Add `transparentSurface: RenderTransparentSurfaceTokens` to `MetricRenderAppearance`.

Create [render-transparent-surface-resolver.ts](../../packages/hub/src/settings/render-transparent-surface-resolver.ts).

Implementation rules:

- Resolve the active theme's `transparentSurface`.
- If `enabled` is false, return:

```ts
{
    backgroundOpacity: 1,
    textOutline: { color: "#000000", strength: 0 },
    shapeOutline: { color: "#000000", strength: 0 },
}
```

- If `enabled` is true:

```ts
{
    backgroundOpacity: backgroundOpacityPercent / 100,
    textOutline: {
        color: "#000000",
        strength: textOutlinePercent / 100,
    },
    shapeOutline: {
        color: "#000000",
        strength: shapeOutlinePercent / 100,
    },
}
```

Clamp percentages to `0..100` before division.

Edit [render-appearance-builder.ts](../../packages/hub/src/settings/render-appearance-builder.ts) to include `transparentSurface: resolveRenderTransparentSurface(settings)`.

## Theme Background Opacity

Edit [metric-frame.ts](../../packages/hub/src/view-rendering/metric-frame.ts).

Update `renderMetricFrame` options to keep the frame boundary narrow:

- Rename `paints: ThemeStylePaints` to `themePaints: ThemeStylePaints`.
- Add `themeChromeOpacity: number`.
- Do not pass the full `RenderTransparentSurfaceTokens` into `renderMetricFrame`; text and shape outline tokens belong to body/primitive renderers, not the frame renderer.

Wrap theme-owned background/chrome fragments in the existing frame renderer:

- `style.renderBackground(...)`
- `style.renderPanelOverlay?.(...)`
- `style.renderOverlay(...)`

Use a local helper in `metric-frame.ts`:

```ts
function renderThemeSvgFragmentOpacityGroup(themeSvgFragment: string, opacity: number): string {
    if (themeSvgFragment.trim().length === 0) {
        return "";
    }

    if (opacity >= 1) {
        return themeSvgFragment;
    }

    if (opacity <= 0) {
        return "";
    }

    // Theme style renderers return SVG fragments, not full <svg> documents.
    // This opacity group must stay around theme chrome, not metric bodies.
    return `<g opacity="${formatSvgNumber(opacity)}">${themeSvgFragment}</g>`;
}
```

Do not wrap `placedBodies`; metric content must keep its own opacity.

This deliberately fades theme decoration together with the background. That includes glass highlights, Color Filled washes, Terminal scanlines/vignette, and Pixel Window chrome. The PI control group must include short helper copy near the sliders: `Affects theme background and chrome only. Metrics stay opaque.`

Update every caller of `renderMetricFrame` to pass `themePaints: renderAppearance.paints` and `themeChromeOpacity: renderAppearance.transparentSurface.backgroundOpacity`. The existing call path in [metric-view-frame.ts](../../packages/hub/src/view-rendering/metric-view-frame.ts) is the primary place.

Do not modify theme style files just to apply opacity. Their job remains drawing theme-specific background/chrome SVG.

## Text Outline Rendering

Add text outline options to existing text helpers instead of duplicating text drawing at call sites.

Edit [svg-utils.ts](../../packages/hub/src/view-rendering/svg-utils.ts):

- Add optional `outline?: RenderOutlineTokens` to `ConstrainedSvgTextOptions` and `StyledSvgTextOptions`.
- Thread it through `renderStyledSvgText` into `renderConstrainedSvgText`.
- Add these constants:

```ts
const TEXT_OUTLINE_STROKE_WIDTH_FLOOR_RATIO = 0.055;
const TEXT_OUTLINE_STROKE_WIDTH_SCALE_RATIO = 0.08;
```

- Add and export `resolveSvgTextOutlineStrokeWidth`:

```ts
export function resolveSvgTextOutlineStrokeWidth(fontSize: number, outline: RenderOutlineTokens): number {
    return fontSize * (
        TEXT_OUTLINE_STROKE_WIDTH_FLOOR_RATIO
        + TEXT_OUTLINE_STROKE_WIDTH_SCALE_RATIO * outline.strength
    );
}
```

- Add and export `formatSvgTextOutlineAttributes`. It must be the only place that formats the shared outline attributes used by text helpers. It returns either an empty string or a string that starts with one leading space; callers append it directly inside an opening tag.

```ts
export function formatSvgTextOutlineAttributes(options: {
    outline: RenderOutlineTokens | undefined;
    strokeWidth: number;
    lineJoin?: "round";
}): string {
    const outline = options.outline;

    if (!outline || outline.strength <= 0) {
        return "";
    }

    const lineJoinAttribute = options.lineJoin ? ` stroke-linejoin="${options.lineJoin}"` : "";

    return ` stroke="${escapeSvgText(outline.color)}"` +
        ` stroke-opacity="${formatSvgNumber(outline.strength)}"` +
        ` stroke-width="${formatSvgNumber(options.strokeWidth)}"` +
        `${lineJoinAttribute} paint-order="stroke fill"`;
}
```

- If `outline.strength > 0`, compute text stroke width with:

```ts
const textOutlineStrokeWidth = resolveSvgTextOutlineStrokeWidth(fontSize, outline);
```

- Use `formatSvgTextOutlineAttributes({ outline, strokeWidth: textOutlineStrokeWidth, lineJoin: "round" })` to add these attributes to the `<text>` element:

```ts
stroke="${escapeSvgText(outline.color)}"
stroke-opacity="${formatSvgNumber(outline.strength)}"
stroke-width="${formatSvgNumber(textOutlineStrokeWidth)}"
stroke-linejoin="round"
paint-order="stroke fill"
```

- If outline is disabled, emit no new text attributes. Disabled output must match current SVG except for unrelated formatting changes that the implementation does not introduce.

Edit [metric-text-row.ts](../../packages/hub/src/widgets/primitives/metric-text-row.ts):

- Add `outline?: RenderOutlineTokens` to `MetricTextRowOptions`.
- Apply the same text outline attributes to the top-level `<text>` element by importing `formatSvgTextOutlineAttributes` and `resolveSvgTextOutlineStrokeWidth` from `svg-utils`.
- Use value font size for width calculation. The unit `<tspan>` inherits the same stroke width in V1; this is accepted to keep the row as one text element.

```ts
stroke-width = resolveSvgTextOutlineStrokeWidth(valueFontSize, outline)
```

Do not outline title-card helper text separately by custom code. The title-card renderer already calls `renderConstrainedSvgText`; pass the outline token to those calls through its config.

## Shape Outline Rendering

Add shape outline tokens to primitive configs. The primitives should receive `RenderOutlineTokens`, not the product setting.

Add the following small shared helpers to [svg-utils.ts](../../packages/hub/src/view-rendering/svg-utils.ts). Do not create a generic shape-geometry abstraction or a new background module; primitives still render their own local SVG element before the foreground element.

```ts
const SHAPE_OUTLINE_EXTRA_WIDTH_FLOOR_RATIO = 0.18;
const SHAPE_OUTLINE_EXTRA_WIDTH_SCALE_RATIO = 0.52;

export function isSvgOutlineEnabled(outline: RenderOutlineTokens | undefined): outline is RenderOutlineTokens {
    return outline !== undefined && outline.strength > 0;
}

export function resolveSvgShapeOutlineStrokeWidth(
    foregroundStrokeWidth: number,
    outline: RenderOutlineTokens | undefined,
): number {
    return foregroundStrokeWidth + resolveSvgShapeOutlineExtraWidth(foregroundStrokeWidth, outline);
}

export function resolveSvgShapeOutlineExtraWidth(
    referenceSize: number,
    outline: RenderOutlineTokens | undefined,
): number {
    if (!isSvgOutlineEnabled(outline)) {
        return 0;
    }

    return referenceSize * (
        SHAPE_OUTLINE_EXTRA_WIDTH_FLOOR_RATIO
        + SHAPE_OUTLINE_EXTRA_WIDTH_SCALE_RATIO * outline.strength
    );
}

export function resolveSvgFilledShapeOutlinePadding(
    referenceSize: number,
    outline: RenderOutlineTokens | undefined,
): number {
    return resolveSvgShapeOutlineExtraWidth(referenceSize, outline) / 2;
}

export function formatSvgShapeOutlineStrokeAttributes(options: {
    outline: RenderOutlineTokens | undefined;
    strokeWidth: number;
    lineCap?: "butt" | "round" | "square";
    lineJoin?: "round";
}): string {
    const outline = options.outline;

    if (!isSvgOutlineEnabled(outline)) {
        return "";
    }

    const lineCapAttribute = options.lineCap ? ` stroke-linecap="${options.lineCap}"` : "";
    const lineJoinAttribute = options.lineJoin ? ` stroke-linejoin="${options.lineJoin}"` : "";

    return ` stroke="${escapeSvgText(outline.color)}"` +
        ` stroke-opacity="${formatSvgNumber(outline.strength)}"` +
        ` stroke-width="${formatSvgNumber(options.strokeWidth)}"` +
        ` fill="none"${lineCapAttribute}${lineJoinAttribute}`;
}
```

`formatSvgShapeOutlineStrokeAttributes` returns either an empty string or a string that starts with one leading space; callers append it directly inside an opening tag. This matches `formatSvgTextOutlineAttributes`.

For stroked shapes with a foreground stroke width, draw a black backing shape immediately before the foreground shape:

```ts
const backingStrokeWidth = resolveSvgShapeOutlineStrokeWidth(strokeWidth, outline);
```

Backing attributes:

```svg
stroke="#000000"
stroke-opacity="{outline.strength}"
stroke-width="{backingStrokeWidth}"
fill="none"
stroke-linecap="{same as foreground}"
stroke-linejoin="{same as foreground when foreground has it}"
```

Use `formatSvgShapeOutlineStrokeAttributes` to emit these attributes. Do not duplicate the stroke attribute formatting in every primitive.

For filled gauge arc segments produced by annular paths, create the backing by rendering the same annular arc path with `stroke="black"`, `stroke-opacity`, `stroke-width = resolveSvgShapeOutlineExtraWidth(options.strokeWidth, outline)`, and `fill="none"` before the filled foreground path. This avoids changing the colored fill geometry.

For marker dots and latest-point dots, draw a black circle behind the foreground dot:

```ts
const backingRadius = radius + resolveSvgFilledShapeOutlinePadding(radius * 2, outline);
```

For filled rounded rectangles, such as progress bars, do not use `formatSvgShapeOutlineStrokeAttributes`. Filled rectangles have no foreground stroke width, and a `fill="none"` backing stroke is underspecified. Draw a slightly larger black filled rounded rectangle behind the foreground rectangle:

```ts
const backingPadding = resolveSvgFilledShapeOutlinePadding(rect.height, outline);

const backingRect = {
    xCoordinate: rect.xCoordinate - backingPadding,
    yCoordinate: rect.yCoordinate - backingPadding,
    width: rect.width + backingPadding * 2,
    height: rect.height + backingPadding * 2,
    radius: rect.radius + backingPadding,
};
```

Render the backing with `fill="${outline.color}"` and `opacity="${outline.strength}"`. Use `rect.height` as the reference size so thin bars receive a proportional halo. Only render this backing when `isSvgOutlineEnabled(outline)` is true.

Only render a filled rectangle backing when the foreground filled rectangle will be rendered and its width and height are both greater than `0`. A zero-progress bar must not produce a standalone black cap.

Apply shape outline to these primitives in V1:

- `progress-circle.ts`
  - ring track
  - progress ring
  - gauge range arcs
  - gauge marker dot, by drawing a larger black circle behind the marker
- `dual-channel-progress-circle.ts`
  - track halves
  - progress halves
  - dual gauge range arcs
  - dual gauge marker dots
- `progress-bar.ts`
  - track rectangle
  - filled value rectangle
  - render each backing as a larger black filled rounded rectangle using `resolveSvgFilledShapeOutlinePadding(rect.height, outline)`
  - do not outline text, labels, separators, or decorative background panels here; text outline is handled by text helpers
- `sparkline.ts`
  - line path
  - latest point dot
  - do not outline grid lines or baseline lines
- `dual-channel-sparkline.ts`
  - positive and negative line paths
  - latest point dots if present
  - do not outline grid lines or baseline lines

Do not outline:

- dividers
- grid lines
- chart panel borders
- theme chrome
- Pixel Window title text or window controls
- icons in V1

Shape outline is required in V1. Do not split this implementation into a text-only first pass, because visual testing showed text-only outlines leave circle/bar/line shapes unreadable on custom backgrounds.

Only emit backing shapes when `isSvgOutlineEnabled(outline)` is true. Disabled outline must not add hidden or zero-opacity elements; this keeps current output stable and avoids extra work on the hot render path.

## View Wiring

Edit [single-metric-view.ts](../../packages/hub/src/view-rendering/single-metric-view.ts) and [dual-metric-view.ts](../../packages/hub/src/view-rendering/dual-metric-view.ts).

Add `transparentSurface: RenderTransparentSurfaceTokens` to the `visual` object.

Pass:

- `transparentSurface.textOutline` to text helper configs.
- `transparentSurface.shapeOutline` to shape primitive configs.

Update every default primitive config with disabled outline tokens so direct tests that instantiate defaults keep current behavior.

## Property Inspector

Use the existing [RangeSetting.tsx](../../packages/hub/src/property-inspector/controls/RangeSetting.tsx).

Create `packages/hub/src/property-inspector/controls/TransparentSurfaceSetting.tsx`. It must render:

- one checkbox/toggle for `Transparent background`
- three `RangeSetting` controls:
  - `Background opacity`
  - `Text outline`
  - `Shape outline`

The control group must show concise helper copy: `Affects theme background and chrome only. Metrics stay opaque.`

Place the controls inside the existing Theme section in [AppearanceSettings.tsx](../../packages/hub/src/property-inspector/panels/AppearanceSettings.tsx), below `ThemeSetting` and `TerminalVariantSetting`.

Patch the active selected theme only:

- selected `flat` patches `appearance.theme.flat.transparentSurface`
- selected `cupertino-glass` patches `appearance.theme.cupertinoGlass.transparentSurface`
- selected `color-filled` patches `appearance.theme.colorFilled.transparentSurface`
- selected `terminal` patches `appearance.theme.terminal.transparentSurface`
- selected `pixel-window` patches `appearance.theme.pixelWindow.transparentSurface`

Add the same controls as a global Transparent Surface override section in [GlobalSettingsTab.tsx](../../packages/hub/src/property-inspector/panels/GlobalSettingsTab.tsx). They must patch `transparentSurfaceOverrideEnabled` and `transparentSurface`; they must not patch a selected theme inside the global theme override.

When `Transparent background` is off, keep sliders visible and enabled. This lets the user stage values before enabling the feature.

## Rejected Options

These alternatives were considered and rejected:

- Auto mode based on background:
  - Benefit: fewer user controls.
  - Why considered: it sounds convenient for a transparent-background feature.
  - Rejected because the renderer cannot inspect the user's external background. Any "auto" mode would only inspect our own settings and would mislead users.

- Whole SVG opacity:
  - Benefit: trivial implementation.
  - Why considered: it appears to solve transparency with one value.
  - Rejected because it fades metric text and shapes, making the widget less readable.

- Global per-theme transparent-background storage:
  - Benefit: can preserve separate global values for each theme.
  - Why considered: widget-level transparent surface is stored per theme.
  - Rejected because global transparent surface expresses one cross-widget readability override for the user's external background. Storing one value also lets users apply global transparency without forcing global theme override.

- New background module between frame rendering and `setImage`:
  - Benefit: isolates the new feature.
  - Why considered: background opacity is a cross-theme behavior.
  - Rejected because it creates ad hoc plumbing outside the current theme/frame ownership model. The existing `metric-frame.ts` and theme style pipeline already own background rendering.

- Passing `enabled` into low-level SVG primitives:
  - Benefit: direct mapping from settings to render code.
  - Why considered: it mirrors the PI toggle.
  - Rejected because primitives should not know product intent. They should receive concrete outline/background drawing tokens.

- Icon outline in V1:
  - Benefit: icons may also need contrast on busy backgrounds.
  - Why considered: icons are foreground content.
  - Rejected for V1 because icons are arbitrary SVG fragments from catalogs/status icons. Text and metric shapes are the main readability problem and have predictable rendering paths.

- Text-only transparent support as the first implementation:
  - Benefit: lower implementation and regression risk.
  - Why considered: text outline can be centralized more easily than shape backing.
  - Rejected because the feature remains visually poor without shape backing; circle, bar, and line shapes become hard to read on custom backgrounds.

- Stroke-style backing for progress bar rectangles:
  - Benefit: could reuse the stroked-shape outline helper.
  - Why considered: progress bars are metric shapes and need backing on transparent/custom backgrounds.
  - Rejected because progress bar track and fill are filled rectangles with no foreground stroke width. A stroke-only backing would force the implementer to invent a fake stroke width and would not match the intended "larger shape behind foreground" model. V1 uses larger filled rounded rectangles for bars.

- Generic shape geometry abstraction:
  - Benefit: could centralize every backing shape into one renderer API.
  - Why considered: several primitives need backing geometry.
  - Rejected because current primitives draw different SVG element types and already own their local geometry. A small shared outline helper avoids duplicated constants and attributes without introducing a broad new drawing abstraction.

- Making Flat / Default transparent by default in this implementation:
  - Benefit: users with external backgrounds get the desired behavior without PI changes.
  - Why considered: black outlines should be invisible on pure black, so Flat may be visually unchanged.
  - Rejected for this implementation because it must be verified first. Keep default off; manually enable Flat and compare against current output on pure black.

## Required Tests

Add or update these tests:

- Storage resolver tests:
  - Defaults resolve disabled for every theme.
  - Flat defaults store `0/85/85`.
  - Non-Flat defaults store `50/85/85`.
  - Stored values clamp to `0..100`.
  - Pixel Window resolves `transparentSurface`.

- Widget settings patch tests:
  - Patching each theme writes `transparent_surface`.
  - Pixel Window patch creates `pixel_window.transparent_surface`.

- Global settings patch tests:
  - Global transparent surface override writes one `transparent_surface` value.
  - Global transparent surface override applies without replacing widget theme.

- Appearance merge tests:
  - Sparse overrides merge transparent surface values without replacing paint.

- Render appearance tests:
  - Disabled feature resolves `backgroundOpacity: 1` and outline opacity/strength `0`.
  - Enabled Flat with defaults resolves `backgroundOpacity: 0`, text outline `0.85`, shape outline `0.85`.
  - Enabled non-Flat defaults resolve `backgroundOpacity: 0.5`.

- Frame tests:
  - Background/chrome layers are wrapped or omitted according to background opacity.
  - Metric body SVG is not wrapped by background opacity.

- Primitive tests:
  - Disabled outline output remains equivalent to current behavior.
  - Text helpers emit `paint-order="stroke fill"` only when outline is enabled.
  - Circle, dual circle, bar, sparkline, and dual sparkline render black backing shapes before foreground shapes when shape outline is enabled.
  - Progress bar track and fill use larger filled rounded rectangle backings, not stroke-only backings.
  - Grid lines, dividers, chart panel borders, Pixel Window chrome text, and icons are not outlined.

- PI tests:
  - Widget Appearance theme section renders toggle and three sliders.
  - Changing controls patches the active selected theme.
  - Global Transparent Surface override renders the same controls and patches the global transparent surface override.

Run from `packages/hub`:

```powershell
npm run test:unit
npm run test:pi
npm run build
```

## Manual Verification

Use [transparent-background-contrast-demo.html](../../artifacts/transparent-background-contrast-demo.html) as the visual reference.

After implementation:

1. Render current Flat / Default with transparent support disabled on pure black. It must match today's output.
2. Enable Flat / Default transparent support with defaults on pure black. The visual result should be close enough that black outlines/backing are not perceptible against black.
3. Enable Flat / Default transparent support over `SummitEverest.jpg`. Text and metric shapes must remain readable for circle, progress bar, and sparkline views.
4. Enable each non-Flat theme with defaults over `SummitEverest.jpg`. Confirm background opacity affects only theme-owned surface/chrome layers and does not fade foreground metrics.
5. Enable Pixel Window and lower background opacity. Confirm window chrome fades while metric body opacity remains unchanged. Confirm Pixel Window title/chrome text is not outlined.

Do not change default-on behavior based on these checks in the same implementation. Record the result separately for a later product decision.
