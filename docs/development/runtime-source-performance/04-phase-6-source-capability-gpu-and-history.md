# Phase 6 Source Capability, GPU, And History

This document records the Phase 6 runtime source work that follows the Phase 5c
demand-driven background collection cutover.

Read this after:

1. [Phases 1-4 Baseline And Measurement](01-phases-1-4-baseline-and-measurement.md)
2. [Phase 5a/5b Scheduler And Source Grouping](02-phase-5ab-scheduler-and-source-grouping.md)
3. [Phase 5c Demand-Driven Background Collection](03-phase-5c-demand-driven-background-collection.md)

## Out Of Scope

This document does not design:

- Stream Deck rendering optimizations, PNG cache policy, or SVG rasterizer work.
- A general push-event bus from `MetricStore` writes to actions.
- Distributed or remote multi-machine collection.
- User-facing history retention settings.
- A production long-lived `nvidia-smi --loop-ms` child process.
- A Hub-side parser for LHM, sysfs, NVML, SMC, or custom HTTP native ids.
- A new central runtime owner that replaces Phase 5c's registry, planner,
  supervisor, runner, store, and fallback boundaries.

## Executive Position

Keep control-plane planning separate from data-plane freshness.

```text
Control plane:
  descriptors, capabilities, profile metadata, collector grouping

Data plane:
  samples, freshness, source health, backoff, fallback, stale/N/A rendering
```

Descriptor availability is a planning hint. It is not proof that a source can
currently return fresh data. A helper may truthfully report that a sensor exists
while the next read fails because the helper restarted, the sensor disappeared,
the device went to sleep, the protocol changed, or the driver blocked.

Do not combine these concerns into a Cartesian-product state machine.

| State | Plane | Meaning | Owner | Runtime effect |
| --- | --- | --- | --- | --- |
| `owned` | Control | Source knows this metric and declares its collector cost group. | Source descriptor/capability resolver. | Planner may include this source candidate in an owned collector group. |
| `unsupported` | Control | Source is online, has loaded descriptor/capability metadata, and explicitly cannot serve this metric. | Source descriptor/capability resolver. | Planner may remove this source candidate before runner I/O. |
| `unknown` | Control | Source cannot classify this metric, but probing is safe and bounded. | Source descriptor/capability resolver. | Do not treat as unsupported. Planner may isolate this metric when the source declares unknown probing safe. |
| `pendingMetadata` | Control | Source knows this metric depends on descriptor/capability metadata that has not loaded yet. | Source descriptor/capability resolver. | Planner must not create a runner. Render fallback/N/A until metadata loads and invalidation re-plans. |
| `unavailable` | Data | Source is currently disconnected, timing out, or failing. | Collector runner/source client/backoff/fallback. | Do not re-plan by itself; render uses freshness/fallback/N/A. |

## 1. Source Descriptor And Capability Invalidation

### What Already Exists

Phase 5c already has the runtime shape for active action demand:

```text
Action appears or settings change
  -> MetricSubscriptionRegistry
  -> CollectorGroupPlanner
  -> CollectorGroupSupervisor
  -> CollectorGroupRunner
  -> MetricStore
  -> render reads MetricStore synchronously
```

Already implemented:

- Action settings changes rebuild that action's subscriptions.
- Global settings changes force active actions to resubscribe.
- Runner generation guards stop stale in-flight writes.
- Helper/source read failures are handled by runner backoff, sample freshness,
  fallback composition, and N/A rendering.

### What Is New

The missing piece is source metadata invalidation:

```text
Current subscriptions stay the same
Source descriptor/capability metadata changes
Collector groups must be planned again
```

This is a cohesion boundary. Descriptor/capability invalidation owns planning
freshness only. It must not absorb sample freshness, helper health, fallback
selection, source backoff, or render-time stale/N/A policy.

### Edge Cases

