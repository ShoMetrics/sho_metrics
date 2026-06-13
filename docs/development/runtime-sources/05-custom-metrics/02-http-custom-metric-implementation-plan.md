# HTTP Custom Metric Implementation Plan

This plan is written for a new coding session with no conversation context.

Read these first:

1. [Runtime Sources Overview](../README.md)
2. [Metric-Level Source Routing](../02-source-routing/02-metric-level-source-routing.md)
3. [HTTP Custom Metric Transform Engine Report](01-http-custom-metric-poc-plan.md)
4. `.agents/skills/technical-deisn-doc/references/TECHNICAL_DESIGN.md`
5. `.agents/skills/proto/SKILL.md`
6. `.agents/skills/architecture-boundaries/SKILL.md`

All `npm.cmd` and `npx.cmd streamdeck ...` commands in this plan run from
`packages/hub` unless a step explicitly says otherwise.

## Objective

Add a new user-facing metric product named **Custom Metric**.

V1 Custom Metric lets the user configure one HTTP GET JSON endpoint, one jq
transform rule, and one scalar metric output. The metric can be rendered by the
normal Sho Metrics view system.

This is a source/runtime feature, not a new visual layout. Dense Multi Metric
and Stacked Metric may consume Custom Metric targets after the single Custom
Metric action and HTTP runtime source are stable.

## Product Decisions

- Product/action label: **Custom Metric**.
- Persisted target/domain name: **Custom Metric**.
- V1 source type: HTTP GET JSON.
- Internal source type id: `custom-http`.
- Transform engine: jq through `jq-wasm`.
- V1 output is exactly one metric object. Do not use `metrics[]` in the runtime
  output schema.
- Transform output may include an optional `suggestedLucideIconId`. It is an
  advisory display hint only.
- V1 does not implement a reusable source catalog or source picker.
- V1 stores the HTTP definition inside the widget settings that use it.
- Custom Metric icon storage is widget-local and generic: store `icon.id`, not
  `lucideIconId`. V1 code interprets `icon.id` through the app-owned Lucide
  registry. If future icon providers are added, extend the icon schema
  explicitly instead of overloading the string.
- User-selected `icon.id` always wins over `suggestedLucideIconId`. A transform
  suggestion must never overwrite widget settings.
- Do not use emoji as the V1 default center icon. The emoji POC rendered as a
  monochrome fallback in the current SVG/resvg pipeline, and dedicated emoji
  font loading is a separate rendering-performance decision.
- V1 stores the user's `user_intent` text so the PI can rebuild the prompt and
  explain what the transform is meant to extract. `user_intent` is persisted
  editor context, not runtime input; a configured URL plus jq transform can run
  even when `user_intent` is empty.
- V1 does not implement sequence, parallel, request pipelines, request
  dependency graphs, custom headers, auth, secrets, cookies, POST bodies, local
  command execution, or arbitrary text metrics.
- V1 does not implement Sho Metrics copy/duplicate helpers. Users should use
  Stream Deck's native copy, export, and import.
- `http://localhost`, `http://127.0.0.1`, LAN IPs, and HTTPS URLs are allowed.
- HTTP query strings are allowed because no-auth APIs often need coordinates,
  query variables, or public parameters. Query strings must never be included
  in metric ids or ordinary logs.
- Stored settings must not include a runtime metric key, `event.action.id`, or
  Sho Metrics-generated instance UUID.
- Runtime metric identity is derived from the current Stream Deck action
  instance id plus the Custom HTTP consumer scope at action lifecycle time.
- Runtime metric key format:

```text
custom-http:<hostSlug>:<actionId>:<consumerSlug>
```

- `hostSlug` is for logs and support diagnostics only. It does not provide
  uniqueness.
- `actionId + consumerSlug` is the uniqueness source for V1 runtime isolation.
- `consumerSlug` identifies which Custom HTTP metric consumer inside the action
  owns the runtime metric:
  - single Custom Metric action: `single`;
  - Dense row: `dense-<slotId>`;
  - Stacked slot: `stacked-<slotId>`;
  - future multi-metric widgets must provide their own stable per-metric
    consumer id before they can consume Custom HTTP metrics.
- `consumerSlug` must be produced by the shared Custom HTTP metric-key helper,
  not hand-built by action code.
- `hostSlug` is derived from the URL hostname only:
  - trim the URL string before parsing;
  - use the parsed hostname, not path, query, or fragment;
  - lowercase;
  - keep only `a-z`, `0-9`, and dots before conversion;
  - convert dots to hyphens;
  - collapse repeated hyphens;
  - trim leading and trailing hyphens;
  - keep at most 32 characters;
  - use `localhost`, `invalid-url`, or `unconfigured` when that is the most
    accurate bounded support label.
- HTTP response body cap: 256 KiB.
- HTTP request timeout remains fixed at 5 seconds until the request-configuration
  step. Do not raise the default to hide DNS or network latency. A configurable
  request policy is a separate Step 7 because it changes persisted settings, PI
  controls, runtime fetch behavior, and diagnostics together.
- HTTP retry count remains fixed at 0 until the request-configuration step.
- V1 uses the system resolver by default. Do not force public DNS such as
  1.1.1.1 or 8.8.8.8 by default; that can break VPN, corporate, campus,
  split-horizon, localhost, and private-network names. A future advanced
  resolver option must be explicit and off by default.
- HTTP redirects: use Fetch's normal `follow` behavior in V1. This is an
  explicit no-auth V1 choice, not an inherited default. Revisit before adding
  auth, cookies, headers, or credential references.
- Larger JSON schema/sample summarization for AI prompting is deferred and must
  not be implemented in V1.
- Runtime failures after a metric has been configured render as `N/A`.
- Serious configuration failures before a valid metric exists render as
  `Error`.
- Unconfigured Custom Metric renders as `Configure`.
- Detailed HTTP, JSON, jq, schema, and validation errors belong in the Property
  Inspector and support logs, not on the key.

## Stream Deck Action Id POC Facts

These facts were verified manually on 2026-06-09 with temporary
`actionIdentityProbe` logs in `MetricAction`. The temporary logs were removed
after the experiment.

