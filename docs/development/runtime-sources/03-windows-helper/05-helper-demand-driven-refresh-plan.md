# Windows Helper Demand-Driven Refresh Plan

This plan is written for a new coding session with no conversation context.

Read this after:

1. [Helper Source Reliability Implementation Plan](02-helper-source-reliability-implementation-plan.md)
2. [Windows Helper gRPC IPC And Self-Contained Packaging Plan](04-helper-ipc-packaging-plan.md)
3. [Runtime Collection Demand-Driven Background Collection](../../runtime-collection/03-demand-driven-background-collection.md)

## Status

Implemented and live-verified on 2026-05-27.

Verification covered:

- `SetMetricRefreshDemand` exists on the restarted helper build.
- Hub sends and renews Windows helper demand from collector planning.
- Helper refreshes demanded polling groups instead of running full LHM refresh.
- Empty demand stops LHM refresh after demand TTL when Stream Deck is not
  renewing active demand.
- Helper rejects unsafe demand input and `ReadMetricSnapshot` floods.

Reusable safety probe:

```powershell
node packages/hub/scripts/diagnostics/windows-helper-demand-safety-probe.mjs
```

The probe temporarily changes helper refresh demand and sends an empty demand
at the end. Run it only against a local development helper.

## Objective

Make the Windows helper refresh only the helper hardware groups currently needed
by visible Hub subscriptions, at the cadence requested by the Hub, while keeping
the helper safe against bad or malicious requests.

This is a low-cost, high-return refactor. It is not an advanced sensor scheduler
and not a per-sensor/per-method refresh engine.

## Product Decision

This work does make sense and is the right next reliability/performance step
before adding broader Advanced Sensor widgets.

Reason:

- The Hub already knows active visible demand and desired refresh intervals.
- The helper currently owns raw hardware ids, raw sensor ids, descriptor
  grouping, and hardware update cost.
- Updating all LHM hardware every second even when the Hub needs only one group
  creates avoidable risk for slow/fragile hardware.
- The helper runs privileged hardware access. Treat every IPC request as
  untrusted input and enforce safety inside the helper even if the Hub is the
  only intended client.

## Ownership Boundary

| Owner | Responsibility |
| --- | --- |
| Hub `CollectorGroupPlanner` / `CollectorGroupRunner` | Compute active metric demand from visible subscriptions and desired intervals. |
| Hub Windows helper source client | Send demand updates to the helper and continue reading cached snapshots. |
| gRPC source API | Carry demand as additive request/response messages. |
| Windows Service | Validate demand requests, apply helper-side clamps, and update the helper demand state. |
| Windows Core / `LibreHardwareMonitorSession` | Map source-owned polling groups to hardware refresh groups, update only demanded groups, and publish cached snapshots. |
| Hub runtime / PI / actions | Must not parse raw LHM hardware ids, raw sensor ids, or raw hardware type labels to decide helper refresh behavior. |

Important naming point:

```text
Hub sends:
  polling_group_id + metric_ids + desired interval

Helper owns:
  polling_group_id -> hardware group / hardware type / native provider mapping
```

Do not make Node send LHM `HardwareType.Cpu`, `GpuNvidia`, `Storage`, or raw
hardware ids. Those are helper/source-owned implementation details.

## Current State

Current production flow:

```text
Hub active subscriptions
  -> CollectorGroupPlanner groups by source-declared polling_group_id
  -> CollectorGroupRunner reads WindowsHelperSourceClient.readSnapshot(metricKeys)
  -> helper returns the latest cached snapshot

Windows helper
  -> WindowsMetricSnapshotWorker refreshes every 1 second
  -> LibreHardwareMonitorSession.RefreshSnapshotWithDiagnosticsAsync()
  -> traverses all LHM hardware plus native aggregate providers
  -> writes latest aggregate snapshot and per-polling-group snapshots
```

Existing helpful seams:

- `MetricDescriptor.polling_group_id` already exists and is source-owned.
- `CollectorGroupPlanner` already groups active subscriptions by
  `polling_group_id` and interval.
- `CollectorGroupRunner` already owns one timer per planned group.
- `ReadMetricSnapshot` already reads cached snapshots; it should remain a cache
  read, not a hardware traversal trigger.
- `LibreHardwareMonitorSession` already publishes per-polling-group snapshots.

Current missing seam:

```text
Hub demand plan -> helper refresh worker
```

## Non-Goals

- Do not implement per-sensor or per-hardware-method refresh.
- Do not let Hub parse LHM paths, hardware ids, sensor ids, or hardware type
  strings.
