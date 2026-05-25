# Phase 5a/5b Scheduler And Source Grouping

Phase 5a and Phase 5b reduce cross-collector blocking without yet changing the
fundamental pull-based runtime shape.

Status after Phase 5c: this document is historical design evidence. The old
Scheduler and SourceRunner hot path no longer exists in production code, but the
source-declared polling group model survived and now feeds
`CollectorGroupPlanner`/`CollectorGroupRunner`.

## Phase 5a: Scheduler Group Isolation

Phase 5a changes Scheduler coalescing from "same interval and source plan" to
"same interval, source plan, and metric polling group." Metric keys are
partitioned into collector-owned groups such as `cpu`, `memory`, `disk`,
`network`, and `gpu`.

These built-in groups are a static approximation of collector cost boundaries,
not a permanent hardware taxonomy. The important boundary is "one underlying
collector call pays this cost," not "this metric mentions CPU/GPU/disk." For
example, GPU static model discovery and GPU telemetry may eventually be separate
groups, while a helper-owned cached hardware snapshot may intentionally serve
many hardware families from one group.

This directly targets the observed freeze mode where one 1 Hz group waited for a
slow collector and all widgets in that group stopped updating. The scheduler
still coalesces same-collector work, so many network keys stay one network poll
instead of becoming one poll per widget or metric.

This is not the final snapshot-cache architecture. Remaining limitations:

- A slow collector still blocks widgets that depend on that same collector.
- `SourceRunner` still awaits source candidates sequentially inside one polling
  group, so a slow helper can still delay fallback for the same metric group.
- Source results are still ingested only when scheduled polls complete; there is
  no background source snapshot cache yet.

The next perf run should use the new `pollingGroup=...` Scheduler log field and
compare `pollDone`, `pollStartGap`, and sample age per group. The expected win
is isolation: CPU/RAM groups should continue on cadence while network/GPU groups
are slow. Per-group analysis requires debug logging because `pollStart` and
`pollDone` are debug-level Scheduler entries.

Phase 5a validation criteria for the next 300 second debug capture:

| Check | Pass condition | Why |
| --- | --- | --- |
| CPU and memory 1 Hz cadence | `pollStartGap` p95 below 1100 ms for CPU and memory groups | These groups should stay close to the 1 Hz budget when unrelated collectors are slow. |
| Cross-group isolation | Network/GPU `pollDone` outliers must not coincide with CPU/memory `pollStartGap` spikes | The core invariant is "one slow collector does not freeze unrelated widgets." |
| Same-collector coalescing | Total source polls should match collector groups, not widget count or metric-key count | Phase 5a must not turn many metric keys into many OS/WMI/process calls. |
| Network/GPU own latency | `pollDone` p95 for network and GPU should stay within 10% of the previous baseline unless logs identify unrelated noise | Isolation must not make the slow collectors themselves meaningfully worse. |
| Rendered sample freshness | CPU/memory sample age p90 should stay below 1500 ms; network/GPU should be reported even if still failing | The run must separate "isolation improved" from "all freshness is solved." |

Release gate status change:

- Refresh isolation gate: partial pass. Cross-collector scheduler isolation is
  now explicit; same-collector stalls still require the later snapshot-cache
  work.
- Other gates: unchanged until a new 300 second perf capture proves otherwise.

Maintenance rule: when adding a new built-in metric family or stable metric key
prefix, update `metric-polling-groups.ts` and its tests. Unknown metric keys are
routed to the `unknown` group so they still work, but they will not coalesce
with the intended collector until the mapping is updated. Empty scheduled
metric lists remain an `all` group for source contract compatibility; ordinary
actions still subscribe with explicit metric keys.

Pre-LHM gate: do not scale the current predicate cascade into a list of helper
or source-specific `if` branches. Before adding LibreHardwareMonitor's dynamic
metric ids, move metric-to-polling-group resolution to a source-declared model:
either sources expose `ownsMetricKey`/`pollingGroupId`-style ownership metadata,
or metric descriptors/registers include polling-group metadata. LHM can expose
hundreds of source-owned sensor ids, and the hub should not learn those ids by
hard-coded string predicates.

