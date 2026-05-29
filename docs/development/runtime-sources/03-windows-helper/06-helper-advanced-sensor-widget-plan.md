# Windows Helper Advanced Sensor Widget Plan

This plan is written for a new coding session with no conversation context.

## Implementation Status

Status: **implemented through v1 and manually smoke-tested**.

Completed v1 scope:

- `Advanced Sensor` Stream Deck action is registered.
- Empty initial selection renders a placeholder and does not register
  collection.
- Advanced Sensor quick-start stores helper-only source policy.
- PI loads Windows helper descriptors into runtime cache with explicit
  `pending` / `ready` / `failed` state.
- PI guided picker uses `Type -> Hardware -> Reading -> Metric`.
- Selected catalog metric stores descriptor-derived fallback label/unit hints.
- Selected catalog metric renders through the existing single-metric view path.
- Selected catalog metric uses Windows helper demand-driven collection and has
  no Node/systeminformation fallback.

Manual smoke result:

- A profile with built-in CPU, RAM, and Disk widgets plus Advanced Sensor widgets
  for Intel GPU and Other/Voltage refreshed only the demanded helper polling
  groups observed in helper logs.
- Removing an Advanced Sensor RAM widget removed its RAM demand.
- Built-in Quick Start widgets continue to create their own helper demand where
  applicable; they are not Advanced Sensor widgets.

Deferred by design:

- User-editable labels are **not implemented in v1**. The current
  `fallbackLabel` and `fallbackUnit` values are source-derived offline/rendering
  hints, not user overrides.

Read these first:

1. [Phase 5c Demand-Driven Background Collection](../01-runtime-collection/03-demand-driven-background-collection.md)
2. [Helper Source Reliability Implementation Plan](02-helper-source-reliability-implementation-plan.md)
3. [Windows Helper gRPC IPC And Self-Contained Packaging Plan](04-helper-ipc-packaging-plan.md)
4. [Windows Helper Demand-Driven Refresh Plan](05-helper-demand-driven-refresh-plan.md)

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

Add a new Stream Deck action named **Advanced Sensor**.

The first version lets a user pick one scalar metric from the Windows helper
descriptor catalog through a guided picker:

```text
Type -> Hardware -> Reading -> Metric
```

The selected metric is then rendered by the existing single-metric view system
and collected through the existing demand-driven Windows helper path.

This is not a new telemetry pipeline. It should reuse:

- helper descriptors from `MetricSourceService.ListMetricDescriptors`;
- `WindowsHelperSourceClient` descriptor cache and polling-group resolution;
- `CollectorGroupPlanner` and `CollectorGroupSupervisor`;
- `MetricStore`;
- `MetricAction`;
- existing single-metric view rendering.

## Product Decisions

Hard decisions for v1:

- Manifest action display name: `Advanced Sensor`.
- Stream Deck action UUID: `com.ez.sho-metrics.catalog-metric`.
- Internal action kind: existing `"catalog"` so action dispatch still matches
  the resolved target domain.
- Internal stored target: existing `CatalogMetricTarget`.
- Internal resolved target domain: existing `"catalog"`.
- One widget shows one metric only.
- Initial drag/drop state has no metric selected.
- No collection, helper refresh demand, or source fallback happens while no
  metric is selected.
- Opening the Property Inspector must not auto-persist a metric selection.
- Once the user starts selecting a path, the UI auto-completes the first valid
  downstream path to a metric.
- If a picker level has only one valid option, do not render a pointless select;
  treat it as selected.
- If a picker level has multiple options, select the first valid option during
  auto-complete and let the user change it.
- Do not add HTTP endpoint UI in this batch.
- Do not add a Node/systeminformation fallback for catalog metrics.
- Reserve `CatalogMetricTarget` for machine telemetry discovered from local or
  remote metric sources. Built-in weather/time widgets and user-authored HTTP
  endpoint metrics must use separate targets when they are added.
- Do not add curated "recommended" metrics here. Built-in CPU/GPU/Disk/Network
  actions own curated product metrics.
- Do not split `Other` into `Advanced`, `Raw`, or multiple expert buckets.
- Include Network descriptors, but sort noisy virtual/filter adapters after
  human-relevant adapters.
- Use the existing `SelectSetting` control in v1. Do not add a third-party
  searchable combobox in this batch.
- User-editable labels are a later step. This version should still store
  source-derived fallback label/unit hints when a metric is selected.

## Descriptor POC Findings

The POC was run against the local dev helper through the named pipe while the
helper was already running with:

```powershell
dotnet watch --no-hot-reload --project .\packages\source-windows\ShoMetrics.Source.Windows.Service\ShoMetrics.Source.Windows.Service.csproj run -- --dev-pipe
```

Observed catalog size:

```text
total descriptors: 468
polling groups: 48

CPU:            134
GPU:             61
Memory:          50
Disk:             2
Network:        192
Other Hardware:  29
```

Observed descriptor id kinds:

```text
source-sensor: 454
stable-alias:   14
```

Observed units:

```text
percent:        111
bytes:           94
bytes/s:         82
celsius:         67
volts:           41
hertz:           28
seconds:         28
rpm:              9
watts:            8
```

Observed source sensor types:

```text
Load:        102
Data:         84
Throughput:   82
Temperature:  67
Voltage:      41
Clock:        28
Timing:       28
SmallData:    10
Control:       9
Fan:           9
Power:         8
```

Implications:

- A flat metric dropdown is not acceptable.
- `Type -> Hardware -> Reading -> Metric` is the right first picker shape.
- CPU and Network can each exceed 100 descriptors on real hardware.
- Network names include noisy Windows virtual/filter adapters.
- Descriptor display strings can contain control characters or malformed text;
  PI labels must sanitize and truncate descriptor-originated strings.

## Non-Goals

