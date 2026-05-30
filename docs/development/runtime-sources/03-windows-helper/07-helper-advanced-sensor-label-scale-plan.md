# Windows Helper Advanced Sensor Label And Scale Plan

This plan is written for a new coding session with no conversation context.

Read these first:

1. [Windows Helper Advanced Sensor Widget Plan](06-helper-advanced-sensor-widget-plan.md)
2. [Windows Helper Demand-Driven Refresh Plan](05-helper-demand-driven-refresh-plan.md)
3. [Phase 5c Demand-Driven Background Collection](../01-runtime-collection/03-demand-driven-background-collection.md)

The technical design background is in
`.agents/skills/technical-deisn-doc/references/TECHNICAL_DESIGN.md`,
especially the source-agnostic metric flow:

```text
Metric sources
  -> Scheduler / background collection
  -> MetricStore
  -> WidgetData
  -> view-updates
  -> view-rendering
  -> Stream Deck
```

## Objective

Improve the **Advanced Sensor** action after v1 by adding:

- a user-editable main label for the selected catalog metric;
- typed descriptor-derived display hints stored with the selected metric;
- semantic default maximum values for circle/bar progress;
- readable unit/value formatting for large units such as bytes, bytes/second,
  and hertz.

This is still one scalar metric per widget. Do not add per-view label editors,
multi-slot widgets, HTTP endpoints, or helper API changes in this batch.

## Current State

Advanced Sensor currently stores only:

```proto
message CatalogMetricTarget {
  optional string metric_id = 1;
  optional string fallback_label = 2;
  optional string fallback_unit = 3;
}
```

Current render behavior:

```text
CatalogMetricTarget
  -> packages/hub/src/settings/storage/resolver.ts
  -> ResolvedCatalogMetricTarget
  -> packages/hub/src/actions/catalog-metric.ts
  -> MetricStoreReader.getWidgetData(metricId, fallbackLabel, fallbackUnit, max)
  -> WidgetData
  -> existing single-metric view rendering
```

This is enough to render a selected metric while the helper descriptor catalog is
offline, but it is not enough to choose good display behavior:

- `fallback_unit = "W"` cannot distinguish CPU power from GPU power.
- `fallback_unit = "B"` can render unreadable values such as `123456789B`.
- `fallback_unit = "Hz"` can render unreadable values such as `3000000000Hz`.
- `fallback_label` is source-derived, but there is no separate user-owned
  label override.
- title-card captions are currently inferred from `WidgetData.label` plus unit,
  so a user label can accidentally change semantic captions.

## Product Decisions

Hard decisions for this batch:

- The Property Inspector section name is **Label & Scale**.
- Do not add user-editable unit text in this batch.
- Use helper/source descriptors that are already available in the PI picker; do
  not add fields to `source_api.proto`.
- Store typed source-derived display hints in `CatalogMetricTarget` when the
  user selects a metric.
- Use `MetricUnit` from `snapshot.proto` for the stored detected unit.
- Add ShoMetrics-owned `CatalogMetricCategory` and
  `CatalogMetricReadingKind` enums in `settings.proto`.
- Do not store helper/LHM raw hardware types, raw sensor types, hardware ids, or
  sensor ids in settings for display scaling.
- If the selected `metric_id` changes, clear the user custom label and custom
  maximum. Show a short PI note explaining this reset behavior.
- Keep line view adaptive in this batch. Scale settings affect circle/bar
  progress and any future fixed-scale line work only after that separate
  product decision is made.
- Do not follow a runtime-observed-max approach in this batch. Default maximums
  are semantic constants, and user custom maximum is the explicit override.
- Do not change title-card caption behavior in the first implementation batch.
  Semantic title-card caption cleanup is documented below as a separate follow-up
  because it touches shared rendering code used by every action.
- This is a pre-production settings shape change. Do not add migration code for
  existing development Advanced Sensor widgets; they can be reselected.

## Naming Model

Use these terms consistently:

| Term | Owner | Meaning |
| --- | --- | --- |
| `detected_*` | Source descriptor / PI picker | Metadata derived from the selected descriptor at selection time. |
| `custom_*` | User settings | User-owned override values. |
| `CatalogMetricCategory` | ShoMetrics settings/product | Stable semantic category used for scaling and captions. |
| `CatalogMetricReadingKind` | ShoMetrics settings/product | Stable semantic reading kind used for scaling and captions. |
| `MetricUnit` | Source-agnostic metric contract | Canonical scalar unit already used by source snapshots and descriptors. |

Do not use `fallback_*` for new fields. The old names hide ownership. After this
change, `detected_label` means "source/picker-derived display label" and
`custom_label` means "user override".

## Settings Contract

Update `contracts/proto/shometrics/v1/settings.proto`.

Import `snapshot.proto` so settings can store `MetricUnit`:

```proto
import "shometrics/v1/snapshot.proto";
```

Replace the current `CatalogMetricTarget` fields with:

```proto
message CatalogMetricTarget {
  // Source-scoped normalized metric id produced by a source adapter.
  optional string metric_id = 1 [(buf.validate.field).string.max_len = 1024];

  // Source-derived display hints captured when the user selected this metric.
  // These values are not user overrides. They allow rendering to remain useful
  // when the descriptor catalog is unavailable.
  optional string detected_label = 2 [(buf.validate.field).string.max_len = 128];
  optional MetricUnit detected_unit = 3 [(buf.validate.field).enum = {
    defined_only: true
  }];
  optional CatalogMetricCategory detected_category = 4 [(buf.validate.field).enum = {
    defined_only: true
  }];
  optional CatalogMetricReadingKind detected_reading_kind = 5 [(buf.validate.field).enum = {
    defined_only: true
  }];

  // User-owned display overrides. Absence means use detected/default behavior.
  optional string custom_label = 6 [(buf.validate.field).string.max_len = 128];
  optional double custom_maximum_value = 7 [(buf.validate.field).double = {
    gt: 0
    lte: 1000000000000000
  }];
}
```

Add package-level enums near the settings target messages:

```proto
enum CatalogMetricCategory {
  CATALOG_METRIC_CATEGORY_UNSPECIFIED = 0;
  CATALOG_METRIC_CATEGORY_CPU = 1;
  CATALOG_METRIC_CATEGORY_GPU = 2;
  CATALOG_METRIC_CATEGORY_MEMORY = 3;
  CATALOG_METRIC_CATEGORY_DISK = 4;
  CATALOG_METRIC_CATEGORY_NETWORK = 5;
  CATALOG_METRIC_CATEGORY_OTHER = 6;
}

enum CatalogMetricReadingKind {
  CATALOG_METRIC_READING_KIND_UNSPECIFIED = 0;
  CATALOG_METRIC_READING_KIND_USAGE = 1;
  CATALOG_METRIC_READING_KIND_TEMPERATURE = 2;
  CATALOG_METRIC_READING_KIND_POWER = 3;
  CATALOG_METRIC_READING_KIND_CLOCK = 4;
  CATALOG_METRIC_READING_KIND_FAN = 5;
  CATALOG_METRIC_READING_KIND_VOLTAGE = 6;
  CATALOG_METRIC_READING_KIND_CURRENT = 7;
  CATALOG_METRIC_READING_KIND_DATA = 8;
  CATALOG_METRIC_READING_KIND_THROUGHPUT = 9;
  CATALOG_METRIC_READING_KIND_TIMING = 10;
  CATALOG_METRIC_READING_KIND_LEVEL = 11;
  CATALOG_METRIC_READING_KIND_CONTROL = 12;
  CATALOG_METRIC_READING_KIND_OTHER = 13;
}
```

Rationale:

- `MetricUnit` is source-agnostic and already exists in `snapshot.proto`; using
  it avoids another unit string or duplicated settings-only unit enum.
- Category/reading enums are ShoMetrics-owned. They intentionally do not reuse
  helper/LHM raw hardware or sensor enums.
- Category is derived from the picker type classifier. Do not add motherboard,
  battery, or other subcategories until the picker has a concrete descriptor
  signal and product use for them.
- The large `custom_maximum_value` upper bound allows byte, hertz, and data
  readings while rejecting infinities and absurd JSON values.
