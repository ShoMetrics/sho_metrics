# System & Battery Implementation Plan

Date: 2026-06-19

This document is the implementation standard for the System & Battery feature.
If code differs from this plan, treat the code as wrong unless this document is
updated first.

The research basis is
`docs/development/runtime-sources/06-battery/01-hid-battery-experiment-report.md`.
This plan is written for an agent with no prior conversation context.

## Product Standard

The Stream Deck action is the System action with visible name `System & Battery`.
There is no standalone Battery action.

The action owns:

- Built-in computer battery for Windows laptops and MacBooks.
- Built-in computer charging or power source state.
- Built-in computer time remaining, cycle count, and health when available.
- Adapter wattage and whole-system thermal pressure when available.
- Bluetooth peripheral battery when available through standard OS telemetry.
- Experimental USB receiver, USB dongle, and wired peripheral battery for
  supported Logitech devices, verified ASUS ROG keyboards, and theory-backed
  ASUS ROG mouse model families.

The action must not absorb component-owned metrics. CPU temperature/power stay
in CPU, GPU temperature/power stay in GPU, and disk, RAM, and network remain in
their current domains.

Experimental vendor HID battery support is enabled by default but must be
user-disableable. The toggle text should be:

```text
Enable experimental USB receiver and wired battery
```

The supporting text should be:

```text
Reads battery levels from supported USB receiver and wired Logitech/ROG devices.
Turn this off if you notice peripheral stutter, manufacturer software conflicts, or unstable device behavior.
```

When the toggle is disabled, already configured USB receiver or wired peripheral
actions must not crash. They should use the existing no-data/N/A action path.

## Runtime Activation Standard

`node-hid` must be lazy-loaded. Do not import or require `node-hid` from the Hub
startup path, source registry construction, ordinary action construction, or
normal non-battery actions.

`node-hid` may load only when:

- the experimental vendor HID toggle is enabled and the user opens the Battery
  Property Inspector panel that needs USB receiver/wired discovery; or
- the experimental vendor HID toggle is enabled and an existing `System &
  Battery` action is already bound to a vendor HID peripheral reading.

Do not add a complex isolation framework to prove that the native module can
never load. A simple lazy loader with narrow call sites is the required design.

## Polling Standard

System battery polling choices:

- `60s`
- `3min`
- `5min`
- `10min`
- `20min`
- `30min`
- `60min`

Peripheral battery polling choices:

- `10min`
- `20min`
- `30min`
- `60min`

The default peripheral battery polling interval is `60min`.

No user-facing peripheral battery interval below `10min` is allowed. Shorter
polling is diagnostic-only and belongs in scripts, not product UI.

Vendor HID reads must be low-frequency, single-flight per physical
device/receiver, strict-parser, and no-burst. Do not retry immediately after a
timeout or malformed report.

Any parsed battery percentage must be in the inclusive `0-100` range. Values
outside `0-100` are no-data. Coarse battery states are not percentages and must
use a separate state field.

## Device List Standard

The Battery selector is one flat Battery list:

```text
Battery
  System
  [Bluetooth] Device A
  [Dongle] Device B
  [Wired] Device C
```

Unsupported and unknown devices are hidden in normal UI. They may appear only in
diagnostic tooling or developer logs.

Every discovered battery candidate must carry a connection transport enum:

- `system`
- `bluetooth`
- `usbReceiver`
- `usbWired`

Receiver-backed devices must also carry a receiver kind when known:

- `bolt`
- `unifying`
- `rogOmni`
- `lightspeed`
- `unknownReceiver`

The user-facing label may say `[Dongle]`; the internal transport remains
`usbReceiver`.

## Identity And Coalescing Standard

Coalescing is required in v1. Do not ship a first version that treats every USB
path, Bluetooth path, and receiver route as unrelated by default.

Persist a stable peripheral binding identity bundle, not a raw HID path. The
bundle must allow fallback matching with multiple signals:

- vendor id and product id;
- manufacturer, product name, and HID serial when available;
- transport kind and receiver kind;
- interface number, usage page, usage id, and collection role;
- vendor-specific unit id from known read-only protocol features;
- receiver-local slot and Easy-Switch slot as route diagnostics, not as primary
  identity;
