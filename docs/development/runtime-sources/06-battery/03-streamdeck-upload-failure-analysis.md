# Stream Deck Image Upload Failure Analysis

## Conclusion

ShoMetrics is seeing two related but different problems:

1. Stream Deck host image uploads can fail during plugin reload/startup.
2. When the failed upload leaves a key stuck on an old image, sending the exact
   same image again may not always repair the physical key.

The current evidence points to startup HID activity as the main trigger. The
right fix is not to choose between HID startup reduction and image resend
fallback. They solve different layers:

- Route A reduces the source of the conflict by avoiding expensive startup HID
  enumeration before the first Stream Deck image burst settles.
- Route B is a bounded display self-healing fallback for the cases that still
  slip through.

Route A should be the primary fix. Route B should remain small, isolated in the
image delivery boundary, and should not make the runner understand battery or
HID details.

## What Failed

The Stream Deck host log reports failures like this:

```text
DeviceComm err [*]: Upload Image Ignore error: FAILED
```

The plugin can still render the correct image and call `setImage()` without an
SDK-visible error. The physical key can remain on the plugin logo, stale `N/A`,
or another old image even though the software side already has the fresh metric.

This became visible with battery widgets because battery polling can be slow.
With one-second widgets, the next tick naturally sends another image soon
enough that a dropped upload is hard to notice.

## Observed Timing

The failures are strongly startup-shaped.

Before the HID enumeration cache POC, host log sessions showed repeated upload
failures shortly after plugin reload:

- Reload count sampled: `84`
- Failure count sampled: `30`
- Sessions with failures: `12`
- Recent failures happened about `619ms` to `703ms` after reload.

After reducing startup HID enumeration, another sample showed:

- Reload count sampled: `155`
- Failure count sampled: `32`
- Sessions with failures: `13`
- Recent 30 reload sessions: `0` failures.

This does not prove the final fix by itself, but it strongly supports the
startup HID contention model.

## HID Evidence

The vendor-HID battery source originally did live `HID.devices()` during full
discovery. `node-hid` documents device enumeration and opening as expensive HID
operations; local logs also show enumeration cost at startup.

Measured full discovery before the cache POC:

```text
devicesCalls=1
devicesMs≈76
hidOpenCalls=6
totalMs≈110
```

The first mitigation is a startup discovery delay:

```text
delayMs=500
```

This is not a retry delay. It intentionally shifts broad vendor-HID discovery
out of the Stream Deck host's first image-upload burst after plugin reload. It
is a UX tradeoff, not a proof that one specific delay value is uniquely safe.
Higher values make first vendor-HID readings and Battery selector refresh feel
late, while lower values overlap more with startup image upload.

The delay experiments were run against the packaged plugin by repeatedly
restarting the plugin and counting host-side `Upload Image Ignore error: FAILED`
entries. The first `10s` restart-spacing run was useful to prove the failure was
easy to trigger, but it was too aggressive and likely carried state from one
reload into the next:

| Delay | Restart spacing | Restarts | Upload failures |
| --- | ---: | ---: | ---: |
| `0ms` | `10s` | `50` | `19` |
| `100ms` | `10s` | `50` | `7` |
| `200ms` | `10s` | `50` | `0` |
| `300ms` | `10s` | `50` | `12` |
| `400ms` | `10s` | `50` | `11` |
| `500ms` | `10s` | `50` | `29` |

The follow-up `30s` restart-spacing runs were more representative, but still
do not identify a safe delay value:

| Delay | Restart spacing | Restarts | Upload failures | Sessions with failures | Failure p95 after reload | Failure p99 after reload | Failures within 10s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `0ms` | `30s` | `50` | `12` | `4` | `4.913s` | `4.913s` | `12/12` |
| `100ms` | `30s` | `50` | `10` | `2` | `4.835s` | `4.835s` | `10/10` |
| `300ms` | `30s` | `50` | `0` | `0` | n/a | n/a | `0/0` |
| `500ms` | `30s` | `50` | `12` | `2` | `5.394s` | `5.394s` | `12/12` |
| `600ms` | `30s` | `50` | `7` | `1` | `5.588s` | `5.588s` | `7/7` |
| `700ms` | `30s` | `50` | `5` | `1` | `4.840s` | `4.840s` | `5/5` |
| `800ms` | `30s` | `50` | `5` | `1` | `4.876s` | `4.876s` | `5/5` |
| `900ms` | `30s` | `50` | `6` | `1` | `5.682s` | `5.682s` | `6/6` |
| `1000ms` | `30s` | `50` | `0` | `0` | n/a | n/a | `0/0` |
| `1500ms` | `30s` | `50` | `12` | `2` | `7.385s` | `7.385s` | `12/12` |

