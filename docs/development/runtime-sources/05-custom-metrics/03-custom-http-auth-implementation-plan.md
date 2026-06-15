# Custom HTTP Auth Implementation Plan

This plan is written for a new coding session with no conversation context.

Read these first:

1. [Runtime Sources Overview](../README.md)
2. [Metric-Level Source Routing](../02-source-routing/02-metric-level-source-routing.md)
3. [HTTP Custom Metric Implementation Plan](02-http-custom-metric-implementation-plan.md)
4. `.agents/skills/technical-deisn-doc/references/TECHNICAL_DESIGN.md`
5. `.agents/skills/proto/SKILL.md`
6. `.agents/skills/architecture-boundaries/SKILL.md`
7. `.agents/skills/stream-deck-sdk-v2/references/Settings  Stream Deck SDK.md`

All `npm.cmd` and `npx.cmd streamdeck ...` commands in this plan run from
`packages/hub` unless a step explicitly says otherwise.

## Objective

Add authentication support to the existing Custom HTTP metric source without
letting API keys, passwords, tokens, or cookies enter action settings, prompts,
ordinary logs, runtime metric ids, or exported Stream Deck profiles.

The product goal is narrow: authenticated HTTP GET JSON endpoints should work
with the existing Custom HTTP fetch/sample/transform flow. This plan does not
add OAuth, request bodies, cookies, multi-request pipelines, arbitrary header
lists, or source catalogs.

## Product Decisions

- The user configures auth inside the Custom HTTP source editor, not in the
  Global Settings tab.
- Stream Deck global settings are the persistence backend for credentials.
  The UI is widget-local because auth belongs to the endpoint the user is
  configuring.
- Widget settings store only a credential reference and HTTP safety consent.
  They never store token, password, API key, Basic Auth password, or query-key
  values.
- A credential is a complete auth configuration, not a reusable naked secret.
  The credential owns its auth kind and the related non-secret context:
  - Basic Auth owns `username` and `password`;
  - Bearer owns `token`;
  - API Key Header owns `header_name` and `token`;
  - API Key Query owns `query_parameter_name` and `token`.
- A credential has an internal stable `id`. User-visible nicknames may be
  duplicated, and two credentials may intentionally have identical auth
  context. Widget references must still use the internal `id` so duplicate
  display entries remain distinguishable.
- Credential dropdown entries are grouped by auth kind and display enough
  context to be debuggable:

```text
nickname: [basic] username
nickname: [bearer header]
nickname: [header] X-API-Key
nickname: [token param] api_key
```

- Saved secret values are never displayed again. Users may replace or delete a
  credential, but Sho Metrics does not show the current secret in the UI.
- Basic Auth `username`, API key header name, query parameter name, nickname,
  creation time, and update time may be displayed. Password/token values may
  not be displayed.
- Credential deletion is supported in V1. The app does not try to discover all
  widgets that use the credential because the Stream Deck SDK does not provide
  reliable enumeration of all user profile action settings. Delete confirms
  that other widgets may break, then removes the credential. Broken references
  surface as "credential missing" in runtime and PI. Orphaned credentials are
  still reachable from any Custom HTTP source editor credential dropdown, so
  users can manually delete credentials that are no longer used.
- Query API key auth is supported because many APIs require it. The token must
  be stored in the credential and appended only at request time; it must never
  be written into the URL field. Not supporting this mode would push users
  toward the worse pattern of pasting tokens directly into the URL setting.
- If URL already contains the configured query parameter name, the credential
  token replaces that query parameter at request time. PI must warn that the
  stored URL parameter will be overwritten.
- Authenticated `http://localhost`, loopback, and private LAN URLs are allowed
  without a stored consent flag.
- Authenticated public `http://` URLs are blocked unless the user explicitly
  checks a consent box. The checkbox is shown only for authenticated HTTP:
  - HTTPS: hidden;
  - HTTP localhost/private LAN: shown checked/effectively allowed;
  - HTTP public host: shown unchecked until user opts in.
- Authenticated cross-origin redirects are blocked. PI should show a "Use
  Redirected URL" action that writes the redirected URL into the URL input and
  lets the user retry. Do not add an "Allow Redirect" checkbox.