- Do not change Windows helper C# descriptor generation for this batch.
- Do not change `source_api.proto` for picker display metadata in v1.
- Do not add per-sensor helper refresh logic beyond the existing polling-group
  demand path.
- Do not add a source picker.
- Do not expose `Windows Helper`, `Node System`, source profile ids, or helper
  transport details in the Advanced Sensor UI.
- Do not parse `hardware_id` or `source_sensor_id`.
- Do not let generic runtime source routing parse LHM ids, hardware ids, or
  sensor ids.
- Do not implement user-editable label overrides in this batch.
- Do not add user-defined HTTP metrics in this batch.
- Do not introduce a new catalog scheduler, transformer layer, or registry.

## Key Alternatives

| Choice | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Use internal action kind `"catalogMetric"`. | Matches the action UUID more closely. | Requires a special action-kind-to-target-domain mapping because the stored/resolved target already uses `"catalog"`. | Reject. |
| Use internal action kind `"catalog"` and product name `Advanced Sensor`. | Matches existing `CatalogMetricTarget` and keeps `WidgetSettingsTab` dispatch simple. | The manifest display name differs from the internal target/domain name. | Choose. |
| Add a new stored `AdvancedSensorTarget`. | Product display name is explicit in proto. | Duplicates existing `CatalogMetricTarget`, creates another model for the same target shape, and leaks mutable product copy into persisted data. | Reject. |
| Reuse existing `CatalogMetricTarget`. | Matches current settings contract and existing catalog preview branch. It can cover Windows/macOS/Linux helpers and remote machine agents. | Requires implementers to remember that manifest name `Advanced Sensor` maps to internal `catalog`. | Choose. |
| Use `CatalogMetricTarget` for built-in weather/time or user-authored HTTP endpoints. | One generic target for all future non-built-in metrics. | Turns catalog into a junk drawer; those products need different settings such as location, timezone, URL, auth, and parsing. | Reject. |
| Flat searchable metric dropdown. | Simple UI code. | 468 descriptors in POC, CPU 134, Network 192; overwhelming and hard to navigate. | Reject. |
| Third-party searchable combobox. | Better search for long lists. | New dependency and styling/accessibility surface before the cascade is proven insufficient. | Reject for v1. |
| Existing `SelectSetting` cascade. | No new dependency; invalid combinations are impossible because options come from descriptors. | Less powerful search. | Choose. |
| Curated recommended list inside Advanced Sensor. | Shorter common paths. | Duplicates built-in widget responsibility and blurs the picker with curated product widgets. | Reject. |
| Store helper-only source policy in settings. | Source routing stays explicit and existing collection code works unchanged. | Stored source policy is required even before a metric is selected. | Choose. |
| Override source routing only inside `CatalogMetric` action. | Fewer stored settings fields. | Hides source ownership outside the normal settings/source-routing path. | Reject. |
| Add helper-owned display tree to `source_api.proto`. | Helper could provide perfect grouping and labels. | More contract work before v1 proves the current descriptor fields are insufficient. | Reject for v1. |
| Persist picker path fields such as type/hardware/reading. | Restores the exact cascade state. | Duplicates descriptor-derived UI state and can drift after hardware changes. | Reject. |
| Keep stable aliases when a matching raw source-sensor descriptor exists. | Preserves helper-ranked alias failover such as CPU temperature/package power inside Advanced Sensor. | Repeats curated built-in widget metrics in the raw picker and hides the more specific raw sensors users came to Advanced Sensor to choose. | Reject. Built-in CPU/GPU widgets own curated aliases and their failover behavior; Advanced Sensor owns fine-grained source descriptors, accepting that selected raw sensors may be less stable. |
| Hide noisy virtual/filter/software hardware from Advanced Sensor. | Shorter lists. | Can hide real user-needed readings and makes support/debug harder. | Reject for v1. Demote and label clearly instead of hiding. |
| Implement picker building as one long function. | Fast to write initially. | Turns filtering, classification, sorting, sanitization, and disambiguation into an unreviewable hot spot. | Reject. Keep small pure functions for classify/filter/noisy scoring/disambiguation and test them directly. |

## Existing Files And Owners

### Generated And Source API

| File | Current role | Advanced Sensor change |
| --- | --- | --- |
| `contracts/proto/shometrics/v1/source_api.proto` | Defines `MetricDescriptor`, `RawSensorIdentity`, polling group ids, and `ListMetricDescriptors`; imports `MetricUnit` from `snapshot.proto`. | No proto change in v1. |
| `packages/hub/src/generated/shometrics/v1/source_api_pb.ts` | Generated source API types. | No generation expected in v1 because source API does not change. |
| `packages/hub/src/runtime/sources/source-client.ts` | App-owned runtime source contract. Defines `MetricDescriptor`, `MetricDescriptorSnapshot`, and `SourceClient.listMetricDescriptors`. | Reuse `MetricDescriptor` in runtime cache and PI option builder. |
| `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-client.ts` | Owns helper gRPC calls, descriptor preload/cache, and `resolveMetricPollingGroups`. | Reuse `listMetricDescriptors([])` through the runtime root. Do not duplicate descriptor caches in PI. |
| `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-api-mapper.ts` | Converts generated descriptor messages to runtime descriptors and drops malformed wire records. | Keep as the only generated source API conversion boundary. |

### Runtime Collection

