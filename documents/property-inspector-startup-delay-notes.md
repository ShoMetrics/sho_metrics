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

This is a P4 issue. It is reproducible only around plugin cold start before the
first runtime snapshot, and it self-corrects after the background refresh.
Stream Deck normally starts with the system, and cold start also means the
hardware UI itself is still warming up.

Current decision:

- Do not add a separate "published runtime cache keys" mechanism only for this
  cold-start flash.
- Keep runtime option lists in runtime cache and refresh them asynchronously
  when Property Inspector opens.
- Keep explicit stale selection handling: if a saved hot-plugged disk is no
  longer present, the widget and PI show that saved disk as unavailable instead
  of silently falling back to another disk.

Runtime option list invariant:

```txt
runtime option list = readiness status + cached snapshot + stale selected value preservation
pending must not render as empty
runtime facts must not be persisted as settings
```

Disk widget hot-plug visibility has a separate polling-limit trade-off:

```txt
disk polling interval = worst-case widget-side disk hot-plug detection latency
```

The widget learns that a selected disk disappeared from the next successful
disk metrics poll, because that poll refreshes the disk volume registry. If the
user sets disk polling to 60 seconds, the widget may show the previous state for
up to 60 seconds before switching to the unavailable/N/A state.

Current decision:

- Accept this as the polling-only MVP behavior.
- Do not add a disk-only timer, watcher, or one-off device refresh loop.
- If hot-plug immediacy becomes important across disks, network interfaces,
  GPU devices, audio devices, or other runtime hardware lists, design one shared
  runtime device registry/watch layer instead of solving it per widget.

## Handoff: Runtime Device Lists

Current behavior:

- Device lists are runtime facts owned by actions/runtime, not settings.
- Property Inspector consumes cached runtime snapshots plus readiness status.
- Disk preserves a saved selection that is absent from the current snapshot and
  shows it as unavailable.
- Disk widget hot-plug detection follows the disk polling interval. A 60-second
  polling interval can mean up to 60 seconds before the widget reflects a plug
  or unplug event.
- Property Inspector open triggers an asynchronous refresh, but it does not
  create a separate device watcher or persistent device-list store.

Optimizable behavior:

- A runtime device-list owner can poll only while it has subscribers.
- A new subscriber can receive the latest cached snapshot immediately, then get
  later updates as they arrive.
- The same lifecycle owner can serve disk volumes, network interfaces, GPU
  devices, audio devices, and future source availability.
- Hot-plug detection can become independent from metric polling frequency.

Simple path when this becomes worth doing:

1. Keep the current invariant: readiness status plus cached snapshot plus stale
   selected value preservation.
2. Add one shared runtime device-list owner only after at least two device-list
   domains need it.
3. Give the owner explicit subscribe/unsubscribe lifecycle; start polling on the
   first subscriber and stop after the last subscriber.
4. Push the cached snapshot immediately on subscribe, then refresh in the
   background.
5. Keep discovered devices out of settings. Settings store selected IDs only.
6. Do not add disk-only timers, watchers, or alternate cache fields as a
   shortcut.

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
