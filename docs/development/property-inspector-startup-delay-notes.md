# Property Inspector Startup Delay Notes

## Summary

Property Inspector controls appear late because the current React startup path waits for Stream Deck settings before it sets the resolved action kind and renders scenario sections.

The delay is not caused by React rendering work or sdpi UI component painting. Chrome Performance showed the main thread mostly idle during the gap.

## Observed Evidence

Temporary startup diagnostics showed this repeated timing pattern when opening the PI panel:

```txt
~15ms   getConnectionInfo resolved
~15ms   getSettings start
~15ms   transport send start event=getSettings
~310ms  transport send resolved event=getSettings
~312ms  didReceiveSettings
~312ms  getSettings resolved
~314ms  getGlobalSettings resolved
```

`getGlobalSettings` is fast once transport is ready. The expensive part is `client.send("getSettings")`, which waits on the sdpi client WebSocket connection promise.

## Current Cause

`App.loadSettings()` currently does this:

```txt
await getConnectionInfo()
await getSettings()
await getGlobalSettings()
setState({ actionKind, storedSettings, globalSettings })
```

Initial `actionKind` is `unknown`. Current scenario/scope filtering renders no normal fields for `unknown`, so the reset button appears immediately while real settings sections wait for the WebSocket-backed `getSettings` call.

## Why This Started Showing Up

The refactor from flat field visibility to scenario/scope-based field selection changed the initial `unknown` state behavior:

- old flat schema: some base fields rendered even before action settings loaded;
- new scenario model: `unknownScope` filters out normal fields.

That made the WebSocket wait visible as an empty settings area.

## Next Debug Step If Needed

If sdpi transport itself needs investigation, instrument the vendored/client wrapper around:

```txt
connect called
new WebSocket(...)
webSocket onopen
registerPropertyInspector sent
_connection.setResult
```

This will confirm whether the ~300ms is WebSocket open time, registration timing, or Stream Deck host scheduling.

## Implemented Fix Direction

1. Set `actionKind` and `isWindows` immediately after `getConnectionInfo()` resolves.
2. Prefer `connectionInfo.actionInfo.payload.settings` as first paint widget settings when available.
3. Render editable controls immediately. Show the lightweight loading notice only when no initial widget settings were available from `actionInfo`.
4. Refresh widget settings and global settings independently after connection
   info. Do not wait for both requests before applying whichever one returns.

5. Use `getSettings()` as an always-run refresh so stale actionInfo/cache values do not become authoritative.
6. If settings cannot be loaded because the refresh request fails, keep the UI editable and show a one-time top notice:

   ```txt
   We couldn't load this widget's saved settings, so defaults are shown.
   ```

7. Keep this fix inside the PI startup boundary. Do not change the stored settings model, resolver cascade, or renderer contracts for this issue.

## Follow-up Observation: Initial Payload Freshness

Temporary diagnostics compared three PI settings sources while switching widgets,
switching profiles, reopening the PI, changing settings repeatedly, rebuilding,
and restarting Stream Deck:

```txt
pi-connection-info-settings
pi-did-receive-settings
pi-get-settings
```

Observed result:

- all three sources had the same settings signature for each PI open;
- after editing a widget setting, reopening the PI showed the edited signature
  immediately from `connectionInfo.actionInfo.payload.settings`;
- opening another widget of the same action type but with different settings
  produced a different signature;
- switching profiles did not cause same-action-type widgets to share settings;
- after restarting Stream Deck, the initial PI payload still matched the stored
  widget settings.

This means the PI startup path can safely use
`connectionInfo.actionInfo.payload.settings` for first paint in the tested
scenarios. It is not merely the last plugin `willAppear` payload, and it did not
show stale A -> B jumps where initial payload was old but `getSettings()` later
returned new values.

Important caveat:

- PI `connectionInfo.actionInfo.action` / `uuid` identifies the manifest action
  type, for example `com.ez.sho-metrics.cpu`.
- It is not the action instance id used by plugin runtime events.
- Therefore PI should not use that value as a cache key for a plugin-side widget
  settings store.

Current conclusion:

- Keep PI first paint based on `connectionInfo.actionInfo.payload.settings`.
- Keep `getSettings()` as a refresh/guard, not as a first-paint blocker.
- Do not build a PI -> plugin settings cache bridge unless a real action
  instance id is available in the PI context.

## Follow-up Observation: Global Readiness Scope

After the proto settings refactor, temporary diagnostics measured this repeated
pattern while opening CPU, GPU, and Disk widgets:

```txt
0ms      settings session started
0ms      hasInitialWidgetSettings=true
302-320ms global settings refresh ready
326-357ms widget settings refresh ready
340-355ms runtime cache patch received
```

The important detail is that widget first-paint data is available immediately,
but global settings still arrive around 300ms later. Blocking the whole Widget
tab on `globalSettingsStatus === "ready"` makes every user pay that delay even
though most settings are action-local and many users never enable global
appearance override.

UI decision:

- Action-local widget controls render from initial widget settings immediately.
- `getSettings()` remains an always-run refresh and is not a first-paint gate.
- `getGlobalSettings()` remains the source of truth for plugin/global settings.
- Global readiness must only affect UI owned by global settings, such as global
  appearance override notices and appearance-control disabling.
- It is acceptable for appearance controls to render enabled, then become
  disabled when global settings arrive and override is enabled. This local
  state change is less harmful than delaying the entire Widget tab.
