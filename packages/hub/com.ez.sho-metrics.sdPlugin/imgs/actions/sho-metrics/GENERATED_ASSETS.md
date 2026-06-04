# Generated Brand Assets

These files are generated from `packages/assets/brand/shometrics-logo-filled.svg`:

| File | Why it exists |
| --- | --- |
| `icon.png` | Stream Deck encoder/action-list ShoMetrics icon, 20 x 20 px, white monochrome foreground on transparent background per Elgato action-list guidance. |
| `icon@2x.png` | High-DPI pair for `icon.png`, 40 x 40 px. |
| `key.png` | Default on-device Stream Deck key image, 72 x 72 px, full filled brand artwork. |
| `key@2x.png` | High-DPI pair for `key.png`, 144 x 144 px. |

Do not edit them directly. Update the source SVG, then run:

```powershell
npm.cmd run brand:sync
```

from `packages/hub`.
