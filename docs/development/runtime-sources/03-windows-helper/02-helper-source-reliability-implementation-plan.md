# Helper Source Reliability Implementation Plan

This plan turns the source-reading findings into implementation work. It is
written for a new coding session with no conversation context.

Read this after:

1. [Windows Source Latency Findings](../02-source-routing/01-windows-source-latency-findings.md)
2. [LibreHardwareMonitor Desktop Source Reading](01-lhm-desktop-source-reading.md)
3. Optional internal reference:
   `.agents/skills/technical-deisn-doc/references/litemonitor-prior-art-signals.md`

## Objective

Make helper-owned first-class metrics reliable enough for ordinary users:

- CPU temperature and CPU power should behave like simple built-in metrics.
- Raw LHM catalog metrics should not flicker to no-data on isolated null ticks.
- Helper unavailable states should be explainable without exposing users to
  pipe, driver, descriptor, or sensor jargon.
- Disk throughput must not be enabled through broad LHM storage probing.

This is not a rewrite of Phase 5c demand-driven collection. Keep the existing
registry, planner, supervisor, runner, store, fallback reader, and PI runtime
cache boundaries.

## Product Decisions

| Decision | Product reason | Implementation meaning |
| --- | --- | --- |
| Normal widgets show only three helper no-data labels. | Users need an action, not a source-state taxonomy. | Use `Helper required`, `Helper error`, or `No sensor data` on keys. Put detailed status in DEBUG only. |
| Stable aliases and catalog metrics use the same short last-good rule. | A raw catalog metric flickering between `51 C`, no value, and `50 C` is still a bad user experience. | Apply bounded source-side retention to all LHM scalar metrics. Stable aliases may switch to another ranked sensor; catalog ids may only retain the same raw sensor. |
| Do not oversample LHM to hide null ticks. | LHM itself does not secretly run faster than the selected UI interval; it formats null as `-` and relies on UI/history behavior. | Keep normal helper polling cadence. Add a bounded retention policy instead of a second hidden sampling loop. |
| Retained samples are not fresh history samples. | A retained value is a display continuity choice, not a new hardware read. | `MetricStore` may use a retained value for current/progress display, but rolling history should append only fresh scalar samples. |
| CPU temperature is a helper-owned stable alias. | Ordinary users expect "CPU temperature", not a choice between package, Tctl, Tdie, CCD, and individual core sensors. | The helper ranks and selects the source sensor. Hub must not parse raw LHM ids. |
| CPU power means CPU package/socket total power. | Hardware users generally expect whole-CPU package/socket power, not graphics, DRAM, platform, or SoC rails. | Rank package/socket total first; only use an existing aggregate CPU-cores power fallback when no total-like sensor exists. Do not synthesize a sum from individual core sensors in this plan. |
| CPU usage remains an OS aggregate metric. | LHM CPU load has source-cost and metric-definition traps; Task Manager semantics require explicit OS counter choices. | Do not route `cpu.usage_percent` through LHM. Future Windows native CPU usage should document `% Processor Utility` semantics. |
| Disk throughput is handled in its own plan. | First-class Windows disk throughput should be system-total native I/O; per-disk LHM storage belongs to custom catalog with risk copy. | Do not enable Windows disk throughput through LHM. Re-enable stable `disk.throughput.*` only through the native system-total provider. |
| Multi-GPU hardware selection is not in this batch. | Source choice and hardware choice are separate concepts; mixing them would confuse the PI model. | Keep current source selector work. Add hardware selector later when descriptor-backed hardware choices are ready. |

## Evidence Mapping