The non-monotonic results are important. `300ms` and `1000ms` happened to be
clean in these samples, while `1500ms` was one of the highest-failure groups.
That means the delay matrix mostly proves what it does not prove: delay alone
is not the root fix. The useful signal is that representative failures still
cluster in the first few seconds after reload. The number and shape of image
uploads also matter.

This experiment has an important limitation: it measures host log failure
counts under scripted plugin restarts, not the user-visible "key stuck on the
plugin logo" outcome. Manual testing previously saw `0ms` reproduce stuck-logo
behavior while `500ms` subjectively stopped reproducing it, even before resend
was enabled. The scripted matrix does not line up cleanly with that observation.
Likely differences include restart cadence, Stream Deck host state carried
between restarts, the exact key layout, whether the physical key missed the
failed upload, and whether a later image repaired it before it was noticed.
Therefore this table should be treated as failure-window evidence, not as a
complete UX reproduction test.

The cache POC writes one real `HID.devices()` result to:

```text
com.ez.sho-metrics.sdPlugin/vendor-hid-devices-cache.json
```

Then runtime discovery reads that JSON instead of calling `HID.devices()`.
It still uses real `new HID(path)` and real feature-report queries, so only HID
enumeration is bypassed.

Measured full discovery with the cache POC:

```text
vendorHidDeviceInfoCache state=loaded devices=68
devicesCalls=0
devicesMs=0
hidOpenCalls=6
totalMs≈40
```

That timing change is large enough to explain why the upload failure rate fell.

## Main-Thread HID I/O Constraint

`node-hid` read/write calls used by the vendor HID readers are synchronous. Even
though ShoMetrics now serializes vendor HID work with an async mutex, the active
HID transaction still runs on the Hub plugin's main JavaScript thread. A sleepy
device, missing response, or broad discovery pass can therefore block the event
loop until the HID timeout expires.

The mutex solves a different problem: it prevents overlapping HID transactions
from stealing each other's HID++ responses. It does not move native HID I/O off
the main thread and does not prevent event-loop stalls.

This is a real risk, but it is not being fixed with worker threads before this
release. The current release mitigation is deliberately conservative:

- vendor HID support is Windows-only and experimental opt-in;
- selected-device reads avoid broad discovery when a stored route is available;
- full discovery is deferred out of the Stream Deck first-image upload window;
- HID operations log `eventLoopBlockedMs` and `eventLoopLagMaxMs` so the stall
  can be measured instead of guessed.

If vendor HID USB battery support becomes default, or if the event-loop lag logs
show multi-second selected reads in normal use, the next architecture step
should be moving native HID I/O behind a worker thread with a narrow command
surface such as selected-route read and full descriptor discovery.

## Image Delivery Evidence

Image resend alone is not the root fix.

We tested more aggressive resend behavior, including repeated sends and SVG
perturbation experiments. A key could still remain stuck until either:

- the physical key was pressed, or
- a resend changed the rasterized image enough to bypass host-side image
  deduplication.

This suggests the Stream Deck host may keep per-key image state and treat an
unchanged image as already delivered even when the physical device missed the
earlier upload. That is a leading hypothesis, not a proven internal host
implementation detail.

The useful product conclusion is narrower: when a resend is needed to repair a
stuck physical key, resending byte-identical image data may be insufficient.

A later bandwidth experiment isolated image delivery from the startup delay. At
`500ms` startup delay with normal image delivery, the `30s` restart-spacing run
produced `12` upload failures in `50` reloads. With a temporary diagnostic build
that forced both primary and resend delivery to use a single image payload for
software and hardware, the same `500ms` / `30s` / `50 reloads` test produced
`1` upload failure.

That does not mean the temporary diagnostic build is the production design. It
does mean target splitting and extra image payloads are part of the failure
surface, not just HID discovery timing.

## Rejected Primary Fix: Error-Driven Retry

An error-driven retry would be better than a blind resend. We looked for that
path first.

The installed Stream Deck SDK type definitions indicate `setImage()` resolves
when the command has been sent to Stream Deck, not when the physical hardware
accepts the image. The public event surface does not expose an image-upload
acknowledgement or image-upload failure callback.

The host log can contain `Upload Image Ignore error: FAILED`, but that failure
is not delivered to plugin code as an actionable event.

Therefore the plugin cannot implement a normal retry-on-error loop for this
failure.

## Rejected Primary Fix: Native SVG Output

The Stream Deck SDK supports SVG as an image format, but ShoMetrics should not
switch production output to native SVG.

The project rendering contract records that Stream Deck's native SVG rendering
is unreliable for this plugin's widget output, especially gradients, filters,
fonts, percentage attributes, and text colors. ShoMetrics deliberately sends
`resvg`-rasterized PNGs for consistency.

