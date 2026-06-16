# Dense Multi Metric Widget Plan

This plan is written for a new coding session with no conversation context.

Read these first:

1. [Runtime Sources Overview](../README.md)
2. [Phase 5c Demand-Driven Background Collection](../01-runtime-collection/03-demand-driven-background-collection.md)
3. [Metric-Level Source Routing](../02-source-routing/02-metric-level-source-routing.md)
4. [Windows Helper Advanced Sensor Widget Plan](../03-windows-helper/06-helper-advanced-sensor-widget-plan.md)
5. [Windows Helper Advanced Sensor Label And Scale Plan](../03-windows-helper/07-helper-advanced-sensor-label-scale-plan.md)
6. `.agents/skills/technical-architecture/references/TECHNICAL_ARCHITECTURE.md`

The source-agnostic runtime flow is:

```text
Metric sources
  -> Scheduler / background collection
  -> MetricStore
  -> WidgetData
  -> view-updates
  -> view-rendering
  -> Stream Deck
```

All `npm.cmd` and `npx.cmd streamdeck ...` commands in this plan run from
`packages/hub` unless a step explicitly says otherwise.

## Objective

Add a new Stream Deck action named **Dense Multi Metric**. It displays 2 to 6
scalar metrics in one widget as a dense progress list:

```text
left label | progress bar | value + unit
```

The action is simultaneous, not rotating. Future rotation is a separate product
entry named **Stacked Metric** and should not be implemented in this batch.

## Product Decisions

- Product/action label: **Dense Multi Metric**.
- Internal widget type: `DenseMultiMetricWidget`.
- Future rotation action label: **Stacked Metric**.
- Future rotation widget type: `StackedMetricWidget`.
- Supported controllers in v1: `Keypad` and `Encoder`.
- Encoder support means touch-strip/dial layout rendering only. Do not add dial
  rotate, dial press, touch tap, or key press behavior in this batch.
- Slot count: minimum 2, maximum 6 on every supported surface.
- Square key logical size: 144 x 144.
- Touch strip logical size: 200 x 100.
- Square layout: one vertical column, 2 to 6 rows.
- Touch strip layout:
  - 2 to 5 metrics: one vertical column, each metric uses a full-width row.
  - 6 metrics render as 2 columns x 3 rows.
- Touch strip 4 and 5 metric layouts intentionally remain single-column. The
  dense row shape is horizontally expensive (`label | bar | value + unit`), and
  a 200 x 100 touch strip has more useful width than height for 4 or 5 rows.
  Only 6 rows become too vertically thin in one column, so 6 rows use two
  columns.
- Row shape: left label, center progress bar, right value plus unit.
- Bar shape: rounded rectangles with modest corner radius, not full pill bars.
  Dense rows are too small for pill ends; low values should read as a filled
  rectangular bar, not as a dot.
- The left label target is roughly 4 short Latin characters on square keys.
  The renderer's pixel fitting is authoritative because CJK, kana, and wide
  glyphs do not map cleanly to a character count.
- The PI should present this as short-label guidance and warn or preview when a
  label is likely too wide. It must not be the only enforcement point.
- The value uses existing metric formatting rules and must fit the row. Do not
  introduce per-row numeric format strings.
- The bar progress uses the metric's normalized `WidgetData.progress`.
- Slot-level failure degrades only that slot. One bad metric must not blank the
  whole widget.
- Whole-widget unconfigured state displays a configure/choose-metric notice.
- Per-row user settings in v1: metric selection, custom row label, and custom
  maximum. No per-row color, per-row theme, per-row view, per-row polling, or
  per-row unit override.
- Color settings are widget-level and reuse existing theme/paint rules:
  - black-white mode;
  - solid mode;
  - multi-color mode with shared thresholds.
- Multi-color thresholds are shared across every row and continue to operate on
  normalized progress. Do not add per-row thresholds.
- Curated first-class metrics and catalog metrics are both selectable.
- Catalog metrics must remain usable when the descriptor catalog is unavailable
  after selection. Keep detected label/unit/category/reading hints in settings.

