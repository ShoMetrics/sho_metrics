# Hub I18n Implementation Plan

## Purpose

Implement internationalization for Sho Metrics Hub and the Property Inspector
with the smallest durable architecture that covers the current product need.

The first implementation target is:

- Stream Deck manifest and action-list copy.
- Property Inspector UI copy.
- Node/Hub user-visible copy that is shown in the Property Inspector.

Do not change these areas in v1:

- Stored settings proto.
- Global settings.
- Widget key SVG rendering.
- C# helper or Control Panel copy.
- Logs or DEBUG raw diagnostic details.

The first supported locales are:

- `en`
- `zh_CN`
- `ja`

All other Stream Deck languages fall back to `en`. `zh_TW` also falls back to
`en`; do not auto-convert `zh_CN` to `zh_TW` because regional wording and
idioms differ and simplified-to-traditional conversion is not localization.

## Current Facts

These facts are from the current repository and official SDK docs:

- `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json` contains English
  root and action strings directly.
- The plugin directory does not currently contain generated `en.json`,
  `zh_CN.json`, or `ja.json` locale files.
- `packages/hub/src/property-inspector/stream-deck/stream-deck-client.ts`
  models `RegistrationInfo.application.platform`, but does not yet model
  `RegistrationInfo.application.language`.
- `docs/development/property-inspector-startup-delay-notes.md` records that PI
  connection info can resolve before widget/global settings. It also records
  global settings readiness around the 300ms range in observed runs.
- Elgato's PI registration info includes
  `application.language: "de" | "en" | "es" | "fr" | "ja" | "ko" | "zh_CN" | "zh_TW"`.
- Elgato's localization files live in the `*.sdPlugin` directory and can
  override manifest root `Name`/`Description`, action `Name`/`Tooltip`, encoder
  trigger descriptions, state names, and custom `Localization` strings.
- The repo currently has many hard-coded user-visible strings in
  `packages/hub/src/property-inspector/**`.

## Step 1 Inventory Result

Recorded on June 6, 2026, before adding the i18n runtime.

Static grep inventory, excluding test files:

```txt
PI JSX visible-text candidates:                 50
PI prop/section/label literal candidates:       131
Manifest Name/Tooltip/Description candidates:    14
```

Focused PI-facing helper/source/option inventory:

```txt
setting-options.ts stable option labels:                  58
catalog-metric-options.ts stable option/placeholder text: 26
runtime-select-options.ts stable option text:             10
helper-status-guidance.ts ordinary guidance strings:       4
settings-sync-state.ts parameterized notice strings:       3
ColorCompensationWizard.tsx ordinary notice strings:      13
```

Parameterized user-visible message inventory:

- Color Compensation notices:
  - `Preview update failed: {errorMessage}`
  - `Failed to save color compensation: {errorMessage}`
  - `Failed to reset color compensation: {errorMessage}`
  - `{count} step(s) skipped.`
- Helper guidance:
  - `Install ShoMetrics Helper to use {installSubject}.`
- Settings sync notices:
  - `Failed to save widget settings: {errorMessage}`
  - `Failed to save global settings: {errorMessage}`
  - `Failed to load settings: {errorMessage}`
- Settings read warnings:
  - `{scopeLabel} settings contain fields this version does not understand. They will be removed the next time {settingsScope} settings are saved.`
  - `{scopeLabel} settings could not be read. Defaults are shown; saving {settingsScope} settings will replace the unreadable settings.`
- Stable option suffixes:
  - `{label} (not supported)`
  - `{label} (Unavailable)`
  - `Auto: {diskKind} ({diskLabel})`

Plural/select inventory:

```txt
plural/select messages that require ICU in v1: 0
```

The only plural-like string found is the Color Compensation skipped-step notice,
currently implemented manually as `step`/`steps`. For v1, keep this as a simple
parameterized message or split it into explicit singular/plural message entries.
Do not add `intl-messageformat` for this inventory.

Startup baseline status:

- No new production timing harness was added.
- No i18n runtime code has been added yet.
- The message inventory above is complete for Step 1.
- Temporary PI console diagnostics were added locally and removed after
  recording the result.
