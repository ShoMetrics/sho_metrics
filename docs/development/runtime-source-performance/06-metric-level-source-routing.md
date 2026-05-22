# Metric-Level Source Routing

This document designs the next runtime source routing change after:

1. [Phase 6 Source Capability, GPU, And History](04-phase-6-source-capability-gpu-and-history.md)
2. [Windows Source Latency Findings](05-windows-source-latency-findings.md)

The goal is narrow: move source candidate preference from the read-plan level
to the metric level.

This is not a new runtime architecture. Phase 5c's registry, planner,
supervisor, runner, store, source clients, and fallback reader are mostly the
right boundaries. The bug is that `MetricReadPlan` currently carries one
`sourceCandidates` array for every metric in the plan, so unrelated metrics
such as `cpu.usage_percent`, `ram.used`, `gpu.temp`, and dynamic catalog ids are
forced to share one source order.

## Problem

Current shape:

```typescript
interface MetricReadPlan {
    readonly sourceScopeId: string;
    readonly metricKeys: readonly string[];
    readonly sourceCandidates: readonly SourceCandidate[];
    readonly failureMode: MetricReadPlanFailureMode;
}
```

On Windows local auto, `sourceCandidates` is currently:

```text
[windows-helper, node-system]
```

That was acceptable while helper support was mostly a fallback experiment. It is
wrong after the Windows source latency findings:

- `cpu.usage_percent`, `cpu.model`, and CPU base frequency should stay on
  `node-system`.
- `ram.used` and `ram.total` should stay on direct OS values, not helper LHM.
- `net.down` and `net.up` should stay on `node-system` until adapter filtering
  is validated.
- GPU sensor metrics may prefer helper/LHM, with direct `nvidia-smi` as fallback.
- Dynamic catalog metrics are source-owned and should follow their selected
  source profile, not a built-in family rule.

The current plan-level source order makes CPU/RAM/network wait behind helper
metadata decisions they do not need. It also makes it impossible to express
mixed widgets later, such as one widget slot showing CPU usage from Node and
another showing GPU temperature from helper.

## Existing Chain

Current metric lifecycle:

```text
MetricAction
  -> getMetricKeys(event)
  -> buildMetricReadPlanForMetricKeys(...)
  -> buildMetricReadPlanFromSourcePolicy(...)
  -> buildMetricSubscriptions(readPlan)
  -> BackgroundCollectionBinding.refresh(...)
  -> BackgroundMetricCollection.registerSubscriptions(...)
  -> MetricSubscriptionRegistry.register(...)
  -> CollectorGroupPlanner.plan(subscriptions)
  -> SourceClient.resolveMetricPollingGroups(...)
  -> CollectorGroupSupervisor.reconcile(...)
  -> CollectorGroupRunner.readSnapshot(...)
  -> MetricStore.ingest(sourceId, snapshot)

Render timer:
  -> MetricAction.getMetricReader(event)
  -> createFallbackMetricStoreReader(metricStore, readPlan, ...)
  -> read MetricStore synchronously
```

Current responsibilities:

| Layer | Files | Responsibility | Preference knowledge |
| --- | --- | --- | --- |
| Action | `metric-action.ts`, action subclasses | Produces metric keys and read plan. | Creates preference through the read plan. |
| Plan builder | `metric-read-plan-builder.ts` | Expands source policy into source candidates. | Creates preference. |
| Subscription registry | `metric-subscription-registry.ts` | Records active collection demand. | Does not interpret preference; stores candidates. |
| Planner | `collector-group-planner.ts` | Turns subscriptions into source collector groups. | Does not interpret preference; iterates candidates. |
| Source clients | `source-client.ts`, `windows-helper-source-client.ts`, `node-system-source.ts` | Declare grouping/capability and read snapshots. | Do not know preference. |
| Supervisor/runner | `collector-group-supervisor.ts`, `collector-group-runner.ts` | Own timer, lifecycle, backoff, generation guard. | Do not know preference. |
| Store | `metric-store.ts` | Stores source-scoped samples. | Does not know preference. |
| Fallback reader | `fallback-composer.ts` | Picks the first fresh source candidate at render time. | Uses preference, but does not create it. |

The healthy part is already there: `MetricSubscription` is per metric and
already carries its own `sourceCandidates`. The unhealthy part is only the
read-plan input that feeds those subscriptions.

## Design Principles

Keep these three planes separate:

```text
Preference:
  metric-level static intent; which source order should be tried for this metric

Planning:
  source-level control-plane fact; whether a source owns, rejects, or needs metadata

Freshness:
  data-plane fact; which already-collected source sample is fresh enough to render
```

