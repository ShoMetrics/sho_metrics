---
name: coding-style
description: Use when writing, reviewing, or changing code in this repo for language-neutral naming, ownership boundaries, comments/documentation, test structure, exception scope, and avoiding speculative abstractions; pair with language-specific skills such as typescript-coding-style or csharp-coding-style when applicable.
---

# Coding Style

Use this skill for language-neutral naming, comments, tests, and ownership decisions.

Examples below use TypeScript because these rules were split from `typescript-coding-style`; apply them to other languages with idiomatic syntax and the language-specific skill where it says otherwise.

Keyword meaning within each section:

* **DO**: Mandatory; almost never a valid reason to stray.
* **DON'T**: Prohibited; almost never do.
* **PREFER**: Default choice; follow unless justified.
* **AVOID**: Discouraged; skip unless justified.
* **CONSIDER**: Optional; use based on context.

## 1. Type Safety Boundary

* **DO: Use the strongest truthful type available**: Use precise domain types after boundaries and unknown only for truly untrusted values.
  - Good: `function resolveSettings(settings: WidgetStoredSettings) { ... }`
  - Acceptable: `function readSettings(rawSettings: unknown) { ... }`
  - Bad: `function readSettings(rawSettings: any) { ... }`

* **AVOID: Unnecessary defensive code, such as guard checks on values whose type already excludes `null` and `undefined`**: If a guard feels necessary, check whether the type is lying or whether the value should be narrowed earlier at the boundary. Guards are fine for untrusted input, SDK/API payloads, DOM lookups, `Map.get`, and other real nullable sources.
  - Good: check the result of `activeActionStates.get(actionId)`.
  - Bad: `if (!settings) return;` when `settings: ResolvedWidgetSettings`.

* **AVOID: Speculative generics**: Use concrete domain types unless a type parameter captures a real input/output relationship that a concrete type cannot express, or multiple distinct callers with different type arguments already exist in the codebase.
  - Good: `class RingBuffer<T> { ... }`
  - Good: `function resolveSettings(settings: WidgetStoredSettings): ResolvedWidgetSettings`
  - Bad: `function resolveSettings<TSettings, TResult>(settings: TSettings, resolver?: Resolver<TSettings, TResult>): TResult`

* **DO: Handle broad catches explicitly**:
  - Good: `catch (error) { log.warn("Failed to read settings", error); return defaultSettings; }`
  - Bad: `catch {}`

* **PREFER: Keep `try` blocks focused on the operation that can throw**:
  - Good: parse inside `try`, then handle normal state updates after the `catch`.
  - Bad: wrap parsing, validation, state mutation, rendering, and logging in one broad `try`.

* **AVOID: Storing derived state unless caching or invalidation is justified**:
  - Good: compute `averageUsage` from current samples when rendering.
  - Bad: store `total`, `count`, and `average` separately without invalidation.

## 2. Naming Boundary

* **DO: Use terms consistently for the same concept**:
  - Good: `pollingIntervalMilliseconds` everywhere.
  - Bad: mixing `pollDelayMs`, `refreshInterval`, and `sampleRate` for the same value.

* **DO: Put the most descriptive noun last**:
  - Good: `retryLimit`, `pageCount`, `metricStore`
  - Bad: `limitRetry`, `numPages`, `storeMetric`

* **DO: Use names that expose ownership and responsibility**:
  - Good: `MetricStore`, `ActionSettingsResolver`, `MetricViewPerformanceStats`
  - Bad: `MetricDataManager`, `SettingsHelper`, `DisplayUtils`

* **DON'T: Introduce vague primary names**: Avoid `model`, `data`, `input`, `request`, `config`, `info`, `helper`, `utils`, `manager`, `display`, and `service` unless the domain meaning is precise and already established.

* **DON'T: Use common UI component suffixes for non-UI workflow objects**:
  - Good: `RenderPlan` for render workflow data.
  - Bad: `RenderProps` unless it is actually React props.

* **DO: Name booleans to avoid double negatives**: Prefer positive predicates, but use a negative predicate when it names the domain state more directly. The point is to avoid call sites such as `!isNotReady`, not to force every boolean into a positive shape. Additionally, good names tend to start with one of a few kinds of verbs:
  * a form of "to be": isEnabled, wasShown, willFire. These are, by far, the most common.
  * an auxiliary verb: hasElements, canClose, shouldConsume, mustSave.
  * an active verb: ignoresInput, wroteFile

  - Good: `isEnabled`, `hasData`, `canRender`, `shouldPoll`, `isDisposed`
  - Bad: `disabled`, `notReady`, `empty`, `!isNotReady`

* **DO: Use imperative verbs for functions that cause side effects**:
  - Good: `clearMetricState()`, `writeSettings()`
  - Bad: `data()`, `process()`

* **PREFER: Match value-returning names to the kind of work**: Use noun phrases for cheap accessors or snapshots, and precise verbs for computed, parsed, built, resolved, read, or fetched results.
  - Good: `settingsSnapshot()` for a cheap stored value, `resolveSettings()` for applying defaults and context.
  - Bad: `getSettings()` when it hides build, resolve, fetch, or cache behavior.

* **AVOID: Generic `get` when a precise project or API word exists**:
  - Good: `readStoredSettings()`, `fetchDeviceInfo()`, `resolveSettings()`
  - Bad: `getData()`, `getInfo()`, `getSettings()` outside SDK/API precedent.

