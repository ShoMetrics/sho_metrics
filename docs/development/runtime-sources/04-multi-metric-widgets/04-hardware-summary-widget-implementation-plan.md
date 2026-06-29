# Hardware Summary Widget Implementation Plan

This plan is written for a new coding session with no conversation context.

Read these first:

1. [Runtime Sources Overview](../README.md)
2. [Phase 5c Demand-Driven Background Collection](../01-runtime-collection/03-demand-driven-background-collection.md)
3. [Metric-Level Source Routing](../02-source-routing/02-metric-level-source-routing.md)
4. [Dense Multi Metric Widget Plan](01-dense-multi-metric-widget-plan.md)
5. [Stacked Metric Widget Plan](02-stacked-metric-widget-plan.md)
6. `.agents/skills/technical-architecture/references/TECHNICAL_ARCHITECTURE.md`
7. `.agents/skills/architecture-boundaries/SKILL.md`
8. `.agents/skills/proto/SKILL.md`

All `npm.cmd` and `npx.cmd streamdeck ...` commands in this plan run from
`packages/hub` unless a step explicitly says otherwise.

This document is the implementation source of truth. If code behavior and this
document disagree, stop and resolve the drift before coding further.

## Objective

Add a curated 3-reading hardware summary widget for CPU and GPU.

Users should continue to drag the existing CPU or GPU Stream Deck action. This
feature must not add another user-visible Stream Deck action or action icon.
The CPU/GPU Property Inspector exposes a new **Summary** view choice. Internally
the stored widget kind changes from `SingleMetricWidget` to a new
`HardwareSummaryWidget`.

## Product Decisions

- Supported domains in v1: CPU and GPU only.
- The feature is curated, not a free-form multi-metric builder.
- The widget always shows exactly 3 readings.
- CPU available readings: usage/load, temperature, power.
- CPU default ordered readings: load, temperature, power.
- GPU available readings: usage/load, temperature, power, VRAM.
- GPU default ordered readings: load, temperature, VRAM.
- The first ordered reading is the primary reading.
- The primary reading renders in a top/left semicircle gauge.
- The other two readings render as secondary text rows.
- Main metric default: load.
- Users may choose the primary reading.
- Users may choose both secondary readings.
- If the user chooses a reading already present in another summary position,
  the PI swaps positions instead of duplicating readings.
- Duplicate readings are invalid. The resolver and PI must keep the ordered
  reading set unique.
- Progress/max policy follows the existing single-metric rules:
  - usage/load uses percent;
  - VRAM uses used/total;
  - temperature uses the configured/default maximum temperature;
  - power uses the configured/default maximum power.
- GPU power is not a default primary reading because cross-vendor power limits
  are not stable. Users may still select it and use the existing max-power UI.
- Secondary readings are text-only. Do not draw secondary progress bars.
- Icons use existing Lucide icons and are not custom-colored in v1.
- Supported surfaces in v1: square keypad and touch strip.
- Square logical size: 144 x 144.
- Touch strip logical size: 200 x 100.
- Square layout:
  - hardware label row;
  - top semicircle gauge with primary value inside;
  - divider;
  - two secondary text rows below.
- Touch strip layout:
  - left semicircle gauge with primary value inside;
  - right column with two secondary text rows;
  - horizontal divider between secondary rows.
- Render through the existing theme/frame system. The view must work with all
  current themes, including Flat, Cupertino Glass, Color Filled, Terminal, Pixel
  Window, and transparent surface. Do not create a default-theme-only renderer.

## Non-Goals

- Do not add a new manifest action.
- Do not add a Dense mode or reuse Dense row storage.
- Do not implement 2-reading, 4-reading, or arbitrary count variants.
- Do not add per-reading colors.
- Do not add per-reading polling, source, label, or unit overrides.
- Do not add a custom max policy beyond the existing single CPU/GPU temperature
  and power settings.
- Do not add a new graph type for secondary readings.
- Do not persist runtime-discovered GPU power limits or VRAM totals in settings.

