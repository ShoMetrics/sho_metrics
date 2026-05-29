# Windows Disk Throughput Implementation Plan

This document keeps Windows disk read/write speed decisions in one place.

Read this after:

1. [Windows Source Latency Findings](../02-source-routing/01-windows-source-latency-findings.md)
2. [LibreHardwareMonitor Desktop Source Reading](01-lhm-desktop-source-reading.md)
3. [Helper Source Reliability Implementation Plan](02-helper-source-reliability-implementation-plan.md)

## Objective

Ship first-class Windows disk read/write speed as system-total disk I/O, while
keeping per-disk LHM storage sensors as an explicit advanced/catalog metric path.

The first-class Disk widget must not map Node volumes to LHM storage hardware,
must not traverse LHM storage by default, and must not pretend that a filesystem
volume selector chooses a physical disk throughput source.

## Product Decisions

| Decision | Product reason | Implementation meaning |
| --- | --- | --- |
| First-class Windows disk throughput shows total system disk I/O. | This matches the current macOS-style simple widget expectation and avoids fragile per-disk identity work. | Publish `disk.throughput.read`, `disk.throughput.write`, and `disk.throughput.total` from a native Windows system-total provider. |
| The Disk widget volume selector is disabled for throughput. | A volume such as `C:` is not the same thing as a physical disk counter. | When throughput is selected, disable the disk list and show copy explaining that the widget displays total system disk read/write. |
| Per-disk throughput is a future catalog metric use case. | Users who need one raw disk sensor can choose it deliberately and accept source-specific behavior once Advanced Sensor exists. | Do not build a first-class per-physical-disk selector in this plan. Until Advanced Sensor ships, do not point users to a missing UI. |
| LHM storage is not the default first-class throughput source. | LHM storage traversal can enumerate, refresh, or wake storage devices. | Normal first-class `disk.throughput.*` must come from native Windows counters, not `HardwareType.Storage`. |
| LHM storage sensors may be exposed only behind an explicit advanced path. | Advanced users can trade safety for access to per-disk raw sensors. | Future Advanced Sensor LHM UI must warn that storage sensors may be buggy, may wake disks, and may behave poorly with external or RAID devices. |
| Disk usage/capacity stays OS volume metadata. | Usage/capacity are filesystem/volume facts, not high-frequency sensor telemetry. | Keep the current Node/systeminformation path unless a future native volume provider replaces it deliberately. |

Suggested PI copy for throughput mode:

```text
Showing total system disk read/write. Per-disk monitoring is not available in
this version.
```

When Advanced Sensor ships, the copy may become:

```text
Showing total system disk read/write. For per-disk sensors, use Advanced Sensor
with LibreHardwareMonitor. LHM storage sensors may wake or disturb disks.
```

## Why Not First-Class Per-Disk In V1

Per-disk throughput sounds small but requires a stable physical disk identity,
descriptor registry, settings storage, PI selector, and action subscription path.
That is the part that makes the implementation large.

The first-class widget does not need that complexity for v1. System-total disk
I/O answers the common Stream Deck use case without joining unrelated identity
systems:

```text
Node volume list:
  filesystem/volume identity such as C:

LHM storage list:
  source-native hardware and sensor identity

Windows native disk counters:
  physical disk counter identity
```

Do not join these by display name, drive letter, model name, or size.

## LHM Storage Risk

Concrete failure signals:

- LHM commit `a0392ad` adds `StorageDevice.ForceWakeup`, which means sleeping
  drive interaction is a known storage concern in LHM itself.
- LHM commit `47b46c7` fixes long delays in mechanical disk read/write updates.
- LHM commit `9b985d3` removes a forced storage-device update interval, which
  shows storage cadence policy has changed over time.
- See [LibreHardwareMonitor Desktop Source Reading](01-lhm-desktop-source-reading.md)
  for source-reading details.

Structural risks:

- Enabling LHM storage creates storage hardware objects from all detected disks.
- LHM storage includes throughput, SMART, temperature, health, space, and
  power-state paths. There is no first-class "throughput only" switch.
- `Computer.IsStorageEnabled` is process-wide for the LHM `Computer`. Enabling
  it for one catalog widget affects the helper's LHM hardware graph.
- Storage device creation and refresh use storage device APIs and IOCTLs such as
  storage property queries and disk performance queries. External USB bridges
  and some RAID controllers can react poorly to this class of probing.
- LHM has `ForceWakeup` / `TryWakeUp` behavior for sleeping storage devices.
- Refreshing storage devices can return missing/stale values or disturb external
  devices.
- LHM storage identity is source-native and not a safe ShoMetrics persisted disk
  selector.

Therefore, LHM storage is acceptable as explicit catalog metric input,
but not as the first-class Disk widget data source.

## Current Code Risk

The current helper Core has these storage-facing seams:

| File | Current behavior | Required change |
| --- | --- | --- |
| `MetricSourceComparisonProbe.cs` | Already contains native total disk throughput sampling for comparison/probe use. | Extract or reuse the native system-total sampling path for production helper metrics. |
| `LibreHardwareComputerFactory.cs` | Creates a `Computer` with `IsStorageEnabled = true`. | Default helper session must create LHM `Computer` with storage disabled. |
| `LibreHardwareMetricCatalog.cs` | Maps `HardwareType.Storage` throughput sensors to first-class `disk.throughput.*`. | First-class LHM storage metric mapping must be removed from normal catalog output. |
| `LibreHardwareMonitorSession.cs` | Publishes a storage polling group and derives `disk.throughput.total` from LHM read/write. | Normal LHM snapshots/descriptors must not include first-class disk throughput aliases. |
| `metric-source-preferences.ts` | Windows `disk.throughput.*` is currently guarded away from helper routing. | Re-enable routing to `windows-helper` only after the native system-total provider exists. |
| `DiskWidgetSettings` | Disk target UI can imply that volume selection applies to all disk metrics. | Disable the volume selector for throughput and show the system-total/custom-catalog note. |

## Implementation Steps

Landing-order rule:

- The native system-total provider, Hub routing enablement, LHM storage
  disablement, and LHM first-class catalog cleanup must land as one coherent
  change.
- There must be no intermediate state where Windows `disk.throughput.*` routes
  to the helper but neither native system-total nor LHM first-class metrics can
  serve it.
- If the work is split, keep Windows throughput hidden/downgraded until the
  final enabling change.
- Suggested commit shape:
  - one commit containing both steps is acceptable if the diff stays reviewable;
  - if it grows too large, first land the helper-side provider/storage cleanup
    while Windows throughput remains hidden, then land Hub routing and PI
    enablement.
  - each commit must keep tests green. If the helper-side commit lands first,
    tests should assert that Windows throughput remains hidden/downgraded until
    Hub routing and PI enablement land.

### 1. Helper Native Throughput And LHM Storage Boundary

**Expected production size:** 80-220 C# LOC.
**Expected tests:** 100-220 C# test LOC.

Implement one coherent helper-side change:

- add the native Windows system-total throughput reader;
- stop normal LHM storage from producing first-class disk throughput;
- keep diagnostic/probe LHM storage explicit.

Requirements:

#### Native provider

- Use native Windows system-total counters, equivalent to:

  ```text
  \PhysicalDisk(_Total)\Disk Read Bytes/sec
  \PhysicalDisk(_Total)\Disk Write Bytes/sec
  ```

- Prefer extracting the existing native disk sampler from
  `MetricSourceComparisonProbe` instead of creating an unrelated implementation.
- Extracting from `MetricSourceComparisonProbe` means moving counter binding and
  sampling into a long-lived reader. The production reader must follow the
  helper session lifecycle: initialize with the session, reuse counters across
  ticks, and dispose on shutdown.
- Publish these stable metric ids:

  ```text
  disk.throughput.read
  disk.throughput.write
  disk.throughput.total
  ```

- `disk.throughput.total` is `read + write` across all physical disks.
- The first sample may be unavailable while counters warm up. Do not write a
  fake zero unless the native counter reports zero.
- During the first native counter sample, the widget may briefly show `No sensor
  data` through the existing helper-backed widget copy path. This is expected;
  do not add a special warmup grace period.
- Keep this provider independent from LHM storage hardware.
- Do not introduce per-disk descriptors, disk identity registry, or a stored
  throughput disk id.

#### LHM Computer factory

Use named LHM computer creation methods so production and diagnostic behavior
are obvious at the call site:

```csharp
internal static Computer Create()
internal static Computer CreateForDiagnosticProbe()
```

Default helper behavior:

```text
CPU: enabled
GPU: enabled
Memory: enabled
Motherboard: enabled
Network: unchanged for this plan
Storage: disabled
```

- `LibreHardwareComputerFactory.Create()` should use the safe default with
  storage disabled.
- `LibreHardwareComputerFactory.CreateForDiagnosticProbe()` is the path that may
  enable LHM storage for explicit engineering comparison.
- Do not enable LHM storage because a first-class Disk widget exists.
- Do not add a global helper setting or PI toggle for LHM storage in this plan.

#### LHM catalog and session cleanup

- `GetStorageMetricId` should not create first-class `disk.throughput.*` aliases.
- Remove the LHM storage aggregate polling group from the normal polling-group
  snapshot publication path.
- Remove derived `disk.throughput.total` from normal LHM-derived readings and
  descriptors.
- If comparison probe code still needs the old stable names, define them as
  probe-local constants inside the probe owner.
- Do not remove the generic descriptor model; future catalog metric picker work may
  expose LHM storage descriptors only behind an explicit advanced/risk path.

#### Probe migration

- It may call `LibreHardwareComputerFactory.CreateForDiagnosticProbe()` to enable
  LHM storage for comparison.
