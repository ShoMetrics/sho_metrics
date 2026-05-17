# Metric View Naming Map

This document is the vocabulary map for metric visual customization. Its purpose
is to prevent historical names such as graph, layout, and graphic from drifting
across boundaries without an explicit reason.

DO treat these layers as separate owners:

- Product View: user-facing first-level choice in the Property Inspector.
- Settings Field: persisted user intent in proto/storage.
- Resolved Field: complete runtime settings after defaults and overrides.
- Renderer Contract: rendering-facing fields and values. For the branch that
  selects which SVG widget draws the metric, use `renderPrimitive`.
- WidgetData Field: renderer input data consumed by renderer contracts.

## Keyword Semantics

- DO: Mandatory; there is almost never a valid reason to stray.
- DON'T: Prohibited; almost never do this.
- PREFER: Default choice; follow unless a local owner has a clearer, truthful
  name and the reason is called out in review.
- AVOID: Discouraged; skip unless it prevents a less natural or misleading
  name.
- CONSIDER: Optional; use when the local context benefits from it.

## Core Rule

DO use product vocabulary for product/settings/resolved names: View, Theme, and
Theme Variant.

PREFER `primitive` only inside the renderer layer. It is already an established
renderer concept under `widgets/primitives/`.

DON'T introduce `primitive` in product/settings vocabulary as a normal product
word.

DO use renderer vocabulary for renderer contracts. Renderer names may describe
concrete SVG primitives, but they still need one clear vocabulary. A renderer
name is not automatically correct just because it is old.

DO keep the same root word across product, settings, resolved settings, renderer
contracts, and WidgetData when the concept is the same. Introduce a different
renderer word only when it adds real information that the product word does not
carry, such as a narrower chart form, derived runtime data, or a renderer-only
preset.

DON'T use graph, layout, graphic type, or display for the metric appearance
concept. If a renderer field selects a drawing branch, call that field
`renderPrimitive`.

`renderPrimitive` is a renderer branch selector. It is related to
`widgets/primitives/`, but it does not promise a one-to-one file or directory
match.

Product View names are visual families. Renderer primitive names may be
narrower concrete SVG forms inside that family.

## Allowed Boundary Vocabulary Differences

DO treat different words for the same concept as a naming smell. Use a different
word across boundaries only when the target layer owns a narrower or derived
concept.

Currently allowed differences:

| Product / Settings Concept | Renderer / WidgetData Term | Why It Is Different |
|---|---|---|
| `View` / `selectedView` | `renderPrimitive` | Field name changes because the renderer field selects an SVG rendering branch. Values DO reuse product roots unless the renderer value is a narrower concrete form. |
| `Line` | `sparkline` | `sparkline` is the current concrete compact line-chart renderer form, not a synonym for the whole Line product family. |
| Theme + Theme Variant | `themePreset` | Renderer receives one concrete preset ID. Terminal `clean` / `vintage` variants are flattened to `terminal-clean` / `terminal-vintage` at the renderer boundary. |
| Line runtime history scale | `sparklineScale` | Runtime renderer input data for the sparkline chart. It is not stored appearance intent and DON'T put it in proto/settings/resolved appearance settings. |
| Two metric channels in one widget | `dual` | Renderer composition vocabulary for two channels, such as upload/download or read/write. It is not product/settings vocabulary unless a future product mode exposes it. |
| Circle renderer branch | `arc-gauge` implementation owner | `circle` is the renderer contract value. `arc-gauge` is file/type vocabulary for the current SVG widget implementation and its helper modules, not a contract value. |

DON'T add another cross-boundary vocabulary difference without documenting the
narrower or derived concept here first.

WidgetData is renderer input data. It may use renderer contract vocabulary.
DON'T keep old WidgetData names that conflict with product vocabulary. For
example, Bar renderer data uses `bar*`, not `linear*`, because `linear` now
competes with the Line view.

DO allow product concept words to appear in both product/settings and renderer
layers only when they are listed here:

- `view`
- `selectedView`
- `text`
- `line`
- `bar`
- `circle`
- `circleVariant`
- `full-ring`
- `minimal`
- `gauge`
- `theme`
- `themeVariant`