## Naming Decision

Use `DenseMultiMetricWidget`.

`MultiDenseMetricWidget` is the wrong emphasis: "dense" modifies the
presentation form, while "multi metric" names the product family. The concrete
widget is one dense presentation of multiple metrics, so the modifier belongs
before the family noun.

Do not use `MultiMetricSinglePanelWidget`. `Panel` is already overloaded by the
Property Inspector and does not describe the product behavior.

Boundary names:

| Surface | Name |
| --- | --- |
| Stream Deck action label | `Dense Multi Metric` |
| `ActionKind` | `denseMultiMetric` |
| Stream Deck action UUID suffix | `dense-multi-metric` |
| Stored proto message | `DenseMultiMetricWidget` |
| Resolved widget kind | `"denseMultiMetric"` |
| Action class | `DenseMultiMetric` |
| Renderer branch | `denseProgressList` |
| Future rotating widget | `StackedMetricWidget` |

## Current Code Facts

The implementation must be based on these existing files, not on new parallel
models:

- `contracts/proto/shometrics/v1/settings.proto`
  - `StoredWidgetSettings` currently has only
    `oneof widget { SingleMetricWidget single_metric = 1; }`.
  - `MetricSlot` already models one metric position inside a widget layout.
  - The comment on `MetricSlot` explicitly says future multi-slot widgets should
    reuse it.
- `packages/hub/src/settings/resolved-settings.ts`
  - `ResolvedWidget` currently has only `ResolvedSingleMetricWidget`.
  - `ResolvedMetricSlot` already contains a resolved metric and appearance.
- `packages/hub/src/actions/metric-action.ts`
  - `getMetricKeys(event)` already returns `readonly string[]`.
  - The base action can subscribe more than one metric key.
  - `buildReadPlanForMetricKeys` currently uses
    `settings.widget.slot.metric.source`, so it is single-slot source-policy
    logic. Dense multi metric must override read-plan construction if slots can
    use different source policies.
  - `onDidReceiveSettings` logs `settings.widget.slot.appearance...` today.
    Once `ResolvedWidget` becomes a union, shared base-class logging must narrow
    the widget kind or move to a widget-summary helper.
  - `refreshMetricKeys(...)` also calls the single-slot
    `buildReadPlanForMetricKeys(...)`. Dense code must not use that helper for
    multi-row refreshes.
- `packages/hub/src/runtime/metric-store.ts`
  - `MetricStore` already stores many metric keys per source scope.
  - `MetricStoreReader.getWidgetData(metricKey, label, unit, maxValue)` already
    produces normalized `WidgetData.progress`.
- `packages/hub/src/metrics/catalog-metric-scale.ts`
  - This is the existing catalog max/default-scale owner.
  - It resolves default raw-unit maximums from `MetricUnit`,
    `CatalogMetricCategory`, and `CatalogMetricReadingKind`.
  - It also converts readable PI custom-maximum input units to raw source units.
- `packages/hub/src/actions/catalog-metric.ts`
  - The selected catalog render path already resolves label, unit, and maximum
    without depending on the live descriptor catalog.
- `packages/hub/src/metrics/catalog-metric-widget-data.ts`
  - Catalog readable value formatting for bytes, bytes/s, and hertz already
    runs after helper freshness is accepted.
- `packages/hub/src/view-rendering/metric-view-frame.ts`
  - Current render options are single-metric or dual-channel.
  - Dense progress list needs a new render option; do not force it through
    `DualMetricRenderOptions`.
- `packages/hub/src/settings/render-appearance-builder.ts`
  - Existing theme/paint settings already convert into renderer-facing tokens.
  - Dense progress list should reuse those tokens.
- `packages/hub/src/property-inspector/panels/WidgetSettingsTab.tsx`
  - Current PI routing assumes `context.resolved.widget.slot.metric.target`.
  - Dense multi metric requires a widget-kind branch before single-metric domain
    routing.
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
  - Current patch functions call `requireSingleMetricSlot`.
  - Dense multi metric needs an explicit dense patch branch. Do not make the
    single-metric patch path silently mutate repeated slots.
