---
name: logging
description: Use when reading or writing any ShoMetrics log.
---

# Logging

Use project logging facilities and keep logs owned, bounded, and cheap.

## Wrappers

- In Stream Deck plugin code, use the project logging wrapper. Do not use
  `console` or call `streamDeck.logger` directly outside the wrapper.
- In C# app code, prefer `ILogger`. Configure Serilog only at host/bootstrap
  boundaries.

```ts
import { logger } from "../logging/logger";

const log = logger.for("Action:MyFeature");

log.atDebug()
    .everyMs("high-frequency-sample", 5000)
    .log(() => `sample=${JSON.stringify(expensiveObject)}`);
```

```cs
private readonly ILogger<MyWorker> _logger;

_logger
    .AtWarning()
    .Every(TimeSpan.FromSeconds(30))
    .Log("Hardware refresh is slow. durationMs={DurationMs}", durationMs);
```

## Boundary Ownership

- Critical paths must not silently fail, drop, or pass through unexpected
  failures.
- Log at the owner boundary when failures can affect rendering, loading,
  saving, polling, settings recovery, IPC, helper startup, or user-visible
  behavior.
- If a lower layer returns a typed failure, let the eventual owner log it
  instead of logging at every hop.

## Hot Paths

- Keep hot-path logs cheap. Use lazy formatting, `IsEnabled(...)`,
  `.everyMs()`, or C# `ILogger` throttle extensions for polling loops, hardware
  refresh, repeated IPC failures, and repeated malformed wire data.
- Throttle keys must be stable and low-cardinality.
- Do not log every successful poll/render, normal cancellation, deadline, or
  expected fallback.
- If expected control-flow diagnostics are useful, make them `debug` and
  throttled.
- Normal cancellation/deadline logs should not include exception stack traces.

## Content

- Prefer summaries over dumps.
- Logs should identify owner, operation, key IDs, and outcome.
- For hardware/source diagnostics, prefer bounded summaries.
- Dev/debug may include detailed hardware/sensor names.
- Production should avoid raw hardware/sensor identity unless needed for
  diagnosis.
- Never log secrets, raw credentials, full request headers, or prompt/copy
  payloads that may contain credentials.

## Searching Logs

- For user-reported failures, search selectively. Do not read the whole log
  file at once.
- Hub plugin log candidates:
  - `packages/hub/com.ez.sho-metrics.sdPlugin/logs/com.ez.sho-metrics.0.log`
  - `%appdata%\Elgato\StreamDeck\logs\com.ez.sho-metrics0.log`