Important implications:

- Prefer helper does not mean trust helper.
- Prefer helper does not mean wait for helper.
- Missing helper metadata is `pendingMetadata`, not a render decision.
- Missing fresh helper data is a fallback-reader decision, not a planner decision.
- Source clients must not know widget preference.
- Runners must not know widget preference.
- The Hub must not parse source-native catalog ids to infer preference.

## Proposed Shape

Replace plan-level candidates with metric-level candidates:

```typescript
export interface MetricReadPlan {
    readonly metrics: readonly MetricReadPlanMetric[];
}

export interface MetricReadPlanMetric {
    readonly metricKey: string;
    readonly sourceScopeId: string;
    readonly sourceCandidates: readonly SourceCandidate[];
    readonly failureMode: MetricReadPlanFailureMode;
}
```

`sourceScopeId` moves to the metric entry because `MetricSubscription` already
stores scope per subscription. In today's single-slot actions, all entries in
one plan normally have the same scope. This does not add new behavior; it
removes the inconsistent shape where source candidates are metric-level but
scope stays plan-level.

`failureMode` remains copied per metric because `MetricSubscription` already has
that shape. The source policy is still widget/slot-level for now, so all metrics
from one current single-metric widget normally share the same failure mode. Do
not infer a new user-facing per-metric failure-mode requirement from this type.

`normalizeMetricReadPlan(...)` should:

1. Normalize each metric's source candidates.
2. Preserve candidate order within each metric.
3. Remove exact duplicate metric entries with the same routing identity.
4. Sort metrics by `metricKey` for stable keys/tests.

If normalization sees the same `metricKey` with conflicting routing identity
inside one plan, treat it as a builder bug and throw. Do not silently merge by
`metricKey`, and do not use a full identity dedupe to imply support for
same-key/different-route rendering. A future multi-slot widget that needs the
same metric key rendered with different routes must make the render path key by
`(slotId, metricKey)` instead of bare `metricKey`; that is out of scope here.

`buildMetricReadPlanKey(...)` should include:

```text
for each metric:
  metricKey
  sourceScopeId
  failureMode
  source candidate ids in order
```

Conflict detection may live in `normalizeMetricReadPlan(...)` or directly after
read-plan construction in `buildMetricReadPlanFromSourcePolicy(...)`. The
required behavior is the same: conflicting same-key routes fail loudly before
they can produce ambiguous render behavior.

## Source Preference Resolver

Add one small resolver near read-plan construction:

```text
packages/hub/src/runtime/sources/metric-source-preferences.ts
```

This resolver is only for built-in `local:auto`. It must not become a taxonomy,
rules engine, or machine-specific benchmark table.

Recommended shape:

```typescript
const NODE_OWNED_STABLE_METRIC_KEYS = new Set([
    "cpu.usage_percent",
    "cpu.model",
    "cpu.base_frequency",
    "ram.used",
    "ram.total",
    "net.down",
    "net.up",
    "disk.used",
    "disk.total",
    "disk.available",
    "disk.percent",
]);

const HELPER_SENSOR_WITH_NODE_FALLBACK_METRIC_KEYS = new Set([
    "gpu.usage_percent",
    "gpu.temp",
    "gpu.vram_used",
    "gpu.vram_total",
    "gpu.power",
    "gpu.power_limit",
]);

const HELPER_ONLY_STABLE_METRIC_KEYS = new Set<string>([
    // Empty today. Future stable helper-owned aliases such as CPU temperature
    // can go here when the product adds them.
]);

/**
 * Resolves built-in local:auto source order.
 *
 * Any new built-in stable metric key must be evaluated here and covered by the
 * preference tests. Do not rely on the final Node fallback as the design.
 */
export function resolveLocalAutoMetricSourceCandidates(
    metricKey: string,
    platform: NodeJS.Platform,
): readonly SourceCandidate[] {
    if (platform !== "win32") {
        return [{ sourceId: NODE_SYSTEM_SOURCE_ID }];
    }

    if (NODE_OWNED_STABLE_METRIC_KEYS.has(metricKey)) {
        return [{ sourceId: NODE_SYSTEM_SOURCE_ID }];
    }

    if (HELPER_SENSOR_WITH_NODE_FALLBACK_METRIC_KEYS.has(metricKey)) {
        return [
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
            { sourceId: NODE_SYSTEM_SOURCE_ID },
        ];
    }

    if (HELPER_ONLY_STABLE_METRIC_KEYS.has(metricKey)) {
        return [{ sourceId: WINDOWS_HELPER_SOURCE_ID }];
    }

    // Defensive runtime fallback only. Tests must fail if a known built-in
    // stable metric key reaches this branch without an explicit decision.
    return [{ sourceId: NODE_SYSTEM_SOURCE_ID }];
}
```