- `packages/hub/src/shared/stream-deck-actions.ts`
  - `ActionKind` and UUID mapping must add the new action.
- `packages/hub/src/plugin.ts`
  - The new action class must be registered here.
- `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`
  - The action list must add the new action with `Keypad` and `Encoder`
    controllers.
- `packages/hub/src/i18n/manifest-messages.ts`
  - Manifest action name and tooltip must be localized.

## Existing Multi-Metric Capability

Do not treat Dense Multi Metric as a new data-source architecture.

The project already supports multi-metric collection in two forms:

- Multiple separate Stream Deck keys can subscribe to different metric keys at
  the same time. That is already a cross-key multi-metric dashboard.
- Network and disk throughput views already render two metric channels in one
  widget.

What is missing is not the ability to collect multiple metrics. What is missing
is a stored widget shape, resolved settings shape, PI editor, action view
builder, and renderer contract for an arbitrary 2-to-6 slot list.

The implementation should therefore extend widget/settings/rendering contracts.
It should not rewrite runtime sources, `MetricStore`, or background collection.

## Data Ownership

Persisted settings owner:

- `DenseMultiMetricWidget` stores the row list.
- Each row stores a stable `slot_id`.
- Each row reuses `MetricSlot` for metric selection and metric-owned overrides.
- Widget-level appearance stores the shared Dense Multi Metric theme, paint, and
  transparent-surface settings. Dense does not expose a user-selectable view.

Runtime defaults owner:

- The settings resolver fills missing rows only for a new quick-start action.
- The resolver enforces minimum 2 and maximum 6 resolved rows.
- The resolver does not persist resolved defaults.

Property Inspector owner:

- The PI edits the row list and row metric selections.
- The PI writes sparse patches.
- Runtime descriptor catalogs stay in `WidgetRuntimeCache`.
- The PI must not import generated proto types directly.

Rendering owner:

- `view-rendering` receives app-owned dense render options.
- Dense renderer receives row `WidgetData`, display label, value/unit, and
  shared `MetricRenderAppearance`.
- Renderer truncates or fits row text; it does not parse metric ids.

Source/runtime owner:

- Background collection and source routing keep owning polling/fallback.
- Dense action builds a read plan from every row's source policy.
- One slot failure does not become a widget-level source failure.
- Current `MetricReadPlan` identity is keyed by `metricKey` plus route. It
  rejects one `metricKey` with two conflicting source routes. Dense v1 must not
  allow the same metric key to be selected twice with different source
  policies.

## Settings Contract

Update `contracts/proto/shometrics/v1/settings.proto`.

Recommended shape:

```proto
message StoredWidgetSettings {
  oneof widget {
    SingleMetricWidget single_metric = 1;
    DenseMultiMetricWidget dense_multi_metric = 2;
  }

  WidgetPreferences preferences = 10;
}

message DenseMultiMetricWidget {
  // Ordered rows rendered by the dense progress-list view.
  // Valid stored length is 2..6.
  repeated DenseMetricSlot slots = 1 [(buf.validate.field).repeated = {
    min_items: 2
    max_items: 6
  }];

  // Shared appearance for the dense list. Dense consumes theme, paint, and
  // transparent-surface settings. It ignores view and line settings in v1.
  // Individual rows must not store view, theme, or color settings in v1.
  AppearanceSettings appearance = 2;
}

message DenseMetricSlot {
  // Stable PI/render identity. Generated by Hub and opaque to users.
  string slot_id = 1 [(buf.validate.field).string = {
    min_len: 1
    max_len: 64
  }];

  optional MetricSlot slot = 2;

  // User-owned row label for the dense list. Absence means use the selected
  // metric's detected/default short label. The PI should guide users toward
  // short labels; renderer pixel fitting is the final authority.
  optional string custom_label = 3 [(buf.validate.field).string.max_len = 16];

  // User-owned row maximum in the metric's raw source unit. Absence means use
  // the selected metric's semantic/default maximum. This value affects progress
  // only; it does not change display-unit formatting.
  optional double custom_maximum_value = 4 [(buf.validate.field).double = {
    gt: 0
    lte: 1000000000000000
  }];
}
```