| Source | Relevant finding | Plan impact |
| --- | --- | --- |
| `08` Section 3, Sensor Current Value, History, And Null Semantics | `Sensor.Value` can be null; LHM UI formats null as `-`; `Sensor.Values` is history, not current sample truth. | Treat null as normal source state. Do not write null samples. Do not use LHM history as Stream Deck history. |
| `08` Section 7, CPU And GPU Metrics | CPU-family temperature rules belong near LHM, not in Hub. | CPU stable aliases are selected in the Windows helper. |
| `08` Section 8, Storage And Network | Storage metadata and throughput have different cadences; storage can wake/probe disks. | Do not route first-class disk throughput through generic LHM traversal. |
| `08` Section 10, Motherboard, Controllers, Memory, Battery, And PSU | Board/controller values have chip-specific null/range rules. | Keep raw sensors advanced/catalog first; do not promote more stable aliases without source-owned ranking and diagnostics. |
| `08` Section 12, LiteMonitor Cross-Check | LiteMonitor adds last-valid maps, caches, and metric-key facade over LHM. | Adopt bounded source-side last-good; reject unbounded global last-valid maps. |
| `09` What To Adopt 1, Source-Owned Stable Alias Ranking | LiteMonitor maps raw sensors to app-level keys using source-owned rules. | Implement CPU stable alias ranking in C# helper/Core. |
| `09` What To Adopt 3, Driver/Helper Readiness Needs Its Own Status Layer | Driver/helper readiness differs from no sample. | Add cached helper install/service/driver/status diagnostics separate from MetricStore samples. |
| `09` What To Adopt 4, CPU Usage Needs An Explicit Definition | Task Manager uses `% Processor Utility`; LHM total load is not a ShoMetrics default. | Keep CPU usage on `node-system` or future Windows native, not LHM. |
| `09` What To Adopt 5, Disk Probing Must Stay Conservative | Disk monitoring can disturb external storage. | Keep first-class disk throughput off LHM storage. Use native system-total counters for the ordinary widget and custom catalog for explicit LHM per-disk sensors. |
| `09` What To Experiment With 1, Bounded Last-Good Caching | Last-good helps flicker but can hide dead sensors if unbounded. | Use a short TTL with DEBUG attribution. |
| `09` What To Reject | Reject unbounded last-valid, raw LHM id parsing in Hub, broad disk probing, pipe failure as install status. | Keep all new behavior bounded and owned by the source/helper boundary. |

## Current Code Seams

Use these existing seams instead of creating a new central owner:

| Owner | Current file or type | Keep responsibility |
| --- | --- | --- |
| Windows Core source mapping | `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardwareMetricCatalog.cs` and `LibreHardwareMonitorSession.cs` | LHM traversal, raw sensor ids, stable alias ranking, value validation, short retention. |
| IPC contract | `contracts/proto/shometrics/v1/source_api.proto` and `snapshot.proto` | Snapshot, descriptor, warning, and health wire shape. |
| Hub source client | `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-client.ts` | Named-pipe requests, backoff, descriptor cache, cached source status. |
| Source routing | `packages/hub/src/runtime/source-routing/metric-source-preferences.ts` | Static `local:auto` source order for stable built-in metric keys. |
| Metric history | `packages/hub/src/runtime/metric-store.ts` | Per-source rolling history and latest sample attribution. Do not add helper health state here. |
| Fallback decision | `packages/hub/src/runtime/metric-collection/fallback-composer.ts` | Selects the fresh source sample and returns `MetricWidgetDataReadResult`. Do not duplicate this decision in PI. |
| Action widget copy | `packages/hub/src/actions/shared/helper-backed-widget-data.ts` and action files | Converts helper source status into friendly no-data copy. |
| PI diagnostics | `packages/hub/src/property-inspector/panels/MetricSourceDiagnostic.tsx` | Shows DEBUG-only details from `WidgetRuntimeCache.displayedMetricReadAttribution`. |

## Implementation Batches

Each implementation batch should compile and test on its own. Do not add
temporary compatibility paths that the next batch immediately deletes.

Batch 1 has Core/source and wire/status subheadings because it crosses several
owners. Implement those subheadings together; retained-sample diagnostics must
have a real attribution wire and Hub ingest path in the same change.

### Batch 1: Helper Source Reliability, Diagnostics Wire, And Readiness