File-level comment should state:

```text
This is a small explicit exception set for built-in local:auto metrics. If the
set becomes hard to audit, stop and redesign. Do not turn it into a metric
family taxonomy or hardware/kind Cartesian product.
```

Why exact keys:

- It avoids invalid combinations such as CPU disk write speed.
- It mirrors the source decisions in the Windows source latency findings.
- It keeps dynamic catalog ids source-owned.
- It is easy to audit in code review.
- It forces new built-in stable metric keys to receive an explicit source
  decision in tests, instead of silently inheriting a potentially expensive
  Node path.

Do not add a lint rule for this yet. Add a unit test that enumerates known
built-in stable metric keys and verifies each key is intentionally covered by
one of the local-auto preference sets.

## Explicit Source Profiles

Only `local:auto` uses static metric preferences.

Explicit source profile choices should stay simple:

```text
local:node-system
  -> every requested metric uses [node-system]

local:windows-helper
  -> every requested metric uses [windows-helper]

user-defined profile
  -> every requested metric uses [profile-backed-source-id]
```

Explicit fallback profile ids are appended to each metric's candidate list,
preserving the current behavior. Example:

```text
primary: local:auto
fallbacks: [some-profile]

cpu.usage_percent -> [node-system, some-profile]
gpu.temp          -> [windows-helper, node-system, some-profile]
```

This may look odd for a fallback profile that cannot serve a metric, but that is
already handled by source capability resolution and read-time freshness. Do not
invent per-metric fallback policy until a product setting needs it.

## Catalog Metrics

Catalog metrics must not go through the local-auto exact-key table.

The source of a catalog metric is selected by source policy, and this is an
upstream settings invariant:

```text
target.catalog.metric_id = opaque source metric id
source_policy.primary_source_profile_id = source profile that produced that catalog entry
```

Examples:

```text
LHM sensor:
  metric_id = lhm.sensor:/...
  primary_source_profile_id = local:windows-helper

Weather API:
  metric_id = weather.temperature
  primary_source_profile_id = user-profile:weather-api
```

The read-plan builder cannot reliably detect catalog metrics from metric id
strings without parsing source-owned ids. Hub runtime must not parse
`lhm.sensor:/...`, weather ids, PDH ids, sysfs ids, SMC ids, or any other
source-native shape to infer preference.

If a catalog metric is stored without its source profile, that is a settings or
migration bug. The builder should not add a catalog-id special case to recover.
With the local-auto fallback, such an invalid setting will usually route to the
safe Node default and render `N/A`; that is preferable to teaching the Hub to
guess source ownership from opaque ids.

## Runtime Scenarios

### Helper Not Installed

```text
metric: gpu.temp
preference: [windows-helper, node-system]

planner:
  windows-helper -> pendingMetadata or missing source -> no helper runner
  node-system -> runnable fallback

runner:
  node-system refreshes normally

render:
  helper has no fresh sample
  node has fresh sample
  widget displays node value immediately
```

No ten-second wait is required before falling back to Node.

### Helper Starts Late

```text
startup:
  helper-backed metrics are pendingMetadata
  node-backed fallback groups run where available

helper descriptor preload succeeds:
  source metadata invalidation fires
  BackgroundMetricCollection full re-plans active subscriptions
  helper groups start

render:
  before helper has fresh data -> use node if fresh
  after helper has fresh data -> use helper for helper-preferred metrics
```

The fallback reader does not need to be re-created for freshness. It already
reads from `MetricStore` on every render.

### Helper Preferred Metric With No Node Fallback

```text
metric: future cpu.temperature
preference: [windows-helper]

helper unavailable:
  no helper runner or no fresh helper value

render:
  no fresh candidates
  display N/A
```

This is correct. It is not a blocked fallback path.

This scenario requires the metric to be listed in
`HELPER_ONLY_STABLE_METRIC_KEYS` when that stable alias is introduced. It is not
produced by the initial empty helper-only set.

### Mixed Future Widget

```text
slot A: cpu.usage_percent -> [node-system]
slot B: gpu.temp          -> [windows-helper, node-system]
slot C: catalog weather   -> [weather-profile]
```

All three can share the same background runtime because routing is metric-level,
not widget-level.