- GPU and Memory PI opens were measured from script evaluation to first React
  commit, connection-loaded dispatch, WebSocket open, global settings ready, and
  widget settings ready.
- React first commit happened around 62-78ms.
- Action-specific `connectionLoaded` dispatched around 64-79ms.
- PI WebSocket open happened around 369-380ms.
- `getSettings()` and `getGlobalSettings()` completed around 378-386ms.
- The i18n implementation must choose locale from connection info before first
  localized render and must not wait for `getSettings()` or
  `getGlobalSettings()`.
- Detailed timing notes live in
  `docs/development/property-inspector-startup-delay-notes.md`.

Reference links:

- Elgato Localization:
  https://docs.elgato.com/streamdeck/sdk/guides/i18n/
- Elgato Property Inspector WebSocket UI:
  https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/

## Decisions

### Locale Source

Follow the Stream Deck application language by default.

Do not add a global language option in v1. Do not change proto for i18n in v1.
The PI must read the language from `RegistrationInfo.application.language` and
must not wait for global settings to choose a locale.

Supported locale normalization:

```txt
en    -> en
zh_CN -> zh_CN
ja    -> ja
other/unknown/missing -> en
```

If a future global language override is added, it must be an explicit override
of Stream Deck language and must solve the PI startup race first. Global
settings arrive later than connection info in observed PI startup runs.

### Catalog Style

Use domain-group typed message objects.

Do not create a global `messages.propertyInspector...` object. That shape
encourages broad global imports and turns the catalog into a second application
tree. Each UI module or panel should import only the message group objects it
needs.

Recommended shape:

```ts
// packages/hub/src/i18n/message-groups/widgets.ts
import type { LocalizedMessages } from "../types";

export const cpuMessages = {
    cpuMetricLabel: {
        en: "CPU Metric",
        zh_CN: "CPU 指标",
        ja: "CPU メトリクス",
    },
} as const satisfies LocalizedMessages;
```

`packages/hub/src/i18n/messages.ts` is only a barrel and registry:

```ts
import { shellMessages, commonMessages } from "./message-groups/shell";
import { optionMessages } from "./message-groups/options";
import { cpuMessages } from "./message-groups/widgets";

export * from "./message-groups/shell";
export * from "./message-groups/options";
export * from "./message-groups/widgets";

export const messageGroups = {
    shellMessages,
    commonMessages,
    optionMessages,
    cpuMessages,
} as const;
```

Usage:

```tsx
import { commonMessages } from "../../i18n/message-groups/shell";
import { cpuMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../i18n/react";

export function CpuMetricSetting(): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(commonMessages.metricSection)}>
            <SelectSetting label={t(cpuMessages.cpuMetricLabel)} />
        </SettingsSection>
    );
}
```

Rules:

- Do not hand-write translation keys in application code.
- Do not generate stable ids for PI messages in v1.
- Do not add `surface`, `maxLength`, or required `description` metadata.
- Add ordinary code comments only for ambiguous short strings such as `Open`,
  `Reset`, `Auto`, or `Scale`.
- Do not create a hidden flat catalog plus remap layer. Each exported
  `*Messages` object is its own source of truth and directly owns its
  `{ en, zh_CN, ja }` literals.
- `messages.ts` owns the application-side `messageGroups` registry and must
  list every PI message group exactly once.
- `i18n-check.mjs` should explicitly import the six leaf `message-groups/*.ts`
  files instead of importing `messages.ts`: Node can type-strip explicit leaf
  `.ts` imports, but it does not resolve the extensionless imports inside
  `messages.ts` the way Rollup does. Keep this check-side list in sync with
  `messageGroups`; do not replace it with source-text scraping.
- Use `satisfies`/helper types to make missing locale values a TypeScript
  error.
- `LocalizedMessage` must require every supported locale:

  ```ts
  export type HubLocale = "en" | "zh_CN" | "ja";
  export type LocalizedMessage = Record<HubLocale, string>;
  ```

  Do not define it as `{ en: string } & Partial<Record<...>>` or with optional
  locale fields. Missing `zh_CN` or `ja` must be a compile-time error.

This is not a full i18n framework. It is a typed object convention plus a small
formatter.

### Message Formatting

Do not add `intl-messageformat` in v1 unless Step 1 finds a real v1 need for
plural/select ICU messages.

