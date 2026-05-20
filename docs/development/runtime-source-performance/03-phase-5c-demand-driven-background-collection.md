# Phase 5c Demand-Driven Background Collection

One sentence: split collection from rendering. Actions subscribe to the metrics
they need, collector groups refresh those metrics in the background, and render
ticks synchronously read `MetricStore` without awaiting WMI, helper IPC, HTTP, or
`nvidia-smi`.

This is a collapse of runtime polling orchestration, not a deletion of product
semantics. Keep source profiles, per-metric fallback policy, source-declared
polling groups, opaque catalog ids, and the `MetricSource`/`SourceClient`
adapter boundary. Move them out of the render hot path.

## Final Position

Collapse this pull chain:

```text
Widget callback
  -> Scheduler subscription/tick
  -> MetricReadPlan
  -> PollingGroupPlanner
  -> SourceRunner
  -> SourceClient
  -> collector I/O
  -> MetricSnapshot
  -> MetricStore
  -> render
```

Into three separate time domains:

```text
Registration time:
  Action lifecycle
    -> MetricSubscriptionRegistry
    -> CollectorGroupPlanner
    -> CollectorGroupSupervisor starts/updates CollectorGroupRunner instances

Background collection time:
  CollectorGroupRunner timer
    -> SourceClient I/O
    -> RefreshableCache / BackoffPolicy / freshness policy
    -> source/profile-scoped samples written to MetricStore

Render time:
  Action-owned render cadence
    -> synchronous MetricStore read
    -> synchronous fallback composition
    -> view model / PNG cache / Stream Deck update
```

The important product invariant is:

```text
render never awaits collector I/O
```

If a collector is slow:

- that collector group's latest sample ages out;
- related metrics render stale-within-budget or `N/A`;
- unrelated groups continue to render from their own latest samples;
- UI cadence keeps running.

## Life Of A Metric

### Current Pull Life

```text
Action subscribes
  -> Scheduler stores read plan
  -> Scheduler tick finds due group
  -> SourceRunner awaits source candidates
  -> SourceClient awaits collector I/O
  -> MetricSnapshot returns
  -> MetricStore ingests
  -> subscriber callback renders
```

Problem: render cadence is downstream of collector I/O. Phase 5a/5b group
isolation reduces blast radius, but the group still waits.

### Target Background Life

```text
Action appears
  -> registers MetricSubscription records
  -> CollectorGroupPlanner maps subscriptions to collector group keys
  -> CollectorGroupSupervisor starts/updates needed runners
  -> CollectorGroupRunner refreshes in the background
  -> SourceClient performs I/O
  -> successful source/profile samples are written to MetricStore
  -> action render timer reads MetricStore synchronously
```

This keeps coalescing by collector group while preventing collection latency from
becoming render latency.

## Naming Decisions

| Concept | Final name | Why |
| --- | --- | --- |
| Visible action request to keep a metric fresh | `MetricSubscription` | Uses a generic term that TypeScript/JS developers understand. TSDoc must clarify this is a collection subscription, not a value-event callback. |
| Registry of visible metric subscriptions | `MetricSubscriptionRegistry` | Tracks active subscriptions, ref-counts, source policy, and requested intervals. |
| Registration-time group planner | `CollectorGroupPlanner` | Keeps the same naming family as supervisor/runner and answers "group of what?" |
| Runtime group lifecycle owner | `CollectorGroupSupervisor` | Starts, updates, and stops runner instances. It is not a generic runtime engine. |
| One background refresh loop | `CollectorGroupRunner` | More accurate than `CollectorGroup`; this is one source/profile + polling-group loop, not a group of collectors. |
| Fallback selection helper | `FallbackComposer` | Pure helper that composes already-known source/profile samples according to policy. |
| Runtime tuple key | `collectorGroupKey` | Serialized identity for one source profile/source id + source-declared `pollingGroupId`. |
| Source-declared cost label | `pollingGroupId` | String owned by a source resolver, such as `cpu`, `network-traffic`, or `lhm-snapshot`. |

Preferred code folder:

```text
packages/hub/src/runtime/metric-collection/
  metric-subscription-registry.ts
  collector-group-planner.ts
  collector-group-supervisor.ts
  collector-group-runner.ts
  fallback-composer.ts
```

Do not create every file before it has a real owner. The folder is named now so
the first implementation slice does not scatter new runtime polling files across
`runtime/`.

## Component Boundaries

### `MetricSubscriptionRegistry`

Tracks visible metric collection subscriptions.

A `MetricSubscription` means "keep this metric fresh for this action"; it does
not deliver samples or own render callbacks. Actions render on their own cadence
and synchronously read `MetricStore`.

