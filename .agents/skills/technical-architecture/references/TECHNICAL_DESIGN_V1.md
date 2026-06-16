# Technical Design Document V1: ShoMetrics (Early Architecture)

This is the early architecture document. Keep it as historical context for why
ShoMetrics chose a source-oriented, pre-rasterized Stream Deck architecture.
Do not treat details such as directory trees, launch phases, source interfaces,
or code snippets as current implementation truth.

For current architecture guidance, read `TECHNICAL_ARCHITECTURE.md`.

## 1. Context

*   **Objective:**
    To architect a modern, decoupled, and extensible system monitoring plugin for the Elgato Stream Deck. **ShoMetrics** (a portmanteau of "Show Metrics" and the Japanese concept "Shoha/照破") transforms local and remote telemetry into highly customizable, responsive SVG widgets.
*   **Background:**
    ShoMetrics needs to support responsive system monitoring across platforms without tying the core plugin to a single operating system, hardware sensor stack, or rendering engine. The architecture must keep memory usage controlled, avoid blocking the Node.js event loop during telemetry polling, and allow deeper hardware sensors such as GPU thermals to be added without rewriting the rendering or settings layers. A "Source-Agnostic" architecture is required to gracefully scale from basic cross-platform telemetry up to deep, OS-specific hardware monitoring.