- No-auth Custom HTTP requests keep the current redirect behavior.
- Runtime polling must not call Stream Deck `getGlobalSettings()` per request.
  Credentials are read from an in-memory plugin-side credential manager backed
  by `pluginGlobalSettingsStore`, which is updated by the normal global settings
  lifecycle.

## Why Global Settings Are Acceptable For V1 Credentials

Elgato's Stream Deck SDK settings guidance says security-sensitive settings
such as API keys should use global settings, not action settings. Action
settings are plain-text action-local data and are included when Stream Deck
profiles are exported. Global settings are plugin-wide, only accessible to the
owning plugin through the SDK settings API, and are the SDK-supported storage
place for plugin-wide API credentials.

This does not make global settings a cryptographic vault. A local user who can
inspect the plugin environment or Stream Deck data may still be able to recover
stored values. Sho Metrics must therefore:

- avoid storing secrets in action settings;
- avoid sending secrets to the Property Inspector unless the user is actively
  creating or replacing a credential;
- hide saved secrets in UI;
- redact known secret values from prompts, failure previews, and logs;
- never include secrets in runtime metric keys or diagnostic host slugs.
- treat credential creation/replacement as the only PI-side path that carries
  raw secret values, and never log that payload or include it in copied debug
  text.

Do not use Elgato's Secrets API for user-entered credentials. That API is for
plugin-owned secrets and is deprecated in the current Elgato documentation. It
does not solve the user credential storage problem.

Do not fetch global settings on every runtime poll, source read, or transform
test. Prior PI startup measurements in the i18n implementation archive observed
`getSettings()` and `getGlobalSettings()` completing around 378-386ms, and the
exact number is less important than the boundary: SDK global settings reads are
transport work. Runtime auth resolution must use the plugin's in-memory
credential snapshot and refresh that snapshot through the existing global
settings lifecycle.

## Supported Auth Methods And Motivation

| Method | V1 support | Motivation | Notes |
| --- | --- | --- | --- |
| Basic Auth | Yes | Lite Hardware Monitor and other simple local tools require it. | Username is visible; password is hidden. |
| Bearer Token | Yes | Common modern API auth shape. | Sends `Authorization: Bearer <token>`. |
| API Key Header | Yes | Common API key shape without opening arbitrary header lists. | One configured header name, one hidden token value. |
| API Key Query | Yes | Common public API shape; modeling it prevents users from putting tokens directly in URLs. | Runtime appends/replaces the query value; URL setting stays token-free. |
| OAuth / refresh token | No | Full authorization flow, callback handling, refresh storage, and expiry are too large for this feature. | Future dedicated plan only. |
| Cookies | No | Cookie scope, redirects, persistence, and response `Set-Cookie` behavior are separate browser-like concerns. | Future dedicated plan only. |
| Arbitrary custom headers | No | Header lists require secret/non-secret value typing, duplicate handling, and forbidden header validation. | V1 API Key Header covers the important token-header case. |
| HMAC / signature auth | No | Requires canonical request construction, timestamp/nonce, hashing, and provider-specific signature rules. | Future provider-specific or template-based plan only. |

## Security And Runtime Rules

- All auth remains HTTP GET JSON only. Do not add POST, bodies, cookies, or
  request pipelines in this plan.
- Header names must be validated before fetch. Invalid header names produce a
  typed configuration failure, not a thrown runtime exception.
- Query parameter names must be validated before fetch. Empty or malformed
  names produce a typed configuration failure.
- Query auth applies the credential token with `URLSearchParams.set(name,
  token)`. This intentionally replaces any existing same-name query value in
  the stored URL.
- Runtime request preparation returns a typed success/failure result. Fetcher
  code must not build headers or query tokens from raw stored proto objects.
- No-auth requests may continue using the current fetch redirect behavior.
- Authenticated requests must use a redirect policy that can detect redirect
  origin:
  - same-origin redirect: allowed;
  - cross-origin redirect: blocked before sending credential to the redirected
    origin;
  - blocked redirect result includes bounded, redacted `from_origin`,
    `to_origin`, and redirected URL for PI.
