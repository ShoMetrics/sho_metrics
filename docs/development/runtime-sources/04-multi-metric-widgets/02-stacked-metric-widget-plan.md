# Stacked Metric Widget Plan

This plan is written for a new coding session with no conversation context.

Read these first:

1. [Runtime Sources Overview](../README.md)
2. [Phase 5c Demand-Driven Background Collection](../01-runtime-collection/03-demand-driven-background-collection.md)
3. [Metric-Level Source Routing](../02-source-routing/02-metric-level-source-routing.md)
4. [Dense Multi Metric Widget Plan](01-dense-multi-metric-widget-plan.md)
5. `.agents/skills/technical-architecture/references/TECHNICAL_ARCHITECTURE.md`

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

Add a new Stream Deck action named **Stacked Metric**.

Stacked Metric stores 2 to 3 complete single-metric widget configurations in
one Stream Deck action. Only one slot is visible at a time. The action rotates
the active slot automatically, and the user can manually switch the active slot
through supported Stream Deck interactions.

This is not Dense Multi Metric. Dense renders several metrics at the same time.
Stacked renders one existing single-metric widget at a time.

This is not HTTP custom metrics. HTTP custom metrics define a new metric input
source/target. Stacked Metric arranges existing metric selections.

## Product Decisions

- Product/action label: **Stacked Metric**.
- Internal widget type: `StackedMetricWidget`.
- Stored slot type: `StackedMetricSlot`.
- `ActionKind`: `stackedMetric`.
- Stream Deck action UUID suffix: `stacked-metric`.
- Supported controllers in v1: `Keypad` and `Encoder`.
- Slot count: minimum 2, maximum 3 on every supported surface.
- Quick-start slots: CPU usage and Memory usage.
- Auto rotate is enabled by default.
- Default auto rotate interval: 3 seconds.
- User-configurable auto rotate interval: integer seconds from 1 to 5.
- Manual switching is always available, whether auto rotate is enabled or not.
- Manual switching resets the next auto rotate deadline.
- Square key interaction: `keyDown` switches to the next slot.
- Encoder interaction: `dialRotate` switches slots. Positive ticks switch to
  the next slot; negative ticks switch to the previous slot. If the SDK reports
  more than one tick in one event, apply every tick modulo the slot count.
- Do not use `dialDown`, `dialUp`, `touchTap`, long touch, double press, or
  hold as v1 Stacked Metric interactions.
- Do not implement user-configurable interaction mapping in v1.
- Do not implement smart priority, spike detection, or "hike inserts this slot
  into the foreground" behavior in v1.
- Do not support nested Stacked Metric or Dense Multi Metric slots in v1.
- Each slot has independent single-metric metric selection and appearance.
- Polling interval is widget-level through existing `WidgetPreferences`.
  Individual slots do not have independent polling intervals in v1.
- The active slot indicator is a transient horizontal dot stack such as
  `○ ● ○`. It appears in the bottom-right corner for 1 second after every slot
  switch and then disappears. It does not reserve layout space or move the
  underlying metric view.
- No indicator is shown on initial render because no switch has completed yet.
- The action icon should use a stack/file-stack visual. Prefer a dedicated
  action icon under `imgs/actions/stacked-metric/icon` over reusing the generic
  Sho Metrics icon.

## Stream Deck Interaction Facts

These facts were verified against the local `@elgato/streamdeck` v2 package and
manual host testing on 2026-06-07.

- The SDK exposes keypad events as `onKeyDown` and `onKeyUp`.
- Ordinary square keys receive `keyDown` and `keyUp`.
- When a Sho Metrics action is placed inside Stream Deck Key Logic, the plugin
  receives ordinary `keyDown` and `keyUp` for the action selected by the
  official gesture router. The event does not tell the plugin whether the user
  used single press, double press, or hold.
- `isInMultiAction` is not a reliable static detector for Key Logic display
  context. It must not be used to disable Stacked Metric switching in v1.
- The SDK exposes encoder events as `onDialDown`, `onDialRotate`, `onDialUp`,
  and `onTouchTap`.
- Ordinary dial actions receive `dialDown`, `dialRotate`, `dialUp`, and
  `touchTap`.
- When a Sho Metrics dial action is placed inside the official Dial Stack,
  `dialDown` and `dialUp` are consumed by Stream Deck's Dial Stack behavior.
  `dialRotate` still reaches the plugin.
- `touchTap` reaches the plugin both inside and outside Dial Stack, but v1 does
  not use touch tap to avoid adding a second encoder interaction model.
- The SDK manifest supports `Actions[].Encoder.TriggerDescription` and runtime
  `setTriggerDescription(...)` for the Stream Deck app's encoder interaction
  descriptions.
- No equivalent keypad trigger-description API was found in the SDK references.
  Do not assume the left-side Stream Deck app hint area can be customized for
  square keys.