The default v1 formatter supports:

- Selecting the localized string by `HubLocale`.
- Falling back to English when the locale is unsupported or missing.
- Plain strings.
- Simple named interpolation with `{name}` placeholders.

Example:

```ts
export const warningMessages = {
    settingsLoadFailed: {
        en: "{scope} settings could not be read.",
        zh_CN: "无法读取{scope}设置。",
        ja: "{scope}設定を読み取れませんでした。",
    },
} as const satisfies LocalizedMessages;

i18n.t(warningMessages.settingsLoadFailed, { scope: "Widget" });
```

Formatter rules:

- Placeholder syntax is only `{identifier}`.
- Placeholder values must be strings, numbers, or booleans.
- The central formatter must support explicit strict mode. Tests and any future
  catalog validation script must call strict mode so missing placeholder values
  fail centrally, not in individual components.
- Production must fall back safely and must not render raw placeholder syntax
  such as `{scope}` to users. If a placeholder value is missing in production,
  replace that placeholder with an empty string or another centralized safe
  fallback from the i18n runtime.
- Literal braces are not supported in v1 messages. If a real user-facing message
  needs literal braces, update this plan before implementing that message.
- Do not implement plural/select logic manually.
- If v1 requires plural/select or locale-specific message grammar, update the
  plan and add `intl-messageformat` at that point.

This deliberately avoids pulling the ICU parser into the PI startup path for
zero or near-zero plural/select messages.

### Manifest Localization

Generate Stream Deck locale JSON from a small manifest-specific catalog.

The manifest catalog may use explicit structure because it maps to Elgato's
manifest shape. Do not force that structure onto all PI messages.

Generated files:

```txt
packages/hub/com.ez.sho-metrics.sdPlugin/en.json
packages/hub/com.ez.sho-metrics.sdPlugin/zh_CN.json
packages/hub/com.ez.sho-metrics.sdPlugin/ja.json
```

The generator should cover manifest text only:

- Root `Name`.
- Root `Description`.
- `Actions[]` `Name`.
- `Actions[]` `Tooltip`.
- `Actions[].Encoder.TriggerDescriptions` when present.
- `Actions[].States[]` `Name` when present.

Do not generate `Localization` custom strings for PI v1. The PI uses the Hub
i18n runtime directly.

Prevent drift with one adapter and one check:

- `npm run i18n:generate` writes generated locale JSON.
- `npm run i18n:check` validates generated locale JSON is current.
- `npm run i18n:check` validates manifest English strings still match the
  English manifest catalog.

Only the manifest adapter should know Elgato's locale JSON shape. If Elgato
adds or changes localizable fields later, update that adapter and its tests.
Hand-maintained JSON would have the same compatibility risk, but would spread
it across files.

### Property Inspector Startup

The PI must not first render English and then switch to `zh_CN` or `ja`.

Rules:

- `property-inspector.tsx` may render an empty root while waiting for
  `client.getConnectionInfo()`.
- The first user-visible PI render must already have the normalized locale.
- Locale resolution must not wait for `getSettings()` or `getGlobalSettings()`.
- `usePropertyInspectorSettings()` may continue to read connection info for
  action/platform state. The resolved promise should make the second read cheap.
- Global settings must not control PI locale in v1.

The no-flicker requirement is validated by deterministic PI tests, not by a
permanent timing harness.

### Deck Key Rendering

Do not localize Deck key SVG text in v1.

Reasons:

- CJK key rendering would require font packaging, fallback, measurement, layout,
  and visual test work.
- Key space is small, and translated text may be less readable than stable short
  labels.
- Existing key text is mostly short technical text such as `CPU`, `GPU`,
  `TEMP`, `N/A`, and `Error`.
- Detailed guidance belongs in the Property Inspector, not on the key.

Do not pass locale through the widget rendering pipeline in this project.
Do not change view builders only to localize key text.

### Node/Hub Scope

Node/Hub user-visible copy that appears in the Property Inspector must use i18n.
Examples:

- PI settings read warnings.
- Helper guidance shown in PI panels.
- Source diagnostic labels shown in PI.
- Stable option labels shown in PI.

Do not localize:

- Logs.
- DEBUG raw diagnostic details.
- C# helper or Control Panel copy.
- Dynamic hardware, sensor, disk, or network-interface names reported by the
  OS/helper.
- Deck key SVG static text in v1.

Runtime state should still flow as typed state/codes. Do not change runtime
state contracts to pass already-translated long strings.

### Runtime Mode And Fallback

Do not scatter environment checks through components.

Rules:

- Locale fallback to English is always centralized in the i18n runtime.
- Missing locale fallback must be production-safe.
- Missing translation and placeholder failures should be caught by
  `i18n:check` and tests.
- If a runtime mode check is needed, it belongs in one i18n-owned module only.
- Components and panels must only call `i18n.t(message, values?)`.

### Hard-Coded Text Detection

Do not build a hard-coded `.tsx`/`.ts` text scanner in v1.

Reasons:

- The repo has many legitimate string literals: CSS class names, ARIA roles,
  metric ids, UUIDs, type names, file paths, tests, and OS/helper labels.
- A regex scanner would require a growing ignore list and would likely become
  noisy.
- The durable v1 guard is review plus typed catalogs, not a custom source
  scanner.

If a report is useful later, it must start as local/report-only tooling. It must
not become a CI gate without a separate design.

## Rejected Alternatives

| Alternative | Reason rejected |
| --- | --- |
| Stream Deck official i18n only | It is suitable for manifest/action-list strings. It does not provide the typed PI/Node workflow needed by this repo. PI is a React webview and should not depend on `@elgato/streamdeck` browser imports. |
| Full `react-intl` | It is good for React-only apps, but Sho Metrics only needs local typed resources and a small formatter in v1. A full React provider/message framework is heavier than the current need. |
| `i18next`/`react-i18next` | It is mature, but its resource loading, plugins, namespaces, language detection, and React bindings are heavier than the current need. |
| `intl-messageformat` by default | It is the right choice once plural/select ICU messages are real requirements. It is not justified for v1 if the message inventory has zero plural/select messages. |
| Custom plural/select handling | This is fragile and should not be implemented. If plural/select is needed, add a mature messageformat library instead. |
| Stable generated ids for all PI messages | PI code can use direct typed message objects. Stable ids are useful for translation platforms and large cross-file catalogs, but v1 intentionally does not integrate a translation platform. |
| Global `messages.propertyInspector...` tree | It encourages broad global imports and makes the message catalog look like a second app tree. Prefer domain-group exports such as `cpuMessages`. |
| JSON as PI source of truth | JSON is translation-platform friendly, but weaker for direct code references and agentic maintenance. The repo is not using a translation platform in v1. |
| Global language setting in v1 | It reintroduces the PI startup race: global settings arrive later than connection info. Follow Stream Deck language first and avoid proto changes. |
| Localizing Deck key SVG text in v1 | This would turn i18n into a rendering/font/layout project. It is out of scope. |
| Hard-coded text scanner in v1 | It is likely to be noisy and creates permanent ignore-list maintenance. Review and typed catalogs are enough for v1. |

## Proposed File Layout

Use `i18n`, the common industry term, for the Hub source directory. Keep the v1
layout intentionally small; do not create one file per panel until the catalog
is large enough to justify it.

```txt
packages/hub/src/i18n/
  format.ts
  locale.ts
  react.tsx
  types.ts
  messages.ts
  manifest-messages.ts
  manifest-localization.ts
```

PI message files are grouped by edit domain:

```txt
packages/hub/src/i18n/
  message-groups/
    shell.ts                 # shellMessages, commonMessages
    options.ts               # optionMessages
    widgets.ts               # widgetMessages, cpu/gpu/disk/network/catalog/helper
    color.ts                 # colorMessages
    settings.ts              # settingsNoticeMessages, globalSettingsMessages
    color-compensation.ts    # colorCompensationMessages
  messages.ts                # barrel plus messageGroups registry only
```

Do not split one file per panel or action. Do not merge unrelated groups into a
catch-all file. `colorMessages` and `colorCompensationMessages` stay separate:
ordinary color controls and the compensation wizard are different editing
domains.

