# Color Compensation Storage Integration Plan

This plan describes how the stored `ColorCompensationSettings` proto becomes
runtime Stream Deck output behavior without leaking generated settings shapes
through the renderer, actions, or ordinary Property Inspector settings model.

## Boundary Invariant

Color compensation touches the global settings storage boundary and the final
hardware image update boundary.

The invariant:

- Stored proto owns persistence.
- The color compensation domain owns profile math, draft state, and target
  matching.
- Resolved widget/global settings do not expose color compensation until a
  future device-aware runtime contract intentionally needs it.
- Rendering primitives and metric view builders do not know that compensation
  exists.
- Only the final key image path may apply a hardware-only compensation profile.

## Fixed Decisions

- Use the existing `ColorCompensationProfile` domain type as the app contract.
- Store the saved profile in `StoredGlobalSettings.color_compensation.fallback_profile`.
- Keep `target_profiles` storage-only for now. POC writes leave it empty and
  runtime readers ignore it.
- Do not add color compensation to `ResolvedGlobalSettings` in the first stored
  implementation.
- Do not make compensation per-widget. The profile describes Stream Deck display
  behavior, not one widget's metric or paint choice.
- Do not persist draft setup values before the user explicitly saves.
- Keep software preview unadjusted and hardware image compensated.
- Keep stale future per-device profiles in storage until the user explicitly
  removes them. Device disconnect is not proof that the device was deleted.

## Terminology

Use "color compensation", "profile", "setup", "adjust", and "preview".

Avoid "calibration" in code identifiers and user-facing copy. The feature does
not measure hardware, does not create an ICC profile, and cannot guarantee color
accuracy. Documentation may use "calibration" only when explicitly saying this
is not hardware color calibration.

"Wizard" remains the existing PI component name for the guided multi-step UI,
such as `ColorCompensationWizard` and `COLOR_COMPENSATION_WIZARD_STEPS`. "Setup"
is the broader feature noun for new runtime/session artifacts. Do not rename
existing Wizard-named code as part of this storage integration.

## Current State vs Target State

| Area | Current POC | Target stored integration |
|---|---|---|
| Saved profile | Runtime-only React state plus plugin singleton | `StoredGlobalSettings.color_compensation.fallback_profile` |
| Draft setup profile | PI reducer state | Same: PI reducer state only |
| Plugin preview state | Runtime map by action id | Runtime preview session by action id plus session id |
| Other widgets during setup | Should keep using committed profile | Must never see the draft profile |
| Renderer | SVG filter can wrap a completed SVG | Same; no storage imports |
| Resolved settings | No compensation field | Still no compensation field |
| Device-specific storage | Proto shape exists | Ignored until a dedicated target-aware runtime change |

## Ownership Model

### `contracts/proto`

Owns persisted shape only:

```txt
StoredGlobalSettings
  -> ColorCompensationSettings
     -> fallback_profile
     -> target_profiles
```

The proto does not own runtime defaults, active devices, connected-device lists,
or the currently edited draft.

### `settings/storage`

Owns generated proto conversion and validation.

Add:

```txt
packages/hub/src/settings/storage/color-compensation-settings.ts
```

Responsibilities:

- Convert generated `ColorCompensationProfile` messages to the domain
  `ColorCompensationProfile`.
- Convert the domain profile back to generated proto before writing.
- Read `fallback_profile`, defaulting to `DEFAULT_COLOR_COMPENSATION_PROFILE`
  when absent.
- Write or clear only `color_compensation.fallback_profile`.
- Leave `target_profiles` untouched.

Proposed API:

```ts
export function readStoredColorCompensationProfile(
    storedGlobalSettings: StoredGlobalSettings | undefined,
): ColorCompensationProfile;

export function writeStoredColorCompensationProfile(
    rawGlobalSettings: unknown,
    profile: ColorCompensationProfile,
): StoredSettingsJsonObject;

export function clearStoredColorCompensationProfile(
    rawGlobalSettings: unknown,
): StoredSettingsJsonObject;
```

`clearStoredColorCompensationProfile()` clears only `fallback_profile`. It must
preserve the parent `color_compensation` message and any future `target_profiles`
data. Do not aggressively delete the parent message just because the current POC
does not write target profiles.

