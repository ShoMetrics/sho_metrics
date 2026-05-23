# Theme-Scoped Paint Settings Refactor Plan

## Status

Implementation reference for the theme-scoped paint refactor.

## Goal

Fix the Black & White and Terminal theme conflict by making paint settings
theme-scoped instead of globally scoped under `appearance.paint`.

The current bug:

1. User selects Black & White while using a non-terminal theme.
2. Stored settings write `appearance.paint.metric.color_mode = BLACK_WHITE`.
3. User switches to Terminal.
4. The renderer still reads `appearance.paint.metric.colorMode`.
5. Terminal phosphor paint is lowered to Black & White.

The bug is a settings ownership bug. Terminal should not consume paint intent
that belongs to another theme.

## Existing Paint Vocabulary

Use `paint`, not `color`, for the settings and render concepts.

`color` should mean a single color value or a user-facing color input, such as
`#3b82f6`, `rgba(...)`, `usageColor`, or `lowColor`.

`paint` should mean a visual painting model. Paint can include:

- color mode, such as solid, multi-color, or black-white;
- one or more color values;
- threshold bands;
- gradient settings;
- background fill shape;
- terminal phosphor palette;
- renderer-ready foreground/background tokens.

Before this refactor, the repo already used `paint` this way:

- `contracts/proto/shometrics/v1/settings.proto`
  - `AppearancePaintSettings`
  - `MetricPaintSettings`
  - `ColorFilledPaintSettings`
  - `GlobalPaintOverride`
- `packages/hub/src/settings/resolved-settings.ts`
  - `ResolvedAppearancePaintSettings`
  - `ResolvedMetricPaintSettings`
  - `ResolvedColorFilledPaintSettings`
  - `ResolvedGlobalPaintOverride`
- `packages/hub/src/view-rendering/render-appearance.ts`
  - `RenderPaintTokens`
  - `RenderPaintConstraint`
  - `RenderBackgroundFill`
- `packages/hub/src/widgets/styles/theme-style.ts`
  - `ThemeStylePaints`

Do not introduce a broad `color` settings namespace to replace these names.
That would make the model less precise because not every theme paint setting is
just a color value.

## Product Model

View and theme have different responsibilities.

`view` owns layout:

- which primitive is used: circle, text, bar, line;
- where text and graphics are placed;
- view variants, such as circle full-ring, minimal, or gauge.

`theme` owns visual language:

- typography;
- surface treatment;
- background/frame treatment;
- how paint settings are interpreted;
- theme-specific effects.

`colorMode` is not an independent global axis. It is a field inside a
theme-owned paint model. The same label can mean different paint surfaces in
different themes:

| Theme | Paint surface controlled by color mode |
| --- | --- |
| Flat | Metric accent: ring, large text, bar fill, line stroke |
| Cupertino Glass | Metric accent for now; future glass tint and text paint live under the same theme |
| Color Filled | Background fill |
| Terminal | Currently fixed phosphor palette; future terminal palette selection |

## Storage Decision

Store widget appearance paint per theme.

Do not store one shared `appearance.paint.metric` and then decide at render
time which themes should consume it. That is the source of the current bug.

Do not introduce an intermediate "ordinary visual group" for Flat and
Cupertino Glass. "Visual similarity" is not a stable product boundary. Future
Glass settings can include glass tint, blur treatment, or text paint that Flat
does not have.

The storage model should make this true:

- switching view keeps the active theme's paint settings;
- switching theme switches to that theme's own paint settings;
- defaults may depend on both theme and view;
- resolver may share default constants internally, but stored user intent stays
theme-owned.

This decision is for per-widget appearance settings. Global paint override is a
separate product concept: it is a temporary cross-widget override that unifies
paint for every widget. It follows the effective theme selected by global theme
override or by each widget, and it must not become a per-theme preference store.

## Assumptions

These assumptions are part of this plan and must be changed explicitly if the
product direction changes.

1. The app has not shipped to production. A breaking settings proto refactor is
   acceptable.
2. No migration or compatibility adapter is required for old dev settings.
   Existing local settings that still contain `appearance.paint` can be reset or
   allowed to decode as unknown fields.