## Naming Decision

Use `StackedMetricWidget`, not `RotatingMetricWidget`.

Rotation is one behavior of the product. The user's mental model is "several
metric widgets stacked into one key, with one visible at a time." `Stacked`
therefore names the product and remains valid if future switching modes are
added. `Rotating` over-focuses on the timer.

Boundary names:

| Surface | Name |
| --- | --- |
| Stream Deck action label | `Stacked Metric` |
| `ActionKind` | `stackedMetric` |
| Stream Deck action UUID suffix | `stacked-metric` |
| Stored proto message | `StackedMetricWidget` |
| Stored proto slot | `StackedMetricSlot` |
| Resolved widget kind | `"stackedMetric"` |
| Action class | `StackedMetric` |
| Runtime state owner | `StackedMetric` action |
| Indicator renderer contract | `StackedMetricIndicator` |

Do not use `WidgetSlot` in v1. That name implies generic widget composition.
V1 stores only single-metric slots. Future nested widgets should be added as
deliberate new oneof arms, not by making the v1 slot accept every widget shape.

## Current Code Facts

The implementation must be based on these existing files and contracts:

- `contracts/proto/shometrics/v1/settings.proto`
  - `StoredWidgetSettings.widget` currently has `single_metric = 1` and
    `dense_multi_metric = 2`.
  - `SingleMetricWidget` already models one complete single-metric widget.
  - `DenseMultiMetricWidget` already proves the oneof extension pattern for a
    multi-slot widget.
  - `WidgetPreferences` is stored outside the widget oneof and already owns
    polling frequency.
- `packages/hub/src/settings/resolved-settings.ts`
  - `ResolvedWidget` currently covers single and dense widgets.
  - `ResolvedSingleMetricWidget` is the runtime shape that existing single
    metric view builders expect.
  - `requireResolvedSingleMetricWidget(...)` is a transitional assertion. Do
    not spread it further as the long-term Stacked architecture.
- `packages/hub/src/settings/storage/quick-start-widget-settings.ts`
  - CPU, GPU, Memory, Disk, Network, Catalog, and Dense quick-start settings
    are created here.
  - Dense quick-start already creates CPU + GPU. Stacked quick-start must use
    CPU + Memory because GPU is unavailable on some machines.
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
  - Single and dense patch paths are explicit. Stacked patches must be explicit
    too. Do not mutate Stacked slots through the single-metric patch branch.
- `packages/hub/src/actions/metric-action.ts`
  - Action lifecycle, active action state, settings refresh, metric
    subscription, runtime cache, and single-slot read-plan defaults live here.
  - `getMetricKeys(event)` already returns `readonly string[]`.
  - `buildMetricCollectionReadPlan(...)` can be overridden by multi-slot
    actions.
  - `refreshSubscription(...)` currently uses one interval both for background
    collection subscription construction and the action render timer. Stacked
    Metric rotation must not be blocked by a larger polling interval.
- `packages/hub/src/actions/dense-multi-metric.ts`
  - Dense already demonstrates action-owned multi-slot read-plan construction,
    Property Inspector runtime cache warming, and `getDisplayedMetricKey(...)`
    override.
- `packages/hub/src/actions/dense-multi-metric/row-data.ts`
  - Dense already handles duplicate metric keys with conflicting source
    policies before calling `normalizeMetricReadPlan(...)`.
  - Stacked must follow the same conflict-safety rule.
- Existing single metric view builders:
  - `packages/hub/src/actions/cpu.ts`
  - `packages/hub/src/actions/gpu.ts`
  - `packages/hub/src/actions/memory.ts`
  - `packages/hub/src/actions/disk/view-builder.ts`
  - `packages/hub/src/actions/network/view-builder.ts`
  - `packages/hub/src/actions/catalog-metric.ts`
  These are the canonical owners for single-metric `WidgetData`, notices,
  helper onboarding copy, unit formatting, and icon selection. Stacked must
  reuse or extract these builders. Do not create a parallel Stacked renderer
  for CPU/GPU/Memory/Disk/Network/Catalog behavior.
- `packages/hub/src/view-rendering/metric-view-frame.ts`
  - Single, dual, and dense render options are already discriminated by
    `metricRenderKind`.
  - Stacked should render the active slot through existing single/dual render
    options and add only a small transient indicator overlay.
- `packages/hub/src/view-updates/runner.ts`
  - Owns dispatch to key/touch-strip rendering and Stream Deck output.
  - Stacked must continue to use the same output path as the active single
    metric view.
- `packages/hub/src/i18n/manifest-localization.ts`
  - Manifest localization already supports
    `Actions[].Encoder.TriggerDescription`.
