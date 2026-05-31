# Production Readiness Testing Audit

Date: 2026-05-30

This is the active combined production-readiness testing audit. It supersedes the original high-level plan now archived at `docs/development/archive/testing-production-readiness-audit.md`.

This audit covers the full repository working tree and records the completed meaningful-test plan for prod readiness. It excludes generated output, build output, test files, snapshots, vendor assets, binary assets, diagnostic benchmark scripts, and package lock files unless the file is a release-bearing source/config entry.

## Scope Decisions

- Add a small Property Inspector DOM test stack.
- Add Windows helper named-pipe/gRPC integration smoke in CI.
- Keep true Stream Deck device automation out of CI gates.
- Treat coverage as a guardrail, with measured baselines and modest floors rather than 100% coverage.
- Add a tracked manual release checklist for hardware, driver, helper install, Control Panel, and real Stream Deck scenarios.
- Keep site/docs checks to build, link, and content smoke.
- Do not target `.mjs` diagnostic or benchmark scripts for direct test coverage unless they become release pipeline entry points.
- Keep PI DOM tests split into `test:pi`; merge into `test:unit` only after setup cost and isolation are proven stable.

## Inventory Summary

- Hub production source files: 205
- Windows production source/config files: 84
- Contract proto/config files: 5
- Site source files: 20
- Hub release/config/script files: 13
- CI workflow files: 3
- Matrix rows: 330
- Commit subject scan: 484 commit subjects via `git log --oneline --all --decorate=short` for risk grouping.

Excluded from the production matrix as test infrastructure found under source folders:

- `packages/hub/src/property-inspector/testing/test-context.ts`
- `packages/hub/src/runtime/sources/node-system/node-system-source-test-helpers.ts`

## Legend

- `P0`: release-blocking confidence gap before prod.
- `P1`: meaningful release confidence, but not the first gate to land.
- `P2`: smoke/config/release-process confidence only.
- `No direct test`: do not write a direct unit test; prove through build, owner tests, smoke, visual, or manual checklist.
- `G1` coverage infrastructure, `G2` PI DOM infrastructure, `G3` PI behavior, `G4` settings contract, `G5` source API/helper contract, `G6` runtime/action behavior, `G7` Windows helper integration smoke, `G8` Windows source/control-panel behavior, `G9` rendering/visual behavior, `G10` site/release/manual checklist.

## Matrix