- last selected display model only as a weak fallback.

Matching order:

1. Exact per-unit id match, such as HID serial or a known vendor unit id.
2. Exact known model identity plus exactly one current candidate.
3. Verified vendor-family route rule for mutually exclusive paths, such as a
   known ROG wired PID and Omni receiver PID pair.
4. Last selected model plus route evidence when it resolves to exactly one
   current candidate.
5. Otherwise keep candidates separate and mark the selection ambiguous/no-data.

When multiple same-model candidates exist and no per-unit id exists, do not
silently merge them. Show separate candidates or keep the binding unresolved.

If two coalesced paths repeatedly report large conflicting battery values, split
them back into separate displayed devices for the current session.

## Step Granularity And Code Size

This plan intentionally uses ten implementation steps. The split is based on
ownership boundaries, not file count. Adjacent steps should not be merged unless
this document is updated first, because merging them would hide one of these
boundaries: contracts, product surface, standard OS telemetry, native HID
security, identity/coalescing, vendor protocols, runtime integration,
packaging, or evidence.

Likely locations are orientation, not an exhaustive placement rule. The binding
part of each step is the ownership boundary, rules, and done-when checklist.
Exact file placement may vary when it stays within those boundaries.

Estimated code size means production code plus tests and local scripts for that
step. It excludes generated files, lockfiles, images/assets, and docs. Ranges
are intentionally broad; if an implementation wants to exceed a step estimate by
more than roughly 30%, stop and check whether the step is absorbing unrelated
work.

Expected total size: about `4,800-8,150` lines under that definition.

## Step 1. Define Contracts, Metric Keys, And Source Ids

Likely locations:

- `packages/hub/src/runtime/metric-keys.ts`
- `packages/hub/src/runtime/sources/source-ids.ts`
- `packages/hub/src/runtime/sources/metric-source.ts`
- `packages/hub/src/runtime/sources/source-client.ts`
- `packages/hub/src/settings/resolved-settings.ts`
- `packages/hub/src/settings/storage/**`
- `contracts/**` only if existing settings/source contracts cannot represent
  the new persisted action selection.

Estimated code size: `450-800` lines.

Work:

- Add System & Battery metric target types to resolved settings.
- Add stored settings for the System & Battery action. Store sparse user intent
  only:
  - selected battery reading;
  - selected peripheral identity bundle when a peripheral is selected;
  - polling interval;
  - display settings already shared by single-metric actions.
- Add global setting for experimental USB receiver/wired battery support. This
  setting defaults to enabled.
- Add metric key families for system battery and peripheral battery readings.
- Add a runtime-owned battery device descriptor type that contains:
  - display name;
  - metric key;
  - transport kind;
  - receiver kind when applicable;
  - experimental flag;
  - identity bundle;
  - source support state for diagnostics.

Rules:

- Do not persist discovered device lists.
- Do not persist HID paths as the only identity.
- Do not import generated proto into action view builders, renderers, or PI
  panels. Convert generated data at the storage boundary.
- Do not model transport as text-only display state. It must be a typed enum in
  the app-owned contract.

Done when:

- Unit tests prove stored settings resolve to a complete System & Battery
  resolved target.
- Unit tests prove unknown or missing peripheral identity resolves to a safe
  no-data target, not a crash.
- Existing CPU/GPU/Disk/Network settings tests do not gain System-specific
  branches.

This step must not be merged with runtime HID implementation. Contracts must be
stable before native acquisition is added.

## Step 2. Add The System & Battery Action And Property Inspector Surface

Likely locations:

- `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`
- `packages/hub/com.ez.sho-metrics.sdPlugin/en.json`
- `packages/hub/com.ez.sho-metrics.sdPlugin/zh_CN.json`
- `packages/hub/com.ez.sho-metrics.sdPlugin/ja.json`
- `packages/hub/com.ez.sho-metrics.sdPlugin/imgs/actions/system/**`
- `packages/hub/src/shared/stream-deck-actions.ts`
- `packages/hub/src/plugin.ts`
- `packages/hub/src/actions/system.ts`
- `packages/hub/src/actions/system/**`
- `packages/hub/src/actions/settings/action-settings-resolver.ts`
- `packages/hub/src/property-inspector/App.tsx`
- `packages/hub/src/property-inspector/panels/**`
- `packages/hub/src/property-inspector/select-options/**`
- `packages/hub/src/property-inspector/settings-sync/**`
- `packages/hub/src/property-inspector/stream-deck/**`

