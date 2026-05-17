# Rendering Performance Optimization Notes

This document records the investigation and implementation work behind the
ShoMetrics rendering performance optimization round in May 2026.

Naming note: this note has been updated to the current metric view vocabulary.
Older investigation wording has been translated to Product View, metric view
update queue, and `src/view-rendering`.

## Summary

The original user-visible symptom was that Property Inspector settings changes,
especially switching Product View between circle, line, and bar, did not update
the Stream Deck widget immediately. The delay was usually 1-2 seconds even when
the polling frequency was set to 10 seconds.

The investigation found two separate bottlenecks:

- Metric view updates were globally serialized, so settings-driven renders could wait
  behind ordinary metric tick renders.
- `@resvg/resvg-js` was loading system fonts for every SVG render. On Windows this
  cost roughly 120-160 ms per render; on macOS it could cost roughly 3 seconds per
  render.

The final runtime path now:

- Prioritizes settings-change renders ahead of ordinary metric ticks without increasing
  global render concurrency.
- Disables full system font scanning in resvg.
- Uses bundled Inter as the Windows primary runtime font.
- Keeps macOS primary runtime font on SF system fonts.
- Adds CJK and symbol fallback fonts only when visible SVG text requires them.
- Adds low-cost text fit guards so switching fonts, or later allowing custom fonts,
  does not cause text overflow or clipping regressions.

## User-Visible Symptoms

### Settings change delay

When the user changed Product View in the Property Inspector, the settings UI
showed the selected option immediately, but the hardware widget updated after a
short delay. The delay was not tied to polling frequency.

### Many widgets risk

With roughly 48 buttons on screen, a naive 100 ms render path would imply several
seconds of work if every button rerendered in a burst. This made it necessary to avoid
fixes that simply increase global concurrency or push more work into every render.

### Font/layout regression

After switching the Windows primary font to Inter, one net speed progress-bar
widget showed the final `d` in `Net Speed` clipped. The underlying issue was
not the specific label; it was that text helpers clipped fixed-width text but
did not shrink text near layout boundaries.

## Diagnostics

### Queue delay logging

Diagnostic logs were added around:

- Settings changes entering the metric view update path.
- Metric view update queue enqueue/dequeue timing.
- SVG composition, rasterization, base64 encoding, and `setImage`.

The logs showed settings-change renders could sit behind already queued metric tick
renders. This explained the 1-2 second lag while also proving it was not controlled by
polling frequency.

### Rasterizer breakdown logging

The rasterizer now reports aggregate performance windows including:

- `avgConstructMs`
- `maxConstructMs`
- `avgRenderMs`
- `avgAsPngMs`
- `avgTotalMs`
- `maxFontFiles`
- `maxSvgBytes`
- `maxPngBytes`

Before font optimization, `new Resvg(...)` dominated the cost. Rendering and PNG
encoding were comparatively small.

### Minimal resvg benchmark

A standalone benchmark was added:

```powershell
node packages\hub\scripts\bench-resvg-minimal.mjs 30
node packages\hub\scripts\bench-resvg-minimal.mjs 1 --write-samples --list-fonts
```

The benchmark compares:

- `default-font-loading`
- `no-system-fonts`
- `explicit-system-primary-fonts`
- `bundled-primary-fonts`
- `explicit-detected-fonts`

It also writes samples for English, numbers, units, symbols, CJK, and mixed text.

Observed results:

- Windows default font loading: roughly 120-160 ms per render.
- macOS default font loading: roughly 3 seconds per render.
- Windows bundled Inter primary: roughly 2-5 ms for normal text widgets.
- Runtime after restart: roughly 3-5 ms average total rasterizer time for ordinary
  widgets, with `maxFontFiles=2`.
- CJK fallback remains more expensive because system CJK fonts are large and still
  must be loaded when needed.

## Implemented Changes

### Metric view update queue

Files:

- `packages/hub/src/view-updates/update-queue.ts`
- `packages/hub/src/view-updates/update-queue.test.ts`
- `packages/hub/src/view-updates/runner.ts`

The queue now has priority lanes:

- Settings changes are high priority.
- Ordinary metric ticks are normal priority.
- Re-enqueueing the same action promotes existing queued work instead of duplicating it.

This avoids increasing render concurrency, which protects global drawing performance
when many keys are visible.

### Metric view performance stats

Files:

- `packages/hub/src/view-updates/performance-stats.ts`
- `packages/hub/src/view-updates/performance-stats.test.ts`
- `packages/hub/src/view-rendering/rasterizer-performance-stats.ts`
- `packages/hub/src/view-rendering/rasterizer-performance-stats.test.ts`

The performance summaries are log-friendly and aggregated so high-frequency render
paths do not emit per-frame noise.

### resvg font resolver

Files:

- `packages/hub/src/view-rendering/resvg-font-options.ts`
- `packages/hub/src/view-rendering/resvg-font-options.test.ts`
- `packages/hub/src/view-rendering/rasterizer.ts`

The resolver builds resvg font options per SVG:

- `loadSystemFonts: false`
- Windows primary: bundled Inter plus Segoe UI Symbol
- macOS primary: SF system fonts plus platform symbol candidates
- Han fallback only when visible SVG text contains Han characters
- Kana fallback only when visible SVG text contains Hiragana or Katakana
- Hangul fallback only when visible SVG text contains Hangul
- Symbol fallback only when visible SVG text contains known symbol ranges

