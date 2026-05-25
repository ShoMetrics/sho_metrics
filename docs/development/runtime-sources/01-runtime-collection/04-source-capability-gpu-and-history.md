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

## 2. LHM Helper Descriptor Preload And Latest Value Cache

### Dependency

This work depends on source descriptor/capability invalidation. Helper
descriptor changes must be able to re-plan active subscriptions.

### Architecture To Follow

The local prior-art note is:

```text
.agents/skills/technical-deisn-doc/references/runtime-collection-prior-art-lhm.md
```

The relevant product pattern is:

```text
long-lived hardware/sensor catalog
  -> background source update
  -> UI reads latest values
```

ShoMetrics should use this product pattern for the Windows helper. The
important lesson is not "build one full snapshot"; it is "keep a long-lived
catalog, update latest values in the background, and let readers observe the
latest value for the group they asked for."

```text
Windows Helper
  -> owns LHM computer/hardware/sensor catalog
  -> owns descriptor snapshot
  -> owns latest metric value cache
  -> publishes refreshed values by helper-declared polling group
  -> exposes descriptor fingerprint and batched snapshot reads over IPC

Node Hub
  -> never parses LHM source-native ids
  -> receives descriptor/capability metadata from helper
  -> batch-requests active metric ids for one helper-declared polling group
  -> stores source/profile-scoped samples in MetricStore
```

The helper must not wait for every LHM hardware device to finish refreshing
before publishing values from a hardware group that has already refreshed.
Hardware monitoring UIs need fresh per-sensor values more than they need one
atomic whole-machine snapshot.

This does not change source priority policy. Phase 6 first fixes helper-side
latency caused by full-snapshot publication. Per-metric source priority
exceptions, such as preferring Node for one built-in metric on one class of
machine, require separate theory plus measurement and are not part of this
helper cache design.

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

Helper-side latest value store:

```csharp
interface IMetricLatestValueStore
{
    MetricSnapshot ReadCachedSnapshot(
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

`ReadCachedSnapshot` must not perform LHM hardware traversal or per-sensor
native reads. It only filters the helper's latest background-refreshed values
for the requested metric ids. The helper owns a separate background update loop
that keeps the descriptor store and latest value cache fresh.

### Required Design Decisions

| Decision | Final position |
| --- | --- |
| Cache unit | Cache latest values by helper-declared polling group, not as one full helper snapshot. |
| Publish timing | After one polling group refreshes, publish that group's values immediately. Do not wait for unrelated hardware groups. |
| Group ownership | The helper declares polling group ids in descriptors. Hub treats them as opaque strings and never parses LHM hardware paths. |
| IPC read unit | Hub should request metrics that belong to one helper-declared polling group. If callers request mixed groups, the helper may return values, but the planner must not rely on mixed-group requests for normal collection. |
| Timestamp semantics | A returned `MetricSnapshot.captured_at` represents the latest cache publish time for the requested helper polling group. Avoid mixing metrics from different helper groups in one normal runner request so one timestamp remains meaningful. |
| Refresh concurrency | Keep LHM object graph updates on one serialized helper-owned path unless a specific hardware API is proven safe to refresh independently. Publish each group after it refreshes; do not run speculative parallel `hardware.Update()` calls across the LHM catalog. |
| Overlap behavior | If the helper refresh cycle is still running when the next tick arrives, skip the overlapping cycle. Do not queue duplicate refreshes. If a future source-owned group is proven independently refreshable, it may add its own single-flight guard locally. |
| Failure behavior | If one group refresh fails, preserve that group's previous values until freshness expires. Do not block successful groups from publishing. |
| Source priority | Keep source priority simple while this helper latency fix is evaluated. Do not add vendor/model-specific priority rules as part of this work. |

### Helper Polling Group Model

Descriptor entries must carry a helper-owned `pollingGroupId`.

Examples are illustrative; the exact ids are helper-owned and opaque to Hub:

| Metric family | Example helper group | Why |
| --- | --- | --- |
| CPU load/temperature sensors | `lhm:hardware:<cpu-hardware-id>` | CPU refresh should not wait for GPU/storage/network refresh. |
| GPU sensors | `lhm:hardware:<gpu-hardware-id>` | GPU native calls can stall independently. |
| Dynamic storage sensors | `lhm:hardware:<storage-hardware-id>` | Disk SMART/NVMe refresh can be slow and should not delay CPU. |
| Dynamic network sensors | `lhm:hardware:<network-hardware-id>` | Network adapter refresh is an independent cost boundary. |
| Built-in network aggregate aliases | `lhm:aggregate:network` | `net.down` and `net.up` may combine values from multiple adapters, so they are published after network aggregate values are known. |
| Built-in storage aggregate aliases | `lhm:aggregate:storage` | Disk throughput aliases may combine multiple storage devices, so they are not tied to one storage hardware id. |
| Sensors under one LHM hardware node | Same hardware group unless measurement proves a child subtree has separate cost. | Keeps grouping simple without one-IPC-per-sensor behavior. |

Built-in ShoMetrics semantic metrics and dynamic catalog metrics may both use
helper-declared groups when the helper owns their values. The Hub must not infer
groups from prefixes like `cpu.` or by parsing LHM native ids.

### Data Flow

```text
Helper startup:
  build LHM catalog
  build descriptors with helper pollingGroupId
  compute descriptor fingerprint
  report descriptor readiness

