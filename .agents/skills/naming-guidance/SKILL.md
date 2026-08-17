---
name: naming-guidance
description: Use when making or reviewing naming changes in this repo, including function verb choices, domain vocabulary, boundary vocabulary, file/type/export names, stored/resolved/settings field names, renderer contract names, and historical vocabulary cleanup.
---

# Naming Guidance

Use this skill for project vocabulary and naming decisions. Pair it with
`coding-style` for general readability rules, and with `architecture-boundaries`
when names cross settings, Property Inspector, actions, runtime, renderer,
persistence, generated contracts, or adapters.

This skill is not a rename checklist. Prefer the locally truthful name over
mechanically applying any table below.

Ownership, storage safety, renderer schema boundaries, and compatibility policy
live in `architecture-boundaries`; do not duplicate those rules here.

## Function Verb Usage

### `resolve*`

`resolve*` is not reserved for `Resolved*` settings.

Use `resolve*` when a function derives a canonical domain result from inputs
plus defaults, context, policy, or existing state. Good examples include
settings resolution, metric key identity, render appearance, color thresholds,
source profile selection, and font candidate decisions.

DON'T use `resolve*` for trivial object construction or narrow table lookups
when a plainer verb reads more truthfully.

DON'T retro-rename existing `resolve*` helpers to satisfy this guidance. Change
verbs only when touched code would otherwise mislead a reader.

### Other Verbs

PREFER the verb that reads most truthfully in the local owner. The table below
is a reference for default reader expectations, not a checklist to satisfy.

| Verb | Default Reader Expectation |
|---|---|
| `build*` | Assemble a value from known pieces. Broad and safe for plain objects, render data, strings, plans, and test fixtures. |
| `create*` | Instantiate something where "a new thing exists" is the salient point, often with identity, state, dependency, or lifecycle. |
| `compose*` | Combine visual, render, or UI parts into a larger artifact. AVOID for business decisions. |
| `select*` | Choose from a finite set, ordered candidates, or policy table. Optional when `resolve*` would overstate the work. |

DON'T rename existing helpers only to satisfy this table.

## Metric View Vocabulary

Use product vocabulary for product/settings/resolved names:

- `View`
- `Theme`
- `Theme Variant`

DON'T use `graph`, `layout`, `graphic type`, or `display` for the metric
appearance concept.

Call the renderer branch selector `renderPrimitive`.

PREFER `primitive` only inside renderer-owned code, such as
`widgets/primitives/` and renderer contracts.

`Stored*` and `Resolved*` are intentional contracts:

- `Stored*`: sparse persisted user intent from proto/storage.
- `Resolved*`: complete runtime settings after defaults, global overrides, and
  runtime facts.

DON'T rename `Resolved*` as part of metric view naming cleanup.

## Renderer Text Roles

`RenderTextStyles` has exactly five roles. A role carries font family, weight,
filter, fit metrics, and a `fontSizeScale`. It does not own the base font size:
each primitive owns that in its own layout constants, and the role's scale
multiplies it. So a role does move the final size, but only by a factor the
preset sets for the whole theme, never by deciding how big this one string is.

| Role | Meaning |
|---|---|
| `value` | The reading itself. |
| `unit` | The unit beside a value. |
| `heading` | What the whole key is. Every `data.label` uses it; action-owned stand-in text may too. |
| `label` | Which reading this is, when one key shows several. |
| `footnote` | Supplementary text naming neither the key nor a reading. |

DO select the role from where the text came from, not from where the view puts
it or how large it is. Two invariants make that checkable:

1. One semantic text source maps to exactly one role wherever it is rendered,
   across every view, variant, and key size. Read "source" wider than
   `WidgetData`: the dual views take their key name as a `titleText` prop and
   their channel names as `labelText`, and those are sources too.
2. `label` appears only when one key carries several readings at once. A
   single-reading view names its reading with `heading` and never uses `label`.

Invariant 1 runs one way only: every `data.label` is a `heading`, but not every
`heading` is a `data.label`. Two places already use `heading` for text with no
metric behind it. `renderMetricNoticeBody` does it deliberately, for
action-owned copy such as `Install helper` that stands in for the key's
identity. The title-card caption column does it too, for decorative chrome
derived from the action and its content, which does not identify the key; that
one is a known misfit, kept only to avoid unrelated visual churn during this
migration. Treat it as legacy, not as precedent.

DON'T select by position or size. Every misassignment found so far came from
reading the rendered picture instead of the data: `data.label` was `heading` in
the bar top row, `label` inside the circle ring, and `footnote` under the gauge
ring, all for the same string.