Detection uses visible SVG text only. It ignores comments, path data, ids, and other
non-visible SVG content.

Important design point: CJK fallback is based on input text, not system language. An
English UI can still contain Chinese, Japanese, or Korean text inside the SVG.

### Bundled Inter

Files:

- `packages/hub/assets/fonts/inter/InterVariable.ttf`
- `packages/hub/assets/fonts/inter/LICENSE.txt`
- `packages/hub/assets/fonts/inter/README.md`
- `packages/hub/rollup.config.mjs`

Inter source:

- Official upstream: `https://github.com/rsms/inter/releases/tag/v4.1`
- Artifact: `Inter-4.1.zip`
- License: SIL Open Font License 1.1

The Rollup build copies the runtime font assets into:

```text
packages/hub/com.ez.sho-metrics.sdPlugin/assets/fonts/inter/
```

Bundle size was not treated as a blocking concern because the project is a Stream Deck
plugin and users load the bundle at install/update time.

### Text fit guard

Files:

- `packages/hub/src/view-rendering/svg-utils.ts`
- `packages/hub/src/view-rendering/svg-utils.test.ts`
- `packages/hub/src/widgets/primitives/metric-text-row.ts`
- `packages/hub/src/widgets/primitives/primitive-smoke.test.ts`

Before this change, shared text helpers clipped text to a safe box but did not attempt
to make near-boundary text fit. This prevented visual overflow but could cut off the
last glyph.

The new helper behavior:

- Estimate text width with a conservative low-cost character model.
- Shrink font size when the estimated text width is close to or beyond the container.
- Add SVG `textLength` and `lengthAdjust="spacingAndGlyphs"` as a final fit guard.
- Keep clipping as the last safety boundary.

This is intentionally not a real per-frame font measurement system. Calling native text
measurement or adding a font layout dependency in every render would create a new hot
path cost. The estimator is deterministic and cheap, and it centralizes future custom
font risk in one helper.

## Alternatives Considered

### Increase global render concurrency

Pros:

- Simple.
- Could reduce queue delay on fast machines.

Cons:

- Risky with many Stream Deck keys.
- More concurrent `new Resvg(...)` calls can increase CPU spikes.
- Does not fix the root font loading cost.

Decision: rejected.

### Only rerender the changed key immediately

Pros:

- Narrower than changing global queue behavior.
- Good user-perceived latency for PI changes.

Cons:

- Still competes with slow rasterization.
- Duplicates scheduling behavior outside the queue.
- Easy to create ordering edge cases.

Decision: partially addressed by queue priority instead.

### Full system font preload

Pros:

- Ideal API shape if resvg supported it efficiently.

Cons:

- `@resvg/resvg-js` does not currently provide a Node API to load system fonts once.
- Upstream issues indicate repeated font loading and text rendering remain known
  performance concerns.

Decision: avoided.

### Bundle complete CJK fonts

Pros:

- More deterministic cross-platform CJK rendering.
- Avoids depending on system CJK font paths.

Cons:

- Large assets.
- Not necessary for the current primary runtime path.
- Windows and macOS already have acceptable system CJK fallbacks.

Decision: defer.

### Real text measurement for every render

Pros:

- More accurate with arbitrary fonts.

Cons:

- Adds hot-path CPU cost.
- Requires another rendering/layout dependency or an extra native rendering pass.
- Harder to keep deterministic across platforms.

Decision: use low-cost estimator plus SVG fit guard instead.

## Current Verification

Commands run:

```powershell
cd packages\hub
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run build
npx.cmd streamdeck restart com.ez.sho-metrics
node scripts\bench-resvg-minimal.mjs 3 --write-samples --list-fonts
```

Results:

- Lint passed.
- Unit tests passed.
- Build passed.
- Plugin restart succeeded.
- Benchmark samples were generated under:

```text
packages/hub/tmp/resvg-bench-samples/
```

Runtime rasterizer logs after restart showed normal widget windows around:

- `avgConstructMs`: 3-5 ms
- `avgTotalMs`: 4-6 ms
- `maxFontFiles`: 2 for normal non-CJK widgets

## Known Limitations

### CJK fallback cost

CJK fallback can still take tens of milliseconds because Windows and macOS CJK font
files are large. This is acceptable for occasional user text, but should not be treated
as the normal hot path for every key.

### Mixed CJK visual consistency

Without bundled CJK fonts, system fallback choices can vary. The resolver reduces
unnecessary fallback loading, but it cannot guarantee identical CJK glyph style across
platforms or OS versions.

### Symbol fallback path availability

Some symbol glyphs depend on platform symbol font paths. If a system path differs, the
benchmark `--list-fonts` output should be checked first.

### Custom fonts

Future custom font support should not bypass the shared text helpers. Any user font
option must flow through:

- `renderConstrainedSvgText`
- `renderMetricTextRow`
- `resolveResvgFontOptions` or a successor font resolver

If custom fonts include very wide glyphs, adjust the shared fit guard ratio rather than
patching individual widgets.

## Follow-Up Recommendations

1. Keep benchmark samples as the first visual check after font resolver changes.
2. Add a small golden-image or pixel-bound smoke test for representative text layouts
   when the test infrastructure supports image assertions.
3. If CJK usage becomes common, revisit a bundled CJK subset strategy.
4. If user custom fonts are added, expose font choice through a typed resolver layer and
   keep `loadSystemFonts: false` unless a measured benchmark proves otherwise.
5. Continue using aggregate performance logs instead of per-frame render logs.