Do not split v1 into `en.ts`, `zh_CN.ts`, and `ja.ts`. Per-locale files are a
good fit for translation-platform workflows, but this project wants direct code
references and strong local context for agentic editing. Keeping each message's
three locale values together makes the call site and translation context easier
to review.

Suggested test files:

```txt
packages/hub/src/i18n/format.test.ts
packages/hub/src/i18n/locale.test.ts
packages/hub/src/i18n/manifest.test.ts
```

Suggested scripts:

```txt
packages/hub/scripts/i18n-generate.mjs
packages/hub/scripts/i18n-check.mjs
```

Suggested package scripts:

```json
{
  "i18n:generate": "node scripts/i18n-generate.mjs",
  "i18n:check": "node scripts/i18n-check.mjs"
}
```

`i18n:check` should run in CI before or as part of `npm run test:unit`.

## Implementation Steps

The step boundaries are intentional. Do not combine adjacent steps unless a
later design explicitly changes the acceptance criteria.

LOC estimates are changed lines in the implementation diff, excluding generated
build output and excluding temporary local diagnostics. Generated locale JSON is
listed separately.

### Step 1. Inventory Copy And Record One-Time Startup Baseline

Goal: measure the real v1 message needs and record current PI startup behavior
without adding permanent instrumentation.

Work:

1. Inventory user-visible PI/Hub strings in:
   - `packages/hub/src/property-inspector/**`
   - PI-facing helper/source guidance in `packages/hub/src/**`
   - `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`
2. Count:
   - Static messages.
   - Simple parameterized messages.
   - Messages that truly need plural/select grammar.
3. If plural/select count is greater than zero, stop and update this plan before
   choosing between the simple formatter and `intl-messageformat`.
4. Record current PI startup behavior with temporary local diagnostics:
   - PI script start.
   - `connectElgatoStreamDeckSocket` called.
   - `client.getConnectionInfo()` resolved.
   - first user-visible React render.
   - `getSettings()` refresh ready.
   - `getGlobalSettings()` ready.
5. Run at least 5 PI opens on the same machine and record median-ish observed
   values in `docs/development/property-inspector-startup-delay-notes.md`.
6. Remove temporary timing instrumentation before committing production code.
7. Do not add a permanent timing module or CI performance budget in this step.

Acceptance:

- The plan has a recorded v1 count for static, parameterized, and plural/select
  messages.
- There is a before-i18n PI startup note in
  `property-inspector-startup-delay-notes.md`.
- No production timing harness is committed.
- No i18n dependency is chosen before the message inventory is known.

Estimated committed LOC:

- 30-80 documentation LOC.
- 0 production code LOC.

Do not merge with Step 2. This step decides whether the formatter can stay
small and records pre-i18n behavior before implementation changes the startup
path.

### Step 2. Add Minimal I18n Runtime And PI Locale Bootstrap

Goal: add the smallest runtime that can render localized PI text on the first
visible render.

Work:

1. Add `packages/hub/src/i18n/types.ts`:
   - `HubLocale = "en" | "zh_CN" | "ja"`.
   - `LocalizedMessage`.
   - `LocalizedMessages`.
   - Placeholder value types.
2. Add `packages/hub/src/i18n/locale.ts`:
   - Normalize Stream Deck language values to `HubLocale`.
   - Treat unknown/missing/unsupported values as `en`.
   - Treat `zh_TW` as `en`.
3. Add `packages/hub/src/i18n/format.ts`:
   - `formatMessage(locale, message, values?)`.
   - English fallback.
   - `{identifier}` interpolation.
   - Central missing-placeholder behavior.
   - Placeholder-name extraction for tests/checks.
4. Add `packages/hub/src/i18n/react.tsx`:
   - `I18nProvider`.
   - `useI18n()`.
   - No language detection inside components.
5. Update `RegistrationInfo` and `ConnectionInfo` in
   `packages/hub/src/property-inspector/stream-deck/stream-deck-client.ts` to
   include `application.language`.
6. Add a helper next to `readPropertyInspectorPlatformValue()`, for example
   `readPropertyInspectorLanguageValue()`.
7. Change `property-inspector.tsx` so it waits only for
   `client.getConnectionInfo()`, normalizes locale, then renders
   `<I18nProvider locale={locale}><App ... /></I18nProvider>`.
