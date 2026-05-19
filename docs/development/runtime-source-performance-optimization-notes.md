# Runtime Source Performance Optimization Notes

This document records the runtime source performance work from May 2026. It is
focused on the Stream Deck polling path, `node-system`, the Windows helper, and
the measurement gate used to decide whether an optimization is real.

## Optimization Principles

Runtime source priorities, in order:

1. Do not slow down or weaken the user's computer within the practical limits of
   a monitoring tool. ShoMetrics is an observer; if polling creates sustained
   CPU, IO, memory, process churn, or avoidable security exposure that is
   noticeable on the machine being monitored, the implementation is not
   shippable even when the displayed data is correct.
2. Show correct data, or show `N/A`. A timeout or collector failure must not
   turn into indefinitely stale or fabricated values. Last-good data is only
   acceptable while it is explicitly timestamped and still inside a measured
   freshness budget.
3. Keep widget refresh independent. One stuck collector must not freeze
   unrelated widgets in the same refresh interval. A single bad network, GPU, or
   helper read becoming a global 1 Hz freeze is a product failure.
4. Prioritize the default `node-system` path over helper-only paths. Most users
   are expected to run without the LibreHardwareMonitor helper. Adding or
   optimizing the helper must not slow `node-system`; optimizing `node-system`
   must not block helper progress. They should be isolated rather than taking
   turns being the bottleneck.
5. Everything else comes after these gates: deeper helper metrics, discovery
   polish, nicer diagnostics, and lower-priority UI conveniences are valuable
   only when the observer cost, correctness, and refresh isolation gates are
   satisfied.

This is a product-oriented order, not a code-local order. A fast-looking
implementation that causes the system monitor to become the load, shows wrong
numbers, or lets one slow collector freeze unrelated widgets is worse than an
implementation that occasionally displays `N/A` with a clear failure boundary.

Release gates:

- Resource hard gate: in a 300 second idle capture with the target widget layout,
  ShoMetrics-owned processes should stay below 2% average CPU and 5% p95 CPU.
  Exceeding that is not a "follow-up optimization"; it blocks release until
  fixed or proven to be unrelated to ShoMetrics.
- Shared WMI gate: `WmiPrvSE` is shared by all WMI clients, so it is not direct
  attribution. Still, `WmiPrvSE` above 3% p95 requires investigation, and above
  5% p95 blocks release until ETW/WMI-Activity proves ShoMetrics is not the
  cause.
- Process churn gate: no hot path may spawn external processes per widget or
  per metric key. External process work must be collector-owned, rate-limited,
  and measured. `nvidia-smi` cold-spawn p95 above 1000 ms is a known current
  failure to remove from the hot path.
- Correctness gate: every displayed metric must come from a successful
  collector snapshot with a timestamp. If the sample is missing, expired, or
  known to be invalid, display `N/A` instead of reusing a wrong value.
- Freshness target: for 1 Hz widgets, rendered `sampleAgeMs` p90 should be below
  1500 ms for CPU, memory, network, and GPU. This is a target, not permission to
  show incorrect data before 1500 ms.
- Refresh isolation gate: one slow collector must not block unrelated collectors
  or widgets. Current scheduler behavior does not satisfy this, because one slow
  source read can hold the shared interval group active and skip later ticks.
- Scaling gate: collector work must scale with collector count, not widget count
  or displayed key count. A text widget with many keys must still reuse the same
  CPU, memory, network, disk, and GPU collector snapshots.

Freshness policy:

| Data | Freshness budget | Expired behavior | Reason |
| --- | ---: | --- | --- |
| Network interface topology | Fresh for 10s; stale fallback allowed for three discovery windows, currently 30s total | Drop stale topology and emit no network source metrics until discovery recovers | Topology can survive short OS query failures, but stale Wi-Fi/VPN/USB state must not be presented indefinitely. |
| Network traffic rate | 5s at the network action view boundary | Render as `N/A` | Throughput is a hot 1 Hz value; after several missed ticks, the old rate is misleading. |
| GPU telemetry | 1s source cache; 7s action stale TTL | Render as `N/A` | `nvidia-smi` has measured 2.0-2.2s valid tail latency, but temperature, power, and usage cannot remain old forever. |
| CPU model/base frequency | Cache for the process after success; retry static info fetch every 60s after failure | Omit static fields until a retry succeeds | Static CPU identity is safe to cache, but transient startup failures should not cause permanent `N/A`. |
| CPU usage | No source cache | Emit no CPU usage metric for that failed poll | CPU usage is a hot value; stale usage is worse than no data. |