- `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`
  - Existing metric actions use `Controllers: ["Keypad", "Encoder"]` and
    `Encoder.layout = "$B1"`.

## Data Ownership

Persisted settings owner:

- `StackedMetricWidget` stores ordered slots and rotation settings.
- Each `StackedMetricSlot` stores a stable `slot_id`.
- Each v1 slot stores a `SingleMetricWidget`.
- `StackedMetricWidget` does not store a generic `StoredWidgetSettings`.
- `StackedMetricWidget` does not store nested Dense or nested Stacked widgets
  in v1.
- `WidgetPreferences` remains outer widget-level settings. Do not add per-slot
  polling fields.

Runtime state owner:

- `StackedMetric` action owns active slot id, auto-rotate timer, and transient
  indicator hide timer.
- Active slot is tracked by `slot_id`, not only by index, so reorder preserves
  the active slot when possible.
- If the active `slot_id` is removed, runtime falls back to the first resolved
  slot.
- Runtime active slot state is not persisted.
- Transient indicator state is not persisted.

Property Inspector owner:

- The Stacked PI edits slot list, selected slot, rotation settings, and shared
  polling settings.
- The selected slot editor reuses single-metric settings components. It must
  not create a fake Stream Deck action or fake SDK event.
- Runtime descriptor catalogs stay in `WidgetRuntimeCache`.
- The PI must not import generated proto types directly.

Rendering owner:

- Existing single/dual/dense renderers keep owning their metric body.
- Stacked adds only an overlay indicator on top of the active slot render.
- The indicator renderer receives app-owned indicator data, not stored proto.
- The indicator must not alter the active slot's body viewport or layout.

Source/runtime owner:

- Background collection and source routing keep owning polling and fallback.
- Stacked subscribes to every configured slot so manual or automatic switching
  does not wait for a first sample.
- One slot with no data must not prevent other slots from rendering when they
  become active.
- Duplicate metric keys with conflicting source policies must be handled before
  `normalizeMetricReadPlan(...)`, as Dense does today.

## Settings Contract

Update `contracts/proto/shometrics/v1/settings.proto`.

Recommended shape:

```proto
message StoredWidgetSettings {
  oneof widget {
    SingleMetricWidget single_metric = 1;
    DenseMultiMetricWidget dense_multi_metric = 2;
    StackedMetricWidget stacked_metric = 3;
  }

  WidgetPreferences preferences = 10;
}

message StackedMetricWidget {
  // Ordered slots displayed one at a time.
  // Valid stored length is 2..3.
  repeated StackedMetricSlot slots = 1 [(buf.validate.field).repeated = {
    min_items: 2
    max_items: 3
  }];

  StackedMetricRotationSettings rotation = 2;
}

message StackedMetricSlot {
  // Stable PI/runtime identity. Generated by Hub and opaque to users.
  string slot_id = 1 [(buf.validate.field).string = {
    min_len: 1
    max_len: 64
  }];

  // V1 supports only a complete single-metric widget per stacked slot. Future
  // nested widget support must add explicit arms here instead of storing a
  // generic StoredWidgetSettings blob.
  oneof item {
    SingleMetricWidget single_metric = 2;
  }
}

message StackedMetricRotationSettings {
  // Absence means enabled. This stays optional because stored settings are
  // sparse and the product default is true.
  optional bool auto_rotate_enabled = 1;

  // Absence means 3 seconds.
  optional uint32 interval_seconds = 2 [(buf.validate.field).uint32 = {
    gte: 1
    lte: 5
  }];
}
```

Do not add JSON blobs, generic `Any`, renderer layout strings, or a repeated
`StoredWidgetSettings`. The Stacked extension boundary is the new
`StoredWidgetSettings.widget` oneof arm plus the explicit slot item oneof.

Why `StackedMetricSlot` wraps `SingleMetricWidget`:

- Each Stacked slot should behave like a complete single metric widget.
- `SingleMetricWidget` already carries metric selection and per-slot appearance
  through `MetricSlot.overrides.appearance`.
- `WidgetPreferences` stays outside because Stacked has one action runtime and
  one background subscription owner.
- A repeated slot list needs stable identity; `SingleMetricWidget` intentionally
  does not have an id.

## Resolved Settings

Update `packages/hub/src/settings/resolved-settings.ts`.

Add:

```ts
export type ResolvedWidget =
    | ResolvedSingleMetricWidget
    | ResolvedDenseMultiMetricWidget
    | ResolvedStackedMetricWidget;

export interface ResolvedStackedMetricWidget {
    readonly widgetKind: "stackedMetric";
    readonly slots: readonly ResolvedStackedMetricSlot[];
    readonly rotation: ResolvedStackedMetricRotationSettings;
}

export interface ResolvedStackedMetricSlot {
    readonly slotId: string;
    readonly widget: ResolvedSingleMetricWidget;
}

export interface ResolvedStackedMetricRotationSettings {
    readonly autoRotateEnabled: boolean;
    readonly intervalSeconds: number;
}
```

