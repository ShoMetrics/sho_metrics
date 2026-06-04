# ShoMetrics Brand Assets

`shometrics-logo-filled.svg` is the source of truth for the ShoMetrics logo artwork.

Generated assets:

- `shometrics-logo-rounded.svg`

Generated consumers:

| Consumer | Generated assets |
| --- | --- |
| Stream Deck action list | White monochrome transparent PNG icons at Elgato's required category/action sizes. |
| Stream Deck keys | Full filled PNG key images at Elgato's required key sizes. |
| Stream Deck plugin icon | Rounded filled PNG marketplace/preferences icons at Elgato's required plugin sizes. |
| Windows executables and installer | Multi-size ICO plus Inno wizard bitmap images. |
| WinUI titlebar | Light and dark titlebar PNG variants selected through theme resources. |

Do not edit generated assets directly. Update `shometrics-logo-filled.svg`, then run:

```powershell
npm.cmd ci --prefix packages/assets/brand
```

from the repository root. Then run:

```powershell
npm.cmd run brand:sync
```

from `packages/hub`.

Use Node 24. The script relies on Node's native TypeScript execution, matching
the Stream Deck plugin runtime declared in the manifest.

The sync script rasterizes SVG with `@resvg/resvg-js` so glow, filter, and
clip behavior is deterministic across machines. `@resvg/resvg-js` is exact
pinned because renderer changes can affect pixels.

ImageMagick 7.x is still required for ICO packing and installer image
compositing, but not for SVG rendering. `brand:verify` fails if ImageMagick is
missing because those generated assets cannot be honestly verified without it.