| File | Current role | Advanced Sensor change |
| --- | --- | --- |
| `packages/hub/src/runtime/sources/source-ids.ts` | Defines built-in source ids and source profile ids. | Use `BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID` for catalog settings. |
| `packages/hub/src/runtime/source-routing/metric-read-plan-builder.ts` | Converts resolved source policy into source candidates. | No special catalog branch if settings store helper-only source policy. |
| `packages/hub/src/runtime/source-routing/metric-source-preferences.ts` | Built-in local:auto exception table for first-class metrics. | Do not add catalog metric ids here. Catalog ids must be explicit helper-only. |
| `packages/hub/src/runtime/metric-collection/collector-group-planner.ts` | Groups metric subscriptions by source-owned polling group. | Existing logic should plan selected catalog metrics once `WindowsHelperSourceClient` has descriptors. |
| `packages/hub/src/runtime/metric-collection/collector-group-supervisor.ts` | Starts/stops runners and sends helper refresh demand. | Existing demand logic should send the selected catalog polling group. |
| `packages/hub/src/runtime/metric-store.ts` | Stores source-scoped scalar history/text values and builds `WidgetData`. | Existing read path is enough for scalar catalog metrics. |
| `packages/hub/src/runtime/widget-runtime-cache.ts` | Per-action runtime facts sent to Property Inspector. | Add catalog descriptor list and catalog descriptor load state for the current action session. In v1 this state is populated only from the Windows helper. |

### Settings

| File | Current role | Advanced Sensor change |
| --- | --- | --- |
| `contracts/proto/shometrics/v1/settings.proto` | Stored settings contract. Already has `CatalogMetricTarget`. | Reuse existing message. No proto change in v1. |
| `packages/hub/src/settings/resolved-settings.ts` | App-owned resolved settings. Already has `ResolvedCatalogMetricTarget`. | Keep `domain: "catalog"`. |
| `packages/hub/src/settings/storage/resolver.ts` | Converts stored settings to resolved settings. Already resolves catalog targets. | Ensure empty catalog target resolves to `metricId: ""`. |
| `packages/hub/src/settings/storage/widget-settings-patch.ts` | Applies PI sparse patches to stored settings. | Add `catalog` patch for `metricId`, `fallbackLabel`, and `fallbackUnit`. |
| `packages/hub/src/settings/storage/quick-start-widget-settings.ts` | Writes first settings for each Stream Deck action kind. | Extend quick-start output from target-only to target plus optional source policy, then add Advanced Sensor quick-start target with empty `CatalogMetricTarget` and helper-only source policy. |

### Actions And Rendering

| File | Current role | Advanced Sensor change |
| --- | --- | --- |
| `packages/hub/src/shared/stream-deck-actions.ts` | Maps Stream Deck UUIDs to internal action kinds. | Add internal action kind `"catalog"` and UUID `com.ez.sho-metrics.catalog-metric`. |
| `packages/hub/src/plugin.ts` | Registers action classes. | Register `new CatalogMetric()`. |
| `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json` | Stream Deck manifest action list. | Add action entry with `Name: "Advanced Sensor"`. |
| `packages/hub/src/actions/metric-action.ts` | Base class for actions, settings, subscriptions, runtime cache, and PI cache messages. | Support zero metric keys by disposing collection instead of throwing. |
| `packages/hub/src/actions/shared/resolved-metric-target.ts` | Helper for action-owned target assertions. Currently excludes `"catalog"`. | Either allow `"catalog"` or add a catalog-specific target reader. Prefer allowing it. |
| `packages/hub/src/actions/catalog-metric.ts` | New action entry file. | Owns catalog metric subscription keys, placeholder render, descriptor catalog publication, and selected metric view options. |
| `packages/hub/src/actions/shared/helper-backed-widget-data.ts` | Helper no-data behavior for helper-backed first-class metrics. | Reuse for selected catalog metric. |
| `packages/hub/src/view-updates/runner.ts` | Applies single metric view updates. | No change expected. |
| `packages/hub/src/property-inspector/previews/metric-option-preview.ts` | Already knows how to preview `target.domain === "catalog"`. | Reuse current catalog preview branch. |

### Property Inspector

| File | Current role | Advanced Sensor change |
| --- | --- | --- |
| `packages/hub/src/property-inspector/panels/WidgetSettingsTab.tsx` | Chooses metric settings panel by target domain. | Add `"catalog"` branch that renders `CatalogMetricWidgetSettings`. |
| `packages/hub/src/property-inspector/panels/CatalogMetricWidgetSettings.tsx` | New panel. | Renders guided picker, appearance, line, color, polling, and helper status. |
| `packages/hub/src/property-inspector/select-options/catalog-metric-options.ts` | New pure PI option builder. | Builds the `Type -> Hardware -> Reading -> Metric` option tree from runtime descriptors. |
| `packages/hub/src/property-inspector/select-options/runtime-select-options.ts` | Existing runtime option helpers for disk/network. | Leave catalog tree logic out of this file; use `catalog-metric-options.ts`. |
| `packages/hub/src/property-inspector/controls/SelectSetting.tsx` | Existing custom select with typeahead prefix search, no text filter. | Reuse unchanged in v1. |
| `packages/hub/src/property-inspector/inspector/types.ts` | PI context and `SelectOption`. | Add runtime cache status for catalog descriptor readiness. |
| `packages/hub/src/property-inspector/settings-sync/settings-sync-state.ts` | Tracks runtime cache readiness. | Add catalog descriptor status, similar to disk volume status. |

## Life Of An Advanced Sensor

### 1. Stream Deck Creates The Action

Files:

- `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`
- `packages/hub/src/shared/stream-deck-actions.ts`
- `packages/hub/src/plugin.ts`
- `packages/hub/src/actions/catalog-metric.ts`

Flow:

```text
User drags "Advanced Sensor"
  -> manifest UUID com.ez.sho-metrics.catalog-metric
  -> resolveStreamDeckActionKind(...) returns "catalog"
  -> plugin.ts registered CatalogMetric action receives onWillAppear
```

`resolveQuickStartStoredWidgetSettings(...)` must create:

```text
StoredWidgetSettings.single_metric.slot.metric.target.catalog
  metric_id: unset/empty
  fallback_label: unset
  fallback_unit: unset

StoredWidgetSettings.single_metric.slot.metric.source_policy
  primary_source_profile_id: "local:windows-helper"
  fallback_source_profile_ids: []
  failure_mode: SHOW_UNAVAILABLE
```