Helper background loop:
  if refresh cycle is already running:
    skip this tick
  else:
    for each helper polling group in the source-owned traversal order:
      refresh the LHM hardware/group on the serialized LHM update path
      map refreshed sensors to ShoMetrics metric values
      publish latest values for that group with capturedAt

Hub planning:
  source descriptor cache resolves metric ids to helper pollingGroupId
  CollectorGroupPlanner builds one runner per helper polling group

Hub collection:
  CollectorGroupRunner requests metric ids for one helper polling group
  WindowsHelperSourceClient reads cached values over IPC
  MetricStore stores the returned source/profile-scoped samples
```

### Final Target

After this section is fully implemented, the helper path should look like this:

```text
Helper descriptors:
  every helper-backed metric has a helper-owned pollingGroupId
  descriptor fingerprint covers the complete planning catalog

Hub planning:
  WindowsHelperSourceClient caches descriptors
  CollectorGroupPlanner creates one runner per helper pollingGroupId
  there is no Hub-side fallback to a single helper snapshot group

Helper data path:
  LHM catalog stays long-lived inside the helper
  one serialized helper refresh coordinator updates LHM values
  each refreshed helper polling group publishes latest values immediately
  IPC reads filter cached values only; reads do not traverse LHM hardware

Runtime behavior:
  CPU helper values do not wait for unrelated GPU/storage/network refresh
  one metric and 100 metrics in the same helper group use one IPC request
  failed/stalled groups age out through MetricStore freshness/fallback