Responsibilities:

- Register/unregister collection subscriptions on action appear/disappear.
- Track subscriber/action id, metric key, source policy, and requested interval.
- Reference-count equivalent subscriptions so multiple widgets do not multiply
  collector work.
- Expose subscription changes to the planner/supervisor.
- Receive source policy/profile/descriptor version invalidation and trigger
  re-planning for affected subscriptions.

Non-responsibilities:

- No source I/O.
- No fallback execution.
- No rendering.
- No `MetricStore` mutation.

Shape:

```typescript
interface MetricSubscription {
    readonly subscriberId: string;
    readonly metricKey: string;
    readonly sourcePolicy: MetricSourcePolicy;
    readonly intervalMilliseconds: number;
}
```

`intervalMilliseconds` comes from widget preferences. If multiple active
subscriptions for the same collector group request different intervals, the
runner uses the minimum active interval. This preserves the fastest visible
widget while allowing collection to slow down when the fast widget disappears.

Invalidation sources:

- The settings/source-profile layer emits invalidation when a source profile,
  source policy, or widget metric selection changes.
- Source clients emit invalidation when cached descriptor metadata changes, such
  as a helper reconnect discovering a new LHM sensor set.
- The concrete event mechanism can be a direct runtime callback or a small
  lifecycle event channel, but invalidation must enter through this registry so
  re-planning stays centralized.

### `CollectorGroupPlanner`

Registration-time planner. This preserves Phase 5b's source-declared group
capability without keeping it in the render hot path.

Responsibilities:

- Map active `MetricSubscription` records to collector group keys.
- Use source-declared polling group metadata.
- Preserve `MetricSourceProfile.id` isolation.
- Treat unknown dynamic metrics conservatively.
- Re-plan on source policy, profile, or descriptor metadata changes.

Non-responsibilities:

- No timers.
- No source I/O.
- No backoff.
- No `MetricStore` writes.
- No render triggering.

### `CollectorGroupSupervisor`

Composition owner for runner instances.

Responsibilities:

- Start and stop `CollectorGroupRunner` instances as subscriptions appear or
  disappear.
- Update runner metric sets and minimum intervals when subscriptions change.
- Keep collection grouped by collector cost, not by widget or metric count.
- Dispose timers on shutdown.

Non-responsibilities:

- No direct source I/O except through runners.
- No fallback composition.
- No rendering.
- No source descriptor discovery.

### `CollectorGroupRunner`

One background refresh loop for one source profile/source id +
source-declared polling group.

Responsibilities:

- Own timer, in-flight guard, backoff, freshness, and cache for one group.
- Build the requested metric set from active subscriptions assigned to the
  group.
- Call source I/O through `SourceClient`.
- Write successful source/profile-scoped samples to `MetricStore`.
- On failure or missing data, write no new sample. Existing timestamps naturally
  age out and render as stale-within-budget or `N/A`.

Non-responsibilities:

- No widget lifecycle.
- No global planning.
- No renderer calls.
- No cross-source fallback policy.

Demand-change race rule:

- Do not cancel an in-flight source call only because demand changed.
- Demand changes affect the next scheduled refresh.
- If the last subscription for a runner disappears, mark the runner stopping.
  The in-flight call may finish, but its result must not write samples for a
  stopped or superseded runner generation.
- Interval changes update the next tick. They do not reset an active I/O call.

A simple generation counter is enough for the stopped/superseded guard. Increment
the runner generation when the runner stops, restarts, or receives a replacement
metric set. An in-flight refresh captures its generation at start and checks that
generation again before writing.

`CollectorGroupRunner` should reuse Phase 3 primitives. It should not reinvent a
parallel cache state machine:

- use `RefreshableCache<T>` when a group needs TTL, in-flight dedup, and
  stale/unavailable semantics;
- use `BackoffPolicy` when failed attempts should skip future refreshes for a
  measured interval;
- keep collector-specific timeouts explicit at the source boundary.

### `FallbackComposer`

Pure helper, not a long-lived orchestration class.

Responsibilities:

- Given a metric subscription, source policy, and latest source/profile samples,
  choose the displayable metric value according to fallback policy.
- Validate sample freshness and value shape before accepting it.

Non-responsibilities:

- No timers.
- No source I/O.
- No backoff.
- No `MetricStore` mutation.
- No UI callbacks.

Fallback composition happens at read time, not write time:

```text
CollectorGroupRunner(windows-helper:cpu) writes windows-helper-scoped samples
CollectorGroupRunner(node-system:cpu) writes node-system-scoped samples
Action render tick synchronously asks FallbackComposer for cpu.usage_percent
FallbackComposer reads latest scoped samples and returns helper sample, fallback
sample, or no displayable value
```

