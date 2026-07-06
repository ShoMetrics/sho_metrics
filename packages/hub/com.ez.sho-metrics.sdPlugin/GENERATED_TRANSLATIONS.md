# Stream Deck Plugin Bundle

`en.json`, `zh_CN.json`, and `ja.json` are generated Stream Deck manifest
localization files. Stream Deck expects these language-code JSON files in the
`.sdPlugin` root next to `manifest.json`.

Do not edit those JSON files directly. Update
`../../src/i18n/manifest-messages.ts`.

Also update the matching English text in `manifest.json` for every manifest
field whose `en` value changed:

- Root `Name`
- Root `Description`
- Each `Actions[].Name`
- Each `Actions[].Tooltip`
- Each named `Actions[].States[].Name`
- Each `Actions[].Encoder.TriggerDescription.*`

`npm.cmd run i18n:check` requires the English text in `manifest.json` to match
the `en` values in `manifest-messages.ts`. The generated JSON files are then
built from the current `manifest.json` plus `manifest-messages.ts`.

After both source files are updated, run:

```powershell
npm.cmd run i18n:generate
npm.cmd run i18n:check
```
