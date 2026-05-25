# Windows Source Latency Findings

This document records the May 2026 Windows source latency investigation. It is
not a production routing spec yet. It separates source cost, workload reaction,
value validity, and implementation ownership.

The question is:

```text
For each built-in Windows metric, which source order should be the default?
```

The answer should be maintained as:

```text
safe default + explicit per-key exceptions
```

Do not route by machine model, CPU generation, GPU SKU, or one local benchmark.
Do not invent a metric taxonomy unless a small exception set becomes
unreviewable.

## Source Names

Use these names consistently:

| Name | Meaning | Production equivalent |
| --- | --- | --- |
| `node-system` | Hub-side Node source. Uses `systeminformation`, Node `os`, and ShoMetrics' direct `nvidia-smi` path. | Current built-in source. |
| `windows-native-probe` | Temporary C# probe reading OS aggregate counters such as `GetSystemTimes`, `GlobalMemoryStatusEx`, network counters, and disk PDH. | Future `windows-native` source if added. |
| `lhm-dll-probe` | Temporary C# probe using LibreHardwareMonitor DLL objects directly. | Closest diagnostic stand-in for helper LHM reads. |
| `lhm-json-cache` | LibreHardwareMonitor desktop application's HTTP JSON cache. | External sanity check only; not the helper path. |
| `windows-helper-lhm` | Planned helper source backed by LHM descriptors and cached reads. | Production helper LHM source. |

`lhm-json-cache` and `lhm-dll-probe` are different systems. The JSON path shows
what the desktop app has already refreshed and exposed over HTTP. The DLL probe
shows what the helper-like LHM traversal observes when ShoMetrics drives LHM
itself.

## Measurement Rules

### Cost

Cost means:

```text
how long one source read or hardware update takes
```

Cost must be measured with one source active at a time. Otherwise slow LHM
traversal, `nvidia-smi`, PowerShell, HTTP cache stalls, or disk/network workload
can contaminate each other.

The isolated cost captures below ran for 10 minutes at 1 Hz. The first 30
seconds are excluded from steady-state summaries.

### Reaction

Reaction means:

```text
workload start -> first sample at or above the metric threshold
```

Reaction mixes workload ramp-up, source freshness, cache timing, and polling
phase. It is useful for "does this source see the workload?" It is not enough
by itself to rank source freshness unless the workload and sampling resolution
are designed for that ranking.

Rules used for accepted reaction rows:

- At least 5 workload events.
- Workload exit code must be `0`.
- Workload duration must be long enough for all sources to observe it.
- Polling interval is 500 ms for reaction runs.
- If two columns come from the same C# probe loop, they are not independent
  confirmations.

## Code Evidence

Current ShoMetrics Node source behavior is in
`packages/hub/src/runtime/sources/node-system-source.ts`.

| Metric family | Current Node code path | Important detail |
| --- | --- | --- |
| CPU usage | `pollCpu()` calls `systemInformation.currentLoad()`. | `systeminformation/lib/cpu.js` computes load from `os.cpus()` tick deltas. It is cheap and does not use WMI. |
| RAM used/total | `pollMemory()` calls `systemInformation.mem()`. | `systeminformation/lib/memory.js` starts with Node `os.totalmem()` / `os.freemem()`, then the Windows branch runs PowerShell `Get-CimInstance Win32_PageFileUsage`. |
| Network down/up | `pollNetwork()` calls cached `networkInterfaces()` plus `systemInformation.networkStats(...)`. | `systeminformation/lib/network.js` uses PowerShell `Get-CimInstance Win32_PerfRawData_Tcpip_NetworkInterface` on Windows, then joins that with interface discovery. |
| Disk usage/capacity | `pollDiskUsage()` calls `fsSize()`, `blockDevices()`, and `diskLayout()`. | This is volume metadata, not high-frequency throughput. |
| Disk throughput | `pollDisk()` calls `pollDiskThroughput()` only on `darwin`. | `systeminformation/lib/filesystem.js` returns `null` for `fsStats()` on Windows, so Node has no Windows disk throughput provider here. |
| GPU telemetry | `pollGpu()` calls ShoMetrics' direct `nvidia-smi` query on Windows. | ShoMetrics avoids `systemInformation.graphics()` for hot GPU polling because that function mixes several PowerShell queries with `nvidia-smi`. |