| Edge case | Expected behavior |
| --- | --- |
| LHM helper starts before Node hub | Hub reads helper descriptors during source startup and plans dynamic metrics into helper-declared groups. |
| Node hub starts before LHM helper | Hub initially has no helper descriptor. Helper-backed dynamic metrics are `pendingMetadata`, create no helper runners, and render fallback or `N/A`; users do not see the word "unknown". When descriptors arrive, active subscriptions re-plan. |
| Action appears before descriptor load | Action renders placeholder or fallback data. Descriptor load later re-plans without requiring the user to reopen the action. |
| Helper disconnects after descriptors were loaded | Do not re-plan just because the helper is down. Existing descriptors remain planning hints; data freshness/fallback decides what renders. |
| Helper reconnects with same descriptors | Descriptor fingerprint is unchanged; re-plan is idempotent and must not restart every runner. |
| Helper reconnects with different descriptors | Descriptor fingerprint changes; current subscriptions are re-planned; old groups stop when no active metric needs them. |
| Hardware hotplug changes sensors | Descriptor fingerprint changes; planner reconciles active dynamic metrics against the new descriptor set. |
| Descriptor flicker with identical content | Same fingerprint exits early without re-planning. |
| Descriptor flicker with different content | Re-plan once per accepted complete planning metadata snapshot. Add time-window debounce only after measured runner churn. |
| Action settings change | Action-owned lifecycle already refreshes that action's subscriptions. |
| Global settings change | Existing global settings path already resubscribes active actions. |
| Source profile content changes without id change | Profile id is an isolation scope, not a content version. URL, auth, jq rule, descriptor endpoint, or capability metadata changes must change the planning fingerprint and trigger re-planning. |
| Source profile deleted | Active subscriptions referencing it should drop that candidate or fall back according to policy. |
| Source profile id reused | Treat as a content/fingerprint change. Do not trust previous descriptor assumptions purely because the id string matches. |
| Custom HTTP descriptor changes | Owned metric ids and grouping may change; current subscriptions need re-planning. |
| Source says metric exists but read fails | Do not re-plan. Data-plane freshness/backoff/fallback handles failed reads. |
| Source is offline/loading | Do not mark metrics as `unsupported`. Offline/loading is data-plane or descriptor-unavailable state. |
| Source says metric is unsupported | Capability filtering can remove that source candidate before runner I/O only when the source is online and descriptor/capability metadata is loaded. |

### Required Design Decisions

| Decision | Final position |
| --- | --- |
| Version shape | Use source-owned content fingerprints only. Do not use cross-process monotonic sequence numbers. |
| Field name | `planningFingerprint`: a source-owned hash of all metadata that can affect collector planning, including descriptors, capabilities, and source profile content relevant to planning. |
| Equality semantics | Same fingerprint means the same planning assumptions. Reconnects with the same fingerprint are idempotent. |
| Ordering semantics | Source clients must publish complete planning metadata snapshots through a single serialized path. If concurrent descriptor refreshes can overlap inside Node, use a Node-local generation guard before publishing; do not put that generation in the cross-process contract. |
| Source health | Do not put source unavailable/recovered into metadata invalidation. Source health belongs to data-plane freshness/backoff/fallback. |
| Event payload | Carry scope, profile id, planning fingerprint, and reason. Do not carry samples, source health, sequence numbers, or partial descriptor traversal state. |
| Descriptor-backed cold start | Descriptor-backed dynamic metrics return `pendingMetadata` until metadata loads. They must not become one isolated runner per metric. |

Example payload:

```typescript
interface SourceMetadataInvalidation {
    readonly sourceScopeId: string;
    readonly sourceProfileId: string;
    readonly planningFingerprint: string;
    readonly reason:
        | "descriptorLoaded"
        | "descriptorChanged"
        | "capabilityChanged"
        | "sourceProfileChanged";
}
```

### Implementation Plan

1. Add source metadata fingerprint storage.
   - Owner: a narrow source metadata registry, not
     `BackgroundMetricCollection`.
   - Key: `(sourceScopeId, sourceProfileId)`.
   - Stored value: latest planning fingerprint.
   - It accepts or rejects invalidation events. It does not plan collector
     groups, start runners, read sources, write samples, or render widgets.
   - Estimate: 60-120 TypeScript LOC.