- Do not add user-facing settings for helper refresh cadence in this batch.
- Do not make `ReadMetricSnapshot` synchronously traverse hardware.
- Do not use LHM storage traversal for first-class disk throughput.
- Do not add localhost HTTP/TCP control APIs.
- Do not preserve temporary compatibility with older helper/plugin builds; the
  app is not in production yet.

## Safety Requirements

The helper must be safe even if the Node side is buggy or malicious.

Hard requirements:

| Risk | Required mitigation |
| --- | --- |
| Node requests 1 ms refresh. | Helper clamps every requested interval to `MinimumHelperRefreshInterval`. |
| Node sends thousands of groups or metrics. | Helper rejects demand requests above fixed group/metric count limits with `INVALID_ARGUMENT`. |
| Node sends huge strings or payloads. | Helper enforces gRPC receive limits plus per-field and total-string validation before mutating demand state. |
| Node sends unknown polling groups. | Helper ignores unknown groups and reports accepted/rejected counts; no exception for normal version skew. |
| Node spams demand updates. | Service throttles accepted demand application to a minimum update interval and logs repeated drops. |
| Node repeatedly calls `ReadMetricSnapshot`. | `ReadMetricSnapshot` remains cache-only, never triggers hardware refresh, and has its own request-rate limit. |
| Buggy future code calls Core refresh too often. | Core enforces an absolute LHM refresh floor before runtime `IHardware.Update()` calls, even if Service and scheduler safeguards fail. |
| Refresh loop overlaps slow hardware updates. | Helper keeps one in-flight refresh per polling group/hardware group; skip or coalesce overlapping ticks. |
| Hub plan is unchanged for a long time. | Hub renews the current demand before TTL expiry and retries a failed renewal before TTL can expire; active widgets must not freeze after the initial demand request. |
| Helper restarts while Hub demand is unchanged. | Hub resends the latest demand immediately after helper recovery instead of waiting for the next subscription change. |
| Hub exits, crashes, or loses helper connectivity. | Helper stops LHM refresh work after demand TTL expires. Health and descriptor calls still work. |
| Local non-ShoMetrics process connects to the pipe. | Named pipe ACL stays local-machine scoped, excludes `Everyone`, and documents allowed SIDs. Process identity checks are defense-in-depth, not the primary boundary. |
| Helper receives malformed future enum/fields. | Treat unknown future data conservatively: ignore unsupported optional demand, clamp unsafe values, never crash the process. |
| Request strings enter logs. | Sanitize and truncate wire/request strings before logging. |
| Ring0-adjacent hardware path gets stuck. | Keep operation timeouts, cancellation tokens, slow-refresh logs, and throttled warning summaries. |

Initial constants:

```text
MinimumHelperRefreshInterval: 1000 ms
MaximumHelperRefreshInterval: 60000 ms
DemandTtl: 15000 ms
HubDemandRenewInterval: 8000 ms
HubDemandRenewRetryDelay: 2000 ms
MaximumDemandGrpcReceiveBytes: 65536
MaximumDemandGroupsPerRequest: 64
MaximumMetricIdsPerDemandGroup: 64
MaximumMetricIdsPerDemandRequest: 512
MaximumPollingGroupIdLength: 512 UTF-16 code units
MaximumMetricIdLength: 512 UTF-16 code units
MinimumDemandApplyInterval: 250 ms
ReadMetricSnapshotRateLimit: 50 requests/second, burst 20
ListMetricDescriptorsRateLimit: 5 requests/second, burst 3
SetMetricRefreshDemandRateLimit: 4 requests/second, burst 2
MinimumCoreLhmRefreshInterval: 250 ms
MaximumConcurrentHardwareRefreshes: 1 per helper session
```

Rationale:

- 1000 ms preserves the current normal helper cadence and prevents hardware
  hammering.
- 8-second Hub renewal plus a 2-second failed-renewal retry leaves room for one
  failed renewal before the 15-second TTL expires.
- 15 seconds lets the helper keep refreshing through short Hub reconnects while
  still stopping after Hub crash, exit, or demand disappearance.
- The 64 KiB demand receive budget is much smaller than the existing 1 MiB
  snapshot/descriptor response budget. If Kestrel cannot set this per method,
  enforce the same effective budget in the demand validator.
- String length limits are measured with C# `string.Length` because validation
  runs after protobuf decoding. The 64 KiB gRPC/demand budget is still the
  absolute byte ceiling before decoded strings are trusted.
