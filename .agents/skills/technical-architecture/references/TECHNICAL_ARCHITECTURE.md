# ShoMetrics Technical Architecture

This document describes the current high-level architecture. It is not a file
placement checklist and should not duplicate the detailed review rules in
`architecture-boundaries`.

Use this document to understand the shape of the system before making design
changes. Use `architecture-boundaries` to review whether a proposed code change
keeps the ownership boundaries intact.

## High-Level Structure

```text
contracts/          Shared protobuf contracts.
packages/assets/    Shared brand and packaging assets.
packages/hub/       Node.js Stream Deck plugin and Property Inspector.
packages/installer/ Windows installer packaging.
packages/source-windows/
                    Windows-native telemetry helper and control surfaces.
site/               Public website and FAQ content.
docs/               Development plans, research notes, and archived decisions.
scripts/            Repository-level utility scripts.
.agents/            Agent instructions, skills, and local reference material.
```

`packages/hub` is the runtime center for the Stream Deck plugin:

```text
src/actions/             Stream Deck action lifecycle shells and action-owned
                         view assembly.
src/runtime/sources/     Metric acquisition, source adapters, source registry,
                         polling groups, backoff, health, and descriptors.
src/runtime/metric-store.ts
                         Source-scoped latest values, history, attribution, and
                         unavailable reports.
src/settings/            Stored settings codec, sparse patches, defaults, and
                         resolved settings.
src/property-inspector/  React settings UI, controls, settings sync, and
                         PI-only state.
src/view-updates/        Render scheduling and Stream Deck update dispatch.
src/view-rendering/      Metric view composition and rasterization boundary.
src/widgets/             Low-level SVG primitives.
```

## Metric Read Architecture

ShoMetrics separates metric selection, acquisition, storage, view assembly, and
rendering so each part can evolve without taking responsibility for the others.

```text
stored settings
  -> resolved settings
  -> metric read plan
  -> scheduler / source registry
  -> source adapter
  -> MetricSnapshot
  -> source-scoped MetricStore
  -> action-owned WidgetData
  -> view-updates
  -> view-rendering / widgets
  -> rasterized Stream Deck image
```

### Stored Settings

Stored settings are sparse user intent. They answer "what did the user choose?"
They do not store runtime option lists, resolved defaults, discovered devices,
source samples, or renderer-ready data.

Why this exists: exported Stream Deck profiles and settings diffs stay readable
and do not accidentally capture runtime state.

### Resolved Settings

Resolved settings combine stored intent with defaults, platform/controller
context, global settings, and runtime facts needed by the UI or action.

Why this exists: actions and panels can consume a complete app-owned contract
without importing generated storage details or reimplementing defaults.

### Metric Read Plan

An action converts resolved settings into a read plan: source policy, fallback
behavior, polling candidates, and metric keys.

Why this exists: subscription and fallback decisions belong before polling, not
inside renderers or individual source adapters.

### Scheduler And Source Registry

The scheduler groups work by source scope, polling interval, and metric keys,
then asks the selected source adapter for data.

Why this exists: polling is shared across visible widgets, source selection is
centralized, and slow source work does not run inside render cadence.

### Source Adapter

Each source adapter owns source-native acquisition and conversion into
ShoMetrics runtime contracts. Current source families include built-in
Node/systeminformation, Windows helper, and Custom HTTP.

Why this exists: HTTP, jq, Windows helper IPC, `systeminformation`, and
`nvidia-smi` have different failure modes and native shapes. They should not
leak into actions, settings, or SVG rendering.

### MetricSnapshot

Sources return protobuf-backed metric snapshots keyed by ShoMetrics metric ids.
Source API metadata such as descriptors, attribution, unavailable reports, and
health travel through source-owned runtime contracts.

Why this exists: metric values have one normalized ingestion format while
source-specific diagnostics remain source-owned.

### Source-Scoped MetricStore

`MetricStore` stores latest values, scalar history, text values, attribution,
and unavailable reports under a source scope and metric id.

Why this exists: two sources can publish the same metric id without overwriting
each other. Read-time fallback can compare source candidates instead of merging
unrelated samples.

### Action-Owned WidgetData

Actions read metrics from `MetricStore` and assemble `WidgetData` plus
action-specific view options.

Why this exists: product logic such as "network download uses this label and
unit" or "Dense row 2 is unavailable" belongs to the action/domain owner, not
to SVG primitives.

