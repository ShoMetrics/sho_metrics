# Production Readiness Testing Audit

Date: 2026-05-30

This audit covers the full repository current working tree. It is a testing plan, not a test implementation. The target is meaningful release confidence for prod, not 100% coverage.

## Scope Decisions

- Add a small Property Inspector DOM test stack.
- Add Windows helper named-pipe/gRPC integration smoke in CI.
- Keep true Stream Deck device automation out of CI gates.
- Treat coverage as a guardrail. Do not chase high global coverage, but do require a measured baseline and a modest floor after tooling exists.
- Add a release manual verification checklist for hardware, driver, helper install, Control Panel, and real Stream Deck scenarios.
- Keep site/docs checks to build, link, and content smoke.
- Do not target `.mjs` diagnostic or benchmark scripts for direct test coverage unless they become release pipeline entry points.
- Hub coverage baseline uses Node's built-in `node:test` coverage path first.
- Windows coverage baseline uses `coverlet.collector` with `dotnet test --collect:"XPlat Code Coverage"`.
- Windows helper named-pipe/gRPC smoke lives in a separate integration test project.
- PI DOM tests are split into `test:pi` first; merge into `test:unit` only after setup cost and isolation are proven stable.
- Initial coverage floors are derived from measured baseline. Start with a regression guard such as baseline minus 2 percentage points per critical surface, then ratchet only after real risk-driven tests land.
- The manual release checklist should become a tracked Markdown release checklist.

## Current Evidence

Hub uses React 19 (`packages/hub/package.json`) with TypeScript 5.2 and Node 24 in CI. The existing unit runner is `node:test` via:

```text
tsc -p tsconfig.test.json
node --test --test-isolation=none .test-dist/src/**/*.test.js
```

There is no current `jsdom`, `happy-dom`, `@testing-library/react`, or `@testing-library/user-event` dependency. Existing PI component tests such as `packages/hub/src/property-inspector/App.test.ts` and `packages/hub/src/property-inspector/panels/WidgetSettingsTab.test.ts` use `renderToStaticMarkup`, so they verify initial markup but not interaction, state, effects, settings saves, focus, keyboard behavior, or runtime cache updates.

Hub test distribution by area:

| Area | Production files | Test files |
| --- | ---: | ---: |
| actions | 16 | 11 |
| color-compensation | 6 | 3 |
| logging | 1 | 1 |
| metrics | 12 | 6 |
| property-inspector | 52 | 11 |
| runtime | 39 | 25 |
| settings | 16 | 8 |
| shared | 4 | 3 |
| view-rendering | 19 | 12 |
| view-updates | 6 | 4 |
| widgets | 34 | 8 |

Windows source test distribution by project:

| Project | Production files | Test files |
| --- | ---: | ---: |
| Contracts | 3 | 0 |
| ControlPanel | 11 | 0 |
| ControlPanel.Tests | 0 | 2 |
| Core | 39 | 0 |
| Core.Tests | 0 | 9 |
| Diagnostics | 7 | 0 |
| Diagnostics.Tests | 0 | 2 |
| Helper | 2 | 0 |
| Service | 16 | 0 |
| Service.Tests | 0 | 7 |

CI currently runs Hub proto lint/build, lint, unit tests, build, and Playwright visual tests. Windows CI runs lint and `dotnet test ShoMetrics.Source.Windows.slnx --configuration Release --no-restore` on `windows-latest`. Site preview builds Hugo 0.161.1 and uploads a preview artifact.

Hub coverage baseline is not currently collectable with a checked-in command. The approved first path is Node built-in `node:test` coverage.

Windows coverage is now collectable through `coverlet.collector` on the four current Windows test projects:

- `ShoMetrics.Source.Windows.ControlPanel.Tests`
- `ShoMetrics.Source.Windows.Core.Tests`
- `ShoMetrics.Source.Windows.Diagnostics.Tests`
- `ShoMetrics.Source.Windows.Service.Tests`

A local raw pre-exclusion run with `dotnet test ShoMetrics.Source.Windows.slnx --configuration Release --no-restore --collect:"XPlat Code Coverage"` produced Cobertura XML for all four test projects. These numbers prove the collector is wired, but should not become thresholds until exclusions and surface ownership are finalized:

| Test project | Raw line rate | Raw branch rate |
| --- | ---: | ---: |
| ControlPanel.Tests | 9.39% | 5.95% |
| Service.Tests | 8.75% | 5.64% |
| Core.Tests | 61.00% | 50.00% |
| Diagnostics.Tests | 86.48% | 70.83% |

## Release Risk Ranking

### P0: Settings Storage, Resolver, And Sparse Patch Contracts

Files:

- `packages/hub/src/settings/storage/codec.ts`
- `packages/hub/src/settings/storage/resolver.ts`
- `packages/hub/src/settings/storage/widget-settings-patch.ts`
- `packages/hub/src/settings/storage/global-settings-patch.ts`
- `packages/hub/src/property-inspector/settings-sync/usePropertyInspectorSettings.ts`
- `contracts/proto/shometrics/v1/settings.proto`

Risk: persisted settings are the user's long-lived data contract. Resolver behavior also controls platform gating, default fallbacks, helper-backed readings, labels, units, scale, colors, global overrides, and render planning. `resolver.ts` is already large; do not add more behavior to it without either focused tests or later modularization.

Add tests:

- Corrupt or unknown stored widget/global settings decode to defaults and produce the expected warning notice.
- Saving a PI widget change writes a sparse patch, not a fully resolved default object.
- Unknown future fields are discarded only on save, and warnings remain user-visible before save.
- Global view/theme/paint overrides resolve correctly and do not leak into stored widget patches.
- Windows-only CPU/GPU/disk helper readings fall back to supported readings on non-Windows.
- Catalog metric label, unit, custom maximum, category, and reading kind resolve from stored settings without requiring runtime source parsing.
- Generated proto enum defaults map to explicit runtime defaults; unknown or unspecified values do not create impossible runtime states.

Framework: keep `node:test` for pure settings tests. These are fast and deterministic and should remain in `npm.cmd run test:unit`.

Do not test: generated protobuf classes directly, trivial constants, or every color value permutation. Test contract boundaries and representative high-risk branches.

### P0: Source API, Proto, And Version-Skew Boundaries

Files:

- `contracts/proto/shometrics/v1/helper_grpc_service.proto`
- `packages/hub/src/runtime/sources/source-client.ts`
- `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-api-mapper.ts`
- `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-client.ts`
- `packages/source-windows/ShoMetrics.Source.Windows.Service/SourceProtocolMapper.cs`
- `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsGrpcMetricSourceService.cs`
- `packages/source-windows/ShoMetrics.Source.Windows.Service/MetricRefreshDemandRequestValidator.cs`

Risk: this is the Hub/helper contract. Recent history shows heavy churn in source API, helper guidance, demand-driven refresh, retained readings, component status, and protocol mismatch behavior. Bugs here become silent no-data, wrong fallback, stale display, or broken helper compatibility.

Add tests:

- `MetricUnavailableReason.PENDING_REFRESH` maps end-to-end to runtime `pendingRefresh` and renders as waiting/pending, not as install-helper or choose-metric.
- Unknown enum/default proto values map to `unknown` or safe defaults with warnings where the owner boundary can log.
- A requested metric id appears in exactly one of `value_attributions`, `unavailable_metrics`, or `snapshot.metrics`; conflicting source responses are handled deterministically.
- Missing nested messages (`snapshot`, `descriptor_snapshot`, `captured_at`) fail as source errors instead of producing partial runtime data.
- Protocol mismatch sets unsupported status and retry cooldown, and later recovery can clear it.
- Component status for `driver:pawnio` is consumed structurally; no warning-text parsing is allowed.
- Refresh demand validator rejects duplicate polling groups, blank/control-character ids, oversized group counts, metric counts, and identifier byte totals.

Framework: `node:test` for Hub mapper/client behavior using fake transports and clocks; xUnit v3 for C# mapper, validator, service status mapping, and request handler behavior.

Do not test: generated proto serialization internals. The test owner is the adapter boundary that converts proto into runtime or service models.

### P0: Windows Helper Named-Pipe/gRPC Smoke

Files:

- `packages/source-windows/ShoMetrics.Source.Windows.Service/Program.cs`
- `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsPipeSecurity.cs`
- `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsPipeClientVerifier.cs`
- `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsGrpcMetricSourceService.cs`
- `packages/hub/src/runtime/sources/windows-helper/windows-helper-grpc-transport.ts`

Risk: current tests call service methods in-process. They do not prove Kestrel named-pipe hosting, gRPC serialization, max message configuration, local-client verification, or grpc-js target formatting together.

Add one bounded CI smoke:

- Start a test service host or service process in dev-pipe mode using a unique pipe name when implementation allows it.
- Connect with a real gRPC client over named pipe.
- Execute one minimal successful RPC, preferably `GetSourceHealth`.
- Execute one expected failure or malformed request if it does not add flake.
- Shut down cleanly and dispose the channel.
- Enforce a 5-10 second timeout around start, request, and shutdown.
- Retry only the startup connect step briefly to absorb pipe creation timing.
- On failure, capture service stdout/stderr and the service log path as CI artifacts.

Framework: xUnit v3 on Windows CI in a dedicated `ShoMetrics.Source.Windows.Service.IntegrationTests` project. Keep deep request cases in in-process xUnit tests; the cross-process test should remain small.

Do not gate CI on real hardware sensors, PawnIO presence, service installation, or LocalSystem elevation. Those belong in manual release verification.

### P0: Runtime Collection, Fallback, Demand, And Metadata Invalidation

Files:

- `packages/hub/src/runtime/metric-collection/*`
- `packages/hub/src/runtime/source-routing/*`
- `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-client.ts`
- `packages/hub/src/actions/metric-action.ts`
- `packages/hub/src/runtime/widget-runtime-cache.ts`

Risk: recent commits added demand-driven collection, helper descriptor metadata, fallback behavior, retained readings, and user guidance. These are release-critical because they determine what the user sees when helper data is late, unavailable, retained, or unsupported.

Existing runtime tests are stronger than PI tests, but add targeted cases:

- Source metadata invalidation from descriptor loaded/changed forces plan rebuild without requiring action restart.
- Pending helper descriptor metadata does not create one runner per unknown sensor id.
- Retained helper values update current display but do not append to real history.
- Helper `setMetricRefreshDemand` is renewed, deduplicated, retried after recovery, and cleared when no helper-backed keys remain.
- Invalid demand requests become control-plane errors, not ordinary source fallback.
- Built-in source fallback still works when helper is missing, stopped, protocol-mismatched, or stale.
- Action disappear/dispose stops subscriptions, runners, and demand renewal.

Framework: `node:test` with fake timers, fake source clients, and fake Stream Deck action events. These remain CI unit/integration tests, not E2E.

### P0: Property Inspector DOM Tests

Files:

- `packages/hub/src/property-inspector/App.tsx`
- `packages/hub/src/property-inspector/settings-sync/usePropertyInspectorSettings.ts`
- `packages/hub/src/property-inspector/controls/SelectSetting.tsx`
- `packages/hub/src/property-inspector/controls/NumberSetting.tsx`
- `packages/hub/src/property-inspector/components/SteppedSlider.tsx`
- `packages/hub/src/property-inspector/panels/WidgetSettingsTab.tsx`
- `packages/hub/src/property-inspector/panels/PluginSettingsTab.tsx`
- `packages/hub/src/property-inspector/color-compensation/ColorCompensationWizard.tsx`

Risk: current SSR tests cannot run `useEffect`, async Stream Deck loads, user input, focus, keyboard navigation, disabled states, or save failures. These are exactly where PI regressions will occur.

Recommended stack:

- `@testing-library/react`
- `@testing-library/user-event`
- `jsdom`
- existing `node:test`

React 19 requires a Testing Library version that supports React 19. Do not install an older RTL major. Use `happy-dom` only as a speed-oriented alternative if `jsdom` startup becomes a measured CI problem; default to `jsdom` because RTL support and browser API parity are more mature.

Implementation requirements for the future test task:

- Add a test setup module loaded by the Node test command, for example with `--import`.
- Create one `jsdom` window/document per test or reset the shared document rigorously.
- Because current runner uses `--test-isolation=none`, every DOM test must call `afterEach(cleanup)` and clear globals/listeners to avoid cross-test leakage.
- Update `tsconfig.test.json` so PI `.test.tsx` files compile and are included in `.test-dist/src/**/*.test.js`.
- Add a separate `test:pi` script first. Merge it into `test:unit` only after runtime cost and DOM global isolation are proven stable.

Small DOM suite to add:

- App loads connection info, widget settings, and global settings; default Widget tab becomes interactive after async load.
- Selecting a metric/read mode through `SelectSetting` calls `setSettings` with the expected sparse patch.
- Keyboard navigation in custom select skips disabled options, supports Arrow/Home/End/Enter/Escape, and preserves focus after commit.
- `NumberSetting` optional input writes `undefined` for empty values and restores formatted value on blur.
- Global override toggles disable/enable the correct widget controls and save through `setGlobalSettings`.
- Helper unavailable/stopped/protocol mismatch guidance chooses the right user-facing path without relying on warning text.
- Runtime cache updates after initial render update catalog picker and helper status UI.
- Color compensation wizard writes and resets a profile through global settings.

Do not add a large browser-style PI matrix. This should be a small interaction suite focused on state and data writes.

Why not Vitest first: it would replace the runner, duplicate Node test conventions, and require a second assertion/mocking ecosystem. The current runner is sufficient if jsdom bootstrap is explicit.

Why not Playwright Component Testing first: it is heavier, overlaps with visual tests, and is better reserved for true layout/browser visual behavior.

### P1: Rendering, Widgets, And Visual Regression

Files:

- `packages/hub/src/view-rendering/*`
- `packages/hub/src/widgets/*`
- `packages/hub/tests/visual/*`
- `packages/hub/playwright.visual.config.ts`

Risk: widget visuals are user-visible and already have a Playwright visual suite. Do not introduce a second visual framework.

Add tests only where they protect release behavior:

- No-data, pending-refresh, install-helper, choose-metric, and unavailable notices render distinct representative outputs.
- Retained values show continuity without pretending to be fresh history.
- A small pixel-bound smoke for representative text layouts if rendering-performance changes touch font/layout code.
- Visual matrix manifest coverage remains auditable for supported themes/views.

Framework: existing Playwright visual suite plus existing unit tests for pure render model builders.

Do not test every color/theme/metric permutation unless a matrix axis is intentionally supported and already manifest-driven.

### P1: Windows Core, Diagnostics, And Control Panel

Files:

- `packages/source-windows/ShoMetrics.Source.Windows.Core/*`
- `packages/source-windows/ShoMetrics.Source.Windows.Diagnostics/*`
- `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/*`

Risk: Core owns hardware sensor selection, retention, descriptors, and refresh demand. Control Panel owns user diagnosis when helper/driver is broken.

Add tests:

- Stable built-in metric aliases include every intended CPU/GPU/RAM/disk/network key.
- Sensor ranking rejects invalid values and prefers usable stable aliases.
- Retention emits fresh/retained/expired/unavailable states with correct ages.
- Demand application clamps intervals, expires stale demand, ignores unknown groups safely, and reports accepted/ignored counts.
- PawnIO diagnostic exceptions surface as structured warnings/component status without crashing health.
- Control Panel status reader covers service installed/running/stopped/not installed plus helper unavailable/protocol mismatch/driver unavailable.
- Copy diagnostics contains bounded support text and does not depend on UI automation.

Framework: xUnit v3. Keep WinUI pixel automation out of CI. Test view-model/status formatting logic, and cover actual window behavior manually.

### P2: Site And Docs

Files:

- `site/hugo.toml`
- `site/content/**`
- `site/layouts/**`
- `.github/workflows/site-preview.yml`

Risk is low compared with runtime and helper. Current site workflow builds Hugo and uploads preview.

Add only lightweight checks:

- Hugo build with path warnings enabled if compatible with current Hugo version.
- Link smoke for internal content links.
- Content smoke for required pages: install, download, troubleshooting, helper FAQ, color compensation tutorial.

Do not add app-level DOM tests for the site.

### P2: Scripts

Files:

- `packages/hub/scripts/*.mjs`
- diagnostic and benchmark `.mjs` scripts