Dynamic regrouping based on recent latency is not the next step. The slow-path
problem is already addressed by isolation: a slow collector gets its own group
and no longer freezes unrelated collectors. Runtime adaptation should happen at
the retry/backoff/frequency layer, where sustained slow or failing collectors can
be skipped, cooled down, or refreshed less often. Dynamically merging fast groups
and "exiling" slow metrics would save only scheduler-level microseconds in a 1
Hz system while adding hysteresis, nondeterminism, and harder debugging. Grouping
should stay tied to explicit collector cost boundaries unless a source declares
that it can split work more finely.

## Phase 5b Design: Source-Declared Polling Groups

Phase 5b removes the hard-coded metric-prefix cascade from the polling-group
decision. The goal is not dynamic grouping. The goal is to make collector cost
boundaries explicit before LHM dynamic metrics and before the source snapshot
cache design.

Design invariant:

```text
metric key -> source-declared collector/cost group -> Scheduler coalescing key
```

The hub should not infer LHM, sysfs, NVML, WMI, SMC, or remote-agent sensor
ownership by parsing source-native ids. Sources own their collector boundaries.
The Scheduler only needs a stable group token that says "these metrics are safe
to request together for this source candidate path."

### Goals

- Remove central knowledge of metric families from `metric-polling-groups.ts`
  before adding LHM or other dynamic sources.
- Keep scheduler partitioning hot-path safe: no IPC, descriptor listing, WMI, or
  hardware discovery while deciding polling groups.
- Preserve Phase 5a isolation for fallback paths, not only for the primary
  source.
- Preserve same-collector coalescing so many widgets or text-widget keys do not
  multiply OS queries or process launches.
- Create the collector boundary that Phase 5c background collection will reuse.

### Non-Goals

- Do not implement the background collection in Phase 5b.
- Do not add latency-based dynamic regrouping.
- Do not make descriptors a new per-tick dependency.
- Do not require LHM descriptors to be known by the hub through string parsing.
- Do not change rendered widget behavior except through improved scheduling
  boundaries.

### Proposed Runtime Shape

Add a source-owned, synchronous batch resolver on the runtime source boundary:

```typescript
interface SourceMetricPollingGroupResolver {
    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution>;
}

type SourceMetricPollingGroupResolution =
    | { readonly state: "owned"; readonly pollingGroupId: string }
    | { readonly state: "unsupported" }
    | { readonly state: "unknown" };
```

This resolver must be cheap and side-effect free. It may use static built-in
rules or a cached descriptor registry, but it must not call `listMetricDescriptors`
or perform source I/O inside the scheduler tick. The batch shape is deliberate:
future text widgets, rotation widgets, and catalog sources may resolve tens or
hundreds of metric ids at once, and each source should be able to answer with
one cached map lookup or bulk rule pass.

The source-scoped `pollingGroupId` is not a display label and not a hardware
type. Examples:

| Source | Metric examples | Polling group examples |
| --- | --- | --- |
| `node-system` | `cpu.usage_percent`, `cpu.model` | `cpu` initially; later `cpu-load` and `cpu-static` if split |
| `node-system` | `net.down`, `net.up`, interface traffic ids | `network-traffic` |
| `node-system` | `gpu.usage_percent`, `gpu.temp`, `gpu.model` | `gpu-telemetry` and later `gpu-static` |
| `windows-helper` | LHM-backed stable and source-owned sensors | `lhm-snapshot` if served from one cached helper snapshot |
| `windows-helper` | Future helper collectors with independent cost | Source-declared ids such as `storage-smart` or `fan-control-readback` |
| Custom HTTP/catalog source | Many metrics derived from one endpoint response and one JSON transform | One group for the endpoint/transform result, not one group per JSON field |

The ids are source-scoped. The scheduler key should include the source id or the
candidate path, so `node-system:gpu-telemetry` and
`windows-helper:gpu-telemetry` never collide accidentally. For profile-backed
sources, the isolation key is `MetricSourceProfile.id`, not only
`source_type_id`; two HTTP profiles with the same type are separate isolation
domains.

Resolution states:

| State | Meaning | Scheduling behavior |
| --- | --- | --- |
| `owned` | The source can serve this metric and declares the collector/cost boundary. | Metrics with matching fallback-aware signatures can coalesce. |
| `unsupported` | The source knows the metric and cannot serve it. This is the future capability-filtering hook. | The state stays visible now and enables later pruning before source I/O. |
| `unknown` | The source has no cached ownership information for this metric. | Keep the metric in the read plan, but give each unknown metric id its own effective polling group. |