- 250 ms Core LHM refresh floor is not a product cadence. It is the final
  resource-owner safety net that prevents accidental or malicious hot loops
  from hammering LibreHardwareMonitor/PawnIO.
- One concurrent LHM refresh keeps hardware traversal serialized. LHM hardware
  object graphs are not treated as thread-safe.
- Rate limits are service-side safety limits. Hub-side coalescing reduces
  normal traffic, but helper safety must not depend on a correct Hub.

## Transport And Request Security

The Windows helper is a privileged local service. Demand control is read-only in
product terms, but it controls how often privileged hardware code runs, so treat
it as a security boundary.

Named pipe requirements:

- Keep the gRPC transport on Windows named pipes. Do not add localhost HTTP/TCP
  for demand control.
- Do not use an `Everyone` pipe ACL.
- Explicitly document the allowed SIDs. The current service host grants
  `LocalSystem`, `BuiltinAdministrators`, and `BuiltinUsers` and also rejects
  remote pipe clients with a local-machine check.
- Keep a release test that normal-user Stream Deck can call an elevated or
  LocalSystem helper.
- Consider narrowing `BuiltinUsers` to `InteractiveSid` or an installer-known
  active-user SID after the installer/session model is final.
- Process-path or parent-process validation is optional defense-in-depth. Do not
  depend on it as the primary security boundary because Stream Deck process
  layout can change.

Transport/request limits:

- Set `SetMetricRefreshDemand` receive budget to 64 KiB if gRPC/Kestrel exposes
  per-method limits. If not, keep the existing transport limit and enforce a
  64 KiB equivalent inside request validation.
- Keep snapshot/descriptor send/receive limits large enough for descriptor
  catalogs; do not shrink the existing 1 MiB source API limit globally unless
  snapshot/descriptor tests prove it is safe.
- Add method-level rate limiting in the service boundary:

  ```text
  ReadMetricSnapshot:       50 req/s, burst 20
  ListMetricDescriptors:     5 req/s, burst 3
  SetMetricRefreshDemand:    4 req/s, burst 2
  ```

- Return gRPC `RESOURCE_EXHAUSTED` for rate-limit violations. Log repeated
  violations with the C# throttled logger.
- A global per-method limiter is acceptable for v1. Per-client limiting can be
  added only if the named-pipe client identity is reliable enough to avoid
  breaking normal Stream Deck and Control Panel calls.
- Request string validation must reject or truncate before any allocation-heavy
  work. Do not build descriptor lookups, hash sets, or diagnostic summaries from
  strings that failed length/control-character validation.

## Wire Contract

Add one gRPC method. Do not overload `ReadMetricSnapshot`.

```proto
service MetricSourceService {
  rpc GetSourceHealth(GetSourceHealthRequest) returns (GetSourceHealthResponse);
  rpc ListMetricDescriptors(ListMetricDescriptorsRequest) returns (ListMetricDescriptorsResponse);
  rpc ReadMetricSnapshot(ReadMetricSnapshotRequest) returns (ReadMetricSnapshotResponse);
  rpc SetMetricRefreshDemand(SetMetricRefreshDemandRequest) returns (SetMetricRefreshDemandResponse);
}

message SetMetricRefreshDemandRequest {
  repeated MetricRefreshDemandGroup groups = 1;
}

message MetricRefreshDemandGroup {
  // Source-owned descriptor polling group id returned by MetricDescriptor.
  // Hub must not parse this value.
  string polling_group_id = 1;

  // Metric ids that caused this group to be demanded. This is for helper-side
  // validation and diagnostics. The helper still maps polling_group_id to the
  // hardware refresh group it owns.
  repeated string metric_ids = 2;

  // Hub-requested cadence. Helper clamps this to its own safe min/max range.
  uint32 requested_interval_milliseconds = 3;
}

message SetMetricRefreshDemandResponse {
  uint32 accepted_group_count = 1;
  uint32 ignored_group_count = 2;
  uint32 effective_minimum_interval_milliseconds = 3;
  uint32 demand_ttl_milliseconds = 4;
  repeated SourceWarning warnings = 5;
}
```

Version skew policy:

- New Hub calling an old helper gets gRPC `UNIMPLEMENTED`; Hub logs once and
  falls back to current behavior until the helper is updated.
- Old Hub with new helper sends no demand. In production, no demand means no LHM
  refresh after TTL expiry. A full-refresh path may exist only as test-only code
  or behind an explicit `--dev-refresh-all` switch.