DON'T reintroduce a size adjective such as `smallLabel`. A size word in the
vocabulary reads as permission to select by appearance, and it is the one name
that made the picture look like the authority. The default theme gave the
affected roles the same weight, so the mistakes stayed invisible for months.

## Boundary Vocabulary

DO keep the same root word across product, settings, resolved settings,
renderer contracts, and WidgetData when the concept is the same.

PREFER a different renderer word only when the renderer owns a narrower,
derived, or concrete concept.

Currently allowed differences:

| Product / Settings Concept | Renderer / WidgetData Term | Reason |
|---|---|---|
| `View` / `selectedView` | `renderPrimitive` | Renderer field selects the SVG branch. |
| `Line` | `sparkline` | Concrete compact line-chart renderer form. |
| Theme + Theme Variant | `themePreset` | Renderer receives one concrete preset ID. |
| Line runtime history scale | `sparklineScale` | Renderer input data, not stored appearance intent. |
| Two metric channels in one widget | `dual` | Renderer composition vocabulary. |
| Circle renderer branch | `progress-circle` implementation owner | `circle` is the contract value; `progress-circle` names the SVG widget implementation. |

DO allow these product words in both product/settings and renderer layers:

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
is the same, such as `bar_label`, `barLabel`, `barChannels`,
`circle_variant`, and `circleVariant`.

DON'T add a new dual-use product word directly in code. Add a short proposal in
the touched design doc or ask for review before using it on a boundary surface.

DON'T ask for local/private helper names. Use the most truthful local name and
continue unless the new word lands in a boundary surface:

- proto field or enum value;
- `Resolved*` type member;
- `MetricRenderAppearance` or `WidgetData` top-level field;
- exported type, function, or enum value used across package or major directory
  boundaries.

Use `CustomMetric` for the product/UX target and `CustomHttp` for the HTTP
source implementation; avoid `Test` in live source-editor names except for
user-facing "Test Transform" copy.

If a constructor field exists only so tests can inject a registry, fetcher,
sender, or runner, name the bag as injectable dependencies instead of generic
product `Options`.

## Family vs Concrete Form

DO treat each Product View as a visual family.

DO reserve family roots for product/settings and renderer branch values:

| Product View | Renderer Branch | Current SVG Widget |
|---|---|---|
| Text | `renderPrimitive = "text"` | `text-metric` |
| Line | `renderPrimitive = "sparkline"` | `sparkline` |
| Bar | `renderPrimitive = "bar"` | `progress-bar` |
| Circle | `renderPrimitive = "circle"` | `progress-circle` |

PREFER concrete SVG widget names that describe the implementation form, such as
`progress-bar`, `progress-circle`, `volume-bar`, or `concentric-circle`.

AVOID modifier-prefixed family names that pre-commit to an uncertain future
axis, such as `horizontal-bar`, unless that axis exists as a real product or
renderer distinction.

DO use a `XxxViewVariant` settings enum when the user explicitly chooses between
forms in the Property Inspector.

DO use multiple `renderPrimitive` values when the renderer or action domain
chooses the concrete form from metric type, key size, or another non-user
signal.

DON'T split the same decision dimension across both a Product Variant enum and
multiple renderer primitive values in one change.

## Theme Naming

Use product names in settings:

- `selectedTheme`
- theme-owned variant fields, such as terminal `variant`

Use renderer names at the renderer boundary:

- `themePreset`
- concrete preset values such as `terminal-clean` or `terminal-vintage`

PREFER flat `themePreset` values while the set is small and each value stands
alone.

AVOID turning `themePreset` into an implicit Theme x Variant cartesian product.
If multiple themes grow variants, revisit a structured renderer contract before
adding more flattened names.

## Historical Documents

When editing old plans or notes, do not preserve old vocabulary as if it were
current. Either update the wording or add a clear historical naming note.

Common historical mappings:

| Historical Term | Current Term |
|---|---|
| `graphicType`, graph type | `selectedView` or Product View |
| `layout` for user-selected appearance | `view` |
| `circleStyle`, `value`, `compact` | `circleVariant`, `full-ring`, `minimal` |
| `linear` view | `bar` view |
| `linear-bar` | `progress-bar` |
| `arc-gauge` | `progress-circle` |
| `metric-view-runner` | `view-updates` |
| `rendering` renderer directory | `view-rendering` |
| `MetricDisplay*` | `MetricView*` |
| `title` text style role | `heading` |
| `smallLabel` text style role | No single replacement. The key was renamed to `footnote`, but its call sites were split across `heading`, `label`, and `footnote` by where each string came from. Never map an old `smallLabel` site mechanically. |