Resolver rules:

- If stored widget is `stacked_metric`, resolve 2 to 3 stored slots.
- Resolve each `single_metric` slot through the existing single metric resolver
  path.
- Missing or empty `slot_id` is invalid stored data. Quick-start and Stacked
  patch write paths must create ids before saving. The resolver must not
  silently invent ids.
- `rotation.auto_rotate_enabled` default is `true`.
- `rotation.interval_seconds` default is `3`.
- Resolved interval is clamped or rejected to 1..5 according to the existing
  resolver validation style. Do not let an invalid stored value schedule a timer
  outside the product range.
- Stacked slot count must resolve to 2..3. Quick-start creates CPU + Memory.
- Slot `slot_id` values must remain stable through reorder and metric edits.
- The resolved Stacked widget must not contain Dense or Stacked child widgets
  in v1.

## Action Behavior

Add `packages/hub/src/actions/stacked-metric.ts`.

The action extends `MetricAction`.

Metric collection behavior:

- `getMetricKeys(event)` returns every configured metric key required by every
  configured Stacked slot.
- `buildMetricCollectionReadPlan(event, metricKeys)` builds a combined read
  plan from every slot's source policy.
- `getDisplayedMetricKey(event)` returns the active slot's primary displayed
  metric key.
- Duplicate metric key plus same source policy may deduplicate subscription but
  must not remove slots.
- Duplicate metric key plus conflicting source policy must degrade the later
  conflicting slot before normalization. Do not rely on
  `normalizeMetricReadPlan(...)` throwing.

Rendering behavior:

- On each render, pick the active `StackedMetricSlot`.
- Build the active slot's render options through the canonical single-metric
  builder for that slot's target domain.
- Add transient indicator data only when a slot switch occurred in the last
  1000ms.
- Call `setMetricView(...)` with the active slot's render options.
- Do not hand-roll Stacked-specific CPU/GPU/Memory/Disk/Network/Catalog view
  logic.

Interaction behavior:

- Override `onKeyDown(event)` and switch to the next slot for keypad actions.
- Override `onDialRotate(event)` and switch by `event.payload.ticks`.
- Do not override `onDialDown`, `onDialUp`, or `onTouchTap` for Stacked v1.
- Manual switching must work when auto rotate is disabled.
- Manual switching resets the next auto rotate deadline.
- Manual switching shows the indicator for 1 second.
- Key Logic and Multi Action receive ordinary key events. Do not try to detect
  and disable Stacked behavior inside those official containers.
- Dial Stack consumes dial press events. Do not design around dial press.

Timer behavior:

- Auto rotate must not be blocked by `WidgetPreferences.pollingFrequencySeconds`.
- Current `BackgroundCollectionBinding` uses the action polling interval as the
  render timer interval. Stacked therefore needs an action-owned rotation timer
  or a small `MetricAction` render-interval hook that separates render cadence
  from collection cadence.
- Keep source collection interval equal to widget polling frequency.
- Keep Stacked rotation interval equal to
  `ResolvedStackedMetricRotationSettings.intervalSeconds`.
- When auto rotate is enabled, the rotation timer advances the active slot and
  refreshes the active metric view.
- When auto rotate is disabled, the rotation timer is not running.
- Use a one-shot hide timer or equivalent render refresh so the indicator hides
  after 1 second even when the next polling render is later than 1 second.
- Dispose Stacked timers on `onWillDisappear`.
- Recreate or update Stacked timers after settings changes.

Runtime cache behavior:

- Stacked slot editors reuse catalog and disk pickers. Warm the same runtime
  caches that single and dense editors need.
- Prefer extracting shared cache refresh helpers from Dense/Catalog if Stacked
  becomes the second caller. Do not duplicate descriptor and disk volume warming
  logic by copy-paste.

## Single Metric Builder Extraction

Stacked cannot implement rendering by calling CPU/GPU/Memory action classes.
Those classes are Stream Deck action owners. Stacked needs pure builder
functions that accept settings, target, metrics, helper status, and event, then
return `SingleMetricViewOptions`.

Required extraction:

- Keep domain-specific render semantics where they are today:
  - CPU in `actions/cpu.ts` or an action-owned CPU support module.
  - GPU in `actions/gpu.ts` or an action-owned GPU support module.
  - Memory in `actions/memory.ts` or an action-owned Memory support module.
  - Disk in `actions/disk/view-builder.ts`.
  - Network in `actions/network/view-builder.ts`.
  - Catalog in `actions/catalog-metric.ts` or an action-owned Catalog support
    module.
- Add one Stacked-facing dispatcher that takes a resolved single metric widget
  and target, then calls the correct domain builder.