**Maps to:** `08` Section 3, Section 7, Section 10, Section 12; `09` What To
Adopt 1, What To Adopt 3, What To Experiment With 1, P0 Split Helper Status
From Metric Status, and What To Reject.

**Why this batch exists:** The current helper can observe a real sensor one tick,
then no value the next tick. Publishing that as user-visible no-data creates
flicker. Stable aliases also need product-owned meaning, not the first LHM
sensor that happens to match. A missing named pipe also does not prove whether
the helper was never installed, is installed but stopped, is starting, or is
blocked by a driver/protocol failure.

#### Core Metric Semantics

1. Replace the current stable-only `CachedStableAliasReading` behavior with a
   bounded helper-side retained-sample cache that can serve both stable aliases
   and raw catalog metrics.

   Required policy:

   ```text
   retention window: 3 source ticks
   current 1 Hz helper cadence: about 3 seconds

   stable alias:
     choose the best fresh ranked candidate;
     if none is fresh, use the last retained sample for that stable alias when
     it is still within the retention window;
     otherwise omit the metric from the snapshot.

   source catalog metric:
     use the requested raw sensor when it has a valid current value;
     if it is invalid/null, use only that same raw sensor's retained sample when
     it is still within the retention window;
     never switch a catalog metric to another raw sensor.
   ```

   Do not emit a scalar `0`, NaN, infinity, or null-equivalent sample to encode
   missing data. Omit the metric and report unavailable metrics separately.

2. Keep retention local to the Windows Core source. Do not put this cache in
   Hub `MetricStore`; `MetricStore` remains user-facing history.

   The retention key spaces must stay separate:

   ```text
   stable alias retention:
     key = stable metric id, for example "cpu.temp"
     value = last selected fresh raw sensor reading plus raw sensor id

   source catalog retention:
     key = source sensor id, for example "lhm.sensor:/intelcpu/0/temperature/..."
     value = last fresh reading for that exact raw sensor only
   ```

   Do not let a catalog metric collide with a stable alias id, and do not let a
   catalog metric reuse a retained value from another raw sensor.

3. Add source-owned diagnostic fields in the Core model before IPC mapping.
   Use a small value-state enum in Core, for example:

   ```csharp
   internal enum HardwareMetricValueState
   {
       Fresh,
       Retained,
   }
   ```

   Missing states such as no sensor, invalid value, and expired retention are
   absence diagnostics, not value states. They should not pretend a scalar
   sample exists.

4. CPU temperature stable alias ranking must be deterministic and source-owned.
   Sort candidates by rank, then `HardwareId`, then `SensorId`.

   Required rank order:

   ```text
   Intel/common:
     0. "CPU Package"
     1. package-like temperature names
     2. "Core Max"
     3. "Core Average"
     4. individual core temperatures

   AMD Zen/common:
     0. "Core (Tctl/Tdie)"
     1. "Core (Tdie)"
     2. "CCDs Max (Tdie)"
     3. "Core (Tctl)"
     4. "CCDs Average (Tdie)"
     5. legacy "CPU Cores" or max individual core temperatures
   ```

   Exclude SoC, VRM, fan, pump, liquid, coolant, distance-to-TjMax, and
   motherboard/controller temperatures from `cpu.temp`.

5. CPU power stable alias means CPU package/socket total power.

   Required rank order:

   ```text
   0. exact package/socket total CPU power sensors
   1. package-equivalent CPU PPT / CPU package power sensors
   2. existing aggregate CPU cores power sensors, only if no total-like sensor exists
   ```

   Exclude CPU graphics, GPU, SoC, DRAM, memory controller, platform, VRM, and
   PSU rails from `cpu.power`.

   Do not add arithmetic per-core summing in this plan. A raw sensor named like
   `CPU Core #1` is not enough to infer a safe package-power total. If a future
   implementation wants arithmetic core summing, it needs a separate validation
   pass.