Unknown metrics should keep Phase 5a's availability behavior but become more
isolated: keep the metric in the read plan so the source can still resolve it,
but give each unknown metric id its own effective polling group. Do not merge
all unknown ids into one broad group, and do not silently drop them before the
source has a chance to return data. The widget will naturally show `N/A` if no
source produces a valid sample.

### Fallback-Aware Grouping

Polling groups must be resolved against the source candidates that can actually
be tried for a read plan. Coalescing two metrics is safe only when every relevant
candidate source would collect them through the same cost boundary.

Effective group signature:

```text
[
  "windows-helper:<owned group | unsupported | unknown:metricId>",
  "node-system:<owned group | unsupported | unknown:metricId>"
]
```

Examples:

| Read plan candidates | Metric A | Metric B | Coalesce? | Reason |
| --- | --- | --- | --- | --- |
| `node-system` only | `cpu.usage_percent -> node-system:cpu` | `cpu.model -> node-system:cpu` | Yes | Same source and same collector boundary. |
| `node-system` only | `cpu.usage_percent -> node-system:cpu` | `net.down -> node-system:network-traffic` | No | Different node collectors. |
| `windows-helper -> node-system` | `cpu.usage_percent -> windows-helper:lhm-snapshot, node-system:cpu` | `gpu.temp -> windows-helper:lhm-snapshot, node-system:gpu-telemetry` | No | Helper path matches, but fallback path does not. Coalescing would let slow GPU fallback block CPU fallback. |
| `windows-helper -> node-system` | Two LHM-only dynamic sensors with the same helper group and no node fallback | Same helper group | Yes | They share the same helper collector boundary. |

This is deliberately conservative. It may split a helper request that could have
been served by one primary helper snapshot, but it protects the fallback path and
keeps the product invariant: a slow GPU fallback should not freeze CPU widgets.
Phase 5c's background cache should make repeated helper snapshot reads cheap; if
a source can safely serve a broader cached group, it should declare that
explicitly.

Source candidate changes must force repartition. When a user changes source
policy, disables the helper, switches profiles, or when source descriptor
metadata changes from `unknown` to `owned`, live subscribers need a fresh
partition plan. Current action settings changes already unsubscribe/resubscribe
through read-plan changes; Phase 5b should add an explicit planner/source-metadata
version so descriptor registry refresh can also trigger correct group
reassignment without waiting for the action to disappear.

### Descriptor And Discovery Rules

Built-in stable metrics can be declared through static source rules. Dynamic
metrics must come from cached source descriptors or a runtime metric registry:

```text
source descriptor / registry:
  metricId
  sourceId
  pollingGroupId
  support/capability state
```

Descriptor refresh belongs to lifecycle or low-frequency discovery paths, not
the 1 Hz scheduler path. If a widget references a dynamic metric id that is not
known in the descriptor cache, the runtime should treat it as unresolved or
conservatively isolated. It should not add source-native string parsing to the
hub as a recovery path.

This model also creates the right place for source capability filtering. For
example, helper-unsupported disk usage/volume stable ids should be excluded from
the helper candidate path before `SourceRunner` spends time asking the helper for
metrics it cannot resolve.

Capability filtering is not part of the first Phase 5b code slice. Phase 5b
must carry the `unsupported` state in the resolver contract and tests, then a
small Phase 5b.1 behavior change can prune unsupported source candidates before
`SourceRunner` does I/O. This keeps the ownership model and the behavior change
reviewable while preventing the old helper `requested=6 resolved=0` waste from
becoming invisible again.

### Settings Contract Scale Check

The current settings contract already points at four shapes that Phase 5b must
support:

- Rotation: a future widget may rotate one visual component through several
  `MetricSlot` selections, such as CPU usage and GPU temperature. The resolver
  should plan every metric the widget wants prefetched or refreshed, then let
  collector groups isolate slow sources. Rotation must not require a new
  scheduler model.
- Multi-metric text: a future text widget may show many slots at once. Grouping
  must scale with collector groups, not with displayed line count. A 24-key text
  widget should still produce a small number of collector-owned read plans.