Do not add direct tests for diagnostic or benchmark scripts. They are not product behavior. If a script is part of release, build, package, or generation, cover it through the owning pipeline smoke instead.

## Coverage Strategy

Current state: Windows coverage collection is installed and verified. Hub coverage still needs a checked-in command. The raw Windows coverage numbers are not yet policy baselines because exclusions and per-surface grouping still need to be defined.

Future baseline collection:

- Hub: use Node's built-in `node:test` coverage path first and validate that reports map back to TypeScript source rather than only `.test-dist`.
- Windows: keep `coverlet.collector` in test projects and collect with `dotnet test --collect:"XPlat Code Coverage"`.
- Store the first baseline number in CI output and in this document or a follow-up decision note.

Threshold policy:

- Do not set one global repo threshold before baseline exists.
- Set per-surface thresholds only after baseline is measured.
- Initial thresholds should start as a regression guard, for example baseline minus 2 percentage points for each critical surface.
- Ratchet thresholds only after real risk-driven tests land.
- Minimum candidates after baseline: Hub source, Windows Core/Service, Windows ControlPanel status logic. Exclude generated contracts, visual snapshot files, docs/site assets, build artifacts, test helpers, and diagnostic/benchmark `.mjs` scripts.
- Add a rule that threshold increases require tests that assert behavior at a boundary. Do not accept tests that only import modules, assert existence, snapshot huge structures blindly, or duplicate implementation constants without exercising decisions.

Fake-test guard:

- Every new test should name the behavior risk in the test name.
- Prefer one failing invariant over broad shallow assertions.
- Use fakes at owned boundaries: fake Stream Deck client, fake source client, fake clocks, fake timers, fake gRPC handler.
- Avoid tests that mock the unit under test's own private logic.

## CI Gate Proposal

Keep existing gates:

- Hub lint, unit, build, proto lint/build.
- Windows lint and xUnit.
- Existing Playwright visual job.
- Site preview build.

Add after implementation:

- `test:pi` with jsdom setup and Testing Library.
- Windows helper named-pipe/gRPC smoke on Windows CI only.
- Coverage collection job or reporting step once tooling is selected.
- Site link/content smoke in site preview workflow.

Do not gate on:

- Real Stream Deck device automation.
- Real PawnIO driver installation.
- Full helper install/uninstall.
- Real hardware sensor matrix.
- Visual snapshot update.

## Manual Release Checklist

Run before prod release:

- Install clean build on Windows 11 and one additional supported Windows version if available.
- Verify Stream Deck plugin loads, PI opens, first paint succeeds, and settings save/reopen.
- Verify helper not installed, helper stopped, helper running, helper protocol mismatch, and helper unavailable guidance.
- Verify helper install/start/restart/uninstall paths.
- Verify PawnIO not installed, not elevated, unusable, and OK states in Control Panel.
- Verify Control Panel opens logs, copies diagnostics, and shows helper version/protocol/descriptor counts.
- Verify CPU, GPU, RAM, disk, network built-in widgets display meaningful values or correct unavailable notices.
- Verify one advanced sensor selection survives Stream Deck restart.
- Verify pending refresh transitions to value after helper warmup.
- Verify retained values do not create misleading history spikes.
- Verify fallback to built-in Node sources when helper is unavailable.
- Verify 16-32 visible keys for several minutes without runaway CPU, memory growth, or log spam.
- Verify macOS or non-Windows behavior hides/blocks Windows-only helper readings and still supports built-in metrics.
- Verify site install/troubleshooting/helper docs match current product behavior.

## Locked Decisions

- Hub coverage baseline starts with Node built-in `node:test` coverage. If TypeScript source mapping or exclude handling is not usable, switch to `c8` as the documented fallback.
- Windows coverage baseline uses `coverlet.collector` and `dotnet test --collect:"XPlat Code Coverage"`.
- Windows helper named-pipe/gRPC smoke gets a separate `ShoMetrics.Source.Windows.Service.IntegrationTests` project.
- PI DOM tests start as a separate `test:pi` script and CI step.
- Coverage floors are not fixed percentages before baseline. After baseline, use per-surface baseline minus 2 percentage points as the first hard regression guard, then ratchet only after meaningful tests land.
- Manual release verification becomes a tracked Markdown checklist, recommended path: `docs/release/manual-verification-checklist.md`.