6. Validation must be broad and source-owned:

   ```text
   temperature: non-null and finite; rely on LHM source code for chip-specific sentinel/null handling
   power: non-null, finite, and >= 0
   catalog scalar: finite and valid for its LHM sensor type
   ```

   Do not add a new CPU temperature upper/lower bound in this plan, and do not
   copy LiteMonitor's exact thresholds. Add numeric thresholds only after
   ShoMetrics diagnostics prove a concrete invalid-value pattern.

7. Descriptor selection and runtime sample selection may differ briefly. A
   descriptor has no current value; it can identify the best planning sensor
   while runtime falls back to another ranked fresh sensor. Leave a comment at
   the descriptor selection point explaining this.

**Suggested code shape:**

```csharp
internal readonly record struct RetainedHardwareMetricSample(
    MetricReading Reading,
    DateTimeOffset CapturedAt,
    string SourceSensorId);

internal sealed class HardwareMetricRetentionCache
{
    public void RecordFresh(MetricReading reading, DateTimeOffset capturedAt);

    public bool TryReadFreshOrRetained(
        string metricId,
        string sourceSensorId,
        DateTimeOffset now,
        out MetricReading reading,
        out TimeSpan retainedAge);
}
```

If a simpler same-file helper in `LibreHardwareMonitorSession.cs` keeps the
ownership clearer, use that instead of a new class. Do not make a reusable
framework for unrelated sources.

**Tests:**

- Add a small C# test project for pure Core helpers if one does not exist. Test
  ranking and retention without opening real LHM hardware.
- CPU temperature rank chooses package/Tdie/Tctl/core in the required order.
- CPU power rank chooses package/socket total before aggregate-cores fallback and
  rejects graphics/SoC/DRAM names.
- A single null tick returns a retained sample for both stable aliases and a raw
  catalog metric.
- Retained samples expire after 3 source ticks.
- Catalog metrics never switch to a different raw sensor during retention.

**Estimate:** 350-700 C# LOC, 180-350 C# test LOC.

#### Wire, Source Status, And No-Data Diagnostics

Widgets should stay simple, but DEBUG needs enough facts to support a user
report.

1. Keep the widget-facing no-data labels to exactly:

   | Widget label | Meaning |
   | --- | --- |
   | `Helper required` | No reachable helper is known for a helper-only metric and no stronger installed-but-failed state is known. |
   | `Helper error` | Helper was installed, previously reachable, or otherwise expected, but the request/health/driver/protocol path failed. |
   | `No sensor data` | Helper is reachable, but no valid matching sensor sample is available after source-side ranking and retention. |

2. Add a helper readiness/status layer outside `MetricStore`.

   In Hub TypeScript, extend the existing `SourceClientStatus` contract instead
   of inventing another PI-only model. Keep it JSON-safe because it flows to
   the PI runtime cache.

   Suggested extension:

   ```ts
   export type SourceClientStatusReason =
       | "pipeMissing"
       | "timeout"
       | "healthFailed"
       | "sourceError"
       | "protocolMismatch"
       | "helperNotInstalled"
       | "helperStopped"
       | "driverUnavailable";
   ```

   Add optional diagnostic strings only where they are stable and useful:
   `lastErrorCode`, `lastErrorMessage`, `helperVersion`, `protocolVersion`.
   Populate `helperVersion` and `protocolVersion` only from the helper
   handshake or `GetSourceHealth` response. Do not add version comparison UI in
   this batch.
   Do not add `noSensorData` to `SourceClientStatusReason`; no-sensor is a
   per-metric missing diagnostic, not a source-client availability state.