Derived identifiers are covered by the same root product word when the concept
is the same. Examples: `bar_label`, `barLabel`, `barChannels`,
`circle_variant`, and `circleVariant`.

PREFER writing derived forms and moving on when the root word is already
whitelisted. Derivation does not require asking or updating the whitelist. Ask
only if the derived form changes the root concept, such as a `lineSnapshot` that
does not mean the Line view.

DON'T add a new dual-use product word directly in code. If a new word appears
necessary, add it to Proposed Dual-Use Words in this document and get human
review before using it in implementation.

DON'T ask when the new word is a local variable, private helper name,
single-file type member, or derived form of a whitelisted root.

DO ask only when the new word would be added in the current change to one of
these boundary surfaces:

- a proto field or enum value;
- a `Resolved*` type member;
- a `MetricRenderAppearance` or `WidgetData` top-level field;
- an exported type, function, or enum value used across package or major
  directory boundaries.

A private owner means code that does not cross those boundary surfaces, such as
a local variable, file-local helper, non-exported helper type, or private helper
member. PREFER the most natural local name inside a private owner and continue.

`dual` is renderer-only vocabulary. It means two metric channels rendered inside
one Stream Deck widget, such as upload/download or disk read/write. DON'T use
`dual` in proto/settings product vocabulary as ordinary renderer vocabulary.
CONSIDER a Boundary Exception only if the product explicitly adds a user-facing
dual view or dual mode.

## Proposed Dual-Use Words

None currently.

When proposing, add a row in this format:

- `<word>`: reason; boundary surfaces where it would appear; example
  identifier.

After adding a proposal, DON'T implement the new cross-boundary word until
human review accepts it. For local/private names, no proposal is needed.

## Boundary Exceptions

None currently.

CONSIDER a boundary exception only when a setting intentionally exposes a
renderer concept to users by design, such as an advanced mode or debug toggle.
Add a row in this format before implementation:

- `<renderer word>`: user-facing reason; setting surface; renderer surface;
  example identifier.

## Family vs Concrete Form

DO treat each Product View as a visual family, not as a promise that there is
exactly one renderer primitive value.

PREFER renderer primitive values that are independently meaningful concrete
widget forms. Examples:

- Product Line -> `renderPrimitive = "sparkline"`
- Product Bar -> `renderPrimitive = "bar"`
- Product Circle -> `renderPrimitive = "circle"` with `circleVariant`

AVOID modifier-prefixed family names when the modifier pre-commits to an
uncertain future classification axis. For example, `horizontal-bar` assumes the
Bar family will primarily split into horizontal versus vertical forms. Keep the
root `bar` while it names the whole current concept. Add concrete form names
such as `volume-bar`, `stacked-bar`, or `meter-bar` only when those forms
actually exist and are not already represented by a user-facing Bar Variant.

DO use a `XxxViewVariant` settings enum when the user explicitly chooses between
forms in the Property Inspector. DO use multiple `renderPrimitive` values when
the renderer or action domain chooses the concrete form from metric type, key
size, or other non-user signals.

PREFER the same family root for the renderer branch when the user-facing
Variant field already owns the concrete form selection. For example, Product
Circle maps to `renderPrimitive = "circle"` because `circleVariant` owns Full
Ring, Minimal, and Gauge.

DON'T split the same decision dimension across both a Product Variant enum and
multiple renderer primitive values in one change. If both are needed, name which
owner makes each decision before implementation.

PREFER listing all current `renderPrimitive` values in the Product View Mapping
row when a Product View family expands from one concrete renderer form to
several. Avoid implying a one-to-one mapping unless the row is explicitly scoped
to the default renderer form.

## Product View Mapping