Why read-time composition:

- Primary and fallback source profiles may refresh at different times.
- Per-metric `MetricSourcePolicy` stays centralized instead of being copied into
  each runner.
- Collector groups do not need to synchronously call fallback source I/O.
- Render still does not await I/O; it only reads already-known samples.

### `SourceClient` / `MetricSource`

Swappable source adapter boundary. Keep this.

Responsibilities:

- Own source-specific I/O: `node-system`, Windows helper IPC, future custom
  HTTP, future remote agent.
- Declare source-owned polling groups and capabilities.
- Normalize source data into `MetricSnapshot` values.

Non-responsibilities:

- No widget lifecycle.
- No global registry of active subscriptions.
- No renderer behavior.

### `MetricStore`

Render-facing sample/history owner. Keep this owner, but Phase 5c explicitly
extends its key structure so read-time fallback can see multiple source/profile
samples for the same logical metric.

Responsibilities:

- Store latest text/scalar samples and scalar history by source scope and metric
  key.
- Preserve sample timestamps so view builders and fallback composition can
  enforce freshness.
- Provide synchronous reads to actions/rendering.

Non-responsibilities:

- No source policy.
- No source fallback.
- No collector timers.
- No value-changed event bus for render triggering.

Sample identity:

```typescript
interface SourceScopedMetricKey {
    readonly sourceScopeId: string;
    readonly metricKey: string;
}
```

`sourceScopeId` is the runtime identity of the source sample owner:

- for built-in singleton sources, use the stable source id, such as
  `node-system`;
- for configured/profile-backed sources, use `MetricSourceProfile.id`, not
  `source_type_id`.

This is a real MetricStore migration. The pre-5c store was effectively
`Map<metricKey, history>`. Read-time fallback requires
`Map<sourceScopeId + metricKey, history>` so a helper sample and a node-system
fallback sample for `cpu.usage_percent` do not overwrite each other.

`FallbackComposer` reads source-scoped samples in the order declared by the
subscription's source policy. It returns the first fresh, valid displayable value
or a no-data result. Render-facing code may still ask for a logical metric key;
the source-scoped lookup and fallback policy remain runtime internals.

History retention:

- The current product default is a short one-minute scalar history for existing
  sparklines and trend views.
- Do not bake `RingBuffer<60>` into new Phase 5c APIs. Treat 60 samples at 1 Hz
  as today's default retention policy, not a permanent storage contract.
- If future widgets allow 5 minute, 10 minute, or 1 hour history windows, the
  requested history window belongs on the subscription/view demand. MetricStore
  should retain the maximum active requested window per source-scoped metric,
  subject to a product cap and optional downsampling for long windows.
- Long-history support should not change collector ownership. It changes
  retention policy, memory budget, and rendering window selection.
- Retention can vary by metric family. CPU usage may stay a short 60 second
  rolling window, network speed may need a longer 3 minute window, and slow
  moving disk capacity may eventually keep session-length or downsampled
  history. The Store API should expose "history for this metric/window" rather
  than "the last 60 samples."

## Render Trigger Decision

Render is action-owned fixed cadence.

```text
Action appears
  -> register MetricSubscription records
  -> start action render timer, usually 1Hz
  -> each render tick synchronously reads MetricStore
  -> build view model / reuse PNG cache / update Stream Deck
Action disappears
  -> unregister subscriptions
  -> stop render timer
```

Why this is the chosen trigger:

- It most directly enforces "render never awaits collector I/O."
- It matches the Stream Deck widget mental model: the widget refreshes at its
  configured cadence and displays the current known state.
- It works with existing PNG caching: a render tick does not imply a full
  rasterization when the display model is unchanged.
- It keeps data ownership clean. `MetricStore` stores samples; collectors
  collect; actions render.

Rejected render triggers:

| Option | Benefit | Why rejected |
| --- | --- | --- |
| `MetricStore` emits `valueChanged(metricId)` | Renders only when data changes | Turns `MetricStore` into an event bus, couples data write cadence to UI cadence, and can cause multi-metric widgets to render multiple times per collector cycle. |
| `CollectorGroupRunner` notifies actions after writes | Lowest data-to-render delay | Re-couples collectors to UI and recreates the path Phase 5c is trying to break. |
| `CollectorGroupSupervisor` scans active widgets and renders them | Centralized timing control | Risks becoming the next `Scheduler`/god class and blurs action lifecycle ownership. |

## Product Scenarios