8. Before locale is known, render no user-visible text.
9. Add `packages/hub/src/i18n/message-groups/shell.ts` and
   `packages/hub/src/i18n/messages.ts`, then migrate only the App shell:
   - Widget tab.
   - Global tab.
   - Tablist ARIA label.
10. Add tests for:
    - locale normalization.
    - `zh_TW` fallback.
    - simple interpolation.
    - missing placeholders.
    - placeholder-name mismatch helpers.
    - a type-level fixture with `// @ts-expect-error` proving a
      `LocalizedMessage` missing `ja` fails TypeScript.
    - production-safe missing-placeholder output proving users do not see raw
      `{placeholder}` text.
    - first visible PI render with `zh_CN` or `ja` is already localized.

Acceptance:

- No English-to-localized flicker for the App shell.
- Locale does not depend on global settings.
- Existing widget/global settings load behavior remains unchanged.
- No `intl-messageformat` dependency is added unless Step 1 proved plural/select
  is needed and this plan was updated.
- Components call `t(shellMessages.widgetTab)`, not string ids.
- There is no global `messages.propertyInspector...` export.
- There is no hidden flat catalog or `key: messageCatalog.key` remap layer.
- `LocalizedMessage` has a test-backed invariant that `en`, `zh_CN`, and `ja`
  are all required.
- The production missing-placeholder path is test-backed and never displays raw
  `{placeholder}` text.

Estimated LOC:

- 260-420 code/test LOC.

Do not merge with Step 3. This step changes PI startup behavior and the runtime
contract. It must be reviewable without generated Stream Deck locale JSON churn.

### Step 3. Generate Stream Deck Locale JSON

Goal: make the official Stream Deck locale files generated outputs of the Hub
manifest catalog.

Work:

1. Add `packages/hub/src/i18n/manifest-messages.ts` with manifest/action copy
   for `en`, `zh_CN`, and `ja`.
2. Add manifest localization helpers:
   - Read the current manifest object.
   - Map root/action/state/encoder text fields to Elgato locale JSON shape.
   - Validate every action UUID used by the manifest catalog exists in the
     manifest.
   - Validate manifest English text matches the English manifest catalog.
3. Add `packages/hub/scripts/i18n-generate.mjs`.
4. Add `packages/hub/scripts/i18n-check.mjs`.
5. `i18n:check` must validate:
   - Missing locale values in typed catalogs.
   - Placeholder-name mismatch between `en`, `zh_CN`, and `ja`.
   - Generated locale JSON drift.
   - Manifest English drift.
   - The PI message groups by importing the leaf `message-groups/*.ts` files
     directly. Do not parse `messages.ts` source text with regular expressions.
6. Add package scripts:
   - `i18n:generate`
   - `i18n:check`
7. Generate:
   - `packages/hub/com.ez.sho-metrics.sdPlugin/en.json`
   - `packages/hub/com.ez.sho-metrics.sdPlugin/zh_CN.json`
   - `packages/hub/com.ez.sho-metrics.sdPlugin/ja.json`
8. Add tests for the manifest localization adapter.

Acceptance:

- Generated locale JSON matches Elgato's documented shape.
- `npm run i18n:check` fails if generated locale JSON is stale.
- `npm run i18n:check` fails if manifest English strings drift from catalog
  English strings.
- Generated JSON files are not edited manually.
- No hard-coded source text scanner is introduced.

Estimated LOC:

- 220-360 code/test/script LOC.
- 80-160 generated locale JSON LOC.

Do not merge with Step 4. This step touches packaging-facing files and should be
reviewed before bulk PI text migration begins.

### Step 4. Migrate PI And Hub User-Visible Copy

Goal: complete the Hub/PI text migration while leaving C#, logs, debug details,
and Deck key rendering unchanged.

Work:

1. Migrate hard-coded user-visible text in
   `packages/hub/src/property-inspector/**`.
2. Migrate stable option labels in:
   - `property-inspector/panels/setting-options.ts`
   - `property-inspector/select-options/runtime-select-options.ts`
   - `property-inspector/select-options/catalog-metric-options.ts`
3. Keep dynamic OS/helper labels untranslated:
   - Disk names.
   - Network interface names.
   - Sensor names.
   - Hardware names.