2. Add a thin invalidation entry point at the composition root.
   - `BackgroundMetricCollection` may expose
     `notifySourceMetadataChanged(event)` only because it already owns the
     registry/planner/supervisor wiring.
   - It must not store fingerprints, inspect descriptors, decide source
     health, or perform fallback selection.
   - Flow:

     ```text
     notifySourceMetadataChanged(event)
       -> sourceMetadataRegistry.record(event)
       -> if fingerprint changed:
            MetricSubscriptionRegistry.invalidatePlans()
            reconcileCollectorGroups()
     ```

   - This keeps `BackgroundMetricCollection` as a thin composition root instead
     of a new source metadata coordinator.
   - Estimate: 60-120 TypeScript LOC.

3. Re-plan all current subscriptions in the first implementation.
   - This is intentionally full re-plan, not incremental re-plan.
   - Descriptor invalidation is lifecycle/metadata work, not a per-sample hot
     path. Re-planning roughly 100 active subscriptions is expected to be cheap
     compared with helper IPC, WMI, `nvidia-smi`, or rendering.
   - Full re-plan keeps the first implementation simple and reduces the chance
     of dropping a cross-source fallback edge case.
   - Keep `(sourceScopeId, sourceProfileId)` in the event payload so a future
     measured optimization can filter affected subscriptions.
   - Do not add incremental planning until a perf capture shows full re-plan is
     material.
   - Estimate: included in step 2.

4. Gate invalidation by fingerprint equality.
   - If the planning fingerprint is unchanged, ignore the event.
   - If the planning fingerprint changed, accept the event and re-plan.
   - Do not add sequence comparisons. Helper process restarts make
     cross-process sequence semantics fragile, and adding session ids/epochs
     would be a new watch protocol.
   - Tests must assert same-fingerprint reconnect is idempotent.
   - Estimate: 40-80 TypeScript LOC.

5. Publish only complete planning metadata snapshots.
   - Source clients must emit invalidation only after they have a complete
     planning metadata snapshot.
   - The single serialized publish path is a correctness precondition for
     fingerprint-only invalidation. It is not an optional optimization.
   - Do not publish partial LHM traversal states.
   - Do not add microtask debounce in the first implementation. Fingerprint
     equality is the first churn guard. If later logs show repeated changed
     fingerprints during reconnect storms, add an explicit time-window debounce
     such as 100 ms and document the measurement.
   - Estimate: 20-80 TypeScript LOC.

6. Add source hooks.
   - Windows helper source client emits invalidation when descriptors or
     capabilities are first loaded or changed.
   - Custom source clients do the same when their planning metadata changes.
   - Global/action settings changes should continue using the existing
     resubscribe path; do not route ordinary action changes through descriptor
     invalidation.
   - Estimate: 80-180 TypeScript LOC for Hub hooks; C# work depends on helper
     descriptor support.

7. Add tests.
   - Descriptor load after action subscription turns descriptor-backed no-data
     state into owned groups.
   - 100 descriptor-backed metrics before descriptor load create zero helper
     runners, then re-plan into helper-owned groups after descriptor load.
   - Same fingerprint does not restart runners.
   - Changed fingerprint restarts only affected groups after full reconcile.
   - Helper disconnect alone does not call descriptor invalidation.
   - Offline/loading helper never marks metrics as `unsupported`.
   - Source profile content change with same id triggers re-planning.
   - If Node-local descriptor refresh generation is added, older local
     generation cannot publish over newer complete metadata.
   - Concurrent descriptor refreshes inside one source client cannot publish
     interleaved stale metadata events.
   - Estimate: 160-260 TypeScript LOC.

Total estimate: 340-660 TypeScript LOC, plus helper descriptor event support if
the source is the Windows helper.

### Current Implementation Status

Completed in Hub:

- Source planning metadata fingerprints are stored by
  `(sourceScopeId, sourceProfileId)`.