```

This final target is not "current code plus one wrapper." The full-snapshot
publish barrier is migration scaffolding and should be removed when group-level
cache publishing is wired end to end.

### Completed Steps

1. Helper builds the LHM catalog before reporting descriptor readiness.
   - Helper builds a cached descriptor snapshot at session startup.
   - Helper computes a descriptor fingerprint for the complete descriptor
     catalog.
   - IPC `ListMetricDescriptorsResponse` returns filtered descriptors plus the
     complete catalog descriptor fingerprint.
   - IPC `ReadMetricSnapshotResponse` can include filtered descriptors plus the
     complete catalog descriptor fingerprint when descriptors are requested.
   - Hub `WindowsHelperSourceClient.listMetricDescriptors(...)` returns a
     descriptor snapshot object containing both descriptors and the descriptor
     fingerprint.

2. Hub source client stores descriptors in a source descriptor cache.
   - `WindowsHelperSourceClient` records descriptor snapshots in a source-owned
     descriptor cache.
   - Helper descriptor cache misses resolve to `pendingMetadata`, not
     `unknown`, so descriptor-backed helper metrics do not create isolated
     runners while the catalog is missing.
   - Hub `WindowsHelperSourceClient` preloads the full helper descriptor catalog
     when source metadata invalidation listeners subscribe.

3. Descriptor changes emit invalidation.
   - First descriptor load emits source metadata invalidation with a Hub
     `planningFingerprint`.
   - Same-fingerprint reads do not emit.
   - Changed fingerprints emit `descriptorChanged`.
   - Descriptor preload retries while metadata listeners are active and no
     descriptor snapshot has loaded.
   - Descriptor preload uses a short startup retry window before falling back to
     the slower steady retry.

4. Helper-declared polling group ids are carried by descriptors.
   - `MetricDescriptor.polling_group_id` is part of the proto contract.
   - C# helper descriptors populate helper-owned group ids.
   - Descriptor fingerprints include polling group ids because group identity
     affects planning.
   - Node runtime descriptors store `pollingGroupId`.
   - `WindowsHelperSourceClient.resolveMetricPollingGroups(...)` returns the
     descriptor-provided group id instead of a hardcoded helper group.

5. The helper publishes latest values by helper polling group during refresh.
   - `LibreHardwareMonitorSession.ReadSnapshotAsync(...)` reads cached values
     only; it does not traverse LHM hardware.
   - When requested metric ids belong to one helper polling group,
     `ReadSnapshotAsync(...)` returns that group's latest published snapshot.
   - The helper still uses one serialized LHM refresh traversal, but publishes
     each hardware group as soon as that group is read.
   - Network and storage aggregate semantic metrics publish after the traversal
     has enough data to compute their aggregate group values.
   - Mixed-group reads fall back to the full latest snapshot for diagnostic and
     compatibility paths; normal Hub runners should request one helper group.

6. Batched helper IPC reads are preserved.
   - Descriptor reads return descriptor snapshots plus fingerprints.
   - Snapshot reads accept repeated metric ids and return one filtered cached
     `MetricSnapshot`.
   - `CollectorGroupPlanner` coalesces metrics by `(sourceProfileId,
     pollingGroupId)`.
   - `CollectorGroupRunner` calls `readSnapshot(metricKeys)` once per planned
     helper group, so 1 metric and 100 metrics in the same helper group remain
     one IPC request.

7. Descriptor preload uses the descriptor API.
   - Keep `listMetricDescriptors([])` as the long-term descriptor preload path.
   - Do not switch preload to `readSnapshot(... includeDescriptors=true)`.
   - Snapshot responses may still include descriptor snapshots for explicit
     callers, but background metadata preload should stay on the metadata API.
   - This keeps metadata loading separate from metric value reads and avoids
     making ordinary snapshot reads responsible for source planning freshness.

8. Do not add periodic descriptor polling after startup.
   - The helper preloads descriptors when metadata listeners subscribe and
     publishes invalidation when a later descriptor read observes a changed
     fingerprint.
   - The runtime does not poll descriptors forever just to discover hardware
     hotplug.
   - This keeps planning metadata out of recurring background work unless a
     concrete product path needs it.
   - Future hotplug refresh, if needed, should be user- or lifecycle-triggered
     first, such as opening the catalog selector or an explicit refresh action.
     Add low-frequency background metadata refresh only after logs or product
     need justify it.

9. Latency verification after group-cache publishing.
   - A 30 second CPU stress probe compared direct Node CPU reads with helper
     pipe CPU reads at 250 ms intervals.
   - In that run, Node crossed 80% CPU at 259 ms and helper crossed 80% CPU at
     3260 ms, so helper still lagged Node by about 3001 ms for that stress
     transition on this machine.
   - Helper pipe/request handling was not the bottleneck. Direct helper reads
     usually returned from cached values in low single-digit milliseconds, and
     service-side request handling for CPU reads was about 0.01-0.03 ms in the
     C# log.
   - Group-cache publishing did remove the full-snapshot publication barrier:
     CPU reads could observe a newly published CPU group value while the same
     serialized helper refresh cycle was still refreshing later hardware.
   - Remaining helper-vs-Node response differences come from LHM CPU hardware
     update timing/traversal order and the helper refresh cycle, not from CPU
     waiting for unrelated GPU/storage/network publication.

Use cases fixed by the completed steps:

```text
Hub asks helper for descriptor metadata
  -> helper returns only requested descriptors when filtered
  -> response still carries the full catalog fingerprint
  -> Hub can later compare planning metadata identity without parsing LHM ids
```

```text
Hub starts before helper descriptor metadata is available
  -> helper-backed catalog metrics resolve as pendingMetadata
  -> planner creates no helper runner for those metric ids
  -> widgets render fallback/N/A until descriptors load and re-plan
  -> cold start does not create one helper runner or IPC call per catalog metric
```

```text
Background collection subscribes to source metadata invalidations
  -> Windows helper source preloads descriptors with listMetricDescriptors([])
  -> descriptor cache records the full catalog fingerprint
  -> source emits descriptorLoaded invalidation
  -> BackgroundMetricCollection full re-plans active subscriptions
  -> helper-backed metrics move from pendingMetadata to descriptor-provided helper groups
```

```text
Helper refresh starts
  -> CPU hardware group refreshes
  -> helper publishes CPU group snapshot immediately
  -> Node CPU helper read can observe the new CPU value
  -> later GPU/storage/network work no longer gates CPU publication
