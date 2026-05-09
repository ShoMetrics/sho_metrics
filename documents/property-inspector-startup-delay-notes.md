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

## Missing Settings

Missing settings are normal for a newly dragged widget. The UI should show defaults and no error.

During pre-proto cleanup, the codec intentionally does not validate raw settings. It only classifies `null`, non-object, arrays, and empty objects as missing; any non-empty object is treated as present. A future proto/Zod codec should own the authoritative invalid/corrupt decision.

## Risk To Watch

Do not write default/resolved values back into stored settings while rendering early. The early render should use resolver defaults in memory only.