4. Migrate PI guidance helpers:
   - `helper-status-guidance.ts`
   - selected source diagnostic labels shown to normal users.
5. Migrate settings warning notices created in settings-sync code.
6. Migrate Color Compensation Wizard copy because it is a PI user flow.
7. Do not migrate:
   - `packages/source-windows/**`
   - logs
   - DEBUG raw diagnostic text
   - generated protobuf files
   - tests except where expected text must change
   - Deck key SVG copy
8. Update tests to assert translated visible copy through the i18n layer.
9. Use review plus typed catalogs to prevent missed user-facing copy. Do not add
   a regex hard-coded string scanner in this step.

Acceptance:

- `npm run i18n:check` passes.
- `npm run test:unit` passes.
- `npm run test:pi` passes.
- New PI user-visible strings require catalog entries by review convention.
- No locale is passed into Deck key renderers.
- No proto changes are introduced.

Estimated LOC:

- 800-1,400 changed code/test LOC.
- Most changes are mechanical replacements from literals to message references.

Do not merge with Step 3. Step 3 proves packaging generation. Step 4 is bulk
migration and should not hide generator regressions in a large text diff.

### Step 5. Final Sanity And Packaging Validation

Goal: verify i18n did not introduce visible startup regressions and generated
locale files package correctly.

Work:

1. Re-run the Step 1 one-time PI startup sanity check on the same machine and
   Stream Deck version.
2. Record the after-i18n observation next to the baseline.
3. Verify:
   - first user-visible render does not wait for global settings.
   - first user-visible render uses the final locale.
   - no English-to-localized flicker occurs.
4. Run:
   - `npm run i18n:check`
   - `npm run build`
   - `npm run test:unit`
   - `npm run test:pi`
5. If available in the local environment, run the Stream Deck CLI/package
   validator after build.

Acceptance:

- The PI does not show English first and then switch language.
- First user-visible render is not obviously slower than the Step 1 baseline.
  This is a sanity check, not a permanent CI performance budget.
- Global settings readiness remains independent from locale selection.
- Generated `en.json`, `zh_CN.json`, and `ja.json` are present in the plugin
  directory after generation/build.

Estimated LOC:

- 20-60 documentation/test-update LOC.
- No expected production code LOC unless validation finds a defect.

Do not merge with Step 4. This is the post-migration acceptance gate. It exists
so a later reviewer can answer startup and packaging questions without rereading
the entire migration diff.

## Total LOC Estimate

Expected changed LOC excluding generated locale JSON:

```txt
Step 1:    30-80
Step 2:   260-420
Step 3:   220-360
Step 4:   800-1,400
Step 5:    20-60
Total:  1,330-2,320
```

Generated locale JSON:

```txt
80-160 LOC
```

The total is lower than a framework-heavy approach because v1 avoids
`intl-messageformat`, stable ids for every PI string, a hard-coded string
scanner, and a permanent startup timing harness unless the Step 1 inventory
proves those costs are justified.

## Validation Checklist

Before considering the i18n work complete:

- `npm run i18n:check`
- `npm run build`
- `npm run test:unit`
- `npm run test:pi`
- Open PI with Stream Deck language `en`.
- Open PI with Stream Deck language `zh_CN`.
- Open PI with Stream Deck language `ja`.
- Open PI with Stream Deck language `zh_TW` and confirm English fallback.
- Confirm no PI English-to-localized flicker.
- Confirm no global settings read is required for locale selection.
- Confirm generated locale JSON files are packaged in
  `packages/hub/com.ez.sho-metrics.sdPlugin`.
- Confirm Deck key rendering still uses the existing English/ASCII copy and did
  not receive a locale parameter.

## Future Work

Do not implement these in v1:

- Global language override.
- `zh_TW` localization.
- `de`, `es`, `fr`, or `ko` localization.
- Deck key SVG text localization.
- C# helper or Control Panel localization.
- Translation-platform export/import.
- `intl-messageformat` or another ICU messageformat dependency unless
  plural/select messages become real requirements.

If a future global language override is added, it must be designed as an
override of the Stream Deck language, not as the default source. It must also
solve the PI startup race before implementation because global settings arrive
after connection info in observed startup runs.