Estimated code size: `700-1,100` lines.

Work:

- Register the new action UUID under the System action family.
- Use visible name `System & Battery`.
- Add the action class and route it through the existing `MetricAction` style
  lifecycle where possible.
- Add view-builder logic for percent, N/A, stale/no-data, and transport-tagged
  labels.
- Keep it as a single-metric style action unless the current action framework
  requires a domain-specific wrapper.
- Add the System & Battery settings panel.
- Show one top-level Battery selector with a flat option list:
  - `System`
  - `[Bluetooth] ...`
  - `[Dongle] ...`
  - `[Wired] ...`
- Add the experimental USB receiver/wired checkbox using the exact product
  wording from this document.
- When the checkbox is off, hide vendor HID choices and keep existing selected
  vendor HID actions on the no-data path.
- Fetch live battery device options only when the Battery PI panel opens.
- Keep discovered devices as PI/runtime facts. Do not write option lists into
  settings.

Rules:

- Do not create a standalone Battery action.
- Do not add battery branches to CPU/GPU/Disk/Network action files.
- Do not load `node-hid` from the action constructor or module top level.
- Do not start discovery from plugin startup.
- Do not enumerate HID at PI app startup.
- Do not import `node-hid` into React/PI code.
- Do not show unsupported/unknown devices in normal UI.
- Do not mention manufacturer software by name unless it is relevant to the
  detected device family or installation.

Done when:

- The Stream Deck manifest lists one new `System & Battery` action.
- `resolveStreamDeckActionKind` can resolve the new action kind.
- The action renders no-data safely with no runtime source available.
- The action registers and unregisters background subscriptions on appear and
  disappear.
- PI tests cover the checkbox default, disabled state, and selected vendor HID
  no-data state.
- PI tests prove device options are runtime facts and are not persisted.
- Opening non-battery action panels cannot request battery HID discovery.

This step must not be merged with protocol parsers. The action and PI own
product surface, settings patches, and cheap lifecycle behavior; protocol
readers own hardware I/O.

## Step 3. Implement Built-In System Battery Telemetry

Likely locations:

- `packages/hub/src/runtime/sources/node-system/node-system-source.ts`
- `packages/hub/src/runtime/sources/node-system/node-system-source-types.ts`
- `packages/hub/src/runtime/sources/node-system/node-system-source.test.ts`
- `packages/hub/src/runtime/source-capabilities/node-system-platform-capabilities.ts`
- `packages/hub/src/runtime/metric-keys.ts`
- `packages/hub/src/runtime/source-routing/metric-source-preferences.ts`

Estimated code size: `250-500` lines.

Work:

- Add system battery readings through standard Node/system APIs.
- Support Windows laptops and MacBooks.
- Add percent first. Add charging or power-source display state only when the
  System action has a concrete runtime display context for it. Add time
  remaining, cycle count, health, adapter watts, and thermal pressure only when
  the platform API exposes them reliably and there is a display contract for
  them.
- Route system battery through `node-system`.

Rules:

- This step must not depend on `node-hid`.
- This step must still work when experimental USB receiver/wired battery is
  disabled.
- This step must use the system battery polling choices, including `60s`.

Done when:

- Unit tests cover battery present, battery absent, charging, discharging, and
  unavailable platform data.
- `node-system` does not regress CPU/GPU/Disk/Network tests.
- A laptop/MacBook without private HID support can still use System & Battery.

This step must not be merged with vendor HID. System battery is standard OS
telemetry and has a different risk profile.

## Step 4. Add Vendor HID Lazy Loader And Security Boundary

Likely locations:

- `packages/hub/package.json`
- `packages/hub/package-lock.json`
- `packages/hub/src/runtime/sources/battery-hid/native-hid-loader.ts`
- `packages/hub/src/runtime/sources/battery-hid/native-hid-loader.test.ts`
- packaging/build scripts under `packages/hub/scripts/**` or
  `packages/installer/**`