- Existing development widgets that still have `fallback_label` /
  `fallback_unit` should be reselected. This batch intentionally does not add
  migration code.

No `source_api.proto` change is required.

## Resolved Settings

Update `packages/hub/src/settings/resolved-settings.ts`.

`ResolvedCatalogMetricTarget` should carry the same ownership split:

```ts
export interface ResolvedCatalogMetricTarget {
    readonly domain: "catalog";
    readonly metricId: string;
    readonly detectedLabel: string | undefined;
    readonly detectedUnit: MetricUnit;
    readonly detectedCategory: CatalogMetricCategory;
    readonly detectedReadingKind: CatalogMetricReadingKind;
    readonly customLabel: string | undefined;
    readonly customMaximumValue: number | undefined;
}
```

Implementation notes:

- `MetricUnit.UNSPECIFIED`, `CATALOG_METRIC_CATEGORY_UNSPECIFIED`, and
  `CATALOG_METRIC_READING_KIND_UNSPECIFIED` are valid resolved defaults when no
  metric has been selected.
- The resolver must not invent detected label/category/reading values from
  `metric_id`. The PI picker owns these hints because it has descriptors.
- Do not persist resolved defaults. Stored settings remain sparse user intent
  plus selected-metric hints.
- The resolver can trust stored enum values already passed storage validation;
  source-version-skew enum clamping belongs to the picker write path.

Files:

- `packages/hub/src/settings/storage/resolver.ts`
- `packages/hub/src/settings/resolved-settings.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.test.ts`
- `packages/hub/src/settings/storage/resolver.test.ts`
- `packages/hub/src/settings/storage/quick-start-widget-settings.ts`

## Picker-Derived Hints

Update `packages/hub/src/property-inspector/select-options/catalog-metric-options.ts`.

`SelectedCatalogMetric` should return:

```ts
export interface SelectedCatalogMetric {
    readonly metricId: string;
    readonly label: string;
    readonly unit: MetricUnit;
    readonly category: CatalogMetricCategory;
    readonly readingKind: CatalogMetricReadingKind;
}
```

Keep the existing guided picker shape:

```text
Type -> Hardware -> Reading -> Metric
```

but map the descriptor into stored semantic hints:

| Descriptor / picker fact | Stored hint |
| --- | --- |
| `descriptor.unit` | `detected_unit` |
| picker type `cpu/gpu/memory/disk/network/other` | matching `CatalogMetricCategory` |
| source sensor type `Load` / percent usage | `USAGE` |
| source sensor type `Temperature` | `TEMPERATURE` |
| source sensor type `Power` | `POWER` |
| source sensor type `Clock` | `CLOCK` |
| source sensor type `Fan` | `FAN` |
| source sensor type `Voltage` | `VOLTAGE` |
| source sensor type `Data` / `SmallData` | `DATA` |
| source sensor type `Throughput` | `THROUGHPUT` |
| source sensor type `Timing` | `TIMING` |
| source sensor type `Control` | `CONTROL` |
| source sensor type `Current` | `OTHER` in this batch |
| source sensor type `Level` | `OTHER` in this batch |
| unknown source sensor type | `OTHER` |

Use the existing picker classifiers as the single source of truth:

```text
descriptor -> classifyDescriptorType(...) -> CatalogMetricTypeId
descriptor -> classifyReading(...) -> ReadingId
CatalogMetricTypeId -> CatalogMetricCategory
ReadingId -> CatalogMetricReadingKind
```

Do not add a second source-sensor-type parser only for settings metadata.
Current and level readings do not have distinct display defaults or captions in
this batch, so keep the current picker grouping behavior and map them to
`OTHER`. Add picker groups for current/level only in a later batch that gives
them a user-visible display difference. Do not parse raw hardware ids or sensor
ids to recover missing semantics.

Unknown future `MetricUnit` values:

```text
if descriptor.unit is a known MetricUnit:
  store it as detected_unit
else:
  store MetricUnit.UNSPECIFIED
```

Tests:

- `packages/hub/src/property-inspector/select-options/catalog-metric-options.test.ts`
- Verify selected metric returns label, unit enum, category, and reading kind.
- Verify `Other` descriptors store `CATALOG_METRIC_CATEGORY_OTHER`.
- Verify unknown categories/readings become `OTHER`, not `UNSPECIFIED`.

## Property Inspector

Update `packages/hub/src/property-inspector/panels/CatalogMetricWidgetSettings.tsx`.

Panel order:

```text
Metric
View
Theme
Label & Scale
Line
Color
Polling
```

Add a `Label & Scale` section after `AppearanceSettings` and before
`LineSettings`.

Controls:

```text
Label
  text input
  placeholder = detected label
  value = custom label or empty string
  Use detected button clears custom_label

Scale
  Auto / Custom select
  Custom maximum numeric input when Custom is selected
  Input unit label is resolved from detected unit/category/reading
```

Include this note in the section:

```text
Custom label and scale reset when you choose a different metric.
```

Rules:

- Changing View, Theme, Line, Color, Polling, or source diagnostics never clears
  custom label or custom maximum.
- Changing the selected metric clears `custom_label` and
  `custom_maximum_value` only when the resolved `metric_id` changes.
- Clearing the metric selection clears all detected hints and custom overrides.
- `Use detected` clears `custom_label`; it does not copy `detected_label` into
  `custom_label`.
- Auto scale means `custom_maximum_value` is absent.
- Store `custom_maximum_value` in the raw detected unit. The PI must not ask the
  user to type raw byte or hertz values. It should present a readable unit and
  convert to/from raw units at the settings boundary.

Custom maximum input units:

| Detected unit | PI input unit | Stored raw multiplier |
| --- | --- | ---: |
| `METRIC_UNIT_BYTES` | `GB` | `1024 * 1024 * 1024` |
| `METRIC_UNIT_BYTES_PER_SECOND` | `MB/s` | `1024 * 1024` |
| `METRIC_UNIT_HERTZ` | `GHz` | `1000 * 1000 * 1000` |
| other units | canonical short unit | `1` |

Patch behavior in `writeSelectedCatalogMetric`:

```text
if selected metric id differs from current target.metricId:
  write metric_id, detected_label, detected_unit, detected_category,
  detected_reading_kind
  clear custom_label and custom_maximum_value

if selected metric id is unchanged:
  write refreshed detected hints
  keep custom_label and custom_maximum_value
```

Pass the current `target` into `writeSelectedCatalogMetric`; the function needs
the previous `metricId` to apply the reset rule.

Tests:

- `packages/hub/src/property-inspector/panels/WidgetSettingsTab.test.tsx`
- Verify `Label & Scale` appears after `Theme`.
- Verify the reset note is visible.
- Verify selecting a different metric clears custom label and custom maximum.
- Verify selecting the same metric keeps custom label and custom maximum.
- Verify `Use detected` clears only custom label.
- Verify byte and hertz custom maximum inputs display readable units and store
  raw values.

## Shared Unit Formatter

Move the existing private `formatMetricUnit(...)` function out of
`packages/hub/src/property-inspector/select-options/catalog-metric-options.ts`.

Recommended file:

```text
packages/hub/src/metrics/metric-unit-format.ts
```

The shared helper should convert known `MetricUnit` values to canonical short
unit text. Extract the whole existing switch, not a shortened subset:

```text
PERCENT -> %
CELSIUS -> C
VOLTS -> V
AMPERES -> A
WATTS -> W
HERTZ -> Hz
BYTES -> B
BYTES_PER_SECOND -> B/s
REVOLUTIONS_PER_MINUTE -> RPM
SECONDS -> s
MILLISECONDS -> ms
LITERS_PER_HOUR -> L/h
WATT_HOURS -> Wh
DECIBELS_A_WEIGHTED -> dBA
SIEMENS_PER_CENTIMETER -> S/cm
unknown/UNSPECIFIED -> ""
```

Both the PI picker and catalog action builder must use this helper. Do not copy
another unit switch into the action layer.

## Catalog Widget Data Builder

Do not put catalog display semantics into `MetricStore`.

