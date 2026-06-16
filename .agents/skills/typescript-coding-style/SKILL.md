---
name: typescript-coding-style
description: Use when writing, reviewing, or changing TypeScript code in this repo, especially for TypeScript type-safety boundaries, exports, TSDoc, React Property Inspector code, and hub directory placement. Pair with coding-style for language-neutral naming, comments, tests, and ownership rules.
---

# TypeScript Coding Style

Use this skill for TypeScript-specific type-safety, exports, TSDoc, React Property Inspector, and hub directory decisions. Pair with `coding-style`, `coding-style` is the base guideline to follow.

Keyword meaning within each section:

* **DO**: Mandatory; almost never a valid reason to stray.
* **DON'T**: Prohibited; almost never do.
* **PREFER**: Default choice; follow unless justified.
* **AVOID**: Discouraged; skip unless justified.
* **CONSIDER**: Optional; use based on context.

## 1. Type Safety Boundary

* **DO: Enforce lintable safety rules with ESLint**: If a safety rule is important and ESLint can enforce it, add or rely on an ESLint rule instead of documenting it only in prose. Current lint blocks explicit `any`, TypeScript suppression comments, `var`, avoidable `let`, empty catches, `console`, `eval`, ordinary non-null assertions, and type-aware unsafe operations in production source.

* **DO: Narrow `unknown` immediately before passing values into typed domain code**:
  - Good: validate `rawSettings` once, then pass `WidgetStoredSettings`.
  - Bad: pass `unknown` through several internal functions.

* **DON'T: Use double assertions in production code**:
  - Good: parse or narrow before use.
  - Bad: `rawSettings as unknown as WidgetStoredSettings`

* **PREFER: Keep test-only casts local to test fixtures**:
  - Good: `createWillAppearEventForTest(...) as unknown as WillAppearEvent` inside a test helper.
  - Bad: scattering SDK event casts through production code.

## 2. TypeScript Contract Boundary

* **DO: Choose `interface` or `type` by the shape being modeled**: Use `interface` for object contracts with fields, multiple methods, state, lifecycle, or domain object identity. Use `type` for unions, tuples, mapped types, and function aliases; prefer a function type for one-method callback contracts.
  - Good: `interface LoggerSink { level: LogLevel; info(...data: LogEntryData): LoggerSink; }`
  - Bad: `type LoggerSink = { level: LogLevel; info(...data: LogEntryData): LoggerSink; }`
  - Good: `type MetricFormatter = (sample: MetricSample) => string`
  - Bad: `interface MetricFormatter { format(sample: MetricSample): string; }`

* **DO: Use named exports**:
  - Good: `export function buildMetricView(...)`
  - Bad: `export default buildMetricView`

* **PREFER: Omit redundant `public` modifiers on members unless lint enforces them**: Keep access modifiers when they define parameter properties or non-public visibility.
  - Good: `record(sample: Sample): Summary`
  - Bad: `public record(sample: Sample): Summary`

* **DO: Make the first sentence of TSDoc a concise summary when TSDoc is needed**:
  - Good: `/** Resolves stored settings into render-ready settings. */`
  - Bad: `/** This function takes the settings parameter and returns settings. */`

* **DO: Start method or function TSDoc with a third-person verb phrase when a description is needed**:
  - Good: `Writes one message after the level check.`
  - Bad: `Write one message after the level check.`

* **PREFER: Start boolean TSDoc with `Whether` when a boolean needs documentation**:
  - Good: `/** Whether the logger should write this entry. */`
  - Bad: `/** True if the logger should write this entry. */`

## 3. Hub Directory Ownership Boundary

Directory ownership principles live in `coding-style`; these rules are TypeScript hub-specific placements.

* **DO: Keep `actions/` root for Stream Deck action entry files and their direct tests only**: Files in the root should correspond to an action button/class or the shared action base.
  - Good: `actions/cpu-usage.ts`, `actions/disk.ts`, `actions/metric-action.ts`
  - Bad: `actions/update-queue.ts`, `actions/color-utils.ts`, `actions/render-plan.ts`

* **DO: Put action-specific support code under an action domain subdirectory**:
  - Good: `actions/disk/metric-subscriptions.ts`, `actions/network/view-builder.ts`
  - Bad: `actions/disk-metric-subscriptions.ts`, `actions/net-speed-display.ts`

* **DO: Keep metric view update workflow outside `actions/`**: Queueing, runner, dispatch, performance stats, and runner-facing update state belong under `view-updates/`.
  - Good: `view-updates/runner.ts`, `view-updates/update-queue.ts`, `view-updates/dispatch.ts`
  - Bad: putting these files in `actions/` because actions call them.

* **PREFER: Keep React Property Inspector code under composition-oriented folders**: Use `controls`, `panels`, `previews`, `inspector`, `stream-deck`, `testing`, and similarly concrete folders. Do not restore schema-driven UI registries or generic field buckets.

* **DO: Keep rendering layers separate**: SVG composition belongs in `view-rendering/`; low-level widget primitives and icon catalogs belong in `widgets/`; metric value formatting and `WidgetData` builders belong in `metrics/`; polling, stores, registries, and source adapters belong in `runtime/`; settings codec/resolver/defaults belong in `settings/`.