- Do not introduce a PI global-settings mirror, localStorage cache, or plugin
  runtime seed bridge unless measured evidence shows the localized global
  readiness delay is still unacceptable.

## I18n Step 1 React Visibility Baseline

Updated on June 6, 2026, before adding the Hub i18n runtime.

Temporary PI console diagnostics were added locally, the PI panel was opened for
GPU and Memory actions, and the diagnostics were removed after recording these
numbers.

Observed GPU action open:

```txt
0.1ms    script evaluated
1.1ms    React render requested
57.3ms   connectElgatoStreamDeckSocket called
57.5ms   connection info resolved, initial widget settings present
61.9ms   first React commit, actionKind still unknown
64.2ms   connectionLoaded dispatched, actionKind=gpu
368.9ms  PI WebSocket open
371.1ms  first runtime cache patch
377.5ms  global settings ready
378.7ms  widget settings refresh ready
```

Observed Memory action open:

```txt
0.1ms    script evaluated
1.2ms    React render requested
60.6ms   connectElgatoStreamDeckSocket called
60.8ms   connection info resolved, initial widget settings present
77.5ms   first React commit, actionKind still unknown
79.3ms   connectionLoaded dispatched, actionKind=memory
379.5ms  PI WebSocket open
385.5ms  global settings ready
386.0ms  widget settings refresh ready
442.4ms  first runtime cache patch
```

Interpretation:

- React first commit happened around 62-78ms from script evaluation.
- The current App first commits before `connectionLoaded`, so the first commit
  still has `actionKind=unknown`. Action-specific controls become available
  immediately after connection info, around 64-79ms in these runs.
- The slow path is the PI WebSocket opening around 369-380ms, not React render.
- `getSettings()` and `getGlobalSettings()` are gated by that WebSocket and
  completed around 378-386ms in these runs.
- Locale selection for i18n must use connection info and must not wait for
  `getSettings()` or `getGlobalSettings()`.

The historical observations above remain useful context because they show the
same shape: initial widget data can be available immediately while settings
refresh and runtime-cache updates arrive later.

The Step 1 message inventory lives in
`docs/development/archive/i18n-hub-implementation-plan.md`.

## I18n Step 5 Post-Migration Validation

Updated on June 6, 2026, after migrating Property Inspector copy to the Hub
i18n runtime.

Automated validation completed:

```txt
npm.cmd run i18n:check
npm.cmd run build
npm.cmd run test:unit
npm.cmd run test:pi
npx.cmd streamdeck validate com.ez.sho-metrics.sdPlugin
```

Observed results:

- `i18n:check` passed.
- `build` passed. Rollup reported only existing third-party Buf/CEL circular
  dependency and `this` rewrite warnings.
- `test:unit` passed: 901 tests.
- `test:pi` passed: 16 tests.
- Stream Deck CLI validation passed.
- Generated locale files are present in the plugin directory:
  - `packages/hub/com.ez.sho-metrics.sdPlugin/en.json`
  - `packages/hub/com.ez.sho-metrics.sdPlugin/zh_CN.json`
  - `packages/hub/com.ez.sho-metrics.sdPlugin/ja.json`

No-flicker coverage:

- The PI suite includes a deterministic test that renders the Property
  Inspector root with Stream Deck language metadata and verifies the first
  visible tab is already localized.
- The i18n bootstrap still chooses locale from connection info before rendering
  `App`; it does not wait for `getSettings()` or `getGlobalSettings()`.

Manual runtime observation still required:

- A real Stream Deck PI open must be repeated for `en`, `zh_CN`, `ja`, and
  `zh_TW` to confirm the visible no-flicker behavior in the host webview.
- The Step 1 timing numbers should be compared against a post-i18n PI open from
  the same machine and Stream Deck version.
- Do not add a permanent timing harness for this. Use temporary local
  diagnostics only if the visible PI open suggests a regression.

## Follow-up Observation: Runtime Option Lists

Runtime option lists, such as disk volumes and network interfaces, are
runtime-only facts. They must not be written into stored settings.

Disk volume options have one known low-priority cold-start edge case:

```txt
plugin cold starts
disk action state has the default empty runtime cache
Property Inspector opens before the first real disk volume snapshot
the UI can briefly show "No detected volumes"
the background runtime refresh then replaces it with the real list
```

Disk widget hot-plug visibility also has a polling-limit trade-off: the disk
polling interval is the worst-case widget-side disk hot-plug detection latency.

The old agent backlog that used to track the runtime device-list handoff has
been retired.

## Missing Settings

Missing settings are normal for a newly dragged widget. The UI should show defaults and no error.

During pre-proto cleanup, the codec intentionally does not validate raw settings. It only classifies `null`, non-object, arrays, and empty objects as missing; any non-empty object is treated as present. A future proto/Zod codec should own the authoritative invalid/corrupt decision.

## Risk To Watch

Do not write default/resolved values back into stored settings while rendering early. The early render should use resolver defaults in memory only.

If future testing shows a stale initial payload, compare the signatures of
`pi-connection-info-settings`, `pi-did-receive-settings`, and
`pi-get-settings` before changing startup behavior. The fallback trade-off is
between:

- rendering immediately and accepting a possible rare A -> B refresh; or
- waiting for `getSettings()` and reintroducing the startup delay.