This is deliberately not added to the broad `StoredGlobalSettingsPatch` first.
The normal global settings patch is for global appearance/default controls;
color compensation is a device-output domain with its own setup flow.

### `color-compensation`

Owns domain concepts and runtime state.

Existing domain files should stay storage-free:

```txt
packages/hub/src/color-compensation/types.ts
packages/hub/src/color-compensation/transform.ts
packages/hub/src/color-compensation/messages.ts
packages/hub/src/color-compensation/patterns.ts
```

Add:

```txt
packages/hub/src/color-compensation/runtime-store.ts
```

`runtime-store.ts` starts as the single runtime owner for committed profiles and
volatile setup previews. Do not add a separate `setup-session-store.ts` until
the implementation is large enough that the two responsibilities are genuinely
hard to read in one file.

Committed-profile responsibilities:

- Hold the committed runtime profile derived from stored global settings.
- Subscribe to `pluginGlobalSettingsStore` or receive stored global settings
  updates from plugin bootstrap.
- Expose one narrow read API for the render/update path.
- Later, match `target_profiles` by `(stream_deck_device_id, surface_id)` before
  falling back to `fallback_profile`.

Proposed API:

```ts
export interface ColorCompensationTargetContext {
    readonly streamDeckDeviceId: string | undefined;
    readonly surfaceId: string | undefined;
}

export interface ColorCompensationProfileRequest extends ColorCompensationTargetContext {
    readonly actionId: string;
}

export function updateCommittedColorCompensationProfileFromStoredSettings(
    storedGlobalSettings: StoredGlobalSettings | undefined,
): void;

export function resolveHardwareColorCompensationProfile(
    request: ColorCompensationProfileRequest,
): ColorCompensationProfile;
```

Setup-preview responsibilities:

- Hold volatile setup preview sessions only.
- Scope every preview to `actionId` plus a generated `sessionId`.
- Distinguish sample-pattern preview from widget before/after preview.
- Clear stale sessions on cancel, save, PI unmount, action disappear, or session
  mismatch.
- Never write storage.

Proposed session API:

```ts
export interface ColorCompensationSetupSession {
    readonly actionId: string;
    readonly sessionId: string;
    readonly profile: ColorCompensationProfile;
    readonly previewKind: ColorCompensationPreviewKind;
}

export function setColorCompensationSetupPreview(session: ColorCompensationSetupSession): void;
export function clearColorCompensationSetupPreview(actionId: string, sessionId: string): void;
export function clearColorCompensationSetupPreviewForAction(actionId: string): void;
export function shouldSuppressMetricViewForColorCompensation(actionId: string): boolean;
```

`sessionId` is in addition to `actionId` because the same action can host
multiple sequential setup sessions. A cancel or preview message from an earlier
session must not clear or overwrite a later session after the user closes and
reopens setup for the same key.

Split `runtime-store.ts` only when the file exceeds roughly 200 lines or when
committed profile state and setup preview state become entangled in real code.

### Property Inspector

Owns draft editing and save intent.

Update:

```txt
packages/hub/src/property-inspector/settings-sync/usePropertyInspectorSettings.ts
packages/hub/src/property-inspector/color-compensation/*
packages/hub/src/property-inspector/panels/WidgetSettingsTab.tsx
```

`usePropertyInspectorSettings` remains the only PI owner of Stream Deck settings
load/save lifecycle. It should expose a focused color-compensation API instead
of making the wizard call `getGlobalSettings()` or `setGlobalSettings()`
directly.

Proposed hook return addition:

```ts
colorCompensation: {
    readonly profile: ColorCompensationProfile;
    saveProfile(profile: ColorCompensationProfile): Promise<void>;
    resetProfile(): Promise<void>;
}
```

Rules:

- The wizard reducer owns draft values until the user saves.
- Preview slider changes send PI-to-plugin preview messages only.
- `Done` first saves global settings through the hook. Only after save succeeds
  should the PI close the setup flow and tell the plugin to end preview mode.
- Save failure keeps the draft visible and does not commit runtime state.
- `saveProfile` and `resetProfile` propagate underlying Stream Deck settings
  errors. Callers keep the local draft visible and show the failure; the hook
  does not silently retry.
- `Cancel` clears plugin preview and discards the draft.

