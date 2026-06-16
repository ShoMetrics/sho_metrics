# Runtime Collection Prior Art: LibreHardwareMonitor

This note records high-level architecture lessons from LibreHardwareMonitor
for ShoMetrics runtime collection work. It is not an instruction to copy LHM
source code, comments, class names, or file structure.

## Why This Reference Exists

ShoMetrics is also a hardware monitoring application, so ignoring a mature
hardware monitor would be bad engineering. LHM has years of real-world sensor
handling across many machines and hardware families. The useful lesson is the
shape of its runtime data flow, not the exact implementation.

License boundary:

- LHM is primarily MPL 2.0, with third-party notices for additional parts.
- Learning from public architecture ideas does not make ShoMetrics an MPL
  project.
- Copying LHM source text, comments, names, or near-identical control flow is
  not allowed unless that file/dependency is deliberately accepted under the
  relevant license.
- If ShoMetrics later ships `LibreHardwareMonitorLib` inside a Windows helper,
  that helper/release must carry the required MPL and third-party notices. The
  Node hub can still use a different license for files that do not contain LHM
  code.

## High-Level Pattern To Learn

LHM is built around a long-lived hardware and sensor catalog:

```text
Computer
  -> hardware groups
  -> hardware devices
  -> sensors
```

Collection updates the catalog in the background. UI, web, tray, and gadget
views read the latest sensor values from the same catalog. The UI does not own
sensor polling decisions.

This confirms the ShoMetrics Phase 5c direction:

```text
background collection
  -> source/profile-scoped metric store
  -> render cadence reads latest values synchronously
```

## Lessons We Should Keep

| LHM pattern | ShoMetrics implication | Current ShoMetrics status |
| --- | --- | --- |
| Long-lived sensor catalog owned by the source/helper | Dynamic LHM/custom metrics should come from source descriptors, not Hub-side string parsing. | Partly designed in Phase 5b. Not fully implemented for descriptors yet. |
| Background update separate from UI redraw | Stream Deck render cadence should never await WMI, `nvidia-smi`, helper IPC, HTTP, or jq/WASM parsing. | Implemented for built-in actions in Phase 5c slice 5 via background collection. |
| Latest value plus history are both sensor state | `MetricStore` should own latest samples and history, not action classes. | Implemented for current fixed history. Needs future per-metric retention support. |
| History retention is a time-window policy, not a hard global "60 samples forever" rule | CPU can keep a short window, network can keep a longer window, disk/session metrics may need session-length retention. | Not implemented. Current store still has fixed behavior; design should not freeze that as final. |
| Hardware/sensor add/remove events invalidate the UI/catalog | Helper and source descriptor refresh should notify runtime planning instead of leaving many unknown metrics isolated. | Not implemented. Phase 5b has unknown isolation as a safety fallback, not a permanent LHM strategy. |
| Expensive domains can carry source/domain-specific throttles | Disk SMART, storage wakeups, EC reads, GPU APIs, and helper probes should not all inherit one global 1 Hz policy. | Partly implemented through interval/backoff primitives. Domain-specific helper throttles are future work. |
| GPU telemetry uses vendor/native APIs where possible | `nvidia-smi` process spawning is a fallback or temporary path, not the long-term GPU architecture. | Not implemented. Current GPU action can run in background, but process churn remains a separate measured optimization. |

## Lessons We Should Not Copy Directly

- Do not copy LHM's C# visitor pattern into TypeScript just because LHM uses it.
- Do not put settings mutation inside sensor/value objects.
- Do not reproduce LHM class names such as `Computer`, `Hardware`, `Sensor`,
  or `UpdateVisitor` in ShoMetrics runtime code unless the concept is actually
  the same and independently designed.
- Do not convert the Hub into a full desktop hardware tree UI. ShoMetrics has
  Stream Deck action lifecycle, source profiles, fallback policy, render queues,
  and custom HTTP sources; those are different product boundaries.
- Do not use a LHM reference as a reason to add a new abstraction layer. Use it
  only to validate or reject runtime boundary choices.

## Concrete Design Guardrails For ShoMetrics

When changing runtime collection:

1. Keep source acquisition and render cadence separate.
2. Keep source/helper descriptors source-owned.
3. Treat unknown metric isolation as a cold-start safety fallback, not the
   steady-state model for LHM-scale sensors.
4. Prefer source/profile-scoped samples in `MetricStore`; compose fallback at
   read time when rendering needs the logical metric value.
5. Do not make every collector 1 Hz by default. Let each source/domain declare
   the cheapest safe cadence and throttle policy.
6. Do not optimize `nvidia-smi` as the final GPU answer. Measure it as a current
   fallback, then move deep GPU telemetry to helper/native APIs.
7. Add a license review before embedding LHM or any LHM-derived source file in
   a distributable helper.

## Implemented Vs Not Implemented

Implemented in ShoMetrics today:

- Background collection loop for built-in actions.
- Synchronous render-side reads from `MetricStore`.
- Source/profile-scoped sample writes for background collection.
- Read-time fallback composition for source candidate samples.
- Static source-declared polling group planning for built-in metric groups.

Not implemented yet:

- LHM-style descriptor catalog integration.
- Descriptor add/remove invalidation from helper to Hub.
- Per-metric or per-domain history retention.
- Domain-specific helper throttles for SMART/EC/GPU-heavy probes.
- Native/helper GPU telemetry replacing `nvidia-smi`.
- License packaging review for shipping LHM inside a helper.