- The runtime never mutates widget settings. Only PI may write the redirected
  URL after an explicit user action.
- Logs may mention auth kind, credential id, credential nickname, host slug,
  and failure reason. Logs must not include secret values, full query strings,
  `Authorization`, `Cookie`, or raw request headers.
- Prompt generation must not include secret values. When a fetched JSON sample
  echoes a known credential value, redaction must replace the secret before the
  text can enter prompt/failure-copy paths.

## Stored Contract Sketch

Use this as the intended shape, but verify final field numbers and generated
code before editing `settings.proto`.

```proto
message SingleCustomHttpRequest {
  optional string url = 1;
  optional string user_intent = 2;
  optional string jq_transform = 3;
  optional CustomHttpRequestSettings request_settings = 4;
  optional CustomHttpRequestAuth auth = 5;
}

message CustomHttpRequestAuth {
  // Opaque id owned by StoredGlobalSettings.custom_http_credentials.
  optional string credential_id = 1 [(buf.validate.field).string.max_len = 128];

  // Only applies to authenticated public http:// URLs. This is a bool because
  // the third state is already modeled by context: HTTPS does not need consent,
  // and localhost/private LAN HTTP is allowed by runtime policy for local
  // device and LHM use cases. Absence means "not consented" for public HTTP.
  optional bool allow_public_http_credentials = 2;
}

message StoredGlobalSettings {
  optional GlobalDefaults defaults = 1;
  optional GlobalOverrides overrides = 2;
  repeated MetricSourceProfile source_profiles = 3;
  optional string default_source_profile_id = 4;
  optional ColorCompensationSettings color_compensation = 5;
  repeated CustomHttpCredential custom_http_credentials = 6;
}

message CustomHttpCredential {
  // Sho Metrics generated opaque id. Users may duplicate nicknames and auth
  // context; widget references use this id to remain stable.
  optional string id = 1 [(buf.validate.field).string = {
    min_len: 1
    max_len: 128
  }];

  optional string nickname = 2 [(buf.validate.field).string = {
    min_len: 1
    max_len: 128
  }];

  google.protobuf.Timestamp created_at = 3;
  google.protobuf.Timestamp updated_at = 4;

  oneof auth {
    Basic basic = 10;
    Bearer bearer = 11;
    Header header = 12;
    Query query = 13;
  }

  message Basic {
    optional string username = 1 [(buf.validate.field).string.max_len = 1024];

    // Security-sensitive user credential. Store only in global settings, never
    // in action settings, prompt text, logs, or runtime metric ids.
    optional string password = 2 [(buf.validate.field).string.max_len = 8192];
  }

  message Bearer {
    // Security-sensitive user credential.
    optional string token = 1 [(buf.validate.field).string.max_len = 8192];
  }

  message Header {
    optional string header_name = 1 [(buf.validate.field).string.max_len = 128];

    // Security-sensitive user credential.
    optional string token = 2 [(buf.validate.field).string.max_len = 8192];
  }

  message Query {
    optional string query_parameter_name = 1 [(buf.validate.field).string.max_len = 128];

    // Security-sensitive user credential.
    optional string token = 2 [(buf.validate.field).string.max_len = 8192];
  }
}
```

Notes:

- Import `google/protobuf/timestamp.proto` if timestamps are implemented in
  proto. Do not store timestamp scalars unless there is a measured reason to
  avoid `Timestamp`.
- Do not add `secret`, `password`, or `token` fields to widget settings.
- Do not use an enum for auth method in the widget. The credential's `oneof`
  auth arm is the method.
- Keep the credential auth submessages nested in `CustomHttpCredential`. They
  are credential-local storage shapes, not reusable action/runtime request
  messages.
- V1 uses `oneof auth` because each credential is one modeled auth scheme.
  APIs that require multiple independent auth components, such as query token
  plus signed header, are outside V1 and need a separate request-auth policy
  rather than weakening the simple credential shape.
- Do not model credentials as API resources. These are local client settings,
  not management-plane API objects.

## Implementation Steps

### Step 1: Stored Contract, Codegen, And Global Credential Patches

LOC estimate: 700-1,100.

Purpose:

Define the persisted auth contract and the storage helpers that can create,
replace, and delete Custom HTTP credentials in Stream Deck global settings
without touching runtime fetch behavior or Property Inspector UI.

Primary files:

- `contracts/proto/shometrics/v1/settings.proto`
- `packages/hub/src/settings/storage/global-settings-patch.ts`
- `packages/hub/src/settings/storage/global-settings-patch.test.ts`
- `packages/hub/src/settings/storage/codec.ts`
- `packages/hub/src/settings/storage/resolver/global-settings-resolver.ts`
- `packages/hub/src/settings/resolved-settings.ts`

Required work:

1. Add `SingleCustomHttpRequest.auth`.
2. Add `StoredGlobalSettings.custom_http_credentials`.
3. Add concrete credential messages for Basic, Bearer, Header token, and Query
   token auth.
4. Generate settings proto.
5. Add storage patch operations for:
   - upsert credential;
   - replace credential secret/context;
   - delete credential by id;
   - set widget auth reference;
   - clear widget auth reference.
6. Add app-owned resolved metadata for PI use that excludes secret values:

```ts
interface ResolvedCustomHttpCredentialSummary {
    readonly id: string;
    readonly nickname: string;
    readonly authKind: "basic" | "bearer" | "header" | "query";
    readonly displayDetail: string;
    readonly createdAtMilliseconds?: number;
    readonly updatedAtMilliseconds?: number;
}
```

7. Keep secret-bearing stored data out of `ResolvedGlobalSettings` if that
   resolved object is consumed by ordinary PI rendering. If a runtime owner
   needs the secret, give it a narrow storage/helper function instead of
   exposing secrets through general resolved settings.
8. Add tests that unknown/malformed credential entries are handled at the
   storage/resolver boundary with the existing warning behavior.

Acceptance:

- `npm.cmd run generate:proto` updates generated files.
- `npm.cmd run proto:lint` passes.
- `npm.cmd run proto:build` passes.
- `npm.cmd run test:unit -- global-settings-patch resolver` passes.
- Widget settings JSON never contains password/token/API key values.
- Global credential metadata can be listed without exposing secret values.
- Duplicate nicknames and duplicate auth context are allowed, while ids remain
  unique.

Do not merge with Step 2:

Step 1 owns persisted shape and storage mutation. Step 2 owns runtime request
preparation and secret application. Merging them makes it too easy to hide
secret leakage inside "it works" runtime tests before the stored contract is
audited.

### Step 2: Runtime Auth Resolution And Request Preparation

LOC estimate: 800-1,300.

Purpose:

Convert a Custom HTTP request plus credential id into a prepared runtime fetch
request with headers/query/auth policy, or a typed configuration failure. This
step must not add Property Inspector UI.

Primary files:

- `packages/hub/src/runtime/sources/custom-http/custom-http-fetcher.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-source-client.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-definition-registry.ts`
- `packages/hub/src/actions/custom-metric/runtime-source-definition.ts`
- `packages/hub/src/actions/custom-metric/runtime-source-registration.ts`
- `packages/hub/src/settings/global-settings-store.ts`
- New file under `packages/hub/src/runtime/sources/custom-http/`, for example
  `custom-http-auth.ts`
- New runtime credential cache/reader under
  `packages/hub/src/runtime/sources/custom-http/`, backed by
  `pluginGlobalSettingsStore`

Required work:

1. Add an app-owned runtime auth model that is not generated proto:

```ts
type CustomHttpPreparedAuth =
    | { readonly authKind: "none" }
    | { readonly authKind: "basic"; readonly username: string; readonly password: string }
    | { readonly authKind: "bearer"; readonly token: string }
    | { readonly authKind: "header"; readonly headerName: string; readonly token: string }
    | { readonly authKind: "query"; readonly queryParameterName: string; readonly token: string };
```

2. Add a pure helper that reads stored global settings plus widget auth
   reference and returns either prepared auth or a typed failure:
   - credential missing;
   - credential has missing secret;
   - Basic username missing;
   - invalid header name;
   - invalid query parameter name;
   - public HTTP credential blocked by missing consent.
