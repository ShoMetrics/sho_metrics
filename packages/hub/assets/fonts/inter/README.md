# Inter

Vendored Inter font files for ShoMetrics runtime SVG rasterization.

- Source: https://github.com/rsms/inter/releases/tag/v4.1
- Downloaded artifact: `Inter-4.1.zip`
- Files kept, copied from `extras/ttf/`:
  - `Inter-Regular.ttf` (400)
  - `Inter-Medium.ttf` (500)
  - `Inter-SemiBold.ttf` (600)
  - `Inter-Bold.ttf` (700)
  - `LICENSE.txt`
- License: SIL Open Font License 1.1

Inter is used as the bundled primary Latin UI font on Windows. macOS uses the
system SF fonts as the primary UI font to match platform expectations.

## Why static faces instead of one variable font

`InterVariable.ttf` was removed because resvg-js 2.6.2 cannot select a variable
font's `wght` axis: identical text rendered at weights 400 through 900 produced
byte-identical output. A weight is only visible when its own static face is
bundled and registered, so `RenderFontWeight` is a closed set whose members map
one-to-one onto the files above. That mapping lives in
`STATIC_INTER_FONT_FILE_NAME_BY_WEIGHT` in `render-font-weight.ts`, and every
site that registers Inter with resvg derives its file list from it: production
font options, the native weight test, the visual harness, and the two
rasterization benchmarks. Adding a weight without bundling its face is a type
error there; renaming a file without updating it is caught by
`render-font-weight.test.ts`.

## Why Regular is kept

The default preset starts at Medium, so Regular is easy to mistake for dead
weight. It is not:

- `terminal-vintage` selects it for `unit` and `footnote`. Those two are not a
  style choice. Share Tech Mono ships one face, so the weight changes no glyph
  there; it is chosen because it is the only member that reproduces the width
  estimate those roles had before this migration. See the note above the preset
  in `render-text-style.ts`.
- The width estimator in `svg-utils.ts` measures every other weight as a ratio
  against Regular and uses it as the default when a text run omits a weight.
- The pixel-window title bar chrome asks for it directly, though that string
  renders in DotGothic16.
- resvg has no error path for a missing face. Dropping the file makes
  `font-weight="400"` render as Medium silently, which is exactly what the
  closed `RenderFontWeight` set exists to prevent.
- Judged by eye on hardware, Regular reads best somewhere above roughly 12
  device px, so it is the first face any future size-aware weight selection
  would need. That figure is a tuning observation on the devices at hand, not a
  measured threshold; nothing in this repo reproduces it.

## Why only four weights

`Inter-ExtraBold.ttf` (800) and `Inter-Black.ttf` (900) were deliberately not
kept. Each face costs about 410 KB, and measured at Stream Deck key sizes
neither adds stroke solidity over Bold while both close the counters further,
so no view asked for them. Bring a face back only for a rendering need that
Bold provably cannot meet. If resvg later gains variable-axis support, the
right move is to restore `InterVariable.ttf` and drop the static faces, not to
add more of them.