3. Add value attribution and unavailable-metric reports beside source snapshots
   without polluting `MetricSnapshot`.

   Do not add source ids, helper status, raw LHM sensor ids, or retained-state
   flags to `snapshot.proto` `MetricValue`. Snapshots remain source-agnostic
   values. Add source-specific metadata to `source_api.proto`
   `ReadMetricSnapshotResponse` instead.

   ```proto
   message MetricValueAttribution {
     string metric_id = 1;
     RawSensorIdentity raw_sensor_identity = 2;
     MetricValueFreshness value_freshness = 3;
     optional uint32 retained_age_milliseconds = 4;
   }

   enum MetricValueFreshness {
     METRIC_VALUE_FRESHNESS_UNSPECIFIED = 0;
     METRIC_VALUE_FRESHNESS_FRESH = 1;
     METRIC_VALUE_FRESHNESS_RETAINED = 2;
   }

   message MetricUnavailableReport {
     string metric_id = 1;
     MetricUnavailableReason reason = 2;
     RawSensorIdentity raw_sensor_identity = 3;
   }

   enum MetricUnavailableReason {
     METRIC_UNAVAILABLE_REASON_UNSPECIFIED = 0;
     METRIC_UNAVAILABLE_REASON_NO_SENSOR = 1;
     METRIC_UNAVAILABLE_REASON_INVALID_VALUE = 2;
     METRIC_UNAVAILABLE_REASON_EXPIRED = 3;
   }

   message RawSensorIdentity {
     string source_sensor_id = 1;
     string hardware_id = 2;
     string hardware_name = 3;
     string hardware_type = 4;
     string sensor_name = 5;
     string source_sensor_type = 6;
   }
   ```

   Add this to `ReadMetricSnapshotResponse`:

   ```proto
   repeated MetricValueAttribution value_attributions = 4;
   repeated MetricUnavailableReport unavailable_metrics = 5;
   ```

   `MetricValueAttribution.metric_id` must match a key in
   `MetricSnapshot.metrics` for the same response. `MetricUnavailableReport`
   is mainly DEBUG/support metadata for a requested metric omitted from
   `MetricSnapshot.metrics`; Hub must still derive the missing fact from the
   request/result shape it owns. A metric id should appear in exactly one of
   `value_attributions` or `unavailable_metrics` in a response, never both.

   Do not add a free-form `diagnostic_reason` string. DEBUG text should be
   derived in Hub from typed fields such as `MetricUnavailableReason`, the
   metric id, and raw sensor identity when present.

   Helper and plugin versions are separate programs and will inevitably be out
   of sync for some users. Treat source IPC as a cooperative but version-skewed
   wire contract:

   ```text
   unknown future MetricValueFreshness:
     normalize to retained/display-only in the source adapter;
     warn at low frequency;
     do not append to MetricStore history.

   unknown future MetricUnavailableReason:
     keep it as DEBUG/support metadata;
     render the same generic No sensor data path;
     do not treat it as helper/source health.

   malformed descriptor or orphan attribution:
     drop that record with a low-frequency support log;
     do not reject the entire helper response unless the response itself is unusable.
   ```

   After editing proto, run the repo proto format/build/lint scripts and update
   both generated TypeScript and C# code. Generated wire messages may be used in
   the source adapter and the `runtime/sources/source-client.ts` facade. Do not
   import generated source-api messages into actions, rendering, PI components,
   or settings code.

   Then change the TypeScript source-client boundary from "snapshot only" to a
   small read result:

   ```ts
   export interface SourceSnapshotReadResult {
       readonly snapshot: MetricSnapshot;
       readonly valueAttributions: readonly MetricValueAttribution[];
       readonly unavailableMetrics: readonly MetricUnavailableReport[];
   }

   // Keep these runtime source contracts aligned with source_api.proto.
   // Prefer generated-proto-derived payload types over hand-written mirrors,
   // with adapter normalization for version-skewed enum values.
   export type MetricValueAttribution = ...;
   export type MetricUnavailableReport = ...;
   ```

   `SourceClient.readSnapshot()` should return `Promise<SourceSnapshotReadResult>`.
   `createMetricSourceClient()` wraps existing Node sources by returning an
   empty `valueAttributions` array and an empty `unavailableMetrics` array. Do
   not add a second read method.

   `CollectorGroupRunner` should pass the snapshot, value attributions, and
   unavailable reports to `MetricStore.ingest(...)`.

   `MetricStore` behavior:

   - fresh scalar/text samples append to history and update latest display data;
   - retained scalar samples update latest display data and attribution, but do
     not append a new point to rolling history;
   - unavailable reports update latest DEBUG/support state only and do not
     mutate current value, progress, or history.

   This keeps retained values visible without turning them into fake history
   samples.