3. Add a request-preparation helper that:
   - starts from the stored URL;
   - applies query token with `URLSearchParams.set`;
   - builds headers for Basic, Bearer, or Header token;
   - returns a sanitized diagnostic summary without secret values;
   - reports whether a query parameter was overwritten.
4. Header validation must reject empty names, whitespace names, and names that
   the Fetch implementation rejects. Use a narrow helper and tests; do not add
   a large header registry.
5. Public HTTP detection must reuse the existing Custom HTTP URL/local-network
   policy instead of implementing a second private-IP parser.
6. Update Custom HTTP metric definition registration so runtime polling uses
   the prepared auth context for the current credential id.
7. Add or reuse a credential manager/cache that reads from the plugin's
   in-memory global settings store. It must not call Stream Deck
   `getGlobalSettings()` from runtime polling, source reads, or transform tests.
8. Runtime failures from auth resolution must render `N/A` after a metric is
   configured and `Error` before a valid metric exists, matching current Custom
   HTTP failure policy.

Acceptance:

- `npm.cmd run test:unit -- custom-http` passes.
- Runtime source tests prove Basic, Bearer, Header, and Query auth alter the
  request as expected.
- Missing credential and malformed auth produce typed failures, not thrown
  exceptions.
- Query parameter collision replaces the URL value at request time without
  mutating settings.
- No test snapshots/log strings include secret values.

Do not merge with Step 3:

Step 2 proves runtime behavior without UI. Step 3 owns user interaction and
global-settings writes. Merging them makes auth correctness depend on React
paths and leaves no small test surface for fetch security.

### Step 3: Property Inspector Credential Management In The Source Editor

LOC estimate: 1,200-1,900.

Purpose:

Add credential creation, selection, replacement, and deletion to the Custom HTTP
source editor while writing secrets only to global settings and writing widget
auth references only to widget settings.

Primary files:

- `packages/hub/src/property-inspector/panels/custom-metric/CustomMetricSourceEditor.tsx`
- `packages/hub/src/property-inspector/panels/custom-metric/CustomMetricSourceEditorPanel.tsx`
- `packages/hub/src/property-inspector/panels/custom-metric/types.ts`
- `packages/hub/src/property-inspector/settings-sync/usePropertyInspectorSettings.ts`
- `packages/hub/src/i18n/message-groups/widgets.ts`
- `packages/hub/com.ez.sho-metrics.sdPlugin/ui/property-inspector.css`
- Existing PI contract tests under
  `packages/hub/src/property-inspector/panels/CustomMetricSourceEditorContract.pi.test.tsx`
  and `CustomMetricWidgetSettings.pi.test.tsx`

Required work:

1. Add an `Authentication` section below URL/request settings in the existing
   source editor page.
2. Auth section states:
   - no auth selected;
   - credential selected and present;
   - credential selected but missing;
   - creating new credential;
   - editing/replacing selected credential;
   - delete confirmation.
3. Credential form fields:
   - required nickname;
   - auth kind selector: Basic, Bearer, API Key Header, API Key Query;
   - Basic: username plus password;
   - Bearer: token;
   - Header: header name plus token;
   - Query: query parameter name plus token.
4. Save credential only on explicit Save. Do not persist secret values on every
   keystroke. Do not log credential form state or save payloads because this is
   the only PI-side path that carries raw secret values.
5. After saving a new credential:
   - write global settings with the credential;
   - write widget settings with `auth.credential_id`;
   - clear secret input state from React state.
6. For existing credentials:
   - show nickname, auth kind, non-secret context, created time, and updated
     time;
   - show secret as hidden/not readable;
   - allow Replace Secret / Update Credential;
   - allow Delete.
7. Delete confirmation must warn that other widgets may break. If the current
   widget uses the credential, say so explicitly.
8. Do not add credential management to the Global Settings tab in this step.
9. Add public HTTP auth consent UI:
   - HTTPS: no control;
   - local/private HTTP: show checked/effectively allowed state;
   - public HTTP: show unchecked until user opts in;
   - store only the explicit public HTTP consent flag.
10. Add query parameter collision warning when selected credential is Query auth
    and the URL already has the same query parameter name.
11. Keep all visible strings in i18n message groups.

Acceptance:

- `npm.cmd run i18n:check` passes.
- `npm.cmd run test:pi -- CustomMetricWidgetSettings` passes.
- Creating a credential writes global settings and only a credential id to
  widget settings.
- Replacing a secret does not show the old secret.
- Deleting a credential removes it from global settings and leaves broken
  widget references visible as a missing credential state.
- Duplicate nicknames can be created and remain selectable.
- Public HTTP auth cannot be tested/fetched until the user explicitly consents.

Do not merge with Step 4:

Step 3 owns UI composition and settings writes. Step 4 owns plugin-side editor
commands, redirects, failure diagnostics, and redaction. Merging them makes it
too easy for UI tests to pass while the runtime/PI command boundary still leaks
or mishandles credentials.

### Step 4: Source Editor Commands, Redirects, Diagnostics, And Redaction

LOC estimate: 900-1,400.

Purpose:

Make Fetch Sample and Test Transform use credentials safely through the plugin
boundary, block authenticated cross-origin redirects, and ensure user-facing
debug text is helpful without leaking secrets.

Primary files:

- `packages/hub/src/actions/custom-metric/source-editor-request-handler.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-source-editor-messages.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-fetcher.ts`
- `packages/hub/src/runtime/sources/custom-http/custom-http-redaction.ts`
- `packages/hub/src/property-inspector/panels/custom-metric/CustomMetricSourceEditor.tsx`
- `packages/hub/src/i18n/message-groups/widgets.ts`

Required work:

1. Extend source-editor request messages to carry auth reference and public
   HTTP consent, never secret values.
2. The plugin-side handler resolves the credential from stored global settings
   before fetch. PI must not send the secret back to the plugin.
3. Fetch Sample uses the same request-preparation helper as runtime polling.
4. Test Transform still runs on the cached full response text. It must not need
   to know the secret unless it first has to fetch a sample.
5. Authenticated fetch uses redirect handling that can detect cross-origin
   redirects before forwarding credentials:
   - same-origin redirects may continue;
   - cross-origin redirects return a typed failure;
   - failure includes redirected URL and origins after redaction.
6. PI displays blocked redirect details plus:
   - `Use Redirected URL` button, which writes the redirected URL into the URL
     setting/input and lets the user retry;
   - `Copy Redirected URL` button.
7. Do not add an `Allow Redirect` button or checkbox.
8. Redaction must include:
   - known credential secret values;
   - Basic Auth password;
   - Bearer token;
   - API key header token;
   - API key query token;
   - URL query params whose names look secret-like, preserving existing
     behavior.
9. Runtime polling must not read large response bodies only to produce PI
   auth diagnostics.
10. All failure details copied to clipboard must be bounded and redacted.

Acceptance:

- PI sample fetch with each auth kind sends the expected request.
- Missing credential produces a visible, actionable error.
- Query collision warning and request-time replacement are covered by tests.
- Authenticated cross-origin redirect is blocked and PI can apply the
  redirected URL.
- No secret appears in PI failure detail, prompt text, source editor messages,
  support logs, runtime metric ids, or test snapshots.

Do not merge with Step 5:

Step 4 implements the behavior. Step 5 proves the whole boundary matrix and
updates documentation. Combining them turns verification into a side effect of
implementation and makes security regressions easier to waive.

### Step 5: Boundary Tests, Verification, And Documentation Cleanup

Status: implemented.

LOC estimate: 800-1,300.

Purpose:

Lock the auth feature against the exact matrix failures this Custom HTTP work
has already exposed: single/Dense/Stacked source editor paths, PI command
boundaries, runtime polling, global settings updates, and redaction.

Primary files:

- `packages/hub/src/property-inspector/panels/CustomMetricSourceEditorContract.pi.test.tsx`
- `packages/hub/src/property-inspector/panels/CustomMetricWidgetSettings.pi.test.tsx`
- `packages/hub/src/actions/custom-metric.test.ts`
- `packages/hub/src/actions/dense-multi-metric.test.ts`
- `packages/hub/src/actions/stacked-metric.test.ts`
- `packages/hub/src/runtime/sources/custom-http/*.test.ts`
- `packages/hub/src/settings/storage/*.test.ts`
- `docs/development/runtime-sources/05-custom-metrics/02-http-custom-metric-implementation-plan.md`
- `docs/development/runtime-sources/05-custom-metrics/03-custom-http-auth-implementation-plan.md`