- Unknown polling groups are ignored, not fatal.
- Invalid request shape, excessive counts, or unsafe intervals after parsing are
  `INVALID_ARGUMENT`.

Estimated LOC: 80-130 across proto, generated-code references, C# mapper, and
Hub transport/client request types.

## Helper Core Design

Add a small Core-owned demand model. This is not a proto type.

```cs
public sealed record MetricRefreshDemand
{
    public required string PollingGroupId { get; init; }
    public required IReadOnlyList<string> MetricIds { get; init; }
    public required TimeSpan RequestedInterval { get; init; }
}

public sealed record EffectiveMetricRefreshDemand
{
    public required string PollingGroupId { get; init; }
    public required TimeSpan RefreshInterval { get; init; }
    public required DateTimeOffset ExpiresAt { get; init; }
}
```

Add a helper-owned demand state object near `LibreHardwareMonitorSession` or in
`Core`:

```cs
internal sealed class MetricRefreshDemandState
{
    public MetricRefreshDemandApplyResult Apply(
        IReadOnlyList<MetricRefreshDemand> demands,
        DateTimeOffset now);

    public IReadOnlyList<EffectiveMetricRefreshDemand> Snapshot(DateTimeOffset now);
}
```

Required behavior:

- Validate count limits before mutating state.
- Clamp intervals to helper min/max.
- Expire entries by TTL.
- Renew entries when the Hub sends the same demand again.
- Replace the full current demand set on every accepted request. Do not merge
  indefinitely with old demand.
- Store only polling groups known from descriptors.
- Keep unknown group count for diagnostics.

Estimated LOC: 120-180 including tests.

### Core LHM Refresh Gateway

`LibreHardwareMonitorSession` must own a final gateway around runtime LHM
hardware traversal. This is separate from Service request validation and from
the worker scheduler. It protects the hardware access boundary if a future
caller accidentally loops on a refresh method.

Rules:

- The gateway applies before every runtime path that can call
  `IHardware.Update()`.
- Do not add a second lock. Reuse the existing
  `LibreHardwareMonitorSession._readGate`; timestamp state is valid only while
  that gate is held.
- Prefer inlining the timestamp check in the refresh method after
  `_readGate.WaitAsync(...)` instead of hiding it behind a helper whose
  correctness depends on the caller holding the gate.
- The gateway uses monotonic time, not wall-clock time.
- If a refresh arrives before `MinimumCoreLhmRefreshInterval`, Core returns the
  latest cached snapshot with a skip diagnostic instead of traversing hardware.
- A skipped refresh is not a source failure and must not throw.
- The skip diagnostic must be observable through throttled logs.
- Startup descriptor preload may run once before the service accepts IPC.
  Runtime descriptor rebuild or rediscovery paths must use the same gateway.
- This gateway protects LHM traversal only. Native providers can add their own
  provider-specific limits when needed.

Target shape:

```cs
private static readonly TimeSpan MinimumCoreLhmRefreshInterval =
    TimeSpan.FromMilliseconds(250);

private readonly SemaphoreSlim _readGate = new(1, 1);
private long _lastLhmRefreshTimestamp;

public async Task<MetricSnapshotRefreshResult> RefreshPollingGroupAsync(
    string pollingGroupId,
    CancellationToken cancellationToken)
{
    await _readGate.WaitAsync(cancellationToken).ConfigureAwait(false);

    try
    {
        long now = _timeProvider.GetTimestamp();
        TimeSpan age = _lastLhmRefreshTimestamp == 0
            ? TimeSpan.MaxValue
            : _timeProvider.GetElapsedTime(_lastLhmRefreshTimestamp, now);

        if (age < MinimumCoreLhmRefreshInterval)
        {
            return BuildSkippedRefreshResult(pollingGroupId, age);
        }

        _lastLhmRefreshTimestamp = now;

        // Only this block may call IHardware.Update().
        return RefreshPollingGroupUnderGate(pollingGroupId, cancellationToken);
    }
    finally
    {
        _readGate.Release();
    }
}
```

The first refresh after startup should always be allowed. Do not use a separate
`Lock`, `Interlocked`, or double-checked timestamp path unless a future measured
contention problem proves the single `_readGate` is insufficient.

Estimated LOC: 50-100 including diagnostics and tests.

## Helper Refresh Design

Replace the fixed "refresh everything every 1 second" loop with a demand-driven
loop.

Current:

```cs
using PeriodicTimer timer = new(RefreshInterval);

while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
{
    await RefreshOnceAsync(stoppingToken).ConfigureAwait(false);
}
```

Target shape:

```cs
while (!stoppingToken.IsCancellationRequested)
{
    IReadOnlyList<EffectiveMetricRefreshDemand> dueGroups =
        monitorSession.ReadDueRefreshDemands(now);

    foreach (EffectiveMetricRefreshDemand group in dueGroups)
    {
        await monitorSession.RefreshPollingGroupAsync(
            group.PollingGroupId,
            stoppingToken).ConfigureAwait(false);
    }

    await Task.Delay(ComputeNextDelay(dueGroups, now), stoppingToken)
        .ConfigureAwait(false);
}
```

Scheduling rule:

```text
next delay = min(next due time across all active groups) - now
minimum delay: 1 ms
maximum delay: 1000 ms

if no active demand:
  sleep up to 1000 ms, then check for newly applied demand or shutdown
```

Core rule:

```text
one LHM refresh gate per LibreHardwareMonitorSession
one absolute LHM refresh floor per LibreHardwareMonitorSession
```

Even if multiple groups are due, do not call `hardware.Update()` concurrently.
The first implementation can refresh due groups sequentially under the existing
session gate. Even if a caller bypasses the worker scheduler, runtime LHM
traversal must still pass the Core refresh gateway before `hardware.Update()`.
If the gateway skips a refresh, publish no new hardware reads and keep serving
the latest cached snapshot.

Group mapping policy:

| Polling group kind | Refresh behavior |
| --- | --- |
| `lhm:hardware:<hardware-id>` style groups | Update only that hardware subtree. |
| CPU stable alias group | Update CPU hardware needed by selected CPU alias descriptors. |
| LHM aggregate network group | Update only network hardware needed for aggregate values. |
| `windows-native:aggregate:disk` | Refresh native disk provider only; do not traverse LHM storage. |
| Unknown group | Ignore at demand-apply time. |

If exact hardware-id lookup is not available yet, add it during descriptor
snapshot construction:

```cs
private readonly Dictionary<string, IHardware> _hardwareByPollingGroupId;
```

Populate it from the same traversal that creates descriptors. This keeps the
mapping source-owned.

The group index and descriptor snapshot share one lifecycle. If the helper ever
rebuilds descriptors after restart, wake, or hardware rediscovery, rebuild the
polling-group index in the same operation and publish them together. Do not keep
an old hardware index with a new descriptor snapshot.

Estimated LOC: 220-360 across session group index, demand state, refresh loop,
and diagnostics.

## Hub Design

Use the existing collector plan as the single source of demand.

Add source-client capability:

```ts
export interface SourceClient {
    readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult>;
    resolveMetricPollingGroups(metricKeys: readonly string[]): ReadonlyMap<string, SourceMetricPollingGroupResolution>;
    setMetricRefreshDemand?(groups: readonly SourceRefreshDemandGroup[]): Promise<void>;
}

export interface SourceRefreshDemandGroup {
    readonly pollingGroupId: string;
    readonly metricKeys: readonly string[];
    readonly intervalMilliseconds: number;
}
```

`CollectorGroupSupervisor.reconcile()` should derive demand from the same
planned collector groups it already starts/stops:

```ts
const windowsHelperDemand = plannedCollectorGroups
    .filter(group => group.sourceId === WINDOWS_HELPER_SOURCE_ID)
    .filter(group => group.groupKind === "sourceDeclared")
    .map(group => ({
        pollingGroupId: group.pollingGroupId,
        metricKeys: group.metricKeys,
        intervalMilliseconds: group.intervalMilliseconds,
    }));

windowsHelperSourceClient.setMetricRefreshDemand?.(windowsHelperDemand);
```

Hub-side behavior:

- Coalesce demand sends. Do not call the helper for every individual action
  registration if the final planned group set did not change.
- Renew the current non-empty Windows helper demand every 8 seconds even when
  the plan is unchanged. This is the only TTL renewal path; `ReadMetricSnapshot`
  must stay cache-only and must not extend helper demand.
- If a renewal attempt fails for a recoverable reason, retry the latest demand
  after 2 seconds instead of waiting for the next ordinary renewal tick. Keep
  at most one renewal or retry in flight.
- Re-send the latest non-empty demand immediately after helper recovery signals:
  first successful health/descriptor/snapshot call after `pipeMissing`,
  `UNAVAILABLE`, channel reset, helper restart evidence, or service status
  transition from stopped/unavailable to running.