## Boundary Names

| Surface | Name |
| --- | --- |
| User-visible action | existing `CPU Metric` / `GPU Metric` |
| Stored proto message | `HardwareSummaryWidget` |
| Resolved widget kind | `"hardwareSummary"` |
| Summary target domains | CPU, GPU |
| Renderer branch | `hardwareSummary` |
| Action owner | existing `Cpu` and `Gpu` actions |
| Shared summary module | `packages/hub/src/actions/hardware-summary/` |

## Current Code Facts

Base the implementation on these existing files and contracts:

- `contracts/proto/shometrics/v1/settings.proto`
  - `StoredWidgetSettings.widget` already supports multiple internal widget
    shapes: single, dense, and stacked.
  - `SingleMetricWidget` must remain the one-reading widget shape.
  - `DenseMultiMetricWidget` must remain the generic multi-row widget shape.
  - `WidgetPreferences` is stored outside the widget oneof and remains shared.
- `packages/hub/src/settings/resolved-settings.ts`
  - `ResolvedWidget` is already a union and must add `ResolvedHardwareSummaryWidget`.
- `packages/hub/src/settings/storage/quick-start-widget-settings.ts`
  - CPU/GPU quick starts should continue to create single-metric widgets by
    default. Summary is selected through the PI.
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
  - Existing patch paths are explicit by widget kind. Summary needs explicit
    patch helpers; do not mutate summary through the single-metric branch.
- `packages/hub/src/actions/cpu.ts`
  - CPU action currently assumes `ResolvedSingleMetricWidget`.
  - CPU summary must branch by resolved widget kind.
- `packages/hub/src/actions/gpu.ts`
  - GPU action currently assumes `ResolvedSingleMetricWidget`.
  - GPU power already subscribes to `gpu.power` and `gpu.power_limit`.
  - GPU VRAM already subscribes to `gpu.vram_used` and `gpu.vram_total`.
- `packages/hub/src/metrics/power-widget-data.ts`
  - Power display/max behavior is already shared and should be reused.
- `packages/hub/src/metrics/gpu-power-widget-data.ts`
  - GPU power maximum already prefers custom max, then runtime telemetry, then
    fallback. Summary must not invent a second rule.
- `packages/hub/src/metrics/temperature-widget-data.ts`
  - Temperature display/unit/max behavior is already shared and should be reused.
- `packages/hub/src/actions/shared/helper-backed-widget-data.ts`
  - Helper-backed availability and install notice behavior already exists.
- `packages/hub/src/view-rendering/metric-view-frame.ts`
  - Render options already branch by metric render kind. Summary needs a new
    branch instead of pretending to be single, dual, dense, or stacked.
- `packages/hub/src/widgets/styles/*`
  - Theme styles own frame/background paints. Summary body rendering must use
    the existing visual tokens.
- `packages/hub/src/property-inspector/panels/*`
  - CPU/GPU PI panels already own domain-specific metric settings. Summary
    settings belong there, not in Dense PI panels.

## Step Count

There are 7 implementation steps. Do not merge steps unless this document is
updated first. The steps split stable ownership boundaries: stored contract,
resolved settings, PI behavior, runtime data/read plan, action wiring,
rendering, and verification.

## Step 1: Add Stored Contract And Generated Types

Estimated LOC: 180-260.

Files:

- `contracts/proto/shometrics/v1/settings.proto`
- generated settings files produced by existing proto scripts

Required stored shape:

```proto
oneof widget {
  SingleMetricWidget single_metric = 1;
  DenseMultiMetricWidget dense_multi_metric = 2;
  StackedMetricWidget stacked_metric = 3;
  HardwareSummaryWidget hardware_summary = 4;
}
```

Add:

- `message HardwareSummaryWidget`
- `message CpuHardwareSummaryTarget`
- `message GpuHardwareSummaryTarget`
- `message CpuHardwareSummaryReading`
- `message GpuHardwareSummaryReading`