4. Add a Windows helper installation/service probe without adding another
   long-lived process.

   Required behavior:

   - In packaged production, use the service identity from
     `packages/source-windows/ShoMetrics.Source.Windows.Ipc/WindowsSourceServiceConstants.cs`
     (`ServiceName = "ShoMetrics Source Windows"`) to distinguish at least
     `notInstalled`, `installedStopped`, and `running`.
   - Cache this probe result for 30 seconds while helper-backed demand is
     active. Probe immediately when demand first appears and when a helper
     request changes from success to `pipeMissing`.
   - Do not run the service probe on every render or every source sample.
   - In dev-pipe mode, if the helper has succeeded once in the current Hub
     session, later `pipeMissing` means `Helper error`, not `Helper required`.
   - If the helper has never succeeded and no install/service state is known,
     use `Helper required`.

   Do not block rendering while probing install status. Probe results refine
   diagnostics when available.

5. Fix helper retry behavior for active helper demand.

   Required behavior:

   ```text
   no helper-backed subscription -> at least one helper-backed subscription:
     retry pipe/descriptor discovery quickly for the first 60 seconds
     then use steady-state cooldown

   helper was running and disappears:
     do not wait 5 minutes before trying again
     retry on the helper-active path using the same startup window policy
   ```

   Reuse the intent of the existing descriptor-preload retry window. Do not
   create a second unrelated long-cooldown policy that can strand widgets on
   `Helper required`.

   The 60-second fast window is edge-triggered per Hub session transition from
   zero helper-backed subscriptions to one or more helper-backed subscriptions.
   Do not restart the window for every planner reconcile, settings refresh, or
   same-demand resubscription. Close the window immediately after a successful
   helper request.

6. Expose metric-specific no-sensor diagnostics.

   When the helper can serve requests but `cpu.temp` or `cpu.power` has no
   valid fresh or retained sample, mark the metric as `No sensor data` for
   widget copy and expose DEBUG details such as selected alias, candidate count,
   last invalid reason, or last retained age if known.

**Tests:**

- Non-Windows missing Windows helper source status does not produce
  `Helper required`; widgets fall back to ordinary `N/A`.
- First-session `pipeMissing` for a helper-only metric maps to
  `Helper required`.
- `pipeMissing` after a successful helper request maps to `Helper error`.
- Reachable helper with no CPU temperature candidates maps to `No sensor data`.
- Active helper demand retries in the fast 60-second window instead of keeping
  a long pipe-missing cooldown.

**Estimate:** 450-850 TS LOC, 220-420 TS test LOC, 400-700 C#/proto/IPC LOC.

### Batch 2: Hub Attribution, Widget Copy, And PI DEBUG

**Maps to:** `09` P0/P1 follow-ups; `08` Section 12 experiment requirement to
record source id, raw sensor id, sample age, and fresh-vs-retained state.

**Why this batch exists:** Debugging should not require reading every layer from
settings to source client. The runtime should expose the same source decision
that rendering actually used, plus helper-specific details when available.

**Implement:**