- Custom API/catalog source: `MetricSourceProfile.source_type_id`,
  `HttpMetricSourceConnection`, and `CatalogMetricTarget.metric_id` already make
  room for source-owned catalog metrics. A custom source that fetches one
  weather endpoint and runs one JSON transform should declare one polling group
  for all metrics derived from that response, not one group per metric field.
- LHM dynamic sensors: `CatalogMetricTarget.metric_id` is opaque. LHM descriptors
  should populate metric ids and polling-group metadata; hub code must not parse
  LHM paths to infer hardware, sensor type, or grouping.

These cases all require the same rule: widget layout can be single, rotating, or
multi-slot, but collector grouping belongs to the source/descriptor layer.
Settings choose metrics and source policies; they do not define runtime
collector boundaries.

### Scale Decisions

These decisions follow from the settings contract and must be explicit before
Phase 5b implementation:

- The current priority is not perfect support for every edge case. The priority
  is to land the performance fix quickly while keeping a clear path for future
  complex widgets, without forcing another destructive runtime rewrite, growing
  kitchen-sink scheduler code, or introducing avoidable correctness bugs.
- Rotation widgets prefetch every metric in the rotation set. Subscription stays
  stable across rotation ticks; rotation is a display concern, not a scheduling
  concern. Just-in-time rotation that unsubscribes/resubscribes per displayed
  metric is rejected because it would trigger repartition at rotation cadence,
  delay the newly visible metric until the next poll, and work against the
  Phase 5c background-collection direction.
- Subscribers spanning multiple polling groups receive one callback per completed
  group. Each callback snapshot contains only that group's metric values.
  Subscribers that need a combined view, such as a future 24-key text widget,
  must read accumulated values from `MetricStore` by metric key instead of
  assuming callback snapshots are complete. This contract must stay tested.
  Isolation is group-level, not widget-level. A slow GPU telemetry group can
  delay GPU readings in multiple widgets, and a slow CPU group can delay CPU
  readings in multiple widgets. Neither slow group may delay unrelated CPU,
  GPU, memory, network, disk, or custom-source groups inside the same widget.
- Scheduler isolation is scoped by `MetricSourceProfile.id`, not only by
  `source_type_id`. Two profiles with the same source type, such as two
  `http-json` endpoints, are independent isolation domains. A slow weather
  endpoint must not delay a fast stocks endpoint.
- The `windows-helper:lhm-snapshot` example assumes the helper serves multiple
  LHM metrics from one cached helper snapshot, so asking for 1 sensor or 100
  sensors pays essentially the same collector cost. If a helper implementation
  instead performs per-id or per-hardware queries, the helper must declare
  finer polling groups, such as LHM hardware subtree groups, rather than keeping
  all sensors in one broad group.

### Cross-Scenario Boundaries

Phase 5b should support normal combinations without optimizing rare composites
into scheduler complexity:

- Rotation and multi-metric text are separate widget models for now. A rotation
  widget cycles one visible slot through a prefetched metric set. A multi-metric
  text widget shows many slots at once. A future "rotating page of many metrics"
  mode is an advanced composition, not a Phase 5b target; if it is added later,
  it should still prefetch the declared metric set, enforce a product-level
  metric count cap, and degrade per group with `N/A` rather than resubscribing
  on every page change.
- Multiple custom HTTP/catalog profiles scale by profile. Five weather/stock/API
  profiles mean five independent profile-scoped isolation domains. This is
  acceptable when each profile represents a real endpoint/transform cost, but
  the resource gate still applies: many slow endpoints need timeout, backoff,
  and freshness policy instead of shared source-type grouping.
  Source/cache-level `RefreshableCache<T>` and `BackoffPolicy` already cover
  some retry/freshness cases. Phase 5b does not add Scheduler-level backoff that
  skips a slow group for N future ticks; that remains a later option only if
  measured source cost proves it is needed.
- LHM plus rotation follows the normal rotation prefetch rule. If selected LHM
  metrics come from one cached helper snapshot, they coalesce into the helper's
  declared snapshot group. If the helper declares finer groups, rotation uses
  those groups without changing Scheduler behavior.
- Large metric sets may degrade by collector freshness. They must not create one
  OS query, IPC request, external process, or JSON endpoint call per displayed
  key.

### Known Phase 5b Limitations

