# Generated Brand Assets

These files are generated from `packages/assets/brand/shometrics-logo-filled.svg`:

| File | Why it exists |
| --- | --- |
| `category-icon.png` | Stream Deck action-list category icon, 28 x 28 px, white monochrome foreground on transparent background per Elgato category guidance. |
| `category-icon@2x.png` | High-DPI pair for `category-icon.png`, 56 x 56 px. |
| `marketplace.png` | Manifest-level plugin icon used by Stream Deck preferences and Marketplace surfaces, 256 x 256 px, rounded filled brand artwork. |
| `marketplace@2x.png` | High-DPI pair for `marketplace.png`, 512 x 512 px. |

Do not edit them directly. Update the source SVG, then run:

```powershell
npm.cmd run brand:sync
```

from `packages/hub`.
