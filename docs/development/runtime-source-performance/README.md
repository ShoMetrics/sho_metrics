# Runtime Source Performance

Read these documents in order:

1. [Phases 1-4 Baseline And Measurement](01-phases-1-4-baseline-and-measurement.md)
2. [Phase 5a/5b Scheduler And Source Grouping](02-phase-5ab-scheduler-and-source-grouping.md)
3. [Phase 5c Demand-Driven Background Collection](03-phase-5c-demand-driven-background-collection.md)
4. [Phase 6 Source Capability, GPU, And History](04-phase-6-source-capability-gpu-and-history.md)
5. [Windows Source Latency Findings](05-windows-source-latency-findings.md)
6. [Metric-Level Source Routing](06-metric-level-source-routing.md)

## Current State

The runtime source work started as a latency investigation and became a runtime
polling architecture cleanup. The product requirement is simple:

```text
ShoMetrics must observe the user's computer without becoming the thing that
slows it down, and one slow collector must not freeze unrelated widgets.
```

The current implementation has completed the measurement and cleanup phases,
Phase 5a/5b grouping work, and the Phase 5c cutover to demand-driven background
collection. UI rendering now reads already-known state from `MetricStore`
instead of waiting on WMI, helper IPC, HTTP, or `nvidia-smi`.

This folder replaces the old single-file
`docs/development/runtime-source-performance-optimization-notes.md`. The split
keeps long-lived evidence and decisions, while removing progress-report wording
that only made sense during the original investigation.

## Document Map

| File | Purpose | Read when |
| --- | --- | --- |
| `01-phases-1-4-baseline-and-measurement.md` | Product priorities, perf gates, measurement protocol, historical latency data, and completed cleanup work. | You need to know why this effort exists and what data justified it. |
| `02-phase-5ab-scheduler-and-source-grouping.md` | Historical Phase 5a/5b design: scheduler grouping, source-declared polling groups, profile isolation, LHM/custom source scale rules. | You need the rationale for source-owned polling groups or the pre-5c scheduler migration. |
| `03-phase-5c-demand-driven-background-collection.md` | Current runtime collection architecture: metric subscriptions, collector group planning, background runners, render cadence, fallback composition, rejected ideas, and Phase 5c invariants. | You are about to change runtime polling, MetricStore writes, source subscriptions, fallback composition, or render timing. |
| `04-phase-6-source-capability-gpu-and-history.md` | Phase 6 design notes for descriptor/capability invalidation, LHM helper snapshot caching, GPU process churn, source capability filtering, and history retention. | You are about to add LHM/custom descriptors, source capability filtering, GPU telemetry changes, or retention policy. |
| `05-windows-source-latency-findings.md` | Evidence-backed Windows source choice notes after comparing Node/systeminformation, C# native counters, helper LHM DLL reads, and LHM JSON cache reads. | You are about to choose the default provider for CPU/RAM/network/disk/GPU metrics or revise Phase 6 helper priorities. |
| `06-metric-level-source-routing.md` | Design for moving source candidate preference from plan-level to metric-level while preserving Phase 5c boundaries. | You are about to change `MetricReadPlan`, local auto source preference, action subscriptions, or render-time fallback order. |

## Non-Negotiable Priorities

1. Do not slow down or weaken the user's computer within the practical limits of
   a monitoring tool.
2. Show correct data, or show `N/A`.
3. Keep widget refresh independent; one stuck collector must not freeze
   unrelated metric groups.
4. Prioritize the default `node-system` path before helper-only paths.
5. Support future LHM, custom HTTP/catalog metrics, rotation, and multi-metric
   widgets without turning the runtime into a god class.

## Architectural Warning

The archived [codebase review refactor plan](../archive/codebase-review-refactor-plan.md)
shows the pattern to avoid: a central owner accumulates lifecycle, settings,
runtime cache, subscription, and rendering responsibilities until every feature
has to pass through it. Phase 5c must not replace `Scheduler` with a new
`MetricRuntime` god class. If a component name can plausibly own everything, it
is probably too vague.