Required semantics:

- `HardwareSummaryWidget` has a target oneof for CPU and GPU.
- `HardwareSummaryWidget` stores `MetricSourcePolicy source_policy`.
- `HardwareSummaryWidget` stores `AppearanceSettings appearance`.
- CPU target stores exactly 3 `CpuHardwareSummaryReading` messages in
  `ordered_readings`.
- GPU target stores exactly 3 `GpuHardwareSummaryReading` messages in
  `ordered_readings`.
- `ordered_readings` order is display order. Index 0 is the primary gauge;
  index 1 is the first secondary row; index 2 is the second secondary row.
- `CpuHardwareSummaryReading` is only an ordering wrapper. Its oneof arms reuse
  `CpuMetricTarget.Usage`, `CpuMetricTarget.Temperature`, and
  `CpuMetricTarget.Power`.
- `GpuHardwareSummaryReading` is only an ordering wrapper. Its oneof arms reuse
  `GpuMetricTarget.Usage`, `GpuMetricTarget.Temperature`,
  `GpuMetricTarget.Power`, and `GpuMetricTarget.Vram`.
- GPU target stores one `optional string gpu_id`; individual summary readings
  must not store separate GPU identities.
- Temperature and power display settings live inside the reused
  `CpuMetricTarget.*` and `GpuMetricTarget.*` reading payloads. Do not duplicate
  those fields on the summary target.
- Reading lists use validation `min_items: 3` and `max_items: 3`.
- The proto validation does not enforce unique reading kinds or non-empty
  reading oneofs. Resolver and PI own those repairs.

Do not:

- Do not add another user-visible action kind in proto.
- Do not add summary-specific reading enums. Reuse existing single CPU/GPU
  reading payloads so max/unit settings have one schema owner.
- Do not let CPU store VRAM.
- Do not store resolved defaults.
- Do not store runtime GPU power limits or VRAM totals.

Validation:

- Run `npm.cmd run proto:format`.
- Run `npm.cmd run proto:lint`.
- Run `npm.cmd run proto:build`.

Do not merge this with Step 2. Step 1 defines the sparse persisted contract.
Step 2 defines app-owned resolved defaults and repairs invalid sparse intent.

## Step 2: Resolve Hardware Summary Settings

Estimated LOC: 300-450.

Files:

- `packages/hub/src/settings/resolved-settings.ts`
- `packages/hub/src/settings/storage/resolver/metric-target-resolver.ts`
- settings resolver tests

Add app-owned resolved shapes:

- `ResolvedHardwareSummaryWidget`
- `ResolvedCpuHardwareSummaryTarget`
- `ResolvedGpuHardwareSummaryTarget`
- `ResolvedHardwareSummaryReading`
- `requireResolvedHardwareSummaryWidget(...)`

Resolved semantics:

- `ResolvedWidget` includes `ResolvedHardwareSummaryWidget`.
- `ResolvedHardwareSummaryWidget.widgetKind` is `"hardwareSummary"`.
- CPU default ordered readings are `usage`, `temperature`, `power`.
- GPU default ordered readings are `usage`, `temperature`, `vram`.
- The resolver normalizes missing, duplicated, or invalid stored reading lists
  into a unique length-3 ordered list.
- The resolver reads the summary `source_policy` with the same defaults and
  fallback semantics as single CPU/GPU metric selections.
- If the primary reading duplicates a secondary reading after patching, keep
  the user's newest position intent where patch context is available. Otherwise
  use the first valid occurrence and fill missing slots with defaults.
- Temperature defaults must match existing single CPU/GPU temperature defaults.
- Power defaults must match existing single CPU/GPU power defaults.
- GPU ID resolution must match existing single GPU behavior.
- Summary appearance resolves through the same appearance resolver used by
  single/dense widgets.

Tests:

- absent CPU readings resolve to `usage, temperature, power`;
- absent GPU readings resolve to `usage, temperature, vram`;
- duplicated stored readings resolve to a unique list;
- CPU cannot resolve VRAM;
- GPU power max and temperature max defaults match single GPU defaults;
- summary source policy resolves like a single CPU/GPU source policy;
- summary appearance resolves through existing theme/default cascade.

Do not:

- Do not import generated proto into actions/renderers.
- Do not persist resolved defaults back into settings.
- Do not make the resolver depend on live metric samples.

Do not merge this with Step 3. Step 2 owns runtime settings truth. Step 3 owns
Property Inspector controls and patch behavior.

## Step 3: Add Property Inspector Summary Mode

Estimated LOC: 450-700.

Files:

- `packages/hub/src/property-inspector/panels/CpuWidgetSettings.tsx`
- `packages/hub/src/property-inspector/panels/GpuWidgetSettings.tsx`
- shared PI controls only if an existing pattern clearly supports reuse
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
- PI tests
- i18n message groups

Required UX:

- CPU/GPU view dropdown adds `Summary`.
- Selecting `Summary` writes `StoredWidgetSettings.hardware_summary`.
- Selecting a non-summary view writes the appropriate `single_metric` shape.
- The action remains the existing CPU/GPU action.
- In Summary mode, the Metric section shows:
  - Primary reading dropdown;
  - Secondary reading 1 dropdown;
  - Secondary reading 2 dropdown;
  - existing temperature max/unit controls when temperature is selected in any
    summary position;
  - existing power max controls when power is selected in any summary position.
- CPU dropdown choices: Load, Temperature, Power.
- GPU dropdown choices: Load, Temperature, Power, VRAM.
- If the user picks a reading already selected in another position, swap the
  readings. Do not create duplicates or show validation errors for this normal
  interaction.
- GPU default summary is Load + Temperature + VRAM.
- CPU default summary is Load + Temperature + Power.

Patch rules:

- Add explicit summary patch operations. Do not route summary patching through
  single-metric patch helpers.
- Mode switching must preserve existing appearance settings when reasonable.
- Mode switching must not carry impossible settings, such as CPU VRAM.
- Mode switching from single GPU power to summary may use power as the primary
  reading only if the user explicitly selects it after entering summary mode.
  Default summary remains Load + Temperature + VRAM.

Tests:

- CPU view dropdown can switch single usage -> summary;
- GPU view dropdown can switch single usage -> summary;
- selecting an already-selected reading swaps positions;
- CPU summary never writes VRAM;
- GPU secondary dropdown can choose Power instead of VRAM;
- temperature and power max controls appear only when the reading is selected.

Do not:

- Do not add a new Stream Deck action tile.
- Do not add dense-row controls.
- Do not add arbitrary count controls.
- Do not store UI-only option labels in settings.

Do not merge this with Step 4. Step 3 is user intent editing. Step 4 is runtime
metric subscription and formatting.

## Step 4: Build Summary Read Plan And Widget Data

Estimated LOC: 350-550.

Files:

- `packages/hub/src/actions/hardware-summary/read-plan.ts`
- `packages/hub/src/actions/hardware-summary/widget-data.ts`
- tests beside the new modules

Required read-plan behavior:

- CPU summary subscribes only to metric keys needed by the ordered readings.
- GPU summary subscribes only to metric keys needed by the ordered readings.
- Usage reads:
  - CPU: `cpu.usage_percent`
  - GPU: `gpu.usage_percent`
- Temperature reads:
  - CPU: `cpu.temp`
  - GPU: `gpu.temp`
- Power reads:
  - CPU: `cpu.power`
  - GPU: `gpu.power` and `gpu.power_limit`
- VRAM reads:
  - GPU: `gpu.vram_used` and `gpu.vram_total`
- If a key is required by multiple readings, subscribe once.
- Use the widget's source policy and fallback behavior. Do not create per-reading
  source policies.

Required widget-data behavior:

- Produce one primary reading and two secondary readings.
- Each reading carries:
  - stable reading kind;
  - label text;
  - display value;
  - unit text;
  - normalized progress only for the primary gauge;
  - no-data/unavailable state.
- Primary progress uses existing single metric rules:
  - usage percent;
  - VRAM used / total;
  - temperature max;
  - power max.
- Secondary readings are text-only; their progress must not be exposed to the
  renderer.
- Read helper-backed values through existing helper-backed widget-data helpers
  so helper install/unavailable behavior matches single CPU/GPU.
- Reuse existing temperature, power, GPU VRAM, CPU usage, and GPU usage
  formatting helpers where they already exist.

Tests:

- CPU default summary read plan contains usage/temp/power keys.
- GPU default summary read plan contains usage/temp/vram keys.
- GPU power selected as secondary adds `gpu.power` and `gpu.power_limit`.
- duplicate keys are deduplicated.
- primary VRAM progress uses used/total.
- primary power progress follows existing GPU power maximum resolution.
- missing secondary reading degrades only that secondary reading.

Do not:

- Do not make the renderer query `MetricStore`.
- Do not thread generated proto into widget data.
- Do not duplicate single metric max/formatting rules manually when existing
  helpers own them.

Do not merge this with Step 5. Step 4 creates pure summary data and read plans.
Step 5 wires those data contracts into CPU/GPU action lifecycle.

## Step 5: Wire Existing CPU/GPU Actions To Summary

Estimated LOC: 200-320.

Files:

- `packages/hub/src/actions/cpu.ts`
- `packages/hub/src/actions/gpu.ts`
- CPU/GPU action tests

Required behavior:

- CPU and GPU actions continue to own the user-visible Stream Deck entry.
- No new action class is registered in `plugin.ts`.
- No new manifest action is added.
- CPU/GPU actions branch by resolved widget kind:
  - `singleMetric`: existing behavior;
  - `hardwareSummary`: build summary read plan and summary view options.
- `getMetricKeys(event)` returns all summary metric keys.
- `buildMetricCollectionReadPlan(event)` returns the summary read plan for
  summary widgets.
- `getDisplayedMetricKey(event)` returns the primary reading metric key for
  no-data observation.
- Manual refresh works through the existing `MetricAction` behavior and refreshes
  all summary metric keys.
- Runtime cache refreshes that are specific to single GPU/CPU behavior must not
  run for unrelated summary-only state.

Tests:

- CPU summary action subscribes to three readings.
- GPU summary action subscribes to default usage/temp/vram readings.
- GPU summary with power selected subscribes to `gpu.power_limit`.
- manual refresh for a summary action requests subscriber refresh once.
- single CPU/GPU behavior is unchanged.

Do not:

- Do not add a new Stream Deck action.
- Do not make `MetricAction` understand summary-specific readings.
- Do not let CPU/GPU files become the renderer implementation. Keep summary
  construction in `actions/hardware-summary/`.

Do not merge this with Step 6. Step 5 is action lifecycle and runtime wiring.
Step 6 is pure rendering.

## Step 6: Render The Hardware Summary View

Estimated LOC: 500-800.

Files:

- `packages/hub/src/view-rendering/metric-view-frame.ts`
- `packages/hub/src/view-rendering/hardware-summary-view.ts`
- `packages/hub/src/widgets/primitives/semi-circle-gauge-panel.ts`
- `packages/hub/src/view-rendering/metric-view-frame.test.ts`
- visual tests under `packages/hub/tests/visual`

Required render contract:

- Add a new render kind, `hardwareSummary`.
- The renderer receives app-owned summary view data, not stored settings.
- The renderer draws:
  - square 144 x 144 layout;
  - touch strip 200 x 100 layout.
- Square:
  - hardware label row;
  - semicircle gauge across the top;
  - primary value inside the semicircle;
  - primary label under the value;
  - horizontal divider;
  - two secondary rows below.
- Touch:
  - semicircle gauge on the left;
  - primary value inside the semicircle;
  - two secondary rows on the right;
  - divider between secondary rows.