These are current implementation budgets, not universal constants. Changes to
them should be backed by log or perf captures and should preserve the rule that
expired data becomes `N/A` instead of silently reusing old values.

Network topology and traffic freshness are independent. Stale topology inside
the topology budget can still produce fresh traffic samples when `networkStats`
succeeds. When topology expires, or when `networkStats` stops producing samples,
the metric store stops receiving fresh network values and the action view's 5s
traffic budget naturally turns the display into `N/A`.

The GPU row describes the existing GPU action freshness behavior in
`packages/hub/src/actions/gpu.ts`; Phase 2 did not change the GPU TTL.

Measurement protocol:

- Use `npm.cmd run perf:monitor -- --duration-seconds=300 --interval-ms=1000
  --label=<label>` after a debug build when log-derived summaries are needed.
- Compare the same widget layout, same runtime state, and same monitor settings.
- Always report `pollDone`, `pollStartGap`, rendered `sampleAgeMs`, `node`
  parented by `streamdeck`, `WmiPrvSE`, `nvidia-smi`, and
  `counterCollectMilliseconds`.
- Treat process samples as coarse evidence. The sampler uses PDH once per
  interval, and observed `counterCollectMilliseconds` p95 has been 1.3-1.5s in
  these runs. Log summaries are more reliable for polling latency.
- For short-lived `nvidia-smi`, use log `startCount` and elapsed distribution.
  1 Hz process sampling can miss short processes or fail to compute useful CPU.

Recommended comparison protocol:

1. Idle baseline: stop Stream Deck and run the monitor for 5 minutes with the
   same interval and process list.
2. Before-change baseline: start Stream Deck with the target widget layout and
   run the monitor for 5 minutes.
3. After-change baseline: keep the same widget layout and run the monitor for 5
   minutes after the code change.
4. Compare before and after using the same summary fields. Treat the idle
   baseline as monitor/system noise rather than plugin cost.

## Current Situation

The current runtime still has a shared 1 Hz group stall problem. The scheduler
coalesces same-interval metrics into one group. If one collector path is slow,
unrelated widgets in that group wait too.

Historical evidence from the original log investigation:

```text
2026-05-19T02:04:15.723Z Scheduler pollStart 1Hz group
2026-05-19T02:04:18.831Z windows-helper timeout durationMs=3099
2026-05-19T02:04:33.611Z node-system success durationMs=14765 requested=9 resolved=9
2026-05-19T02:04:33.619Z Scheduler pollDone durationMs=17890
```

That means one 1 Hz group was blocked for about 17.9 seconds. The scheduler has
`activePolls`, so it does not pile up concurrent polls for the same group, but
subsequent 1 Hz ticks are skipped while the group is active. The user-visible
effect is that all widgets in that group stop updating.

Historical helper evidence:

- `windows-helper requested=9`: 82 samples, p50 about 2460 ms, p90 about
  2688 ms, max about 2976 ms.
- `windows-helper requested=6`: 4 samples, max 2941 ms, often resolved 0
  metrics because disk usage/volume metrics are not helper-supported stable ids.
- `node-system requested=9`: one fallback took 14765 ms.
- 1 Hz scheduler p90 was about 2731 ms and max was 17890 ms.

The helper latency is not IPC latency. Local named pipe round trips should be
sub-millisecond. The 2-3s latency is consistent with synchronous
LibreHardwareMonitor traversal inside the request path. Caching the helper's
latest hardware snapshot would solve the hot response path; caching pipe
responses would only hide the problem.

Current post-network-cache evidence:

| Metric | Baseline | After `2729ca7` | After `82b559a` |
| --- | ---: | ---: | ---: |
| 1 Hz `pollDone` count | 154 | 241 | 206 |
| 1 Hz `pollDone` p50 | 1111 ms | 339 ms | 654 ms |
| 1 Hz `pollDone` p90 | 2377 ms | 1759 ms | 2286 ms |
| 1 Hz `pollDone` p95 | 2447 ms | 2276 ms | 2955 ms |
| 1 Hz `pollDone` max | 2795 ms | 3121 ms | 5583 ms |
| 1 Hz `pollStartGap` p50 | 2009 ms | 1009 ms | 1012 ms |
| 1 Hz `pollStartGap` p90 | 3064 ms | 2018 ms | 3040 ms |
| 1 Hz `pollStartGap` max | 3169 ms | 3218 ms | 6060 ms |
| rendered `net.down,net.up` sample age p50 | 1221 ms | 461 ms | 771 ms |
| rendered `net.down,net.up` sample age p90 | 2484 ms | 1892 ms | 2424 ms |
| rendered CPU sample age p90 | 2416 ms | 1799 ms | 2325 ms |
| rendered GPU usage sample age p90 | 2581 ms | 1952 ms | 2489 ms |
| rendered GPU usage sample age p95 | 2643 ms | 2469 ms | 3163 ms |
| `node` parent=`streamdeck` CPU average | 0.631% | 0.731% | 0.657% |
| `node` parent=`streamdeck` CPU p95 | 1.29% | 1.597% | 1.665% |
| `WmiPrvSE` CPU average | 1.357% | 1.01% | 1.07% |
| `WmiPrvSE` CPU p95 | 2.706% | 2.241% | 2.434% |
| `nvidia-smi` start count | 125 | 138 | 132 |
| `nvidia-smi` elapsed p50 | 813 ms | 71 ms | 70 ms |
| `nvidia-smi` elapsed p90 | 1383 ms | 795 ms | 741 ms |
| `nvidia-smi` elapsed p95 | 1546 ms | 1582 ms | 1554 ms |
| `nvidia-smi` elapsed max | 2039 ms | 2045 ms | 2053 ms |
| process sampler `counterCollect` p95 | 1395 ms | 1341 ms | 1542 ms |

The `82b559a` column is a reliability-fix reference run, not attribution for
the latency tail. Its p90/p95/max values are shown because every runtime change
must pass the perf gate, but a single noisy 300 second run is not enough to
claim that stale topology fallback caused the regression.

Perf log inputs:

- Baseline: `docs/development/perf-logs/2026-05-19T04-38-55-720Z_measurement-v4-baseline.summary.json`
- After `2729ca7`: `docs/development/perf-logs/2026-05-19T05-02-42-706Z_after-node-network-cache-debug.summary.json`
- After `82b559a`: `docs/development/perf-logs/2026-05-19T05-25-15-047Z_after-stale-network-cache.summary.json`

Interpretation:

- `2729ca7` made the median 1 Hz path much better: `pollDone` p50 improved from
  1111 ms to 339 ms, `pollStartGap` p50 improved from 2009 ms to 1009 ms, and
  network sample age p50 improved from 1221 ms to 461 ms.
- `82b559a` fixed a transient topology-refresh failure mode, not a metric
  correctness exception. It keeps the last-good interface list when
  `networkInterfaces()` fails, then continues to read live `networkStats()` for
  those interface ids. It must not be extended into "keep showing old metric
  values forever"; expired or missing metric samples should become `N/A`.
- The current long tail is still not solved. GPU sample age p95 was 3163 ms in
  the latest run, and `nvidia-smi` still had p95 around 1554 ms with max around
  2053 ms. This makes GPU the strongest current latency suspect.
- The resource hard gate is currently passing in these captures, but with little
  margin. `node` parented by `streamdeck` p95 stayed below 2%, helper service
  p95 was about 0.451% in the latest run, and `WmiPrvSE` p95 was below 3%. This
  does not prove WMI is optimized; it only says the current idle CPU evidence is
  below the immediate stop line.
- The refresh isolation gate is failing architecturally. The scheduler still
  groups same-interval metrics, so a slow GPU/network/helper path can hold the
  whole 1 Hz group active. The latest run's `pollStartGap` max was 6060 ms, and
  the historical log already showed a 17890 ms group stall.

Current blockers by product priority:

1. Refresh isolation is the main product failure. The user sees all same-group
   widgets freeze when one collector stalls.
2. GPU remains the main measured latency suspect. `nvidia-smi` cold-spawn p95 is
   still about 1.5s and GPU sample age p95 reached 3163 ms.
3. Network median improved, but network p90 freshness is still above the 1500 ms
   target in the latest run. The topology-cache failure path now needs an
   explicit expiry policy audit so it cannot become wrong-data behavior.