- Send an empty demand list when all Windows helper demand disappears.
- Throttle repeated demand-send failures with existing logger wrapper.
- If `UNIMPLEMENTED`, log once per cooldown and keep reading snapshots. Do not
  crash or mark the source broken solely because demand control is unavailable.
- Keep `CollectorGroupRunner` unchanged: it still reads cached snapshots at the
  requested interval. Demand control only affects helper refresh work behind the
  cache.

Renewal shape:

```ts
const DEMAND_RENEW_INTERVAL_MILLISECONDS = 8000;
const DEMAND_RENEW_RETRY_DELAY_MILLISECONDS = 2000;

// Supervisor owns this timer because it owns the latest planned groups.
// Re-send only the latest coalesced Windows helper demand payload.
scheduleRenewalIfDemandIsNonEmpty();
```

Estimated LOC: 230-360 across source-client type, Windows helper client,
transport, supervisor renewal timer/coalescing, and tests.

## Request Validation And Rate Limiting

Validation belongs in the Service boundary before mutating Core demand state.

Required C# checks:

```cs
if (request.Groups.Count > MaximumDemandGroupsPerRequest)
{
    throw new SourceRequestException(
        SourceRequestFailureKind.InvalidArgument,
        "Too many refresh demand groups.");
}

int totalMetricIdCount = 0;

foreach (MetricRefreshDemandGroup group in request.Groups)
{
    ValidateWireIdentifier(
        group.PollingGroupId,
        MaximumPollingGroupIdLength,
        "polling_group_id");

    totalMetricIdCount += group.MetricIds.Count;

    if (totalMetricIdCount > MaximumMetricIdsPerDemandRequest)
    {
        throw new SourceRequestException(
            SourceRequestFailureKind.InvalidArgument,
            "Refresh demand request contains too many metric ids.");
    }

    if (group.MetricIds.Count > MaximumMetricIdsPerDemandGroup)
    {
        throw new SourceRequestException(
            SourceRequestFailureKind.InvalidArgument,
            "Refresh demand group contains too many metric ids.");
    }

    foreach (string metricId in group.MetricIds)
    {
        ValidateWireIdentifier(metricId, MaximumMetricIdLength, "metric_id");
    }
}

private static void ValidateWireIdentifier(
    string value,
    int maximumLength,
    string fieldName)
{
    if (string.IsNullOrWhiteSpace(value) || value.Length > maximumLength)
    {
        throw new SourceRequestException(
            SourceRequestFailureKind.InvalidArgument,
            $"Invalid {fieldName}.");
    }

    if (value.Any(char.IsControl))
    {
        throw new SourceRequestException(
            SourceRequestFailureKind.InvalidArgument,
            $"Invalid {fieldName}.");
    }
}
```

Do not log the raw invalid value in validation errors. Include the field name,
length, group count, and metric count instead.

Length checks use C# `string.Length` after protobuf decoding. Do not treat the
512 limit as a byte limit; the 64 KiB demand receive budget remains the byte
limit for the encoded request.

Demand apply rate limiting:

```text
if demand payload equals last accepted payload:
  renew TTL / last-seen timestamp without noisy logs

if payload differs but last accepted apply was < 250 ms ago:
  reject or defer the update
  log throttled warning

else:
  apply full replacement
```

If different valid demand payloads are accepted repeatedly near the 250 ms
boundary, keep accepting them but log a throttled warning. This catches flip
attacks or Hub bugs without turning normal rapid action changes into failures.

Do not rely on Hub throttling as the safety boundary. Hub throttling is useful
for efficiency; helper throttling is required for safety.

Estimated LOC: 140-240 across validator/rate limiter/tests.

## Diagnostics

Add low-frequency helper logs:

```text
metricRefreshDemandApplied
  acceptedGroups=...
  ignoredGroups=...
  minIntervalMs=...
  ttlMs=...

metricRefreshDemandRejected
  reason=...
  groupCount=...
  metricCount=...

metricRefreshGroupCompleted
  pollingGroupId=...
  durationMs=...
  readingCount=...
  unavailableMetricCount=...
  warningCount=...

lhmRefreshSkippedByCoreGateway
  ageMs=...
  minimumIntervalMs=...
```

Rules:

- Use `ILogger` throttle extensions for repeated demand errors and slow group
  refreshes.
- Sanitize and truncate any string that originated on the wire before logging:
  strip CR/LF/control characters and cap logged values to a bounded length.
  Prefer counts and field names for rejected requests.
