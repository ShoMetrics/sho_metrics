---
name: proto
description: Read this before designing/writing .proto files. Do not read if you are simply consuming proto.
---


# Role & Tech Stack
You are an expert engineer specializing in **Node.js**, **Buf**, **protobuf-es generated code**, and **proto3**.

# Source Anchors

Rule source anchors live in `references/AIP_RULE_MAPPING.md`. Do not read that
mapping by default; use this skill as the source of truth unless the user asks
to audit or revise proto rules.

Terms used below:

- **Resolver** means the application layer that turns sparse stored intent plus
  defaults, platform/controller context, and runtime facts into complete runtime
  settings.
- **Extension boundary** means a deliberate place where future/open-ended things
  enter the contract, such as a new `oneof` arm, registry-owned string ID, or
  documented map key. Do not use generic blobs just because the future is fuzzy.

# Core Directives

These apply to every `.proto` file in this repo.

1. **Syntax and tooling**: Use `proto3`. Proto changes must pass `buf lint`, `buf build`, and default VS Code Buf diagnostics. Do not choose a style that requires every developer to change editor settings.
2. **Package and layout**: Packages end with a major version such as `v1`. File names are `snake_case`, package directories match the package, and files flow from primary messages to helpers to package-level enums.
3. **Names and docs**: Use precise `lower_snake_case` field names and concise `UpperCamelCase` message names. Comment non-obvious semantics, extension boundaries, and security-sensitive fields. Avoid vague names like `data`, `info`, or `config` unless the domain noun makes them precise.
4. **Units and scalar meaning**: Measurement fields include units, such as `maximum_power_watts` or `polling_frequency_seconds`. API time fields use `Timestamp`/`Duration`. Client settings may use simple unit-suffixed scalars only for whole-number UI values where presence/range validation matters more than time arithmetic or shared API tooling. Standard codes use standard suffixes such as `language_code`, `region_code`, `currency_code`, `mime_type`, and `time_zone`.
5. **Identifiers**: IDs that cross settings, source, metric, profile, IPC, or API boundaries are strings with documented ownership, such as `source_id`, `metric_id`, `profile_id`, `uid`, or API resource `name`. Use numeric fields for measurements, counts, indexes, and externally-defined numeric values, not ShoMetrics-owned identity. Treat IDs as opaque unless the owning registry explicitly documents their structure.
6. **Repeated fields**: Use plural names for `repeated` fields. Use repeated messages instead of parallel arrays when items may later need labels, IDs, state, or validation.
7. **Enums**: Use enums for stable closed sets that should change infrequently, roughly no more than once a year. Use strings for source IDs, metric IDs, registry IDs, media types, and other open catalogs. The first value is `*_UNSPECIFIED = 0`. Shared enums stay package-level near the bottom. Single-message enums may be nested near first use, but enum values must still be prefixed by the enum name to satisfy Buf's `ENUM_VALUE_PREFIX` rule in CI and VS Code. Example: `message Source { enum State { STATE_UNSPECIFIED = 0; STATE_ACTIVE = 1; } }`. Nested enums prefix by the enum name only, not the enclosing message name.
8. **Booleans and enums**: Use `bool` only for values that are intrinsically binary and whose third state is already modeled by presence, such as unset/inherit plus enabled/disabled. If the value is a mode, state, policy, user-facing choice, or might plausibly need `auto`, `inherit`, `mixed`, `unavailable`, or another named state, use an enum. Do not replace every boolean with an enum; first model the domain states and choose the smallest stable shape.
9. **Presence and sparse intent**: Use `optional` when absence means unset, inherit, or resolver-owned default. Do not add/remove `optional` on a used field without treating it as a compatibility-sensitive API change.
10. **Compatibility**: After a proto shape is used outside tests, do not rename or remove fields, reuse field numbers, change field types, move existing fields into or out of `oneof`, or change unset/default semantics. If a breaking shape change is unavoidable, stop and document the replacement field or new versioned package plus migration/codec behavior before editing.
11. **Sensitive fields**: Do not store secrets in proto settings or request messages unless the security model explicitly requires it. Prefer credential reference IDs and keep tokens, passwords, and cookies in an OS credential store or server-side secret store.
12. **Generic and encoded fields**: Prefer concrete fields or `oneof` before maps, `Struct`, or `Any`. Do not encode structured data into strings for later decode; if a value has internal fields, model those fields in proto and validate them directly. Use open-ended maps, raw JSON strings, or `Any` only after the extension boundary has been designed and documented.
13. **ProtoJSON**: Store client settings as canonical ProtoJSON unless there is a measured reason for binary/base64. Do not use `json_name` except for an explicit compatibility rename.
14. **Generated TypeScript**: Use the configured generated plain object/message API. Do not write Java/C++ style `setFoo()`, `getFoo()`, or `newBuilder()` calls.