| Product View | Settings Field | Resolved Field | Renderer Contract | WidgetData Field |
|---|---|---|---|---|
| Text | `AppearanceViewSettings.selected_view = METRIC_VIEW_TEXT` | `appearance.view.selectedView = "text"` | Target: `renderPrimitive = "text"`; current: `graphicType = "text"` | No text-only field; uses common `label`, `displayValue`, `unit`, and `secondaryDisplayValue`. |
| Line | `AppearanceViewSettings.selected_view = METRIC_VIEW_LINE`; line-specific settings live under `AppearanceSettings.line` / `LineAppearanceSettings` | `appearance.view.selectedView = "line"`; `appearance.line.*` | Target: `renderPrimitive = "sparkline"`; current: `graphicType = "sparkline"` | `sparklineScale` is renderer data for the sparkline primitive. |
| Bar | `AppearanceViewSettings.selected_view = METRIC_VIEW_BAR`; disk usage custom label is `DiskMetricTarget.bar_label` | `appearance.view.selectedView = "bar"`; disk usage label is `reading.barLabel` | Target: `renderPrimitive = "bar"`; current: `graphicType = "linear"` | Target: `barLabel`, `barDisplayValue`, `barUnit`, `barChannels`; current: `linearLabel`, `linearDisplayValue`, `linearUnit`, `linearChannels`. |
| Circle | `AppearanceViewSettings.selected_view = METRIC_VIEW_CIRCLE`; circle variants live under `circle_variant` | `appearance.view.selectedView = "circle"`; `appearance.view.circleVariant` | Target: `renderPrimitive = "circle"`; current: `graphicType = "circular"` | No circle-only WidgetData field. Circle-specific behavior is renderer config, not metric data. |

`bar` is a product concept and may appear in settings, resolved settings, and
renderer contracts when the concept is the Bar family. `linear` is renderer
geometry vocabulary and DON'T use it in product/settings.

`circle` is a product concept and the renderer branch name. The current
implementation owner is `arc-gauge`, but that name is implementation-local
vocabulary rather than the target renderer contract value. DON'T rename
`arc-gauge.ts`, `ArcGauge*`, `arc-gauge-range.ts`, or
`dual-channel-arc-gauge.ts` as part of the renderer contract rename. Revisit
that owner separately only if the name leaks across renderer contract boundaries
or remains misleading after `circleVariant` is fully aligned.

When adding a new SVG widget file in the Circle family, name it after its
concrete visual form, such as `ring` or `square-progress`, not after the family
root `circle`. The family root stays reserved for the renderer contract value.

## Circle Variant Mapping

| Product Variant | Settings Field | Resolved Field | Renderer Contract | WidgetData Field |
|---|---|---|---|---|
| Full Ring | `CIRCLE_VIEW_VARIANT_FULL_RING` | `circleVariant = "full-ring"` | Target: `circleVariant = "full-ring"`; current: `circleStyle = "value"` | None |
| Minimal | `CIRCLE_VIEW_VARIANT_MINIMAL` | `circleVariant = "minimal"` | Target: `circleVariant = "minimal"`; current: `circleStyle = "compact"` | None |
| Gauge | `CIRCLE_VIEW_VARIANT_GAUGE` | `circleVariant = "gauge"` | Target: `circleVariant = "gauge"`; current: `circleStyle = "gauge"` | None |

The current renderer value `circleStyle = "value"` is especially confusing
because the product concept is not a value style. It means the full-ring circle
variant.

Circle variant is a product concept. Renderer code may use `circleVariant` only
after resolved settings have crossed the adapter boundary. Renderer-only names
such as `circleStyle`, `value`, and `compact` DON'T belong in
proto/settings/resolved appearance settings.

## Line Settings Mapping

| Product Control Area | Settings Field | Resolved Field | Renderer Contract | WidgetData Field |
|---|---|---|---|---|
| Line smoothing | `LineAppearanceSettings.line_smoothing_percent` | `appearance.line.lineSmoothingPercent` | Target: `lineSmoothingPercent` on the sparkline renderer contract | None |
| Grid line visibility | `LineAppearanceSettings.grid_line_visibility` | `appearance.line.gridLineVisibility` | Target: `gridLineVisibility` on the sparkline renderer contract | None |
| Grid line type | `LineAppearanceSettings.grid_line_type` | `appearance.line.gridLineType` | Target: `gridLineType` on the sparkline renderer contract | None |
| Runtime scale | Not stored in line appearance settings | Metric-specific runtime data | Target: sparkline scale resolver | `sparklineScale` |

`sparklineScale` belongs to WidgetData because WidgetData is renderer input
data. DON'T put it in proto/settings/resolved appearance settings.

## Theme Mapping