- `BackgroundMetricCollection.notifySourceMetadataChanged(...)` records the
  fingerprint, invalidates active plans only when the fingerprint changes, and
  runs the existing full collector-group reconcile.
- `SourceRegistry` forwards source-owned metadata invalidations from registered
  source clients to background collection.
- Same-fingerprint reconnects are idempotent and do not restart collector
  groups.
- Changed planning fingerprints can re-plan already-active subscriptions and
  start a new collector group when the source-declared group identity changes.

Use case fixed:

```text
Action appears before source metadata is ready
  -> action registers subscriptions
  -> initial plan uses the best available source metadata
  -> source descriptor/capability metadata loads or changes later
  -> active subscriptions re-plan without requiring action reopen/settings churn
```

This also covers source profile metadata changes that keep the same profile id
but produce different planning assumptions, such as a changed custom endpoint,
descriptor endpoint, auth scope, or helper descriptor fingerprint.

Still blocked on helper/custom descriptor implementation:

- Descriptor load after action subscription turning descriptor-backed no-data
  state into helper-owned groups.
- 100 descriptor-backed metrics before descriptor load creating zero helper
  runners, then re-planning into helper-owned groups after descriptor load.
- Helper disconnect alone not emitting metadata invalidation.
- Offline/loading helper never reporting `unsupported`.
- Concurrent descriptor refresh serialization inside a real source client.
- Broken helper pipe recovering through data-plane retry/backoff without using
  metadata invalidation as a socket reset signal.

Do not fake these with Hub-only tests. They require the helper/custom source to
own descriptor readiness, descriptor fingerprints, and source-client publish
serialization first.

### Data-Plane Connection Recovery Invariant

Same-fingerprint reconnects are intentionally control-plane no-ops. Therefore
physical helper connection recovery must be owned by the data plane.

```text
WindowsHelperSourceClient.readSnapshot(...)
  -> detects broken pipe / EOF / timeout / protocol failure
  -> closes and discards the current connection
  -> marks cached source status unavailable
  -> lets CollectorGroupRunner backoff control retry timing
  -> reconnects on the next allowed read attempt
```

Do not rely on descriptor invalidation to reset sockets, named pipes, HTTP
clients, or process handles. Invalidation only describes planning metadata.
Source clients own connection liveness and recovery.

Required tests when helper IPC exists:

- Helper broken pipe followed by same-fingerprint reconnect recovers through
  `readSnapshot` retry/backoff without metadata invalidation.
- Same-fingerprint descriptor event does not restart collector groups.
- Recovered helper data replaces stale/fallback samples through normal
  data-plane freshness rules.

### Alternatives Rejected

| Alternative | Why it is tempting | Why not |
| --- | --- | --- |
| Cross-process sequence numbers | Appears to solve out-of-order events. | Helper restart resets counters; fixing that requires session ids/epochs and becomes a watch protocol. Use fingerprint plus complete snapshot publication instead. |
| Re-plan on every collector tick | Always current. | Puts planning back into the hot path and can churn runners. |
| Re-plan only when actions/settings change | Very simple. | Misses helper descriptor load, helper reconnect with changed sensors, custom source metadata refresh, and hotplug. |
| Let sources directly start/stop runners | Local shortcut. | Breaks source/runtime ownership; source clients would know supervisor details. |
| Treat descriptor presence as data availability | Easy mental model. | Incorrect. Metadata can be true while actual samples are stale, failed, or unavailable. |
| Microtask debounce as correctness guard | Looks cheap. | Too short for real IPC reconnect storms and easy to over-trust. Fingerprint equality is the correctness guard; use measured time-window debounce only if needed. |

## 2. LHM Helper Descriptor Preload And Snapshot Cache

### Dependency

This work depends on source descriptor/capability invalidation. Helper
descriptor changes must be able to re-plan active subscriptions.

### Architecture To Follow

The local prior-art note is:

```text
.agents/skills/technical-deisn-doc/references/runtime-collection-prior-art-lhm.md
```