- Production logs should prefer polling group id, hardware type, count, and
  duration summaries over raw sensor names.
- Debug logs may include detailed hardware/sensor identity when needed.

Example helper:

```cs
using System.Text;

private static string SanitizeLogValue(string value, int maximumLength = 256)
{
    StringBuilder builder = new(Math.Min(value.Length, maximumLength));
    bool truncatedOrChanged = false;

    foreach (char character in value)
    {
        if (char.IsControl(character))
        {
            truncatedOrChanged = true;
            continue;
        }

        if (builder.Length == maximumLength)
        {
            truncatedOrChanged = true;
            break;
        }

        builder.Append(character);
    }

    return truncatedOrChanged ? $"{builder}..." : builder.ToString();
}
```

No PI UI changes are required in this batch. DEBUG panels can continue showing
existing attribution and unavailable reports.

Estimated LOC: 40-80.

## Implementation Steps

### Step 1: Add Demand RPC And Generated Types

1. Add `SetMetricRefreshDemand` and messages to `source_api.proto`.
2. Run proto format/build.
3. Add transport methods in Hub and C# service stubs.
4. Map validation failures to `INVALID_ARGUMENT`; leave future unknown method
   behavior as gRPC `UNIMPLEMENTED`.
5. Add gRPC `RESOURCE_EXHAUSTED` mapping for method-rate-limit violations.

Estimated LOC: 80-130.

Verification:

- `npm.cmd run proto:format`
- `npm.cmd run proto:lint`
- `npm.cmd run proto:build`
- `dotnet build packages/source-windows/ShoMetrics.Source.Windows.slnx`

### Step 2: Add Helper Demand State And Validation

1. Add Core demand records and demand state.
2. Add Service request mapper/validator.
3. Enforce group count, metric count, interval clamp, TTL, and apply-rate
   limits.
4. Enforce `polling_group_id` and `metric_id` length/control-character
   validation before mutating state.
5. Add service-side rate limits for demand, descriptor, and snapshot methods.
6. Keep named-pipe ACL/local-client checks explicit and testable; do not loosen
   the current local-only pipe security while adding demand control.
7. Add unit tests for clamp, expiry, unknown groups, empty demand, excessive
   counts, oversized strings, method rate limits, and repeated rapid updates.

Estimated LOC: 260-420.

Verification:

- Core/service unit tests for validation and demand state.
- Confirm invalid requests return `INVALID_ARGUMENT`, not `INTERNAL`.
- Confirm rate-limit violations return `RESOURCE_EXHAUSTED`, not `INTERNAL`.

### Step 3: Refresh Only Demanded Polling Groups

1. Build a helper-owned index from `polling_group_id` to hardware/native refresh
   target.
2. Refactor `RefreshSnapshotWithDiagnosticsAsync()` so production demand uses
   an explicit polling-group refresh path.
3. Add the Core LHM refresh gateway inside `LibreHardwareMonitorSession` before
   any runtime `IHardware.Update()` call.
4. Keep any full-refresh path test-only or behind explicit `--dev-refresh-all`;
   do not leave it as an implicit production fallback.
5. Keep `ReadSnapshotAsync()` cache-only.
6. Preserve per-polling-group snapshot publication and unavailable reports.
7. Keep one LHM refresh in flight at a time.

Estimated LOC: 270-460.

Verification:

- Unit test CPU-only demand does not update GPU/storage hardware.
- Unit test disk native demand does not traverse LHM storage.
- Unit test no demand expires to no LHM refresh.
- Unit test two runtime LHM refresh attempts inside 250 ms cause the second
  attempt to skip `IHardware.Update()` and return the cached snapshot with a
  skip diagnostic.
- Code review check: the Core gateway check is inside the existing `_readGate`
  critical section and no second lock was introduced.
- Existing source reliability tests still pass.

### Step 4: Send Demand From Hub Collector Planning

1. Add optional `setMetricRefreshDemand` to `SourceClient`.
2. Implement it in `WindowsHelperSourceClient`.
3. Teach `CollectorGroupSupervisor` to send the planned Windows helper
   source-declared groups after reconcile.
4. Coalesce identical demand payloads.
5. Add an 8-second renewal timer for the latest non-empty Windows helper demand
   payload.
6. Retry failed renewal sends after 2 seconds without allowing concurrent
   renewal attempts.
7. Re-send the latest non-empty demand immediately after helper recovery or
   gRPC channel recreation.
8. Send empty demand when Windows helper groups disappear and stop the renewal
   timer.
