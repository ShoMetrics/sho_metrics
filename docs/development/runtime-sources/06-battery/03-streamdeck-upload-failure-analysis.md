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
out of the Stream Deck host's first image-upload burst after plugin reload.
Manual reload testing showed that `0ms` could still reproduce host upload
failures, while dozens of reloads at `500ms` did not reproduce the failure in
the same test loop. Higher values were avoided because they make the first
vendor-HID readings and Battery selector refresh feel unnecessarily late. The
remaining risk is handled by the bounded image resend fallback rather than by
making startup HID discovery visibly slower.

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

Because Route A reduces the startup HID conflict, Route B uses fewer resend
attempts than the earlier design:

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