- Unknown dynamic metrics are intentionally isolated so the hub does not guess
  source-native ownership. This is correct but expensive during descriptor
  cold-start. For example, if 100 configured LHM sensors are all `unknown`
  because helper descriptors have not loaded yet, the planner can produce 100
  isolated groups. Production LHM integration must preload descriptors before
  exposing the source to the planner, or the helper/source client must coalesce
  unknown requests on its side until descriptors are ready.
- `pollingGroup=...` log values become fallback-aware JSON signatures instead
  of short labels such as `cpu`. Perf tooling must parse the whole non-whitespace
  token and should not assume the old enum-style group id.

### Implementation Sketch

1. Add runtime types for source-declared polling groups near the source client
   boundary. Keep them runtime-only; do not leak generated descriptor proto
   types into Scheduler or actions.
2. Add planner tests for fallback-aware grouping, unknown isolation,
   unsupported source candidates, and source-candidate changes before changing
   Scheduler behavior.
3. Add a source registry or planner method that resolves metric keys against a
   normalized read plan and returns fallback-aware effective group signatures.
4. Move `partitionMetricKeysByPollingGroup` behind that planner. The Scheduler
   should ask for already-partitioned metric groups; it should not know built-in
   metric prefixes.
5. Migrate in strict PRs with one active decision path at a time:
   - PR 1: add the source resolver interface and a default resolver that
     delegates to the current static bridge.
   - PR 2: implement `node-system` source-declared groups and route built-in
     node metrics through that declaration.
   - PR 3: implement `windows-helper` static or descriptor-backed groups without
     parsing LHM ids in the hub.
   - PR 4: delete the static bridge after all built-in declarations are active.
     The cleanup must also change `MetricSource` and `SourceClient` from
     `Partial<SourceMetricPollingGroupResolver>` to required resolver contracts,
     delete `metric-polling-groups.ts` and its tests if no importers remain, and
     keep Scheduler tests using the real planner rather than a legacy bridge.
6. After Phase 5b, implement Phase 5b.1 capability filtering using the
   `unsupported` state.

### Tests And Gates

- Unit-test fallback-aware grouping. A CPU/GPU read plan with
  `windows-helper -> node-system` must split when the fallback groups differ,
  even if the helper primary group is the same.
- Unit-test same-collector coalescing. Many network keys and many same-helper
  dynamic sensors should stay one group when their candidate signatures match.
- Unit-test unknown/dynamic metric behavior. Unknown ids must not silently join a
  broad helper or hardware group; each unknown metric id should get an isolated
  effective group and remain eligible for source reads.
- Unit-test source candidate changes. Disabling the helper, changing source
  profiles, or refreshing descriptor metadata must repartition live subscribers.
- Unit-test unsupported capability state. Unsupported metrics should be visible
  to the planner now and prunable by the later Phase 5b.1 behavior change.
- Unit-test that Scheduler no longer imports metric-family predicates after the
  migration.
- Unit-test isolation scope. Multiple widgets that share a slow group should
  share that group's stale/failure behavior, while unrelated groups in those
  same widgets continue independently.
- Preserve Phase 5a scheduler contracts: partition results are cached per
  subscriber instead of recomputed on every tick, and a subscriber spanning
  multiple groups may receive one callback per completed group with a partial
  snapshot.
- Keep the Phase 5a perf validation table. Phase 5b should preserve or improve
  those results; it should not claim a latency win without a new 300 second
  capture.

## Current Implementation State

Current production path after Phase 5c:

- Scheduler-as-I/O-owner and SourceRunner hot-path orchestration have been
  deleted.
- `node-system` declares source-owned polling groups.
- `windows-helper` declares a helper snapshot polling group.
- `SourceClient` requires the polling group resolver contract.
- The static `metric-polling-groups.ts` bridge and its tests have been deleted.
- Runtime grouping now happens through `CollectorGroupPlanner` from active
  `MetricSubscription` records, not through Scheduler ticks.

## Why Phase 5c Still Exists

Phase 5a/5b reduced how far collector stalls could spread. They did not remove
collector I/O from the visible refresh chain. Phase 5c changed the shape from
synchronous pull to demand-driven background collection; see
`03-phase-5c-demand-driven-background-collection.md` for the current runtime
architecture.
