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
- V1 source type: HTTP GET JSON.
- Internal source type id: `custom-http`.
- Transform engine: jq through `jq-wasm`.
- V1 output is exactly one metric object. Do not use `metrics[]` in the runtime
  output schema.
- V1 does not implement a reusable source catalog or source picker.
- V1 stores the HTTP definition inside the widget settings that use it.
- V1 stores the user's display request text so the PI can rebuild the prompt and
  explain what the transform is meant to extract.
- V1 does not implement sequence, parallel, request pipelines, request
  dependency graphs, auth, secrets, cookies, POST bodies, local command
  execution, or arbitrary text metrics.
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
- `value` is required and must be a finite number.
- `unit` is required.
- `customUnit` is required when `unit` is `custom`.
- `customUnit` must be absent when `unit` is not `custom`.
- `maximum` is optional, but when present it must be a positive finite number.
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
rpm
unitless
custom
```

Formatting rules:

- Known semantic units use Sho Metrics' existing unit formatting and scaling
  rules where they exist.
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
- auth, token, cookie, or OS credential storage;
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

Add a stored and resolved Custom HTTP target without adding runtime HTTP I/O.

Locations:

- `contracts/proto/shometrics/v1/settings.proto`
- generated settings output under `packages/hub/src/generated/shometrics/v1/`
- `packages/hub/src/settings/resolved-settings.ts`
- `packages/hub/src/settings/storage/resolver/metric-target-resolver.ts`
- `packages/hub/src/settings/storage/resolver/widget-settings-resolver.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.test.ts`
- `packages/hub/src/settings/storage/quick-start-widget-settings.ts`
- `packages/hub/src/settings/storage/quick-start-widget-settings.test.ts`

Required work:

1. Add a new `custom_http` target arm to `MetricSelection.oneof target`.
2. Add a stored message for the widget-local HTTP definition.
3. Store only persisted user intent:
   - URL;
   - display request text;
   - jq transform;
   - no runtime metric key;
   - no `actionId`;
   - no generated UUID;
   - no fetched sample body;
   - no validated output preview;
   - no runtime status.
4. Add resolved Custom HTTP target types.
5. Add resolver validation and defaulting for absent/unconfigured HTTP target.
6. Add sparse patch support for editing Custom HTTP fields.
7. Add quick-start settings for the new Custom Metric action in an
   unconfigured state.

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
- `packages/hub/src/actions/metric-action.ts`
- `packages/hub/src/actions/custom-metric.ts`

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
9. Add a runtime definition registry keyed by runtime metric key.
10. Register the active action's resolved HTTP definition on `onWillAppear` and
   settings updates.
11. Unregister on `onWillDisappear`.
12. Build a Custom HTTP read plan that routes the runtime metric key to
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
- `packages/hub/src/runtime/sources/custom-http/custom-http-transform-worker.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-transform-worker-pool.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-output-schema.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-widget-data.ts`
- `packages/hub/src/runtime/sources/custom-http/*.test.ts`
- `packages/hub/package.json`
- `packages/hub/package-lock.json`

Required work:

1. Register one `CustomHttpSourceClient` in `createDefaultSourceRegistry`.
2. Source client resolves requested runtime metric keys through the definition
   registry from Step 2.
3. Fetch only HTTP/HTTPS GET JSON.
4. Enforce the 256 KiB response cap before JSON parse.
5. Parse JSON and run jq through a bounded worker-thread pool.
6. Do not spawn a new Worker for every poll in production.
7. Enforce transform timeout through the worker-pool owner. A timed-out worker
   must be terminated and replaced; it must not be returned to the pool.
8. If implementation needs a numeric HTTP timeout, redirect policy, or TLS
   exception policy and no existing project-owned source policy applies, stop
   and ask before choosing one.
9. Validate the single-object output schema.
10. Keep the output schema as a single source of truth shared by runtime,
   Property Inspector tests, and transform exam tooling. Do not maintain one
   validator in `custom-http-output-schema.ts` and a divergent copy in
   `custom-metric-transform-check.mjs`.
11. Prefer JSON Schema + Ajv for the final validator if package safety review
   passes. If Ajv is not used, document why and keep one shared validator.
12. Convert output into `MetricSnapshot` and source attribution.
13. Return unavailable reports for:
   - missing runtime definition;
   - invalid URL;
   - response too large;
   - HTTP failure;
   - JSON parse failure;
   - jq failure;
   - output schema failure.
14. Log bounded summaries at the source-client boundary. Do not log full URL,
    query string, response body, or transform text.
15. Promote `jq-wasm` to a production dependency if production source code
    imports it. Do not ship JSONata runtime code.

Acceptance:

- A valid local fixture produces one metric sample.
- All failure classes produce bounded unavailable reports.
- Oversized responses fail before JSON parse.
- Transform output size and schema are enforced.
- Worker timeout cannot hang the plugin process.
- Worker concurrency is bounded and repeated polling does not create unbounded
  Worker processes.
- `npm.cmd audit` does not introduce new jq-related high/critical production
  issues.

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
- `packages/hub/src/metrics/`
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
6. Build Custom HTTP widget data from the source output:
   - label;
   - value;
   - unit/custom unit;
   - maximum when present;
   - progress when maximum or an existing semantic default is available.
7. Preserve the existing single-metric appearance/view behavior.
8. Render:
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
2. User inputs:
   - HTTP URL;
   - sample fetch/test command;
   - display request text;
   - jq transform;
   - test transform command.
3. Provide a copyable generic prompt using the final single-metric output
   schema.
4. Do not call AI services from Sho Metrics.
5. Fetch/test through the plugin action/runtime boundary, not directly from the
   PI browser. This avoids CORS differences and keeps bounded logging at the
   source owner.
6. Store only settings needed for runtime. Do not store sample response bodies
   in action settings.
7. Show detailed bounded errors in PI for URL, HTTP, JSON, jq, schema, and
   response-size failures.
8. Show a preview of the validated output metric.
9. Clearly state that Custom Metric settings are saved in Stream Deck action
   settings and are included in Stream Deck exports. V1 does not support
   secrets.
10. Keep polling settings widget-level through existing `WidgetPreferences`.

Acceptance:

- A user can configure a no-auth HTTP JSON endpoint and jq transform from PI.
- PI can fetch/test a sample capped at 256 KiB.
- PI can test a transform without saving raw sample JSON.
- Invalid configuration does not crash the PI or plugin.
- User-visible strings are i18n-owned.

Do not merge with Step 6:

Step 5 owns one Custom Metric action's configuration. Step 6 introduces
multi-slot composition and slot-specific ownership. Merging them would recreate
the Dense/Stacked PI complexity inside the first Custom Metric implementation.

### Step 6: Dense And Stacked Consumption

Milestone: V1.1 unless the user explicitly pulls Dense/Stacked consumption into
the first V1 implementation batch.

LOC estimate: 1,000-1,800.

Purpose:

Allow Dense Multi Metric and Stacked Metric to use Custom HTTP Metric targets
without adding a reusable source catalog.

Locations:

- `packages/hub/src/actions/dense-multi-metric.ts`
- `packages/hub/src/actions/dense-multi-metric/row-data.ts`
- `packages/hub/src/actions/stacked-metric.ts`
- `packages/hub/src/property-inspector/panels/DenseMetricRowsSettings.tsx`
- `packages/hub/src/property-inspector/panels/StackedMetricWidgetSettings.tsx`
- `packages/hub/src/property-inspector/panels/SingleMetricWidgetSettings.tsx`
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.test.ts`
- `packages/hub/src/actions/dense-multi-metric.test.ts`
- `packages/hub/src/actions/stacked-metric.test.ts`

Required work:

1. Dense row read-plan construction must register and route each Custom HTTP
   slot with its own runtime metric key.
2. Dense row failure remains slot-level. One failed Custom HTTP row must not
   blank the widget.
3. Dense PI must not add per-row theme, polling, or appearance. Only the row's
   Custom HTTP target definition belongs to that row.
4. Stacked slots already own complete single-metric settings. Custom HTTP
   targets should work through the existing child single-metric editor path.
5. Reorder/remove must unregister stale runtime definitions and register the
   active definitions after settings updates.
6. Duplicate Custom HTTP definitions in different Dense rows or Stacked slots
   remain separate runtime metric keys in V1.
7. Use the Step 2 shared identity helper. Do not invent Dense-only or
   Stacked-only runtime key formatting.

Acceptance:

- Dense can display at least two Custom HTTP rows with independent definitions.
- Dense degrades one failed Custom HTTP row without blanking the widget.
- Stacked can rotate between Custom HTTP and built-in metric slots.
- Copy/import of Dense or Stacked widgets does not copy runtime metric keys
  because runtime keys are not stored.

Do not merge with Step 5:

Dense and Stacked have separate slot ownership, read-plan, and failure-domain
rules. They must consume the Step 5 editor/runtime pieces after those pieces are
stable, not while those pieces are being invented.

### Step 7: Verification, Documentation, And Cleanup

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
7. Add Dense and Stacked integration tests if Step 6 is implemented in the same
   batch.
8. Update the POC/exam scripts and committed corpus expected output to the final
   `{ "metric": ... }` schema.
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
| Step 5 and Step 6 | Single action PI and multi-slot PI have different ownership rules. |
| Step 6 and Step 7 | Verification must assert cross-step invariants, not hide inside implementation. |

## Deferred TODOs

- Reusable Custom Metric source catalog.
- Multi-metric transform output.
- Exact request coalescing inside `CustomHttpSourceClient`.
- Sequence and parallel HTTP request pipelines.
- Per-request cache policy for static lookup data.
- Auth and OS credential references.
- Large JSON schema/sample summarization before AI prompt generation.
- Dedicated LHM remote JSON catalog source.
- Local command/CLI Custom Metric source type.