*   **Goals & Non-Goals:**
    *   *Goals:*
        *   **Graceful Degradation (Tiered Sources):** Default to a native Node.js cross-platform fallback (Node System Source) and scale up to separate source clients for Windows local helpers, macOS local helpers, and remote agents. The source layer MUST be swappable by design via a `MetricSource` contract, even if only the Node system source is implemented initially.
        *   **Decoupled State:** Centralize the 60-second rolling history buffer inside the Node.js Plugin to ensure state consistency regardless of the data source.
        *   **Pre-Rasterized Rendering via `@resvg/resvg-js`:** Compose SVG in Node.js, rasterize to PNG via resvg (Rust N-API bindings), then push PNG to Stream Deck via `setImage()`. See [Section 2.4](#24-rendering-pipeline-resvg-rasterization) for rationale.
        *   **Composable Widget Architecture:** All visual elements (arc gauges, sparklines, bars, text labels) are independent, reusable SVG primitives. Data, metric view composition, and low-level widget primitives are decoupled.
        *   **Strict Contracts:** Metric snapshots use Protocol Buffers (`snapshot.proto`). Persisted Stream Deck settings use generated protobuf types, plain ProtoJSON, and protovalidate at the storage boundary.
        *   **Design With Future In Mind:** Prepare for custom sensors, source profiles, rotation, and multi-slot layouts without modeling them prematurely.
    *   *Non-Goals:*
        *   Local privileged helpers use gRPC over OS-local transports such as Windows named pipes. Remote agents use gRPC over TLS with protobuf contracts when remote monitoring is implemented.
*   **Platforms/Scope:**
    *   **Hardware:** Elgato Stream Deck (Standard, XL) and Stream Deck Plus (Touchstrip).
    *   **OS:** Windows 10/11 (amd64) and macOS (arm64).

## 2. Design

### 2.1 Overview - Hub-and-Spoke Architecture

```text
Metric sources
  -> Scheduler
  -> MetricStore / RingBuffer
  -> WidgetData
  -> view-updates
  -> view-rendering metric views + frame
  -> rasterizer
  -> Stream Deck setImage() / setFeedback()
```

Top-level ownership:

- `contracts/`: protobuf contracts shared across package boundaries.
- `packages/hub/`: Node.js Stream Deck plugin, Property Inspector, settings
  storage, runtime source orchestration, metric store, rendering, and bundling.
- `packages/source-windows/`: Windows-native telemetry helper and installer
  work that must stay outside Hub UI/rendering ownership.
- `site/`: public documentation and website content.
- `docs/`: development plans, implementation notes, and archived research.
- `.agents/`: agent instructions, skills, and local reference material.

1.  **The Hub (Node.js Plugin):** The central brain running inside the Elgato SDK. It manages the 60-second Ring Buffer, coordinates the polling `Scheduler`, passes normalized `WidgetData` to composable SVG widget primitives, rasterizes the composed SVG to PNG via `@resvg/resvg-js`, and pushes the Base64-encoded image to Stream Deck via `setImage()`.
2.  **The Spokes (Metric Sources):** Stateless data providers, all implementing the `MetricSource` contract.
    *   *Node System Source:* Uses the npm `systeminformation` package plus OS command helpers. File: `node-system-source.ts`.
    *   *Local Helper Source (future):* Local OS helpers, such as a Windows service using named pipes, exposed through a `windows-helper-source-client.ts` client.
    *   *Push API Source (future):* HTTP endpoint receiving external payloads. File: `push-api-source.ts`.

### 2.2 Source Layer (Swappable by Design)

All metric sources implement a common interface. The Scheduler consumes this interface, not concrete implementations.

```typescript
// runtime/sources/metric-source.ts

export interface RawMetrics {
    cpu: number;                        // 0-100
    net: { down: number; up: number };  // MB/s
    gpu: GpuSnapshot | null;
}

export interface MetricSource {
    readonly sourceId: string;  // e.g. "node-system", "win-native"
    poll(): Promise<RawMetrics>;
    dispose?(): void;
}
```

**Naming Convention (TDD Term → Code):**

| TDD Term | Code Class | File Name |
|---|---|---|
| Node System Source | `NodeSystemSource` | `node-system-source.ts` |
| Local Helper Source | `WindowsHelperSourceClient` | `windows-helper-source-client.ts` |
| Push API | `PushApiSource` | `push-api-source.ts` |

> "Tier N" terminology is for TDD-level discussion only. Code uses descriptive names.

### 2.3 Data Layer (Ring Buffer + Metric Store)

*   **Ring Buffer:** Fixed-length circular buffer of 60 entries (1 per second = 60s of history). Located at `runtime/ring-buffer.ts`.
*   **Metric Store:** `Map<MetricId, RingBuffer<60>>`. Provides the `WidgetData` shape to the rendering layer. Located at `runtime/metric-store.ts`.
*   **`WidgetData` → the universal data contract between Data and Rendering layers:**

```typescript
// view-rendering/widget-data.ts
export interface WidgetData {
    current: number;               // Latest scalar value (e.g. 65.2)
    progress: number;              // 0.0–1.0 normalized for gauges/bars
    history: readonly number[];    // Last 60 samples for sparklines
    unit: string;                  // "%", "°C", "W", "MB/s"
    label: string;                 // "GPU Usage", "CPU Temp"
    displayValue?: string;         // Optional preformatted display text for compact metric-specific displays.
    sampleTimestampMilliseconds?: number; // Presence means real telemetry has been ingested for this metric.
}
```

**No-data state:** `MetricStore.getWidgetData()` returns numeric defaults when a metric has not been sampled yet, but leaves `sampleTimestampMilliseconds` undefined. Rendering code MUST treat the missing timestamp as "no real sample yet" and render a placeholder without mutating telemetry state.

### 2.4 Rendering Pipeline (resvg Rasterization)

**Decision: Pre-rasterize SVG → PNG in Node.js. Do NOT rely on Stream Deck's native SVG renderer.**

Hardware POC on Stream Deck 7.4.1 / Qt 6.9.3 confirmed SDK `setImage(svg)` is a hard no for this renderer: complex gradients can black-screen and text colors can resolve incorrectly.

**Rationale:**

| Concern | Native SVG (`setImage(svg)`) | Pre-Rasterized PNG via `resvg-js` |
|---|---|---|
| **Complex SVG features** | No - gradients, filters, `%` in attrs, custom fonts frequently break | Yes - full SVG spec compliance via Rust resvg engine |
| **Custom CSS / fonts** | No - not reliably supported; limited internal engine | Yes - resvg supports embedded fonts and inline styles |
| **Cross-platform consistency** | No - rendering varies between Win/Mac SD versions | Yes - pixel-identical output on all platforms |
| **User-generated content** | No - user text with special chars can break XML parsing | Yes - rendered to pixels; no parsing issues |
| **Theme customizability** | No - limited to what SD's renderer supports | Yes - any valid SVG feature works |
| **Debugging** | No - black-box rendering inside SD client | Yes - can snapshot-test PNG output in CI |
| **Performance (144×144 px)** | ~0ms (SD does the work) | ~1–5ms per render (resvg-js native) |
| **Bundle size impact** | None | ~5-10MB (prebuilt N-API binary) |

**Package choice: `@resvg/resvg-js`** (NOT `@resvg/resvg-wasm`)
*   Uses `napi-rs` with prebuilt binaries for win-x64, darwin-arm64, linux-x64 → no `node-gyp` compilation.
*   Unlike `sharp` (libvips) or `node-canvas` (Cairo), resvg-js has zero system-level C/C++ dependencies. The entire renderer is compiled Rust → prebuilt `.node` binary.
*   ~3-10x faster than WASM variant for Node.js workloads.
*   Fallback strategy: if native binary fails to load, fall back to `@resvg/resvg-wasm`.

**Performance budget (worst case: 32-key SD XL, all keys updating at 1Hz):**
*   32 renders × ~3ms = ~96ms per second = 9.6% of one core. Acceptable.
*   With PNG caching (same data + same config = reuse cached PNG), drops to near zero for unchanged keys.

**Rate limit:** Key image updates MUST NOT exceed 10/second per key (Elgato Marketplace guidelines). Our 1Hz scheduler naturally complies.

**First-frame placeholder policy:** Actions render immediately on `onWillAppear` before the first scheduler sample arrives. Placeholders are generated from a render-only `WidgetData` copy:
*   Value, linear, and sparkline widgets display `N/A` with an empty unit while waiting for data.
*   Circular minimal-icon widgets have no value text area; they render the normal widget with progress at zero and a global grayscale + reduced-alpha filter.
*   Placeholder state is inferred from `sampleTimestampMilliseconds == null`; it is never written into `MetricStore`.

### 2.5 Widget Composition Engine

The rendering pipeline is split into three composable phases:

#### 2.5.1 Widget Primitives

Each widget is a **pure function**: `(data: WidgetData, config: TConfig) → SVG string fragment`.

| Primitive | File | Description |
|---|---|---|
| Arc Gauge | `widgets/primitives/arc-gauge.ts` | Circular progress indicator |
| Sparkline | `widgets/primitives/sparkline.ts` | Mini line chart (usage over time) |
| Bar | `widgets/primitives/bar.ts` | Horizontal/vertical progress bar |
| Text Label | `widgets/primitives/text-label.ts` | Formatted text with value |
| Icon | `widgets/primitives/icon.ts` | Status indicator icon |

```typescript
// widgets/widget-contract.ts
export interface WidgetBaseConfig {
    x: number; y: number; width: number; height: number;
}

export interface Widget<TConfig extends WidgetBaseConfig = WidgetBaseConfig> {
    render(data: WidgetData, config: TConfig): string;
}
```

#### 2.5.2 Metric View Composition

Current implementation:

```txt
MetricViewOptions
  -> view-updates/runner.ts
  -> view-rendering/single-metric-view.ts or view-rendering/dual-metric-view.ts
  -> view-rendering/metric-frame.ts
  -> view-rendering/rasterizer.ts
```

The old registry/config-bag path has been removed. Rendering code now uses explicit view functions and meaningful view props instead of universal primitive override bags.

#### 2.5.3 Visual Settings Adapter

Persisted settings do not flow directly into renderer primitives. `settings/visual-adapter.ts` converts resolved appearance settings into the small renderer-facing visual contract used by the metric view runner.

### 2.6 Action Layer (Thin Shell)

Actions are lifecycle shells. They subscribe to metric keys, resolve settings through `MetricAction`, gather metric-specific `WidgetData`, and hand a metric view payload to `view-updates/`.

`MetricAction` owns lifecycle, active action state, scheduler subscriptions, settings refresh, and runtime cache writes. Shared metric view work lives in `view-updates/`. Action-specific builders live under `actions/disk/` and `actions/network/`; the `actions/` root is reserved for Stream Deck action entry files and their direct tests.

### 2.7 Property Inspector (React Composition)

The Property Inspector is a separate browser-side bundle, built from TypeScript/React and loaded by `ui/property-inspector.html`.

**Decision: React 19 + TypeScript.**
*   React is the most stable and broadly supported option for long-term AI-assisted maintenance.
*   React 19 has stable custom-element support, so the UI can continue using vendored `sdpi-components` custom elements such as `<sdpi-item>` and `<sdpi-color>`.
*   The Property Inspector is not on the high-frequency key rendering path; React bundle size and runtime overhead are acceptable for settings UI.

**Composition-first settings UI:**
*   `property-inspector/panels/*` owns visible settings composition.
*   `property-inspector/controls/*` owns DOM/control value conversion.
*   `property-inspector/settings-sync/usePropertyInspectorSettings.ts` owns Stream Deck settings load/save/subscribe lifecycle.
*   `settings/storage/codec.ts` is the only raw SDK settings boundary. `settings/storage/resolver.ts` owns defaults, global cascade, platform context, and runtime facts.
*   Do not restore a schema-driven UI registry, binding registry, or flat Property Inspector settings mirror.

### 2.8 APIs & Interfaces

*   **Metric Snapshot Contract:** `contracts/proto/shometrics/v1/snapshot.proto`. Snapshots contain `captured_at` plus metric-id-keyed values. Source identity, helper health, fallback state, and rendering progress are outside the snapshot payload.
    *   Metric units are canonical `MetricUnit` enum values, not display strings. Source adapters normalize library-native units before writing protobuf.
    *   Metric descriptors carry opaque `source_sensor_id` and `hardware_id` plus display/support metadata. Generic Node runtime code must not parse LHM paths, Linux sysfs paths, NVML fields, SMC keys, or other source-native sensor identifiers.
    *   Stable aliases such as `cpu.usage_percent` remain the cross-source contract for built-in widgets. Source-owned dynamic ids such as `lhm.sensor:/intelcpu/0/temperature/26` are descriptor-backed and intended for discovery/custom selection.
*   **Settings Contract:** `contracts/proto/shometrics/v1/settings.proto`, stored as readable ProtoJSON in Stream Deck settings. `settings/storage/codec.ts` decodes unknown SDK payloads into generated protobuf settings and runs protovalidate. `settings/resolved-settings.ts` is the runtime contract consumed by actions, Property Inspector panels, and renderer adapters.
*   **Wire Protocol:** Local privileged helpers use gRPC over OS-local transports such as Windows named pipes. Remote agents use gRPC over TLS with the same protobuf contracts where possible.
*   **External Push API:** `POST /api/v1/push` with JSON Schema validation (future).

### 2.9 Data Storage

*   **Telemetry State:** `Map<MetricId, RingBuffer<60>>` in `packages/hub/src/runtime/metric-store.ts`.
*   **User Preferences:** Stream Deck `setGlobalSettings()` and `setSettings()`.
*   **Widget Settings:** Stored settings are sparse generated protobuf messages. Resolved settings are hand-written TypeScript contracts derived by the resolver and must not be written back to storage. Runtime option lists, discovered devices, and learned maxima stay ephemeral and are shared with the Property Inspector through in-memory state and IPC messages.

### 2.10 Lifecycle Management (Anti-Zombie)

The Hub does not spawn privileged local helpers. It connects to the installed helper, validates protocol compatibility, applies timeouts, and falls back when the helper is unavailable. Unprivileged dev helpers may still be spawned with explicit lifecycle cleanup.

### 2.11 Alternatives Considered

*   *Native SVG via SDK `setImage(svg)` (Rejected):* While Elgato SDK labels SVG as "recommended", the SD client uses a limited SVG renderer. Complex features (gradients, filters, custom fonts, `%` in attributes) break rendering. For a highly customizable theme engine, consistent rendering is non-negotiable.
*   *`sharp` / `node-canvas` (Rejected):* Heavy C/C++ native dependencies (libvips, Cairo). Cross-platform build failures, bloated bundles, fragile in Elgato's constrained environment.
*   *`@resvg/resvg-wasm` (Rejected for primary use):* 3-10x slower than native N-API variant. Kept as fallback only.
*   *Unified Go Daemon (Rejected):* Lacks ecosystem for deep Windows sensors.
*   *Stateful Daemons (Rejected):* Fractures architecture when user opts for Built-in source.
*   *Local HTTP for Privileged Helpers (Rejected):* A localhost server adds port discovery, browser-reachable request surface, and token handling. Windows named pipes provide a narrower local security boundary through OS ACLs.
*   *Hand-written DOM Property Inspector (Rejected):* Safe and lightweight, but it becomes a home-grown UI framework as field count and conditional settings grow.
*   *Schema-driven Property Inspector (Rejected after cleanup):* Centralized field schemas, binding registries, and string target dispatch created duplicate settings structure. The current UI uses React composition instead.
*   *Zod for persisted settings (Rejected for now):* Zod offers ergonomic JSON validation, but protobuf gives stronger field identity, schema evolution checks, generated contracts, and shared language support. Validation remains centralized through protovalidate at the codec boundary.
*   *Svelte Property Inspector (Considered):* Smaller runtime and good performance, but React has stronger ecosystem stability, broader training data, and better long-term AI-assisted maintainability for this project.

## 3. Quality Attributes

*   **Security & Privacy:**
    *   Local privileged helpers use OS IPC ACLs instead of localhost HTTP ports. Remote agents require authentication and transport security.
    *   Windows deep-sensor helper runs as `LocalSystem` in Phase 1, exposes only read-only IPC, and relies on the Node source runner for fallback.
    *   Windows helper distribution uses WiX/MSI. Unsigned alpha builds are acceptable until the signing phase.
    *   **License Isolation:** C# helper using LibreHardwareMonitor (MPL/GPL) is legally insulated from proprietary Node.js Plugin via process boundary.
    *   **Property Inspector UI Safety:** Settings panels are React components, not runtime-executed schemas. User-controlled values flow through typed controls and React escaping; do not use injected HTML or `dangerouslySetInnerHTML`.
*   **Performance & Reliability:**
    *   **Event-Loop Protection:** Hardware polling is offloaded to source helpers. Node.js event loop only handles async source clients, SVG composition, and resvg rendering.
    *   **Memory Footprint:**
        *   C# NativeAOT helper: ~15MB.
        *   Swift helper: ~15MB.
        *   Node.js Hub (with resvg-js): < 40MB.
    *   **PNG Caching:** If a key's `WidgetData` + config hasn't changed since the last render, reuse the cached PNG. This cuts rendering cost to ~0 for idle keys.
    *   **Immediate First Frame:** Key actions render a placeholder immediately on appearance, so the hardware never waits on slow OS/GPU/network polling before displaying a composed widget.
*   **Accessibility & Simplicity:**
    *   Users can disable local helpers via Property Inspector, gracefully degrading to Built-in source for basic CPU/RAM metrics.

## 4. Testing Plan

*   **Unit & Integration Testing:**
    *   *Widget Primitives:* Pure functions → snapshot-test SVG output fragments.
    *   *Placeholder Rendering:* Verify no-sample `WidgetData` renders `N/A` for value-capable widgets and muted grayscale output for circular minimal-icon widgets without modifying `MetricStore`.
    *   *Ring Buffer:* Capacity overflow, read-back order, empty/single-entry edge cases.
    *   *Rasterizer:* Snapshot-test resvg PNG output for key sizes (144×144, 200×100 touchstrip).
    *   *Property Inspector Panels and Controls:* Unit-test visible panel behavior, control value conversion, option lists, and settings session updates.
    *   *Contract Testing:* CI validates protobuf compatibility and source client behavior for local IPC and future remote transports.
*   **Manual & End-to-End Testing:**
    *   *Helper Lifecycle Test:* Stop, restart, or uninstall the local helper while widgets are active and verify fallback plus recovery.
    *   *Stress Test:* 32 keys on SD XL at 1Hz. Verify CPU < 2%.

## 5. Launch Plan

*   **Rollout Strategy:**
    *   *Phase 1 (MVP/Alpha):* Source-scoped runtime plus unsigned WiX/MSI Windows helper installer for LHM/PawnIO deep sensors. Users bypass SmartScreen/Gatekeeper.
    *   *Phase 2 (Beta):* Helper hardening, installer upgrade flow, and WinUI 3 ControlPanel.
    *   *Phase 3 (Marketplace GA):* Signing and Elgato Marketplace submission if required for distribution.
*   **Monitoring & Rollback:**
    *   GitHub issue tracking. Local helper errors auto-fallback to Built-in source with ⚠️ warning icon on key.