| Product Concept | Settings Field | Resolved Field | Renderer Contract | WidgetData Field |
|---|---|---|---|---|
| Theme | `AppearanceThemeSettings.selected_theme` | `appearance.theme.selectedTheme` | Target: `themePreset`; current: `graphicStyle` | None |
| Theme Variant | `TerminalThemeSettings.variant` | `appearance.theme.terminal.variant` | Target: same `themePreset` field with flattened concrete values; current: `graphicStyle = "terminal-clean"` or `"terminal-vintage"` | None |
| Renderer effects | Not a product-level control | Derived from theme | Target: `themeEffects`; current: `graphicEffects` | None |

`themePreset` is a concrete renderer theme preset ID, not the product Theme
enum. Its target value space is currently:

- `flat`
- `cupertino-glass`
- `color-filled`
- `terminal-clean`
- `terminal-vintage`

Terminal Theme Variant is flattened into `terminal-clean` and
`terminal-vintage` at the renderer boundary.

PREFER flat `themePreset` values while the renderer has a small set of concrete
presets that each stand alone. AVOID growing `themePreset` into an implicit
Theme x Variant cartesian product. If another Theme adds variants or preset
names start encoding repeated theme/variant pairs, revisit whether the renderer
contract needs a structured shape before adding more flattened names.

`graphicStyle` uses a product-rejected word. It survives today only because it
is renderer-facing. PREFER renaming it to
`themePreset`.

`themePreset` is renderer-only vocabulary. DON'T put it in
proto/settings/resolved appearance settings. Settings continue to use
`selectedTheme` plus theme-owned variant fields.

## Decided Rename Targets

These names were found during the View rename but were not changed in that
round. DON'T treat them as endorsed names. These rows are decided
rename targets, but each row still needs ordinary implementation review. This
section is a rollout plan. PREFER removing or archiving it after the cleanup.

| Current Name | Location | Problem | Proposed Target (subject to PR review) |
|---|---|---|---|
| `MetricRenderAppearance.graphicType` | `packages/hub/src/rendering/render-appearance.ts` | Historical graph/layout/view vocabulary. It selects a renderer branch, not a product graphic type. | `renderPrimitive` |
| `dualGraphicType` | `packages/hub/src/metric-view-renderer/display-frame.ts`, action view builders | Same problem as `graphicType`. Dual means two metric channels rendered inside one Stream Deck widget, such as upload/download or disk read/write. | `dualRenderPrimitive` |
| `"linear"` renderer value | renderer appearance and tests | Conflicts mentally with the Line view. It really means the Bar renderer primitive. | `"bar"` |
| `"circular"` renderer value | renderer appearance and tests | Product vocabulary is Circle; adjective form adds another spelling for the same family. | `"circle"` |
| `circleStyle` | renderer appearance, metric-view renderer, widget primitives | Product/settings now use Circle Variant. `style` overlaps with Theme/style vocabulary. | `circleVariant` |
| `circleStyle = "value"` | arc gauge renderer config | Does not describe the visual form. It means Full Ring. | `"full-ring"` |
| `circleStyle = "compact"` | arc gauge renderer config | Does not match product name Minimal. | `"minimal"` |
| `linearLabel`, `linearDisplayValue`, `linearUnit`, `linearChannels` | `WidgetData`, bar primitive, action view builders | These are Bar view data fields. `linear` competes with Line. | `barLabel`, `barDisplayValue`, `barUnit`, `barChannels` |
| `linearIconFragment` | metric-view renderer and action view builders | This is the top icon used by compact chart branches, including Bar and Sparkline. `barIconFragment` would overfit one branch. | `topIconFragment` |
| `linearTitleText`, `linearValueText`, `linearUnitText`, `linearSecondaryText` | render paint tokens | These are Bar text paint tokens. | `barTitleText`, `barValueText`, `barUnitText`, `barSecondaryText` |
| `viewLayout` in renderer tests | `packages/hub/src/rendering/svg-paint-scanner.test.ts` | Test helper kept an older product term. It now names renderer primitive selection, not a layout. | `renderPrimitive` |
| `graphicStyle` | renderer appearance and frame composition | Product rejected Graphic Style for UX because it sounds like theme. Renderer uses it for theme preset. | `themePreset` |
| `GraphicThemePresetName` | widget theme interface | Same `graphic` vocabulary drift around theme. | `ThemePresetName` |
| `graphicEffects` / `render-graphic-effects-resolver.ts` | renderer theme/effects mapping | Uses `graphic` as a vague visual bucket. | `themeEffects` |