### Rotation

Rotation widgets register every metric in the rotation set. The display index
changes over time, but subscriptions stay stable. This avoids first-frame `N/A`
flicker when rotating to a metric that would otherwise start collecting only
after it becomes visible.

This does not optimize extreme "24 metrics x rotating page x multi-metric text"
combinations. If that product mode arrives later, it needs a product-level count
cap and still degrades by collector group freshness instead of resubscribing on
every page change.

### Multi-Metric Text

A multi-metric widget registers all displayed metrics. Each metric group updates
independently. The widget reads all values from `MetricStore`; missing or expired
values render as `N/A` per metric instead of blocking the whole widget.

### Custom HTTP / Catalog Source

Collector group key must include `MetricSourceProfile.id`, not only
`source_type_id`. Two `http-json` profiles are independent isolation domains.
One endpoint/transform response can serve many metrics in one collector group.

### LHM

LHM metric ids are opaque catalog ids. Hub code must not parse source-native
paths. The Windows helper should declare whether metrics share one
`lhm-snapshot` cost group or finer hardware-subtree groups. If the helper serves
one cached full snapshot, asking for 1 or 100 LHM sensors should pay essentially
the same helper collector cost.

### GPU

GPU migration should not hide the current `nvidia-smi` process churn under a new
runtime shape. The first GPU-specific cut remains:

- separate static/model discovery from 1 Hz telemetry;
- cache or very rarely refresh static GPU model data;
- replace per-request cold-spawn telemetry with a measured long-lived
  `nvidia-smi --loop-ms=1000` reader or a direct API path;
- keep the existing action-layer expiry behavior in mind:
  `packages/hub/src/actions/gpu.ts` owns the current 7s rendered stale TTL.

## Ideas Rejected During Design

| Idea | Why it was attractive | Why rejected |
| --- | --- | --- |
| Add a standalone `CollectorRuntime` while keeping Scheduler and SourceRunner intact | Local change; clean-sounding owner for background polling | Adds another orchestration layer instead of collapsing the existing ones. Debug path gets longer. |
| Literal Great Collapse deleting source policy and grouping concepts | Simplifies the diagram dramatically | Deletes concepts required by opaque catalog ids, source profiles, and per-metric fallback policy; complexity would reappear inside workers. |
| Per-hardware workers as the final model | Easy mental model for CPU/GPU/Network | Does not fit LHM full snapshots, custom HTTP profile isolation, remote agents, or source-owned descriptors. |
| Per-source workers as the final model | Matches helper/custom source boundaries | Too broad when one source has multiple independent collector costs; too narrow when fallback spans sources. |
| Dynamic latency-based regrouping | Sounds adaptive to user machines | Optimizes microsecond scheduler overhead and adds nondeterminism. Isolation/backoff/freshness solve the real issue. |
| `MetricRuntime` as the main new class | Convenient composition point | Name is too vague and invites god-class growth. Use smaller owners first. |
| Let each worker implement fallback internally | Looks simple in pseudocode | Duplicates source fallback, invalid-value filtering, logging, and capability handling across workers. |
| Move fallback I/O into rendering | Makes collectors simpler | Violates rendering boundary and would make render wait on sources again. |
| Event-driven render from store/source writes | Avoids render ticks when values do not change | Re-couples data write cadence to UI behavior and adds event fan-out complexity. |

## Migration Principles

This app is not in production, so temporary compile breaks are acceptable when
they prevent old names and old types from dictating the design. That does not
mean the migration should lose verification.

Rules:

- First write the final target boundaries.
- Add characterization tests at the current boundary before moving behavior.
- Prefer slices that can run tests after each meaningful behavior move.
- Do not preserve compatibility paths just to keep old abstractions alive.
- Delete or rename old orchestration types when their responsibilities move.
- Keep `MetricStore`, `SourceClient`, and source descriptor contracts stable
  unless the design explicitly replaces their responsibility.
- Do not introduce a broad `MetricRuntime` or similar composition root unless it
  is a thin wiring file with no policy logic.

## Implementation Slices

These slices are intentionally coarse. Do not turn every type or helper into its
own migration step.

1. **Register subscriptions beside the current path.** Add
   `MetricSubscriptionRegistry` with tests for register/unregister,
   ref-counting, interval minimums, rotation prefetch, and invalidation version
   handling. Wire actions to populate it while the existing Scheduler/source I/O
   still runs, then assert registry state matches current subscriptions. If this
   slice still receives `MetricReadPlan` from `SchedulerBinding`, every such API
   must be named `ReadPlanSubscriptionBridge` and marked `@deprecated`; it is a
   migration bridge, not the final subscription shape.