## Implementation Plan

### 1. Change `MetricReadPlan`

File:

```text
packages/hub/src/runtime/sources/metric-read-plan.ts
```

Work:

- Replace `sourceScopeId`, `metricKeys`, and plan-level
  `sourceCandidates`/`failureMode` with `metrics: MetricReadPlanMetric[]`.
- Update normalization and read-plan key generation.
- Replace helpers that select candidates for the whole plan with helpers that
  select candidates for one plan metric.
- Add a helper such as `listMetricReadPlanKeys(readPlan)` for lifecycle/debug
  paths that only need the metric key list.
- Add a helper such as `selectMetricReadPlanMetricSourceCandidates(metric)` for
  callers that need to respect one metric's failure mode.
- Throw if the same `metricKey` appears with conflicting routing identity inside
  one plan.
- Keep exports small. Do not add source health or descriptor awareness here.

Estimated production LOC: 80-140.

### 2. Add Local Auto Preference Resolver

File:

```text
packages/hub/src/runtime/sources/metric-source-preferences.ts
```

Work:

- Add exact-key sets from the Windows source latency findings.
- Add `resolveLocalAutoMetricSourceCandidates(metricKey, platform)`.
- Add tests proving CPU/RAM/network/disk usage prefer Node, GPU sensor keys
  prefer helper then Node, non-Windows returns Node, and unknown built-ins
  default to Node.
- Add a coverage test for all known built-in stable metric keys. The defensive
  runtime fallback may return Node for truly unknown strings, but a newly added
  built-in key must fail tests until it receives an explicit source decision.

Estimated production LOC: 70-120.

### 3. Update Read Plan Builder

File:

```text
packages/hub/src/runtime/sources/metric-read-plan-builder.ts
```

Work:

- For `local:auto`, resolve candidates per metric key through the new resolver.
- For explicit built-in profiles and user-defined profiles, apply the explicit
  source candidate to every metric.
- Append explicit fallback profile candidates to every metric, preserving
  current source policy semantics.
- Do not inspect source registry availability here.
- Do not inspect descriptors here.
- Do not parse catalog ids here.

Estimated production LOC: 90-150.

### 4. Update Action Subscription Conversion

File:

```text
packages/hub/src/actions/metric-action.ts
```

Work:

- Update `buildMetricSubscriptions(...)` to map `readPlan.metrics` one-to-one
  into `MetricSubscription[]`.
- Keep subscriber id and interval ownership in the action/binding layer.
- Do not move planning or fallback logic into actions.

Estimated production LOC: 30-60.

### 5. Update Fallback Reader

File:

```text
packages/hub/src/runtime/metric-collection/fallback-composer.ts
```

Work:

- Build `sourceReadersByMetricKey` from normalized plan metrics.
- In `getWidgetData(metricKey, ...)`, use that metric's own source order.
- In `getTextValue(metricKey)`, use that metric's own source order.
- Use `selectMetricReadPlanMetricSourceCandidates(metric)` when building each
  metric's reader list. Render fallback must still respect `failureMode`:
  `empty` mode reads only the primary candidate, while fallback mode reads the
  full candidate list.
- If a render asks for a metric key that is not present in the read plan, return
  no-data `WidgetData` for scalar reads and `undefined` for text reads.
- Keep freshness logic unchanged.
- Keep render path synchronous and I/O-free.

Estimated production LOC: 60-110.

### 6. Update `refreshReadPlanOnce`

File:

```text
packages/hub/src/runtime/metric-collection/background-metric-collection.ts
```

This is not a flatten-all-metrics operation after the plan becomes metric-level.
Build source requests from each metric's own candidates:

```text
sourceMetricKeys = Map<sourceId, Set<metricKey>>

for each metric in normalizeMetricReadPlan(readPlan).metrics:
  for each candidate in selectMetricReadPlanMetricSourceCandidates(metric):
    sourceMetricKeys[candidate.sourceId].add(metric.metricKey)

for each (sourceId, metricKeys) in sourceMetricKeys:
  refreshSourceCandidateOnce({ sourceId }, sorted metricKeys)
```

This preserves current source policy semantics while avoiding the wrong shape
where helper is asked for Node-owned CPU/RAM metrics just because another metric
in the same plan prefers helper.

Estimated production LOC: 25-60.

### 7. Mechanical Follow-Ups

Files likely affected:

```text
packages/hub/src/actions/shared/background-collection-binding.ts
packages/hub/src/runtime/sources/metric-read-plan.test.ts
packages/hub/src/runtime/sources/metric-read-plan-builder.test.ts
packages/hub/src/actions/metric-action.test.ts
packages/hub/src/runtime/metric-collection/fallback-composer.test.ts
```