Required work:

1. Extend the existing source-editor contract test matrix for `single`, `dense`,
   and `stacked`:
   - can open auth editor;
   - can create credential from widget editor;
   - Fetch Sample carries the correct credential id/consumer slug;
   - Test Transform continues using the same sample cache isolation;
   - public HTTP auth consent is respected;
   - missing credential is visible.
2. Add runtime tests for each auth kind.
3. Add redaction tests with secrets echoed in:
   - response JSON;
   - HTTP failure preview;
   - redirected URL;
   - prompt sample;
   - copied failure/debug text.
4. Add deletion tests:
   - delete credential removes it from global settings;
   - current widget using deleted credential shows missing state;
   - deletion does not try to scan inactive profiles or maintain a fake usage
     registry.
5. Add redirect tests:
   - no-auth redirect follows existing behavior;
   - auth same-origin redirect succeeds;
   - auth cross-origin redirect fails with redirected URL action data.
6. Update 02 plan deferred TODOs/status if auth is fully implemented.
7. Update support/debug docs to say secrets must never appear in ordinary logs.

Verification commands:

```text
npm.cmd run generate:proto
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run i18n:check
npm.cmd run test:unit -- custom-http
npm.cmd run test:pi -- CustomMetricWidgetSettings
npm.cmd run build
git diff --check
```

Acceptance:

- All verification commands pass.
- No action settings contain secret values.
- No generated prompt or copied debug text contains secret values.
- Authenticated Custom HTTP works in single, Dense, and Stacked consumers.
- Credential deletion is supported without a usage registry.
- Public HTTP auth requires explicit consent.
- Auth cross-origin redirects are blocked and recoverable through "Use
  Redirected URL".

Implemented shape:

- The source-editor contract matrix covers single Custom Metric, Dense row, and
  Stacked slot entry points for auth creation, Fetch Sample credential
  references, Test Transform credential references, public HTTP consent, and
  missing credential states.
- Runtime Custom HTTP tests use a real local Node HTTP server for Basic, Bearer,
  API-key header, and API-key query requests. They also verify manual redirect
  behavior in the installed Node/undici runtime.
- Redaction tests cover known credential values, Basic Auth composed/base64
  values, configured API-key query parameters, redirected URLs, response JSON
  previews, prompt samples, and copied failure/debug text.
- Credential deletion is intentionally local to global settings. The app does
  not maintain a fake usage registry or scan inactive profiles; widgets that
  still reference a deleted credential show the missing credential state.
- Ordinary logs and copied diagnostics must never contain credential secret
  values. Debugging should use credential ids, auth kind, bounded host/origin
  summaries, and typed failure stages instead of raw request headers, full URLs,
  or global settings dumps.

Do not merge with any earlier step:

This step proves the boundary invariants after implementation. If it is merged
into feature work, auth security and matrix coverage become incidental instead
of reviewable.

## Step Boundary Summary

If asked whether adjacent steps can be merged, answer no. The steps are split
by ownership boundary, not by convenience. Merging them recreates the exact
failure mode this feature must avoid: secrets moving through settings, PI,
runtime fetch, and diagnostics before any one boundary is independently proven.

| Steps | Why they must stay separate |
| --- | --- |
| Step 1 and Step 2 | Stored credential shape must be auditable before runtime code can apply secrets. |
| Step 2 and Step 3 | Runtime auth correctness must be testable without React/PI state. |
| Step 3 and Step 4 | UI settings writes and plugin-side authenticated commands have different failure and leakage surfaces. |
| Step 4 and Step 5 | Implementation and boundary verification must be reviewable independently. |

## Deferred TODOs

- OAuth and refresh tokens.
- Cookie storage and cookie jar behavior.
- Arbitrary custom header lists.
- HMAC/signature auth.
- Request bodies and POST/PUT/PATCH.
- Multi-request auth flows.
- OS credential store integration if Stream Deck global settings become
  insufficient.
- Dedicated global credential management page if users need credential cleanup
  outside widget editing.