- Gauge:
  - pure semicircle, not the existing circle gauge;
  - uses primary `progress`;
  - clamps invalid progress into the existing no-data/empty visual behavior;
  - no tick marks in v1.
- Icons:
  - use Lucide icons from the existing icon pipeline;
  - no custom icon colors in v1;
  - icons should inherit readable foreground or dim foreground from theme
    tokens.
- Text:
  - values must not overlap labels or units at 144 x 144 and 200 x 100;
  - use fixed regions and fitting helpers where needed;
  - support at least `100%`, `100 C`, `999 W`, and `99.9 G` without clipping.
- Theme:
  - use existing visual/theme tokens;
  - do not hardcode a default-only background;
  - render acceptably in Flat, Cupertino Glass, Color Filled, Terminal, Pixel
    Window, and transparent surface.

Tests:

- frame composer includes hardware summary body;
- square render contains gauge, primary value, and two secondary readings;
- touch render contains gauge, primary value, and two secondary readings;
- stacked/refresh overlays still render above summary view;
- no text clipping in edge value cases via visual snapshots.

Visual validation:

- Add visual cases for:
  - CPU summary default on square and touch;
  - GPU summary default on square and touch;
  - GPU summary with power as secondary;
  - GPU summary with VRAM primary;
  - Pixel Window square and touch;
  - Terminal square and touch.
- Use `npm.cmd run test:visual:update` only when intentionally accepting the
  new visual baselines.

Do not:

- Do not route this through Dense progress list.
- Do not route this through single circle/bar/text views.
- Do not add per-theme one-off layouts unless a theme-specific bug proves it is
  necessary.

Do not merge this with Step 7. Step 6 adds rendering. Step 7 proves the whole
feature and catches cross-boundary drift.

## Step 7: End-To-End Tests And Validation

Estimated LOC: 300-500.

Required commands:

```powershell
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run lint
npm.cmd run test:unit -- hardware-summary
npm.cmd run test:unit -- cpu.test.ts gpu.test.ts
npm.cmd run test:unit -- metric-view-frame.test.ts
```

Run visual tests only after Step 6 is implemented and baselines are intentionally
accepted:

```powershell
npm.cmd run test:visual:update
npm.cmd run test:visual
```

Manual validation:

- Drag existing CPU action to a square key.
- Switch CPU view to Summary.
- Verify default readings are Load, Temp, Power.
- Change primary to Temp and confirm readings swap, not duplicate.
- Press the key and confirm manual refresh badge appears.
- Drag existing GPU action to a square key.
- Switch GPU view to Summary.
- Verify default readings are Load, Temp, VRAM.
- Change secondary VRAM to Power and confirm `gpu.power_limit` is subscribed.
- On touch strip, verify Summary uses the touch layout, not the square layout.
- Verify no new Stream Deck action appears in the manifest.

Regression validation:

- Existing CPU/GPU single views still render.
- Dense still renders dense rows.
- Stacked still switches slots and refreshes on press.
- Manual refresh still refreshes all keys in a summary widget.
- Helper unavailable/install notice behavior remains consistent with single
  CPU/GPU readings.

Do not merge this with previous steps. Step 7 is the feature acceptance gate.
It is where cross-boundary assumptions are checked together.

## Drift Alarms

Stop and update this plan before proceeding if any implementation does these:

- adds a new user-visible Stream Deck action;
- stores summary as Dense rows;
- stores summary as a `MetricView` inside `SingleMetricWidget`;
- lets CPU store VRAM;
- allows duplicate readings in one summary widget;
- makes GPU power the default primary reading;
- draws secondary progress bars;
- stores runtime power limits or VRAM totals in settings;
- imports generated settings proto into renderer/action view builders;
- hardcodes a default-theme-only summary background;
- makes Summary require a specific source adapter when the existing single
  CPU/GPU reading can already degrade through helper-backed widget data.