Do not add a generic `Any`, JSON blob, map, or renderer-specific layout string.
The extension boundary is the `StoredWidgetSettings.widget` oneof arm and the
`DenseMetricSlot` repeated message.

Why `DenseMetricSlot` wraps `MetricSlot`:

- `MetricSlot` is the existing metric selection shape and already carries
  source policy, target, and target-owned overrides.
- A repeated list needs stable row identity. `MetricSlot` intentionally does not
  have an id because single metric widgets do not need one.
- Dense row label/maximum are row-display overrides, not source descriptors.

Do not add per-row `AppearanceSettings` in v1. If future dense variants need
per-row visuals, add a deliberate field after the product decision.

## Resolved Settings

Update `packages/hub/src/settings/resolved-settings.ts`.

Add:

```ts
export type ResolvedWidget =
    | ResolvedSingleMetricWidget
    | ResolvedDenseMultiMetricWidget;

export interface ResolvedDenseMultiMetricWidget {
    readonly widgetKind: "denseMultiMetric";
    readonly slots: readonly ResolvedDenseMetricSlot[];
    readonly appearance: ResolvedAppearanceSettings;
}

export interface ResolvedDenseMetricSlot {
    readonly slotId: string;
    readonly slot: ResolvedMetricSlot;
    readonly customLabel: string | undefined;
    readonly customMaximumValue: number | undefined;
}
```

Resolver rules:

- If stored widget is `single_metric`, resolve exactly as today.
- If stored widget is `dense_multi_metric`, resolve every stored slot using the
  existing `resolveMetricSlot` path.
- Dense widget appearance uses `DenseMultiMetricWidget.appearance`, then global
  theme/paint/transparent-surface overrides. Transparent surface is one
  widget-owned setting on `AppearanceSettings`, not a per-theme setting.
- Dense widget appearance must not apply global view overrides. Dense has no
  product-level view selector, and global `MetricView` values such as `circle`
  or `line` do not describe the dense progress list.
- Dense widget appearance ignores line settings in v1.
- Dense row `MetricSlot.overrides.appearance` is ignored in v1 because dense
  rows share one appearance. Keep the stored shape reusable, but do not create a
  per-row visual product surface.
- Resolved dense row count must be 2..6.
- Missing or empty `slot_id` is invalid stored data. Quick-start and dense patch
  write paths must create ids before saving; the resolver must not silently
  invent ids and persist them later.
- Empty or incomplete row metric selections resolve to placeholder rows that do
  not subscribe until a metric is selected.

Slot id owner:

- Quick-start creation and dense add-row patch application generate `slot_id`.
- The generator should live in settings/storage patch or quick-start helpers,
  not inside React component state.
- Use a UUID-style opaque id, with a test-injectable id generator if needed for
  deterministic unit tests.
- Reorder and metric-selection edits must preserve existing `slot_id` values.

## Metric Selection And Maximum Rules

Dense rows may select first-class curated metrics or catalog metrics.

Label resolution for a row:

1. `DenseMetricSlot.custom_label` if non-empty after trimming.
2. Catalog target `customLabel` if present.
3. Catalog target `detectedLabel` if present.
4. First-class target short label from the dense row builder, for example
   `CPU`, `GPU`, `RAM`, `NET`, `DSK`, `TMP`, `PWR`, `VRAM`.
5. `METR`.

The displayed label is fitted by renderer pixel width. The PI may show a
"keep this around four short characters" hint, but renderer fitting is the
single authority.

Maximum resolution for row progress:

1. `DenseMetricSlot.custom_maximum_value` when present.
2. Target-owned custom maximum when the selected metric already has one.
3. Existing target/display maximum settings:
   - CPU/GPU temperature and power target maximums.
   - network display maximums for traffic metrics;
   - disk throughput display maximums for throughput metrics.
4. Catalog semantic default from
   `packages/hub/src/metrics/catalog-metric-scale.ts`.