The useful lesson is the shape, not source-code copying:

```text
long-lived hardware/sensor catalog
  -> background source update
  -> UI reads latest values
```

ShoMetrics should use this shape for the Windows helper:

```text
Windows Helper
  -> owns LHM computer/hardware/sensor catalog
  -> owns descriptor snapshot
  -> owns latest metric snapshot cache
  -> exposes descriptor fingerprint and batched snapshot reads over IPC

Node Hub
  -> never parses LHM source-native ids
  -> receives descriptor/capability metadata from helper
  -> batch-requests active metric ids
  -> stores source/profile-scoped samples in MetricStore
```

### Required Helper Concepts

Helper-side descriptor store:

```csharp
interface IMetricDescriptorStore
{
    MetricDescriptorSnapshot CurrentDescriptors { get; }
    string DescriptorFingerprint { get; }
    event EventHandler<MetricDescriptorSnapshot> DescriptorsChanged;
}
```

Helper-side latest snapshot store:

```csharp
interface IMetricSnapshotStore
{
    ValueTask<MetricSnapshot> ReadCachedSnapshotAsync(
        IReadOnlyCollection<string> metricIds,
        CancellationToken cancellationToken);
}
```

Node-side descriptor cache:

```typescript
interface SourceDescriptorCache {
    readonly sourceScopeId: string;
    readonly sourceProfileId: string;
    readonly descriptorFingerprint: string;
    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution>;
}
```

The helper may expose `DescriptorFingerprint` because that is the helper-side
descriptor store's natural boundary. The Node helper source client is the
boundary that converts helper metadata into Hub planning metadata. If helper
capability state is separate from descriptors, the source client must combine
the descriptor fingerprint, capability fingerprint, and planning-relevant source
profile content into the `planningFingerprint` used by
`SourceMetadataInvalidation`. Do not pass a descriptor-only fingerprint as the
planning fingerprint unless descriptor metadata already includes capability
state.

`ReadCachedSnapshotAsync` must not perform LHM hardware traversal or per-sensor
native reads. It only filters the helper's latest background-refreshed snapshot
for the requested metric ids. The helper owns a separate background update loop
that keeps the descriptor store and latest snapshot cache fresh.

### Implementation Plan

1. Helper builds the LHM catalog before reporting descriptor readiness.
   - Startup may still return "descriptor unavailable" while LHM is loading.
   - Once ready, helper exposes a descriptor snapshot and fingerprint.
   - Estimate: 120-260 C# LOC.

2. Helper owns a latest snapshot cache and background refresh loop.
   - It refreshes LHM values inside the helper process on its own schedule.
   - `ReadCachedSnapshotAsync(...)` reads that cache; it must not trigger
     per-request LHM traversal.
   - Node reads latest values through one batched IPC call.
   - Subscribing to 1 LHM sensor and 100 LHM sensors should not become 100 IPC
     messages when they share the helper snapshot group.
   - Estimate: 180-360 C# LOC.

3. IPC exposes descriptor read and snapshot read.
   - Descriptor read returns descriptor snapshot plus fingerprint.
   - Snapshot read accepts metric ids and returns a metric snapshot from the
     helper cache.
   - Estimate: 100-220 C# LOC and 80-160 TypeScript LOC.

4. Node helper source client stores descriptors in a source descriptor cache.
   - `resolveMetricPollingGroups(metricKeys)` uses the cache.
   - Known LHM ids return `owned` with helper-declared polling group.
   - Descriptor-backed dynamic ids with missing metadata return
     `pendingMetadata`; they do not parse ids and do not create runners.
   - Only sources that explicitly declare bounded probing may return `unknown`
     for missing metadata.
   - Render fallback/N/A until descriptors load.
   - Estimate: 120-220 TypeScript LOC.

5. Descriptor changes emit invalidation.
   - On first descriptor load or fingerprint change, helper source client calls
     background collection invalidation.
   - Same fingerprint is ignored.
   - Estimate: included in section 1 if done together.