`MetricStoreReader.getWidgetData(metricKey, label, unit, maxValue)` remains a
generic raw scalar-to-`WidgetData` adapter. Advanced Sensor should add a
catalog-specific builder near the action layer.

Recommended file:

```text
packages/hub/src/actions/catalog-metric/view-builder.ts
```

or, if the implementation stays small:

```text
packages/hub/src/actions/catalog-metric.ts
```

Required behavior:

```text
label =
  customLabel if trimmed non-empty
  else detectedLabel if non-empty
  else "METRIC"

maximum =
  customMaximumValue if present
  else resolveCatalogMetricDefaultMaximum(
    detectedCategory,
    detectedReadingKind,
    detectedUnit)

readHelperBackedWidgetData(...)
  reads MetricStoreReader.getWidgetData(metricId, label, canonicalUnitText, maximum)
  applies freshness / helper-unavailable gate
  applies catalog value formatting only to fresh data
```

Extend `packages/hub/src/actions/shared/helper-backed-widget-data.ts` with a
small fresh-data transform hook instead of duplicating freshness logic:

```ts
readonly transformFreshWidgetData?: (widgetData: WidgetData) => WidgetData;
```

Important:

- Progress uses raw scalar value divided by the raw-unit maximum.
- Display formatting may change `displayValue` and `unit`, but must not change
  `current`, `progress`, or `history`.
- Display formatting must run only after `readHelperBackedWidgetData` has
  confirmed the sample is fresh. Stale or unavailable helper states must keep
  the existing `Helper required`, `Helper error`, and `No sensor data` copy.
- Byte and frequency formatting must be value-based so the user does not see
  unreadable values such as `123456789B` or `3000000000Hz`.

Readable formatting rules:

| Detected unit | Display behavior |
| --- | --- |
| `METRIC_UNIT_BYTES` | Use `formatByteCount` from `packages/hub/src/metrics/byte-format.ts` with binary base 1024; display B/KB/MB/GB/TB/PB as appropriate. |
| `METRIC_UNIT_BYTES_PER_SECOND` + disk/storage category | Use `formatBytesPerSecond` from `packages/hub/src/metrics/byte-format.ts` with binary base 1024 and byte units; display KB/s/MB/s/GB/s as appropriate. |
| `METRIC_UNIT_BYTES_PER_SECOND` + network category | Use `formatBytesPerSecond` from `packages/hub/src/metrics/byte-format.ts` with decimal base 1000 and byte units; display KB/s/MB/s/GB/s as appropriate. Do not use bit/s in this batch. |
| `METRIC_UNIT_BYTES_PER_SECOND` + other category | Use the disk/storage convention: binary base 1024 and byte units. |
| `METRIC_UNIT_HERTZ` | Add a compact SI formatter with decimal base 1000; display Hz/KHz/MHz/GHz as appropriate. |
| other units | Use the shared canonical short label from `metric-unit-format.ts`. |

This batch does not add bit/s selection or user unit overrides.

Use the same bases for display formatting and PI custom-maximum conversion:
byte counts use 1024-based units; disk/storage bytes/s uses 1024-based units;
network bytes/s uses 1000-based `MB/s`; hertz uses 1000-based units.

## Default Maximum Resolver

Add a small resolver for semantic defaults.

Recommended file:

```text
packages/hub/src/actions/catalog-metric/default-maximum.ts
```

or keep same-file if implementation remains under a few dozen lines.

Inputs:

```ts
MetricUnit
CatalogMetricCategory
CatalogMetricReadingKind
```

Output:

```ts
number
```

Initial defaults:

| Condition | Maximum in raw unit |
| --- | ---: |
| percent / usage | 100 |
| temperature C | 100 |
| CPU power W | 250 |
| GPU power W | 450 |
| other power W | 300 |
| CPU clock Hz | 6_000_000_000 |
| GPU clock Hz | 3_000_000_000 |
| other clock Hz | 5_000_000_000 |
| CPU fan RPM | 4_000 |
| GPU fan RPM | 3_500 |
| other fan RPM | 3_000 |
| voltage V | 20 |
| current A | 100 |
| disk throughput B/s | 1_500 * 1024 * 1024 |
| network throughput B/s | 125 * 1000 * 1000 |
| other throughput B/s | 100 * 1024 * 1024 |
| bytes/data memory | 64 * 1024 * 1024 * 1024 |
| bytes/data GPU | 32 * 1024 * 1024 * 1024 |
| bytes/data disk | 2 * 1024 * 1024 * 1024 * 1024 |
| bytes/data other | 1024 * 1024 * 1024 |
| milliseconds | 1_000 |
| timing seconds | 100e-9 |
| seconds | 60 |
| fallback | 100 |

These are display defaults, not validation thresholds. They are intentionally
not model-specific. User custom maximum is the explicit correction path.

Do not add runtime-observed maximum recording in this batch.

Byte and hertz defaults assume source values use base units:

```text
bytes: raw bytes
bytes/s: raw bytes per second
hertz: raw hertz
```

Add tests that lock this action-side assumption so future source changes cannot
silently break catalog formatting.

Tests:

- CPU/GPU power defaults differ.
- CPU/GPU fan defaults differ.
- Disk/network throughput defaults differ.
- Bytes defaults do not collapse to 100.
- Unknown category/reading/unit returns 100.

## Deferred Follow-Up: Title-Card Semantic Captions

Do not include this section in the first Label & Scale implementation batch.
Finish settings, picker metadata, PI controls, scale defaults, readable unit
formatting, and helper freshness behavior first.

Current title-card caption logic lives in:

```text
packages/hub/src/view-rendering/text-content/title-card-text-content.ts
```

It currently derives code/caption from `WidgetData.label` and `WidgetData.unit`.
After custom labels, the caption should eventually stop depending on the user
label.

Known first-batch limitation: until this follow-up is implemented, title-card
continues using its existing label/unit heuristic. A custom label can therefore
change title-card captions in label-dependent cases such as usage and memory.

Add an optional semantic content path for catalog metrics:

```text
CatalogMetric target semantic hints
  -> catalog action view builder
  -> title-card content override
  -> renderTitleCardTextMetric(...)
```

Do not add a full schema for every view's label slots. This batch has one user
label only: the main metric display label.

Caption rules:

| Reading/unit | Caption |
| --- | --- |
| usage percent | existing usage caption |
| temperature | existing temperature caption |
| power | existing power caption |
| memory/data bytes | existing storage/memory caption where category supports it |
| throughput bytes/s | existing transfer caption |
| read/write labels from built-in disk/network actions | unchanged |
| unknown | existing generic measurement caption |

The user custom label may still influence title-card code text. It must not
change the semantic caption when detected category/reading/unit are available.

If making this change requires a renderer contract that is too broad, keep the
first implementation inside the catalog action's view builder and pass concrete
content only for catalog title-card views. Do not introduce a view-label-slot
registry.

Follow-up tests:

- Custom label changes title-card code text.
- Custom label does not change temperature/power/throughput caption when
  detected semantic hints are present.
- Existing CPU/GPU/Disk/Network title-card tests still pass.

## Non-Goals

- Do not add helper/source API fields.
- Do not add user unit overrides.
- Do not add per-view label slot editing.
- Do not add a renderer label schema registry.
- Do not add runtime-observed maximum recording.
- Do not add fixed line scale.
- Do not change title-card caption derivation in the first implementation
  batch.
- Do not add HTTP/CLI custom metric endpoints.
- Do not parse LHM hardware ids, raw hardware paths, raw sensor ids, or metric
  ids for display scaling.
- Do not make `MetricStore` understand catalog semantics.

## Implementation Steps

### Step 1: Settings Contract And Generated Types

1. Update `settings.proto` `CatalogMetricTarget`.
2. Add `CatalogMetricCategory` and `CatalogMetricReadingKind`.
3. Import `snapshot.proto` for `MetricUnit`.
4. Run proto format/lint/build.
5. Update generated TS references.

Verification:

```powershell
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run generate:proto
```

### Step 2: Storage, Resolver, And Patch Wiring

