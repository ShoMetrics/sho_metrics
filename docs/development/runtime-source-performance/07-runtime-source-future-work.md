# Runtime Source Future Work

This document extracts the forward-looking items from:

1. [Phase 6 Source Capability, GPU, And History](04-phase-6-source-capability-gpu-and-history.md)
2. [Windows Source Latency Findings](05-windows-source-latency-findings.md)
3. [Metric-Level Source Routing](06-metric-level-source-routing.md)

It is an execution guide, not a replacement for those design documents. Keep
the detailed rationale in the original documents; use this file to decide what
can be built next and what still needs another runtime/design step.

## Current Runtime State

The runtime source backend has enough cohesion to move the next product work
into Property Inspector and settings.

Already in place:

- Demand-driven background collection writes samples to `MetricStore`; render
  reads already-known state synchronously.
- Source routing is metric-level, so CPU/RAM/network defaults no longer inherit
  helper-first routing just because a GPU or catalog metric prefers helper.
- `windows-helper` descriptor metadata preloads through
  `listMetricDescriptors([])`.
- Missing helper descriptor metadata resolves as `pendingMetadata`, not
  `unknown`, so descriptor-backed catalog metrics do not create one isolated
  runner per metric while helper metadata is loading.
- Helper descriptors carry descriptor fingerprints and helper-declared polling
  group ids.
- Source metadata invalidation can re-plan active subscriptions when descriptor
  metadata loads or changes.
- Helper snapshot reads return cached values; normal runtime reads do not
  traverse LHM hardware on demand.
- Helper latest values publish by helper polling group during serialized LHM
  traversal, so one group no longer waits for later unrelated hardware before
  it becomes visible.
- `MetricReadPlan` and fallback composition preserve each metric's own source
  route and freshness fallback behavior.
- Runtime folder boundaries are documented and enforced by lint for the main
  source-routing/source-client/metric-collection ownership edges.

## Can Build Next

### LHM Catalog Selection In Property Inspector

This is the next recommended product step.

User-facing goal:

```text
User opens PI
  -> chooses a source-backed catalog metric exposed by the Windows helper
  -> widget saves the source profile id and opaque catalog metric id
  -> action subscribes to that metric
  -> runtime uses descriptor metadata and helper cached reads
```

Required settings invariant:

```text
MetricSlot.metric.target.catalog.metric_id = opaque source metric id
MetricSlot.metric.source.primary_source_profile_id = profile that produced it
```

The read-plan builder must not infer source ownership from strings such as
`lhm.sensor:/...`. The catalog picker or settings write path must save the
source profile id when it saves the catalog metric id.

Work likely needed:

| Area | Needed work | Notes |
| --- | --- | --- |
| PI source catalog UI | Add a picker that lists helper descriptors and writes `CatalogMetricTarget`. | The UI may display descriptor labels/units, but runtime still treats metric ids as opaque. |
| Settings patch path | Write both catalog target and source policy profile id in one user action. | Do not let a catalog metric be stored with an empty source policy. |
| Action target handling | Ensure catalog target resolves to its stored metric id. | Built-in action domains may need a generic catalog action or target path; do not parse LHM ids in action code. |
| Runtime subscription | Use existing metric-level read plan and background collection. | No new collection architecture should be needed. |
| Empty/helper-missing state | Render `N/A` or fallback while helper descriptors/data are unavailable. | Do not block PI or render while waiting for helper. |

### First Custom Catalog Source UI Shape

This can be designed now, but should stay behind the same source-profile
invariant as LHM.

The source profile owns connection details. The widget owns only:

```text
source_policy.primary_source_profile_id
target.catalog.metric_id
cached display hints
```

Do not make widgets store HTTP URLs, auth headers, jq expressions, or source
transport details directly. Those belong to global source profiles and source
clients.

### Rotation And Multi-Metric Widgets With Distinct Metric Keys

The runtime no longer blocks widgets that need several different metrics.

Allowed shape:

```text
slot A -> cpu.usage_percent -> [node-system]
slot B -> gpu.temp          -> [windows-helper, node-system]
slot C -> weather.temp      -> [weather-profile]
```

Each metric can subscribe independently and render from `MetricStore`.

Keep the model metric-level, not widget-level. A widget should ask for the
metrics it needs; runtime should not return one widget-shaped data blob.

## Not Yet Fully Wired

### Helper Catalog Hotplug Refresh

Current behavior:

- Initial descriptor preload is wired.
- A later descriptor read can emit `descriptorChanged` if it observes a changed
  fingerprint.