- `event.action.id` is stable across plugin restart.
- `event.action.id` is stable across Stream Deck restart.
- `event.action.id` is stable across rebuilding the local plugin source.
- Moving or swapping keys can reassign the affected action ids.
- Copying a key assigns a new action id to the copy.
- Exporting one action and importing it does not copy the source action id.
- Exporting and re-importing a profile assigns new action ids to the imported
  actions.

Conclusion:

- `event.action.id` is not a durable user-visible widget identity.
- `event.action.id` is appropriate for runtime isolation.
- Do not persist it.
- Do not use a startup-random UUID instead. It is less stable across restarts
  and adds an unnecessary in-memory mapping without improving copy/import
  isolation.

## DNS Resolver POC Facts

These facts were verified manually on 2026-06-12 while debugging
`api.open-meteo.com` sample fetch timeouts.

- Windows/system `dns.lookup("api.open-meteo.com")` took about 11 seconds in the
  failing environment.
- A Node `dns.Resolver` pointed at public DNS servers resolved the same host
  quickly without changing system settings:
  - Cloudflare `1.1.1.1` / `1.0.0.1`: about 11-48 ms after the first lookup;
  - Google `8.8.8.8` / `8.8.4.4`: about 19-35 ms.
- A per-request HTTPS client with a custom lookup callback successfully fetched
  the Open-Meteo URL in about 170-720 ms in the same environment.

Conclusion:

- Per-request forced DNS is technically possible in Node without changing the
  user's machine settings.
- Do not use forced public DNS by default. It bypasses user, VPN, corporate,
  campus, split-horizon, localhost, and private-network resolver behavior.
- Keep forced DNS as a future advanced option only, after explicit design and
  tests for localhost/private/internal hosts.

## Custom HTTP Runtime Identity Rule

Never build a Custom HTTP runtime metric key with string concatenation inside an
action, widget, PI component, or source client.

All Custom HTTP consumers must call one shared helper owned by
`runtime/sources/custom-http/`. The helper takes:

```text
actionId
url
consumerKind
consumerId
```

and returns:

```text
metricKey
hostSlug
consumerSlug
```

Required consumer ids:

| Consumer | `consumerKind` | `consumerId` |
| --- | --- | --- |
| Single Custom Metric action | `single` | fixed `single` |
| Dense Multi Metric row | `dense` | existing `DenseMetricSlot.slot_id` |
| Stacked Metric slot | `stacked` | existing `StackedMetricSlot.slot_id` |

This is the guard against future widget collisions. A future widget cannot
consume Custom HTTP by only passing `actionId`; it must expose a stable
per-metric consumer id and add tests for the shared helper. If the future widget
has no per-metric slot id, add that id to its stored/resolved contract before
adding Custom HTTP support.

Add a test that fails if direct `custom-http:` key construction appears outside
the shared helper and tests.

## Output Schema

The jq transform must output exactly this shape:

```json
{
  "metric": {
    "label": "TEMP",
    "value": 23.5,
    "unit": "celsius",
    "customUnit": "km/h",
    "maximum": 100
  }
}
```

Schema rules:

- Top-level `metric` is required.
- `label` is required.
- `value` is required. The prompt should ask models to emit a JSON number, but
  the runtime validator may accept strict decimal numeric strings such as
  `"42"` or `"42.5"` and normalize them to numbers. Do not accept JavaScript
  numeric syntax such as `0x10`, `1e3`, `Infinity`, or `NaN`.
- `unit` is required.
- `customUnit` is required when `unit` is `custom`.
- `customUnit` must be absent when `unit` is not `custom`.
- `maximum` is optional, but when present it must be a positive finite number
  or a strict decimal numeric string normalized by the same rule as `value`.
- Do not output `metricId`; the runtime metric key is action-and-consumer
  scoped.
- Do not output arrays in V1.

Supported units:

```text
percent
celsius
fahrenheit
watts
bytes
bytes_per_second
milliseconds
seconds
hertz
revolutions_per_minute
rpm
unitless
custom
```

Formatting rules:

- Known semantic units use Sho Metrics' existing unit formatting and scaling
  rules where they exist.
- Unit names should be emitted as lower_snake_case enum names. Runtime trims
  whitespace, lowercases, and normalizes spaces or hyphens to underscores before
  matching existing metric units.
- `rpm` is accepted only as a compatibility alias for
  `revolutions_per_minute`; prompts should prefer the full unit name.
- `fahrenheit` is accepted for no-auth HTTP APIs that already return Fahrenheit
  values, but the runtime does not have a Fahrenheit `MetricUnit`; treat it as a
  fixed custom `F` suffix unless a future source contract adds a real Fahrenheit
  unit.
- `custom` uses the exact `customUnit` text as a display suffix.
- `custom` does not auto-scale or convert. A value `17` with `customUnit:
  "km/h"` is displayed as 17 km/h; it must not become m/s or another unit.
- `maximum` is in the same raw value unit as `value`.

## Runtime Boundary

Do not build a second HTTP polling loop.

Custom HTTP metrics must use the existing runtime chain:

```text
MetricAction
  -> MetricReadPlan
  -> MetricSubscriptionRegistry
  -> CollectorGroupPlanner
  -> CollectorGroupRunner
  -> SourceClient
  -> MetricStore
  -> WidgetData
  -> view-updates
  -> view-rendering
```

The HTTP source client owns HTTP fetch, response limits, jq execution, output
validation, and source-owned unavailable reports. `MetricStore` owns samples.
Actions own render-facing `WidgetData` assembly. The Property Inspector owns UI
drafts and user-visible configuration errors.

Do not put `WidgetData` builders, render labels, progress defaults, or
view-facing formatting under `runtime/sources/custom-http/`. Runtime sources
return metric snapshots and unavailable state only. Action/metric owners adapt
those snapshots to render-facing data.

Future exact-request coalescing must be an internal HTTP source-client
optimization, not a settings or metric-key change. Coalescing keys must be based
on request fingerprint and cadence, not on rendered metric identity.

V1 does not promise cross-definition coalescing. If two Custom Metric widgets
have the same URL but different action ids, they still have separate runtime
metric keys. A future source-client optimization may fetch the shared response
once and fan out to separate metric keys without changing settings.

