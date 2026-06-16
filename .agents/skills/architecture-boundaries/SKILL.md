---
name: architecture-boundaries
description: Use when changing or reviewing code that crosses major application boundaries such as settings, Property Inspector, actions, runtime sources/helpers, rendering, persistence, validation, generated contracts, IPC, version-skewed helper/plugin APIs, or adapters. Keep boundaries explicit and avoid over-engineered plumbing, option bags, duplicated models, and defensive code for impossible states.
---

# Architecture Boundaries

Use this skill to avoid the problems this repo has already hit: duplicated
settings models, UI mirrors, source/helper leakage, broad option bags,
defensive parser chains, and cross-layer plumbing that hides ownership.

## When To Use

Use this skill when a change crosses or redefines ownership between these
areas:

- persisted settings, storage codecs, defaults, and validation;
- Property Inspector panels, controls, bindings, and settings sync;
- action lifecycle, action-specific view assembly, and shared action helpers;
- runtime sources, platform helpers, scheduler, background collection, and
  metric state;
- rendering contracts, view models, SVG/rasterization, and Stream Deck output;
- generated contracts, proto schemas, IPC messages, adapters, and wire formats.

Do not use this skill for a purely local implementation detail that stays
inside one owner and does not add a new model, adapter, compatibility path, or
shared option surface.

## Core Rule

Before changing code, name the boundary:

- Who owns persisted data?
- Who owns runtime defaults and context?
- Who owns DOM/control-only values?
- Who owns rendering contracts?
- Who owns source/runtime failures?
- Who owns helper processes, IPC transport, and wire contracts?
- Where does generated, storage, or wire data become app-owned data?

If ownership is unclear, stop and clarify the boundary before adding code.

## AI-Assisted Architecture Guardrails

AI tends to make the shortest local path look like the architecture. Use these
rules to keep AI changes bounded without turning the codebase into a maze of
tiny abstractions.

### Before Adding Code

Answer these during implementation, not only at the end:

- Is this change adding a feature branch, a new owner, or a boundary conversion?
- Is this axis expected to grow, such as metric domain, widget kind, source kind,
  layout, or platform?
- If three similar features arrive later, will this owner become a controller
  that knows too much?
- Is the feature cheap because the design is right, or because the edit reuses
  the wrong shared entry point?

### DO: Name The Owner Before Adding A Branch

Good:
- A new disk-only render option belongs in `actions/disk/` or the disk target
  resolver, not in a shared action switch.
- A new persisted setting starts in the stored contract and resolver, then is
  exposed as resolved settings.
- Windows `Core` owns hardware access and metric mapping; `Service` owns the
  IPC server and request handling; the hub source client owns fallback and
  connection behavior.
- Direct `if` branches are fine for cases that are few and stable. If the axis
  is expected to grow, name the owner before adding another branch.

Bad:
- Add another `if (actionKind === "disk")` branch inside a shared Property
  Inspector controller because it is the shortest edit.
- Pass an options bag through action, Property Inspector, renderer, and runtime
  because no layer clearly owns the field.
- Put pipe framing, service lifecycle, or hub fallback policy into Windows
  `Core` because it already reads hardware.

### DO: Keep Routers Thin

Routers may choose the active owner and dispatch messages. They must not become
the place where every feature stores state or knows every downstream detail.

Good:
- `usePropertyInspectorSettings` owns Stream Deck connection lifecycle and
  delegates stored settings reading to `settings/storage`.
- `MetricAction` wires action lifecycle and subscriptions, while domain view
  assembly stays under the action domain folder.
- Property Inspector components compose UI and write typed sparse patches; they
  do not own a settings-shaped mirror.

Bad:
- Put widget recovery rules, source fallback rules, panel visibility, and
  renderer defaults into one Property Inspector hook.
- Let `MetricAction` understand every disk/network/GPU view branch instead of
  calling typed domain builders.

### DO: Keep State Transitions Owned

Background work may fetch, poll, watch, decode, or validate. It should return a
typed result to the owner that mutates state.

Good:
- Runtime sources return metric snapshots; `MetricStore` owns history mutation.
- Windows helper/service code returns source snapshots or protocol responses;
  hub runtime code decides how to cache, fall back, and render.
- The storage codec returns a read result; Property Inspector decides how to
  show the warning.