5. First-class semantic defaults from the existing action view builders.
6. Fallback 100.

Custom maximum is stored in the raw source unit used by `MetricStore`. The PI
may show readable units, but write paths must convert back to raw units before
storage.

Do not add unit override in this batch.

## Action Behavior

Add `packages/hub/src/actions/dense-multi-metric.ts`.

The action should extend `MetricAction`, but it must override the read-plan path
instead of relying on the single-slot default:

- `getMetricKeys(event)` returns every configured row metric key.
- `buildMetricCollectionReadPlan(event, metricKeys)` builds metric read-plan
  entries from each row's source policy, then normalizes the combined plan.
- `getDisplayedMetricKey(event)` returns the first configured row metric key
  for the existing PI source diagnostic.
- `onMetricsUpdate(event)` builds dense row widget data for every row and calls
  a dense render/update function.

If two rows select the same metric with the same source policy, the action may
deduplicate subscriptions, but it must keep both rows in the render list.

If two rows select the same metric key with different source policies, v1 must
render the later conflicting row as unconfigured before calling
`normalizeMetricReadPlan(...)`. PI validation is useful but insufficient because
settings can arrive from profile sync, import, or hand-edited JSON. Do not
bypass this by inventing row-scoped metric keys. Supporting source comparison
for the same metric key requires a deliberate `MetricReadPlan` and
`MetricStoreReader` contract change.

Shared `MetricAction` changes required by the resolved-widget union:

- Base-class logging must stop unconditionally reading
  `settings.widget.slot.appearance.view.selectedView`.
- The base single-slot read-plan helper must narrow
  `settings.widget.widgetKind === "singleMetric"` before reading
  `settings.widget.slot.metric.source`.
- Dense code must not use `refreshMetricKeys(...)`; add a dense-owned refresh
  helper or a protected refresh method that accepts an explicit `MetricReadPlan`
  if PI refresh needs one.
- Existing CPU/GPU/Memory/Disk/Network/Catalog actions must keep the single-slot
  behavior and tests.

Do not add press behavior. Do not implement rotation. Do not mutate settings on
tick.

## Renderer Contract

Add a new render option instead of overloading single or dual options:

```ts
export interface SingleMetricRenderOptions extends BaseMetricRenderOptions {
    readonly metricRenderKind: "singleMetric";
    // Existing single metric fields...
}

export interface DualMetricRenderOptions extends BaseMetricRenderOptions {
    readonly metricRenderKind: "dualMetric";
    // Existing dual metric fields...
}

export interface DenseMetricRenderOptions extends BaseMetricRenderOptions {
    readonly metricRenderKind: "denseMetric";
    readonly widgetData: DenseMetricWidgetData;
    readonly resolvedSettings: ResolvedAppearanceSettings;
}

export interface DenseMetricWidgetData {
    readonly rows: readonly DenseMetricRowWidgetData[];
}

export interface DenseMetricRowWidgetData {
    readonly slotId: string;
    readonly label: string;
    readonly widgetData: WidgetData;
}
```

Implementation owner:

- `packages/hub/src/view-rendering/dense-metric-view.ts`
- `packages/hub/src/widgets/primitives/dense-progress-list.ts`

Rendering rules:

- Square key: one column, `rowCount` rows.
- Touch strip 2..5 rows: one column.
- Touch strip 6 rows: two columns, row-major.
- Each row draws label, bar track, bar fill, value, and unit.
- Bar track and fill use rounded-rectangle geometry. Do not use a full pill
  radius unless a later product review explicitly chooses the softer pill look.
- Value text uses `WidgetData.displayValue ?? current`.
- Unit text uses `WidgetData.unit` after the existing render unit formatting
  path.
- Missing row sample renders that row as `N/A` with empty/zero fill.
- Source-confirmed pending refresh may render `...` for that row if the
  underlying `WidgetData.unavailableDisplayValue` requests it.
- `black-white`, `solid`, and `multi-color` modes must reuse existing
  `MetricRenderAppearance.paints.primaryMetric`.
