# Helper-Owned First-Class Metrics Plan

This plan adds first-class UI/runtime support for Windows helper-owned metrics
that are useful to ordinary users without exposing the advanced source catalog.

The first metrics are:

- `cpu.temp`
- `cpu.power`
- `disk.throughput.read`
- `disk.throughput.write`
- `disk.throughput.total`

The implementation must preserve the runtime boundaries already established in
the source performance documents:

```text
Property Inspector
  -> writes metric settings only

Actions
  -> choose metric keys, render WidgetData, publish runtime diagnostics

Runtime source routing
  -> maps one metric key to source candidates

Background collection
  -> keeps source-scoped MetricStore samples fresh

Windows helper
  -> owns native/LHM sensor interpretation and descriptor meaning
```

Do not make Node parse LHM sensor paths, PDH paths, hardware names, or source
native ids. The helper owns those mappings.

## Required Context

Read these before coding:

- `docs/development/runtime-sources/02-source-routing/01-windows-source-latency-findings.md`
- `docs/development/runtime-sources/02-source-routing/02-metric-level-source-routing.md`
- `docs/development/runtime-sources/02-source-routing/03-runtime-source-future-work.md`
- `contracts/proto/shometrics/v1/settings.proto`
- `packages/hub/src/runtime/source-routing/metric-source-preferences.ts`
- `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-client.ts`
- `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardwareMetricCatalog.cs`
- `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardwareMonitorSession.cs`

## Fixed Product Decisions

| Area | Decision |
| --- | --- |
| GPU proto | Do not refactor it in this slice. The current flat shape is acceptable until a separate cleanup. |
| CPU target | Add CPU `temperature` and `power` as first-class CPU target kinds. |
| CPU temperature/power source | Windows helper only. Node does not fallback. |
| GPU source | Keep current helper-preferred with built-in fallback behavior. |
| Disk throughput on Windows | Use helper-owned native Windows PDH `PhysicalDisk(_Total)`, not generic LHM traversal. |
| Disk throughput meaning | Total throughput across all physical disks. It is not tied to `DiskMetricTarget.volume_id`. |
| Catalog picker | Out of scope. Stable aliases must not appear mixed into raw catalog sensor lists later. |
| Source selector | Helper-only metrics show static source text, not a dropdown. |
| User-facing no data | Helper-only metrics need non-black-box no-data copy and DEBUG diagnostics. |
| Backwards compatibility | Not required; the app is not in production. Prefer coherent final shape over migration scaffolding. |

## Review Decisions

| Review point | Decision |
| --- | --- |
| CPU PI before helper alias exists | Treat CPU PI, routing, descriptor-cache semantics, and helper aliases as one atomic implementation phase. They may be committed separately during local work, but should not be considered complete independently. |
| Helper-only no-data copy | Required, not optional. At minimum implement helper-required/no-fresh-source behavior and DEBUG source status. |
| Disk routing platform split | Implement explicit platform-aware routing: Windows disk throughput goes helper-only; non-Windows stays node-system. |
| Throughput volume picker | Hide the volume picker when disk throughput is selected. First version is total across disks only. |
| Descriptor cache reset on helper reconnect | Do not add a reconnect reset. Current pipe transport is request-scoped, not a persistent connection. Do not clear descriptors on helper unavailability; source health is data-plane state. Complete descriptor snapshots and fingerprints remain the metadata authority. |
| Sensor ranking determinism | Sort candidates by stable source-owned identity before ranking by name/type so ties are deterministic. |
| Multi CPU package machines | Out of scope for v1. Stable CPU aliases choose one best package-level value. |
| Auto vs Prefer Helper hint | Optional follow-up. The current product position is preference plus fallback, so Auto and Prefer Helper may be equivalent for GPU on Windows. |

## Phase 1: Settings Contract And Resolved Types

Estimated change: 180-320 TypeScript/proto LOC plus generated code.

### Proto

Edit `contracts/proto/shometrics/v1/settings.proto`.

Add CPU kinds:

```proto
KIND_TEMPERATURE = 2;
KIND_POWER = 3;
```

Add CPU target fields:

```proto
optional uint32 maximum_temperature_celsius = 2 [(buf.validate.field).uint32 = {
  gte: 1
  lte: 200
}];

optional uint32 maximum_power_watts = 3 [(buf.validate.field).uint32 = {
  gte: 1
  lte: 2000
}];

optional TemperatureUnit temperature_unit = 4 [(buf.validate.field).enum = {
  defined_only: true
  not_in: [0]
}];
```