The relevant `systeminformation` version in this workspace is `5.31.5`.

## Prior Art: LiteMonitor

[LiteMonitor](https://github.com/Diorser/LiteMonitor) was reviewed as a prior art.

Its README declares the project under the MIT License. This document records
observed design choices only. No LiteMonitor code is copied into ShoMetrics.

LiteMonitor is a single-process Windows desktop monitor, so its shape is not the
same as ShoMetrics' source/runtime boundary. It uses a central value provider
that switches on metric keys and performs source choice, fallback, value
correction, last-valid reuse, and no-data substitution in one place. That is
acceptable for a small local app, but ShoMetrics should keep those concerns
separate:

```text
metric-level source order
  -> source planning and collection
  -> MetricStore freshness
  -> render-time fallback/N/A
```

Observed LiteMonitor routing:

| Metric area | LiteMonitor shape | ShoMetrics interpretation |
| --- | --- | --- |
| CPU usage and CPU clock | Prefer Windows performance counters; fall back to LHM CPU sensors. | Supports keeping aggregate CPU usage out of LHM. |
| RAM usage | Prefer Windows counters/`GlobalMemoryStatusEx`; fall back to LHM memory sensors. | Supports replacing heavy Node RAM reads with direct OS values instead of using LHM as the primary RAM path. |
| Disk throughput/activity | Prefer Windows `PhysicalDisk(_Total)` counters unless a specific disk is selected; then use LHM storage sensors. | Supports the future `windows-native` disk-throughput direction and the requirement to validate `_Total`/no-duplicate-instance behavior. |
| Disk usage/capacity | Use `DriveInfo`-style OS volume data. | Supports treating volume capacity as OS metadata, not a hardware sensor. |
| GPU load/temp/power/VRAM/fan | Use LHM GPU sensors. | Supports helper/LHM-first GPU sensor routing with `nvidia-smi` only as fallback. |
| CPU temperature, fans, pump, motherboard, battery, voltages | Use LHM sensors. | Supports keeping hardware sensor tree metrics in the helper/LHM source. |
| Network speed | Use LHM network throughput sensors for displayed speed, with native `NetworkInterface` matching and counters for traffic accounting. | Interesting but not enough to change ShoMetrics defaults. ShoMetrics' measurements found naive native/LHM network aggregation can overcount badly; production network routing still needs adapter filtering and workload validation. |

LiteMonitor also contains several LHM workarounds. ShoMetrics does not copy the
implementation. The table is sorted by importance, with `P0`/`S0` highest and
`P4`/`S4` lowest. Experiment ease is a higher-is-easier score.

| Workaround | Status | Importance | Severity | Confidence | Experiment ease | Decision |
| --- | --- | --- | --- | ---: | ---: | --- |
| Keep OS aggregate metrics separate from LHM traversal. | Verified and adopted. | P0 | S1 | 95% | 90% | Adopt. This is the same boundary as metric-level source routing: CPU/RAM/network/disk aggregate metrics should not move to LHM just because the helper is online. |
| Disable LHM sensor value history. | Verified and adopted. | P0 | S2 | 95% | 100% | Adopt. Local diagnostics showed LHM sensors keep value history by default. ShoMetrics owns history in `MetricStore`, so the helper sets `ISensor.ValuesTimeWindow = TimeSpan.Zero` and avoids reflection. |
| Return `0` when a sensor cannot be read. | Rejected by data semantics. | P0 | S1 | 100% | 90% | Reject. `0` is valid telemetry. ShoMetrics preserves no-data/freshness semantics and renders `N/A` when no fresh candidate exists. |
| Catch individual hardware update failures. | Already aligned with helper design. | P1 | S2 | 85% | 70% | Keep. Handle failures at the helper ownership boundary with warnings. Do not swallow all exceptions silently. |
| Reflection-based sensor history mutation. | Rejected by API and NativeAOT/trimming boundary. | P1 | S2 | 100% | 100% | Reject. `ISensor.ValuesTimeWindow` is a public setter, so reflection is unnecessary and worse for published helper builds. |
| Network speed through LHM/native matching. | Pending validation. | P2 | S2 | 60% | 60% | Do not adopt yet. Current naive aggregate paths overcounted; production routing still needs adapter filtering and workload validation. |
| Hardware warmup before first display. | Pending production-shape validation. | P2 | S3 | 70% | 70% | Keep the idea, but implement only through helper background cache readiness and descriptor invalidation. Do not block render paths. |
| Manually clear `Computer.Hardware` after `Computer.Close()`. | Verified and rejected. | P2 | S3 | 95% | 100% | Reject. In LHM 0.9.6, `Computer.Hardware` returns a list built from current groups; clearing the returned list is not a cleanup mechanism. |
| Use slow update cadence for SuperIO/controller/storage-like hardware. | Pending hardware-specific evidence. | P3 | S3 | 50% | 50% | Defer. Add it only after per-hardware update timing from the production helper shows a repeatable slow group. |
| Only update the active GPU. | Pending product semantics. | P4 | S4 | 45% | 40% | Do not adopt now. ShoMetrics needs descriptor-backed catalog behavior and possible multi-GPU selection before narrowing updates this way. |

## Isolated Cost Results

Each source below was measured in its own 10 minute window.

An earlier Node diagnostic ran CPU, RAM, network, and GPU in one loop and
produced only 413 steady-state samples because slow child reads delayed the
whole cycle. That run is superseded for per-metric cost. The Node rows below
come from separate 10 minute runs for each metric group.

| Source/read | Samples | p50 | p95 | p99 | max | >500 ms | >1000 ms | Interpretation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `node-system` CPU `currentLoad()` | 570 | 0.404 ms | 0.656 ms | 0.802 ms | 1.16 ms | 0 | 0 | Cheap enough for CPU usage. |
| `node-system` RAM `systemInformation.mem()` | 570 | 422.8 ms | 1069.0 ms | 1685.6 ms | 1836.1 ms | 65 | 34 | Too expensive for `ram.used` / `ram.total`; it does extra page-file work and has run-to-run tail variation. |
| Bare Node RAM `os.totalmem()` / `os.freemem()` | 570 | 0.012 ms | 0.017 ms | 0.021 ms | 0.064 ms | 0 | 0 | Correct shape if RAM stays in Node. |
| `node-system` network `systemInformation.networkStats()` | 570 | 530.8 ms | 1348.4 ms | 1923.1 ms | 2323.5 ms | 570 | 59 | Slow and variable even when measured alone. It matched the 5-run network workload magnitude better than native/LHM aggregate paths. |
| `node-system` GPU direct `nvidia-smi` | 570 | 53.8 ms | 1723.6 ms | 2000.6 ms | 2043.1 ms | 97 | 97 | Usable fallback with recurring CLI/driver tail. Do not make it a long-lived process. |
| `lhm-json-cache` HTTP read | 570 | 6.794 ms | 18.116 ms | 592.6 ms | 1563.4 ms | 8 | 2 | Cache read is usually cheap, but isolated p99/max still show desktop/HTTP stalls. |
| `windows-native-probe` aggregate read set | 570 | 32.9 ms | 40.7 ms | 46.6 ms | 85.2 ms | 0 | 0 | Direct OS aggregate reads are cheap. |
| `windows-native-probe` CPU `GetSystemTimes` | 570 | 0.134 ms | 0.312 ms | 0.465 ms | 0.564 ms | 0 | 0 | Equivalent source class to Node CPU usage. |
| `windows-native-probe` RAM `GlobalMemoryStatusEx` | 570 | 0.005 ms | 0.008 ms | 0.011 ms | 0.029 ms | 0 | 0 | Equivalent source class to bare Node RAM. |
| `windows-native-probe` network counters | 570 | 32.2 ms | 38.3 ms | 42.3 ms | 79.9 ms | 0 | 0 | Cost is good. Value validity failed the 5-run network workload because aggregation overcounted by about 4x. |
| `windows-native-probe` disk PDH counters | 570 | 0.098 ms | 4.90 ms | 7.68 ms | 9.51 ms | 0 | 0 | Cost is good. Separate read/write workload validation found plausible magnitude when using `PhysicalDisk(_Total)`. |
| `lhm-dll-probe` full traversal | 570 | 93.9 ms | 2013.4 ms | 2123.4 ms | 2156.3 ms | 122 | 122 | Tail persists in isolation. Not a preferred path for OS aggregate metrics. |

Notes:

- `systemInformation.mem()` has clear run-to-run variation: an earlier run had
  p50 around 199 ms, while the isolated RAM-only rerun had p50 around 423 ms
  and p95 over 1s. Both results are much slower than bare `os` memory reads.
- `systemInformation.networkStats()` also varies across runs. Isolation removed
  some measurement contamination from earlier concurrent captures, but the
  network-only rerun still had recurring >1s tails.
- A previous native disk rerun showed one suspicious 500 ms max. The latest
  native-only rerun did not reproduce it; the table uses the latest rerun.

### LHM Hardware Update Cost

These are per-hardware `Update()` calls inside the isolated `lhm-dll-probe`.
Per-hardware update cost is not the same as delivery latency: one slow hardware
update in a single traversal loop can delay values for hardware visited later.
This table includes warmup samples; the full-traversal cost row above reports
steady-state samples after the 30 second warmup.

| Hardware type | Samples, including warmup | p50 | p95 | p99 | max | >500 ms | >1000 ms | Interpretation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| CPU | 600 | 10.4 ms | 1799.7 ms | 1998.6 ms | 2029.5 ms | 112 | 111 | LHM CPU load should not be the preferred CPU usage source. |
| NVIDIA GPU | 600 | 75.9 ms | 96.1 ms | 341.2 ms | 1590.5 ms | 5 | 4 | Good sensor candidate, but still affected by single-loop delivery. |
| Intel GPU | 600 | 0.484 ms | 1.239 ms | 2000.3 ms | 2074.5 ms | 13 | 13 | Usually cheap with recurring tail on this machine. |
| Memory | 1200 | 0.008 ms | 0.016 ms | 0.022 ms | 0.378 ms | 0 | 0 | Cheap inside LHM, but OS RAM values are also direct and avoid traversal. |
| Motherboard | 600 | 0.003 ms | 0.006 ms | 0.015 ms | 0.132 ms | 0 | 0 | Cheap in this run. |
| Network adapters | 19200 | 0.026 ms | 0.077 ms | 0.160 ms | 3.3 ms | 0 | 0 | Cheap per adapter, but aggregate validity failed the 5-run network workload. |

## Reaction Results

### CPU Stress

Five CPU stress attempts did not reach the 80% threshold. The workload is not a
valid reaction test on this machine.

Observed maximum total CPU usage during the five runs:

| Source | Max range |
| --- | ---: |
| `node-system` | 42-52% |
| `windows-native-probe` | 39-49% |
| `lhm-dll-probe` | 38-50% |
| `lhm-json-cache` | 31-41% |

This does not affect the CPU source decision because the cost evidence is
already decisive: Node and native OS counters are cheap, while LHM traversal has
recurring long tails.

The run still exposed a value-shape warning: `lhm-json-cache` reported lower
CPU peaks than the OS-counter sources in every run. That may be desktop cache
timing, LHM's CPU load calculation, or the weak workload missing short peaks.
Do not use LHM CPU load as a preferred aggregate CPU source without a stronger
value-validity test.

### Network

Network upload and download were each run 5 times against a reachable network
share. Each workload copied a 1 GB local test file and exited with code `0`.
The native and DLL values below come from the same C# probe loop, so identical
timing is expected and is not independent confirmation.

| Direction | Workload duration | `node-system` reaction/value | `lhm-json-cache` reaction/value | C# native/LHM probe reaction/value | Value result |
| --- | ---: | ---: | ---: | ---: | --- |
| Upload | 3.7-4.8s | 5/5 reached; median 373 ms; max about 283 MB/s | 5/5 reached; median 995 ms; max about 283 MB/s | 5/5 reached; median 366 ms; native and DLL both max about 1133 MB/s | C# probe values are about 4x Node/JSON. |
| Download | 3.7-5.9s | 5/5 reached; median 383 ms; max about 294 MB/s | 5/5 reached; median 995 ms; max about 293 MB/s | 5/5 reached; median 397 ms; native and DLL both max about 1174 MB/s | C# probe values are about 4x Node/JSON. |

The reaction times prove every source can see the workload. The values prove
the naive native and LHM aggregate paths are not usable yet. Their matching
overcount strongly suggests duplicate adapter aggregation, not a source
freshness issue.

Until adapter filtering is designed and validated:

- keep `node-system` as the safe network default;
- do not use `windows-native-probe` for production network throughput;
- do not use any helper/native network aggregate that naively sums every
  adapter instance. A future descriptor-backed helper LHM network aggregate
  must pass the same adapter filtering and 5-run workload validation before it
  can become a fallback.

### Disk Throughput

Disk read and write were each run 5 times with a 20 GiB local file workload.
Each workload exited with code `0`. Unlike the failing network probe, the
native disk probe reads `PhysicalDisk(_Total)` directly instead of summing all
instances. The comparison below checks reported peak throughput against the
workload's actual average throughput:

| Direction | Workload duration | Actual average | `windows-native-probe` reaction/value | `lhm-json-cache` reaction/value | `lhm-dll-probe` reaction | Value result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Write | 8.6-9.6s | 2144-2375 MiB/s | 5/5 reached; median 967 ms; range 467-2138 ms; peak 3089-3251 MiB/s, 1.3-1.5x actual average | 5/5 reached; median 1975 ms; range 966-3464 ms; peak 2958-3144 MiB/s, 1.3-1.4x actual average | 0/5 reached | Plausible magnitude, but write counters lag read counters and report bursts above workload average. |
| Read | 4.8-5.5s | 3691-4274 MiB/s | 5/5 reached; median 475 ms; range 458-2069 ms; peak 4212-4523 MiB/s, 1.0-1.2x actual average | 5/5 reached; median 969 ms; range 966-2461 ms; peak 4193-4389 MiB/s, 1.0-1.2x actual average | 0/5 reached | Plausible magnitude; no network-style 4x overcount was observed. |

The production conclusion is narrow: if a Windows native source is added,
`PhysicalDisk(_Total)` PDH is the current candidate for Windows disk
read/write/total. Do not implement production disk throughput by summing all
PDH disk instances unless `_Total` is explicitly excluded and the result is
validated against a read/write workload.

Write reaction is slower and burstier than read reaction, probably because
Windows write-back caching moves bytes into memory before the physical disk
counter reflects flush activity. A disk write-speed widget should expect that
shape.

Current Node has no Windows disk throughput provider. `lhm-json-cache` seeing
disk throughput proves the LHM desktop app can expose those values on this
machine, but the current `lhm-dll-probe` configuration did not expose them in
5 read or 5 write runs. Therefore helper LHM is not a validated disk throughput
fallback yet; it would need descriptor-backed exposure and the same value
validation before production routing.

### GPU NVENC

GPU reaction was run 5 times using a real NVENC transcode workload. Each run
lasted 86-88 seconds and exited with code `0`.

Threshold: generic GPU usage >= 5%.

| Source | Reaction shape |
| --- | --- |
| `node-system` direct `nvidia-smi` | 5/5 reached; median 677 ms; range 469-959 ms. |
| `lhm-dll-probe` | 5/5 reached; median 451 ms; range 71-471 ms. |
| `lhm-json-cache` | 5/5 reached; median 677 ms; range 455-972 ms. |

The earlier 9s GPU observation was measurement error from a bad workload. This
valid run still should not be used to rank GPU source freshness because the
metric is generic GPU usage and the sampling interval is 500 ms. The GPU source
decision is based on source ownership and coverage: LHM/helper owns broad sensor
telemetry, while direct `nvidia-smi` remains the fallback. The 71 ms lower bound
in one LHM DLL run is likely background GPU noise crossing the low 5% threshold,
not proof of sub-500 ms workload detection.

## Source Decisions

| Metric | Current decision | Reason |
| --- | --- | --- |
| CPU usage | Keep `node-system` default. Future `windows-native` is acceptable if added. Do not prefer LHM. | Node and native OS counters are cheap. LHM traversal has recurring tail and no ownership advantage for aggregate CPU load. |
| CPU model/base frequency | Keep `node-system`. | Static metadata should stay out of 1 Hz helper traversal. |
| CPU temperature | Use `windows-helper-lhm` when available. | Hardware sensor. Node/systeminformation does not provide a reliable Windows CPU package temperature path here. |
| RAM used/total | Replace the hot path with direct Node `os.totalmem()` / `os.freemem()`, or use future `windows-native` if that source exists. Do not keep `systemInformation.mem()` as fallback for these same values. | `systemInformation.mem()` already depends on OS memory values and adds extra page-file work. It is not more reliable for `ram.used` / `ram.total`. |
| Network down/up | Keep `node-system` until adapter filtering is designed and validated. Do not use helper LHM aggregate as fallback yet. | Native and LHM aggregate paths overcounted by about 4x in 5 upload and 5 download runs. |
| Disk throughput | Future `windows-native` PDH using `PhysicalDisk(_Total)` is the candidate source. Do not route disk throughput through generic LHM traversal. | Native PDH matched read/write workload magnitude without the network-style 4x duplicate-instance bug. Node has no Windows provider in the current path. LHM desktop JSON exposed disk values, but the current DLL probe did not, so helper LHM is not validated as a disk fallback. |
| Disk usage/capacity | `node-system` is acceptable; C# `DriveInfo` is also acceptable if a native aggregate source is added. | Volume metadata, not sensor telemetry. |
| GPU usage/temp/power/VRAM | Prefer `windows-helper-lhm` for sensor coverage, with `node-system` direct `nvidia-smi` as fallback. | GPU telemetry is driver/sensor data. Helper/LHM owns broader sensor coverage; `nvidia-smi` remains the unprivileged fallback. |
| Fans, motherboard, voltages, dynamic catalog sensors | `windows-helper-lhm`. | OS aggregate APIs do not own these hardware sensor tree metrics. |

## Source Preference Implementation Direction

Do not choose defaults by coarse family. `cpu.usage_percent` and a
descriptor-backed CPU temperature sensor are both CPU-related metrics, but they
have different source ownership.

Do not model this as a Cartesian product such as `(metricFamily, metricKind)`.
That creates invalid combinations like "CPU write speed" and becomes a hidden
exception table.

Use a small explicit exception set near metric-source planning:

- default safe path for existing built-ins stays `node-system` first;
- descriptor-backed dynamic LHM ids go directly to `windows-helper-lhm`;
- GPU sensor keys can be explicit `windows-helper-lhm -> node-system`
  exceptions;
- disk throughput can become a `windows-native` exception when the native
  source exists and keeps the validated `_Total`/no-duplicate-instance shape;
- network must not become a native exception until adapter filtering and 5-run
  validation pass.

If the exception set becomes hard to audit, stop and redesign. Do not quietly
introduce a taxonomy or rule engine.

## Production Implementation Validation

The POC has done its job when it exposes the source shape, cost, and failure
mode. Do not keep debugging the POC after it has shown the risk; move the
production implementation forward and keep the validation gates below attached
to that implementation.

Required when implementing production network routing:

1. Add adapter filtering to the production native/helper aggregate path.
2. Run at least 5 upload and 5 download events again.
3. Confirm value magnitude and direction against the workload.

Required when implementing production disk throughput routing:

1. Use the validated `PhysicalDisk(_Total)` PDH counter shape or prove any
   per-instance aggregation excludes duplicate total instances.
2. Keep a read/write workload test that compares reported values with actual
   file size divided by workload duration.
3. If helper LHM is considered as a disk fallback, first prove the helper DLL
   descriptor path exposes disk throughput and passes the same workload test.

Optional, only if CPU reaction becomes relevant:

1. Use a workload that actually drives total CPU over the chosen threshold.
2. Keep the accepted threshold and workload duration in the report.

## Phase 6 Impact

Phase 6 helper work should be revised, not discarded.

The runtime should separate two Windows responsibilities:

```text
OS aggregate collectors:
  CPU usage, RAM, network throughput, disk throughput, disk capacity

LHM sensor collector:
  temperatures, power, fans, voltages, GPU sensors, dynamic catalog sensors
```

This avoids forcing common OS aggregate metrics through LHM just because the
helper is online.

The helper descriptor work, capability invalidation, descriptor-backed dynamic
metrics, and helper source cache are still needed for LHM/catalog metrics.

The current helper group cache removed the worst full-snapshot publication
barrier: a group can become visible before the entire traversal finishes. It
did not make LHM hardware groups independently scheduled. A single traversal
loop can still delay a hardware group visited late, and a slow
`hardware.Update()` still affects that traversal.

Therefore:

- Do not treat the LHM worker refactor as the solution for every Windows
  metric.
- Route OS aggregate metrics to direct OS counters where validated.
- Keep LHM group caching and descriptors for sensor metrics.