### Required Tests

- Node starts after helper: descriptors are loaded before active subscriptions
  become helper-owned groups.
- Node starts before helper: dynamic metrics start as unavailable/descriptor
  missing and later re-plan to helper-owned groups.
- One LHM metric and 100 LHM metrics share one helper snapshot IPC.
- Helper descriptor fingerprint unchanged: no runner churn.
- Helper descriptor fingerprint changed: affected groups re-plan.
- Hub never parses LHM path/id strings.
- Missing descriptors do not produce one collector group or IPC call per dynamic
  LHM metric.

### Alternatives

| Alternative | Pros | Cons |
| --- | --- | --- |
| Helper descriptor preload + snapshot cache | Matches mature hardware monitor architecture; cheap batch reads; clean source ownership. | Requires helper contract and cache lifecycle. |
| Hub parses LHM ids | Quick prototype. | Reject. Opaque ids must stay source-owned; path formats are not a Hub contract. |
| Node sends one IPC per metric | Simple request mapping. | Reject. Scales poorly and defeats helper-side cache. |
| Special Hub-side merging for unknown dynamic ids | Hides cold-start cost. | Reject. It creates a planner special case and weakens the descriptor contract. Wait for descriptors, render fallback/N/A, then re-plan. |

Estimated total: 200-440 TypeScript LOC plus 400-840 C# LOC depending on how much
descriptor/snapshot infrastructure already exists in the helper.

## 3. Source Capability Filtering

### What This Fixes

Capability filtering prevents asking a source for metrics it explicitly cannot
serve.

Example:

```text
metric: custom.weather.temperature
source candidates before filtering:
  [windows-helper, weather-http-profile, node-system]

source candidates after filtering:
  [weather-http-profile]
```

Without filtering, a slow or irrelevant source may be asked on every refresh
only to return no data or unsupported.

Hardcoded "helper does not support X" tables are not considered. They recreate
the static predicate problem Phase 5b removed.

### Recommended Design

Use descriptor-driven filtering before runner I/O. Extend the existing
source-declared metric resolution shape. Do not add a second resolver parallel
to source polling group resolution.

```typescript
type SourceMetricResolution =
    | { readonly state: "owned"; readonly pollingGroupId: string }
    | { readonly state: "unsupported" }
    | { readonly state: "unknown" }
    | { readonly state: "pendingMetadata" };

interface SourceMetricResolver {
    resolveMetricGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricResolution>;
}
```

Planner behavior:

```text
owned        -> include source candidate in collector group
unsupported  -> remove source candidate before runner I/O
unknown      -> isolate only if the source declares bounded unknown probing safe
pendingMetadata -> create no runner; wait for metadata invalidation
unavailable  -> not a planner state; handled by runner freshness/backoff/fallback
```

`unsupported` is valid only when the source has loaded descriptor/capability
metadata and explicitly says the metric cannot be served. Offline, connecting,
loading, timed out, or helper-unavailable states must not become `unsupported`.

### Implementation Plan

1. Extend source polling group resolution in place.
   - Current source-declared polling group resolution already carries the same
     information needed for capability filtering: `owned`, `unsupported`,
     `unknown`, and `pendingMetadata`.
   - Do not add a second parallel resolver.
   - Estimate: 40-100 TypeScript LOC.

2. Teach `CollectorGroupPlanner` to drop unsupported source candidates.
   - If all candidates are unsupported for a metric, the metric should produce
     no collector group and render no data/fallback.
   - If a fallback candidate is owned, keep it.
   - If a primary candidate is unknown and fallback is owned, keep both unless
     the source policy explicitly says empty mode.
   - If a candidate is pending metadata, do not create a runner for that
     candidate.
   - Do not drop a source because it is offline/loading/unavailable.
   - Estimate: 60-140 TypeScript LOC.

3. Keep read-time unsupported handling as defense.
   - Sources may still omit unsupported metrics or return no data.
   - This prevents descriptor mistakes from crashing collection.
   - It is not the main filtering strategy.
   - Estimate: 20-60 TypeScript LOC.