### Actions

Actions should not understand compensation details.

Current POC code in `MetricAction` should shrink to a thin message route:

```txt
MetricAction.onSendToPlugin
  -> colorCompensationPluginController.handleSendToPlugin(event, activeActionState)
```

Add:

```txt
packages/hub/src/color-compensation/plugin-controller.ts
```

Responsibilities:

- Parse color compensation PI messages.
- Own sample preview rendering requests.
- Own widget before/after preview requests.
- Clear setup sessions when the active action disappears.
- Ask the action to refresh its current metric view when preview mode changes.

`MetricAction` may keep the generic call because it owns action lifecycle, but
it must not branch on preview kind, profile fields, or pattern names.

### View Updates

The metric view update runner is the only normal widget path that needs the
committed profile.

Update:

```txt
packages/hub/src/view-updates/runner.ts
packages/hub/src/view-updates/dispatch.ts
packages/hub/src/view-updates/color-compensation-preview.ts
```

Rules:

- Compose the software SVG exactly as today.
- Resolve the hardware profile at the runner/update boundary.
- If the profile has no effect, rasterize once and call `setImage()` once.
- If the profile has effect, wrap only the hardware SVG, rasterize software and
  hardware PNGs, then call `Target.Software` and `Target.Hardware`.
- `dispatch.ts` receives already-rendered software/hardware PNG URLs; it does
  not know profile semantics.
- Touch strip and other encoder surfaces apply the same `fallback_profile` as
  keypad surfaces until surface-specific `target_profiles` support is
  intentionally added. They are not specially excluded from compensation.

The runner should not introduce a provider interface for one production
function. Prefer a direct import of `resolveHardwareColorCompensationProfile()`.
If tests need injection, use a function type alias instead of an interface:

```ts
export type ResolveHardwareColorCompensationProfile = (
    request: ColorCompensationProfileRequest,
) => ColorCompensationProfile;
```

This avoids threading a profile through every action and render builder without
creating a one-method strategy abstraction.

### Rendering

`view-rendering/color-compensation-filter.ts` remains the only rendering file
that knows how to turn a domain profile into SVG filter output.

Rules:

- No generated proto imports.
- No stored settings imports.
- No action or PI imports.
- It receives only `ColorCompensationProfile`.

## Runtime Draft Flow

```txt
PI wizard reducer draft
  -> preview message with action id context and session id
  -> plugin runtime store
  -> sample preview OR widget preview for the active action only
  -> user saves
  -> PI writes StoredGlobalSettings.color_compensation.fallback_profile
  -> plugin committed profile state updates from global settings event
  -> setup session clears
  -> active widgets render with committed profile
```

Draft isolation rules:

- Draft lives in the PI reducer.
- Plugin preview state is volatile and action-scoped.
- Other actions never read the draft.
- A pattern preview suppresses only the metric view for the current action.
- A widget preview applies the draft only to the current action's hardware
  image.
- Cancel, action disappear, PI unmount, or session mismatch clears preview and
  restores the committed profile.

This prevents the common failure mode where a half-edited profile silently
changes other widgets before the user saves.

## Future Device-Specific Profiles

Current implementation:

- Read and write only `fallback_profile`.
- Leave `target_profiles` empty.
- Ignore `target_profiles` when resolving the hardware profile.

Future implementation:

```txt
resolveHardwareColorCompensationProfile(request)
  -> match target_profiles by stream_deck_device_id + surface_id
  -> fallback_profile
  -> DEFAULT_COLOR_COMPENSATION_PROFILE
```

Device identity:

- Use `ActionContext.device.id` or `Device.id` when available through the SDK
  action context.
- Do not derive identity from model, display name, size, or coordinates.
- Two Stream Deck XLs must produce two different target ids.

Surface identity:

- Leave `surface_id` unset for current fallback behavior.
- Future support may set lowercased SDK controller values such as `"keypad"` or
  `"encoder"`.
- Do not invent a random UUID per surface; the value must be stable and
  deterministic for matching.

Stale devices:

- Do not automatically delete target profiles for devices that are not
  connected.
- A disconnected device may belong to a home/office setup and should retain its
  profile.
- Future UI can show "not currently connected" and offer "Forget this device
  profile" or "Reset all compensation".

## Implementation Steps