- packaging-owned native addon hash allowlist under the packaging script owner,
  not under `src/runtime/**`

Estimated code size: `300-600` lines.

Work:

- Add `node-hid` as a normal Hub dependency with an exact version and committed
  lockfile.
- Create one lazy loader module that owns `require("node-hid")`.
- No other production file may import or require `node-hid`.
- Add Windows and macOS native addon hash allowlist entries for packaged
  artifacts:
  - Windows x64;
  - Windows arm64;
  - macOS x64;
  - macOS arm64.
- Verify allowed `.node` SHA-256 values before packaging.
- Disable install scripts during package assembly.

Rules:

- Do not verify `.node` hash at every runtime load. Packaging-time verification
  is the required user-facing performance boundary.
- Do not load the native addon at Hub startup.
- Do not put packaging-only native addon hashes in a runtime module.
- Do not implement a fallback that shells out to another executable.
- Do not request admin privileges.
- Do not call the Windows helper for this feature.

Done when:

- Unit tests or static tests prove only the lazy loader imports `node-hid`.
- Packaging validation fails if an unexpected `.node` binary is present.
- Packaging validation fails if an expected platform binary hash changes.
- Tests or packaging checks prove the dependency is exact-pinned before any HID
  protocol implementation depends on it.
- Hub can start without loading `node-hid`.

This step must not be merged with protocol parsing. The native dependency
boundary must be audited before any device-specific code depends on it.

## Step 5. Implement Battery Discovery, Identity, And Coalescing

Likely locations:

- `packages/hub/src/runtime/sources/battery/**`
- `packages/hub/src/runtime/sources/battery-hid/**`
- `packages/hub/src/runtime/sources/source-planning-metadata.ts`
- `packages/hub/src/actions/shared/**` only for action-facing runtime option
  cache if the existing pattern requires it.
- `packages/hub/src/property-inspector/select-options/runtime-select-options.ts`

Estimated code size: `650-1,050` lines.

Work:

- Implement a battery device discovery service that returns descriptors, not
  metric samples.
- Merge candidates into physical devices using the identity and coalescing
  standard from this document.
- Return connection transport enum and receiver kind for every descriptor.
- Hide unsupported and unknown devices from normal UI.
- Preserve source-path diagnostics for logs and developer tooling.
- Support session-only conflict splitting when coalesced paths report repeated
  large disagreements.

Rules:

- Do not persist discovered descriptors.
- Do not use HID path as the only stored binding.
- Do not coalesce duplicate same-model devices unless only one candidate exists
  or a per-unit id matches.
- Do not average conflicting battery values.

Done when:

- Unit tests cover exact unit id match, unique model fallback, duplicate model
  ambiguity, receiver slot not being identity, Easy-Switch slot not being
  identity, and conflict split.
- Tests cover Bluetooth/receiver coalescing preference: prefer fresh Bluetooth
  OS telemetry for display when available because it avoids vendor HID.
- Tests prove disabling experimental vendor HID does not break an already
  stored vendor HID binding.

This step must not be merged with Logitech or ASUS protocol implementation.
Identity/coalescing must be protocol-neutral before protocol readers attach to
it.

## Step 6. Implement Logitech HID++ Battery Support

Likely locations:

- `packages/hub/src/runtime/sources/battery-hid/logitech/**`
- `packages/hub/src/runtime/sources/battery-hid/native-hid-loader.ts`
- `packages/hub/src/runtime/sources/battery/**`
- `scripts/battery/probe-logitech-current-state.mjs`
- `scripts/battery/stress-logitech-mx-battery.mjs`

Estimated code size: `650-1,000` lines.

Work:

- Implement Logitech HID++ feature discovery.
- Support devices that expose known battery features and pass strict parsing.
- Use local MX Master Bolt/Unifying results plus OpenLogi and Mouser protocol
  cross-checks as the implementation references.
- Support Bolt and Unifying discovery first.
- Keep G-series/LIGHTSPEED as best-effort if known receiver/device collections
  are discovered and feature discovery succeeds.