- Multi-color row fill is resolved from each row's normalized progress using
  the shared thresholds.
- The dense view does not render center/footer/top icons.

Touch strip should keep using `dispatchMetricViewImage`. If the current
`MetricViewFrame` type makes dense render options awkward, extend the union
explicitly; do not add index-based string arrays.

The renderer union must become a real discriminated union. Replace binary
`isDualMetricRenderOptions(...) ? dual : single` dispatch with exhaustive
`switch (metricRenderKind)` branches in `metric-view-frame.ts` and
`view-updates/runner.ts`. Do not add nested ternaries that can accidentally
treat dense options as single-metric options.

## Property Inspector

Add a dense widget branch before single-metric domain routing in
`WidgetSettingsTab.tsx`.

Recommended new panel:

```text
packages/hub/src/property-inspector/panels/DenseMultiMetricWidgetSettings.tsx
```

Panel order:

```text
Metrics
Theme
Color
Polling
```

Do not show View, Line, Text Variant, Circle Variant, per-row theme, or per-row
color settings.

Metrics section behavior:

- Show 2 to 6 row editors.
- Each row has:
  - row order/index;
  - metric picker;
  - short label input with guidance around four short Latin characters;
  - maximum input when the selected metric has a meaningful progress maximum.
- Add row is enabled while row count < 6.
- Remove row is enabled while row count > 2.
- Reorder rows with explicit up/down controls or drag only if existing PI
  controls already support it. Do not add a drag-and-drop library in this batch.
- Curated metrics and catalog metrics are both selectable.
- Catalog picker should reuse the existing
  `buildCatalogMetricOptions(...)` descriptor grouping.
- Built-in curated options should use existing first-class metric target
  builders; do not encode metric ids by hand in the panel.

Because the current PI is single-target oriented, do not mutate
`CatalogMetricWidgetSettings` into a generic multi-row editor. Keep the dense
panel separate.

## Manifest And I18n

Update:

- `packages/hub/src/shared/stream-deck-actions.ts`
- `packages/hub/src/plugin.ts`
- `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`
- `packages/hub/src/i18n/manifest-messages.ts`
- generated locale files through the existing i18n scripts

Manifest action:

```json
{
  "Name": "Dense Multi Metric",
  "UUID": "com.ez.sho-metrics.dense-multi-metric",
  "Icon": "imgs/actions/sho-metrics/icon",
  "Tooltip": "Displays multiple metrics in one dense widget.",
  "PropertyInspectorPath": "ui/property-inspector.html",
  "Controllers": ["Keypad", "Encoder"],
  "Encoder": {
    "Icon": "imgs/actions/sho-metrics/icon",
    "layout": "$B1"
  },
  "UserTitleEnabled": false
}
```

Use the existing shared icon unless a dedicated action icon already exists in
the same implementation batch.

The `"$B1"` encoder layout in the example is provisional. Before shipping this
action, verify in a real Stream Deck host that it can carry the full custom
200 x 100 dense touch-strip image without clipping or unwanted SDK text slots.
If it cannot, add a custom layout JSON file and update the manifest action to
use that layout.

## Non-Goals

- Do not implement Stacked Metric or rotation.
- Do not implement press, dial rotate, dial press, touch tap, or key logic.
- Do not add HTTP custom metrics.
- Do not add command/CLI metrics.
- Do not add text metrics.
- Do not add per-row color settings.
- Do not add per-row visual theme/view settings.
- Do not add per-row polling intervals.
- Do not add unit overrides.
- Do not add runtime-observed maximum learning.
- Do not make `MetricStore` understand catalog or dense-widget semantics.
- Do not parse LHM metric ids, hardware ids, sensor ids, or source paths for
  display labels or maximums.
- Do not add a schema-driven PI registry.
- Do not add compatibility migration for old development settings unless the
  implementation has already shipped externally.

## Implementation Steps

Total estimated changed LOC: 5,900 to 8,400, including tests, generated locale
JSON, and generated protobuf TypeScript references.