3. Flat and Cupertino Glass do not share stored paint, even if their first
   implementation uses the same paint message shape and default constants.
4. Terminal custom color controls are not added in this refactor. Terminal gets
   a theme-owned paint slot or resolved paint model, but the PI can continue to
   hide terminal color controls until the terminal color feature is implemented.
5. Text view default Black & White applies only to metric-accent themes whose
   active paint surface is metric accent, currently Flat and Cupertino Glass.
   It does not change Color Filled background paint and does not affect
   Terminal.
6. Network's current circle default of solid channel colors remains a
   target-specific default for metric-accent themes, unless the selected view
   has a stronger theme/view default such as text Black & White.
7. Global paint override remains a product feature, but it is intentionally not
   stored per theme. It is a global temporary override: when enabled, users
   adjust one active paint surface instead of tuning each widget or each theme.
8. Global paint override follows the effective theme. Flat and Cupertino Glass
   consume the global metric paint override, Color Filled consumes the global
   color-filled paint override, and Terminal ignores global paint until
   Terminal exposes configurable paint.

## Non-Goals

Do not add these in this refactor:

- terminal custom color UI;
- custom fonts;
- per-view stored paint;
- per-widget migration code for old production users;
- a generic settings registry or schema-driven PI abstraction;
- maps, `Struct`, `Any`, JSON blobs, or encoded string submodels in proto.

## Target Stored Proto Shape

Update `contracts/proto/shometrics/v1/settings.proto`.

Current shape:

```proto
message AppearanceSettings {
  AppearanceViewSettings view = 1;
  AppearanceThemeSettings theme = 2;
  AppearancePaintSettings paint = 3;
  LineAppearanceSettings line = 4;
}

message AppearanceThemeSettings {
  optional MetricTheme selected_theme = 1;
  TerminalThemeSettings terminal = 2;
}

message AppearancePaintSettings {
  MetricPaintSettings metric = 1;
  ColorFilledPaintSettings color_filled = 2;
}
```

Target shape:

```proto
message AppearanceSettings {
  AppearanceViewSettings view = 1;
  AppearanceThemeSettings theme = 2;
  LineAppearanceSettings line = 3;
}

message AppearanceThemeSettings {
  optional MetricTheme selected_theme = 1 [(buf.validate.field).enum = {
    defined_only: true
    not_in: [0]
  }];

  FlatThemeSettings flat = 2;
  CupertinoGlassThemeSettings cupertino_glass = 3;
  ColorFilledThemeSettings color_filled = 4;
  TerminalThemeSettings terminal = 5;
}

message FlatThemeSettings {
  // Metric accent paint controls ring, large text, bar fill, and line stroke.
  MetricPaintSettings paint = 1;
}

message CupertinoGlassThemeSettings {
  // Metric accent paint controls foreground metric emphasis for now. Future
  // glass tint or glass material settings belong in this message, not in Flat.
  MetricPaintSettings paint = 1;
}

message ColorFilledThemeSettings {
  // Color Filled paint controls the widget background fill. Foreground paint is
  // derived by the renderer for legibility.
  ColorFilledPaintSettings paint = 1;
}

message TerminalThemeSettings {
  optional TerminalThemeVariant variant = 1 [(buf.validate.field).enum = {
    defined_only: true
    not_in: [0]
  }];

  // Add TerminalPaintSettings here when terminal color customization is added.
  // Do not reuse MetricPaintSettings for Terminal.
}
```

Keep `MetricPaintSettings` and `ColorFilledPaintSettings` as reusable message
shapes. Move their ownership under the relevant theme messages.

### Optional Terminal Paint Field

If the implementation wants to reserve a concrete terminal paint slot now, add:

```proto
message TerminalThemeSettings {
  optional TerminalThemeVariant variant = 1 [(buf.validate.field).enum = {
    defined_only: true
    not_in: [0]
  }];

  TerminalPaintSettings paint = 2;
}

message TerminalPaintSettings {
  optional TerminalPalette palette = 1 [(buf.validate.field).enum = {
    defined_only: true
    not_in: [0]
  }];
}

enum TerminalPalette {
  TERMINAL_PALETTE_UNSPECIFIED = 0;
  TERMINAL_PALETTE_GREEN = 1;
}
```