- Show Easy-Switch slot number when available.
- Do not read or write Logitech host names in v1.

Required feature behavior:

- `BATTERY_STATUS 0x1000`: parse only matching slot, feature index, and function
  id.
- `UNIFIED_BATTERY 0x1004`: parse only matching slot, feature index, and
  function id.
- `CHANGE_HOST 0x1814`: read current Easy-Switch slot number only.
- `DEVICE_INFORMATION 0x0003`: read unit identity once during discovery when
  needed, then cache for the session.

Rules:

- Do not hard-code support to MX Master only.
- Do not trust receiver slot as cross-transport identity.
- Do not use host names in v1.
- Do not poll unsupported feature ids repeatedly.
- Do not convert unknown battery status bytes into user-facing booleans.

Done when:

- Unit tests cover feature lookup, battery status, unified battery, Easy-Switch
  slot, unrelated interleaved reports, timeout, malformed reports, and no-data.
- Tests prove a discovered non-MX Logitech device with a supported feature can
  pass through the same parser.
- Tests prove unsupported Logitech devices are hidden from normal UI.

This step must not be merged with ASUS. Logitech is feature-driven; ASUS is
allowlist/fixed-offset. Combining them will blur the safety rules.

## Step 7. Implement ASUS ROG Battery Support

Likely locations:

- `packages/hub/src/runtime/sources/battery-hid/asus-rog/**`
- `packages/hub/src/runtime/sources/battery-hid/native-hid-loader.ts`
- `packages/hub/src/runtime/sources/battery/**`
- `scripts/battery/probe-rog-omni-keyboard-battery.mjs`
- `scripts/battery/probe-rog-wired-keyboard-battery.mjs`
- `scripts/battery/stress-rog-rx96-battery.mjs`

Estimated code size: `650-1,050` lines.

Work:

- Implement verified ASUS ROG keyboard support:
  - RX96 Omni/wired;
  - Falchion RX Low Profile Omni/wired;
  - Azoth wireless/wired.
- Use OpenRGB only as PID/interface discovery evidence for keyboards.
- Implement ROG mouse support as theory-backed experimental support:
  - use G-Helper as protocol and compatibility reference;
  - implement the actual reader in ShoMetrics with `node-hid`;
  - copy or adapt GPL-compatible code only when it is useful, narrow, and
    isolated in clearly attributed file(s);
  - publish experimental battery percentages for matched allowlisted model
    families even before local mouse validation;
  - treat unsupported or unmatched ASUS mouse models as no-data.

Required keyboard behavior:

- Omni keyboard path:
  - VID/PID `0x0B05/0x1ACE`;
  - `MI_02&Col02`;
  - usage page `0xFF00`;
  - request `02 12 01 + zero padding`;
  - success response `02 12 01 ...`;
  - battery `response[6]`;
  - charging byte `response[9]`.
- Wired-style keyboard path:
  - VID `0x0B05`;
  - `MI_01`;
  - usage page `0xFF00`;
  - request `12 01 + zero padding`;
  - success response `12 01 ...`;
  - battery `response[5]`;
  - charging byte `response[8]`.

Rules:

- ASUS support is allowlist-based.
- Do not broadly probe unknown ASUS devices.
- Do not issue SET, pairing, firmware, RGB, profile, macro, polling-rate, or
  keymap commands.
- Do not open standard keyboard/mouse input collections.
- Do not follow bootloader or firmware-update PIDs.
- Discard unrelated reports such as `12 03`, `12 08`, `12 12`, `12 14`,
  `12 16`, `22 01`, `25 01`, and `7D 20`.
- Unknown charging/status bytes remain diagnostics only.

Done when:

- Unit tests cover Omni keyboard parse, wired keyboard parse, no-data parse,
  unrelated report discard, malformed report no-data, and charging whitelist.
- Tests prove unknown ASUS PIDs are not probed in normal mode.
- Tests prove theory-backed ROG mouse families are marked experimental and
  unmatched mouse models are no-data.
- Tests document that theory-backed ROG mouse percentages are accepted as an
  experimental product risk until local mouse hardware is verified.
- Tests prove parsed percentages outside `0-100` are no-data for ASUS keyboard
  and theory-backed ASUS mouse paths.