- Existing single actions must call the same builders after extraction.
- Do not introduce a generic renderer registry. A direct `switch` on target
  domain is acceptable because the domain list is explicit and already exists
  in `ResolvedMetricTarget`.
- Do not pass generated proto into the builder dispatcher.

## Indicator Rendering

Add a small render-owned indicator contract:

```ts
export interface StackedMetricIndicator {
    readonly currentIndex: number; // 1-based
    readonly totalCount: number;
}
```

Recommended placement:

- Add an optional `stackedIndicator?: StackedMetricIndicator` to the render
  options path that reaches `metric-view-frame.ts`.
- Render it after the active metric body and frame so it overlays without
  affecting layout.
- Position it in the bottom-right corner for square keys and touch-strip
  layouts.
- Draw a small rounded pill with one horizontal dot per slot. The active slot's
  dot is opaque and inactive dots are dimmed.
- The pill and dots must use theme-aware contrast. Do not hard-code a color
  that disappears in `pixel-window`, `terminal`, or `color-filled`.
- Do not show the indicator when no switch happened in the last 1000ms.
- Do not reserve layout space for the indicator.
- Do not add a user setting for indicator position or style in v1.

The indicator originally used a small `current/total` number. Visual review
showed that text was unreadable at key size, so the accepted v1 product decision
is the horizontal dot stack.

## Property Inspector

Add a Stacked widget branch before single-metric and dense routing in
`WidgetSettingsTab.tsx`.

Recommended new panel:

```text
packages/hub/src/property-inspector/panels/StackedMetricWidgetSettings.tsx
```

Panel structure:

```text
Stack
Rotation
Selected Slot Editor
Polling
```

Stack section:

- Show 2 to 3 slots.
- Each slot row shows index, a short summary of the selected metric, and
  controls to select that slot for editing.
- Add slot is enabled while slot count < 3.
- Remove slot is enabled while slot count > 2.
- Reorder with explicit up/down controls. Do not add drag-and-drop library in
  this batch.
- Preserve `slot_id` across reorder and edits.

Rotation section:

- Toggle auto rotate.
- Dropdown interval control from 1 to 5 seconds.
- Default shown value is 3 seconds.
- Explain through concise UI copy that Keypad actions switch on key press,
  Encoder actions switch on dial rotation, and manual switching still works
  when auto rotate is disabled.

Selected Slot Editor:

- Only one slot's full single-metric editor is visible at a time.
- Reuse existing single metric metric-selection and appearance controls.
- The selected slot editor must write patches into the selected
  `StackedMetricSlot.single_metric`.
- Do not show all 2 to 3 full single metric editors expanded at once.
- Do not show per-slot polling settings.
- Catalog metric picker and disk volume picker must work in a selected slot.

Key Logic / Multi Action copy:

- Do not show a detection-based warning. Runtime tests showed Key Logic context
  is not reliably detectable as a static action state.