9. Treat `UNIMPLEMENTED` as version skew and log once per cooldown.

Estimated LOC: 230-360.

Verification:

- Planner/supervisor tests prove demand includes polling group id, metric keys,
  and minimum interval.
- Test identical plans do not spam demand RPC.
- Test unchanged active demand is renewed before helper TTL expiry.
- Test one failed renewal schedules a retry before helper TTL expiry.
- Test helper recovery causes the latest active demand to be sent immediately.
- Test disappearing subscriptions sends empty demand.
- Test `UNIMPLEMENTED` does not fail collection.

### Step 5: End-To-End Safety And Performance Checks

Use `packages/hub/scripts/diagnostics/windows-helper-demand-safety-probe.mjs`
for the request-safety checks in items 6-9. The remaining checks use live
helper and Stream Deck logs.

1. Run helper with no Stream Deck demand for at least 2 minutes; verify no LHM
   refresh loop runs after TTL.
2. Show one CPU-temperature action; verify CPU group refreshes at 1 Hz and
   unrelated GPU/storage groups do not refresh.
3. Leave the CPU-temperature action visible for at least 60 seconds; verify Hub
   renews demand and helper refresh does not stop after 15 seconds.
4. Force one demand renewal failure; verify Hub retries within 2 seconds and
   helper refresh does not stop after 15 seconds.
5. Show CPU and GPU actions; verify both groups refresh independently but not
   concurrently inside LHM.
6. Send a synthetic 1 ms demand request; verify helper clamps to 1000 ms.
7. Send excessive demand groups; verify `INVALID_ARGUMENT` and helper stays
   healthy.
8. Send oversized ids and control-character ids; verify `INVALID_ARGUMENT`,
   bounded logs, and helper stays healthy.
9. Flood `ReadMetricSnapshot`; verify `RESOURCE_EXHAUSTED` and helper stays
   healthy.
10. Force rapid Core refresh calls in a test/probe seam; verify LHM updates are
    skipped by the Core gateway instead of running faster than 250 ms.
11. Restart Hub; verify demand resumes without helper restart.
12. Restart helper while Hub demand is unchanged; verify Hub re-sends demand
    immediately after recovery.

Estimated LOC: 60-120 for diagnostics scripts/tests if existing unit seams are
not enough.

## Final Acceptance Checklist

- Hub is the only owner of visible demand and requested interval.
- Helper is the only owner of polling-group-to-hardware mapping.
- `ReadMetricSnapshot` remains cache-only.
- No Hub code parses raw LHM hardware type, hardware id, or sensor id for
  refresh scheduling.
- Helper clamps all requested intervals to safe bounds.
- Helper expires demand after TTL.
- Hub renews unchanged active demand before TTL expiry.
- Hub retries a failed renewal before TTL expiry.
- Hub re-sends active demand immediately after helper recovery.
- Helper rejects excessive group/metric counts.
- Helper rejects oversized or control-character `polling_group_id` and
  `metric_id` values.
- Helper applies method-rate limits and returns `RESOURCE_EXHAUSTED` for floods.
- Helper keeps named-pipe access local-machine scoped, excludes `Everyone`, and
  preserves the documented SID policy.
- Demand request size is capped to 64 KiB by transport or equivalent validator.
- Helper prevents overlapping LHM refreshes.
- Core prevents runtime LHM traversal faster than
  `MinimumCoreLhmRefreshInterval`, even if a caller bypasses normal scheduling.
- Core gateway reuses the existing `_readGate`; no second lock protects the
  refresh timestamp.
- No-demand helper state stops LHM refresh work after TTL.
- Demand RPC `UNIMPLEMENTED` is handled as version skew, not a fatal source
  failure.
- Logs are throttled, sanitize wire strings, and contain enough summary data to
  diagnose slow or rejected demand.
- Tests cover validation, expiry, rate limits, Hub coalescing, helper recovery
  resend, empty demand, and cache-only snapshot reads.

## Expected Total Size

Rough estimate:

```text
proto and generated adapters:      80-130 LOC
Core demand state and group index: 270-460 LOC
Service validation/rate limiting:  140-240 LOC
Hub demand sender/coalescing:      230-360 LOC
tests and diagnostics:             320-580 LOC

total:                             1040-1770 LOC
```

The implementation should stay closer to the low end if it reuses the existing
collector group planner, source descriptors, `WindowsMetricSnapshotWorker`, and
`LibreHardwareMonitorSession` seams instead of introducing a new scheduler
framework.