This step must not be merged with Logitech. ASUS is not self-describing and
must keep stricter allowlist behavior.

## Step 8. Wire Battery Sources Into Runtime Collection, Rendering, And Diagnostics

Likely locations:

- `packages/hub/src/runtime/sources/source-registry.ts`
- `packages/hub/src/runtime/sources/source-client.ts`
- `packages/hub/src/runtime/sources/source-polling-groups.ts`
- `packages/hub/src/runtime/metric-collection/**`
- `packages/hub/src/runtime/source-routing/metric-read-plan-builder.ts`
- `packages/hub/src/runtime/source-routing/metric-source-preferences.ts`
- `packages/hub/src/actions/system/**`
- `packages/hub/src/actions/shared/background-collection-binding.ts`
- `packages/hub/src/actions/shared/displayed-metric-no-data-observer.ts`
- `packages/hub/src/actions/shared/helper-backed-widget-data.ts`
- `packages/hub/src/property-inspector/panels/MetricSourceDiagnostic.tsx`
- `packages/hub/src/view-rendering/**` only if existing render contracts cannot
  display the needed text.

Estimated code size: `550-900` lines.

Work:

- Register the system battery source path without native HID.
- Register the vendor HID battery source behind the lazy loader and
  experimental toggle.
- Make configured vendor HID actions refresh after Stream Deck restart when
  the toggle is enabled.
- Use peripheral polling intervals for peripheral readings and system polling
  intervals for built-in computer battery readings.
- Ensure source no-data, disabled, unsupported, timeout, malformed, and
  unavailable states flow through existing no-data handling.
- Display battery percent when available.
- Display N/A through the existing no-data path when disabled, unavailable,
  unsupported, stale, malformed, or timed out.
- Show transport tag in the PI option label, not necessarily on the key image.
- Preserve source diagnostics for selected path, selected source id,
  experimental status, and no-data reason.

Rules:

- Do not scan hardware from plugin startup.
- Do not register recurring vendor HID work when no action is bound and no PI
  panel requested discovery.
- Do not add a new scheduler just for battery if existing background collection
  can own polling.
- Do not write runtime descriptors into settings.
- Do not invent a separate Battery error UI if existing no-data handling works.
- Do not show unsupported devices in ordinary selection UI.
- Do not show host names for Logitech.
- Do not imply manufacturer software is installed unless detected or directly
  relevant to the device family.

Done when:

- Tests prove plugin startup creates no HID discovery call.
- Tests prove opening the Battery PI can request discovery.
- Tests prove an existing bound vendor HID action can poll after restart when
  the toggle is enabled.
- Tests prove the same bound action shows no-data/N/A when the toggle is
  disabled.
- Tests prove `onWillDisappear` cleans up action-owned subscriptions.
- Action tests cover percent, no-data, disabled experimental toggle, stale
  sample, and coalescing conflict.
- PI tests cover labels `[Bluetooth]`, `[Dongle]`, and `[Wired]`.
- No-data logging is throttled and does not emit per polling tick forever.

This step must not be merged with packaging. Runtime behavior and user-visible
states should be correct before distribution hardening is added.

## Step 9. Add Packaging And Native Addon Hardening

Likely locations:

- `packages/hub/package.json`
- `packages/hub/package-lock.json`
- `packages/hub/scripts/**`
- `packages/installer/**`
- `.github/workflows/**` if packaging checks run in CI
- `docs/development/runtime-sources/06-battery/01-hid-battery-experiment-report.md`
  only if the hash evidence changes.

Estimated code size: `250-500` lines.

Work:

- Verify the lockfile already pins `node-hid` exactly.
- Disable install scripts during package assembly.
- Include only target platform `.node` binaries for Windows and macOS package
  outputs.
- Verify `.node` SHA-256 values before packaging.
- Add a packaged Stream Deck smoke test that loads the addon under the selected
  sideloaded Node runtime.
- Add a macOS vendor HID permission gate: verify that opening ASUS/Logitech
  vendor-defined `0xFF00` collections from the packaged plugin does not require
  Input Monitoring/TCC permission. If it does, macOS vendor HID must remain off
  by default until there is an explicit UX decision.