- If copy is needed, make it general: official Key Logic/Multi Action may
  trigger Stacked Metric, but Sho Metrics does not control the outer official
  container's display.

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
  "Name": "Stacked Metric",
  "UUID": "com.ez.sho-metrics.stacked-metric",
  "Icon": "imgs/actions/stacked-metric/icon",
  "Tooltip": "Rotates between multiple metric widgets on one key.",
  "PropertyInspectorPath": "ui/property-inspector.html",
  "Controllers": ["Keypad", "Encoder"],
  "Encoder": {
    "Icon": "imgs/actions/sho-metrics/icon",
    "layout": "$B1",
    "TriggerDescription": {
      "Rotate": "Switch metric"
    }
  },
  "UserTitleEnabled": false
}
```

Encoder trigger description:

- Use `Encoder.TriggerDescription.Rotate` to fill the Stream Deck app's
  interaction hint area for dial actions.
- Localize trigger descriptions through the existing manifest localization
  pipeline.
- Do not add `Push`, `Touch`, or `LongTouch` descriptions in v1 because those
  interactions are not part of Stacked Metric v1.
- Do not assume a keypad equivalent exists.

Icon:

- Add a dedicated `stacked-metric` action icon. A file-stack/layers visual is
  appropriate.
- Keep the normal key placeholder image unchanged unless the existing action
  icon pipeline requires a matching key asset.

## Non-Goals

- Do not implement HTTP custom metrics.
- Do not implement CLI/local command metrics.
- Do not implement text metrics.
- Do not implement Dense inside Stacked.
- Do not implement Stacked inside Stacked.
- Do not implement generic widget composition.
- Do not add per-slot polling intervals.
- Do not add per-slot source-runtime loops.
- Do not add smart priority or spike-based foreground switching.
- Do not add user-configurable interaction mapping.
- Do not use dial press, touch tap, long touch, double press, or hold.
- Do not add drag-and-drop reorder library.
- Do not create Stacked-specific copies of CPU/GPU/Memory/Disk/Network/Catalog
  rendering logic.
- Do not make `MetricStore` aware of Stacked semantics.
- Do not add compatibility migration for old development settings unless this
  action has already shipped externally.

## Implementation Steps

Total estimated changed LOC: 4,600 to 6,700, including tests, generated locale
JSON, generated protobuf TypeScript references, and visual snapshots.

These steps are intentionally not smaller. Each step establishes one boundary.
Do not merge adjacent steps: merging them hides contract, lifecycle/timer,
rendering overlay, and PI concerns in one diff and makes review unreliable.

### Step 1: Settings Contract And Resolved Model

Estimated changed LOC: 900 to 1,300, including tests and generated references.

Work:

1. Update `settings.proto` with `StackedMetricWidget`,
   `StackedMetricSlot`, and `StackedMetricRotationSettings`.
2. Add `stacked_metric = 3` to `StoredWidgetSettings.widget`.
3. Run proto format/lint/build/generation.
4. Add `ResolvedStackedMetricWidget`,
   `ResolvedStackedMetricSlot`, and
   `ResolvedStackedMetricRotationSettings`.
5. Update the storage resolver to branch on `stackedMetric`.
6. Add Stacked quick-start settings for action kind `stackedMetric` with CPU
   usage and Memory usage slots.
7. Add storage-owned `slot_id` generation for quick-start slots and add-slot
   patches.
8. Add Stacked-specific patch support. Do not route Stacked patches through
   `requireSingleMetricSlot`.
9. Add tests for proto read/write, quick-start defaults, resolver output,
   rotation defaults, interval bounds, row-count bounds, slot id preservation,
   and patch behavior.

Verification:

```powershell
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run generate:proto
npm.cmd run test:unit
```

### Step 2: Single Metric Builder Reuse, Stacked Action, And Timers

Estimated changed LOC: 1,200 to 1,800, including tests.

Work:

1. Add `stackedMetric` to `ActionKind` and UUID mapping.
2. Add `StackedMetric` action class and register it in `plugin.ts`.
3. Extract or expose reusable single metric render builders so Stacked can
   render CPU, GPU, Memory, Disk, Network, and Catalog through the same code as
   existing single actions.
4. Add a direct Stacked dispatcher from resolved active single metric target to
   the correct builder.
5. Build metric keys and read plans for every configured slot.
6. Add a shared multi-slot read-plan conflict helper if Dense and Stacked would
   otherwise duplicate the same duplicate/conflicting source-policy logic.
7. Subscribe every configured slot while rendering only the active slot.
8. Add action-owned runtime state keyed by action id: active slot id, auto
   rotate timer handle, indicator hide timer handle, and last switch time.
9. Start, update, and dispose Stacked timers on will-appear, settings-change,
   and will-disappear.
10. Ensure auto rotate interval is independent of source polling interval.
11. Implement keypad `keyDown` next-slot behavior.
12. Implement encoder `dialRotate` previous/next-slot behavior.
13. Ensure manual switch resets the auto rotate deadline and displays the
    indicator for 1 second.
14. Add tests for active slot selection, reorder preservation, removed active
    slot fallback, auto rotate enabled/disabled, manual switching, timer
    disposal, duplicate read-plan conflicts, and builder dispatch.

Verification:

```powershell
npm.cmd run test:unit
npm.cmd run build
```

### Step 3: Transient Indicator Rendering

Estimated changed LOC: 700 to 1,000, including tests and snapshots.

Work:

1. Add a small render-owned `StackedMetricIndicator` contract.
2. Thread optional indicator data through the render options path used by
   `setMetricView(...)` and `metric-view-frame.ts`.
3. Render a bottom-right horizontal dot-stack indicator after every active slot
   switch.
4. Ensure indicator rendering does not alter body viewport, frame layout, or
   active slot metric layout.
5. Make indicator colors theme-aware and readable on flat, cupertino-glass,
   color-filled, terminal, and pixel-window themes.
6. Add unit tests for indicator presence/absence and coordinates.
7. Add visual snapshots for at least square and touch-strip Stacked Metric with
   the indicator visible, plus one non-visible baseline.

Verification:

```powershell
npm.cmd run test:unit
npm.cmd run build
```

Run visual tests only because this step changes widget rendering:

```powershell
npm.cmd run test:visual
```

### Step 4: Property Inspector Panel

Estimated changed LOC: 1,300 to 1,900, including tests.

Work:

1. Add `StackedMetricWidgetSettings.tsx`.
2. Branch `WidgetSettingsTab` by `resolved.widget.widgetKind ===
   "stackedMetric"` before single-metric and dense routing.
3. Add stack list, add/remove, selected slot, and up/down reorder controls.
4. Add rotation toggle and interval input from 1 to 5 seconds.
5. Extract reusable single metric editor components where needed instead of
   rendering fake action contexts.
6. Render only the selected slot's single metric editor.
7. Route selected slot patches into the selected
   `StackedMetricSlot.single_metric`.
8. Hide per-slot polling controls.
9. Keep widget-level Polling visible once at the outer Stacked panel level.
10. Ensure catalog descriptor and disk volume runtime caches are refreshed for
    selected slot editors.
11. Add PI tests for slot add/remove/reorder, selected slot editing, rotation
    controls, interval bounds, catalog rows, disk rows, and hidden per-slot
    polling.

Verification:

```powershell
npm.cmd run test:unit
npm.cmd run test:pi
```

### Step 5: Manifest, I18n, Host Smoke, And Release Checks

Estimated changed LOC: 500 to 700, including locale files and icon assets.

Work:

1. Add the action to `manifest.json`.
2. Add manifest name, tooltip, and encoder trigger description messages.
3. Generate locale files through the existing i18n scripts.
4. Add a dedicated Stacked Metric action icon.
5. Confirm the action appears on Keypad and Encoder controller lists.
6. Confirm Encoder trigger description shows the rotate interaction in the
   Stream Deck app's left-side hint area.
7. Confirm Keypad has no custom interaction hint unless the SDK exposes a
   keypad equivalent.
8. Confirm square key press switches to the next slot.
9. Confirm encoder rotation switches previous/next.
10. Confirm Dial Stack does not break rotate behavior and press is not required.
11. Confirm auto rotate continues at 1..5 seconds even when polling interval is
    larger than the rotation interval.
12. Confirm the indicator appears for 1 second after auto and manual switches.
13. Confirm one unavailable active slot does not poison other slots when
    switching.
14. Confirm multiple Stacked Metric widgets coalesce polling through existing
    background collection behavior.

Verification:

```powershell
npm.cmd run i18n:check
npm.cmd run test:unit
npm.cmd run test:pi
npm.cmd run build
npx.cmd streamdeck validate com.ez.sho-metrics.sdPlugin
```

Manual host smoke:

1. Drag Stacked Metric to a square key.
2. Verify default slots are CPU usage and Memory usage.
3. Press the key and verify the active slot switches.
4. Enable auto rotate and set interval to 1 second.
5. Verify switching happens every second and the indicator appears for one
   second after switches.
6. Set interval to 5 seconds and verify switching follows the new interval.
7. Disable auto rotate and verify key press still switches manually.
8. Edit slot 1 to CPU, slot 2 to Memory, and slot 3 to an Advanced Sensor.
9. Give each slot a different appearance and verify switching shows the active
   slot's appearance.
10. Drag Stacked Metric to a Stream Deck+ encoder slot.
11. Rotate right and left and verify next/previous slot behavior.
12. Put Stacked Metric inside Dial Stack and verify rotating still switches the
    Stacked slot while Dial Stack press remains official behavior.
13. Verify the encoder rotate trigger description is visible in the Stream Deck
    app.

### Step 6: Property Inspector Drill-In Slot Editor

Estimated changed LOC: 250 to 500, including tests and locale files.

This step is a PI UX refinement only. It must not change proto, resolved
settings, Stacked action runtime, render contracts, or slot patch ownership.

Step 4 renders the stack list, rotation settings, selected slot editor, and
polling settings in one inline page. That is functional but too dense. The
desired UX is a two-page local PI flow:

```text
Stacked Settings Page
  -> Edit slot