## Non-Goals

Do not implement these in this plan:

- reusable source list or source picker;
- transform output catalog;
- multiple metrics from one transform;
- sequence or parallel HTTP requests;
- per-request cache policy UI;
- auth, token, cookie, custom header, custom resolver, or OS credential
  storage;
- local command execution;
- AI model integration inside Sho Metrics;
- large JSON schema/sample prompt summarization;
- arbitrary text rendering;
- migration compatibility for unpublished proto experiments;
- automatic URL-level request coalescing.

## Current Code Facts

Implementation must reuse these existing owners instead of creating parallel
models:

- `contracts/proto/shometrics/v1/settings.proto`
- `packages/hub/src/settings/storage/codec.ts`
- `packages/hub/src/settings/storage/resolver/`
- `packages/hub/src/settings/resolved-settings.ts`
- `packages/hub/src/actions/metric-action.ts`
- `packages/hub/src/runtime/source-routing/metric-read-plan.ts`
- `packages/hub/src/runtime/source-routing/metric-read-plan-builder.ts`
- `packages/hub/src/runtime/metric-collection/`
- `packages/hub/src/runtime/metric-store.ts`
- `packages/hub/src/runtime/sources/source-client.ts`
- `packages/hub/src/runtime/sources/source-registry.ts`
- `packages/hub/src/runtime/sources/source-ids.ts`
- `packages/hub/src/metrics/`
- `packages/hub/src/property-inspector/`
- `packages/hub/src/shared/stream-deck-actions.ts`
- `packages/hub/src/plugin.ts`
- `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`

The current proto already has the intended extension seam:

```text
MetricSelection.oneof target
  cpu
  memory
  network
  disk
  gpu
  catalog
```

Its comment explicitly says user-authored HTTP/CLI probes should use their own
target shape instead of being folded into catalog metrics.

The current proto also contains `MetricSourceProfile` and
`HttpMetricSourceConnection`. Do not reuse them for this V1 feature.
`HttpMetricSourceConnection` belongs to global descriptor-producing source
profiles. V1 Custom Metric is widget-local and scalar, so reusing the profile
connection shape would incorrectly pull in reusable source catalog ownership.

## Implementation Steps

### Step 1: Settings Contract And Resolved Model

LOC estimate: 700-1,200.

Purpose:

Add a stored and resolved Custom Metric target with an HTTP single-request
source plan, without adding runtime HTTP I/O.

Locations:

- `contracts/proto/shometrics/v1/settings.proto`
- generated settings output under
  `packages/hub/src/generated/proto/shometrics/v1/`
- `packages/hub/src/settings/resolved-settings.ts`
- `packages/hub/src/settings/storage/resolver/metric-target-resolver.ts`
- `packages/hub/src/settings/storage/resolver/widget-settings-resolver.ts`
- `packages/hub/src/settings/storage/patch/widget-settings-patch.ts`
- `packages/hub/src/settings/storage/patch/widget-settings-patch-types.ts`
- `packages/hub/src/settings/storage/patch/metric-target-settings-patch.ts`
- `packages/hub/src/settings/storage/patch/appearance-settings-patch.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.test.ts`
- `packages/hub/src/settings/storage/quick-start-widget-settings.ts`
- `packages/hub/src/settings/storage/quick-start-widget-settings.test.ts`

Required work:

1. Add a new `custom` target arm to `MetricSelection.oneof target`.
2. Add a stored `CustomMetricTarget` message whose V1 source oneof contains
   `http`.
3. Add `CustomHttpMetricSource` with a `plan` oneof containing
   `single_request`.
4. Add `SingleCustomHttpRequest` for the V1 widget-local HTTP definition.
5. Store only persisted user intent:
   - URL;
   - user intent text;
   - jq transform;
   - no runtime metric key;
   - no `actionId`;
   - no generated UUID;
   - no fetched sample body;
   - no validated output preview;
   - no runtime status.
6. Add resolved Custom Metric target types with explicit `http` source and
   `singleRequest` plan nesting.
7. Add resolver validation and defaulting for absent/unconfigured Custom Metric
   source and HTTP single-request plan.
8. Add sparse patch support for editing Custom Metric HTTP fields.
9. Add quick-start settings for the new Custom Metric action in an
   unconfigured state.
10. Do not add `ActionKind.customMetric`, manifest entries, plugin
    registration, or an action class in Step 1. If tests need to initialize
    Custom Metric settings before Step 4, use a narrow test/local initializer
    type instead of exposing a public action kind early.

Acceptance:

- Proto lint/build/generation passes.
- Resolver can resolve an unconfigured Custom Metric target without throwing.
- Resolver rejects or marks invalid persisted HTTP definitions without
  inventing runtime identity.
- Copying stored settings in tests does not duplicate a persisted runtime
  metric key because none exists.

Do not merge with Step 2:

Step 1 owns persisted/resolved shape. Step 2 owns runtime identity and source
registration. Merging them makes it too easy to persist runtime-only identity.

### Step 2: Runtime Identity And Definition Registry

LOC estimate: 800-1,300.

Purpose:

Map active Stream Deck action instances to runtime Custom HTTP definitions and
metric keys without doing HTTP fetch or jq execution.

Locations:

- `packages/hub/src/runtime/sources/source-ids.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-metric-key.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-definition-registry.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-definition-registry.test.ts`
- `packages/hub/src/runtime/source-routing/metric-read-plan.ts`
- `packages/hub/src/runtime/source-routing/custom-http-read-plan.ts`
- `packages/hub/src/actions/metric-action.ts`

Do not create `packages/hub/src/actions/custom-metric.ts` in Step 2. The action
class belongs to Step 4. Step 2 may add shared lifecycle hooks or protected
extension points only when the existing action base needs them.

Required work:

1. Add `CUSTOM_HTTP_SOURCE_ID = "custom-http"`.
2. Add a pure `buildCustomHttpRuntimeIdentity(...)` helper. It is the only
   production code path that may create a `custom-http:` runtime metric key.
3. Add a pure host slug sanitizer:
   - hostname only;
   - lowercase;
   - keep `a-z`, `0-9`, and dots before dot conversion;
   - dot to hyphen;
   - collapse hyphens;
   - trim hyphens;
   - max 32 chars;
   - no path/query/fragment.