- Defensive code handles real runtime uncertainty: IO, SDK events, missing
  devices, disappearing actions, source failures, or incomplete DOM input.

Bad:
- A source adapter writes widget settings because it discovered a better
  default.
- A parser mutates UI state while also recovering stored settings.
- Add defensive checks for states a validated stored or resolved contract
  already makes impossible.

### DO: Keep Data Typed Until The Final Display Boundary

Rule: Keep metric text formatting at the owning boundary: `metrics/` formats
real value/unit semantics, action view builders pass semantic units through,
`view-rendering` adapts display text, and primitives only draw supplied strings.

Good:
- Resolve stored proto into `ResolvedWidgetSettings`, then adapt to renderer
  contracts.
- Convert source IPC protobuf messages at the service/client boundary before
  they become runtime source data.
- Keep metric channels named until the renderer needs SVG text or paths.
- Stored contracts stay sparse; resolved contracts are complete for callers;
  renderers receive render-facing data, not storage schema.

Bad:
- Flatten metric values into string arrays early and rely on index positions in
  panels or renderers.
- Import generated settings proto into React panels or action view builders
  because it is already typed.
- Thread generated IPC proto through hub runtime, action view builders, or
  rendering because both TypeScript and C# can import it.
- Put compact render-only unit helpers in `metrics`, import text-content
  helpers from actions, add action-facing unit-text override options, or
  convert units inside `widgets/primitives`.


### PREFER: Small Bounded Contexts With Real Owners

Good:
- Split a large hook by extracting same-file helpers for loading, subscription,
  and read-result handling.
- Move shared metric-view queueing to `view-updates/` because it has a
  stable owner outside individual actions.

Bad:
- Keep adding prompt rules for a module that repeatedly mixes settings,
  runtime, and rendering ownership.
- Create one-use pass-through files or wrappers only to make a file look
  smaller.

Avoid the overcorrection:
- Small context does not mean many tiny files. Prefer clear ownership and a
  narrow public API over aggressive splitting.
- Same-file helpers are a low-risk first step, not a replacement for a stable
  owner when responsibility keeps growing.

### STOP: Feature And Invariant Conflict

If a feature conflicts with a boundary invariant, do not contort code to obey
both. Stop and make the choice explicit.

Good:
- If ownership, persistence, renderer contracts, or runtime source contracts
  would change, explain the conflict and ask before implementing.
- Say whether the right answer is to reject the feature, accept a named
  localized compromise, or revise the invariant.
- Keep a compromise contained, tested, and away from shared hot paths.

Bad:
- Add a hidden compatibility path because the new storage contract rejects old
  data.
- Thread generated proto into renderer code because conversion feels tedious.

### AVOID: Velocity-Driven Scope Creep

Good:
- Treat a cheap edit as suspicious when it adds another branch to a shared
  owner.
- Report the real architecture cost when a feature looks cheap only because it
  reuses the wrong entry point.
- Add static guards for repeated, high-risk, mechanically detectable boundary
  violations.

Bad:
- Accept a feature because "it is only one more case" in a central controller.
- Add brittle tests for every style preference instead of guarding real
  architectural boundaries.

## Simplicity Guard

Do not turn boundary discipline into a framework.

- Prefer direct code over registries when cases are few and stable.
- Prefer typed patches over generic field maps.
- Prefer a small adapter over plumbing a storage type through the app.
- Prefer deleting old paths over maintaining compatibility code.
- Prefer comments for future directions until the stored/runtime contract can
  actually express the feature.

## Generated Contracts

* **DO: Keep generated schema code at storage or wire boundaries.**
  Generated schema code may be used at storage or wire boundaries. Do not let it
  leak into domain rendering, action view building, Property Inspector panels,
  or platform helper core code.

  Good:
  - A storage codec reads generated settings proto.
  - A source IPC client reads generated IPC response messages.

  Bad:
  - A renderer imports generated settings or source API proto.
  - Windows `Core` imports generated IPC messages.

* **DO: Convert generated data when it becomes app-owned data.**
  Settings, rendering, action view models, and PI state are app-owned data.
  Source IPC/API facade types may stay source-runtime contracts, but they must
  not become UI, action, renderer, or storage models. For source helpers,
  generated IPC messages belong at the service/client edge; hardware core
  models should remain transport-independent.

  Good:
  - The settings resolver converts stored proto into `ResolvedWidgetSettings`.
  - The source IPC adapter normalizes a version-skewed freshness enum before
    `MetricStore` decides whether to append history.
  - `runtime/sources/source-client.ts` exports a source-runtime contract derived
    from generated source API types, while PI and renderers consume app-facing
    view models.

  Bad:
  - PI decides how to display generated `UNSPECIFIED`.
  - Planner, store, actions, and renderer all receive a generated IPC response.