- Keep runtime load failure as source no-data, not plugin crash.

Rules:

- Do not runtime-hash every load.
- Do not package unneeded architectures into a release artifact.
- Do not allow postinstall scripts in release packaging.
- Do not silently update allowed hashes.

Done when:

- Packaging fails on missing native binary, unexpected native binary, or hash
  mismatch.
- Packaged smoke test proves the selected Stream Deck Node runtime can load the
  addon.
- macOS packaged validation records whether vendor HID access triggers Input
  Monitoring/TCC. This is a release gate for default-on macOS vendor HID, not a
  blocker for Windows implementation.
- Windows and macOS package plans each name their included native addon hashes.

This step must not be merged with runtime implementation. Packaging hardening is
the release boundary and must be reviewable independently.

## Step 10. Validate With Tests, Scripts, And Manual Hardware Runs

Likely locations:

- `packages/hub/src/**/*.test.ts`
- `packages/hub/src/**/*.pi.test.tsx`
- `scripts/battery/**`
- `docs/development/runtime-sources/06-battery/01-hid-battery-experiment-report.md`
- `docs/development/runtime-sources/06-battery/02-implementation-plan.md`

Estimated code size: `350-650` lines.

Work:

- Add unit tests for every parser and identity fallback.
- Add PI tests for settings, option list behavior, hidden unsupported devices,
  and disabled experimental toggle.
- Add runtime tests for lazy loading and no startup HID discovery.
- Keep scripts for manual HID verification:
  - `scripts/battery/probe-devices.mjs`;
  - `scripts/battery/probe-rog-omni-keyboard-battery.mjs`;
  - `scripts/battery/probe-rog-wired-keyboard-battery.mjs`;
  - `scripts/battery/probe-logitech-current-state.mjs`;
  - `scripts/battery/stress-rog-rx96-battery.mjs`;
  - `scripts/battery/stress-logitech-mx-battery.mjs`;
  - `scripts/battery/keyboard-raw-input-logger.ps1`.
- Run manual Windows validation on:
  - built-in battery if available;
  - RX96/Falchion/Azoth ROG keyboard paths;
  - MX Master Bolt/Unifying paths;
  - disabled experimental toggle with previously configured vendor HID action.
- Run macOS validation later for:
  - built-in MacBook battery;
  - Bluetooth battery;
  - vendor HID permission behavior for `0xFF00` collections;
  - vendor HID support when hardware is available.

Rules:

- Do not promote ROG mouse from theory-backed to verified until local mouse
  hardware is tested.
- Do not promote macOS vendor HID from unverified to verified until tested on
  macOS.
- Do not use stress script rates as product polling rates.

Done when:

- `npm.cmd run test:unit` passes.
- Relevant PI tests pass.
- Packaging native-addon validation passes.
- Manual script outputs are summarized in the research report when they change
  support claims.

This step must not be merged with feature implementation. Validation owns the
evidence that support claims are true.

## Implementation Stop Conditions

Stop and update this plan before coding if any of these happen:

- `node-hid` cannot be lazy-loaded without being pulled into startup bundles.
- The existing settings model cannot persist a peripheral identity bundle
  without leaking runtime descriptors into settings.
- The existing background collection scheduler cannot express separate system
  and peripheral polling intervals.
- A protocol implementation requires SET/write operations beyond the read-only
  GET/report paths described here.
- macOS vendor HID access to `0xFF00` collections triggers Input Monitoring/TCC
  permission and there is no approved UX for that prompt.
- macOS packaging requires a native addon path that conflicts with Windows
  packaging hardening.
- A GPL-compatible source file has a conflicting file-level license/header, or
  the implementation needs to vendor a large unrelated subsystem instead of a
  narrow battery reader.
- Copied or adapted GPL-compatible code cannot be isolated in clearly
  attributed file(s).

## Non-Goals

- No admin service.
- No Windows helper integration for this feature.
- No extra executable.
- No firmware, RGB, pairing, profile, macro, polling-rate, or keymap writes.
- No broad unknown ASUS probing.
- No standalone Battery action.
- No host-name reading or writing for Logitech v1.
- No product claim that all ROG or all Logitech devices are supported.