Do not add amber/cyan/custom enum values until the product actually exposes
them. Proto enums should represent stable closed sets, not speculative UI.

## Global Override Proto Shape

Global paint override must stay global.

This is the main exception to per-theme stored appearance paint. The product
meaning of global paint override is "temporarily apply one unified paint choice
to all widgets." It is not "store separate global Flat, Glass, and Color Filled
preferences." Users should not tune those branches one by one while global paint
override is active.

Current shape:

```proto
message GlobalPaintOverride {
  optional bool enabled = 1;
  GlobalMetricPaintSettings metric = 2;
  ColorFilledPaintSettings color_filled = 3;
}
```

Target shape:

```proto
message GlobalPaintOverride {
  // One switch controls the whole color override subsection. Per-theme enable
  // flags are intentionally not supported.
  optional bool enabled = 1;

  // Used when the effective theme is Flat or Cupertino Glass.
  GlobalMetricPaintSettings metric = 2;

  // Used when the effective theme is Color Filled.
  ColorFilledPaintSettings color_filled = 3;

  // Add terminal paint override here only when Terminal exposes configurable
  // paint. Until then Terminal ignores global paint override.
}
```

`GlobalMetricPaintSettings` remains intentionally simpler than widget-level
`MetricPaintSettings`: one solid color and one multi-color set are expanded to
all metric channels by the resolver.

When global theme override is enabled, global paint override follows that
selected theme. When global theme override is disabled, global paint override
follows each widget's effective theme at resolve time. Either way, the global
paint values are a single global override, not per-theme user preferences.

## Target Resolved Settings Shape

Update `packages/hub/src/settings/resolved-settings.ts`.

Current shape:

```ts
export interface ResolvedAppearanceSettings {
    readonly view: ResolvedAppearanceViewSettings;
    readonly theme: ResolvedAppearanceThemeSettings;
    readonly paint: ResolvedAppearancePaintSettings;
    readonly line: ResolvedLineAppearanceSettings;
}

export interface ResolvedAppearanceThemeSettings {
    readonly selectedTheme: MetricTheme;
    readonly terminal: ResolvedTerminalThemeSettings;
}

export interface ResolvedAppearancePaintSettings {
    readonly metric: ResolvedMetricPaintSettings;
    readonly colorFilled: ResolvedColorFilledPaintSettings;
}
```

Target shape:

```ts
export interface ResolvedAppearanceSettings {
    readonly view: ResolvedAppearanceViewSettings;
    readonly theme: ResolvedAppearanceThemeSettings;
    readonly line: ResolvedLineAppearanceSettings;
}

export interface ResolvedAppearanceThemeSettings {
    readonly selectedTheme: MetricTheme;
    readonly flat: ResolvedFlatThemeSettings;
    readonly cupertinoGlass: ResolvedCupertinoGlassThemeSettings;
    readonly colorFilled: ResolvedColorFilledThemeSettings;
    readonly terminal: ResolvedTerminalThemeSettings;
}

export interface ResolvedFlatThemeSettings {
    readonly paint: ResolvedMetricPaintSettings;
}

export interface ResolvedCupertinoGlassThemeSettings {
    readonly paint: ResolvedMetricPaintSettings;
}

export interface ResolvedColorFilledThemeSettings {
    readonly paint: ResolvedColorFilledPaintSettings;
}

export interface ResolvedTerminalThemeSettings {
    readonly variant: TerminalThemeVariant;
}
```

If `TerminalPaintSettings` is added now, then `ResolvedTerminalThemeSettings`
also owns:

```ts
readonly paint: ResolvedTerminalPaintSettings;
```

Remove `ResolvedAppearancePaintSettings`. Do not keep a parallel resolved
`appearance.paint` compatibility mirror.

## Default Settings

Update `packages/hub/src/settings/default-appearance-settings.ts`.

The default object should follow the resolved shape:

```ts
export const DEFAULT_APPEARANCE_SETTINGS: ResolvedAppearanceSettings = {
    view: {
        selectedView: "circle",
        circleVariant: "full-ring",
    },
    theme: {
        selectedTheme: "flat",
        flat: {
            paint: DEFAULT_FLAT_METRIC_PAINT_SETTINGS,
        },
        cupertinoGlass: {
            paint: DEFAULT_CUPERTINO_GLASS_METRIC_PAINT_SETTINGS,
        },
        colorFilled: {
            paint: DEFAULT_COLOR_FILLED_PAINT_SETTINGS,
        },
        terminal: {
            variant: "clean",
        },
    },
    line: {
        lineSmoothingPercent: 75,
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
    },
};
```

Flat and Cupertino Glass may share default constants internally:

```ts
const DEFAULT_METRIC_ACCENT_PAINT_SETTINGS: ResolvedMetricPaintSettings = { ... };

const DEFAULT_FLAT_METRIC_PAINT_SETTINGS = DEFAULT_METRIC_ACCENT_PAINT_SETTINGS;
const DEFAULT_CUPERTINO_GLASS_METRIC_PAINT_SETTINGS = DEFAULT_METRIC_ACCENT_PAINT_SETTINGS;
```

Sharing constants is allowed. Sharing stored user intent is not.

## Resolver Rules

Update `packages/hub/src/settings/storage/resolver.ts`.

### Resolve Order

Resolve appearance in this order:

1. target defaults, such as network default solid metric paint;
2. theme/view default overlays, such as text default Black & White;
3. stored sparse appearance settings;
4. global overrides.

The resolver must not write resolved defaults back to stored settings.

Stored user intent wins over every default. Theme/view defaults are applied to
the default object before stored sparse settings are merged. This means
Network + text + Flat defaults to Black & White only when stored Flat paint
color mode is absent.

### Theme/View Defaults

Replace the current `resolveAppearanceDefaultsForViewAndTheme()` logic with a
theme-scoped version.

Rules:

- Flat + text: default `theme.flat.paint.colorMode` to `black-white` when the
  stored Flat paint color mode is absent.
- Cupertino Glass + text: default `theme.cupertinoGlass.paint.colorMode` to
  `black-white` when the stored Cupertino Glass paint color mode is absent.
- Color Filled + text: do not default background paint to Black & White.
- Terminal + any view: do not read or default Flat/Cupertino/Color Filled paint.

Target-specific defaults still apply before view/theme defaults. Example:

- Network + circle + Flat defaults to solid Flat metric paint.
- Network + text + Flat defaults to Black & White Flat metric paint.

This precedence is intentional: view/theme defaults beat target-specific
defaults, and stored user values beat both.

### No Active Theme Pollution

Resolve every theme's stored/default settings eagerly into a complete object.
Only the active theme's settings should affect render paint.

Eager resolution keeps `ResolvedAppearanceThemeSettings` non-optional for every
theme and keeps consumers simple. The cost is negligible because this runs on
settings changes, not on every SVG primitive.

Do not copy active theme paint into another theme.

Do not mirror Flat paint into Cupertino Glass.

Do not let Terminal inspect Flat or Cupertino Glass paint.

## Render Paint Resolver

Update `packages/hub/src/settings/render-paint-resolver.ts`.

Current bug source:

```ts
function activePaintColorMode(settings: ResolvedAppearanceSettings): ColorMode {
    if (settings.theme.selectedTheme === "color-filled") {
        return settings.paint.colorFilled.colorMode;
    }

    return settings.paint.metric.colorMode;
}
```

This must be deleted. The active paint source must be selected by theme.

Target helper shape:

```ts
function activeThemePaint(settings: ResolvedAppearanceSettings):
    | { readonly theme: "flat"; readonly paint: ResolvedMetricPaintSettings }
    | { readonly theme: "cupertino-glass"; readonly paint: ResolvedMetricPaintSettings }
    | { readonly theme: "color-filled"; readonly paint: ResolvedColorFilledPaintSettings }
    | { readonly theme: "terminal"; readonly variant: TerminalThemeVariant } {
    switch (settings.theme.selectedTheme) {
        case "flat":
            return { theme: "flat", paint: settings.theme.flat.paint };
        case "cupertino-glass":
            return { theme: "cupertino-glass", paint: settings.theme.cupertinoGlass.paint };
        case "color-filled":
            return { theme: "color-filled", paint: settings.theme.colorFilled.paint };
        case "terminal":
            return { theme: "terminal", variant: settings.theme.terminal.variant };
    }
}
```