The following rules refine source IPC/API boundaries. They do not change the
stored/resolved settings ownership rules above.

* **PREFER: Derive source IPC/API runtime types from generated message shapes when semantics match.**
  Do this at a source adapter/facade boundary, such as
  `runtime/sources/source-client.ts`. Strip generator plumbing such as
  `$typeName` and adjust nested generated payloads there. If the runtime type
  intentionally changes meaning, convert to an app-owned model instead.

  Good:
  - Use a type-only alias such as
    `RawSensorIdentity = Readonly<Omit<ProtoRawSensorIdentity, "$typeName">>`
    for a pure source-owned string payload.
  - Derive `MetricValueAttribution` from the generated source API message when
    it is still source-runtime metadata and the adapter owns enum compatibility.
  - Let a source IPC adapter helper accept a generated message while it is still
    validating wire data.

  Bad:
  - Recreate the same fields as `RawSensorIdentity` or
    `SourceRawSensorIdentity` only to avoid importing a type.
  - Reuse a descriptor message with enum fields in Property Inspector UI.
  - Store generated source API messages with enums, oneofs, presence semantics,
    or `$typeName` message wrappers in `MetricStore`, planner state, action
    models, PI state, or renderer contracts.
  - Reuse a generated name that collides with or shadows an existing app-owned
    domain type; convert at the boundary instead.

  Bad when applied mechanically:
  - Derive a resolved settings type from generated stored settings because the
    fields currently look identical. Stored settings and resolved settings have
    different owners.

* **DO: Keep app-owned IPC/API mirrors aligned with generated names and nesting.**
  If a source IPC/API message needs an app-owned type, use the same noun and
  nesting unless the app type intentionally changes semantics. Name that
  semantic change in the adapter or type comment.

  Good:
  - `ProtoMetricValueAttribution` maps to `MetricValueAttribution`.

  Bad:
  - Flatten `raw_sensor_identity` into descriptor fields without a runtime-owned
    reason.
  - Add broad prefixes such as `Source*` when the generated noun is already
    accurate.

* **DO: Validate IPC/API wire invariants before mutating runtime state.**
  The adapter owns malformed wire handling: orphan records, conflicting
  records, missing required nested payloads, and invalid enum defaults should be
  dropped, rejected, or normalized there with low-noise support logs. Do not
  silently drop, ignore, or normalize unexpected wire data.

  Good:
  - Drop an attribution whose metric id is absent from the snapshot and log once
    per interval.
  - Return a structured invalid-request response for an unsupported helper IPC
    request and log a warning that mentions possible version skew.

  Bad:
  - Store malformed source data and make rendering guess what happened.
  - Ignore a malformed descriptor, orphan record, or unsupported request without
    a warning at the IPC/API boundary.

* **DO: Treat helper/plugin IPC version skew as normal.**
  The helper and plugin are separate programs; users will not always update them
  together. Field owners must define how unknown future enum values, missing
  fields, and unsupported request values degrade.

  Good:
  - Unknown future value freshness becomes display-only/retained at the source
    adapter, with a low-frequency warning.
  - Unknown DEBUG-only unavailable reasons stay diagnostic and do not change
    render/fallback behavior; they still get a low-frequency warning.
  - A request enum is sent only when helper capabilities say it is supported.

  Bad:
  - Throw `protocolMismatch` and mark the whole helper unusable because one
    future enum value appeared in a non-critical field.
  - Let PI, actions, or renderers switch on generated `UNSPECIFIED` or unknown
    numeric enum values.

## Final Check

Before finishing, verify:

- no duplicated settings or UI model was introduced;
- no resolved defaults are persisted;
- no renderer or ordinary UI imports storage schema;
- no platform helper core imports IPC/service/UI concerns;
- no legacy compatibility path was added;
- no broad option bag or pass-through wrapper was added;
- no defensive parser was added for data already validated at the boundary.
- tests assert the boundary invariant, not only the generated implementation.