4. Add tests for:
   - `api.open-meteo.com`;
   - `localhost`;
   - `127.0.0.1`;
   - `192.168.4.48`;
   - invalid URL;
   - query string not appearing in the key.
5. Add consumer slug handling:
   - single Custom Metric action uses fixed `single`;
   - Dense rows use `dense-<slotId>`;
   - Stacked slots use `stacked-<slotId>`;
   - direct `actionId`-only identity is invalid.
6. Add tests that two Dense rows in the same action and host produce different
   runtime metric keys.
7. Add tests that two Stacked slots in the same action and host produce
   different runtime metric keys.
8. Add a test or static grep-style guard that direct `custom-http:` key
   construction exists only in the shared helper and its tests.
9. Add a runtime definition registry keyed by runtime metric key, with explicit
   register, replace, read, and unregister APIs.
10. Add unit tests for registry replacement and unregister cleanup.
11. If `MetricAction` needs a lifecycle extension point for future Custom Metric
   registration, add the narrow protected hook here. Do not wire a Custom Metric
   action lifecycle in Step 2.
12. Add a pure Custom HTTP read-plan helper that routes the runtime metric key to
   `CUSTOM_HTTP_SOURCE_ID` and a Custom HTTP source scope.

Acceptance:

- Runtime keys are deterministic for one active `event.action.id`.
- Runtime keys are different for different action ids even when settings are
  identical.
- Runtime keys are different for different consumer ids within the same action.
- Runtime keys do not include URL path or query.
- Moving/copying/importing remains safe because no runtime key is stored.
- A future widget cannot accidentally use action-id-only keys without failing
  tests.

Do not merge with Step 3:

Step 2 proves identity and lifecycle cleanup without network or transform
failure noise. Step 3 adds untrusted input execution and must be tested
separately.

### Step 3: HTTP Source Client And jq Execution

LOC estimate: 1,200-2,000.

Purpose:

Add the `custom-http` source client that fetches JSON, runs jq safely, validates
the single-metric output, and returns `MetricSnapshot` data.

Locations:

- `packages/hub/src/runtime/sources/source-registry.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-source-client.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-fetcher.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-transform-worker-thread.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-transform-worker-pool.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-output-schema.ts`
- `packages/hub/src/runtime/sources/custom-http/*.test.ts`
- `packages/hub/package.json`
- `packages/hub/package-lock.json`

Required work:

1. Register one `CustomHttpSourceClient` in `createDefaultSourceRegistry`.
2. Source client resolves requested runtime metric keys through the definition
   registry from Step 2.
3. Fetch only HTTP/HTTPS GET JSON.
4. Enforce the 256 KiB response cap before JSON parse.
5. Apply the 5 second HTTP timeout with `AbortSignal.timeout(...)`.
6. Use explicit redirect behavior. V1 follows redirects; do not rely on an
   unstated fetch default.
7. Parse JSON and run jq through a bounded worker-thread pool.
8. Do not spawn a new Worker for every poll in production.
9. Use exact-pinned `workerpool@10.0.2` for the jq worker pool unless a later
   safety review rejects it. Keep workerpool details behind
   `CustomHttpTransformRunner`; source clients must not import workerpool.
10. Enforce transform timeout through the worker-pool owner. A timed-out worker
   must be terminated and replaced; it must not be returned to the pool.
11. Workerpool replacement-race behavior must be tested: if a queued task sees
   `Worker terminated` immediately after a timed-out worker is killed, the pool
   owner may retry that task once.
12. Validate the single-object output schema.
13. Keep the Step 3 runtime validator as the source of truth for runtime
   semantics. Step 9 must migrate Property Inspector tests and transform exam
   tooling to this final schema. Do not leave a long-lived validator in
   `custom-http-output-schema.ts` and a divergent copy in
   `custom-metric-transform-check.mjs`.
14. Do not use Ajv in Step 3. The V1 schema is a small fixed object, and the
    runtime boundary also converts units into source-owned `MetricUnit` data.
    A hand-written validator is simpler here as long as it remains the single
    source of truth. Reconsider Ajv only if Step 5 or Step 9 needs a declarative
    schema for PI/prompt tooling and would otherwise duplicate validation
    logic.
15. Convert output into source-owned metric sample/snapshot data and source
    attribution. Do not produce render-facing `WidgetData` in the source
    client.
16. Return unavailable reports for:
   - missing runtime definition;
   - invalid URL;
   - response too large;
   - HTTP failure;
   - JSON parse failure;
   - jq failure;
   - output schema failure.
17. Log bounded summaries at the source-client boundary. Do not log full URL,
    query string, response body, or transform text.
18. Promote `jq-wasm` to a production dependency if production source code
    imports it. Do not ship JSONata runtime code.

Dependency safety notes for Step 3:

| Package | Version | Decision | Evidence |
| --- | --- | --- | --- |
| `jq-wasm` | `1.1.0-jq-1.8.1` | Production dependency. | Chosen by Stage 1 POC; exact pinned; no runtime dependencies in lockfile. |
| `workerpool` | `10.0.2` | Production dependency for bounded jq worker pool. | Published 2026-04-16; Apache-2.0; repository `git://github.com/josdejong/workerpool.git`; no runtime dependencies; no optional dependencies; npm metadata has no install lifecycle scripts; dry-run tarball has 52 files, no bundled dependencies, and no install-time binary download; `.timeout(ms)` terminates the worker running the timed-out task. |
| `jsonata` | `2.0.6` | Dev-only POC comparison dependency. | Do not import from production source. |

`npm.cmd audit --omit=dev --json` still reports the existing production
`systeminformation` and `ws` issues; it did not introduce a jq-wasm or
workerpool production vulnerability.

Acceptance:

- A valid local fixture produces one metric sample.
- All failure classes produce bounded unavailable reports.
- Oversized responses fail before JSON parse.
- Transform output size and schema are enforced.
- Worker timeout cannot hang the plugin process.
- Worker concurrency is bounded and repeated polling does not create unbounded
  Worker processes.