- `MetricSourceComparisonProbe` owns any probe-local `disk.throughput.*`
  constants moved out of `LibreHardwareMetricCatalog`.
- Probe output must warn that LHM storage reads may wake or disturb disks.
- Service mode and dev pipe mode must not enable LHM storage through the probe
  path.

### 2. Hub Routing And Disk PI Behavior

**Expected production size:** 50-180 TS LOC.
**Expected tests:** 80-180 TS/PI test LOC.

Enable the first-class widget path only after the helper-side native metrics
exist.

Requirements:

- Windows `local:auto` routes `disk.throughput.read`,
  `disk.throughput.write`, and `disk.throughput.total` to `windows-helper`.
- Darwin keeps the existing `node-system` throughput path.
- Do not route these stable ids through LHM storage traversal.
- Do not add a Windows per-disk descriptor registry.
- Do not join Node volumes to helper/LHM/native disk ids.
- When the Disk widget is set to throughput:
  - disable the disk/volume selector;
  - show the current-version system-total note;
  - keep the existing throughput direction choices: read, write, total, both.
- When the Disk widget is set to usage/capacity:
  - keep the existing Node volume selector behavior;
  - do not change volume usage/capacity semantics.
- Keep `volumeId` preserved when switching between usage/capacity and throughput.
  Throughput mode ignores `volumeId` but does not clear it, so switching back to
  usage/capacity restores the user's previous volume selection.
- Per-disk LHM storage sensors remain a future catalog metric path, not a
  first-class Disk widget path.
- Until Advanced Sensor exists, do not show a first-class PI link or instruction
  that sends users looking for it.

## Tests

C# Core tests:

- Native total disk throughput reader returns read/write/total metrics when the
  native counter seam returns valid values.
- Native total disk throughput does not emit a fake first sample before counters
  are ready.
- `LibreHardwareComputerFactory.Create()` disables storage by default.
- The diagnostic factory path can enable storage only when explicitly requested.
- Normal catalog classification does not emit `disk.throughput.read`,
  `disk.throughput.write`, or `disk.throughput.total` from `HardwareType.Storage`.
- Normal LHM descriptor snapshot built from the safe factory has no LHM storage
  first-class throughput descriptors.
- `MetricSourceComparisonProbe` uses the diagnostic factory path when LHM
  storage comparison is explicitly requested.

Hub TS tests:

- Windows `local:auto` routes first-class `disk.throughput.*` to
  `windows-helper` after native provider enablement.
- Darwin `disk.throughput.*` remains on the existing `node-system` path.
- Throughput mode disables the disk/volume selector and shows the system-total
  note.
- Usage/capacity mode still shows and uses the Node volume selector.
- Switching between usage/capacity and throughput preserves the selected
  `volumeId` but ignores it while throughput is active.
- No routing or PI code joins Node volumes to LHM/native disk ids.

Manual validation:

1. Start the helper service or `--dev-pipe`.
2. Request `disk.throughput.read`, `disk.throughput.write`, and
   `disk.throughput.total`.
3. Verify read/write/total move during an explicit disk workload.
4. Verify the values represent system-total disk I/O, not a selected volume.
5. Verify CPU/GPU helper metrics still appear.
6. Request a complete normal descriptor preload and verify no first-class
   descriptor has LHM storage hardware identity.
7. Verify the Disk PI throughput mode disables the volume selector and shows the
   explanatory note.
8. Plug in an external USB drive or USB enclosure before starting the helper.
   Verify helper startup does not enumerate, refresh, or reset the external
   device, and that no LHM storage descriptors mention it.

## Size Guard

Expected production-code size:

- 80-220 C# LOC for native system-total sampling, LHM storage disablement, and
  catalog/session cleanup.
- 50-180 TS LOC for routing, PI text/control state, and focused tests.

If this grows beyond about 350 C# production LOC or 250 TS production LOC, stop
and review. That likely means the work has drifted into per-disk identity,
descriptor registries, native disk selectors, or cross-layer disk identity
joining.

## Non-Goals

- No first-class per-physical-disk throughput selector.
- No native disk identity registry.
- No `windows-native.disk:<id>.throughput.*` metric id family in this plan.
- No Node volume to LHM/native disk identity join.
- No LHM disk throughput as the default first-class widget source.
- No broad LHM storage traversal, SMART reads, temperature reads, health reads,
  or eager drive probing from ordinary widgets.
- No hidden wake/probe behavior from creating a Disk widget.
- No catalog metric picker implementation in this plan.
- No PI instruction that points users to the catalog metric picker before it
  exists.

## Completion Criteria

This plan is complete when:

- Windows first-class Disk throughput shows system-total read/write/total from a
  native helper provider;
- the PI clearly says throughput is total system disk I/O and disables the disk
  list for throughput;
- normal first-class helper descriptor/sample paths do not use LHM storage;
- custom/per-disk LHM storage remains an explicit advanced path with risk copy;
- macOS disk throughput behavior remains unchanged.