## Needs Separate Boundary Decision

These are real naming concerns, but they are not direct field/type renames. Do
not execute them as part of the field rename checklist without a separate owner
or directory boundary plan.

PREFER extending the nearest existing owner until this decision is made. DON'T
create a new top-level rendering directory only to avoid choosing between
`rendering/` and `metric-view-renderer/`.

| Current Name | Location | Problem | Decision Needed |
|---|---|---|---|
| `linear-bar` / `linearBar` primitive owner | `packages/hub/src/widgets/primitives/linear-bar.ts` | Implementation owner still uses `linear` for the Bar renderer branch. `linear` competes with the Line product view. | Decide whether the primitive owner uses the Bar root or stays as a lower-level geometry owner with an explicit boundary note after the renderer contract uses `renderPrimitive = "bar"`. |
| `arc-gauge` / `ArcGauge*` primitive owner | `packages/hub/src/widgets/primitives/arc-gauge.ts` | Implementation owner differs from the Product and renderer branch name `circle`. `gauge` is one Circle variant, not the whole Circle family. | DON'T include this in the renderer contract rename. Treat it as implementation-owner vocabulary and revisit separately only if it leaks across contract boundaries or remains misleading after `circleVariant` is fully aligned. |
| `metric-view-renderer/` | directory name | The directory renders frames from renderer contracts, while `MetricView` now means the product setting. | Decide whether this owner is frame rendering, metric view rendering, or display frame composition. |
| `rendering/` vs `metric-view-renderer/` | directory names | Both sound like rendering ownership. The boundary is not obvious from names alone. | Decide the directory ownership vocabulary after renderer field names are stable. |

## Recommended Cleanup Order

PREFER doing one step per PR or explicit user request. DON'T bundle multiple
steps unless the user asks for a broader rename pass.

1. Rename renderer branch selection:
   `graphicType` -> `renderPrimitive`,
   `dualGraphicType` -> `dualRenderPrimitive`.

2. Rename Bar renderer data:
   `linear*` WidgetData and paint token fields -> `bar*`.

3. Rename Circle renderer variant:
   `circleStyle` -> `circleVariant`,
   with values aligned to `full-ring`, `minimal`, and `gauge`.

4. Rename theme renderer fields:
   `graphicStyle` -> `themePreset`,
   `graphicEffects` -> `themeEffects`.

5. Revisit directory names only after the type/member vocabulary is stable.

## Guardrails

- DON'T introduce compatibility paths for old names while doing these renames.
- DON'T duplicate settings models to bridge old and new vocabulary.
- DON'T let renderer import storage schema.
- DON'T let renderer-only vocabulary appear in proto/settings types. Renderer-only
  means words not listed in the dual-use whitelist, such as `renderPrimitive`,
  `themePreset`, `themeEffects`, `dual`, and WidgetData fields that do not
  derive from a whitelisted product word. `barLabel` is allowed because `bar`
  is whitelisted; `sparklineScale` is not allowed in proto/settings.
- DO keep settings vocabulary product-facing. Renderer code may reuse only the
  dual-use product words explicitly listed in the Core Rule. DON'T import or
  persist storage schema from renderer code.
- DON'T persist resolved defaults.
- DON'T use `layout` unless the code is literally about geometry/layout rather
  than the user-selected metric view.
- DON'T use `graph` for the first-level metric view. Reserve graph only for a
  concrete chart concept, such as a network traffic graph label, after a product
  wording decision.
- PREFER truthful local names inside a private owner over mechanically applying
  this document when the name would become unnatural. Private owner is defined
  in the Core Rule. If that local name crosses a listed boundary surface, add a
  proposal or ask for review before implementing it.
- AVOID asking for approval on local/private derived names. Use the local owner,
  keep the name truthful, and continue.
- CONSIDER adding a short PR note when a rename follows this rollout plan but
  the local owner keeps a renderer-specific term for clarity.