### View Updates And Rendering

`view-updates` schedules Stream Deck updates. `view-rendering` composes metric
views and rasterizes SVG. `widgets` draw low-level visual primitives.

Why this exists: rendering code receives semantic data and visual choices. It
does not know how a metric was acquired or why a product domain chose it.

## Core Design Ideas

### Low Coupling

Each layer knows the smallest useful contract from the layer before it.

Good:

- Network action code decides which upload/download values to show.
- SVG bar rendering receives a label, value, progress, and colors.
- The bar primitive does not branch on "network", "disk", or "custom HTTP".

Bad:

- A progress-bar renderer checks `metricKey.startsWith("network.")` and changes
  layout or units for network metrics.

### High Cohesion

Code that changes for the same reason lives together.

Good:

- Custom HTTP fetch, auth, redirect, sample digest, jq transform, and source
  editor message contracts stay in Custom HTTP-owned modules.
- Dense only maps rows to widget data and read plans; it does not know Custom
  HTTP credential behavior.

Bad:

- Dense adds special cases for Custom HTTP auth or jq failures because a row can
  display a Custom HTTP metric.

### Runtime Facts Stay Runtime-Owned

Discovered disks, network interfaces, source health, helper availability, and
catalog descriptors are runtime facts. Settings may reference selected ids, but
runtime facts are not persisted as settings.

Good:

- Property Inspector receives current option snapshots and preserves a stale
  selected value for display.

Bad:

- A source adapter writes discovered devices back into widget settings so the PI
  can render a dropdown.

## Evergreen Architecture Decisions

This section records decisions that rarely change. Keep it focused on why a
path was rejected or constrained. Do not add current code snippets, directory
trees, launch phases, or implementation status here.

### Rendering

- Native Stream Deck SVG rendering is not a reliable base for complex widgets.
  The Stream Deck client renderer has broken complex gradients, filters, custom
  fonts, percentage attributes, and text colors in practice. ShoMetrics needs
  predictable pixels more than it needs to preserve SVG as the transport format.
- `sharp` and `node-canvas` were rejected for key rendering because libvips and
  Cairo add heavy native dependency and packaging risk inside the Stream Deck
  plugin environment.
- A WASM rasterizer is not the preferred primary path for Node rendering when a
  stable native package is available; the performance cost is too high for
  regular key updates.

### Source And Helper Boundaries

- A single stateful daemon architecture was rejected because it makes the
  built-in source path depend on daemon state and weakens graceful fallback.
- A unified Go helper was rejected for deep Windows sensors because the Windows
  hardware-monitoring ecosystem is stronger in the existing native/.NET stack.
- Local HTTP for privileged local helpers was rejected because it adds port
  discovery, a browser-reachable request surface, and token handling. OS-local
  IPC with ACLs is the narrower local security boundary.
- GPL/MPL sensor integrations must stay behind a process boundary so license
  obligations and runtime failure modes do not leak into the Node plugin or
  renderer.

### Property Inspector And Settings

- Hand-written DOM PI code was rejected because conditional settings and field
  count turn it into a private UI framework.
- A schema-driven PI registry was rejected after cleanup because centralized
  field schemas, binding registries, and string target dispatch duplicate the
  settings model. Visible settings composition belongs in React components.
- Svelte was considered for the PI, but smaller runtime size was not enough to
  beat React's ecosystem stability and long-term AI-assisted maintainability.
- Zod was rejected for persisted settings because protobuf gives stronger field
  identity, schema evolution checks, generated contracts, and shared language
  support. Validation belongs at the storage codec boundary, not spread across
  UI panels or actions.

## Useful Docs And Scripts

Do not load all docs or scripts by default. Read them only when the task needs
their domain context.

- `docs/development/runtime-sources/`: runtime source plans, Custom HTTP plans,
  helper/source design notes, and launch checklists.
- `docs/development/archive/`: historical plans. Use as context only; do not
  preserve outdated vocabulary as current.
- `docs/development/command-playbook.md`: known local command workflows.
- `packages/hub/scripts/`: Hub-specific generation, diagnostics, and local
  smoke tools.
- `packages/hub/scripts/diagnostics/`: manual debugging helpers such as Custom
  HTTP smoke servers.
- `scripts/`: repository-level scripts.
- `.agents/skills/*/references/`: copied official docs or prior-art notes. Read
  only the relevant reference file, not the whole folder.
