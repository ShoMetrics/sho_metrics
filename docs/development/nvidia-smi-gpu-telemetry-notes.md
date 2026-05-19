# NVIDIA SMI GPU Telemetry Notes

This document records the investigation behind ShoMetrics GPU N/A flicker on Windows
NVIDIA systems.

## Summary

ShoMetrics uses `nvidia-smi` as the Windows NVIDIA GPU telemetry path for fields that
are not reliably available through `systeminformation` in this plugin environment.

The CLI is usually fast, but it has significant tail latency:

- Median calls can complete in roughly 50-65 ms.
- Some calls complete around 1.5-2.2 seconds.
- These slow calls can still return valid data.
- Killing them too early turns a slow-but-valid sample into an empty GPU snapshot.

The observed N/A chain was:

1. Last valid GPU sample is ingested.
2. A later `nvidia-smi` call exceeds the plugin timeout.
3. Node kills the child process with `SIGTERM`.
4. The source returns no GPU metrics for that poll.
5. The action-level GPU sample freshness TTL expires.
6. The widget renders no-data state.

This is not proof that every user will hit the issue, but it proves that the previous
1.5 second `nvidia-smi` timeout was inside the observed normal tail latency range.

## Current Mitigation

The plugin now uses more conservative timeouts:

- `nvidia-smi` process timeout: 3000 ms
- GPU action stale TTL: 7000 ms

This covers the observed 2.0-2.2 second successful CLI calls while still allowing N/A
after real failures. The source-level GPU poll no longer adds a second timeout above
the `nvidia-smi` process timeout; it records source timing and lets the child-process
boundary own process cancellation. The TTL is intentionally below 10 seconds to avoid
showing old values for too long on monitoring-focused Stream Deck profiles.

### Removed source-level failure backoff

The previous source-level GPU backoff was tied to a redundant 3300 ms wrapper
timeout above the 3000 ms `nvidia-smi` process timeout. In normal execution the
child-process timeout resolved first, so the wrapper timeout and its backoff path
were effectively unreachable. This phase removes that dead layer instead of
preserving a misleading throttle.

This means the current GPU source has no source-level failure backoff. The next
freshness/snapshot-cache pass should add real failure-driven backoff at the
collector boundary, triggered by `nvidia-smi` failures or timeouts rather than by
a second wrapper timer. Before adding another warning rate limit for GPU, CPU,
or helper retries, extract a shared low-frequency warning shape instead of
copying ad hoc intervals.

## Known Limitations

### `nvidia-smi` tail latency

`nvidia-smi` is a process-based CLI around NVIDIA driver/NVML telemetry. Its wall-clock
latency is not purely determined by CPU or GPU tier. A high-end machine can still show
slow calls due to driver/NVML initialization, driver locks, Windows process startup, or
GPU state transitions.

### Timeout-induced false failures

If a timeout is shorter than normal tail latency, the plugin creates false failures:

- The query would have succeeded.
- The plugin kills it before stdout is produced.
- The scheduler receives an empty metric snapshot.

### Field splitting is not proven beneficial

Testing separate query groups did not show one consistently slow field. The slow call
can appear in different groups. Splitting fields increases the number of CLI processes
and may increase the chance of hitting tail latency.

An overnight split-field run reinforced this conclusion. The full plugin field query
had a stable median and low p95, but still had roughly 2 second p99/max events. Splitting
fields would not remove the shared CLI/NVML tail; it would multiply the number of process
launches per refresh.

### Stale values vs no-data

The current UI contract treats stale GPU samples as no-data. A better future contract
would preserve the last known value with an explicit stale/error state, so the UI can
avoid both fake freshness and hard N/A flicker.

## REPL: Single Query Performance Test

Paste into Node REPL to test the plugin-style query path:

```js
const { execFile } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const COMMAND = "nvidia-smi";
const ARGS = [
  "--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,power.limit",
  "--format=csv,noheader,nounits",
];

const INTERVAL_MS = 1000;
const TIMEOUT_MS = 10000;
const ROLLING_WINDOW_SIZE = 120;

const samples = [];
const failures = [];
let running = false;
let iteration = 0;
let consecutiveFailures = 0;
let startedAt = Date.now();

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    avg: sum / sorted.length,
    p10: percentile(sorted, 10),
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

function formatMs(value) {
  if (value == null) return "n/a";
  return `${value.toFixed(1)}ms`;
}

function formatSummary(summary) {
  if (!summary) return "no samples";
  return [
    `n=${summary.count}`,
    `min=${formatMs(summary.min)}`,
    `avg=${formatMs(summary.avg)}`,
    `p10=${formatMs(summary.p10)}`,
    `p50=${formatMs(summary.p50)}`,
    `p90=${formatMs(summary.p90)}`,
    `p95=${formatMs(summary.p95)}`,
    `p99=${formatMs(summary.p99)}`,
    `max=${formatMs(summary.max)}`,
  ].join(" ");
}

function printSummary() {
  const rollingSamples = samples.slice(-ROLLING_WINDOW_SIZE);
  const uptimeSeconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log("");
  console.log(`[summary] uptime=${uptimeSeconds}s total=${formatSummary(summarize(samples))}`);
  console.log(`[rolling:${ROLLING_WINDOW_SIZE}] ${formatSummary(summarize(rollingSamples))}`);
  console.log(`[failures] total=${failures.length} consecutive=${consecutiveFailures}`);
  console.log("");
}

function runOnce() {
  if (running) {
    console.log("[skip] previous nvidia-smi still running");
    return;
  }

  running = true;
  iteration += 1;
  const started = performance.now();

  execFile(COMMAND, ARGS, { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 32 * 1024 }, (error, stdout, stderr) => {
    const elapsedMs = performance.now() - started;
    running = false;
    const trimmedOutput = String(stdout || "").trim();
    const trimmedError = String(stderr || "").trim();

    if (error) {
      consecutiveFailures += 1;
      failures.push({
        iteration,
        elapsedMs,
        code: error.code,
        signal: error.signal,
        message: error.message,
        stderr: trimmedError,
        timestamp: new Date().toISOString(),
      });

      console.log(`[${iteration}] FAIL elapsed=${formatMs(elapsedMs)} code=${error.code ?? "unknown"} signal=${error.signal ?? "none"} consecutive=${consecutiveFailures}`);
      if (trimmedError) console.log(`stderr=${trimmedError}`);
      printSummary();
      return;
    }

    consecutiveFailures = 0;
    samples.push(elapsedMs);
    const outputPreview = trimmedOutput.split(/\r?\n/).filter(Boolean)[0] || "<empty>";
    console.log(`[${iteration}] OK elapsed=${formatMs(elapsedMs)} output="${outputPreview}"`);

    if (iteration % 10 === 0 || elapsedMs >= 750) {
      printSummary();
    }
  });
}

const intervalHandle = setInterval(runOnce, INTERVAL_MS);
runOnce();

console.log("nvidia-smi perf test started");
console.log(`interval=${INTERVAL_MS}ms timeout=${TIMEOUT_MS}ms rollingWindow=${ROLLING_WINDOW_SIZE}`);
console.log("Stop with: clearInterval(intervalHandle)");
```

Observed sample from the investigation:

```text
[summary] uptime=215s total=n=180 min=52.0ms avg=326.2ms p10=53.2ms p50=54.8ms p90=1412.5ms p95=1817.7ms p99=2043.8ms max=2052.6ms
[rolling:120] n=120 min=52.0ms avg=368.8ms p10=53.3ms p50=54.6ms p90=1632.7ms p95=1828.3ms p99=2043.8ms max=2052.6ms
[failures] total=0 consecutive=0
```

## REPL: Split Field Performance Test

Paste into Node REPL to compare field groups:

```js
const { execFile } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const INTERVAL_MS = 1000;
const TIMEOUT_MS = 10000;
const ROLLING_WINDOW_SIZE = 120;

const TESTS = [
  { name: "util_temp", fields: ["utilization.gpu", "temperature.gpu"] },
  { name: "memory", fields: ["memory.used", "memory.total"] },
  { name: "power", fields: ["power.draw", "power.limit"] },
  { name: "util_temp_memory", fields: ["utilization.gpu", "temperature.gpu", "memory.used", "memory.total"] },
  { name: "util_temp_power", fields: ["utilization.gpu", "temperature.gpu", "power.draw", "power.limit"] },
  {
    name: "all_plugin_fields",
    fields: ["utilization.gpu", "temperature.gpu", "memory.used", "memory.total", "power.draw", "power.limit"],
  },
];

const stateByTestName = new Map(TESTS.map((test) => [test.name, { samples: [], failures: [], consecutiveFailures: 0 }]));
let cycle = 0;
let running = false;
let startedAt = Date.now();

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    avg: sum / sorted.length,
    p10: percentile(sorted, 10),
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

function formatMs(value) {
  if (value == null) return "n/a";
  return `${value.toFixed(1)}ms`;
}

function formatSummary(summary) {
  if (!summary) return "no samples";
  return [
    `n=${summary.count}`,
    `min=${formatMs(summary.min)}`,
    `avg=${formatMs(summary.avg)}`,
    `p10=${formatMs(summary.p10)}`,
    `p50=${formatMs(summary.p50)}`,
    `p90=${formatMs(summary.p90)}`,
    `p95=${formatMs(summary.p95)}`,
    `p99=${formatMs(summary.p99)}`,
    `max=${formatMs(summary.max)}`,
  ].join(" ");
}

function runNvidiaSmi(test) {
  const started = performance.now();
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      [`--query-gpu=${test.fields.join(",")}`, "--format=csv,noheader,nounits"],
      { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 32 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          test,
          elapsedMs: performance.now() - started,
          output: String(stdout || "").trim(),
          errorOutput: String(stderr || "").trim(),
          error,
        });
      }
    );
  });
}

function recordResult(result) {
  const state = stateByTestName.get(result.test.name);

  if (result.error) {
    state.consecutiveFailures += 1;
    state.failures.push(result);
    console.log(`[${result.test.name}] FAIL elapsed=${formatMs(result.elapsedMs)} code=${result.error.code ?? "unknown"} signal=${result.error.signal ?? "none"} consecutive=${state.consecutiveFailures}`);
    return;
  }

  state.consecutiveFailures = 0;
  state.samples.push(result.elapsedMs);
  const slowMarker = result.elapsedMs >= 750 ? " SLOW" : "";
  const outputPreview = result.output.split(/\r?\n/)[0] || "<empty>";
  console.log(`[${result.test.name}] OK${slowMarker} elapsed=${formatMs(result.elapsedMs)} output="${outputPreview}"`);
}

function printSummary() {
  const uptimeSeconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log("");
  console.log(`[summary] uptime=${uptimeSeconds}s cycles=${cycle}`);

  for (const test of TESTS) {
    const state = stateByTestName.get(test.name);
    const rollingSamples = state.samples.slice(-ROLLING_WINDOW_SIZE);
    console.log(`[${test.name}] total ${formatSummary(summarize(state.samples))} failures=${state.failures.length}`);
    console.log(`[${test.name}] rolling:${ROLLING_WINDOW_SIZE} ${formatSummary(summarize(rollingSamples))}`);
  }

  console.log("");
}

async function runCycle() {
  if (running) {
    console.log("[skip] previous cycle still running");
    return;
  }

  running = true;
  cycle += 1;
  console.log("");
  console.log(`[cycle ${cycle}] ${new Date().toISOString()}`);

  for (const test of TESTS) {
    recordResult(await runNvidiaSmi(test));
  }

  if (cycle % 5 === 0) printSummary();
  running = false;
}

const intervalHandle = setInterval(runCycle, INTERVAL_MS);
runCycle();

console.log("split nvidia-smi perf test started");
console.log(`interval=${INTERVAL_MS}ms timeout=${TIMEOUT_MS}ms rollingWindow=${ROLLING_WINDOW_SIZE}`);
console.log("Stop with: clearInterval(intervalHandle)");
```