| File | Owner / boundary | Existing evidence | Production-readiness test decision |
| --- | --- | --- | --- |
| `.github/workflows/hub-ci.yml` | CI workflow | Workflow execution only | P2 G10 CI: verify by workflow runs; add coverage/site/link/smoke jobs in grouped CI commits only. |
| `.github/workflows/site-preview.yml` | CI workflow | Workflow execution only | P2 G10 CI: verify by workflow runs; add coverage/site/link/smoke jobs in grouped CI commits only. |
| `.github/workflows/source-windows-ci.yml` | CI workflow | Workflow execution only | P2 G10 CI: verify by workflow runs; add coverage/site/link/smoke jobs in grouped CI commits only. |
| `contracts/proto/buf.lock` | Proto tooling config | Proto lint/build; adapter tests indirect | P2 G1 proto lint/build: no direct test; config is verified by existing proto CI. |
| `contracts/proto/buf.yaml` | Proto tooling config | Proto lint/build; adapter tests indirect | P2 G1 proto lint/build: no direct test; config is verified by existing proto CI. |
| `contracts/proto/shometrics/v1/settings.proto` | Settings storage contract | Proto lint/build; adapter tests indirect | P0 G4 proto lint/build + storage tests: cover sparse settings, defaults, unknown fields, and resolver mappings. |
| `contracts/proto/shometrics/v1/snapshot.proto` | Runtime snapshot contract | Proto lint/build; adapter tests indirect | P0 G5/G6 proto lint/build + runtime tests: cover no progress in source snapshots and metric unit/freshness mapping. |
| `contracts/proto/shometrics/v1/source_api.proto` | Source API contract | Proto lint/build; adapter tests indirect | P0 G5 proto lint/build + adapter tests: cover version skew, unavailable reports, value attribution conflicts, and demand messages. |
| `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json` | Stream Deck manifest | CI/build indirect | P0 G10 build/smoke: validate action UUIDs, PI paths, OS support, and layout references. |
| `packages/hub/com.ez.sho-metrics.sdPlugin/ui/property-inspector.css` | PI static host assets | CI/build indirect | P1 G3/G10 build/test:pi: covered by PI bootstrap and build; no separate DOM matrix. |
| `packages/hub/com.ez.sho-metrics.sdPlugin/ui/property-inspector.html` | PI static host assets | CI/build indirect | P1 G3/G10 build/test:pi: covered by PI bootstrap and build; no separate DOM matrix. |
| `packages/hub/eslint.config.mjs` | Hub build/test config | CI/build indirect | P2 G1/G10 CI: covered by lint/test/build/visual/coverage jobs; no direct unit tests. |
| `packages/hub/package.json` | Hub build/test config | CI/build indirect | P2 G1/G10 CI: covered by lint/test/build/visual/coverage jobs; no direct unit tests. |
| `packages/hub/playwright.visual.config.ts` | Hub build/test config | CI/build indirect | P2 G1/G10 CI: covered by lint/test/build/visual/coverage jobs; no direct unit tests. |
| `packages/hub/rollup.config.mjs` | Hub build/test config | CI/build indirect | P2 G1/G10 CI: covered by lint/test/build/visual/coverage jobs; no direct unit tests. |
| `packages/hub/scripts/clean-test-output.mjs` | Hub test/build script | CI/build indirect | P2 G1/G10 CI: cover through npm scripts; no direct script unit unless parsing/branching grows. |
| `packages/hub/scripts/proto/buf.gen.yaml` | Hub proto tooling script | CI/build indirect | P2 G1 proto lint/build: release pipeline smoke only; no direct script unit. |
| `packages/hub/scripts/run-buf.mjs` | Hub proto tooling script | CI/build indirect | P2 G1 proto lint/build: release pipeline smoke only; no direct script unit. |
| `packages/hub/scripts/write-test-package.mjs` | Hub test/build script | CI/build indirect | P2 G1/G10 CI: cover through npm scripts; no direct script unit unless parsing/branching grows. |
| `packages/hub/src/actions/catalog-metric.ts` | Stream Deck action lifecycle | Direct: catalog-metric.test.ts | P0 G6 test:unit: add/keep action lifecycle, settings reload, disappear cleanup, and no-data render behavior coverage. |
| `packages/hub/src/actions/cpu.ts` | Stream Deck action lifecycle | Direct: cpu.test.ts | P0 G6 test:unit: add/keep action lifecycle, settings reload, disappear cleanup, and no-data render behavior coverage. |
| `packages/hub/src/actions/disk.ts` | Stream Deck action lifecycle | Direct: disk.test.ts | P0 G6 test:unit: add/keep action lifecycle, settings reload, disappear cleanup, and no-data render behavior coverage. |
| `packages/hub/src/actions/disk/metric-subscriptions.ts` | Action domain builder | Area/indirect only | P1 G6 test:unit: keep domain subscription/view-builder cases for metric keys, dual channels, and fallback plans. |
| `packages/hub/src/actions/disk/view-builder.ts` | Action domain builder | Direct: view-builder.test.ts | P1 G6 test:unit: keep domain subscription/view-builder cases for metric keys, dual channels, and fallback plans. |
| `packages/hub/src/actions/disk/volume-selection.ts` | Action domain builder | Area/indirect only | P1 G6 test:unit: keep domain subscription/view-builder cases for metric keys, dual channels, and fallback plans. |
| `packages/hub/src/actions/gpu.ts` | Stream Deck action lifecycle | Direct: gpu.test.ts | P0 G6 test:unit: add/keep action lifecycle, settings reload, disappear cleanup, and no-data render behavior coverage. |
| `packages/hub/src/actions/memory.ts` | Stream Deck action lifecycle | Area/indirect only | P0 G6 test:unit: add/keep action lifecycle, settings reload, disappear cleanup, and no-data render behavior coverage. |
| `packages/hub/src/actions/metric-action.ts` | Stream Deck action lifecycle | Direct: metric-action.test.ts | P0 G6 test:unit: add/keep action lifecycle, settings reload, disappear cleanup, and no-data render behavior coverage. |
| `packages/hub/src/actions/network.ts` | Stream Deck action lifecycle | Direct: network.test.ts | P0 G6 test:unit: add/keep action lifecycle, settings reload, disappear cleanup, and no-data render behavior coverage. |
| `packages/hub/src/actions/network/metric-subscriptions.ts` | Action domain builder | Area/indirect only | P1 G6 test:unit: keep domain subscription/view-builder cases for metric keys, dual channels, and fallback plans. |
| `packages/hub/src/actions/network/view-builder.ts` | Action domain builder | Direct: view-builder.test.ts | P1 G6 test:unit: keep domain subscription/view-builder cases for metric keys, dual channels, and fallback plans. |
| `packages/hub/src/actions/settings/action-settings-resolver.ts` | Action settings boundary | Area/indirect only | P0 G4 test:unit: verify action settings resolver keeps stored settings sparse and action-domain specific. |
| `packages/hub/src/actions/shared/background-collection-binding.ts` | Action-runtime binding | Direct: background-collection-binding.test.ts | P0 G6 test:unit: keep fake Stream Deck action coverage for subscribe/unsubscribe and runtime cache writes. |
| `packages/hub/src/actions/shared/helper-backed-widget-data.ts` | Action widget-data adapter | Direct: helper-backed-widget-data.test.ts | P0 G6 test:unit: verify helper pending/unavailable/retained states map to render data without history mutation. |
| `packages/hub/src/actions/shared/resolved-metric-target.ts` | Action shared helper | Area/indirect only | P1 G6 test:unit: preserve resolver/display contract coverage; no broad shared option bags. |
| `packages/hub/src/color-compensation/messages.ts` | Color compensation domain | Direct: messages.test.ts | P1 G3 test:unit: keep reducer/message/transform behavior coverage; no direct test needed for pure types. |
| `packages/hub/src/color-compensation/patterns.ts` | Color compensation domain | Area/indirect only | P1 G3 test:unit: keep reducer/message/transform behavior coverage; no direct test needed for pure types. |
| `packages/hub/src/color-compensation/plugin-controller.ts` | Color compensation plugin controller | Area/indirect only | P1 G3 test:pi/test:unit: cover controller dispatch with fake Stream Deck client and profile save/reset failures. |
| `packages/hub/src/color-compensation/runtime-store.ts` | Color compensation domain | Direct: runtime-store.test.ts | P1 G3 test:unit: keep reducer/message/transform behavior coverage; no direct test needed for pure types. |
| `packages/hub/src/color-compensation/transform.ts` | Color compensation domain | Direct: transform.test.ts | P1 G3 test:unit: keep reducer/message/transform behavior coverage; no direct test needed for pure types. |
| `packages/hub/src/color-compensation/types.ts` | Color compensation domain | Area/indirect only | P1 G3 test:unit: keep reducer/message/transform behavior coverage; no direct test needed for pure types. |
| `packages/hub/src/env.d.ts` | Type environment facade | Area/indirect only | No direct test: type-only environment declarations; covered by TypeScript build. |
| `packages/hub/src/logging/logger.ts` | Hub logging wrapper | Direct: logger.test.ts | P1 G6 test:unit: preserve throttled/lazy logger behavior; prevent direct console/SDK logger use. |
| `packages/hub/src/metrics/byte-format.ts` | Metric formatting/widget-data | Area/indirect only | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/catalog-metric-scale.ts` | Metric formatting/widget-data | Direct: catalog-metric-scale.test.ts | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/catalog-metric-widget-data.ts` | Metric formatting/widget-data | Direct: catalog-metric-widget-data.test.ts | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/compact-number-format.ts` | Metric formatting/widget-data | Area/indirect only | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/gpu-power-widget-data.ts` | Metric formatting/widget-data | Direct: gpu-power-widget-data.test.ts | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/hardware-model-format.ts` | Metric formatting/widget-data | Area/indirect only | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/metric-unit-format.ts` | Metric formatting/widget-data | Direct: metric-unit-format.test.ts | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/network-ping-widget-data.ts` | Metric formatting/widget-data | Direct: network-ping-widget-data.test.ts | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/network-speed-widget-data.ts` | Metric formatting/widget-data | Area/indirect only | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/power-widget-data.ts` | Metric formatting/widget-data | Area/indirect only | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/storage-widget-data.ts` | Metric formatting/widget-data | Area/indirect only | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/metrics/temperature-widget-data.ts` | Metric formatting/widget-data | Direct: temperature-widget-data.test.ts | P1 G9 test:unit: add representative unit/edge cases where direct tests are missing; avoid duplicating constants. |
| `packages/hub/src/plugin.ts` | Hub plugin runtime | Area/indirect only | P0 G6 test:unit/build: add plugin lifecycle smoke around registration, runtime cache binding, and source startup errors. |
| `packages/hub/src/property-inspector/App.tsx` | Property Inspector shell/support | Direct: App.test.ts | P0 G3 test:pi: cover app bootstrap, stream-deck client integration, option updates, and context visibility where behavior exists. |
| `packages/hub/src/property-inspector/color-compensation/color-compensation-reducer.ts` | PI color compensation UI | Direct: color-compensation-reducer.test.ts | P1 G3 test:pi: cover wizard save/reset and reducer-driven steps; keep pure reducer tests separate. |
| `packages/hub/src/property-inspector/color-compensation/ColorCompensationWizard.tsx` | PI color compensation UI | Area/indirect only | P1 G3 test:pi: cover wizard save/reset and reducer-driven steps; keep pure reducer tests separate. |
| `packages/hub/src/property-inspector/components/InspectorItem.tsx` | PI presentational component | Area/indirect only | No direct test: label/layout wrapper; covered through PI DOM tests for controls and panels. |
| `packages/hub/src/property-inspector/components/NativeColorInput.tsx` | PI input wrapper | Area/indirect only | P1 G3 test:pi: cover through color-setting interaction; direct test only if native wrapper logic grows. |
| `packages/hub/src/property-inspector/components/SectionHeading.tsx` | PI presentational component | Area/indirect only | No direct test: static heading wrapper; covered by panel DOM smoke and accessibility queries. |
| `packages/hub/src/property-inspector/components/SteppedSlider.tsx` | PI DOM control | Area/indirect only | P0 G3 test:pi: cover user-event interaction, focus/keyboard, disabled states, and value callbacks. |
| `packages/hub/src/property-inspector/controls/CircleVariantSetting.tsx` | PI select wrapper | Area/indirect only | P1 G3 test:pi: cover through representative wrapper/panel tests; no per-wrapper direct test unless mapping or preview behavior changes. |
| `packages/hub/src/property-inspector/controls/ColorBandSetting.tsx` | PI color wrapper | Area/indirect only | P1 G3 test:pi: cover through color panel interaction; direct test only if band-specific mapping grows. |
| `packages/hub/src/property-inspector/controls/ColorSetting.tsx` | PI DOM control | Area/indirect only | P0 G3 test:pi: cover user-event interaction, focus/keyboard, disabled states, and value callbacks. |
| `packages/hub/src/property-inspector/controls/MetricViewSetting.tsx` | PI select wrapper | Area/indirect only | P1 G3 test:pi: cover through representative wrapper/panel tests; no per-wrapper direct test unless mapping or preview behavior changes. |
| `packages/hub/src/property-inspector/controls/NumberSetting.tsx` | PI DOM control | Area/indirect only | P0 G3 test:pi: cover user-event interaction, focus/keyboard, disabled states, and value callbacks. |
| `packages/hub/src/property-inspector/controls/PreviewOptionSetting.tsx` | PI select wrapper | Area/indirect only | P1 G3 test:pi: cover preview option selection through representative panel tests; direct test only if preview rendering logic moves here. |
| `packages/hub/src/property-inspector/controls/RangeSetting.tsx` | PI DOM control | Area/indirect only | P1 G3 test:pi: cover representative range value callback and disabled state when a panel relies on it. |
| `packages/hub/src/property-inspector/controls/select-layout.ts` | PI pure control helper | Area/indirect only | P1 G3 test:unit: keep pure navigation/layout cases; DOM coverage belongs to control wrapper. |
| `packages/hub/src/property-inspector/controls/select-navigation.ts` | PI pure control helper | Area/indirect only | P1 G3 test:unit: keep pure navigation/layout cases; DOM coverage belongs to control wrapper. |
| `packages/hub/src/property-inspector/controls/SelectSetting.tsx` | PI DOM control | Direct: SelectSetting.test.ts | P0 G3 test:pi: cover user-event interaction, focus/keyboard, disabled states, and value callbacks. |
| `packages/hub/src/property-inspector/controls/setting-control.ts` | PI pure control helper | Area/indirect only | P1 G3 test:unit: cover selected-option fallback and disabled-option filtering through SelectSetting tests or focused helper tests. |
| `packages/hub/src/property-inspector/controls/TerminalVariantSetting.tsx` | PI select wrapper | Area/indirect only | P1 G3 test:pi: cover through representative wrapper/panel tests; no per-wrapper direct test unless mapping or preview behavior changes. |
| `packages/hub/src/property-inspector/controls/TextSetting.tsx` | PI DOM control | Area/indirect only | P0 G3 test:pi: cover user-event interaction, focus/keyboard, disabled states, and value callbacks. |
| `packages/hub/src/property-inspector/controls/TextVariantSetting.tsx` | PI select wrapper | Area/indirect only | P1 G3 test:pi: cover through representative wrapper/panel tests; no per-wrapper direct test unless mapping or preview behavior changes. |
| `packages/hub/src/property-inspector/controls/ThemeSetting.tsx` | PI select wrapper | Area/indirect only | P1 G3 test:pi: cover through representative wrapper/panel tests; no per-wrapper direct test unless mapping or preview behavior changes. |
| `packages/hub/src/property-inspector/inspector/context.ts` | PI visibility context | Direct: context.test.ts | P1 G3 test:unit: keep context visibility cases; do not treat the type facade as a DOM release gate. |
| `packages/hub/src/property-inspector/inspector/settings-types.ts` | PI type facade | TypeScript build; indirect through PI tests | No direct test: type-only re-export and alias surface; covered by TypeScript build and PI/settings tests. |
| `packages/hub/src/property-inspector/inspector/types.ts` | PI type facade | TypeScript build; indirect through PI tests | No direct test: type/interface-only select and visibility contracts; covered by controls, panels, and context tests. |
| `packages/hub/src/property-inspector/panels/AppearanceSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover representative visible sections, global override disabling, and settings writes through tab-level DOM tests. |
| `packages/hub/src/property-inspector/panels/CatalogMetricWidgetSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover catalog picker and descriptor-dependent visibility through WidgetSettingsTab/App tests. |
| `packages/hub/src/property-inspector/panels/ColorCompensationControls.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover through color compensation wizard/tab flow, not a separate direct test per small control group. |
| `packages/hub/src/property-inspector/panels/ColorSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover representative color mode and global override behavior through tab-level DOM tests. |
| `packages/hub/src/property-inspector/panels/CpuWidgetSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover CPU-specific metric visibility through WidgetSettingsTab cases, not a full per-domain matrix. |
| `packages/hub/src/property-inspector/panels/DefaultWidgetSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover default fallback panel visibility through WidgetSettingsTab cases. |
| `packages/hub/src/property-inspector/panels/DiskWidgetSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover disk volume and throughput visibility through representative WidgetSettingsTab cases. |
| `packages/hub/src/property-inspector/panels/GlobalSettingsTab.tsx` | PI panel composition | Direct: GlobalSettingsTab.test.ts | P0 G3 test:pi: add small DOM coverage for visible sections, helper guidance, global override disabling, and settings writes. |
| `packages/hub/src/property-inspector/panels/GpuWidgetSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover GPU helper-backed metric visibility through WidgetSettingsTab cases, not a full per-domain matrix. |
| `packages/hub/src/property-inspector/panels/helper-status-guidance.ts` | PI helper guidance mapper | Area/indirect only | P1 G3 test:unit/test:pi: cover status-to-guidance mapping once; do not parse service warning text. |
| `packages/hub/src/property-inspector/panels/LineSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover representative line option visibility through tab-level DOM tests. |
| `packages/hub/src/property-inspector/panels/MetricSourceDiagnostic.tsx` | PI diagnostics panel | Area/indirect only | P1 G3 test:pi: cover helper/source status display through App or WidgetSettingsTab cases. |
| `packages/hub/src/property-inspector/panels/MetricSourceSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover metric source selection and helper guidance through representative tab-level cases. |
| `packages/hub/src/property-inspector/panels/NetworkWidgetSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover traffic/ping direction visibility through representative WidgetSettingsTab cases. |
| `packages/hub/src/property-inspector/panels/panel-props.ts` | PI type facade | TypeScript build; indirect through PI tests | No direct test: props-only panel contract; covered by panel/component compilation and tab-level DOM tests. |
| `packages/hub/src/property-inspector/panels/PollingSettings.tsx` | PI panel composition | Area/indirect only | P1 G3 test:pi: cover polling value writes through representative tab-level cases. |
| `packages/hub/src/property-inspector/panels/setting-options.ts` | PI static option lists | TypeScript build; indirect through PI tests | No direct test: static option lists; cover only through select/panel behavior unless derived logic is added. |
| `packages/hub/src/property-inspector/panels/SettingsSection.tsx` | PI presentational component | Area/indirect only | No direct test: static section wrapper; covered by panel DOM smoke. |
| `packages/hub/src/property-inspector/panels/WidgetSettingsTab.tsx` | PI panel composition | Direct: WidgetSettingsTab.test.ts | P0 G3 test:pi: add small DOM coverage for visible sections, helper guidance, global override disabling, and settings writes. |
| `packages/hub/src/property-inspector/previews/metric-option-preview.ts` | PI preview renderer | Direct: metric-view-preview.test.ts | P1 G3/G9 test:unit: keep preview URI/render smoke for each view/theme variant; do not make it a DOM release gate. |
| `packages/hub/src/property-inspector/property-inspector.tsx` | PI bootstrap entry | Area/indirect only | P1 G3/G10 build/test:pi: cover once through PI bootstrap smoke; no direct unit beyond missing-root behavior if failures recur. |
| `packages/hub/src/property-inspector/select-options/catalog-metric-options.ts` | PI option mapper | Direct: catalog-metric-options.test.ts | P1 G3 test:unit: keep catalog option mapping tests; app-level runtime update belongs in App DOM tests. |
| `packages/hub/src/property-inspector/select-options/runtime-select-options.ts` | PI option mapper | Direct: runtime-select-options.test.ts | P1 G3 test:unit: keep runtime option mapping tests; app-level runtime update belongs in App DOM tests. |
| `packages/hub/src/property-inspector/settings-sync/settings-sync-state.ts` | PI settings sync | Direct: settings-sync-state.test.ts | P0 G3 test:pi: cover async SDK load/events, sparse patches, save failures, and runtime cache updates. |
| `packages/hub/src/property-inspector/settings-sync/usePropertyInspectorSettings.ts` | PI settings sync | Area/indirect only | P0 G3 test:pi: cover async SDK load/events, sparse patches, save failures, and runtime cache updates. |
| `packages/hub/src/property-inspector/stream-deck/stream-deck-client.ts` | Property Inspector shell/support | Direct: stream-deck-client.test.ts | P0 G3 test:pi: cover app bootstrap, stream-deck client integration, option updates, and context visibility where behavior exists. |
| `packages/hub/src/runtime/disk-metric-keys.ts` | Runtime store/cache | Direct: disk-metric-keys.test.ts | P0 G6 test:unit: cover ring buffer, metric store no-data vs real sample, cache patches, and metric key registries. |
| `packages/hub/src/runtime/disk-volumes.ts` | Runtime store/cache | Area/indirect only | P0 G6 test:unit: cover ring buffer, metric store no-data vs real sample, cache patches, and metric key registries. |
| `packages/hub/src/runtime/metric-collection/background-metric-collection.ts` | Runtime collection supervisor | Direct: background-metric-collection.test.ts | P0 G6 test:unit: cover planning, runner lifecycle, fallback, demand renewal/clear, metadata invalidation, and disposal. |
| `packages/hub/src/runtime/metric-collection/collector-group-planner.ts` | Runtime collection supervisor | Direct: collector-group-planner.test.ts | P0 G6 test:unit: cover planning, runner lifecycle, fallback, demand renewal/clear, metadata invalidation, and disposal. |
| `packages/hub/src/runtime/metric-collection/collector-group-runner.ts` | Runtime collection supervisor | Direct: collector-group-runner.test.ts | P0 G6 test:unit: cover planning, runner lifecycle, fallback, demand renewal/clear, metadata invalidation, and disposal. |
| `packages/hub/src/runtime/metric-collection/collector-group-supervisor.ts` | Runtime collection supervisor | Direct: collector-group-supervisor.test.ts | P0 G6 test:unit: cover planning, runner lifecycle, fallback, demand renewal/clear, metadata invalidation, and disposal. |
| `packages/hub/src/runtime/metric-collection/fallback-composer.ts` | Runtime collection supervisor | Direct: fallback-composer.test.ts | P0 G6 test:unit: cover planning, runner lifecycle, fallback, demand renewal/clear, metadata invalidation, and disposal. |
| `packages/hub/src/runtime/metric-collection/metric-subscription-registry.ts` | Runtime collection supervisor | Direct: metric-subscription-registry.test.ts | P0 G6 test:unit: cover planning, runner lifecycle, fallback, demand renewal/clear, metadata invalidation, and disposal. |
| `packages/hub/src/runtime/metric-collection/source-planning-metadata-registry.ts` | Runtime collection supervisor | Direct: source-planning-metadata-registry.test.ts | P0 G6 test:unit: cover planning, runner lifecycle, fallback, demand renewal/clear, metadata invalidation, and disposal. |
| `packages/hub/src/runtime/metric-keys.ts` | Runtime store/cache | Area/indirect only | P0 G6 test:unit: cover ring buffer, metric store no-data vs real sample, cache patches, and metric key registries. |
| `packages/hub/src/runtime/metric-store.ts` | Runtime store/cache | Direct: metric-store.test.ts | P0 G6 test:unit: cover ring buffer, metric store no-data vs real sample, cache patches, and metric key registries. |
| `packages/hub/src/runtime/network-interfaces.ts` | Runtime store/cache | Area/indirect only | P0 G6 test:unit: cover ring buffer, metric store no-data vs real sample, cache patches, and metric key registries. |
| `packages/hub/src/runtime/network-metric-keys.ts` | Runtime store/cache | Direct: network-metric-keys.test.ts | P0 G6 test:unit: cover ring buffer, metric store no-data vs real sample, cache patches, and metric key registries. |
| `packages/hub/src/runtime/ring-buffer.ts` | Runtime store/cache | Direct: ring-buffer.test.ts | P0 G6 test:unit: cover ring buffer, metric store no-data vs real sample, cache patches, and metric key registries. |
| `packages/hub/src/runtime/source-routing/metric-read-plan.ts` | Runtime source routing | Direct: metric-read-plan.test.ts | P0 G6 test:unit: preserve metric-level source preference/read-plan coverage and fallback ordering. |
| `packages/hub/src/runtime/source-routing/metric-read-plan-builder.ts` | Runtime source routing | Direct: metric-read-plan-builder.test.ts | P0 G6 test:unit: preserve metric-level source preference/read-plan coverage and fallback ordering. |
| `packages/hub/src/runtime/source-routing/metric-source-preferences.ts` | Runtime source routing | Direct: metric-source-preferences.test.ts | P0 G6 test:unit: preserve metric-level source preference/read-plan coverage and fallback ordering. |
| `packages/hub/src/runtime/sources/backoff-policy.ts` | Runtime source contract | Direct: backoff-policy.test.ts | P0 G6 test:unit: cover source registry/client contracts, backoff, polling group resolution, and invalid source data. |
| `packages/hub/src/runtime/sources/metric-source.ts` | Runtime source contract | Area/indirect only | P0 G6 test:unit: cover source registry/client contracts, backoff, polling group resolution, and invalid source data. |
| `packages/hub/src/runtime/sources/node-system/node-system-cpu.ts` | Node system source | Area/indirect only | P1 G6 test:unit: keep fake systeminformation/OS command coverage for CPU/GPU/disk/network/ping edge cases. |
| `packages/hub/src/runtime/sources/node-system/node-system-disk.ts` | Node system source | Area/indirect only | P1 G6 test:unit: keep fake systeminformation/OS command coverage for CPU/GPU/disk/network/ping edge cases. |
| `packages/hub/src/runtime/sources/node-system/node-system-gpu.ts` | Node system source | Area/indirect only | P1 G6 test:unit: keep fake systeminformation/OS command coverage for CPU/GPU/disk/network/ping edge cases. |
| `packages/hub/src/runtime/sources/node-system/node-system-network.ts` | Node system source | Area/indirect only | P1 G6 test:unit: keep fake systeminformation/OS command coverage for CPU/GPU/disk/network/ping edge cases. |
| `packages/hub/src/runtime/sources/node-system/node-system-network-ping.ts` | Node system source | Direct: node-system-network-ping.test.ts | P1 G6 test:unit: keep fake systeminformation/OS command coverage for CPU/GPU/disk/network/ping edge cases. |
| `packages/hub/src/runtime/sources/node-system/node-system-source.ts` | Node system source | Direct: node-system-source.test.ts | P1 G6 test:unit: keep fake systeminformation/OS command coverage for CPU/GPU/disk/network/ping edge cases. |
| `packages/hub/src/runtime/sources/node-system/node-system-source-types.ts` | Node system source | Area/indirect only | P1 G6 test:unit: keep fake systeminformation/OS command coverage for CPU/GPU/disk/network/ping edge cases. |
| `packages/hub/src/runtime/sources/refreshable-cache.ts` | Runtime source contract | Direct: refreshable-cache.test.ts | P0 G6 test:unit: cover source registry/client contracts, backoff, polling group resolution, and invalid source data. |
| `packages/hub/src/runtime/sources/source-client.ts` | Runtime source contract | Direct: source-client.test.ts | P0 G6 test:unit: cover source registry/client contracts, backoff, polling group resolution, and invalid source data. |
| `packages/hub/src/runtime/sources/source-ids.ts` | Runtime source contract | Area/indirect only | P0 G6 test:unit: cover source registry/client contracts, backoff, polling group resolution, and invalid source data. |
| `packages/hub/src/runtime/sources/source-planning-metadata.ts` | Runtime source contract | Area/indirect only | P0 G6 test:unit: cover source registry/client contracts, backoff, polling group resolution, and invalid source data. |
| `packages/hub/src/runtime/sources/source-polling-groups.ts` | Runtime source contract | Area/indirect only | P0 G6 test:unit: cover source registry/client contracts, backoff, polling group resolution, and invalid source data. |
| `packages/hub/src/runtime/sources/source-registry.ts` | Runtime source contract | Direct: source-registry.test.ts | P0 G6 test:unit: cover source registry/client contracts, backoff, polling group resolution, and invalid source data. |
| `packages/hub/src/runtime/sources/windows-helper/windows-helper-grpc-errors.ts` | Windows helper source client | Area/indirect only | P0 G5/G6 test:unit: cover proto mapping, protocol skew, retry cooldowns, service status, descriptor preload, and gRPC errors. |
| `packages/hub/src/runtime/sources/windows-helper/windows-helper-grpc-transport.ts` | Windows helper source client | Area/indirect only | P0 G5/G6 test:unit: cover proto mapping, protocol skew, retry cooldowns, service status, descriptor preload, and gRPC errors. |
| `packages/hub/src/runtime/sources/windows-helper/windows-helper-service-status.ts` | Windows helper source client | Direct: windows-helper-service-status.test.ts | P0 G5/G6 test:unit: cover proto mapping, protocol skew, retry cooldowns, service status, descriptor preload, and gRPC errors. |
| `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-api-mapper.ts` | Windows helper source client | Area/indirect only | P0 G5/G6 test:unit: cover proto mapping, protocol skew, retry cooldowns, service status, descriptor preload, and gRPC errors. |
| `packages/hub/src/runtime/sources/windows-helper/windows-helper-source-client.ts` | Windows helper source client | Direct: windows-helper-source-client.test.ts | P0 G5/G6 test:unit: cover proto mapping, protocol skew, retry cooldowns, service status, descriptor preload, and gRPC errors. |
| `packages/hub/src/runtime/widget-runtime-cache.ts` | Runtime store/cache | Direct: widget-runtime-cache.test.ts | P0 G6 test:unit: cover ring buffer, metric store no-data vs real sample, cache patches, and metric key registries. |
| `packages/hub/src/settings/appearance-overrides.ts` | Resolved settings contract | Area/indirect only | P0 G4 test:unit: cover default builders and resolved/runtime ownership through storage resolver tests. |
| `packages/hub/src/settings/default-appearance-settings.ts` | Resolved settings contract | Area/indirect only | P0 G4 test:unit: cover default builders and resolved/runtime ownership through storage resolver tests. |
| `packages/hub/src/settings/global-settings-store.ts` | Resolved settings contract | Area/indirect only | P0 G4 test:unit: cover default builders and resolved/runtime ownership through storage resolver tests. |
| `packages/hub/src/settings/network-ping-target.ts` | Resolved settings contract | Direct: network-ping-target.test.ts | P0 G4 test:unit: cover default builders and resolved/runtime ownership through storage resolver tests. |
| `packages/hub/src/settings/render-appearance-builder.ts` | Resolved settings contract | Direct: render-appearance-builder.test.ts | P0 G4 test:unit: cover default builders and resolved/runtime ownership through storage resolver tests. |
| `packages/hub/src/settings/render-paint-resolver.ts` | Resolved settings contract | Area/indirect only | P0 G4 test:unit: cover default builders and resolved/runtime ownership through storage resolver tests. |
| `packages/hub/src/settings/render-text-style-resolver.ts` | Resolved settings contract | Area/indirect only | P0 G4 test:unit: cover default builders and resolved/runtime ownership through storage resolver tests. |
| `packages/hub/src/settings/render-theme-effects-resolver.ts` | Resolved settings contract | Area/indirect only | P0 G4 test:unit: cover default builders and resolved/runtime ownership through storage resolver tests. |
| `packages/hub/src/settings/resolved-settings.ts` | Resolved settings contract | Area/indirect only | P0 G4 test:unit: cover default builders and resolved/runtime ownership through storage resolver tests. |
| `packages/hub/src/settings/storage/codec.ts` | Persisted settings storage | Direct: codec.test.ts | P0 G4 test:unit: cover codec/resolver/sparse patch warnings, unknown fields, global overrides, and helper-backed defaults. |
| `packages/hub/src/settings/storage/color-compensation-settings.ts` | Persisted settings storage | Direct: color-compensation-settings.test.ts | P0 G4 test:unit: cover codec/resolver/sparse patch warnings, unknown fields, global overrides, and helper-backed defaults. |
| `packages/hub/src/settings/storage/enum-maps.ts` | Persisted settings storage | Area/indirect only | P0 G4 test:unit: cover codec/resolver/sparse patch warnings, unknown fields, global overrides, and helper-backed defaults. |
| `packages/hub/src/settings/storage/global-settings-patch.ts` | Persisted settings storage | Direct: global-settings-patch.test.ts | P0 G4 test:unit: cover codec/resolver/sparse patch warnings, unknown fields, global overrides, and helper-backed defaults. |
| `packages/hub/src/settings/storage/quick-start-widget-settings.ts` | Persisted settings storage | Direct: quick-start-widget-settings.test.ts | P0 G4 test:unit: cover codec/resolver/sparse patch warnings, unknown fields, global overrides, and helper-backed defaults. |
| `packages/hub/src/settings/storage/resolver.ts` | Persisted settings storage | Direct: resolver.test.ts | P0 G4 test:unit: cover codec/resolver/sparse patch warnings, unknown fields, global overrides, and helper-backed defaults. |
| `packages/hub/src/settings/storage/widget-settings-patch.ts` | Persisted settings storage | Direct: widget-settings-patch.test.ts | P0 G4 test:unit: cover codec/resolver/sparse patch warnings, unknown fields, global overrides, and helper-backed defaults. |
| `packages/hub/src/shared/clock.ts` | Shared pure utility | Area/indirect only | P2 G6 test:unit: direct test only for behaviorful helpers; type/constant facades rely on lint/build. |
| `packages/hub/src/shared/color-utils.ts` | Shared pure utility | Direct: color-utils.test.ts | P2 G6 test:unit: direct test only for behaviorful helpers; type/constant facades rely on lint/build. |
| `packages/hub/src/shared/duration-accumulator.ts` | Shared pure utility | Direct: duration-accumulator.test.ts | P2 G6 test:unit: direct test only for behaviorful helpers; type/constant facades rely on lint/build. |
| `packages/hub/src/shared/stream-deck-actions.ts` | Shared pure utility | Direct: stream-deck-actions.test.ts | P2 G6 test:unit: direct test only for behaviorful helpers; type/constant facades rely on lint/build. |
| `packages/hub/src/view-rendering/color-compensation-filter.ts` | Render model/SVG boundary | Direct: color-compensation-filter.test.ts | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/color-compensation-patterns.ts` | Render model/SVG boundary | Area/indirect only | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/color-resolver.ts` | Render model/SVG boundary | Direct: color-resolver.test.ts | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/dual-metric-view.ts` | Render model/SVG boundary | Direct: dual-metric-view.test.ts | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/metric-frame.ts` | Render model/SVG boundary | Direct: metric-frame.test.ts | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/metric-notice-body.ts` | Render model/SVG boundary | Area/indirect only | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/metric-view-frame.ts` | Render model/SVG boundary | Direct: metric-view-frame.test.ts | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/pixel-window-theme-tokens.ts` | Render model/SVG boundary | Area/indirect only | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/rasterizer.ts` | Rasterization boundary | Area/indirect only | P1 G9 test:unit/visual: cover font options, failure diagnostics, performance stats, and PNG smoke via existing visual suite. |
| `packages/hub/src/view-rendering/rasterizer-performance-stats.ts` | Rasterization boundary | Direct: rasterizer-performance-stats.test.ts | P1 G9 test:unit/visual: cover font options, failure diagnostics, performance stats, and PNG smoke via existing visual suite. |
| `packages/hub/src/view-rendering/render-appearance.ts` | Render model/SVG boundary | Area/indirect only | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/render-svg-effects.ts` | Render model/SVG boundary | Area/indirect only | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/render-text-style.ts` | Render model/SVG boundary | Area/indirect only | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/resvg-font-options.ts` | Rasterization boundary | Direct: resvg-font-options.test.ts | P1 G9 test:unit/visual: cover font options, failure diagnostics, performance stats, and PNG smoke via existing visual suite. |
| `packages/hub/src/view-rendering/single-metric-view.ts` | Render model/SVG boundary | Direct: single-metric-view.test.ts | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/svg-utils.ts` | Render model/SVG boundary | Direct: svg-utils.test.ts | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-rendering/text-content/render-unit-text.ts` | Render text content | Direct: render-unit-text.test.ts | P1 G9 test:unit: cover unit/title-card formatting and no-data display text. |
| `packages/hub/src/view-rendering/text-content/title-card-text-content.ts` | Render text content | Direct: title-card-text-content.test.ts | P1 G9 test:unit: cover unit/title-card formatting and no-data display text. |
| `packages/hub/src/view-rendering/widget-data.ts` | Render model/SVG boundary | Area/indirect only | P1 G9 test:unit/visual: cover no-data/pending/unavailable render contracts and representative SVG output. |
| `packages/hub/src/view-updates/color-compensation-preview.ts` | View update runner | Area/indirect only | P1 G9 test:unit: cover queueing, dispatch failures, performance stats, and color-compensation preview updates. |
| `packages/hub/src/view-updates/dispatch.ts` | View update runner | Direct: dispatch.test.ts | P1 G9 test:unit: cover queueing, dispatch failures, performance stats, and color-compensation preview updates. |
| `packages/hub/src/view-updates/performance-stats.ts` | View update runner | Direct: performance-stats.test.ts | P1 G9 test:unit: cover queueing, dispatch failures, performance stats, and color-compensation preview updates. |
| `packages/hub/src/view-updates/runner.ts` | View update runner | Direct: runner.test.ts | P1 G9 test:unit: cover queueing, dispatch failures, performance stats, and color-compensation preview updates. |
| `packages/hub/src/view-updates/update-queue.ts` | View update runner | Direct: update-queue.test.ts | P1 G9 test:unit: cover queueing, dispatch failures, performance stats, and color-compensation preview updates. |
| `packages/hub/src/view-updates/view-update-observability.ts` | View update runner | Area/indirect only | P1 G9 test:unit: cover queueing, dispatch failures, performance stats, and color-compensation preview updates. |
| `packages/hub/src/widgets/icons/catalog/disk.ts` | Widget icon catalog | Direct: disk.test.ts | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/catalog/hardware.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/catalog/network.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/catalog/status.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/hardware-icons.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/icon-types.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/metric-status-icons.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/metric-view-icons.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/render-icon.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/sources/custom.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/icons/sources/lucide.ts` | Widget icon catalog | Area/indirect only | P2 G9 test:unit/visual: no per-icon tests except generated/catalog membership guards and visual smoke. |
| `packages/hub/src/widgets/primitives/dual-channel-gauge-ring.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/dual-channel-progress-circle.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/dual-channel-sparkline.ts` | Widget primitive | Direct: dual-channel-sparkline.test.ts | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/dual-channel-sparkline-chart.ts` | Widget primitive | Direct: dual-channel-sparkline-chart.test.ts | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/metric-text-row.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/mirrored-traffic.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/progress-bar.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/progress-circle.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/progress-circle-label.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/progress-circle-range.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/sparkline.ts` | Widget primitive | Direct: sparkline.test.ts | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/sparkline-grid-lines.ts` | Widget primitive | Direct: sparkline-grid-lines.test.ts | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/sparkline-path.ts` | Widget primitive | Direct: sparkline-path.test.ts | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/sparkline-smoothing.ts` | Widget primitive | Direct: sparkline-smoothing.test.ts | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/text-metric.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/primitives/title-card-text-metric.ts` | Widget primitive | Area/indirect only | P1 G9 test:unit/visual: cover math/path/text edge cases plus visual matrix, not every color permutation. |
| `packages/hub/src/widgets/styles/color-filled.ts` | Widget style tokens | Area/indirect only | P1 G9 visual: cover representative theme snapshots; no direct tests for static token bags unless derived logic exists. |
| `packages/hub/src/widgets/styles/cupertino-glass.ts` | Widget style tokens | Area/indirect only | P1 G9 visual: cover representative theme snapshots; no direct tests for static token bags unless derived logic exists. |
| `packages/hub/src/widgets/styles/flat.ts` | Widget style tokens | Area/indirect only | P1 G9 visual: cover representative theme snapshots; no direct tests for static token bags unless derived logic exists. |
| `packages/hub/src/widgets/styles/pixel-window.ts` | Widget style tokens | Area/indirect only | P1 G9 visual: cover representative theme snapshots; no direct tests for static token bags unless derived logic exists. |
| `packages/hub/src/widgets/styles/terminal.ts` | Widget style tokens | Area/indirect only | P1 G9 visual: cover representative theme snapshots; no direct tests for static token bags unless derived logic exists. |
| `packages/hub/src/widgets/styles/theme-style.ts` | Widget style tokens | Area/indirect only | P1 G9 visual: cover representative theme snapshots; no direct tests for static token bags unless derived logic exists. |
| `packages/hub/src/widgets/widget-contract.ts` | Widget contract | Area/indirect only | No direct test: type-only primitive contract; covered by TypeScript build and primitive tests. |
| `packages/hub/tsconfig.json` | Hub build/test config | CI/build indirect | P2 G1/G10 CI: covered by lint/test/build/visual/coverage jobs; no direct unit tests. |
| `packages/hub/tsconfig.test.json` | Hub build/test config | CI/build indirect | P2 G1/G10 CI: covered by lint/test/build/visual/coverage jobs; no direct unit tests. |
| `packages/source-windows/Directory.Build.props` | Windows build/restore config | Area/indirect only | P2 G1/G10 CI: covered by restore/build/test/coverage commands; no direct unit tests. |
| `packages/source-windows/NuGet.config` | Windows build/restore config | Area/indirect only | P2 G1/G10 CI: covered by restore/build/test/coverage commands; no direct unit tests. |
| `packages/source-windows/scripts/Publish-WindowsService.ps1` | Windows release script | Area/indirect only | P2 G10 CI/manual: cover by release pipeline smoke; no direct unit unless script parsing grows. |
| `packages/source-windows/scripts/Test-SourceWindowsLint.ps1` | Windows release script | Area/indirect only | P2 G10 CI/manual: cover by release pipeline smoke; no direct unit unless script parsing grows. |
| `packages/source-windows/ShoMetrics.Source.Windows.Contracts/ShoMetrics.Source.Windows.Contracts.csproj` | Windows shared contracts | Area/indirect only | P0 G5/G7 xUnit/build: cover service constants/paths through clients and smoke; no direct tests for trivial constants. |
| `packages/source-windows/ShoMetrics.Source.Windows.Contracts/WindowsSourceServiceConstants.cs` | Windows shared contracts | Area/indirect only | P0 G5/G7 xUnit/build: cover service constants/paths through clients and smoke; no direct tests for trivial constants. |
| `packages/source-windows/ShoMetrics.Source.Windows.Contracts/WindowsSourceServicePaths.cs` | Windows shared contracts | Area/indirect only | P0 G5/G7 xUnit/build: cover service constants/paths through clients and smoke; no direct tests for trivial constants. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/app.manifest` | Control Panel WinUI shell | Direct/near: SourceProtocolMapperTests.cs | P1 G8 manual/xUnit: keep WinUI automation out of CI; test status models/readers, verify real window manually. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/App.xaml` | Control Panel WinUI shell | Direct/near: SourceProtocolMapperTests.cs | P1 G8 manual/xUnit: keep WinUI automation out of CI; test status models/readers, verify real window manually. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/App.xaml.cs` | Control Panel WinUI shell | Area/indirect only | P1 G8 manual/xUnit: keep WinUI automation out of CI; test status models/readers, verify real window manually. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/HelperControlPanelSourceClient.cs` | Control Panel diagnostics model | Area/indirect only | P1 G8 xUnit: cover service status, gRPC failures, component states, copy diagnostics, and bounded support text. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/HelperControlPanelStatus.cs` | Control Panel diagnostics model | Direct/near: HelperControlPanelStatusReaderTests.cs | P1 G8 xUnit: cover service status, gRPC failures, component states, copy diagnostics, and bounded support text. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/HelperControlPanelStatusReader.cs` | Control Panel diagnostics model | Direct/near: HelperControlPanelStatusReaderTests.cs | P1 G8 xUnit: cover service status, gRPC failures, component states, copy diagnostics, and bounded support text. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/MainWindow.xaml` | Control Panel WinUI shell | Area/indirect only | P1 G8 manual/xUnit: keep WinUI automation out of CI; test status models/readers, verify real window manually. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/MainWindow.xaml.cs` | Control Panel WinUI shell | Area/indirect only | P1 G8 manual/xUnit: keep WinUI automation out of CI; test status models/readers, verify real window manually. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/Properties/AssemblyInfo.cs` | Control Panel project/config | Area/indirect only | P2 G8 build/manual: build/signing/manifest covered by CI and manual install smoke. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/ShoMetrics.Source.Windows.ControlPanel.csproj` | Control Panel project/config | Area/indirect only | P2 G8 build/manual: build/signing/manifest covered by CI and manual install smoke. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/WindowsServiceStatusKind.cs` | Control Panel diagnostics model | Area/indirect only | P1 G8 xUnit: cover service status, gRPC failures, component states, copy diagnostics, and bounded support text. |
| `packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/WindowsServiceStatusReader.cs` | Control Panel diagnostics model | Area/indirect only | P1 G8 xUnit: cover service status, gRPC failures, component states, copy diagnostics, and bounded support text. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Catalog/HardwareMetricDescriptor.cs` | Windows Core catalog | Area/indirect only | P0 G8 xUnit: cover stable aliases, sensor ranking, descriptor fingerprint, raw identity, and invalid-value rejection. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Catalog/HardwareMetricDescriptorSnapshot.cs` | Windows Core catalog | Area/indirect only | P0 G8 xUnit: cover stable aliases, sensor ranking, descriptor fingerprint, raw identity, and invalid-value rejection. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Catalog/HardwareMetricDescriptorSnapshotBuilder.cs` | Windows Core catalog | Area/indirect only | P0 G8 xUnit: cover stable aliases, sensor ranking, descriptor fingerprint, raw identity, and invalid-value rejection. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Catalog/LibreHardwareMetricCatalog.cs` | Windows Core catalog | Direct/near: LibreHardwareMetricCatalogTests.cs | P0 G8 xUnit: cover stable aliases, sensor ranking, descriptor fingerprint, raw identity, and invalid-value rejection. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Catalog/MetricIdKind.cs` | Windows Core catalog | Area/indirect only | P0 G8 xUnit: cover stable aliases, sensor ranking, descriptor fingerprint, raw identity, and invalid-value rejection. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Catalog/RankedHardwareMetricDescriptor.cs` | Windows Core catalog | Area/indirect only | P0 G8 xUnit: cover stable aliases, sensor ranking, descriptor fingerprint, raw identity, and invalid-value rejection. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Demand/EffectiveMetricRefreshDemand.cs` | Windows Core refresh demand | Area/indirect only | P0 G8 xUnit: cover clamp, expiry, target index, accepted/ignored counts, and stale demand cleanup. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Demand/MetricRefreshDemand.cs` | Windows Core refresh demand | Direct/near: MetricRefreshDemandStateTests.cs, MetricRefreshDemandChangeGateTests.cs | P0 G8 xUnit: cover clamp, expiry, target index, accepted/ignored counts, and stale demand cleanup. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Demand/MetricRefreshDemandApplyResult.cs` | Windows Core refresh demand | Area/indirect only | P0 G8 xUnit: cover clamp, expiry, target index, accepted/ignored counts, and stale demand cleanup. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Demand/MetricRefreshDemandConstants.cs` | Windows Core refresh demand | Area/indirect only | P0 G8 xUnit: cover clamp, expiry, target index, accepted/ignored counts, and stale demand cleanup. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Demand/MetricRefreshDemandState.cs` | Windows Core refresh demand | Direct/near: MetricRefreshDemandStateTests.cs | P0 G8 xUnit: cover clamp, expiry, target index, accepted/ignored counts, and stale demand cleanup. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Demand/MetricRefreshTargetIndex.cs` | Windows Core refresh demand | Area/indirect only | P0 G8 xUnit: cover clamp, expiry, target index, accepted/ignored counts, and stale demand cleanup. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Diagnostics/MetricSourceComparisonProbe.cs` | Windows Core diagnostics | Area/indirect only | P1 G8 xUnit/manual: diagnostic probe is release support tooling; cover parsing/options lightly, not hardware matrix. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardware/HardwareMetricRetentionCache.cs` | Windows Core LHM adapter | Direct/near: HardwareMetricRetentionCacheTests.cs | P0 G8 xUnit: cover fake hardware traversal, unavailable/retained values, source warnings, and session lifecycle. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardware/HardwareSensorReading.cs` | Windows Core LHM adapter | Area/indirect only | P0 G8 xUnit: cover fake hardware traversal, unavailable/retained values, source warnings, and session lifecycle. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardware/HardwareSensorSnapshot.cs` | Windows Core LHM adapter | Area/indirect only | P0 G8 xUnit: cover fake hardware traversal, unavailable/retained values, source warnings, and session lifecycle. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardware/LibreHardwareComputerFactory.cs` | Windows Core LHM adapter | Direct/near: LibreHardwareComputerFactoryTests.cs | P0 G8 xUnit: cover fake hardware traversal, unavailable/retained values, source warnings, and session lifecycle. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardware/LibreHardwareMetricSource.cs` | Windows Core LHM adapter | Area/indirect only | P0 G8 xUnit: cover fake hardware traversal, unavailable/retained values, source warnings, and session lifecycle. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardware/LibreHardwareMonitorSensorPolicy.cs` | Windows Core LHM adapter | Area/indirect only | P0 G8 xUnit: cover fake hardware traversal, unavailable/retained values, source warnings, and session lifecycle. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardware/LibreHardwareMonitorSession.cs` | Windows Core LHM adapter | Direct/near: LibreHardwareMonitorSessionTests.cs | P0 G8 xUnit: cover fake hardware traversal, unavailable/retained values, source warnings, and session lifecycle. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardware/LibreHardwareSnapshotReader.cs` | Windows Core LHM adapter | Area/indirect only | P0 G8 xUnit: cover fake hardware traversal, unavailable/retained values, source warnings, and session lifecycle. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Platform/PawnIoDiagnostic.cs` | Windows Core platform adapter | Area/indirect only | P0 G8 xUnit/manual: cover disk throughput/PawnIO diagnostics where fakeable; driver presence remains manual. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Platform/WindowsSystemTotalDiskThroughputProvider.cs` | Windows Core platform adapter | Direct/near: WindowsSystemTotalDiskThroughputProviderTests.cs | P0 G8 xUnit/manual: cover disk throughput/PawnIO diagnostics where fakeable; driver presence remains manual. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Properties/AssemblyInfo.cs` | Windows Core project/config | Area/indirect only | P1 G8 build/xUnit: project/assembly config covered by build and smoke; no direct unit unless behaviorful. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/ShoMetrics.Source.Windows.Core.csproj` | Windows Core project/config | Area/indirect only | P1 G8 build/xUnit: project/assembly config covered by build and smoke; no direct unit unless behaviorful. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/HardwareRefreshDiagnostic.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/HardwareSourceWarning.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricReading.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricSnapshot.cs` | Windows Core snapshot model | Direct/near: WindowsMetricSnapshotWorkerLogTests.cs | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricSnapshotCache.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricSnapshotRefreshDiagnostics.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricSnapshotRefreshResult.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricUnavailableReason.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricUnavailableReport.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricUnit.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricValueFreshness.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/MetricValueKind.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/RankedMetricReading.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Core/Snapshots/RawSensorIdentity.cs` | Windows Core snapshot model | Area/indirect only | P0 G8 xUnit: direct tests only for cache/retention/result behavior; DTO/enums covered through mapper/cache tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Diagnostics/LoggerThrottleExtensions.cs` | Windows diagnostics logging | Area/indirect only | P1 G8 xUnit: keep throttled logger/site/context coverage for repeated boundary failures. |
| `packages/source-windows/ShoMetrics.Source.Windows.Diagnostics/ShoMetrics.Source.Windows.Diagnostics.csproj` | Windows diagnostics logging | Area/indirect only | P1 G8 xUnit: keep throttled logger/site/context coverage for repeated boundary failures. |
| `packages/source-windows/ShoMetrics.Source.Windows.Diagnostics/ThrottledLogContext.cs` | Windows diagnostics logging | Area/indirect only | P1 G8 xUnit: keep throttled logger/site/context coverage for repeated boundary failures. |
| `packages/source-windows/ShoMetrics.Source.Windows.Diagnostics/ThrottledLogEntry.cs` | Windows diagnostics logging | Area/indirect only | P1 G8 xUnit: keep throttled logger/site/context coverage for repeated boundary failures. |
| `packages/source-windows/ShoMetrics.Source.Windows.Diagnostics/ThrottledLogger.cs` | Windows diagnostics logging | Direct/near: ThrottledLoggerTests.cs | P1 G8 xUnit: keep throttled logger/site/context coverage for repeated boundary failures. |
| `packages/source-windows/ShoMetrics.Source.Windows.Diagnostics/ThrottledLogLevelBuilder.cs` | Windows diagnostics logging | Area/indirect only | P1 G8 xUnit: keep throttled logger/site/context coverage for repeated boundary failures. |
| `packages/source-windows/ShoMetrics.Source.Windows.Diagnostics/ThrottledLogSite.cs` | Windows diagnostics logging | Area/indirect only | P1 G8 xUnit: keep throttled logger/site/context coverage for repeated boundary failures. |
| `packages/source-windows/ShoMetrics.Source.Windows.Helper/Program.cs` | Windows helper bootstrap | Area/indirect only | P1 G7 build/manual: wrapper should be covered by publish/install/manual smoke, not deep unit tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Helper/ShoMetrics.Source.Windows.Helper.csproj` | Windows helper bootstrap | Area/indirect only | P1 G7 build/manual: wrapper should be covered by publish/install/manual smoke, not deep unit tests. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/ISourceRequestHandler.cs` | Windows service project/model | Area/indirect only | P1 G7/G8 build/xUnit: no direct test for simple enums/interfaces/constants; covered through service tests and smoke. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/MetricRefreshDemandChangeGate.cs` | Windows service source API | Direct/near: MetricRefreshDemandChangeGateTests.cs | P0 G5/G8 xUnit: cover status mapping, proto mapper, timeout, rate limit, demand validation, and protocol metadata. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/MetricRefreshDemandRequestValidator.cs` | Windows service source API | Direct/near: MetricRefreshDemandRequestValidatorTests.cs | P0 G5/G8 xUnit: cover status mapping, proto mapper, timeout, rate limit, demand validation, and protocol metadata. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/Program.cs` | Windows service host | Area/indirect only | P0 G7 integration: named-pipe gRPC smoke must cover host startup, one RPC, timeout, shutdown, and logs. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/Properties/AssemblyInfo.cs` | Windows service project/model | Area/indirect only | P1 G7/G8 build/xUnit: no direct test for simple enums/interfaces/constants; covered through service tests and smoke. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/ServiceExecutableMode.cs` | Windows service project/model | Area/indirect only | P1 G7/G8 build/xUnit: no direct test for simple enums/interfaces/constants; covered through service tests and smoke. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/ShoMetrics.Source.Windows.Service.csproj` | Windows service project/model | Area/indirect only | P1 G7/G8 build/xUnit: no direct test for simple enums/interfaces/constants; covered through service tests and smoke. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/SourceMethodRateLimiter.cs` | Windows service project/model | Area/indirect only | P1 G7/G8 build/xUnit: no direct test for simple enums/interfaces/constants; covered through service tests and smoke. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/SourceProtocolMapper.cs` | Windows service source API | Direct/near: SourceProtocolMapperTests.cs | P0 G5/G8 xUnit: cover status mapping, proto mapper, timeout, rate limit, demand validation, and protocol metadata. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/SourceRequestException.cs` | Windows service project/model | Area/indirect only | P1 G7/G8 build/xUnit: no direct test for simple enums/interfaces/constants; covered through service tests and smoke. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/SourceRequestHandler.cs` | Windows service source API | Direct/near: SourceRequestHandlerLogClassifierTests.cs | P0 G5/G8 xUnit: cover status mapping, proto mapper, timeout, rate limit, demand validation, and protocol metadata. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsGrpcMetricSourceService.cs` | Windows service source API | Direct/near: WindowsGrpcMetricSourceServiceTests.cs | P0 G5/G8 xUnit: cover status mapping, proto mapper, timeout, rate limit, demand validation, and protocol metadata. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsMetricSnapshotWorker.cs` | Windows service worker | Direct/near: WindowsMetricSnapshotWorkerLogTests.cs | P0 G8 xUnit: cover background refresh logs, cancellation, and source availability transitions. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsPipeClientVerifier.cs` | Windows service named-pipe security | Area/indirect only | P0 G7 integration/xUnit: cover ACL/local-client verification where fakeable; remote/elevation edge manual. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsPipeSecurity.cs` | Windows service named-pipe security | Area/indirect only | P0 G7 integration/xUnit: cover ACL/local-client verification where fakeable; remote/elevation edge manual. |
| `packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsSourceServiceIdentity.cs` | Windows service project/model | Area/indirect only | P1 G7/G8 build/xUnit: no direct test for simple enums/interfaces/constants; covered through service tests and smoke. |
| `packages/source-windows/ShoMetrics.Source.Windows.slnx` | Windows build/restore config | Area/indirect only | P2 G1/G10 CI: covered by restore/build/test/coverage commands; no direct unit tests. |
| `site/AGENTS.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/_index.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/customize.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/download.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/faq/_index.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/faq/color-compensation.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/faq/helper.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/faq/install-windows-helper.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/install.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/troubleshooting.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/tutorials/_index.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/tutorials/color-compensation.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/content/tutorials/first-use.md` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/hugo.toml` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/layouts/_default/baseof.html` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/layouts/_default/list.html` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/layouts/_default/single.html` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/layouts/customize/single.html` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/layouts/index.html` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |
| `site/static/css/site.css` | User site/docs | Hugo build only | P2 G10 site smoke: Hugo build, link check, and required-page content smoke; no app-level DOM tests. |

## Completed Implementation Groups

These groups were implemented as separate commits because each group has a distinct owner, runner, CI gate, or failure mode.
- **G1 Coverage infrastructure baseline**: `134c86f Add coverage reporting baseline`.
- **G2 PI DOM test infrastructure**: `0a6880d Add Property Inspector DOM test runner`.
- **G3 PI interaction coverage**: `27e9209 Add Property Inspector interaction tests`.
- **G4 Settings and persisted contract coverage**: `934ebe1 Add settings contract tests`.
- **G5 Source API and helper contract coverage**: `6bdc5d2 Fix helper malformed response status`.
- **G6 Runtime collection, fallback, and action coverage**: `f258253 Add runtime collection contract tests`.
- **G7 Windows helper integration smoke**: `f9ba42d Add Windows helper integration smoke`.
- **G8 Windows Core, Diagnostics, and Control Panel coverage**: `34e7991 Add Windows behavior contract tests`.
- **G9 Rendering, widget, visual, and no-data coverage**: `ef97de6 Add rendering widget contract tests`.
- **G10 Site/docs/release checklist smoke**: `e97feaf Add release smoke checks`.

## Remaining User Decisions

None. Current decisions are captured in this document.

## Verification

- `git status --short` inspected; matrix reflects the current dirty working tree, including installed Windows `coverlet.collector` changes.
- `rg --files` inspected.
- Hub production/test count: 205 / 92.
- Windows production/test count: 84 / 61 C# test/support files.
- Scanned 484 commit subjects via full `git log --oneline --all --decorate=short` for risk grouping.