Metric #N Settings Page
  -> Back
Stacked Settings Page
```

Do not implement a page transition animation in this step. A clean instant
switch is preferred over a fragile custom animation inside the Stream Deck
Property Inspector iframe.

Stacked Settings Page:

- Show the slot list, add/remove, and reorder controls.
- Show each slot's short summary and an `Edit` button.
- Show a max-reached note below Add when the slot count reaches the Stacked
  maximum.
- Show rotation controls.
- Show widget-level polling once, with copy explaining that one polling
  frequency is shared by every metric inside this key. Dense Multi Metric has
  the same shared polling behavior.
- Do not show any slot's full single-metric settings inline.
- Dense Multi Metric should show the same max-reached note when it reaches its
  own maximum row count.
- Dense Multi Metric theme previews should render a Dense progress-list sample,
  not the single-metric circle fallback.

Metric #N Settings Page:

- Show a top header with a Back button.
- Show copy equivalent to: `Editing metric #N settings`.
- Show concise copy explaining that edits auto-save and Back returns to Stacked
  settings.
- Show the selected slot's metric type dropdown.
- Reuse `SingleMetricWidgetSettings` for the selected slot.
- Continue wrapping child single-metric patches in
  `StackedMetricSlot.single_metric`.
- Keep per-slot polling hidden with `showPolling={false}`.
- Keep catalog descriptor, disk volume, and network interface runtime caches
  available for the child single-metric editor.