1. Do not duplicate fallback selection. Keep attribution attached to the
   existing render-path read result:

   ```ts
   interface MetricWidgetDataReadResult {
       readonly widgetData: WidgetData;
       readonly selectedSourceId: string | undefined;
       readonly valueAttribution?: MetricValueAttribution;
       readonly unavailableMetric?: MetricUnavailableReport;
   }

   interface MetricValueAttribution {
       readonly metricKey: string;
       readonly sourceId: string;
       readonly sourceSensorId?: string;
       readonly hardwareId?: string;
       readonly sensorName?: string;
       readonly hardwareName?: string;
       readonly valueState?: "fresh" | "retained";
       readonly retainedAgeMilliseconds?: number;
   }
   ```

   If the existing implementation already publishes
   `WidgetRuntimeCache.displayedMetricReadAttribution`, extend that object
   instead of adding a parallel cache.

   `MetricStore.forScope(...).getWidgetDataWithAttribution()` should return the
   latest value attribution stored during ingest when the sample is present.
   When the selected source has no emitted sample, DEBUG may use the latest
   unavailable report. `fallback-composer.ts` then forwards the metadata from
   the selected source without recomputing source fallback.

2. Preserve boundary ownership:

   - Source clients may attach source-owned attribution and unavailable-metric
     metadata to read results.
   - `fallback-composer.ts` chooses which source sample wins.
   - `MetricAction` publishes the displayed metric attribution to
     `WidgetRuntimeCache`.
   - PI reads `WidgetRuntimeCache` only. PI must not re-run fallback or parse
     raw LHM ids.

3. All widgets may show DEBUG details. Source selectors remain metric-specific.

   DEBUG section:

   ```text
   DEBUG
   [ ] Show debug

   Current source: Helper / Built-in / none
   Preferred source: Helper / Built-in / Auto
   Last sample age: 0.8s / 3s / none
   Helper status: Ready / Required / Error
   Sensor: CPU Package (/intelcpu/0/temperature/...)
   Metric: fresh / retained 1s / no sensor data / invalid value / expired
   ```

   In development builds, default `Show debug` to checked. In production,
   default unchecked. Keep this as component state unless a real product need
   appears for persistence.

   Use the existing PI build flag `__BUILD_MODE__` for the development default.
   Keep DEBUG copy as non-localized English diagnostic text unless the PI gains
   a real i18n layer. Do not introduce an i18n framework for DEBUG-only copy.

4. Last sample age formatting:

   ```text
   < 1 second: one decimal place, for example 0.7s
   >= 1 second: integer seconds, for example 3s
   none: none
   ```

   Do not format local timestamps. This avoids timezone/locale questions and
   still answers freshness.

5. Widget copy:

   - `helper-backed-widget-data.ts` should return `Helper required`,
     `Helper error`, `No sensor data`, or no custom unavailable copy.
   - `undefined` helper status on platforms without a helper must not become
     `Helper required`.
   - GPU, CPU, and future helper-backed first-class widgets should use the same
     helper-backed no-data helper.

**Tests:**

- Fallback reader attribution matches the source that produced the rendered
  `WidgetData`.
- DEBUG displays source, sample age, helper status, sensor, and retained state
  from runtime cache without recomputing fallback.
- Development build defaults DEBUG open; production defaults closed.
- Age formatting has decimals only below 1 second.
- Non-Windows stale GPU remains ordinary `N/A`, not `Helper required`.

**Estimate:** 250-550 TS LOC, 180-350 TS/PI test LOC.

### Batch 3: Remove LHM Disk Throughput From First-Class Routing

**Maps to:** `05` Source Decisions for disk throughput, `08` Section 8,
`09` What To Adopt 5, `09` Issue Signal #455.

**Why this batch exists:** Earlier routing work prepared Windows disk throughput
as helper-only through the Windows helper. The later product decision is
stricter: first-class disk throughput must not come from LHM storage traversal.
A hidden route that nobody can select is still misleading maintenance debt.

**Implement:**

1. Remove `disk.throughput.read`, `disk.throughput.write`, and
   `disk.throughput.total` from `WINDOWS_HELPER_ONLY_METRIC_KEYS`.

2. Keep Windows disk throughput hidden/downgraded in resolver and PI until the
   native system-total provider is enabled.

3. Keep Node/macOS disk throughput behavior unchanged.

4. If LHM still exposes raw storage throughput descriptors, treat them as
   source catalog metrics only. They must not appear as first-class disk widget
   options.