Why helper-only source policy is required:

- catalog metric ids are source-native;
- `local:auto` is for built-in stable metrics only;
- Node/systeminformation must not be asked to serve LHM catalog ids;
- no selected metric means no helper demand yet.

### 2. The First Render Has No Metric

Files:

- `packages/hub/src/actions/metric-action.ts`
- `packages/hub/src/actions/catalog-metric.ts`

Flow:

```text
CatalogMetric.getMetricKeys(...)
  -> [] because target.metricId is empty
MetricAction.refreshSubscription(...)
  -> sees [] and disposes any existing BackgroundCollectionBinding
CatalogMetric.onMetricsUpdate(...)
  -> renders a placeholder asking the user to choose a metric
```

`MetricAction` currently throws when `metricKeys.length === 0`. This must change
at the base-class boundary because an incomplete user configuration is a valid
action state, not a catalog action failure. Existing CPU/GPU/Disk/Network/Memory
actions still return non-empty metric lists, so their behavior should not
change.

Implementation rule:

- Keep `MetricAction.buildReadPlanForMetricKeys(...)` throwing on empty metric
  keys. That method protects the invariant for all render/read-plan callers.
- Add the empty-list guard only in `MetricAction.refreshSubscription(...)`,
  before it calls `buildMetricCollectionReadPlan(...)`.
- On empty metric keys, dispose the existing `BackgroundCollectionBinding`,
  remove it from `metricCollectionBindings`, and return.
- `CatalogMetric.onMetricsUpdate(...)` must render the no-selection placeholder
  without calling `getMetricReader(...)`.
- `MetricAction.publishDisplayedMetricReadAttribution(...)` is already safe
  when `getDisplayedMetricKey(...)` returns `undefined`; keep that behavior.

### 3. Property Inspector Loads Helper Descriptors

Files:

- `packages/hub/src/actions/catalog-metric.ts`
- `packages/hub/src/runtime/metric-collection/background-metric-collection.ts`
- `packages/hub/src/runtime/sources/source-registry.ts`
- `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-client.ts`
- `packages/hub/src/runtime/widget-runtime-cache.ts`
- `packages/hub/src/property-inspector/settings-sync/settings-sync-state.ts`

Target flow:

```text
Property Inspector opens
  -> MetricAction.onPropertyInspectorDidAppear(...)
  -> CatalogMetric.refreshRuntimeCacheForPropertyInspector(...)
  -> backgroundMetricCollection lists descriptors from WINDOWS_HELPER_SOURCE_ID
  -> WindowsHelperSourceClient.listMetricDescriptors([])
  -> WidgetRuntimeCache patch carries runtime descriptors to PI
  -> PI sanitizes display labels and recomputes guided picker options
```

Add a small method to `BackgroundMetricCollection` rather than exporting the
source registry:

```ts
async readSourceMetricDescriptors(
    sourceId: string,
    metricKeys: readonly string[],
): Promise<MetricDescriptorSnapshot>
```

Behavior:

- Throw when the source is missing, lacks `listMetricDescriptors`, or the
  descriptor read fails. `CatalogMetric` maps all descriptor-load failures to an
  empty descriptor list plus `catalogMetricDescriptorLoadState: "failed"`.
- Log a throttled warning at the action owner boundary on failure.
- Do not mutate `MetricStore`.
- Do not register metric subscriptions.
- Do not trigger helper refresh demand.

Alternative considered:

| Alternative | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Export `backgroundSourceRegistry` and call the helper client directly from the action. | Fewer lines. | Leaks runtime composition root and source ownership into actions. | Reject. |
| Create a new descriptor catalog service/registry. | Clean if many source catalog UIs arrive. | One v1 caller; extra layer now. | Reject. |
| Put prebuilt PI option lists in runtime cache. | PI stays simple. | Duplicates UI state, makes selection cascade harder to test, stores presentation in runtime. | Reject. |
| Add one `BackgroundMetricCollection.listSourceMetricDescriptors` method. | Keeps source access behind the existing runtime root and avoids a new layer. | Background collection gains one metadata query method. | Choose. |

### 4. PI Builds The Guided Picker

Files:

- `packages/hub/src/runtime/widget-runtime-cache.ts`
- `packages/hub/src/property-inspector/panels/CatalogMetricWidgetSettings.tsx`
- `packages/hub/src/property-inspector/select-options/catalog-metric-options.ts`
- `packages/hub/src/property-inspector/controls/SelectSetting.tsx`

The option builder must be pure and unit-tested. It consumes runtime
`MetricDescriptor[]` and current stored/resolved selection state, then returns:

```ts
interface CatalogMetricSelection {
    readonly typeId: CatalogMetricTypeId | "";
    readonly hardwareId: string;
    readonly readingId: string;
    readonly metricId: string;
}

interface CatalogMetricOptions {
    readonly typeOptions: readonly SelectOption[];
    readonly hardwareOptions: readonly SelectOption[];
    readonly readingOptions: readonly SelectOption[];
    readonly metricOptions: readonly SelectOption[];
    readonly completedSelection: CatalogMetricSelection;
    readonly selectedDescriptor: MetricDescriptor | undefined;
}
```

This is PI-owned display state. Do not store `typeId`, `hardwareId`, or
`readingId` in `settings.proto`; persist only the selected metric id and
fallback display hints.

Descriptor filtering:

- Include scalar descriptors only:
  `descriptor.valueKind === MetricValueKind.SCALAR`.
- Drop descriptors with empty `metricId`.
- Drop descriptors with missing/empty `pollingGroupId`; the mapper should
  already do this.
- Deduplicate descriptors that identify the same source reading. Use opaque
  equality only; do not parse ids. When a stable alias and a source-sensor
  descriptor share the same non-empty raw `sourceSensorId`, `hardwareId`,
  `sourceSensorType`, `sensorName`, and `unit`, keep the source-sensor
  descriptor for the picker. Use `metricIdKind` to distinguish stable aliases
  from source-sensor descriptors. Keep stable aliases that have no matching
  source-sensor descriptor.