Rules:

- Flat and Cupertino Glass use `ResolvedMetricPaintSettings`.
- Color Filled uses `ResolvedColorFilledPaintSettings` and derives neutral
  foreground paint.
- Terminal uses terminal fixed palette for now.
- Black & White constraint is active only when the active theme paint says so.
- Terminal never lowers itself because some other theme has Black & White.

`buildColorConfigFromAppearance()` must also switch by active theme. It should
not read an inactive theme's paint settings.

## Action View Builders

Search for direct reads of `appearance.paint.metric`.

Current known call sites:

- `packages/hub/src/actions/network/view-builder.ts`
- `packages/hub/src/actions/disk/view-builder.ts`

These direct reads must be replaced with helper functions from
`render-paint-resolver.ts`.

Do not make action builders understand theme internals. Action builders can ask
for:

- a channel color config: `buildColorConfigFromAppearance(appearance, channel)`;
- a solid-compatible color mode for the active metric-accent theme, if needed
  for action-specific `appearanceOverride`.

If a helper is needed, add a narrowly named function such as:

```ts
export function resolveActiveMetricAccentColorMode(appearance: ResolvedAppearanceSettings): ColorMode {
    switch (appearance.theme.selectedTheme) {
        case "flat":
            return appearance.theme.flat.paint.colorMode;
        case "cupertino-glass":
            return appearance.theme.cupertinoGlass.paint.colorMode;
        case "color-filled":
        case "terminal":
            return "solid";
    }
}
```

Then call the existing `resolveSolidMetricColorMode()` on that result if the
action override needs to collapse multi-color to solid.

## Property Inspector

Update the PI to patch the active theme's paint through one centralized helper.

Files:

- `packages/hub/src/property-inspector/panels/ColorSettings.tsx`
- `packages/hub/src/property-inspector/panels/GlobalSettingsTab.tsx`
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
- `packages/hub/src/settings/storage/global-settings-patch.ts`
- `packages/hub/src/settings/appearance-overrides.ts`

Rules:

- Flat color controls patch `appearance.theme.flat.paint`.
- Cupertino Glass color controls patch `appearance.theme.cupertinoGlass.paint`.
- Color Filled color controls patch `appearance.theme.colorFilled.paint`.
- Terminal color controls remain hidden until terminal paint customization is
  implemented.
- Global paint controls patch `global.paint.metric` when the effective global
  theme is Flat or Cupertino Glass.
- Global paint controls patch `global.paint.colorFilled` when the effective
  global theme is Color Filled.
- Global paint controls remain hidden when the effective global theme is
  Terminal.

Do not write to a shared `appearance.paint.metric` path. That path should no
longer exist.

Do not scatter `if theme === "flat"` patch dispatch across PI components. Add a
small helper owned by the settings/PI boundary, for example:

```ts
function buildActiveThemePaintPatch(
    selectedTheme: MetricTheme,
    paintPatch: ActiveThemePaintPatch,
): ResolvedAppearanceSettingsOverride
```

The exact type can be adjusted during implementation, but the ownership rule is
fixed: PI controls call one helper to build the theme-owned patch path.
Individual controls should not manually construct `appearance.theme.flat.paint`
or `appearance.theme.cupertinoGlass.paint`.

### Reset To Defaults

Resetting widget paint from the PI should reset only the active theme's paint
branch. This matches per-theme stored intent: resetting Flat does not erase
Cupertino Glass or Color Filled paint.

Resetting global paint override should reset only the global paint override
model. It should not mutate widget-level per-theme paint settings.

## Storage Patch Types

Patch types must mirror the new theme-scoped ownership.

Widget patch example:

```ts
onSettingsPatch({
    appearance: {
        theme: {
            flat: {
                paint: { colorMode: "black-white" },
            },
        },
    },
});
```

Color Filled patch example:

```ts
onSettingsPatch({
    appearance: {
        theme: {
            colorFilled: {
                paint: { colorMode: "solid" },
            },
        },
    },
});
```