These steps are intentionally not smaller. Each step establishes one boundary.
Do not merge adjacent steps: merging them makes it too easy to leak generated
proto into PI/rendering, couple read plans to single-slot settings, or render
without a stable stored contract.

### Step 1: Settings Contract And Resolved Model

Estimated changed LOC: 1,100 to 1,500, including tests and generated references.

Work:

1. Update `settings.proto` with `DenseMultiMetricWidget` and
   `DenseMetricSlot`.
2. Add the `dense_multi_metric = 2` oneof arm.
3. Run proto format/lint/build/generation.
4. Update `ResolvedWidget` with `ResolvedDenseMultiMetricWidget`.
5. Update the storage resolver to branch on `singleMetric` and
   `denseMultiMetric`.
6. Add dense quick-start settings for action kind `denseMultiMetric`.
7. Add storage-owned `slot_id` generation for quick-start rows and add-row
   patches.
8. Add dense-specific patch support. Do not route dense patches through
   `requireSingleMetricSlot`.
9. Add tests for proto read/write, quick-start defaults, resolver output,
   row-count bounds, and patch behavior.

Verification:

```powershell
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run generate:proto
npm.cmd run test:unit
```

### Step 2: Dense Action, Metric Keys, And Read Plans

Estimated changed LOC: 1,100 to 1,500, including tests.

Work:

1. Add `DenseMultiMetric` action class.
2. Add `denseMultiMetric` to `ActionKind` and UUID mapping.
3. Register the action in `plugin.ts`.
4. Make `MetricAction` union-safe by narrowing base-class `.slot` access in
   settings-change logging and the single-slot read-plan helper.
5. Ensure dense code does not use the single-slot `refreshMetricKeys(...)`
   helper.
6. Build row metric keys from resolved dense slots.
7. Build a multi-row read plan from each row's own source policy.
8. Reject or mark unconfigured any duplicate metric key that has a conflicting
   source policy.
9. Keep the first configured row as the displayed metric for existing source
   diagnostics.
10. Read row `WidgetData` from `MetricStoreReader`.
11. Apply row label and maximum resolution.
12. Add tests for empty rows, 2-to-6 rows, mixed first-class/catalog rows, mixed
   source policies, duplicate metric selections, and slot-level no-data.

Verification:

```powershell
npm.cmd run test:unit
```

### Step 3: Dense Progress-List Renderer

Estimated changed LOC: 1,500 to 2,100, including tests and snapshots.

Work:

1. Convert single, dual, and dense render options into a discriminated union.
2. Replace binary `isDual ? dual : single` dispatch with exhaustive switches.
3. Add dense frame/body composition in `metric-view-frame.ts` without weakening
   single/dual behavior.
4. Add `dense-metric-view.ts` and `dense-progress-list.ts`.
5. Implement square and touch-strip layouts exactly as documented above:
   square 2..6 rows in one column; touch strip 2..5 rows in one column; touch
   strip 6 rows in two columns.
6. Reuse existing theme frame, transparent surface, paint tokens, and
   multi-color thresholds.
7. Add text fitting/truncation so labels, values, and units do not overlap.
8. Add renderer unit tests for 2, 3, 4, 5, and 6 rows on square and touch-strip
   logical sizes, including the touch-strip 5-row single-column and 6-row
   two-column boundary.
9. Add or update visual snapshots only after inspecting the rendered output.

Verification:

```powershell
npm.cmd run test:unit
npm.cmd run build
```

Run visual tests only because this step changes widget rendering:

```powershell
npm.cmd run test:visual
```

### Step 4: Property Inspector Panel And I18n

Estimated changed LOC: 1,800 to 2,600, including tests and locale updates.

Work:

1. Add `DenseMultiMetricWidgetSettings.tsx`.
2. Branch `WidgetSettingsTab` by `resolved.widget.widgetKind` before
   single-metric domain routing.
3. Add row add/remove/reorder controls.
4. Add curated metric and catalog metric selection per row.
5. Reuse catalog descriptor option building for catalog rows.
6. Add row label input with short-label guidance. Renderer pixel fitting remains
   authoritative.
