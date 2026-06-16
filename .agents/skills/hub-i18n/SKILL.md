---
name: hub-i18n
description: Use when changing Sho Metrics Hub internationalization, including Property Inspector user-visible copy, Stream Deck manifest locale JSON, i18n message groups, locale resolution, generated i18n scripts, supported locales, translation wording, or dev locale override behavior.
---

## Scope

I18n v1 covers:

- Stream Deck manifest and action-list copy.
- Property Inspector UI copy.
- Node/Hub user-visible copy shown in the Property Inspector.

I18n v1 does not cover:

- Stored settings proto or global settings.
- Deck key SVG text.
- C# helper or Control Panel copy.
- Logs or DEBUG raw diagnostic details.
- Dynamic hardware, sensor, disk, or network-interface names.

Supported locales are exactly:

```txt
en
zh_CN
ja
```

All other Stream Deck languages fall back to `en`.

## Message Catalog Rules

PI messages live in `packages/hub/src/i18n/message-groups/*.ts`.

Do:

- Add user-visible PI strings to the owning domain message group.
- Keep each message as `{ en, zh_CN, ja }`.
- Use `LocalizedMessage = Record<HubLocale, string>` semantics; all locale
  fields are required.
- Import the narrow message group needed by the component.
- Use `const { t } = useI18n()` and call `t(message, values?)`.
- Keep `packages/hub/src/i18n/messages.ts` as the barrel plus `messageGroups`
  registry only.

Do not:

- Add a flat god catalog or hidden `messageCatalog` plus remap layer.
- Hand-write string ids in application code.
- Add stable generated ids for ordinary PI messages.
- Add a source-text scanner for hard-coded strings.
- Add `intl-messageformat` unless a real plural/select requirement exists and
  the archived plan is updated first.
- Put translated strings into stored settings, proto, or renderer contracts.

`packages/hub/scripts/i18n-check.mjs` intentionally imports leaf
`message-groups/*.ts` files directly. Do not replace that with source-text
parsing of `messages.ts`.

## Manifest Locale JSON

Manifest/action localization is generated from
`packages/hub/src/i18n/manifest-messages.ts`.

Generated files:

```txt
packages/hub/com.ez.sho-metrics.sdPlugin/en.json
packages/hub/com.ez.sho-metrics.sdPlugin/zh_CN.json
packages/hub/com.ez.sho-metrics.sdPlugin/ja.json
```

Do not hand-edit generated locale JSON. Update the manifest catalog, then run:

```powershell
npm.cmd run i18n:generate
npm.cmd run i18n:check
```


## Validation

For i18n changes, run the narrowest useful set:

```powershell
npm.cmd run i18n:check
npm.cmd run test:unit
npm.cmd run test:pi
```

Run `npm.cmd run build` when changing Rollup constants, generated locale files,
or anything packaging-facing. Run `npm.cmd run lint` before committing.

If a command fails only because Buf cannot access its AppData module lock,
rerun the same command with the normal approval flow rather than changing code
or scripts.