2. **Move grouping to subscription time.** Introduce `CollectorGroupPlanner`
   under `runtime/metric-collection/` and migrate Phase 5b planner tests to it.
   The planner should operate from `MetricSubscription` records and source
   descriptor/profile versions, not from render ticks.

3. **Introduce background runner mechanics.** Add `CollectorGroupSupervisor` and
   one `CollectorGroupRunner` test with a fake `SourceClient`, fake clock,
   in-flight skip, minimum interval update, stopped-generation guard, backoff,
   and `MetricStore` write. This slice proves background collection without
   changing every metric.

4. **Make MetricStore source-scoped and cut over one low-risk domain.** Extend
   MetricStore writes/reads to support `sourceScopeId + metricKey` sample
   identity, then migrate CPU or memory first. Actions render
   from `MetricStore` on their own cadence; source I/O happens through the
   runner. Verify a slow fake unrelated collector does not delay render cadence.

5. **Migrate remaining built-in domains and fallback composition.** Move network,
   disk, GPU, and helper-backed paths after the runner seam is proven. Add
   read-time `FallbackComposer` tests for primary/fallback freshness, invalid
   values, and profile-id isolation. GPU-specific process-churn work remains a
   separate measured optimization.

6. **Delete old orchestration.** Remove the old Scheduler-as-I/O-owner,
   SourceRunner hot-path orchestration, and temporary static grouping bridges
   only after all active metric paths use subscription-driven background
   collection. Keep or rename any remaining render cadence helper so it clearly
   owns rendering cadence only, not collection.

## Test Migration

- Move Phase 5b planner tests to `CollectorGroupPlanner` instead of keeping a
  duplicate planner test suite.
- Replace Scheduler I/O timing tests with render-cadence tests and
  `CollectorGroupRunner` tests.
- Keep source resolver tests because source-declared grouping remains a product
  contract.
- Add tests that action render cadence does not await a pending runner.
- Add tests that multi-metric render can show fresh CPU while GPU is expired.
- Add tests that source/profile/descriptor invalidation re-plans affected
  subscriptions without requiring action disappear/reappear.

## Verification Gates

- UI render/update path must not await source I/O.
- A slow fake collector must not delay rendering of an unrelated fake metric.
- A multi-metric widget must render fresh CPU while GPU is stale/expired.
- Active subscription reference count must stop collection after the last
  subscriber disappears.
- Two custom source profiles with the same source type must not share a
  collector group.
- Unknown catalog metrics must remain isolated or descriptor-backed; never
  parsed by hub string rules.
- Perf monitor after migration must report `sampleAgeMs`, collector duration,
  collector pending/skipped counts, source/profile freshness, and render/update
  duration separately.

Observability ownership:

- `CollectorGroupRunner` logs collector duration, pending/skipped refreshes,
  timeout/backoff, and writes/no-writes.
- Action/render cadence logs render/update duration and PNG cache hits.
- Perf monitor correlates these logs; it should not infer source ownership from
  process names alone.

## TSDoc Guardrails For Future Agents

The implementation should repeat the ownership boundaries in short TSDoc on
exported types. The comments should be concise, but they must prevent the common
wrong turns:

```typescript
/**
 * Tracks visible metric collection subscriptions.
 *
 * A MetricSubscription means "keep this metric fresh for this action"; it does
 * not deliver samples or own render callbacks.
 */
export interface MetricSubscriptionRegistry { /* ... */ }

/**
 * Plans collector groups from active metric subscriptions.
 *
 * Runs when subscriptions or source metadata change. It must not perform source
 * I/O or run on every render tick.
 */
export interface CollectorGroupPlanner { /* ... */ }

/**
 * Refreshes one source profile and polling group in the background.
 *
 * It writes successful samples to MetricStore, but it does not render widgets or
 * execute cross-source fallback policy.
 */
export interface CollectorGroupRunner { /* ... */ }

/**
 * Stores source-scoped metric samples and history.
 *
 * The current default history is short, but this contract must not promise a
 * fixed 60-sample ring; retention can become metric-specific later.
 */
export interface MetricStore { /* ... */ }
```

## Relationship To Previous Refactor Lessons

The archived codebase refactor plan showed that `MetricAction` and view-update
runner became hard to reason about when one owner accumulated lifecycle,
settings, runtime cache, subscription, and rendering responsibilities. Phase 5c
must not repeat that with a new `MetricRuntime`.

Every component above has a narrow owner. If implementation pressure starts
adding rendering, source policy, Store writes, timer state, and descriptor
refresh into one class, stop and split by the owner list in this document.