### Step 1: Generate Proto Types

Run the existing generation script after the proto shape is accepted.

Acceptance:

- Generated TypeScript includes `ColorCompensationSettings`,
  `TargetColorCompensationProfile`, and `ColorCompensationProfile`.
- `npm.cmd run proto:lint` and `npm.cmd run proto:build` pass.
- No handwritten generated-type mirror is introduced.

### Step 2: Add Storage Adapter

Add `settings/storage/color-compensation-settings.ts`.

Acceptance:

- Tests cover read absent profile, read populated profile, clamp/validation
  expectations, write profile, and clear profile.
- Tests prove `target_profiles` survive fallback profile writes unchanged.
- No `ResolvedGlobalSettings` field is added.

### Step 3: Expose Stored Profile To PI

Update `usePropertyInspectorSettings` to expose the focused
`colorCompensation` object.

Acceptance:

- PI components receive a domain `ColorCompensationProfile`, not generated proto.
- The wizard does not call Stream Deck settings APIs directly.
- Existing global settings controls continue using existing patch APIs.
- No duplicated PI settings model is introduced.

### Step 4: Replace Runtime-Only Profile With Committed Store

Move committed profile state into `color-compensation/runtime-store.ts`.

Acceptance:

- Plugin startup reads stored global settings into the runtime store.
- Global settings updates refresh the committed profile.
- Existing widgets refresh when the committed profile changes.
- The store defaults to identity when global settings have no saved profile.

### Step 5: Isolate Setup Preview Sessions

Move preview state into `runtime-store.ts` and add `sessionId` to PI/plugin
messages.

Acceptance:

- Preview changes affect only the active action/session.
- Stale messages from a previous setup session are ignored.
- Cancel and action disappear clear preview.
- Save failure does not commit the draft profile.

### Step 6: Thin `MetricAction`

Move color compensation message handling from `MetricAction` into
`color-compensation/plugin-controller.ts`.

Acceptance:

- `MetricAction` delegates color compensation messages and lifecycle cleanup.
- `MetricAction` does not switch on compensation preview kinds.
- Concrete action classes remain unchanged.

### Step 7: Keep Hardware Application At The Final Image Boundary

Update `MetricViewUpdateRunner` to call the hardware profile resolver at the
final image boundary.

Acceptance:

- Actions do not pass profile values.
- Metric view builders do not pass profile values.
- Renderer primitives do not receive profile values.
- Software image remains unadjusted.
- Hardware image is adjusted only when the profile has an effect.

## Test Plan

Unit tests:

- Storage adapter read/write/clear.
- PI settings hook save/reset behavior for color compensation.
- Wizard save failure keeps draft and does not send final commit.
- Runtime store isolates setup preview by action id and session id.
- `MetricAction` delegates and clears preview on disappear.
- Runner rasterizes once for identity profile and twice for effective profile.
- Renderer filter remains a pure profile-to-SVG transform.

Integration/manual checks:

- Start plugin with no profile: software and hardware images match.
- Save profile: hardware image changes, software preview stays unchanged.
- Cancel setup: current key returns to committed profile.
- Switch action during setup: old key clears preview; other widgets never use
  draft values.
- Reset profile: stored fallback profile is removed or reset to identity, and
  hardware/software images match again.

Visual tests:

- Run only when sample widget SVG, filter output, or PI visual layout changes.

## Explicit Non-Goals

- Do not implement target-aware matching from `target_profiles` yet.
- Do not add recommended presets yet.
- Do not add ICC, OS color profile, monitor detection, or hardware measurement.
- Do not persist draft setup sessions.
- Do not add color compensation to metric source, metric store, widget data, or
  resolved widget settings.
- Do not add one-off compatibility paths for old runtime-only POC state.

## Architecture Self-Check

- No duplicated PI settings model: PI receives a narrow domain profile plus
  save/reset functions from the existing settings sync owner.
- No resolved defaults persisted: stored fallback profile is sparse user intent;
  identity default stays in domain code.
- No renderer import of storage schema: rendering receives only
  `ColorCompensationProfile`.
- No legacy string compatibility path: profile fields use generated proto at
  storage and domain numbers everywhere else.
- No broad option bag: the render/update boundary asks one provider for one
  hardware profile.
