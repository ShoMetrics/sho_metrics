# Liquid Glass POC Archive

This directory archives the discarded liquid glass proof of concept. It is kept
for reference only and is not part of the production rendering path.

## References And Attribution

- `mkj0kjay/vue-web-liquid-glass`
  - URL: https://github.com/mkj0kjay/vue-web-liquid-glass
  - License: MIT, as stated by the repository README/GitHub metadata at the time
    this POC was archived.
  - Used as a reference for the SVG filter chain and refraction-map approach.
- `Liquid Glass in the Browser: Refraction with CSS and SVG`
  - URL: https://kube.io/blog/liquid-glass-css-svg/
  - Used as a conceptual reference for the refraction model, SVG displacement
    maps, and specular highlight behavior.

## Archived Files

- `liquid-glass-effect.ts`: resvg-oriented TypeScript POC for generating
  displacement/specular maps and filter markup.
- `liquid-glass-png-encoder.ts`: Node PNG data URL encoder used by the POC map
  generator.
- `liquid-glass-png-encoder.browser.ts`: browser fallback used by the POC.
- `liquid-glass-playground.html`: interactive parity/tuning playground.
- `render-liquid-glass.mjs`: local resvg render helper for playground exports.
- `validate-vue-parity.mjs`: helper for checking playground formulas against the
  referenced Vue implementation.

## Why This Was Not Shipped

The effect only refracts pixels that are present in the SVG rendered by Sho
Metrics. Stream Deck user-provided background images are outside that rendering
layer, so resvg cannot sample, blur, or displace them.

On solid-color widget backgrounds, blur and displacement mostly become visual
no-ops: a displaced flat color remains flat. The visible glass impression then
comes from the older self-lit Cupertino Glass decoration, not from the expensive
liquid-glass filter.

Measured on the real plugin path with all visible keys using glass, the 288x288
key average rasterization time increased from about 14ms to about 47ms. The
increase was almost entirely inside `resvg.render()`, which rose from about 5ms
to about 38ms per key. This makes the POC unsuitable for the hot render path.