SVG remains useful only as a diagnostic probe. It is not the production fix.

## Route A: Startup HID Discovery Cache

Route A is the preferred primary fix.

The intended production shape:

1. On startup, use a cached HID device list from the previous successful
   discovery.
2. Use that cached list only to avoid startup enumeration. Real device open and
   battery reads still validate the selected routes.
3. After startup, run real discovery to refresh and validate the cache.
4. If validation disagrees with the cache, update runtime descriptors and mark
   unavailable devices as unavailable.

This makes first paint cheaper and avoids doing broad HID enumeration in the
same window where the Stream Deck host is uploading the first images.

The current JSON POC is intentionally temporary. It proves whether avoiding
startup enumeration changes upload failure rate. It is not the final cache
format or final lifecycle design.

## Route B: Bounded Image Delivery Fallback

Route B should still exist, but as a smaller fallback than the earlier resend
policy.

The route B owner is the image delivery boundary:

- The image delivery boundary decides whether an update is first render,
  settings-driven, or a fresh long-poll update.
- The runner only executes already-decided delivery instructions.
- The runner must not know battery, HID, source status, or device identity.

The fallback should be bounded and should not grow into a general retry
framework.

Because Route A reduces the startup HID conflict and image bandwidth is now
known to matter, Route B uses fewer resend attempts than the earlier design:

```text
first render:              3s, 5s
fresh long poll >= 10min:  1s, 10s, 60s
```

Each delayed resend gets stable physical-slot jitter based on the Stream Deck
device id, controller kind, key row, and key column. The jitter is deterministic
so logs can be attributed to the same physical key across reloads without
making two different Stream Deck devices share the same slot jitter.

If a resend must break host-side deduplication, the image mutation is
resend-only and isolated near final image dispatch, not mixed into metric
rendering or `composeMetricViewFrame()`. The current mutation wraps only
hardware resend SVGs in a subtle opacity group cycling between `0.99`, `0.98`,
and `0.97`. Primary images stay visually exact.

Primary key images already avoid target splitting when color compensation has no
visible effect: the software and hardware PNGs are the same object, so delivery
uses one un-targeted `setImage()` call. The hot-path check uses the already
resolved committed or preview color-compensation profile; it does not query
settings history or ask whether color compensation was ever enabled. Targeted
software/hardware uploads are only required when that active profile actually
changes the hardware image. This keeps the color-compensation boundary from
adding work to normal PNG delivery.

## Product Trade-Off

Route A can create one product artifact: the UI may briefly show a device from
cache and then switch to unavailable after validation.

That is acceptable compared with a physical key stuck on the plugin logo and
not self-healing. A stale-but-validated-soon runtime descriptor is also easier
to explain than hidden startup contention with the Stream Deck host.

Route B remains a visible-output safety net for the rare cases Route A does not
prevent.

## Current Working Hypothesis

The most likely chain is:

```text
Plugin reload
  -> many first key images upload
  -> vendor-HID battery source does startup HID enumeration/open/query
  -> Stream Deck host image upload and node-hid activity overlap
  -> one or more host image uploads fail
  -> some physical keys stay stale until a later non-deduped update repairs them
```

The cache POC weakens the HID enumeration part of this chain and has so far
reduced observed failures substantially.

## Next Implementation Direction

Keep the POC out of final production shape. Convert it into a source-owned
startup cache:

- Cache only HID device enumeration results, not battery readings.
- Store cache as runtime/support data, not action settings.
- Use cache only as a startup acceleration path.
- Refresh the cache with real discovery after startup.
- Keep identity verification before trusting selected battery readings.
- Keep JSON/cache parse failures fail-open to real discovery.
- Log whether a discovery pass used cache, refreshed cache, or fell back to
  real enumeration.

Separately, simplify image resend fallback:

- Reduce resend counts because Route A lowers failure probability.
- Keep resend policy pure and unit-tested.
- Keep resend timers cancellable per action.
- Keep any dedup-breaking image mutation resend-only and isolated at final
  delivery.
- Keep the runner as the primary-render owner; resend scheduling, jitter, and
  dedup-breaking image mutation belong under `view-updates/image-delivery/`.

## Validation Criteria

Route A is useful only if these are true:

- Startup discovery logs show `devicesCalls=0` when cache is used.
- Background validation later shows real enumeration ran and refreshed cache.
- Repeated reloads show a lower `Upload Image Ignore error: FAILED` rate than
  the pre-cache baseline.
- Battery readings still come from real HID transactions, not cached battery
  values.

Route B is useful only if these are true:

- It repairs occasional dropped image uploads without adding broad runner
  semantics.
- It does not rerender or rerasterize unless a dedup-breaking image mutation is
  intentionally enabled.
- It cannot leak timers after action disappearance or runner cleanup.
