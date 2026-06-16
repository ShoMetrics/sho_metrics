---
name: performance
description: Use when changing lifecycle hooks, polling, rendering, caching, startup, IPC, benchmarks, throttling, queueing, or any code that may run often enough to affect responsiveness or resource usage.
---

# Performance Guard

Performance work starts with frequency and ownership, not clever code.

## Core Rules

* **DO: Classify the frequency first**: Is this startup-only, lifecycle entry/exit, Property Inspector open, settings change, polling tick, render update, per SVG element, or per metric sample? Treat hot paths and lifecycle paths differently. As a rule of thumb: per render/sample/element and work that can run at least once per second is hot; user edits and action lifecycle events are interactive/lifecycle; app launch and Property Inspector opening are startup. In this repo, lifecycle entry/exit includes Stream Deck action appear/disappear and Property Inspector appear.

* **DO: Measure the boundary before optimizing internals**: Add timing around the suspected transport, queue, rasterizer, SDK call, process call, or codec boundary. Do not guess from code shape. "Proven" means explicit timing logs, benchmark numbers, or production logs around the boundary, with the execution frequency stated. If an architecture-changing fix depends on performance claims, add instrumentation first and report what to measure; do not invent numbers. Obvious hot-path anti-patterns, such as parsing or broad serialization per render, may be fixed directly with a short note on why the cost is self-evident.

* **DO: Keep lifecycle hooks cheap**: Lifecycle entry/exit hooks may send current state, register cleanup, or start/stop ownership. They should not rescan hardware, rebuild broad settings, or trigger repeated expensive work unless measured and justified.

* **DO: Clean up every lifecycle-owned state**: Any per-action `Map`, timer, subscription, child process, queue entry, or runtime cache must have a clear cleanup path on disappear/stop.

* **DO: Coalesce, prioritize, or throttle high-frequency work**: Coalesce repeated work for the same action/target, prioritize user-visible work over background ticks, and throttle/debounce noisy sources. Do not increase global render concurrency unless measurements show queue concurrency is the bottleneck and per-render cost is already under control.

* **DO: Prefer first paint from already-available data**: For Property Inspector startup, use current payload/state for first paint and refresh asynchronously. The async refresh is a one-time deferred update, not recurring render work. Do not block the first UI render on a transport round trip when a safe current payload exists.

* **DO: Keep runtime facts runtime-only**: Option lists, discovered devices, and other ephemeral facts should not be persisted through settings just to move them between plugin and Property Inspector. Use in-memory state and IPC messages such as `sendToPropertyInspector`.

* **DON'T: Treat benchmarks as architecture decisions by themselves**: A slower codec can be acceptable if it runs only on appearance/load/save. A small hot-path cost can be unacceptable if it runs for every visible key.

* **DON'T: Add recurring work to every render unless the cost is proven cheap**: Avoid per-render native text measurement, full system font loading, broad JSON serialization, or wide fallback discovery. If recurring work is necessary, gate it with change detection, dirty flags, throttling, or a cache; centralize cheap guards instead.

* **DON'T: Split external process queries just because one field looks slow**: If tail latency is shared by the process/driver boundary, splitting fields may multiply process launches without removing the tail.

## Red Flags

* A lifecycle hook performs hardware discovery instead of sending already-known runtime state.
* A hot path encodes/decodes settings, performs `JSON.stringify` deep comparisons, or scans broad object graphs.
* A render path enables full system font loading or expensive fallback discovery by default.
* A queue fix increases global concurrency before proving the bottleneck is concurrency.
* A timeout is shorter than observed successful tail latency.
* A runtime option list, discovered device list, or resolved default is written with `setSettings()`.
* A manifest action UUID is used as an action instance cache key; always use the unique per-instance action context/id instead.
* Logs are emitted per frame/tick instead of as aggregated or throttled summaries.

## Final Check

Before finishing a non-trivial performance-sensitive change, include a **Performance Final Check** section in the response and answer:

1. What is the execution frequency?
2. What evidence identifies the bottleneck or risk?
3. What state is allocated, and where is it released?
4. Does this work run only when values change?
5. If this is low-frequency, confirm micro-optimization is not needed and explain why. Still answer cleanup and guard questions.
6. What test, log, or guard prevents duplicate work, flooding, or leaks?

For single-line or obviously low-risk fixes, a one-sentence frequency and cleanup note is enough.