- Timeout followed by a queued transform is covered by a regression test.
- `npm.cmd audit` does not introduce new jq-wasm or workerpool high/critical
  production issues.

Do not merge with Step 4:

Step 3 owns source execution and runtime safety. Step 4 owns Stream Deck action
registration and rendering. Mixing them makes it hard to tell whether a failure
is source execution or action/view wiring.

### Step 4: Custom Metric Action And Single-Widget Rendering

LOC estimate: 700-1,200.

Purpose:

Expose Custom Metric as a Stream Deck action that renders through the existing
single-metric view pipeline.

Locations:

- `packages/hub/src/actions/custom-metric.ts`
- `packages/hub/src/plugin.ts`
- `packages/hub/src/shared/stream-deck-actions.ts`
- `packages/hub/src/actions/settings/action-settings-resolver.ts`
- `packages/hub/src/runtime/sources/source-client.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-source-client.ts`
- `packages/hub/src/metrics/` or an action-owned builder if no shared metric
  helper is needed
- `packages/hub/src/view-updates/runner.ts` only if required by existing
  render contract gaps
- `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`
- `packages/hub/src/i18n/manifest-messages.ts`
- `packages/hub/src/i18n/message-groups/widgets.ts`
- `packages/hub/com.ez.sho-metrics.sdPlugin/*.json`

Required work:

1. Add `ActionKind.customMetric`.
2. Add a Stream Deck action with label **Custom Metric** and UUID suffix
   `custom-metric`.
3. Add a `CustomMetric` action class extending `MetricAction`.
4. Register Custom Metric in `plugin.ts`.
5. Return the runtime metric key from the shared Custom HTTP identity helper
   using the active action id and fixed `single` consumer id.
6. Register the active action's resolved HTTP definition on `onWillAppear` and
   settings updates.
7. Unregister on `onWillDisappear`.
8. Build Custom HTTP widget data from the source output:
   - label;
   - value;
   - unit/custom unit;
   - maximum when present;
   - progress when maximum or an existing semantic default is available.
   This adaptation belongs to the action/metric layer, not the Custom HTTP
   source client.
   If MetricStore attribution is the transport for label/unit/maximum hints,
   keep those fields as source metadata only; the source client must still not
   build renderer-facing `WidgetData`.
9. Preserve the existing single-metric appearance/view behavior.
10. Render:
   - `Configure` for unconfigured;
   - `Error` for invalid configuration before a valid metric exists;
   - `...` while waiting for first configured sample;
   - `N/A` for runtime failures after configuration.

Acceptance:

- A configured Custom Metric key renders a value.
- Existing single CPU/Memory/Disk/Network/GPU/Catalog actions still render.
- Existing MetricAction settings logs do not assume single built-in targets.
- No renderer imports stored proto types.

Do not merge with Step 5:

Step 4 makes the key work from already-valid settings. Step 5 builds the
configuration workflow. Keeping them separate allows tests to create valid
settings directly and isolate runtime/render bugs from PI bugs.

### Step 5: Property Inspector Configuration Workflow

LOC estimate: 1,500-2,400.

Purpose:

Let users configure and validate a Custom Metric without embedding AI or
leaking raw HTTP data into logs.

Locations:

- `packages/hub/src/property-inspector/panels/CustomMetricWidgetSettings.tsx`
- `packages/hub/src/property-inspector/panels/WidgetSettingsTab.tsx`
- `packages/hub/src/property-inspector/controls/`
- `packages/hub/src/property-inspector/stream-deck/`
- `packages/hub/src/property-inspector/settings-sync/`
- `packages/hub/src/actions/custom-metric.ts`
- `packages/hub/src/runtime/widget-runtime-cache.ts`
- `packages/hub/src/i18n/message-groups/widgets.ts`
- `packages/hub/src/property-inspector/panels/*.test.tsx`

Required work:

1. Add a Custom Metric settings panel.
2. Keep HTTP source editing in a focused drill-in page, similar to the Stacked
   slot editor. The top-level widget page shows a source summary plus ordinary
   appearance and polling settings; the HTTP editor page owns URL, user intent,
   sample fetch, prompt, jq, and transform test controls.
3. User inputs:
   - HTTP URL;
   - sample fetch/test command;
   - user intent text;
   - jq transform;
   - test transform command.
4. Provide a copyable generic prompt using the final single-metric output
   schema. The prompt appears before the jq transform field so the user workflow
   is: describe what to show, fetch a sample, copy the prompt to an external AI
   chatbot, paste the generated jq rule back into Sho Metrics.
   If the sample preview is truncated, the PI and prompt must both say so.
   Never silently embed a truncated `...` preview as if it were complete valid
   JSON.
5. Do not call AI services from Sho Metrics.
6. Fetch/test through the plugin action/runtime boundary, not directly from the
   PI browser. This avoids CORS differences and keeps bounded logging at the
   source owner.
7. Store only settings needed for runtime. Do not store sample response bodies
   in action settings.
   Full fetched sample JSON is action-local in-memory state only. The PI may
   display bounded sample/output previews and prompt drafts, but none of those
   values may be persisted or routed through the ordinary source runtime cache.
   They must disappear when the PI closes or refreshes.
   The action-local sample fetch/test path may own its own lazy jq runner
   instead of sharing the runtime source-client pool. This is intentional as
   long as the runner contract stays the same and preview/test work does not
   mutate polling state.
   V1 also accepts the lightweight fetch-cache race where an older in-flight PI
   fetch can complete after a newer PI instance. The cache remains action-local,
   URL-matched, and user-recoverable by fetching the sample again; add a
   sequence guard only if this becomes observable in normal use.
8. Show detailed bounded errors in PI for URL, HTTP, JSON, jq, schema, and
   response-size failures. Failure details must be selectable and copyable so
   users can paste them into an external debugger or support message.
9. Show a preview of the validated output metric.
10. Clearly state that Custom Metric settings are saved in Stream Deck action
   settings and are included in Stream Deck exports. V1 does not support
   secrets.
11. Keep polling settings widget-level through existing `WidgetPreferences`.

Acceptance:

- A user can configure a no-auth HTTP JSON endpoint and jq transform from PI.
- PI can fetch/test a sample capped at 256 KiB.
- Truncated sample previews are explicitly marked in the PI and in copied AI
  prompts.
- PI can test a transform without saving raw sample JSON.
- Invalid configuration does not crash the PI or plugin.
- User-visible strings are i18n-owned.

Do not merge with Step 6 or Step 7:

Step 5 owns the first configuration workflow with the current fixed request
policy. Step 6 owns icon suggestion, picker, and rendering defaults. Step 7
changes persisted request policy, runtime fetch behavior, PI controls, and
diagnostics. Merging them would hide display and network-policy decisions inside
the first HTTP editor.

### Step 6: Custom Metric Icon Selection

LOC estimate: 900-1,500.

Status: implemented but not committed in the current Step 6 worktree.

Purpose:

Let Custom Metric keys show a useful center icon without relying on emoji fonts
or hard-coded question-mark fallbacks, while keeping user choice independent
from AI suggestions.

Locations:

- `contracts/proto/shometrics/v1/settings.proto`
- generated settings files
- `packages/hub/src/settings/storage/resolver/`
- `packages/hub/src/settings/storage/patch/`
- `packages/hub/src/runtime/sources/custom-http/custom-http-output-schema.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-source-client.ts`
- `packages/hub/scripts/generate-lucide-icon-index.mjs`
- generated Lucide search index under `packages/hub/src/generated/`
- `packages/hub/src/widgets/icons/`
- `packages/hub/src/actions/custom-metric.ts`
- `packages/hub/src/property-inspector/controls/`
- `packages/hub/src/property-inspector/panels/CustomMetricWidgetSettings.tsx`
- `packages/hub/src/i18n/message-groups/widgets.ts`
- related proto, resolver, patch, PI, source-client, and action tests

Required work:

1. Add a nested Custom Metric icon settings message with `string id`. Do not name
   the stored field `lucideIconId`; storage remains provider-neutral.
2. In V1, interpret `icon.id` as a Lucide icon id through an app-owned registry.
   Future non-Lucide icon providers require an explicit schema extension.
3. Add optional `suggestedLucideIconId` to the transform output schema. Validate
   it against the same registry. Invalid suggestions are ignored, not persisted,
   and not rendered as broken icons.
4. Update the copyable AI prompt to say `suggestedLucideIconId` is optional and
   advisory. The prompt must not imply that AI output writes widget settings.
5. Generate the Lucide search index from exact-pinned npm packages, not from a
   developer-local Lucide checkout. `lucide` owns renderable icon exports and
   aliases; `lucide-static` owns tag metadata. The two package versions must
   match exactly.
6. Keep the Lucide search index under `packages/hub/src/generated/` as an
   ignored build artifact. Proto generation is scoped to
   `packages/hub/src/generated/proto/`, so the Lucide generator can share the
   generated root without being erased by the proto generator's `clean: true`.
   `prebuild`, `pretest:*`, and `prelint` must run the Lucide generator.
7. Do not render every Lucide icon component in the PI. Search the metadata
   index, then render only the visible top candidates.
8. Build a custom PI picker, not an HTML native `select` and not a native popup.
   Stream Deck's Qt WebEngine compatibility makes native popup behavior
   unreliable.
9. Picker UX:
   - one search input;
   - no grouping in V1;
   - empty search keeps the autocomplete result list hidden;
   - non-empty search ranks all icons by id, label, npm-provided aliases, and
     `lucide-static` tags using lower-case substring matching, then renders
     only the top 10 results;
   - when more than 10 matches exist, show a short "keep typing" hint instead
     of rendering the full list.
10. Rendering precedence:
   - if stored `icon.id` is valid, use it;
   - otherwise, if the latest validated source output has a valid
     `suggestedLucideIconId`, use it;
   - otherwise, use a non-question-mark default icon.
11. Once the user chooses an icon, persist `icon.id` and ignore future transform
    suggestions for that widget until the user clears or changes the icon.
12. The transform test preview may show the suggested icon, but testing a
    transform must not persist `icon.id`.
13. Add tests for valid/invalid icon ids, user override precedence, picker search
    result limiting, and Custom Metric default icon rendering.

Acceptance:

- The default Custom Metric circle center icon is not a question mark and does
  not use emoji.
- AI-suggested icons render only when the user has not chosen an icon.
- A user-selected icon persists and overrides later suggestions.
- The PI picker does not render hundreds or thousands of icon elements at once.
- Stored settings contain `icon.id`, not a Lucide-specific stored field name.

Implemented shape:

- Stored settings use `CustomMetricTarget.icon.id`.
- Resolved settings expose widget-owned `ResolvedCustomMetricTarget.iconId`.
- Transform output accepts optional `metric.suggestedLucideIconId`; valid ids
  are normalized through the shared Custom Metric icon registry, invalid ids are
  ignored instead of failing the metric.
- Source attribution carries `displayHint.suggestedLucideIconId`; action
  rendering uses stored icon first, source suggestion second, default icon last.
- The PI picker uses a generated Sho Metrics-owned Lucide metadata search index
  and renders at most 10 icon candidates. It uses a search input plus a custom
  listbox-style result list, not a native select or native popup.
- The Lucide search index is generated at
  `packages/hub/src/generated/custom-metric-lucide-search-index.generated.ts`
  and is not committed. `.gitignore` keeps generated runtime artifacts ignored.
  `prebuild`, `pretest:*`, and `prelint` regenerate it from exact-pinned npm
  inputs.
- The custom listbox behaves like an autocomplete: it is hidden until the user
  types a query. Search matches lower-case substrings from the generated
  index's id, label, npm alias names, and `lucide-static` tags. Installed
  `lucide` npm package files do not include the upstream per-icon JSON metadata;
  V1 intentionally uses `lucide-static/tags.json` instead of a local Lucide repo
  checkout for reproducibility.
- The generated search index is metadata-only; rendering resolves the selected
  or visible Lucide icon id through the runtime icon resolver.
- Transform testing can preview the suggested icon id but does not persist
  `icon.id`.

Do not merge with Step 7:

Step 6 owns display identity, icon suggestion, PI picker behavior, and renderer
icon defaults. Step 7 owns HTTP request policy. Combining them would mix visual
configuration with network behavior and make both harder to review.