4. Helper latency is still too slow for synchronous 1 Hz reads, and helper
   unsupported metrics still need capability filtering. This is lower priority
   than `node-system` because the helper should be optional.

Release gate status for the latest run:

- Resource hard gate: PASS, with limited margin. `node` parented by
  `streamdeck` CPU p95 was 1.665%, below the 5% p95 hard gate.
- Shared WMI gate: PASS, with limited margin. `WmiPrvSE` p95 was 2.434%, below
  the 3% investigation threshold.
- Process churn gate: FAIL. `nvidia-smi` elapsed p95 was 1554 ms, above the
  1000 ms hot-path process threshold.
- Correctness gate: needs audit. Last-good topology fallback is bounded, but the
  runtime cache policy still needs an explicit expiry review before expanding
  the pattern.
- Freshness target: FAIL. GPU usage sample age p95 was 3163 ms, above the 1500
  ms 1 Hz target.
- Refresh isolation gate: FAIL. Same-interval widgets can still wait behind one
  slow collector.
- Scaling gate: not measured. The current perf runs do not cover many text
  widgets with many metric keys.

## Completed Work

| Commit | Scope | Result |
| --- | --- | --- |
| `5e8d724 Add runtime performance monitor` | Added a PDH/log-based runtime monitor with raw NDJSON and summary JSON output. | Instrumentation only. It created the gate used by later captures; no runtime source behavior changed. |
| `7c255d5 Refine runtime performance monitor sampling` | Made the monitor more honest: time-based PDH warm-up, `info:no-targets`, `counterCollectMilliseconds`, schema notes, and recommended baseline protocol. | Measurement version 4 baseline produced comparable numbers: 1 Hz `pollDone` p50 1111 ms, p90 2377 ms; `node` parent=`streamdeck` CPU p95 1.29%; `WmiPrvSE` p95 2.706%. |
| `1df7566 Handle local pipe disconnects` | C# named pipe bugfix. Treats Win32 229 as local pipe behavior and downgrades expected broken-pipe disconnects to debug. | Correctness/log-noise fix. It does not claim a polling latency win. Verified with `dotnet build ... -o C:\tmp\sho-service-build`. |
| `2729ca7 Cache network interface discovery` | Moved `networkInterfaces()` out of every 1 Hz network poll. Cached usable interface discovery for 10s and queried `networkStats()` for known interface ids. | Median improvement: `pollDone` p50 1111 -> 339 ms, `pollStartGap` p50 2009 -> 1009 ms, network sample age p50 1221 -> 461 ms. `WmiPrvSE` p95 improved 2.706% -> 2.241%. |
| `82b559a Preserve stale network interfaces` | On interface refresh failure, keeps last-good interface topology and throttles refresh retry instead of returning empty metrics immediately. Added tests for stale topology fallback and missing stats. | Reliability improvement for transient topology discovery failure, not permission to show old metric values indefinitely. Latest perf run: `pollDone` p50 654 ms, p90 2286 ms, p95 2955 ms; network sample age p50 771 ms, p90 2424 ms. Better than original median, worse than the previous run's tail. Production observability comes from the `Network interface refresh failed; using stale interfaces` warning frequency. |

## Architectural Risks

`node-system-source.ts` showed kitchen-sink pressure during the first two
runtime performance phases. Local line counts show the file grew from 534 lines
at `425828e` to 677 lines at `82b559a`, a 143-line increase of about 27%.

The risky pattern was not the line count alone. Network interface topology, GPU
telemetry, and CPU static info each grew their own async cache/state-machine
shape. They had different field names and small policy differences, but they
were all variations of the same work: hold a last-good value, coalesce an
in-flight refresh, decide whether stale data is still usable, and throttle retry
or logging.

Phase 3 starts paying that debt down with two small runtime-source utilities:

- `RefreshableCache<T>` owns the ShoMetrics `fresh` / `stale` /
  `unavailable` facade and delegates storage/fetch mechanics to `lru-cache`.
- `BackoffPolicy` owns initial/max/factor retry delay.

Network interface topology and CPU static info now use those utilities. GPU
telemetry remains manual for now because its current behavior includes
`null`/no-data handling and a lower-level `nvidia-smi` process timeout. Do not
force GPU through the shared cache until the GPU freshness and failure policy is
explicit; that would only move the same ambiguity into a cleaner-looking file.
After this extraction, `node-system-source.ts` is back down to about 642 lines,
with the shared cache/backoff code living in small tested runtime-source
utilities.