4. Add tests.
   - Helper unsupported + node owned means only node runner is planned.
   - Custom HTTP owned + helper unsupported means helper is not called.
   - Unknown primary + owned fallback keeps safe fallback behavior.
   - Pending metadata for 100 descriptor-backed metrics creates no source
     runners until metadata invalidation arrives.
   - Offline/loading source is not treated as unsupported.
   - All unsupported yields no runner and render-safe no-data.
   - Descriptor change from unknown to unsupported triggers re-plan.
   - Estimate: 120-220 TypeScript LOC.

5. Hook helper/custom descriptors.
   - Helper descriptor entries should carry owned/unsupported state where the
     helper can know it.
   - Custom source descriptors should carry owned metric ids for source-owned
     dynamic metrics.
   - Estimate: 80-180 TypeScript LOC and 80-180 C# LOC for helper metadata.

Estimated total: 240-520 TypeScript LOC plus 80-180 C# LOC when helper metadata
is involved.

### Alternatives Rejected

| Alternative | Why it is tempting | Why not |
| --- | --- | --- |
| Read-time unsupported only | Lowest code. | Still wastes IPC/HTTP/process calls for known-unsupported metrics. |
| Hardcode helper support tables | Fast for current built-ins. | Recreates static metric-family dispatch and fails for LHM/custom metrics. |
| Filter by source type id | Simple grouping. | Wrong isolation for multiple profiles of the same source type. Use profile id/scope. |
| Treat offline/loading as unsupported | Avoids calling a missing source. | Can deadlock cold-start recovery if invalidation is missed. Data-plane backoff/fallback handles source availability. |

## 4. GPU Process-Churn Position

### Current Evidence And Cross-Reference

See:

```text
docs/development/nvidia-smi-gpu-telemetry-notes.md
```

That investigation documents the measured `nvidia-smi` tail latency and the
earlier rejection of split-field query spawning. This Phase 6 document reaffirms
the same boundary at the architecture level: do not introduce another
Node-owned long-lived `nvidia-smi` spawn/loop design as a performance fix.

Current facts:

- `nvidia-smi` median can be fast.
- Successful tail latency can be roughly 1.5-2.2 seconds.
- The old 1.5 second timeout caused false failures.
- The current 3000 ms process timeout is above the observed successful tail.
- Splitting fields did not remove the shared CLI/NVML tail and can multiply
  process launches.

### Official NVIDIA CLI Options

NVIDIA documents these `nvidia-smi` modes:

- `--loop` / `--loop-ms`: repeat a query at a fixed interval.
- `-f`: redirect query output to a file.
- `dmon`: device monitoring with CSV-style formatting options, with
  platform/device limitations.
- `daemon`: experimental, Linux/root-oriented daemon mode.

Official docs: <https://docs.nvidia.com/deploy/nvidia-smi/index.html>

Important conclusion: official `nvidia-smi` does not provide a Node-friendly,
cross-platform, long-lived structured IPC API that avoids stdout/file parsing.

### Production Decision

Do not implement a production long-lived `nvidia-smi --loop-ms` runner.

Reason: the required guardrails are the smell. A safe long-lived child process
would need in-process single-flight ownership, child cleanup, process group
kill, startup orphan detection, lock files, lock heartbeats, max process age,
spawn-failure backoff, and lifecycle logging. Each guardrail has its own failure
mode. That complexity belongs in a helper/native GPU telemetry path, not in the
Node hub's `nvidia-smi` fallback.

Allowed GPU paths:

1. Current `nvidia-smi` one-shot fallback with timeout, freshness, and optional
   collector-group backoff.
2. Future helper/native path, preferably NVML through the Windows helper when
   deep GPU support needs better reliability.

Not allowed for production:

- A long-lived Node-owned `nvidia-smi --loop-ms` process.
- Split-field `nvidia-smi` queries as a performance fix.
- A shorter timeout than observed successful tail latency.
- Source-wide backoff for GPU failures.

