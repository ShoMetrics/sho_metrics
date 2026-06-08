# Stream Deck Plugin Bundle

`en.json`, `zh_CN.json`, and `ja.json` are generated Stream Deck manifest
localization files. Stream Deck expects these language-code JSON files in the
`.sdPlugin` root next to `manifest.json`.

Do not edit those JSON files directly. Update
`../../src/i18n/manifest-messages.ts`, then run:

```powershell
npm.cmd run i18n:generate
```