`lru-cache` is not treated as the freshness policy source of truth. It does not
preemptively prune expired entries by default, and this wrapper intentionally
stores only one entry per collector cache. ShoMetrics still uses its own
timestamps and max-stale budget to decide when stale data becomes `N/A`.
The current dependency is `lru-cache@^11.3.6`, which adds no transitive runtime
dependencies in `package-lock.json`. Keep major-version upgrades explicit:
`lru-cache` has shipped breaking API changes across majors, and the
`RefreshableCache<T>` facade depends on the v11 `fetchMethod`/status behavior.

Network interface discovery failures now report as throttled warnings at the
source boundary, including cold-start failures with no cached topology. This is
intentional: discovery failure is a recoverable OS/runtime condition, repeated
failures should not spam logs, and the correctness behavior remains no network
source metrics when no fresh or allowed-stale topology exists.

Collector-specific policy such as timeout, exponential backoff, freshness
budgets, and warning text should stay explicit and tested. Shared
TTL/dedup/stale behavior should not be hand-copied again. If a later helper,
disk, GPU, or source snapshot cache needs this pattern, it should use the same
small primitives or deliberately justify why the policy is different.

One debt remains in the caller glue: owners still combine
`RefreshableCache<T>`, `BackoffPolicy`, and logging in a small amount of local
code. With two callers this is acceptable and keeps cache/backoff separate. If a
third runtime-source cache repeats the same check-fresh/check-backoff/read/log
shape, extract that owner-level glue instead of copying it.

## Next Plan

1. Repeat the latest 300 second capture before making another performance
   change. The last run had `counterCollectMilliseconds` p95 1542 ms and
   `pollStartGap` max 6060 ms, so one run is not enough to blame a specific
   code change. Do not optimize from a noisy single sample.

2. Audit correctness expiry for cached runtime data. Last-good topology or
   snapshot data must carry enough timestamp/max-age information to decide
   between "safe recent data" and `N/A`. This is a correctness gate, not a
   latency optimization.

3. Continue reducing source cache duplication before the next collector change.
   `RefreshableCache<T>` and `BackoffPolicy` now cover network topology and CPU
   static info, with `RefreshableCache<T>` backed by `lru-cache` for storage and
   fetch coalescing. Do not add a fourth hand-written cache in
   `node-system-source.ts`; extend or use the existing primitives only after the
   collector's real freshness policy is explicit.

4. Fix the GPU hot path next. Current evidence points there more strongly than
   network:

   - Latest GPU usage sample age p95: 3163 ms.
   - Latest `nvidia-smi` start count: 132 in 300 seconds.
   - Latest `nvidia-smi` elapsed p95: 1554 ms, max 2053 ms.

   The first GPU target should be to separate static/model discovery from 1 Hz
   telemetry. Static GPU model data should be cached or refreshed rarely. 1 Hz
   telemetry should avoid cold-spawning `nvidia-smi` per request. Candidate
   paths are a long-lived `nvidia-smi --loop-ms=1000` reader or a direct API,
   but either must be measured before replacing the current path.

5. Move toward collector-owned snapshot caches, not widget-owned polling:

   ```text
   collector tick -> latest snapshot cache <- widget scheduler read
   ```

   Each collector should have one in-flight operation, a TTL/backoff policy, and
   last-good data. CPU, memory, network, disk, and GPU should not block each
   other's 1 Hz freshness. Do not split by metric or widget.

6. Add source capability filtering as a separate behavior change. The helper
   should not be asked for disk usage/volume stable ids it cannot resolve. The
   historical evidence showed `windows-helper requested=6` returning zero
   resolved metrics after spending up to 2941 ms.

7. Optimize the Windows helper after the default node path is under control. The
   likely helper design is background LibreHardwareMonitor sampling into a
   latest snapshot cache, with IPC reads returning the cached snapshot quickly.
   The goal is to remove synchronous LHM traversal from the pipe request path.

8. Use ETW/WPR/PerfView when process attribution matters. PDH summaries are
   useful for coarse regression gates, but they cannot accurately attribute
   shared `WmiPrvSE` work to this plugin and can miss short-lived `nvidia-smi`
   processes.