### Step 7: Custom HTTP Request Configuration

LOC estimate: 700-1,200.

Purpose:

Let users tune HTTP request behavior without changing the Custom Metric source
model into a reusable source catalog or an auth system.

Locations:

- `contracts/proto/shometrics/v1/settings.proto`
- `packages/hub/src/settings/storage/resolver/`
- `packages/hub/src/settings/storage/patch/`
- `packages/hub/src/runtime/sources/custom-http/custom-http-fetcher.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-source-client.ts`
- `packages/hub/src/property-inspector/panels/CustomMetricWidgetSettings.tsx`
- `packages/hub/src/i18n/message-groups/widgets.ts`
- related resolver, patch, source-client, fetcher, and PI tests

Required work:

1. Add a Custom HTTP request config under the Custom HTTP definition. It must
   belong to the HTTP source definition, not generic `WidgetPreferences`.
2. Persist timeout and retry count only. Defaults preserve current behavior:
   5 second timeout and 0 retries.
3. Timeout is per HTTP attempt, not the whole polling cycle. UI bounds are
   1, 2, 3, 5, 10, 15, or 30 seconds. `retry_count` is the number of additional
   attempts after the first attempt; 2 means one original request plus two
   retries. UI bounds are 0, 1, 2, or 3 retries.
4. Runtime fetch, PI sample fetch, and transform test must use the same
   resolved request config. Do not create a PI-only network policy.
5. Retry only network/timeout-style fetch failures. Do not retry invalid URL,
   unsupported protocol, HTTP 4xx, HTTP 5xx, response-too-large, JSON parse,
   jq, or schema failures. Use fixed-code exponential retry delays with jitter,
   currently 500 ms, 1000 ms, and 2000 ms bases with +/-20% jitter. Do not add
   a strategy/policy system.
6. PI must show the effective timeout, retry count, and 256 KiB response cap
   near the sample fetch controls and in failure debug details.
7. Custom HTTP may expose longer polling options than ordinary hardware
   widgets, up to 24 hours. The Custom HTTP PI options are 5m, 15m, 30m, 1h,
   2h, 3h, 6h, 12h, and 24h in addition to the ordinary short intervals. Other
   widget UIs stay capped at 60 seconds. Runtime must accept Custom HTTP
   polling values in the 1-86400 second range; otherwise a valid stored 24h
   setting would silently fall back to 1 second. Custom HTTP defaults to 3
   seconds instead of the ordinary 1 second because network APIs should not be
   polled as aggressively as local hardware metrics unless the user opts in.
8. Keep the existing collector in-flight policy: the periodic source runner
   schedules the next refresh only after the current refresh finishes. If another
   caller forces `refreshNow()` while a refresh is pending, it returns
   `skippedPending`. Do not queue, do not run concurrent polls for the same
   collector group, and do not kill the in-flight request to start a newer one.
   Killing wastes rate-limited requests and can repeatedly prevent a slow
   endpoint from ever returning.
9. PI must warn when the worst-case request budget can exceed the polling
   frequency. Worst case is attempt timeout multiplied by total attempts plus
   the maximum jittered retry delays plus one final bounded DNS diagnostic. The
   warning should explain that source refresh waits for the current request to
   finish before scheduling the next one, so the effective refresh cadence can
   be slower than the configured polling frequency.
10. Keep the system DNS resolver as the default. Do not force public DNS by
   default. If a future advanced resolver option is added, it must be explicit,
   off by default, and must not apply to localhost, private IPs, or likely
   internal hostnames.
11. Do not implement custom headers, auth, cookies, tokens, sequence requests,
   parallel requests, or per-request cache policy in this step.
12. Do not store raw secrets in widget/action settings. If future auth is added,
   the widget proto should store an opaque credential reference such as
   `credential_ref`, not `token`, `token_path`, or a raw header value.
13. Treat Stream Deck global settings/secrets as the first credential-storage
    candidate for future auth. The installed official SDK
    `@elgato/streamdeck@2.1.0` documents global settings as plugin-only and
    suitable for secure persistence, and exposes `getSecrets()`. Confirm the
    exact write/read workflow before implementing auth.
14. Before adding any external credential-store npm package, run a package
    safety review. Current candidates are native/prebuilt-package based; there
    is no approved no-brainer Node credential dependency for this project.

Acceptance:

- Existing Custom Metric settings without request config still resolve to a 5
  second timeout and 0 retries.
- Users can configure timeout and retry count from the focused HTTP editor.
- Sample fetch/test and runtime polling use identical effective request config.
- Failure debug details include the effective timeout, retry count, and response
  size cap without logging URL query strings, response bodies, jq transforms, or
  secrets.
- Custom HTTP can be configured for long polling up to 24 hours without changing
  ordinary widget polling options.
- If timeout/retry worst case exceeds the polling interval, PI shows a warning
  explaining that the next source refresh waits for the current request to
  finish.
- No auth, header, token, or credential field is added unless a later step
  explicitly designs Stream Deck global secret/global-settings storage.

Do not merge with Step 8:

Step 7 owns HTTP request policy. Step 8 owns multi-slot consumers. Combining
them would mix network behavior with Dense/Stacked slot ownership and make
per-slot failures harder to reason about.

### Step 8: Dense And Stacked Consumption

Milestone: V1.1 unless the user explicitly pulls Dense/Stacked consumption into
the first V1 implementation batch.

LOC estimate: 1,000-1,800.

Purpose:

Allow Dense Multi Metric and Stacked Metric to use Custom Metric targets with
HTTP sources, without adding a reusable source catalog.

Locations:

- `packages/hub/src/actions/dense-multi-metric.ts`
- `packages/hub/src/actions/dense-multi-metric/row-data.ts`
- `packages/hub/src/actions/stacked-metric.ts`
- `packages/hub/src/property-inspector/panels/DenseMetricRowsSettings.tsx`
- `packages/hub/src/property-inspector/panels/StackedMetricWidgetSettings.tsx`
- `packages/hub/src/property-inspector/panels/SingleMetricWidgetSettings.tsx`
- `packages/hub/src/settings/storage/patch/widget-settings-patch.ts`
- `packages/hub/src/settings/storage/patch/widget-settings-patch-types.ts`
- `packages/hub/src/settings/storage/patch/metric-target-settings-patch.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.test.ts`
- `packages/hub/src/actions/dense-multi-metric.test.ts`
- `packages/hub/src/actions/stacked-metric.test.ts`