Work:

- Replace direct `readPlan.metricKeys` reads with a helper such as
  `listMetricReadPlanKeys(readPlan)`.
- Replace direct `readPlan.sourceScopeId` reads with either per-metric debug
  output or remove the scope from that log line if it no longer names a single
  value.
- Keep `BackgroundCollectionBinding` as lifecycle glue only.

Estimated production LOC: 30-70, plus tests.

### 8. Tests

Required tests:

- `local:auto` plans `cpu.usage_percent` as `[node-system]`.
- `local:auto` plans `ram.used` and `ram.total` as `[node-system]`.
- `local:auto` plans `gpu.temp` as `[windows-helper, node-system]`.
- Every known built-in stable metric key is explicitly covered by the
  local-auto preference sets.
  - This requires a canonical built-in stable metric key list. If the codebase
    does not have one yet, add one near metric key constants as part of this
    work. Do not replace this with only a set-disjointness test; disjoint sets
    cannot prove new keys were evaluated.
- Mixed CPU/GPU read plan produces per-metric candidate orders.
- Explicit `local:windows-helper` applies `[windows-helper]` to every metric.
- Explicit `local:node-system` applies `[node-system]` to every metric.
- User-defined source profile applies the profile-backed source id to every
  metric.
- Explicit fallback profiles append to each metric's candidate list.
- `buildMetricSubscriptions(...)` preserves each metric's own source candidates.
- Fallback reader uses `gpu.temp`'s helper-then-node order without affecting
  `cpu.usage_percent`'s node-only order.
- Fallback reader returns no-data for a metric key missing from the read plan.
- `refreshReadPlanOnce(...)` groups requests by per-metric candidates, so each
  source receives only metric keys that list that source as a candidate.
- Helper stale but Node fresh returns Node for helper-preferred metrics.
- Same-fingerprint helper metadata invalidation does not change the fallback
  reader's source order; it only affects planned helper groups.

Estimated test LOC: 200-350.

## What Must Not Change

Do not rewrite these for this work:

- `MetricSubscriptionRegistry`
- `CollectorGroupPlanner`, except type fallout if helper function names change
- `CollectorGroupSupervisor`
- `CollectorGroupRunner`
- `MetricStore`
- Source metadata invalidation
- Windows helper descriptor preload
- Windows helper group cache
- Source client `readSnapshot(...)`

Reason: these layers already have the desired cohesion. They either operate per
subscription/metric already, or they intentionally do not know preference.

## Race Check

Helper-late re-planning does not require a new runner state machine.

Current runner behavior:

```text
CollectorGroupRunner.stop()
  -> isStopped = true
  -> generation += 1

CollectorGroupRunner.updateCollectorGroup(...)
  -> generation += 1

refresh finishes later:
  if isStopped or generation changed:
    skip write
```

Therefore an old in-flight read can waste one request, but it cannot write stale
data after the group was stopped or superseded. That is acceptable for this
work. Add tests if this area is touched, but do not redesign runner lifecycle.

## Out Of Scope

Do not include these in the metric-level routing commit:

- Replacing `node-system` RAM hot path with `os.totalmem()` / `os.freemem()`.
  That is a separate performance fix justified by the Windows latency findings.
- Production Windows native source.
- Network adapter filtering.
- Disk throughput production routing.
- User-facing per-metric source preference settings.
- A rule engine or metric taxonomy.
- Widget-level data resolution. Routing must stay metric-level so future
  rotation, multi-metric widgets, and custom catalog sources compose naturally.

## Future Work

### Revisit `MetricReadPlan` vs Subscriptions

`MetricReadPlan` and `MetricSubscription[]` will remain separate for this
change. That keeps the routing fix focused and avoids mixing render-path cleanup
with source preference behavior.

After metric-level routing is implemented and tests pass, revisit whether
`createFallbackMetricStoreReader(...)` can consume subscription-shaped input
directly. The potential benefit is internal simplification: one less artifact
that carries `metricKey`, `sourceScopeId`, `sourceCandidates`, and `failureMode`.

This is not tied to a user CUJ today. It should happen only if the final code
shows real duplication or synchronization risk after the main routing work
lands.

## Recommended Commit Split

1. Metric-level read plan shape and tests.
2. Local-auto source preference resolver and read-plan builder tests.
3. Action subscription + fallback reader adaptation.
4. RAM direct OS memory hot-path fix as a separate commit.