* **PREFER: Use established domain words over invented abstraction words**:
  - Good: `WidgetSettings`, `MetricStore`, `ActionState`
  - Bad: `WidgetConfigModel`, `MetricService`, `ActionDataHelper`

* **AVOID: Unfamiliar abbreviations**:
  - Good: `settings`, `previousValue`, `networkInterface`
  - Bad: `cfg`, `prev`, `netIf`
  Common project terms such as `svg`, `url`, `id`, `cpu`, `gpu`, and `ram` are allowed.

## 3. Directory Ownership Boundary

* **DO: Treat directories as ownership boundaries, not buckets for vaguely related code**: Put files where the owner of the responsibility is obvious from the path.
  - Good: `actions/disk/view-builder.ts` for disk-action-specific view assembly.
  - Bad: `actions/view-update-queue.ts` when the queue is a shared metric view workflow, not a Stream Deck action.

* **AVOID: Creating new `shared`, `common`, or `utils` folders unless the contents are narrowly named and have multiple real owners**: If such a folder grows, split by responsibility before adding more files.

* **DON'T: Add a new directory rule for every file**: Directory rules should express ownership and direction of dependencies, not become a full file placement table.

## 4. Style And Documentation Boundary

* **DO: Treat exported and public APIs as commitments**:
  - Good: keep file-local helpers unexported until another module needs them.
  - Bad: export helpers "for flexibility" before there is a real caller.

* **PREFER: Put constants at the narrowest stable scope nearest to their use**: Use module-level `CONSTANT_CASE` for shared configuration, expensive objects, or values that need stable identity; put helper-private module constants immediately before the helper that uses them, not at the file top. Put file-wide constants near the top only when multiple declarations across the file use them. Use local camelCase constants for cheap values that only serve one function, and keep local declarations near the logic they support.
  - Good: helper-private `const ALLOWED_POLLING_FREQUENCY_SECONDS = new Set([...]);` immediately before `resolvePollingIntervalMilliseconds()`.
  - Good: file-wide `const log = logger.for("MetricAction");` near the top when the class and helpers may log through it.
  - Good: local `const fallbackLabel = "-"` inside the one function that formats it.
  - Bad: move a helper-private `DEFAULT_TIMEOUT_MS` to the file top just because it is module-level.
  - Bad: use a module-level `DEFAULT_TIMEOUT_MS` in a function and declare it later in the file.

* **PREFER writing doc comments for public APIs**:  You don't have to document every single library, top-level variable, type, and member, but you should document most of them. 

* **PREFER writing doc comments for private APIs**: Doc can also be helpful for understanding private members that are called from other parts of the library. Write TsDOC or C# XML doc comments for any private member that isn't immediately obvious.

* **DO: Write comments that makes sense**: Write comment that actually explain the code, not just restate it. 
  - Good: `const DEFAULT_TIMEOUT_MS = 5000;` <- ok to omit a comment when the name is clear, usgae is simple and the value is not exported.
  - Good: `/** The default timeout in milliseconds. \n Note that due to tech debt, the default is not observed when a custom http action is created. */ const DEFAULT_TIMEOUT_MS = 5000;` <- good to add a comment to explain the non-obvious details.
  - Bad: `/** The default timeout in milliseconds. */ const DEFAULT_TIMEOUT_MS = 5000;`

* **AVOID: Growing optional parameters or options bags for unrelated modes**: When combinations matter, use a named input type, split the function, or model the cases explicitly.
  - Good: `buildMetricView(input: MetricViewInput)`
  - Bad: `buildMetricView(store, options?, overrides?, context?)`

* **AVOID: Static-only classes as namespaces**:
  - Good: exported functions and constants from a module.
  - Bad: `class ColorUtils { static normalize(...) { ... } }`

* **DO: Keep getters side-effect-free and unsurprising**:
  - Good: `get latestSample(): MetricSample`
  - Bad: `get nextMessage()` that performs I/O, writes state, or starts expensive work.

* **DO: Preserve comments that explain contracts, units, ordering, invariants, intent, or technical debt**: Delete comments only when they merely restate the name or implementation. Use TSDoc for exported API documentation that should appear in IDEs, and ordinary `//` comments for local implementation notes or technical debt that should stay near the code without becoming API docs. When changing behavior, update or delete nearby comments in the same edit.
  - Good: `progress: number; // 0.0-1.0 normalized`
  - Bad: `/** Returns true. */ function isEnabled(): boolean`

## 5. Test Boundary

* **PREFER: Structure multi-step tests as prepare, execute, and verify blocks separated by blank lines**: Do not add comments that only label the blocks. Multiple execute/verify cycles are acceptable when the test naturally checks a sequence. Keep compact one-line assertions when the subject call is trivial and the expected value is immediately readable.
  - Good:

    ```ts
    const settings = createWidgetSettings();
    const action = createMetricAction();

    action.applySettings(settings);

    assert.deepEqual(action.currentSettings(), settings);
    ```
  - Good: `assert.deepEqual(detectFontScriptsFromSvg(buildTextSvg("CPU 42%")), []);`
  - Bad: interleave setup, action, and assertions in a multi-step behavior test without visual separation.

* **PREFER: Let test-local values use inference when the type is obvious**: Keep explicit types for helper signatures, fixture contracts, empty collections, and complex values where the annotation catches refactor mistakes.
  - Good: `const actionId = "action-1";`
  - Bad: `const actionId: string = "action-1";`