### Backoff Scope

GPU backoff, if added, must be collector-group-level:

```text
if nvidia-smi fails or times out repeatedly
  -> back off only node-system:gpu
  -> keep node-system:cpu, node-system:memory, node-system:network running
  -> render latest fresh GPU sample if still fresh
  -> render GPU N/A after freshness expires
```

The backoff key must be the collector group key, such as
`(sourceProfileId, pollingGroupId)`. It must not be only the source id.

It protects the user's machine when GPU telemetry is broken. It does not solve
normal successful process churn.

Estimated code if needed: 60-140 TypeScript LOC, because `BackoffPolicy` already
exists. It should be driven by measured repeated failures, not added as a
speculative optimization.

## 5. Metric History Retention Policy

### Boundary

Metric history retention stays inside `MetricStore`.

```text
MetricStore
  -> owns latest sample
  -> owns history buffer
  -> owns retention policy lookup

Actions/widgets
  -> read WidgetData/history
  -> do not decide storage size

Sources
  -> write samples
  -> do not decide how long history is kept
```

This can be added later without a large rewrite if actions keep reading history
through `MetricStore`.

### Recommended Future Internal Design

Do not expose retention controls to users first. Add an internal per-domain
policy only when a concrete widget needs a longer window.

```typescript
interface MetricHistoryRetentionPolicy {
    retentionFor(metricKey: string): MetricHistoryRetention;
}

type MetricHistoryRetention =
    | { readonly kind: "sampleCount"; readonly sampleCount: number }
    | {
        readonly kind: "timeWindow";
        readonly windowMilliseconds: number;
        readonly maximumSampleCount: number;
    };
```

Do not add a `session` retention kind initially. A session-shaped policy is
unclear unless it also defines pruning, memory caps, and downsampling. Use
`timeWindow` with a cap or `sampleCount` until a real session-history widget
requires more.

Possible internal defaults:

| Metric family | Initial retention | Reason |
| --- | --- | --- |
| CPU/RAM/GPU usage/temp | 60 samples or 60 seconds | Current sparkline shape. |
| Network throughput | 180 seconds with max sample cap | Longer trend can be useful without large memory cost. |
| Disk throughput | 180 seconds with max sample cap | Same initial window as network; increase only after a concrete widget needs a longer disk trend. |
| Disk usage/capacity | Latest sample plus short history | Capacity is mostly a point-in-time value. |
| Custom HTTP/catalog | Default 60 seconds | Unknown cost/semantics until descriptors grow retention hints. |

Implementation shape:

1. Add a retention policy dependency to `MetricStore`.
2. On scalar ingest, read the metric key's retention policy.
3. Append the sample.
4. Prune by sample count or timestamp window.
5. Keep render-facing `WidgetData.history` unchanged.

Estimated code:

| Option | Estimate | Notes |
| --- | --- | --- |
| Keep fixed 60 samples | 0 LOC | Current behavior. |
| Internal per-domain `sampleCount` policy | 60-120 TypeScript LOC | Smallest future step. |
| Internal `timeWindow` plus `maximumSampleCount` | 120-240 TypeScript LOC | Requires timestamp pruning tests. |
| User-facing retention setting | 300-600+ TypeScript/proto/PI LOC | Product complexity; do not start here. |
| Session-long raw history | 200-400+ TypeScript LOC before UI | Needs downsampling and memory caps; do not start here. |

## Recommended Work Order

Sequential work required for LHM/custom source scale:

```text
1. Source descriptor/capability invalidation
2. Helper descriptor preload + helper snapshot cache
3. Descriptor-driven source capability filtering
```

Conditional work:

```text
GPU:
  Keep current nvidia-smi fallback.
  Add collector-group GPU backoff only if repeated failures are measured.
  Move to helper/native telemetry if process churn becomes a real product issue.

History:
  Keep fixed 60-sample behavior until a concrete widget needs more.
  Start with internal per-domain policy, not user-facing settings.
```