7. Add row maximum input with raw-unit storage conversion.
8. Hide View/Line/Text/Circle settings for dense widgets.
9. Reuse Theme, Color, Polling, reset, color compensation, and source
   diagnostics where they still apply.
10. Add i18n messages and generated manifest locale updates.
11. Add PI tests for row count boundaries, selection patches, label/max
    patches, catalog loading states, and hidden unsupported controls.

Verification:

```powershell
npm.cmd run i18n:check
npm.cmd run test:unit
npm.cmd run test:pi
```

### Step 5: Manifest, Integration, And Release Checks

Estimated changed LOC: 400 to 700, including tests and generated locale files.

Work:

1. Add the action to `manifest.json`.
2. Add manifest localization messages.
3. Verify whether `"$B1"` is sufficient for the dense 200 x 100 encoder image;
   if not, add a custom layout JSON file.
4. Confirm the action appears on Keypad and Encoder controller lists.
5. Confirm Encoder renders the touch-strip layout but input events do nothing.
6. Confirm square key renders 2 to 6 rows.
7. Confirm one failing row renders `N/A` or `...` without blanking other rows.
8. Confirm duplicate metric-key/source-policy conflicts degrade the later row
   without throwing from `normalizeMetricReadPlan(...)`.
9. Confirm helper/catalog unavailability preserves selected catalog display
   hints.
10. Confirm dragging multiple Dense Multi Metric widgets does not multiply
   polling outside the normal subscription model.

Verification:

```powershell
npm.cmd run i18n:check
npm.cmd run test:unit
npm.cmd run test:pi
npm.cmd run build
npx.cmd streamdeck validate com.ez.sho-metrics.sdPlugin
```

Manual host smoke:

1. Drag Dense Multi Metric to a square key.
2. Verify default rows appear and render.
3. Add rows until there are 6.
4. Select CPU usage, GPU usage, RAM usage, disk usage, network throughput, and
   one Advanced Sensor catalog metric.
5. Edit one row label and one row maximum.
6. Switch theme/color modes and verify every row updates together.
7. Drag Dense Multi Metric to a Stream Deck+ encoder slot and verify the
   200 x 100 touch-strip layout: 2 to 5 rows stay single-column and 6 rows use
   two columns.
8. Rotate/press/touch the encoder/key and verify no custom behavior fires.

## Acceptance Checklist

- `DenseMultiMetricWidget` is a new stored widget oneof arm.
- Dense rows reuse `MetricSlot` for metric selection.
- Dense rows have stable `slot_id` values.
- Quick-start and add-row patch paths generate `slot_id`; the resolver does not
  silently invent ids.
- Dense action subscribes 2 to 6 configured metric rows.
- Dense action builds source read plans from per-row source policies.
- Dense read-plan construction handles duplicate/conflicting metric keys before
  normalization and never relies on `normalizeMetricReadPlan(...)` throwing for
  slot-level behavior.
- `MetricStore` is unchanged except for tests if needed.
- Catalog default maximums still come from `catalog-metric-scale.ts`.
- Catalog readable value formatting still comes from
  `catalog-metric-widget-data.ts`.
- One row with no data does not blank the whole widget.
- Square layout is one column for 2 to 6 rows.
- Touch-strip layout is one column for 2 to 5 rows and two columns only for 6
  rows.
- Labels are pixel-fitted by the dense renderer. PI short-label guidance is not
  the only enforcement.
- Shared color settings apply to every row.
- There are no per-row color, theme, view, unit, polling, press, dial, or touch
  settings.
- Shared `MetricAction` code narrows the resolved widget union before reading
  single-slot fields.
- Dense render options use a discriminated union and exhaustive dispatch.
- Encoder layout is validated in a real host; if `"$B1"` is insufficient, a
  custom layout file is used.
- The PI does not import generated proto types directly.
- Renderer contracts receive app-owned data, not stored settings proto.
- `MetricAction` single-slot behavior still works for existing actions.
- Visual tests cover dense square and touch-strip rendering.