Global patch example:

```ts
onSettingsPatch({
    paint: {
        metric: { colorMode: "black-white" },
    },
});
```

Exact patch type names should follow the existing style:

- `ResolvedFlatThemeSettingsOverride`
- `ResolvedCupertinoGlassThemeSettingsOverride`
- `ResolvedColorFilledThemeSettingsOverride`
- `ResolvedMetricPaintSettingsOverride`
- `ResolvedColorFilledPaintSettingsOverride`

Avoid a generic map keyed by theme name. Theme is a stable closed enum and each
theme can grow different fields.

## Tests To Update Or Add

### Resolver Tests

Update `packages/hub/src/settings/storage/resolver.test.ts`.

Add tests:

1. Flat text defaults Flat paint to Black & White.
2. Cupertino Glass text defaults Cupertino Glass paint to Black & White.
3. Flat Black & White does not affect Terminal.
4. Flat Black & White does not affect Cupertino Glass.
5. Color Filled uses Color Filled paint and does not consume Flat or Cupertino
   Glass paint.
6. Network circle default solid applies to Flat metric paint.
7. Network text default Black & White overrides the network solid default for
   the active metric-accent theme.
8. Global paint override applies only through the effective theme: metric paint
   for Flat/Cupertino Glass, color-filled paint for Color Filled, and no paint
   override for Terminal.

### Render Appearance Tests

Update `packages/hub/src/settings/render-appearance-builder.test.ts`.

Change the current Terminal test that says:

```txt
terminal clean theme uses fixed readable terminal paint unless black-white mode is active
```

The new expectation:

```txt
terminal clean theme ignores black-white paint from inactive themes
```

Add tests:

1. Terminal Clean uses green phosphor even when Flat paint is Black & White.
2. Terminal Vintage uses vintage phosphor even when Cupertino Glass paint is
   Black & White.
3. Flat uses Flat paint.
4. Cupertino Glass uses Cupertino Glass paint.
5. Color Filled uses Color Filled background paint.

### Property Inspector Tests

Update:

- `packages/hub/src/property-inspector/panels/WidgetSettingsTab.test.ts`
- `packages/hub/src/property-inspector/panels/GlobalSettingsTab.test.ts`
- any settings binding tests that assert patch paths.

Add or update tests:

1. Flat color controls patch `appearance.theme.flat.paint`.
2. Cupertino Glass color controls patch `appearance.theme.cupertinoGlass.paint`.
3. Color Filled controls patch `appearance.theme.colorFilled.paint`.
4. Terminal hides color controls.
5. Global paint override patches `global.paint.metric` for Flat and Cupertino
   Glass.
6. Global paint override patches `global.paint.colorFilled` for Color Filled.
7. Global paint override hides color controls for Terminal.
8. PI paint controls use the centralized active-theme patch helper instead of
   constructing theme paint paths inline.

### Storage Patch Tests

Update:

- `packages/hub/src/settings/storage/widget-settings-patch.test.ts`
- `packages/hub/src/settings/storage/global-settings-patch.test.ts`

Add tests for each theme-owned patch path.

### SVG Paint Scanner Tests

Update `packages/hub/src/view-rendering/svg-paint-scanner.test.ts`.

The Black & White scanner should still verify:

- Flat Black & White final SVG contains no chromatic paint.
- Cupertino Glass Black & White final SVG contains no chromatic paint.
- Color Filled Black & White final SVG contains no chromatic paint.

Terminal should not be included in that Black & White representative set unless
Terminal itself gains a user-facing Black & White terminal palette.

## Implementation Steps

1. Update `contracts/proto/shometrics/v1/settings.proto` to move widget
   appearance paint under theme settings while keeping global paint override as
   one global override model.
