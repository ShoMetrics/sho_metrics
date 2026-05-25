# LHM Storage Reading Implementation Plan

This plan makes LHM storage access safe by default. It is written for a coding
agent with no conversation context.

Read this after:

1. [Windows Source Latency Findings](../02-source-routing/01-windows-source-latency-findings.md)
2. [LibreHardwareMonitor Desktop Source Reading](01-lhm-desktop-source-reading.md)
3. [Helper Source Reliability Implementation Plan](02-helper-source-reliability-implementation-plan.md)

## Objective

Prevent the normal Windows helper service from using broad LHM storage traversal.
Disk throughput, disk identity, and disk metadata must not depend on LHM storage
hardware reads in the first-class widget path.

This is not the Windows native disk throughput implementation. Native per-disk
throughput belongs to the provider plan in
[Helper Source Reliability Implementation Plan](02-helper-source-reliability-implementation-plan.md)
Batch 4.

## Product Decisions

| Decision | Product reason | Implementation meaning |
| --- | --- | --- |
| LHM storage is disabled in the normal helper path. | Storage reads can wake or disturb disks; users do not expect a widget to probe sleeping storage. | `LibreHardwareMonitorSession` must not open LHM storage hardware by default. |
| Windows disk throughput is native-provider only. | Users expect "which disk?", and LHM storage traversal does not give ShoMetrics a validated safe identity/selector path. | Do not map LHM storage sensors to `disk.throughput.*` stable metrics. |
| Disk usage/capacity stays OS volume metadata. | Usage/capacity are filesystem/volume facts, not high-frequency sensor telemetry. | Keep current Node/systeminformation path unless a future native volume provider replaces it deliberately. |
| LHM storage may exist only in explicit diagnostics. | Engineers may still need to compare LHM and native disk readings. | Any LHM storage probe must be opt-in, named as risky, and outside the service's default descriptor/sample path. |
| Sleeping-drive behavior is explicit. | Hidden disk wakeups are hostile UX and can shorten drive sleep time. | No widget, PI panel, or descriptor preload may wake disks implicitly. |

## Current Code Risk

The current helper Core has these storage-facing seams:

| File | Current behavior | Required change |
| --- | --- | --- |
| `LibreHardwareComputerFactory.cs` | Creates a `Computer` with `IsStorageEnabled = true`. | Default helper session must create LHM `Computer` with storage disabled. |
| `LibreHardwareMetricCatalog.cs` | Maps `HardwareType.Storage` throughput sensors to `disk.throughput.read/write`. | First-class LHM storage metric mapping must be removed from normal catalog output. |
| `LibreHardwareMonitorSession.cs` | Publishes a storage polling group and derives `disk.throughput.total` from LHM read/write. | Normal snapshots/descriptors must not include LHM disk throughput aliases. |
| `MetricSourceComparisonProbe.cs` | Contains comparison/probe logic for LHM and native disk throughput. | Keep probe-only code explicit; do not let probe constants define service behavior. |
| `metric-source-preferences.ts` | Windows first-class disk throughput is no longer routed to helper. | Keep this guard and tests. It is necessary but not sufficient while LHM storage remains enabled. |

## Implementation Steps

