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
4. Fetch widget settings and global settings in parallel after connection info:

   ```ts
   const [payload, globalPayload] = await Promise.all([
       client.getSettings(),
       client.getGlobalSettings(),
   ]);
   ```

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
  type, for example `com.ez.sho-metrics.cpu-usage`.
- It is not the action instance id used by plugin runtime events.
- Therefore PI should not use that value as a cache key for a plugin-side widget
  settings store.

Current conclusion:

- Keep PI first paint based on `connectionInfo.actionInfo.payload.settings`.
- Keep `getSettings()` as a refresh/guard, not as a first-paint blocker.
- Do not build a PI -> plugin settings cache bridge unless a real action
  instance id is available in the PI context.

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