Observed sample from the split-field test:

```text
[util_temp] total n=160 min=52.0ms avg=394.1ms p10=52.9ms p50=54.0ms p90=1703.1ms p95=1868.9ms p99=2050.2ms max=2052.7ms failures=0
[memory] total n=160 min=45.4ms avg=73.5ms p10=47.1ms p50=61.1ms p90=64.5ms p95=76.9ms p99=108.0ms max=2037.9ms failures=0
[power] total n=160 min=46.0ms avg=85.9ms p10=47.1ms p50=62.3ms p90=65.6ms p95=78.4ms p99=2018.6ms max=2061.2ms failures=0
[util_temp_memory] total n=160 min=45.2ms avg=136.1ms p10=47.2ms p50=62.0ms p90=77.7ms p95=93.7ms p99=2050.4ms max=2055.5ms failures=0
[util_temp_power] total n=160 min=45.4ms avg=61.9ms p10=47.3ms p50=61.9ms p90=63.9ms p95=77.3ms p99=109.5ms max=110.4ms failures=0
[all_plugin_fields] total n=160 min=44.6ms avg=74.0ms p10=58.4ms p50=61.9ms p90=63.3ms p95=77.5ms p99=109.4ms max=2011.9ms failures=0
```

Overnight split-field sample:

```text
[summary] uptime=11090s cycles=7655
[util_temp] total n=7655 min=51.1ms avg=356.5ms p10=52.6ms p50=53.8ms p90=1677.6ms p95=1866.7ms p99=2030.7ms max=2142.6ms failures=0
[memory] total n=7655 min=42.8ms avg=90.9ms p10=47.0ms p50=61.0ms p90=62.6ms p95=75.9ms p99=2024.7ms max=2086.3ms failures=0
[power] total n=7655 min=43.9ms avg=91.1ms p10=47.2ms p50=62.3ms p90=64.1ms p95=76.6ms p99=2030.8ms max=2173.5ms failures=0
[util_temp_memory] total n=7655 min=43.3ms avg=98.6ms p10=47.1ms p50=61.7ms p90=63.5ms p95=77.5ms p99=2033.9ms max=2097.0ms failures=0
[util_temp_power] total n=7655 min=43.5ms avg=88.9ms p10=47.2ms p50=62.0ms p90=63.7ms p95=77.2ms p99=2025.1ms max=2097.2ms failures=0
[all_plugin_fields] total n=7655 min=43.6ms avg=94.9ms p10=47.3ms p50=61.8ms p90=63.6ms p95=77.7ms p99=2036.0ms max=2074.4ms failures=0
```

Findings from the overnight run:

- No command failures were observed; slow calls still returned valid data.
- The worst observed successful call was 2173.5 ms.
- `all_plugin_fields` stayed fast for p95 and only showed tail latency at p99/max.
- `util_temp` was uniquely noisy at p90/p95, but the same 2 second tail also appeared in memory, power, and combined queries.
- The current 3000 ms process timeout remains above the observed tail with margin, while the old 1500 ms timeout would have killed many successful calls.

## Plugin Log Evidence

Representative failure chain from the plugin log:

```text
05:47:18.235 nvidiaSmiStart queryId=153
05:47:20.147 sourceTimeout pollId=280 elapsedMs=1913 timeoutMs=1800 activeNvidiaSmiQueries=1
05:47:20.149 nvidiaSmiEmptyOutput
05:47:22.516 nvidiaSmiStart queryId=154
05:47:24.335 sourceTimeout pollId=281 elapsedMs=1820 timeoutMs=1800 activeNvidiaSmiQueries=1
05:47:24.482 nvidiaSmiEmptyOutput
05:47:25.xxx GPU widgets rendered no-data state
05:47:30.440 nvidiaSmiSlowSuccess queryId=155 elapsedMs=341
05:47:30.690 GPU widgets rendered valid data again
```

The critical evidence is `activeNvidiaSmiQueries=1`: the plugin was not flooding the
system with concurrent `nvidia-smi` processes in that window.