Required work:

1. Dense row read-plan construction must register and route each Custom HTTP
   slot with its own runtime metric key.
2. Dense row failure remains slot-level. One failed Custom Metric HTTP row must
   not blank the widget.
3. Dense PI must not add per-row theme, polling, or appearance. Only the row's
   Custom Metric HTTP source definition belongs to that row.
4. Stacked slots already own complete single-metric settings. Custom HTTP
   targets should work through the existing child single-metric editor path.
5. Reorder/remove must unregister stale runtime definitions and register the
   active definitions after settings updates.
6. Duplicate Custom HTTP definitions in different Dense rows or Stacked slots
   remain separate runtime metric keys in V1.
7. Use the Step 2 shared identity helper. Do not invent Dense-only or
   Stacked-only runtime key formatting.
8. Remove the Step 1 placeholder behavior in all known Custom Metric deferral
   sites:
   - Dense read/data path currently treats Custom Metric rows as unconfigured
     empty rows;
   - Stacked read/view paths currently fail fast if a Custom Metric slot reaches
     runtime routing before Step 8 support is wired;
   - Dense PI category resolution currently maps Custom Metric to the catalog
     bucket only as a temporary unreachable fallback.

Acceptance:

- Dense can display at least two Custom Metric HTTP rows with independent
  definitions.
- Dense degrades one failed Custom Metric HTTP row without blanking the widget.
- Stacked can rotate between Custom HTTP and built-in metric slots.
- Copy/import of Dense or Stacked widgets does not copy runtime metric keys
  because runtime keys are not stored.

Do not merge with Step 5, Step 6, or Step 7:

Dense and Stacked have separate slot ownership, read-plan, and failure-domain
rules. They must consume the Step 5 editor/runtime pieces, Step 6 icon pieces,
and Step 7 request config pieces after those pieces are stable, not while those
pieces are being invented.

### Step 9: Verification, Documentation, And Cleanup

LOC estimate: 1,000-1,700.

Purpose:

Close the implementation with tests that protect the identity, security, and
runtime-source boundaries.

Locations:

- `packages/hub/src/runtime/sources/custom-http/*.test.ts`
- `packages/hub/src/actions/custom-metric.test.ts`
- `packages/hub/src/actions/dense-multi-metric.test.ts`
- `packages/hub/src/actions/stacked-metric.test.ts`
- `packages/hub/src/property-inspector/panels/*.test.tsx`
- `packages/hub/src/settings/storage/*.test.ts`
- `packages/hub/tests/visual/` only if Custom Metric introduces new visual
  rendering behavior
- `docs/development/runtime-sources/05-custom-metrics/`
- `packages/hub/com.ez.sho-metrics.sdPlugin/GENERATED_TRANSLATIONS.md`

Required work:

1. Add tests for runtime metric key uniqueness and host slug sanitization.
2. Add tests for consumer-scope uniqueness across single, Dense, and Stacked.
3. Add tests that cloned stored settings do not contain runtime identity.
4. Add source-client tests for all failure states.
5. Add PI tests for sample fetch/test transform workflows.
6. Add action tests for `Configure`, `Error`, first-sample wait, and runtime
   `N/A`.
7. Add Dense and Stacked integration tests if Step 8 is implemented in the same
   batch.
8. Update the POC/exam scripts and committed corpus expected output to the final
   `{ "metric": ... }` schema, including optional `suggestedLucideIconId`.
9. Rerun the transform generation exam against the final single-object schema
   for the core source cases before claiming the AI workflow is validated.
10. Update docs with final V1 behavior and explicit deferred TODOs.
11. Remove or quarantine POC-only dependencies and scripts that should not ship
   in runtime. Keep corpus scripts only if they are documented dev tooling.

Verification commands:

```text
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run build
npm.cmd run test:unit
```

Run visual tests only if rendering output changes beyond ordinary data-driven
single-metric output.

Acceptance:

- All verification commands pass.
- No temporary probe logs remain.
- No raw HTTP body, query string, transform text, or secrets are logged in
  ordinary failure paths.
- `jq-wasm` dependency status matches whether runtime code imports it.
- JSONata is not shipped as runtime code.

Do not merge with any implementation step:

This step proves the whole feature's boundary invariants. If it is merged into
feature implementation, identity, security, and cleanup failures become too
easy to wave through as incidental implementation details.

## Step Boundary Summary

If asked whether these steps can be merged, the default answer is no.

| Steps | Why they must stay separate |
| --- | --- |
| Step 1 and Step 2 | Stored settings must not learn runtime identity. |
| Step 2 and Step 3 | Runtime identity/lifecycle must be proven before adding network and jq failures. |
| Step 3 and Step 4 | Source execution and action rendering have different owners and failure surfaces. |
| Step 4 and Step 5 | Runtime/render correctness must be testable without PI. |
| Step 5 and Step 6 | HTTP editing and icon selection have different owners: source configuration versus visual identity. |
| Step 6 and Step 7 | Icon selection changes display/render defaults; request policy changes persisted settings, runtime fetch behavior, and diagnostics. |
| Step 7 and Step 8 | Request policy and multi-slot ownership have different failure domains. |
| Step 8 and Step 9 | Verification must assert cross-step invariants, not hide inside implementation. |

## Deferred TODOs

- Reusable Custom Metric source catalog.
- Multi-metric transform output.
- Exact request coalescing inside `CustomHttpSourceClient`.
- Sequence and parallel HTTP request pipelines.
- Per-request cache policy for static lookup data.
- Custom headers, auth, and Stream Deck global credential references.
- Advanced custom DNS resolver policy.
- Non-Lucide icon providers and emoji/font-backed icon rendering.
- Large JSON schema/sample summarization before AI prompt generation.
- Dedicated LHM remote JSON catalog source.
- Local command/CLI Custom Metric source type.