2. Run `npm.cmd run proto:format` from `packages/hub`.
3. Run `npm.cmd run proto:lint` from `packages/hub`.
4. Run `npm.cmd run proto:build` from `packages/hub`.
5. Run `npm.cmd run generate:proto` from `packages/hub`.
6. Update `packages/hub/src/settings/resolved-settings.ts`.
7. Update `packages/hub/src/settings/default-appearance-settings.ts`.
8. Update `packages/hub/src/settings/appearance-overrides.ts`.
9. Update `packages/hub/src/settings/storage/resolver.ts`.
10. Update widget and global patch writers.
11. Update `packages/hub/src/settings/render-paint-resolver.ts`.
12. Replace direct `appearance.paint.metric` reads in action builders.
13. Update PI color controls and global override controls.
14. Update unit tests.
15. Update visual tests only if expected snapshots change.

## Verification Commands

Run from `packages/hub`:

```powershell
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run generate:proto
npm.cmd run test:unit
npm.cmd run test:visual
npm.cmd run build
```

Use `test:visual:update` only after reviewing visual diffs and confirming they
are expected.

## Acceptance Criteria

The refactor is complete when all of these are true:

1. `AppearanceSettings` no longer has `paint`.
2. `ResolvedAppearanceSettings` no longer has `paint`.
3. Flat, Cupertino Glass, and Color Filled each own their paint settings under
   `theme`.
4. Terminal does not read or lower itself based on Flat, Cupertino Glass, or
   Color Filled paint settings.
5. No production code references `appearance.paint.metric`.
6. No production code references `appearance.paint.colorFilled`.
7. PI patches theme-owned paint paths.
8. Global paint override follows the effective theme without storing per-theme
   global preferences.
9. Unit tests cover the inactive-theme pollution bug.
10. Terminal visual tests still render green phosphor when inactive themes are
    Black & White.

## Search Checklist

Before finishing, run:

```powershell
rg "appearance\\.paint|AppearancePaintSettings|ResolvedAppearancePaintSettings" packages/hub/src contracts/proto
rg "appearance\\.theme\\.(flat|cupertinoGlass|colorFilled)\\.paint" packages/hub/src/actions packages/hub/src/property-inspector/panels
```

Expected result after the refactor:

- no production references to `appearance.paint`;
- no `AppearancePaintSettings` message in proto;
- no `ResolvedAppearancePaintSettings` type;
- references to `MetricPaintSettings` only as a reusable theme-owned paint
  message or global metric paint override input;
- references to `ColorFilledPaintSettings` only under Color Filled theme or
  global Color Filled override.
- no direct action-builder or PI panel access to theme paint paths; those paths
  should be reached through owner helpers.

## Risks

1. Global overrides can accidentally reintroduce cross-theme pollution if they
   are applied without checking the effective theme.
2. Action builders can accidentally reintroduce theme knowledge if they inspect
   theme-specific paint fields directly.
3. PI can accidentally patch the old global paint path if helper names remain
   generic.
4. Tests that assert only rendered colors can pass while storage ownership is
   still wrong. Include resolver and patch-path tests.
5. PI can accidentally scatter theme dispatch across controls. Keep active
   theme patch dispatch in one helper.

## Static Guard Follow-Up

Prefer making the high-risk boundary violations mechanically detectable after
the refactor lands.

Add an ESLint rule, existing lint restriction, or focused unit test that rejects
these patterns outside the small owner files that are allowed to dispatch by
theme:

- `appearance.paint`
- direct PI panel patches to `appearance.theme.flat.paint`
- direct PI panel patches to `appearance.theme.cupertinoGlass.paint`
- direct action-builder reads of `appearance.theme.*.paint`

Allowed owners should be narrow, such as:

- `settings/storage/resolver.ts`
- `settings/render-paint-resolver.ts`
- `settings/appearance-overrides.ts`
- the centralized PI active-theme paint patch helper

## Naming Rules For This Refactor

Use:

- `paint` for a full paint model or render paint tokens.
- `color` for a concrete color value.
- `metric paint` for metric accent paint.
- `color filled paint` for background fill paint.
- `terminal paint` only when terminal gets its own configurable paint model.

Do not use:

- `visual group`;
- `ordinary group`;
- `color settings` as a storage model name;
- `paint manager`;
- generic theme maps.

## Open Questions

No blocking product questions remain for the structural refactor.

If terminal color customization should ship in the same refactor, update this
plan before implementation. The current plan keeps Terminal color controls
hidden and preserves the fixed green phosphor palette.