- Do not parse `sourceSensorId`.
- Do not parse `hardwareId`.
- Use `rawSensorIdentity.hardwareType`, `hardwareName`, `sourceSensorType`, and
  `sensorName` for UI grouping and labels only.

Type buckets:

```text
CPU
GPU
Memory
Disk
Network
Other
```

Type classification is source-specific PI presentation, not generic runtime
routing. It may use descriptor display metadata but must not affect refresh
scheduling.

Reference point: LibreHardwareMonitor Windows Forms presents raw sensors as
`HardwareNode -> TypeNode -> SensorNode` in `MainForm.cs`, `HardwareNode.cs`,
`TypeNode.cs`, and `SensorNode.cs`. The Advanced Sensor picker uses the same
hardware/reading/sensor idea, but adds the first `Type` bucket so the Stream
Deck PI does not start with a long hardware tree.

Classification rules:

| Type | Descriptor match |
| --- | --- |
| CPU | `hardwareType` normalized to `cpu`; fallback to stable alias `metricId` prefix `cpu.` only when `hardwareType` is empty or unrecognized |
| GPU | `hardwareType` normalized to `gpunvidia`, `gpuamd`, or `gpuintel`; fallback to stable alias `metricId` prefix `gpu.` only when `hardwareType` is empty or unrecognized |
| Memory | `hardwareType` normalized to `memory`; fallback to stable alias `metricId` prefix `ram.` only when `hardwareType` is empty or unrecognized |
| Disk | `hardwareType` normalized to `storage`; fallback to stable alias `metricId` prefix `disk.` only when `hardwareType` is empty or unrecognized |
| Network | `hardwareType` normalized to `network`; fallback to stable alias `metricId` prefix `net.` only when `hardwareType` is empty or unrecognized |
| Other | Everything else |

If `hardwareType` classifies the descriptor, it wins. Metric id prefixes are
fallbacks for stable aliases and native aggregate descriptors whose raw type is
missing or too generic.

Normalization for matching:

```text
lowercase, remove spaces, hyphens, underscores, and dots
```

Reading buckets:

| Source sensor type | UI label |
| --- | --- |
| `Temperature` | `Temperature` |
| `Load` | `Usage` |
| `Clock` | `Clock` |
| `Voltage` | `Voltage` |
| `Power` | `Power` |
| `Fan` | `Fan` |
| `Control` | `Control` |
| `Data` | `Data` |
| `SmallData` | `Data` |
| `Throughput` | `Throughput` |
| `Timing` | `Timing` |
| anything else | `Other` |

Sorting:

- Type order is fixed: CPU, GPU, Memory, Disk, Network, Other.
- Hardware options sort by:
  1. non-noisy before noisy;
  2. sanitized hardware label;
  3. opaque hardware key, compared only for deterministic sorting.
- Reading options sort by the table above, with `Other` last.
- Metric options sort by sanitized sensor label, then metric id.

Noisy hardware demotion:

Use one noisy-hardware scoring helper. It may receive type-specific token sets,
but the sorting mechanism must stay shared so network-specific and generic
hardware rules cannot drift into parallel implementations.

Lowercase sanitized network hardware labels containing any of these tokens
increase the noisy score:

```text
wfp
qos
lightweight filter
kernel debugger
loopback
bluetooth
virtual
miniport
teredo
isatap
```

Lowercase sanitized hardware or sensor labels containing any of these tokens
also increase the noisy score for all type buckets:

```text
virtual
basic render
software
shared
d3d
filter
miniport
loopback
```

Do not hide these in v1. Hiding can make support/debug harder when a real user
needs one.

Hardware filtering and labeling constraints:

- Treat these rules as picker presentation only. They must not affect source
  routing, helper refresh demand, or persisted metric ids.
- Do not use keyword matching to choose a "best" CPU/GPU temperature, power,
  clock, fan, disk, or network sensor for Advanced Sensor. That curated matching
  belongs in built-in widgets.
- Do not delete descriptors only because a hardware or sensor label contains
  `virtual`, `basic render`, `shared`, `d3d`, `filter`, `miniport`, `loopback`,
  or similar noisy words. Keep the metric selectable and sort it after clearer
  physical/vendor hardware when it is in the same type bucket.
- Virtual memory/page-file style memory hardware should remain selectable, but
  sort after physical memory and keep label text that makes the virtual nature
  visible.
- Software/basic-render GPU hardware should remain selectable, but sort after
  vendor GPU hardware and keep label text that makes the software/basic nature
  visible.
- Motherboard, SuperIO, fan, pump, and control sensors often have generic names
  such as `Temperature #1`, `Fan #2`, or `Control`. If two metric labels collide
  under the same reading, disambiguate by appending the sanitized hardware label.
- Duplicate hardware names must get deterministic display suffixes such as
  `#2` while keeping the underlying descriptor identity opaque. Assign suffixes
  after sorting duplicates by the stable opaque hardware key so labels do not
  swap across sessions.
- Disambiguate hardware labels before metric labels. Metric-label
  disambiguation must append the already-disambiguated hardware label.
- If a hardware type is unsupported or unrecognized, keep the descriptor under
  `Other`; do not invent a new top-level type in v1.

Sanitization:

- Strip control characters.
- Collapse whitespace runs to one space.
- Trim.
- Cap UI labels at 96 characters.
- Use fallback text when the sanitized value is empty.
- Never render raw descriptor strings directly.

Fallback labels:

| Fallback | Value |
| --- | --- |
| Type | `Other` |
| Hardware | `Unknown Hardware` |
| Reading | `Other` |
| Metric | `Metric` |

Dedup rationale:

- Helper-produced stable aliases such as CPU temperature may have ranked failover
  inside the helper. A raw source-sensor descriptor is tied to one sensor and
  does not have that alias failover behavior.
- This is intentional for Advanced Sensor. Curated aliases with failover belong
  in built-in CPU/GPU widgets; Advanced Sensor should expose the fine-grained raw
  readings users cannot reach from the curated widgets.
- The tradeoff is explicit: a persisted raw sensor id may be less stable across
  driver, firmware, or hardware changes than a helper-owned alias. That is
  acceptable here because the built-in widgets remain the stable path for common
  curated metrics.
- Test fixtures for this rule must match the real helper shape: the alias and
  raw descriptor share the same raw `sourceSensorId`, while `metricIdKind`
  identifies which descriptor is the stable alias.

### 5. PI Writes The Selected Metric

Files:

- `packages/hub/src/property-inspector/panels/CatalogMetricWidgetSettings.tsx`
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
- `contracts/proto/shometrics/v1/settings.proto`

When the user changes a select:

1. The PI option builder receives the partial selection.
2. It auto-completes the first valid downstream descriptor.
3. The panel writes one `catalog` settings patch.
4. The stored fallback label uses the final disambiguated metric label shown to
   the user, not the raw descriptor label.

When PI first opens:

- Build the visible completed selection in memory from the current stored
  `metricId` and descriptors.
- If no `metricId` is stored, show the initial unselected state even when only
  one type/hardware/reading path exists.
- Do not call `onSettingsPatch(...)` until the user changes a select.

Patch shape:

```ts
readonly catalog?: Partial<{
    readonly metricId: string;
    readonly fallbackLabel: string | undefined;
    readonly fallbackUnit: string | undefined;
}>;
```

Patch behavior:

- Require `MetricSelection.target.case === "catalog"`.
- Set `metric_id` to selected descriptor `metricId`.
- Set `fallback_label` to the descriptor-derived display label.
- Set `fallback_unit` to display unit text such as `%`, `C`, `W`, `B/s`.
- Keep source policy helper-only.

Do not use `fallback_label` as a user label override. It is a cached source
hint for offline/descriptor-unavailable situations. A later user-editable label
feature needs a separate stored field.

### 6. Selected Metric Starts Collection And Demand

Files:

- `packages/hub/src/actions/catalog-metric.ts`
- `packages/hub/src/actions/metric-action.ts`
- `packages/hub/src/runtime/source-routing/metric-read-plan-builder.ts`
- `packages/hub/src/runtime/metric-collection/collector-group-planner.ts`
- `packages/hub/src/runtime/metric-collection/collector-group-supervisor.ts`
- `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-client.ts`
- `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsMetricSnapshotWorker.cs`
- `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardwareMonitorSession.cs`

Flow:

```text
CatalogMetricTarget.metric_id is non-empty
  -> CatalogMetric.getMetricKeys(...) returns [metricId]
  -> MetricAction builds helper-only MetricReadPlan from source policy
  -> BackgroundCollectionBinding registers one MetricSubscription
  -> CollectorGroupPlanner asks WindowsHelperSourceClient.resolveMetricPollingGroups([metricId])
  -> WindowsHelperSourceClient resolves metricId from cached descriptors
  -> planner emits a sourceDeclared collector group with descriptor polling_group_id
  -> CollectorGroupSupervisor sends SetMetricRefreshDemand for that polling group
  -> WindowsMetricSnapshotWorker refreshes only demanded helper group
  -> CollectorGroupRunner reads cached snapshot
  -> MetricStore ingests selected metric
  -> CatalogMetric.onMetricsUpdate reads MetricStore and renders
```

If descriptor metadata is still loading:

```text
WindowsHelperSourceClient.resolveMetricPollingGroups(...)
  -> pendingMetadata
  -> CollectorGroupPlanner creates no runner
  -> no helper demand yet
  -> action renders placeholder / helper unavailable copy
  -> descriptorLoaded invalidation reconciles active subscriptions
```

This is expected. Do not add a `ReadSnapshot` probe for unknown catalog ids.

### 7. Rendering The Selected Metric

Files:

- `packages/hub/src/actions/catalog-metric.ts`
- `packages/hub/src/actions/shared/helper-backed-widget-data.ts`
- `packages/hub/src/runtime/metric-store.ts`
- `packages/hub/src/view-updates/runner.ts`
- `packages/hub/src/property-inspector/previews/metric-option-preview.ts`

Rendering rule:

- Empty `metricId`: render a no-selection placeholder.
- Selected scalar metric: read helper-backed `WidgetData`.
- Helper unavailable/no data: reuse `readHelperBackedWidgetData`.
- No Node fallback.

Display unit mapping:

| MetricUnit | Display unit | Default maximum |
| --- | --- | --- |
| `PERCENT` | `%` | 100 |
| `CELSIUS` | `C` | 100 |
| `VOLTS` | `V` | 100 |
| `AMPERES` | `A` | 100 |
| `WATTS` | `W` | 300 |
| `HERTZ` | `Hz` | 100 |
| `BYTES` | `B` | 100 |
| `BYTES_PER_SECOND` | `B/s` | 100 |
| `REVOLUTIONS_PER_MINUTE` | `RPM` | 3000 |
| `SECONDS` | `s` | 100 |
| `MILLISECONDS` | `ms` | 1000 |
| anything else | empty string | 100 |

Do not try to solve perfect scaling in v1. The first version should be useful
for text, line, and rough progress views. Per-unit or learned scale controls
can be a later focused change if users need them.

Default view:

- Advanced Sensor should default to Text view, not Circle.
- Reason: arbitrary volts, hertz, bytes, timing, and fan metrics have no
  reliable progress maximum in v1; Text avoids a misleading full/empty ring as
  the first experience.

Icon rule:

- Use the generic/unknown hardware icon for v1.
- Do not add stored icon fields in this batch.

Alternative considered:

| Alternative | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Store hardware type and reading type on `CatalogMetricTarget`. | Better offline icon and label context. | Adds stored fields that are only hints and can drift from descriptors. | Reject for v1. |
| Resolve icon from live runtime descriptor cache during render. | Better active-session icon. | Render should not depend on PI cache availability. | Reject for v1. |
| Use unknown icon for v1. | Small and stable. | Less polished for CPU/GPU selections. | Choose. |

## Implementation Steps

### Step 1: Add The Stream Deck Action Shell

Files:

- `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`
- `packages/hub/src/shared/stream-deck-actions.ts`
- `packages/hub/src/plugin.ts`
- `packages/hub/src/actions/catalog-metric.ts`
- `packages/hub/src/actions/shared/resolved-metric-target.ts`
- `packages/hub/src/actions/metric-action.ts`

Work:

1. Add action kind `"catalog"` and UUID `com.ez.sho-metrics.catalog-metric`.
2. Add manifest action with product name `Advanced Sensor`.
3. Add `CatalogMetric` action class in `catalog-metric.ts`.
4. Register `new CatalogMetric()` in `plugin.ts`.
5. Allow action target reader to read `ResolvedCatalogMetricTarget`.
6. Update `MetricAction.refreshSubscription(...)` so empty metric key lists
   dispose collection and skip subscription registration.
7. Render a no-selection placeholder when `metricId` is empty.

Estimated LOC: 120-190.

Verification:

- Unit test unknown/empty catalog target does not register collection.
- Unit test selected catalog target registers exactly one metric key.
- Existing CPU/GPU/Disk/Network/Memory action tests still pass.

### Step 2: Wire Stored Settings For Catalog Targets

Files:

- `packages/hub/src/settings/storage/quick-start-widget-settings.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
- `packages/hub/src/settings/storage/resolver.ts`
- `packages/hub/src/settings/storage/resolver.test.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.test.ts`

Work:

1. Quick-start `"catalog"` actions to an empty `CatalogMetricTarget`.
2. Change the quick-start helper shape from target-only to target plus optional
   source policy. Existing actions continue to return only a target and keep
   resolver default source behavior.
3. Write helper-only `MetricSourcePolicy` during Advanced Sensor quick-start:
   `primary_source_profile_id = "local:windows-helper"`,
   `failure_mode = SHOW_UNAVAILABLE`, no fallbacks.
4. Add `catalog` sparse patch support.
5. Keep empty `metricId` valid in resolved settings.
6. Make catalog targets default to Text view in
   `resolveDefaultAppearanceSettings(...)`.
7. Do not add new proto fields in v1.

Estimated LOC: 80-140.

Verification:

- Quick-start settings for Advanced Sensor store catalog target and helper-only
  source policy.
- Existing quick-start actions do not persist explicit source policy.
- Advanced Sensor resolves to Text view by default.
- Patch updates catalog metric id/label/unit and rejects non-catalog targets.
- Resolver returns `domain: "catalog"` with empty metric id for initial state.

### Step 3: Publish Helper Descriptor Catalog To PI

Files:

- `packages/hub/src/runtime/metric-collection/background-metric-collection.ts`
- `packages/hub/src/runtime/widget-runtime-cache.ts`
- `packages/hub/src/property-inspector/settings-sync/settings-sync-state.ts`
- `packages/hub/src/actions/catalog-metric.ts`

Work:

1. Add a small descriptor-read method to `BackgroundMetricCollection`.
2. Add runtime cache fields:

   ```ts
   readonly availableCatalogMetricDescriptors: MetricDescriptor[];
   readonly catalogMetricDescriptorLoadState: "pending" | "ready" | "failed";
   ```

3. Add this PI runtime status field derived from
   `catalogMetricDescriptorLoadState`, not from descriptor-list presence:

   ```ts
   catalogMetricDescriptorStatus: "pending" | "ready" | "failed";
   ```

4. In `CatalogMetric.refreshRuntimeCacheForPropertyInspector(...)`, call the
   descriptor-read method and update runtime cache.
5. On failure, send an empty descriptor list and failed status; do not crash PI.

Estimated LOC: 100-170.

Verification:

- PI receives descriptor runtime cache after opening Advanced Sensor.
- Helper descriptor load failure produces `catalogMetricDescriptorStatus:
  "failed"` instead of an indefinite loading state.
- Helper unavailable state shows a bounded warning/no-data UI, not an exception.
- Descriptor reads do not register background collection or send refresh demand.

### Step 4: Build The Guided Picker

Files:

- `packages/hub/src/property-inspector/panels/CatalogMetricWidgetSettings.tsx`
- `packages/hub/src/property-inspector/select-options/catalog-metric-options.ts`
- `packages/hub/src/property-inspector/select-options/catalog-metric-options.test.ts`
- `packages/hub/src/property-inspector/panels/WidgetSettingsTab.tsx`
- `packages/hub/src/property-inspector/panels/WidgetSettingsTab.test.ts`
- `packages/hub/src/property-inspector/controls/SelectSetting.tsx`

Work:

1. Add `CatalogMetricWidgetSettings`.
2. Add `renderMetricPanel(...)` branch for `target.domain === "catalog"`.
3. Build pure catalog option tree from runtime descriptors.
4. Keep the option builder decomposed into small pure functions for filtering,
   deduplication, classification, noisy scoring, sorting, sanitization, and
   disambiguation. Do not build this as one mega-function.
5. Filter non-scalar descriptors.
6. Sanitize descriptor-originated labels.
7. Render `Type`, `Hardware`, `Reading`, and `Metric` selects.
8. Hide select rows with only one valid option.
9. Auto-complete downstream selection to the first valid metric after the user
   changes an upstream select.
10. Write catalog settings patch with selected metric id and final
    disambiguated fallback hints.
11. Reuse existing `AppearanceSettings`, `LineSettings`, `StandardColorSettings`,
    and `PollingSettings`.

Estimated LOC: 240-420.

Verification:

- CPU POC fixture builds CPU -> single hardware -> Temperature/Usage/etc.
- Stable aliases that duplicate a source-sensor reading are removed from the
  picker, while unique stable aliases remain available.
- Single hardware level is hidden.
- Multiple hardware level is shown for GPU.
- Network noisy adapters sort last.
- Virtual memory, software GPU, and virtual/filter network descriptors remain
  selectable but sort after clearer physical/vendor hardware.
- Duplicate hardware names and duplicate metric labels are disambiguated.
- Stored fallback label matches the final metric label shown in the picker.
- Control characters are stripped from labels.
- Empty descriptor state shows a loading/unavailable note.
- Opening PI with no selected metric does not write settings.
- Selecting Type auto-completes a concrete metric.
- Selecting Hardware/Reading/Metric patches only catalog settings.

### Step 5: Render Selected Catalog Metrics

Files:

- `packages/hub/src/actions/catalog-metric.ts`
- `packages/hub/src/actions/catalog-metric.test.ts`
- `packages/hub/src/actions/shared/helper-backed-widget-data.ts`
- `packages/hub/src/property-inspector/previews/metric-option-preview.ts`

Work:

1. Return `[]` from `getMetricKeys(...)` when no metric is selected.
2. Return `[target.metricId]` when selected.
3. Build `WidgetData` using stored fallback label/unit.
4. Use helper-backed unavailable behavior.
5. Use display unit/default maximum mapping from this plan.
6. Use unknown hardware icon in v1.

Estimated LOC: 120-200.

Verification:

- No selection renders placeholder and no collection subscription.
- Selected metric renders from `MetricStore`.
- Missing helper data renders helper unavailable/no sensor data copy.
- Percentage metrics use max 100.
- Non-percent scalar metrics render without throwing.

### Step 6: End-To-End Checks

Files/scripts:

- `packages/hub/src/runtime/metric-collection/collector-group-supervisor.test.ts`
- `packages/hub/src/runtime/metric-collection/collector-group-planner.test.ts`
- Existing dev helper command from the demand plan.
- Existing helper logs under `packages/source-windows/logs/watch.log`.

Manual checks:

1. Start the helper with `--dev-pipe`. Completed.
2. Start/restart Stream Deck plugin. Completed.
3. Drag **Advanced Sensor** to a key. Completed.
4. Confirm the key shows no-selection placeholder. Covered by unit test and
   manual startup behavior.
5. Confirm helper logs show no `SetMetricRefreshDemand` for this action before
   metric selection. Covered by no-selection subscription tests.
6. Open PI and confirm descriptor picker loads. Completed.
7. Select an Advanced Sensor Intel GPU metric. Completed.
8. Select an Advanced Sensor Other/Voltage metric. Completed.
9. Add then remove an Advanced Sensor RAM metric. Completed.
10. Confirm helper demand contains only selected Advanced Sensor polling groups
    plus independent demand from built-in Quick Start widgets. Completed with
    helper logs.
11. Confirm removed Advanced Sensor RAM demand disappears. Completed with helper
    logs.
12. Confirm selected Advanced Sensor widgets update at the configured polling
    interval. Completed by live widget behavior and helper refresh logs.

Automated checks:

- Unit tests for option builder, settings patching, action subscription, and
  PI panel behavior.
- `npm.cmd run test:unit` passed.
- `npm.cmd run build` was not rerun for this documentation-only closeout.

## Acceptance Checklist

- Manifest exposes an `Advanced Sensor` action.
- Stored target uses `CatalogMetricTarget`; no duplicate settings model.
- Internal target domain remains `"catalog"`.
- Empty initial selection is valid and does not start collection.
- `MetricAction.buildReadPlanForMetricKeys(...)` still throws on empty metric
  keys; only subscription refresh handles no-selection as a valid state.
- Opening PI with no selected metric does not persist a default metric.
- Advanced Sensor quick-start persists helper-only source policy; existing
  quick-start actions do not.
- Advanced Sensor defaults to Text view.
- Selected metric is helper-only and has no Node fallback.
- PI picker is descriptor-driven and prevents invalid combinations by
  construction.
- Catalog descriptor load failure reaches PI as `failed`, not endless loading.
- PI does not parse `hardware_id` or `source_sensor_id`.
- PI uses `hardwareType` as the primary type classifier; metric id prefixes are
  fallback-only for stable aliases/native aggregates with missing or generic
  raw type.
- Duplicate stable aliases are removed when a matching source-sensor descriptor
  exists.
- Noisy/virtual hardware is demoted and disambiguated, not hidden.
- Runtime source routing does not parse LHM ids.
- Helper refresh demand is driven by descriptor polling groups.
- No new helper C# code is required.
- No new source API proto fields are required.
- Descriptor labels are sanitized before UI display.
- Network virtual/filter adapters are demoted, not hidden.
- `Other` is a single bucket.
- Existing built-in widgets continue to work.
- Tests cover no-selection, auto-complete, descriptor sanitization, helper-only
  source policy, and selected metric collection.
- User-editable labels are intentionally out of v1 scope; `fallbackLabel` is a
  source-derived fallback hint only.

## Expected Size

Rough estimate:

```text
action shell and no-selection support:        120-190 LOC
settings quick-start and patches:             80-140 LOC
runtime descriptor cache publication:        100-170 LOC
PI option builder and panel:                 240-420 LOC
selected metric rendering:                   120-200 LOC
tests:                                       300-520 LOC

total:                                       960-1640 LOC
```

Keep the implementation near the low end by reusing `CatalogMetricTarget`,
`WindowsHelperSourceClient`, `MetricAction`, `CollectorGroupPlanner`,
`CollectorGroupSupervisor`, and existing PI controls. Do not add a new catalog
runtime layer unless a second real catalog source forces that boundary.