1. Update `ResolvedCatalogMetricTarget`.
2. Update `resolveCatalogMetricTarget` in
   `packages/hub/src/settings/storage/resolver.ts`.
3. Update catalog target patch type and application in
   `packages/hub/src/settings/storage/widget-settings-patch.ts`.
4. Update quick-start empty catalog target construction.
5. Update resolver and patch tests.

Verification:

```powershell
npm.cmd run test:unit
```

### Step 3: Picker Metadata Capture

1. Update `SelectedCatalogMetric` in
   `packages/hub/src/property-inspector/select-options/catalog-metric-options.ts`.
2. Keep option grouping behavior unchanged.
3. Return detected label, unit enum, category enum, and reading enum.
4. Derive category/reading from existing picker classifiers, not a second
   parser.
5. Clamp unknown future `MetricUnit` values to `UNSPECIFIED`.
6. Extract shared unit formatting.
7. Update tests for mapping and unknown fallback.

Verification:

```powershell
npm.cmd run test:unit
```

### Step 4: Property Inspector Label & Scale Section

1. Add a small `Label & Scale` section to
   `packages/hub/src/property-inspector/panels/CatalogMetricWidgetSettings.tsx`.
2. Add label input, `Use detected`, scale mode, and custom maximum input.
3. Apply the metric-change reset rule.
4. Add explanatory note.
5. Update PI tests.

Verification:

```powershell
npm.cmd run test:unit
```

### Step 5: Catalog Render Builder

1. Replace `resolveCatalogMetricMaximumValue(unit: string)` in
   `packages/hub/src/actions/catalog-metric.ts`.
2. Resolve label from `customLabel` / `detectedLabel`.
3. Resolve default maximum from typed unit/category/reading.
4. Extend `readHelperBackedWidgetData` with a fresh-data transform hook.
5. Apply readable display value/unit formatting for bytes, bytes/s, and hertz
   only to fresh helper data.
6. Keep progress/history in raw units.
7. Update catalog action and helper-backed widget data tests.

Verification:

```powershell
npm.cmd run test:unit
```

### Step 6: Full Verification

Run:

```powershell
npm.cmd run test:unit
npm.cmd run build
```

Manual checks:

1. Drag a new Advanced Sensor widget. It starts unselected.
2. Select GPU power. The label is detected by default, power circle/bar uses a
   GPU-appropriate maximum, and the unit is `W`.
3. Enter a custom label. Circle, text, bar, and line main labels reflect it.
4. Switch to another metric. Custom label and custom maximum clear, and the PI
   note makes this expected.
5. Select a bytes metric. It renders readable units such as MB/GB instead of a
   raw long `B` value.
6. Select a bytes/s metric. It renders readable units such as MB/s.
7. Select a hertz metric. It renders readable units such as MHz/GHz.
8. Stop the helper after a metric is selected. The widget still has detected
   label/unit/category/reading hints from settings and degrades without parsing
   metric ids.
9. Confirm helper demand behavior is unchanged: only the selected metric's
   polling group is demanded.

## Acceptance Checklist

- Settings use `detected_*` for source-derived hints and `custom_*` for user
  overrides.
- `fallback_label` and `fallback_unit` are removed or fully renamed in code and
  tests; no mixed old/new vocabulary remains.
- No `source_api.proto` change was made.
- `MetricUnit` is stored as an enum, not a string.
- Category and reading are ShoMetrics-owned settings enums, not helper/LHM raw
  enums.
- PI section is named `Label & Scale`.
- PI note says custom label and scale reset when a different metric is chosen.
- Changing `metric_id` clears `custom_label` and `custom_maximum_value`.
- Changing view/theme/color/line/polling keeps custom label and scale.
- Circle/bar maximum uses `custom_maximum_value` when present.
- Circle/bar automatic maximum uses detected unit/category/reading.
- Byte, bytes/s, and hertz values render in readable units.
- Readable value/unit formatting does not override stale or unavailable helper
  copy.
- Line view remains adaptive.
- `MetricStore` remains generic and does not learn catalog-specific unit,
  category, or reading behavior.
- Tests cover proto/resolver/patch/picker/PI/action behavior.