Do not refactor `GpuMetricTarget` or `DiskMetricTarget` into `oneof` here.

### Generated Code

Run:

```powershell
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
```

### Resolved Settings

Update:

- `packages/hub/src/settings/resolved-settings.ts`
- `packages/hub/src/settings/storage/resolver.ts`
- `packages/hub/src/settings/storage/enum-maps.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.ts`

Resolved CPU shape:

```typescript
export type ResolvedCpuReading =
    | { readonly kind: "usage" }
    | {
        readonly kind: "temperature";
        readonly maximumCelsius: number;
        readonly unit: TemperatureUnit;
    }
    | {
        readonly kind: "power";
        readonly maximumWatts: number;
    };
```

Defaults:

- CPU temperature max: `100 C`
- CPU power max: `150 W`
- CPU temperature unit default: Celsius

Runtime resolution:

- On Windows, preserve persisted CPU temperature/power.
- On non-Windows, resolve persisted CPU temperature/power to CPU usage.
- Do not inspect helper availability in settings resolver.

Patch shape:

```typescript
readonly cpu?: Partial<{
    readonly kind: ResolvedCpuReading["kind"];
    readonly temperatureUnit: TemperatureUnit;
    readonly maximumTemperatureCelsius: number;
    readonly maximumPowerWatts: number | undefined;
}>;
```

## Phase 2: Metric Keys And Source Routing

Estimated change: 120-220 TypeScript LOC.

### Metric Keys

Edit `packages/hub/src/runtime/metric-keys.ts`.

Add:

```typescript
export const CPU_TEMP_METRIC_KEY = "cpu.temp";
export const CPU_POWER_METRIC_KEY = "cpu.power";
```

Add or update a CPU stable key list:

```typescript
export const CPU_METRIC_KEYS = [
    CPU_USAGE_METRIC_KEY,
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
] as const;
```

### Source Preferences

Edit `packages/hub/src/runtime/source-routing/metric-source-preferences.ts`.

Use explicit platform-aware lists:

```typescript
const NODE_SYSTEM_ONLY_STABLE_METRIC_KEYS = [
    CPU_USAGE_METRIC_KEY,
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
    getNetworkAggregateMetricKey("download"),
    getNetworkAggregateMetricKey("upload"),
    getDefaultDiskUsageMetricKey("used"),
    getDefaultDiskUsageMetricKey("total"),
    getDefaultDiskUsageMetricKey("available"),
    getDefaultDiskUsageMetricKey("percent"),
] as const;

const WINDOWS_HELPER_ONLY_STABLE_METRIC_KEYS = [
    CPU_TEMP_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    getDiskThroughputMetricKey("read"),
    getDiskThroughputMetricKey("write"),
    getDiskThroughputMetricKey("total"),
] as const;

const WINDOWS_HELPER_WITH_NODE_FALLBACK_STABLE_METRIC_KEYS = [
    ...GPU_METRIC_KEYS,
] as const;
```

Routing behavior:

```text
platform != win32:
  -> node-system

win32 + helper-only key:
  -> windows-helper

win32 + helper-with-node-fallback key:
  -> windows-helper, node-system

win32 + node-only key:
  -> node-system

fallback:
  -> node-system
```

The explicit coverage test must include all stable built-in keys. Do not let a
new stable key pass only because the resolver has a node-system fallback.

Disk throughput must remain available on Darwin through node-system. This is
handled by the first platform branch: non-Windows returns node-system.

## Phase 3: Windows Helper Descriptor Semantics

Estimated change: 120-240 TypeScript LOC.

Edit `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-client.ts`.

Current behavior:

```text
descriptor cache miss -> pendingMetadata
```

Required behavior:

```text
before complete descriptor preload:
  cache miss -> pendingMetadata

after complete descriptor preload:
  cache miss -> unsupported
```

Implementation details:

- Add `hasCompleteDescriptorSnapshot`.
- Set it only when `listMetricDescriptors([])` succeeds.
- Filtered descriptor reads must not mark the catalog complete.
- Same-fingerprint filtered responses may accumulate descriptors.
- Changed fingerprint clears cached descriptors.
- Do not clear descriptors because the helper pipe is missing, the helper times
  out, or a read fails. Those are source health/data-plane events, not metadata
  invalidations.

Tests:

- Missing metric before full preload returns `pendingMetadata`.
- Missing metric after full preload returns `unsupported`.
- Filtered descriptor response does not set complete-catalog state.
- Changed fingerprint clears descriptors.
- Same fingerprint accumulates filtered descriptors.

## Phase 4: Helper CPU Stable Aliases

Estimated change: 220-420 C# LOC.

Edit:

- `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardwareMetricCatalog.cs`
- `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardwareMonitorSession.cs`
- Add helper-owned ranking helpers if needed.

Do not emit `cpu.temp` or `cpu.power` directly from every matching sensor during
per-sensor traversal. That makes traversal order decide the stable alias.

Required shape:

1. During one LHM refresh, gather CPU temperature and CPU power candidates.
2. Sort candidates by stable source-owned identity before ranking.
3. Pick one stable alias reading per metric.
4. Continue emitting source-native `lhm.sensor:/...` readings/descriptors for
   all valid raw sensors.

CPU temperature ranking:

1. exact `CPU Package`
2. name contains `Package`
3. name contains `Tctl`
4. name contains `Tdie`
5. name contains `Average`
6. name contains `Core`, excluding `soc`, `vrm`, `fan`, `pump`, `liquid`,
   `coolant`, and `distance`
7. otherwise no stable `cpu.temp`

CPU power ranking:

1. name contains `Package`
2. name contains `Cores`
3. otherwise no stable `cpu.power`

Validation:

- CPU temperature: finite, `> 0`, `<= 125`
- CPU power: finite, `>= 0`, `<= 1000`

Scope:

- v1 assumes one best CPU package reading.
- Multi-socket server aggregation/selection is out of scope.
- Catalog users can later choose exact raw sensors. Stable alias fallback is
  for simple first-class CPU widgets only.

Tests:

- Package temperature beats core temperature.
- Tctl/Tdie are accepted when package is absent.
- Core fallback excludes obvious non-CPU/non-temperature names.
- Invalid temperatures are rejected.
- Package power beats cores power.
- No matching sensor emits no stable alias.
- Raw source sensor descriptors are still emitted.

## Phase 5: CPU Action And Property Inspector

Estimated change: 260-480 TypeScript LOC.

### Action

Edit `packages/hub/src/actions/cpu.ts`.

Metric subscriptions:

```text
usage       -> cpu.usage_percent, cpu.model
temperature -> cpu.temp
power       -> cpu.power
```

Rendering:

- Usage keeps current behavior.
- Temperature uses existing `buildTemperatureWidgetData`.
- Power should use a generic power formatter. Rename or wrap
  `metrics/gpu-power-widget-data.ts` so CPU and GPU do not duplicate power
  display math.

Icons:

```typescript
buildMetricViewIcons({ hardware: "cpu", status: "temperature" })
buildMetricViewIcons({ hardware: "cpu", status: "power" })
```

Staleness:

- Do not display stale helper values forever.
- Reuse the current GPU helper freshness pattern or extract a shared helper if
  it removes duplication without creating a new abstraction layer.

### Property Inspector

Add `packages/hub/src/property-inspector/panels/CpuWidgetSettings.tsx`.

Update `packages/hub/src/property-inspector/panels/WidgetSettingsTab.tsx`:

```text
cpu    -> CpuWidgetSettings
memory -> DefaultWidgetSettings
```

CPU metric options:

- Always show `Usage`.
- On Windows also show `Temperature` and `Power`.
- On non-Windows hide `Temperature` and `Power`.

Helper-only source note:

- For CPU temperature/power, show static text:

  ```text
  Source: Helper only
  ```

- Do not show a source dropdown for helper-only metrics.
- Do not mention LHM in ordinary UI.

Scale sections:

- Temperature: unit + max temp.
- Power: max power.

Tests:

- CPU temperature/power options show only on Windows.
- CPU helper-only source text appears only for temperature/power.
- CPU helper-only source text is not a dropdown.
- Changing CPU kind patches `cpu.kind`.
- Temperature unit/max and power max patch CPU fields, not GPU fields.

## Phase 6: User-Facing No-Data And DEBUG Status

Estimated change: 180-360 TypeScript LOC.

This phase is required for CPU temperature/power. It may be implemented before
or together with Phase 5.

Minimum product behavior:

| State | Widget copy | DEBUG copy |
| --- | --- | --- |
| Helper not connected | `Helper required` | `Helper status: Not connected` |
| Helper connected, no matching stable alias | `No sensor data` | `Helper status: No matching sensor` |
| Helper request failure | `Helper error` | `Helper status: Read failed` |
| Fresh sample selected | normal metric value | current source + sample age |

Boundary rules:

- Source health belongs to the source client.
- Sample freshness belongs to `MetricStore` / fallback reader.
- PI reads runtime cache only.
- Do not query `SourceRegistry` directly from PI.
- Do not persist helper status in Stream Deck settings.

Implementation path:

1. Extend runtime cache with source diagnostic state only if the action/PI needs
   it to render the user-facing/debug copy.
2. Publish source diagnostic facts from action/runtime ownership boundaries.
3. Keep `MetricSourceDiagnostic` as DEBUG-only. Ordinary widget copy remains
   separate.

Do not over-model every future source state. Implement only states that are
observable today from `WindowsHelperSourceClient.getCachedStatus()` plus
descriptor resolution.

## Phase 7: Helper Native Disk Throughput

Estimated change: 240-520 C# LOC and 120-240 TypeScript LOC.

This is separate from LHM sensor traversal.

Add a helper-owned native Windows disk throughput provider:

```text
metric ids:
  disk.throughput.read
  disk.throughput.write
  disk.throughput.total

source sensor ids:
  windows.pdh:PhysicalDisk(_Total):Disk Read Bytes/sec
  windows.pdh:PhysicalDisk(_Total):Disk Write Bytes/sec

polling group:
  windows-native:disk-throughput
```

Rules:

- Use `PhysicalDisk(_Total)`.
- Do not sum per-disk instances.
- Do not route Windows disk throughput through generic LHM traversal.
- Continue to expose LHM raw storage sensors only as catalog/source-sensor
  descriptors for future advanced selection.

Hub changes after helper provider exists:

- Remove the Windows downgrade in `resolveDiskReading`.
- Remove `showDiskThroughputUnavailable` Windows guard in `actions/disk.ts`.
- Stop filtering throughput out in `DiskWidgetSettings.tsx`.
- Hide volume picker when `reading.kind === "throughput"`.
- Add PI text explaining total throughput across all disks.
- Show static source text: `Source: Helper only`.

Tests:

- Windows disk throughput remains throughput in resolver.
- Disk throughput PI hides volume picker.
- Disk throughput PI says total across disks.
- Disk action subscribes read/write/total as today, but now runs on Windows.
- Source routing sends Windows disk throughput to helper only.

## Phase 8: Stable Alias And Catalog Separation

Estimated change: 40-100 TypeScript/C# LOC now, more later when catalog picker
exists.

Current descriptor contract already carries `MetricIdKind`:

- `METRIC_ID_KIND_STABLE_ALIAS`
- `METRIC_ID_KIND_SOURCE_SENSOR`

For this plan:

- Ensure new `cpu.temp`, `cpu.power`, and native disk throughput descriptors
  use `STABLE_ALIAS`.
- Raw LHM sensor descriptors continue to use `SOURCE_SENSOR`.

Future catalog picker rule:

- Default catalog list shows `SOURCE_SENSOR`.
- Stable aliases are hidden or shown in a separate recommended/built-in group.
- Do not mix `cpu.temp` into a long list of `lhm.sensor:/...` paths.

## Verification

Run:

```powershell
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run test:unit
npm.cmd run build
dotnet build packages/source-windows/ShoMetrics.Source.Windows.Core/ShoMetrics.Source.Windows.Core.csproj
dotnet build packages/source-windows/ShoMetrics.Source.Windows.Helper/ShoMetrics.Source.Windows.Helper.csproj
```

## Recommended Implementation Order

The app is not in production, so temporary local gaps are acceptable during
development. Still, these phases should be reviewed as cohesive feature slices:

1. Phase 1: settings contract and resolver.
2. Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6 together: CPU
   temperature/power end-to-end.
3. Phase 7: Windows disk throughput end-to-end.
4. Phase 8: descriptor kind hygiene and future catalog separation.

Do not merge CPU PI as a complete feature before helper aliases and minimum
no-data/debug copy exist.

## Non-Goals

- No GPU proto cleanup.
- No catalog metric picker.
- No per-core CPU selector.
- No per-disk throughput selector.
- No multi-socket CPU package aggregation.
- No Node-side LHM path parsing.
- No helper source dropdown for helper-only metrics.
- No source health stored in persisted settings.
- No general source-health dashboard.