```

```text
CPU stress starts
  -> Node may observe the CPU spike before helper on this machine
  -> helper still publishes CPU as soon as its CPU hardware group refreshes
  -> IPC reads return cached CPU values quickly
  -> remaining lag is a source behavior/priority question, not a helper cache
     barrier
```

```text
Widget subscribes to many helper metrics from the same helper group
  -> planner produces one collector group
  -> runner calls readSnapshot([...metric ids]) once per tick
  -> helper filters its cached group snapshot
  -> subscription width does not become one IPC request per metric
```

```text
Background metadata preload starts
  -> helper client calls listMetricDescriptors([])
  -> descriptor cache records descriptors and fingerprint
  -> source metadata invalidation re-plans active subscriptions
  -> metric snapshot reads stay value-only in the normal runtime path
```

```text
User hotplugs hardware after startup
  -> existing planned metrics keep using data-plane freshness/fallback/N/A
  -> new dynamic sensor ids are not discovered automatically
  -> removed dynamic sensor ids age out to N/A or fallback
  -> catalog UI remains unchanged until a future explicit/lifecycle descriptor refresh
```

### Remaining Cleanup

Known limitation after the first group-cache implementation:

- The helper still uses one serialized LHM traversal. This avoids unsafe
  speculative parallel `hardware.Update()` calls.
- A group no longer waits for later unrelated groups before its cache is
  published.
- A group can still wait for earlier groups in the serialized traversal order.
  If measurements show this is material, the next design step is source-owned
  traversal ordering or proven-safe per-source refresh splitting, not Hub-side
  source-priority special casing.

Still pending:

- Helper-side or Hub-side catalog refresh trigger for hardware hotplug after
  the initial descriptor preload. The current Hub emits `descriptorChanged`
  when a later descriptor read observes a changed fingerprint, but it does not
  poll descriptors periodically.
- Capability filtering from helper descriptors.

### Required Tests

- Node starts after helper: descriptors are loaded before active subscriptions
  become helper-owned groups.
- Node starts before helper: dynamic metrics start as unavailable/descriptor
  missing and later re-plan to helper-owned groups.
- One LHM metric and 100 LHM metrics in the same helper-declared polling group
  share one helper IPC request.
- CPU helper group publication is not delayed by a slow GPU/storage/network
  helper group.
- If a helper group refresh fails, other groups continue publishing fresh
  values and the failed group's stale values age out through normal freshness.
- Helper descriptor fingerprint unchanged: no runner churn.
- Helper descriptor fingerprint changed: affected groups re-plan.
- Hub never parses LHM path/id strings.
- Missing descriptors do not produce one collector group or IPC call per dynamic
  LHM metric.

### Alternatives

| Alternative | Pros | Cons |
| --- | --- | --- |
| Helper descriptor preload + group-level latest value cache | Matches mature hardware monitor architecture; cheap batch reads; clean source ownership; slow groups do not block fast groups. | Requires helper contract, cache lifecycle, and helper-declared polling groups. |
| One full helper snapshot cache | Simple to implement; one timestamp and one cache pointer. | Reject as steady-state design. It recreates a full-refresh publish barrier, so CPU can wait behind unrelated slow hardware. |
| Parallel per-hardware LHM update loops | Looks like stronger isolation and could improve slow hardware tails. | Reject for the first implementation. LHM's object graph is source-owned and not documented here as safely refreshable in parallel. Use serialized LHM updates with group-level publish first. |
| Per-metric IPC reads | Simple source request mapping. | Reject. Scales poorly and defeats helper-side cache. |
| Per-metric timestamps in IPC values | Can represent mixed-group snapshots precisely. | Defer. It expands the wire contract and MetricStore ingest semantics. Prefer normal requests scoped to one helper polling group first. |
| Vendor/model-specific source priority rules | Can optimize one measured machine. | Reject for this phase. It creates maintenance debt and should only follow broad theory plus repeated measurements. |
| Hub parses LHM ids | Quick prototype. | Reject. Opaque ids must stay source-owned; path formats are not a Hub contract. |
| Special Hub-side merging for unknown dynamic ids | Hides cold-start cost. | Reject. It creates a planner special case and weakens the descriptor contract. Wait for descriptors, render fallback/N/A, then re-plan. |

Estimated remaining work for this section: diagnostic cleanup only, unless
hotplug refresh is promoted to a product requirement.

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
2. Helper descriptor preload + helper latest value cache
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