1. Split LHM computer creation options.

   Add an explicit options type near `LibreHardwareComputerFactory`:

   ```csharp
   internal sealed record LibreHardwareComputerOptions
   {
       public bool EnableStorage { get; init; }
   }
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

   Requirements:

   - `LibreHardwareComputerFactory.Create()` should use the safe default with
     storage disabled.
   - Add a clearly named opt-in factory path for diagnostics, for example
     `CreateForDiagnosticProbe(enableStorage: true)`.
   - Do not add a global setting or PI toggle in this plan.
   - Do not make storage depend on whether a disk widget exists.

2. Remove LHM storage aliases from the normal catalog.

   Update `LibreHardwareMetricCatalog` so normal descriptor/sample generation no
   longer publishes these first-class ids from LHM storage sensors:

   ```text
   disk.throughput.read
   disk.throughput.write
   disk.throughput.total
   ```

   Requirements:

   - `GetStorageMetricId` should not create first-class disk throughput aliases
     for the service path.
   - `HardwareType.Storage` should not be part of normal helper-owned stable
     alias output.
   - If probe code still needs these names, move them into probe-local constants
     or a clearly named diagnostic-only owner.
   - Do not remove the generic descriptor model; future advanced catalog work may
     still expose storage descriptors after an explicit opt-in design.

3. Remove service snapshot/polling support for LHM disk throughput.

   Update `LibreHardwareMonitorSession`:

   - Remove the storage aggregate polling group from the normal polling-group
     snapshot publication path.
   - Remove derived `disk.throughput.total` from normal LHM-derived readings and
     descriptors.
   - Ensure full descriptor preload does not contain LHM storage descriptors when
     using the safe factory default.
   - Keep CPU/GPU/memory/motherboard behavior unchanged.

4. Keep comparison/probe support explicit.

   If LHM storage readings are still useful for engineering comparison, keep
   them only behind a deliberate probe flag.

   Requirements:

   - The flag name must say what it does, for example
     `--include-lhm-storage`.
   - Probe output should print a warning that LHM storage reads may wake or probe
     disks.
   - The Windows service and dev pipe modes must not enable this flag.
   - Probe constants must not be imported by normal service/catalog code.

5. Keep Hub routing and PI guarded.

   Hub work should be small in this plan.

   - Keep Windows `disk.throughput.*` hidden/downgraded until native per-disk
     descriptors exist.
   - Keep Windows `local:auto` from routing first-class disk throughput to
     `windows-helper`.
   - Do not add a Windows throughput selector in PI from this plan.
   - Do not join Node volumes to LHM storage ids.

## Tests

Add focused tests. Do not rely only on manual hardware behavior.

C# Core tests:

- `LibreHardwareComputerFactory.Create()` disables storage by default.
- The diagnostic factory path can enable storage only when explicitly requested.
- Normal catalog classification does not emit `disk.throughput.read`,
  `disk.throughput.write`, or `disk.throughput.total` from `HardwareType.Storage`.
- Normal descriptor snapshot built from the safe factory has no storage hardware
  descriptors.
- Probe-only constants, if kept, are not used by the normal service catalog.

Hub TS tests:

- Windows disk throughput remains unavailable/downgraded in resolved settings.
- Windows `local:auto` does not route first-class `disk.throughput.*` to
  `windows-helper`.
- Darwin `disk.throughput.*` remains on the existing `node-system` path.

Manual validation:

1. Start the helper service or `--dev-pipe`.
2. Request a complete descriptor preload.
3. Verify no descriptor has `hardware_type`/source identity corresponding to LHM
   storage hardware.
4. Verify CPU/GPU helper metrics still appear.
5. Run the explicit probe flag separately if needed, and record that it is not
   used by the service mode.

## Size Guard

Expected production-code size:

- 120-260 C# LOC for factory options, catalog/session cleanup, and optional
  probe flag wiring.
- 0-80 TS LOC, mostly comments/tests around existing routing guards.

If this grows beyond about 400 C# production LOC or 150 TS production LOC, stop
and review. That likely means the work has drifted into native disk throughput,
advanced catalog selection, or cross-layer disk identity joining.

## Non-Goals

- No native Windows disk throughput provider.
- No disk throughput PI selector.
- No all-disk aggregate metric.
- No LHM SMART, temperature, health, or storage-capacity widgets.
- No advanced catalog picker.
- No helper/user setting for storage probing.
- No hidden wake/probe behavior.

## Completion Criteria

This plan is complete when normal helper descriptor and sample paths cannot
touch LHM storage hardware, while CPU/GPU helper-owned metrics continue to work
and explicit diagnostic probes remain possible without being part of service
behavior.