5. Add a comment near disk routing explaining the product decision:

   ```text
   Windows disk throughput waits for a native system-total provider. Do not
   route first-class disk throughput through LHM storage traversal.
   ```

**Tests:**

- Windows `local:auto` no longer resolves stable disk throughput keys to
  `windows-helper`.
- Windows disk throughput remains unavailable in resolved settings/PI until the
  native system-total provider is enabled.
- Darwin disk throughput still uses `node-system` where the existing Node path
  supports it.

**Estimate:** 40-100 TS LOC, 50-120 test LOC.

### Batch 4: Windows Disk Throughput Plan

The full disk read/write speed plan now lives in
[Windows Disk Throughput Implementation Plan](03-lhm-storage-reading-implementation-plan.md).

Keep this document focused on helper-owned CPU/power reliability. Disk
throughput has its own plan because it spans LHM storage safety, native Windows
system-total counters, custom catalog risk copy, and Disk action subscriptions.

## Verification Matrix

Run these before considering the work complete:

| Case | Expected result |
| --- | --- |
| Helper never installed or no known helper in dev | Helper-only widget shows `Helper required`; DEBUG says pipe/helper unavailable. |
| Helper was reachable, then stopped | Widget shows `Helper error`; retry recovers without Stream Deck restart. |
| Helper reachable but CPU temp has no matching sensor | Widget shows `No sensor data`; DEBUG shows no matching sensor/candidate detail. |
| CPU temp reads `51 C`, then one null tick, then `50 C` | Widget continues showing a retained value for the null tick, then fresh value; DEBUG shows retained state only during the retained tick. |
| Raw catalog sensor reads value, then null within 3 source ticks | Same raw sensor may retain; it does not switch to another sensor. |
| Raw catalog sensor stays null beyond 3 source ticks | Widget becomes no-data. |
| CPU package temp invalid but core max valid | Stable `cpu.temp` falls back to the next ranked valid CPU sensor. |
| CPU package power absent but aggregate CPU-cores power exists | Stable `cpu.power` uses documented aggregate-cores fallback and DEBUG identifies it. |
| macOS/Linux GPU stale | Shows ordinary `N/A`; never says `Helper required`. |
| Windows disk throughput settings before native provider enablement | Still hidden/downgraded; no first-class helper-only route. |

## Manual Diagnostics To Capture

For at least one Windows machine with LHM CPU sensors:

1. Run helper for 5 minutes with CPU temperature selected.
2. Log every tick where `cpu.temp` is fresh, retained, omitted, or switched to a
   fallback sensor.
3. Record selected raw sensor id/name/hardware id, retained age, and candidate
   count.
4. Compare the widget against LibreHardwareMonitor UI for visible flicker. The
   goal is not exact matching; the goal is no frequent no-data flashes from
   isolated null ticks.

For disk:

1. Do not run broad LHM storage probing as part of this plan.
2. If a native disk throughput spike starts later, validate against explicit
   read/write workloads and record disk identity mapping separately.

## Remaining Future Work

These are intentionally not part of this implementation plan:

- Descriptor-backed advanced catalog picker UI.
- Multi-GPU hardware selector.
- First-class per-disk throughput selector.
- Windows native CPU usage using `% Processor Utility`.
- Windows native RAM/network aggregate source.
- Helper installer UX and Control Panel flows beyond the minimal status facts
  needed for widget/DEBUG diagnostics.
- User-facing history retention settings.
- Any attempt to mirror LiteMonitor's full matcher table, thresholds, or global
  last-valid cache.
- Any Hub-side parsing of LHM `source_sensor_id`, hardware ids, or sensor names.

## License And Prior Art Notes

LibreHardwareMonitor is a dependency and source-reading target. LiteMonitor is
MIT-licensed prior art used for behavior study. This plan uses observed ideas
and product lessons; it does not copy LiteMonitor code. Keep attribution in
development docs. Add product README/license credits only if ShoMetrics copies
code, includes LiteMonitor assets, or distributes LiteMonitor-derived files.