WidgetSettingsTab boundary:

- The Stacked child page should hide the outer WidgetSettingsTab advanced reset
  section and metric source diagnostic. Otherwise the user is not really inside
  a metric-editing page.
- The Stacked settings page should not show the outer metric source diagnostic.
  That diagnostic describes the currently displayed active slot attribution,
  not the Stacked container and not necessarily the slot being edited. Showing
  it at the Stacked level is misleading.
- Dense Multi Metric has the same attribution ownership issue: the outer debug
  diagnostic cannot unambiguously describe all rows. Hide the outer DEBUG
  diagnostic for both Stacked and Dense. Do not add per-row or per-slot DEBUG
  in this step; that would require a separate diagnostic owner under the
  multi-metric row/slot editor.
- Add a narrow, generic PI chrome suppression signal that lets
  `WidgetSettingsTab` know whether the panel is in any drill-in child page.
  Do not expose Stacked-specific state, `editingSlotId`, or Stacked-specific
  branching in `WidgetSettingsTab`; future Dense or other panels should be able
  to reuse the same concept.
- Do not move Stacked-specific page state into global settings or persisted
  widget settings. `editingSlotId` is local PI state only.
- `editingSlotId` must survive settings updates caused by auto-save. A field
  edit on the child page must not bounce the user back to the Stacked settings
  page.
- If the selected slot is removed while editing, return to the Stacked settings
  page.
- If slots are reordered while editing, keep editing the same `slot_id` and
  update the displayed metric number from the current slot order.

Tests:

- Opening Stacked settings initially shows Stacked controls and does not
  render a full single-metric editor.
- Clicking a slot's Edit button switches to the Metric #N settings page.
- Back returns to the Stacked settings page.
- Editing metric type and child single-metric fields still emits patches for
  the selected `slot_id`.
- Editing a child field triggers auto-save and the PI remains on the same
  Metric #N settings page after the resolved settings update.
- The child page hides per-slot polling, outer advanced reset, and metric source
  diagnostic.
- Removing the edited slot returns to the Stacked settings page.
- Reordering while editing preserves `editingSlotId` and updates the displayed
  metric number.

Verification:

```powershell
npm.cmd run test:pi
npm.cmd run test:unit
npm.cmd run build
```

## Acceptance Checklist

- `StackedMetricWidget` is a new stored widget oneof arm.
- Stacked slots use stable `slot_id` values.
- Stacked slots store v1 `SingleMetricWidget` items only.
- Quick-start creates CPU usage and Memory usage.
- Auto rotate defaults to enabled.
- Rotation interval defaults to 3 seconds and is configurable from 1 to 5
  seconds through a dropdown.
- Manual switching works when auto rotate is enabled and disabled.
- Manual switching resets the auto rotate deadline.
- Keypad `keyDown` switches to the next slot.
- Encoder `dialRotate` switches slots by tick direction.
- `dialDown`, `dialUp`, `touchTap`, double press, hold, and long touch are not
  Stacked v1 interactions.
- Source polling interval remains widget-level and is not duplicated per slot.
- Stacked and Dense PI explain that source polling is shared by every metric in
  the key.
- Stacked and Dense PI hide the outer metric source diagnostic because it is
  not row/slot scoped.
- Auto rotate interval is not blocked by polling interval.
- Active slot is tracked by `slot_id`.
- Reorder preserves active slot when the slot still exists.
- Removing the active slot falls back to the first slot.
- Every configured slot is subscribed before it becomes active.
- Duplicate/conflicting source policies are handled before read-plan
  normalization.
- Stacked reuses canonical single metric render builders.
- No Stacked-specific copy of CPU/GPU/Memory/Disk/Network/Catalog rendering
  exists.
- Transient indicator renders as a bottom-right horizontal dot stack.
- Indicator appears for 1 second after switches and does not show on initial
  render.
- Indicator does not change the active slot layout.
- Slot editor shows only one selected slot's full single-metric settings.
- Slot editor does not show per-slot polling.
- Follow-up PI drill-in shows Stacked settings and Metric #N settings as
  separate local PI pages without changing stored settings.
- Dense and Stacked PI show a max-reached note when Add is disabled at the
  widget's slot limit.
- Dense theme previews render Dense progress-list content instead of the
  single-metric default preview.
- Encoder `TriggerDescription.Rotate` is localized.
- Key Logic / Multi Action context detection is not used as a behavior gate.
- Renderer contracts receive app-owned data, not stored settings proto.
- PI does not import generated proto types directly.
- `MetricStore` remains unaware of Stacked semantics.