# Client Settings Proto Rules

These apply to persisted Stream Deck settings and other local client configuration protos.

1. **Sparse by design**: Stored settings represent user intent only. They do not store resolved defaults, runtime option lists, discovered devices, learned runtime maxima, or renderer-ready data.
2. **Presence matters**: Use `optional` when absence means "unset, inherit, or let the resolver decide". Do not use `.default()`-style schema behavior that erases unset semantics.
3. **Readable storage**: Prefer plain ProtoJSON in Stream Deck settings and exported profiles. Do not wrap settings in binary/base64 unless there is a measured reason to sacrifice debuggability.
4. **Resolver owns context**: Platform checks, controller capabilities, global defaults, forced overrides, and runtime facts belong in the resolver/application code, not in the stored settings proto.
5. **No API resource ceremony**: Client settings protos are local persisted intent, not external resources. Do not add API resource fields, pagination, update masks, field behavior annotations, or service method patterns unless the proto is actually part of an API surface.
6. **Open catalogs use IDs**: Source registries, catalog metrics, remote probes, and user-defined endpoints use stable string IDs with documented ownership. Do not turn open catalogs into enums.
7. **Do not model profiles as resources**: Stream Deck profiles are SDK-level layout snapshots. Settings protos may be embedded in those profiles, but profile layout is not a local settings-schema concern.

# API / RPC Proto Rules

These apply when defining service APIs, inter-process RPCs, remote agents, or future node/C# communication contracts.

1. **Know the plane**: Management-plane APIs should be resource-oriented and prefer standard Get/List/Create/Update/Delete shapes. Data-plane APIs may be specialized for throughput or latency, but still need stable names and contracts.
2. **Resource shape**: API resources use `string name` for the canonical resource name and standard field names such as `display_name`, `create_time`, `update_time`, `uid`, and `etag` only for their standard meanings.
3. **RPC shape**: Each RPC has a dedicated request message. List/custom RPCs have dedicated response messages. RPC and HTTP API surfaces are message-shaped contracts, not top-level primitive, repeated primitive, map, or raw string payloads. Public HTTP APIs use `google.api.http`; local-only and client settings protos do not.
4. **List and update from day one**: All List RPCs include `page_size`, `page_token`, and `next_page_token` in v1. Filtering uses one documented `string filter` when needed. Update RPCs use `google.protobuf.FieldMask update_mask`.
5. **Field behavior and server-owned fields**: Public API request/resource fields must document required, optional, output-only, immutable, and identifier semantics. Do not silently rewrite client-owned fields; expose server-computed effective values separately.
6. **Errors and authorization**: API errors use canonical gRPC status codes and standard error details when available. Check authorization before validation. Retry behavior must be safe for idempotent operations.
7. **Long work and bulk operations**: Use long-running operations or job resources for work that may outlive a normal request. Add batch, import/export, soft delete, or criteria-based deletion patterns only when the product needs them.
8. **States and reachability**: Lifecycle state enums are named `State` or end in `State`. If List can span multiple parents or locations, document wildcard parent support and use the standard `repeated string unreachable` pattern.
9. **Streaming last**: Prefer polling, then standard unary RPCs, then long-running operations/jobs. Introduce streaming only when those shapes are insufficient.
10. **Intentional deviations**: If a public API proto intentionally violates an adopted AIP, document why inline. Do not use old APIs or temporary alpha shapes as precedent for new stable surfaces.

# AIP Scope Notes

Not every Google AIP belongs in this repo:

- Resource/method AIPs such as AIP-121 through AIP-136 are for API/RPC protos, not local client settings.
- Client settings protos prioritize sparse persisted intent, readability in exported profiles, and resolver-owned defaults.
- API protos prioritize stable client surfaces, resource shape, pagination, field masks, standard errors, and field behavior documentation.
- AIP guidance that is only useful for Google public APIs or declarative clients should not be copied into local IPC/settings protos unless it solves a concrete ShoMetrics problem.

# Reference Files (Load On Demand)
These files are reference material for unclear syntax, JSON mapping, enum
behavior, or generated-code questions. Do not read them by default:
- **Proto Syntax & Standard Types**: `Language_Guide_proto_3.md`, `Protocol_Buffers_Language_Specification_Proto3.md`, `Protocol_Buffers_Well-Known_Types.md`
- **JSON, Enums & Field States**: `ProtoJSON_Format.md`, `Enum_Behavior.md`, `Application_Note_Field_Presence.md`
- **Architecture & Naming**: `Proto_Best_Practices.md`, `1-1-1_Best_Practice.md`, `Style_Guide.md`
