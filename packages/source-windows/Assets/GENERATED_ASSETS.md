# Generated Brand Assets

These files are generated from `packages/assets/brand/shometrics-logo-filled.svg`:

| File | Why it exists |
| --- | --- |
| `ShoMetrics.ico` | Shared Windows application icon embedded into the Control Panel, service executable, and Inno setup executable. Includes multiple sizes for taskbar, titlebar, Explorer, UAC, and installer surfaces. |
| `ShoMetricsIconTransparent.svg` | Transparent SVG mark retained as a source asset for Windows-side generated images and tools. Stream Deck does not reference it because QtSVG does not preserve the logo treatment reliably. |
| `ShoMetricsWizardImage.png` | Large Inno Setup wizard side panel image. It fills the whole wizard panel with the brand ground color and centered logo. |
| `ShoMetricsWizardSmallImage.png` | Small Inno Setup wizard/titlebar bitmap generated from the rounded app-icon variant. |

Do not edit them directly. Update the source SVG, then run:

```powershell
npm.cmd run brand:sync
```

from `packages/hub`.