- Runtime does not poll descriptors forever in the background.

Missing:

- A product trigger for refreshing helper descriptors after startup.

Recommended first trigger:

```text
User opens catalog picker or clicks refresh
  -> PI/Hub asks helper for descriptors
  -> source client records snapshot/fingerprint
  -> changed fingerprint emits source metadata invalidation
  -> active subscriptions re-plan
```

Do not add low-frequency background descriptor polling until a product need or
logs show that manual/lifecycle refresh is insufficient.

### Source Capability Filtering

Current behavior:

- `owned`, `unsupported`, `unknown`, and `pendingMetadata` exist in the source
  polling group resolution shape.
- The planner can skip `unsupported` and `pendingMetadata` candidates.
- Helper descriptor cache misses return `pendingMetadata`.

Missing:

- Helper/custom descriptors do not yet provide a complete source-owned
  unsupported/capability map for every source profile.
- Custom HTTP capability metadata does not exist yet.

This is not a blocker for LHM catalog selection because known descriptor entries
can already resolve to helper-owned polling groups. It matters more when many
source profiles are candidates and known-unsupported sources should be pruned
before any I/O.

### Custom HTTP Source Runtime

Settings already have source profile concepts, and the runtime boundaries can
support custom/catalog sources, but the source itself is not implemented.

Missing:

- Source profile resolver for HTTP source types.
- HTTP source client lifecycle, timeout, parsing, and snapshot normalization.
- Descriptor/capability loading for HTTP-provided catalog metrics.
- Source metadata invalidation when HTTP descriptor/profile metadata changes.
- PI editor for connection/profile details.

Keep these inside source profile/source-client ownership. Do not put HTTP
transport details into widget settings or action render code.

### Same Metric Key With Different Routes In One Widget

Not supported today.

The current render path keys by `metricKey`. That is correct for the current
single-slot and distinct-metric multi-slot shapes.

Missing for same-key/different-route widgets:

```text
render key = (slotId, metricKey)
```

Do not pretend this is solved by read-plan deduplication. It requires a render
contract change and is outside the next PI/catalog work.

## Deferred Runtime Work

| Item | Status | Missing before implementation |
| --- | --- | --- |
| Helper/native GPU telemetry beyond LHM and `nvidia-smi` fallback | Deferred. | Real product need plus a helper/native design, preferably not a long-lived Node-owned `nvidia-smi` process. |
| `nvidia-smi` long-lived spawn loop | Rejected for production. | Do not reopen without new evidence and a process ownership design outside Node hot paths. |
| GPU collector-group backoff | Conditional. | Add only if repeated GPU source failures are measured; scope must be collector-group-level, not source-wide. |
| Direct Node RAM hot path with `os.totalmem()` / `os.freemem()` | Separate performance fix. | Can be implemented independently of PI/catalog work. |
| Windows native aggregate source | Future source. | Needs production source client and validation for CPU/RAM/network/disk choices. |
| Network adapter filtering | Pending validation. | Need adapter matching plus at least 5 upload and 5 download workload validations. |
| Disk throughput production routing | Pending source implementation. | Prefer validated `PhysicalDisk(_Total)` shape or prove per-instance aggregation excludes duplicate totals. |
| Helper hardware-specific slow cadence | Deferred. | Need production helper per-hardware timing evidence. |
| Active GPU-only updates | Deferred. | Need multi-GPU product semantics and descriptor-backed selection behavior. |
| Metric history retention policy | Deferred until widget need. | Add internal per-domain policy in `MetricStore` before any user-facing setting. |
| Fallback reader consuming subscriptions directly | Optional cleanup. | Revisit only if final code shows real duplication between `MetricReadPlan` and `MetricSubscription[]`. |

## Next Work Recommendation

Recommended order from here:

1. Build LHM catalog selection in PI/settings using the source-profile
   invariant.
2. Add a manual/lifecycle descriptor refresh trigger tied to the catalog
   picker, if the picker needs fresh hotplug state.
3. Add custom HTTP source profiles only after the LHM catalog path proves the
   settings and PI shape.
4. Add rotation or multi-metric widgets using distinct metric keys.
5. Revisit optional runtime cleanups only after the user-facing catalog path is
   working.

Do not start with a new runtime coordinator, widget-level data resolver, source
rule engine, or broad fallback system. The current runtime boundaries are the
point: source routing chooses desired metric-level routes, source clients expose
source-owned data, metric collection keeps demanded groups fresh, and render
selects fresh already-collected values.