## File-by-File Audit Matrix

The file-by-file audit is tracked in [testing-file-by-file-audit.md](./testing-file-by-file-audit.md). That matrix records every current production/release-bearing file in scope, its owner boundary, existing test evidence, production-readiness test decision, CI gate, priority, and logical commit group.

Implementation should be split into the following logical commits. These groups are intentionally not interchangeable; do not merge two groups unless the file-by-file matrix proves they share the same owner, runner, CI gate, and failure mode.

1. Coverage infrastructure baseline.
   - Hub Node coverage spike; Windows collector is already installed, so finish exclusions, CI/reporting, and baseline capture.
   - Reason to keep separate: coverage tooling changes CI and reporting, but should not add product behavior tests in the same commit.

2. PI DOM test infrastructure.
   - `test:pi`, jsdom setup, Testing Library dependencies, cleanup/isolation, `.test.tsx` compile inclusion.
   - Reason to keep separate: this changes the frontend test runtime and can fail independently of PI behavior.

3. PI interaction coverage.
   - App load, settings patch writes, custom select keyboard behavior, optional number input, global override behavior, runtime cache updates, helper guidance, color compensation profile save/reset.
   - Reason to keep separate: this verifies PI behavior after the DOM stack exists; it should not hide setup regressions.

4. Settings and persisted contract coverage.
   - Storage codec/resolver, sparse patches, unknown field warnings, global overrides, helper-backed reading defaults, catalog display hints.
   - Reason to keep separate: persisted data ownership is the release-critical storage boundary and should review as one contract.

5. Source API and helper contract coverage.
   - Proto adapter behavior, source API mapper, version skew, pending refresh, value attribution/unavailable conflicts, refresh demand validation.
   - Reason to keep separate: this is the Hub/helper wire boundary, distinct from runtime planning and distinct from transport smoke.

6. Runtime collection, fallback, and demand coverage.
   - Source metadata invalidation, helper descriptor preload, retained values, demand renewal/clear/recovery, action disposal cleanup, built-in fallback.
   - Reason to keep separate: this is runtime state ownership. Mixing it with source API mapper tests makes failures harder to localize.

7. Windows helper integration smoke.
   - Dedicated integration test project, named-pipe/gRPC startup, one minimal RPC, bounded timeout/retry, diagnostics capture.
   - Reason to keep separate: this is cross-process transport confidence, not business logic coverage.

8. Windows Core, Diagnostics, and Control Panel coverage.
   - Stable aliases, sensor ranking, retention, demand application, PawnIO diagnostic handling, Control Panel status and diagnostic text.
   - Reason to keep separate: this stays inside Windows-owned source and supportability behavior, without changing Hub runtime tests.

9. Rendering, visual, and no-data coverage.
   - Representative render model tests, existing Playwright visual suite expansion only where needed, no-data/pending/unavailable notice outputs.
   - Reason to keep separate: visual snapshots and rendering expectations have their own review flow and should not be bundled with runtime/source logic.

10. Site/docs smoke and manual release checklist.
    - Hugo/link/content smoke and `docs/release/manual-verification-checklist.md`.
    - Reason to keep separate: docs/site/release process changes should not be hidden inside product test commits.

## Verification Notes

Commands inspected for this audit:

- `git status --short`
- `git log --oneline --all --decorate=short`
- `rg --files`
- Hub and Windows test inventories
- `packages/hub/package.json`
- `packages/hub/tsconfig.test.json`
- `packages/hub/playwright.visual.config.ts`
- `.github/workflows/hub-ci.yml`
- `.github/workflows/source-windows-ci.yml`
- `.github/workflows/site-preview.yml`
- `packages/source-windows/ShoMetrics.Source.Windows.slnx`
- relevant `docs/development/**`

The exact PowerShell command using `rg --files packages\hub\src | rg "\.test\.tsx?$"` returned no matches in this shell form because piped Windows line endings keep `\r` before the `$` anchor. Equivalent inventories without the end anchor found the Hub test files and produced the distribution table above. The same shell-form issue affected the Windows exact regex form; equivalent recursive file inventory was used for the table.
