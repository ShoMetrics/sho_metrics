# Property Inspector Readiness Refactor Plan

## Problem

Property Inspector currently lets unresolved external inputs look like real
resolved values.

Examples:

- Missing widget settings during startup can look like a real `unknown` action
  and briefly render recovery UI.
- Disk volume options that have not arrived yet can look like an empty list and
  briefly render "No detected volumes".
- Global settings that have not loaded yet can resolve to default global
  settings and briefly look like appearance override is disabled.

The root cause is not one slow SDK call. The root cause is that readiness is not
modeled as part of the Property Inspector session contract.

Resolver defaults are still correct, but UI must not treat defaults from
pending inputs as final user-visible state.

## Invariant

```txt
pending != empty
pending != override off
pending != domain mismatch
pending != final defaults
```

Property Inspector UI may consume resolved settings only after the external
input that produced those resolved settings is ready.

## Ownership

- `settings/storage/*` owns unknown SDK settings decoding, generated proto, and
  stored-to-resolved conversion.
- `usePropertyInspectorSettings` owns Stream Deck settings load/save/subscribe
  lifecycle and readiness.
- Property Inspector panels own display decisions and sparse patch writes.
- Runtime option lists are runtime facts; they stay ephemeral and are exposed to
  PI through runtime cache plus readiness.

Do not add a second settings model, PI settings mirror, or compatibility parser.

## Step 1: Add A Small Load Status Type

Use one small lifecycle type:

```ts
type LoadStatus = "pending" | "ready" | "failed";
```

The status only answers whether an external source is ready. It does not carry
business values or display text.

`ready` means the Property Inspector has a trustworthy value for rendering. It
does not necessarily mean the background refresh request has completed. For
widget settings, the initial `connectionInfo.actionInfo.payload.settings` value
can make the widget settings source ready for first paint; `getSettings()` still
runs afterward as a refresh.

## Step 2: Add Readiness To Settings Sync State

Add settings readiness beside the raw external inputs. Do not put readiness into
stored settings or resolved settings.

```ts
interface SettingsSyncState {
    actionKind: ActionKind;
    isWindows: boolean;
    rawSettings: unknown;
    rawGlobalSettings: unknown;

    widgetSettingsStatus: LoadStatus;
    globalSettingsStatus: LoadStatus;

    runtimeCache: WidgetRuntimeCache;
    runtimeCacheStatus: PropertyInspectorRuntimeCacheStatus;

    widgetSettingsNotice: SettingsNotice | null;
    pluginSettingsNotice: SettingsNotice | null;
}
```

Initial state:

```ts
const initialState: SettingsSyncState = {
    actionKind: "unknown",
    isWindows: false,
    rawSettings: undefined,
    rawGlobalSettings: undefined,
    widgetSettingsStatus: "pending",
    globalSettingsStatus: "pending",
    runtimeCache: { ...emptyWidgetRuntimeCache },
    runtimeCacheStatus: {
        diskVolumeOptionsStatus: "pending",
    },
    widgetSettingsNotice: null,
    pluginSettingsNotice: null,
};
```

## Step 3: Collapse Load/Save Errors Into Notices

Do not keep parallel error strings such as `widgetLoadError` and
`pluginLoadError`.

`LoadStatus` owns lifecycle. `SettingsNotice` owns user-visible text.

Load failure:

```ts
commitState((currentState) => ({
    ...currentState,
    widgetSettingsStatus: "failed",
    widgetSettingsNotice: settingsLoadFailureNotice("widget"),
}));
```

Save failure:

```ts
client.setSettings(settingsJsonToPersist ?? {}).catch((error: Error) => {
    commitState((currentState) => ({
        ...currentState,
        widgetSettingsNotice: {
            kind: "warning",
            text: `Failed to save widget settings: ${error.message}`,
        },
    }));
});
```

App rendering:

```tsx
<SettingsNoticeSlot
    notice={activeTab === "widget" ? widgetSettingsNotice : pluginSettingsNotice}
/>
```

```tsx
function SettingsNoticeSlot({
    notice,
}: {
    notice: SettingsNotice | null;
}): React.JSX.Element | null {
    return notice ? <SettingsNoticeView notice={notice} /> : null;
}
```

## Step 4: Keep Widget First Paint, Then Refresh Independently

Use initial action payload for widget first paint, then refresh widget and global
settings independently. Do not wait for both requests before committing either
result.

When this step sets `widgetSettingsStatus: "ready"`, the source of truth is the
initial action payload. That status means "safe to render widget settings now",
not "`getSettings()` has finished".

```ts
async function loadPropertyInspectorSettings(
    client: StreamDeckPropertyInspectorClient,
    commitState: CommitSettingsSyncState,
    isDisposed: () => boolean,
): Promise<void> {
    const connectionInfo = await client.getConnectionInfo();
    const actionKind = resolveStreamDeckActionKind(readActionUuid(connectionInfo));
    const isWindows = resolveIsWindowsPropertyInspector(connectionInfo);

    if (isDisposed()) {
        return;
    }

    commitState((currentState) => {
        const widgetSettingsRead = readInspectorWidgetSettings(
            connectionInfo.actionInfo?.payload?.settings ?? currentState.rawSettings,
            actionKind,
        );

        return {
            ...currentState,
            actionKind,
            isWindows,
            rawSettings: widgetSettingsRead.rawSettings,
            widgetSettingsStatus: "ready",
            widgetSettingsNotice: widgetSettingsRead.notice,
        };
    });

    void refreshWidgetSettings(client, commitState, actionKind, isDisposed);
    void refreshGlobalSettings(client, commitState, isDisposed);
}
```

## Step 5: Split Widget Settings Refresh

Widget refresh owns only widget settings state. It must not wait for global
settings.

```ts
async function refreshWidgetSettings(
    client: StreamDeckPropertyInspectorClient,
    commitState: CommitSettingsSyncState,
    actionKind: ActionKind,
    isDisposed: () => boolean,
): Promise<void> {
    try {
        const payload = await client.getSettings();

        if (isDisposed()) {
            return;
        }

        commitState((currentState) => {
            const widgetSettingsRead = readInspectorWidgetSettings(payload.settings, actionKind);
            writeSettingsReadWarningLog(client, "widget", widgetSettingsRead.readWarning);

            return {
                ...currentState,
                rawSettings: widgetSettingsRead.rawSettings,
                widgetSettingsStatus: "ready",
                widgetSettingsNotice: widgetSettingsRead.notice,
            };
        });
    } catch {
        if (isDisposed()) {
            return;
        }

        commitState((currentState) => ({
            ...currentState,
            widgetSettingsStatus: "failed",
            widgetSettingsNotice: settingsLoadFailureNotice("widget"),
        }));
    }
}
```

## Step 6: Split Global Settings Refresh

Global refresh owns only plugin/global settings state. It must not wait for
widget settings.

```ts
async function refreshGlobalSettings(
    client: StreamDeckPropertyInspectorClient,
    commitState: CommitSettingsSyncState,
    isDisposed: () => boolean,
): Promise<void> {
    try {
        const payload = await client.getGlobalSettings();

        if (isDisposed()) {
            return;
        }

        commitState((currentState) => {
            const pluginSettingsRead = readInspectorPluginSettings(payload.settings);
            writeSettingsReadWarningLog(client, "plugin", pluginSettingsRead.readWarning);

            return {
                ...currentState,
                rawGlobalSettings: pluginSettingsRead.rawGlobalSettings,
                globalSettingsStatus: "ready",
                pluginSettingsNotice: pluginSettingsRead.notice,
            };
        });
    } catch {
        if (isDisposed()) {
            return;
        }

        commitState((currentState) => ({
            ...currentState,
            globalSettingsStatus: "failed",
            pluginSettingsNotice: settingsLoadFailureNotice("plugin"),
        }));
    }
}
```

## Step 7: Expose Readiness From The Hook

Return load statuses from `usePropertyInspectorSettings`.

```ts
return {
    actionKind: state.actionKind,
    visibilityContext,
    resolvedGlobalSettings,
    widgetSettingsStatus: state.widgetSettingsStatus,
    globalSettingsStatus: state.globalSettingsStatus,
    widgetSettingsNotice: state.widgetSettingsNotice,
    pluginSettingsNotice: state.pluginSettingsNotice,
    updateWidgetSettings,
    resetWidgetSettings,
    updateGlobalSettings,
};
```

## Step 8: Derive App Booleans Directly

Do not introduce a dedicated union such as `GlobalAppearanceOverrideState`.
That would wrap a simple derived boolean in a fake state object.

Use direct, honest values:

```ts
const isGlobalSettingsReady = globalSettingsStatus === "ready";
const isGlobalAppearanceOverrideEnabled =
    isGlobalSettingsReady && resolvedGlobalSettings.appearanceOverride !== undefined;
```

Pass only the derived override state to the widget tab:

```tsx
<WidgetSettingsTab
    context={visibilityContext}
    isGlobalAppearanceOverrideEnabled={isGlobalAppearanceOverrideEnabled}
    onSettingsPatch={updateWidgetSettings}
    onResetWidgetSettings={resetWidgetSettings}
/>
```

`isGlobalAppearanceOverrideEnabled` means global settings are ready and the
stored override is actually enabled.

## Step 9: Gate Widget Settings Rendering Only On Widget Readiness

`WidgetSettingsTab` should not render final widget settings UI while action kind
is still unknown. It should not block the whole tab on global settings readiness.
Global readiness only controls global-owned state such as appearance override
notices and appearance-control disabling.

```ts
interface WidgetSettingsTabProps {
    context: VisibilityContext;
    isGlobalAppearanceOverrideEnabled: boolean;
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
    onResetWidgetSettings: () => void;
}
```

```tsx
const isSettingsPending = context.actionKind === "unknown";
```

Keep the existing delayed notice pattern to avoid short blank-to-loading flicker:

```tsx
if (isSettingsPending) {
    return canShowPendingNotice
        ? (
            <InspectorItem className="note-item note-item-caption">
                <p className="section-note">Loading widget settings...</p>
            </InspectorItem>
        )
        : <></>;
}
```

After widget settings are ready:

```ts
const panelProps = {
    context,
    onSettingsPatch,
    appearanceDisabled: isGlobalAppearanceOverrideEnabled,
};
```

```tsx
{isGlobalAppearanceOverrideEnabled && (
    <InspectorItem className="note-item note-item-caption">
        <p className="section-note">
            Some settings are disabled since global override is enabled.
        </p>
    </InspectorItem>
)}
```

Expected behavior:

```txt
action/widget pending:
  no final widget controls, no mismatch/reset flash

global pending:
  widget controls render; appearance controls are treated as not globally disabled

global ready + override off:
  editable widget controls

global ready + override on:
  disabled appearance controls plus override notice
```

## Step 10: Apply Readiness To Runtime Option Lists

Use the same readiness rule for runtime option lists. Pending runtime facts must
not render as empty runtime facts.

```ts
interface PropertyInspectorRuntimeCacheStatus {
    readonly diskVolumeOptionsStatus: LoadStatus;
}
```

On runtime cache patch:

```ts
runtimeCacheStatus: {
    diskVolumeOptionsStatus: "availableDiskVolumes" in runtimeCachePatch
        ? "ready"
        : currentState.runtimeCacheStatus.diskVolumeOptionsStatus,
},
```

Disk volume options:

```ts
function buildDiskVolumeOptions(
    diskVolumeOptionsStatus: LoadStatus,
    diskVolumes: readonly DiskVolumeOption[],
): readonly SelectOption[] {
    if (diskVolumeOptionsStatus === "pending") {
        return [{ value: "", label: "Loading volumes...", disabled: true }];
    }

    if (diskVolumeOptionsStatus === "failed") {
        return [{ value: "", label: "Volumes unavailable", disabled: true }];
    }

    if (diskVolumes.length === 0) {
        return [{ value: "", label: "No detected volumes", disabled: true }];
    }

    return diskVolumes.map(toDiskVolumeOption);
}
```

## Step 11: Add Readiness Tests

Tests should assert readiness invariants, not implementation details.

Global settings pending:

```ts
test("widget settings renders widget controls before global settings load", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        isGlobalAppearanceOverrideEnabled: false,
    });

    assert.doesNotMatch(markup, /Some settings are disabled/);
    assert.match(markup, /Disk Metric/);
});
```

Global settings ready and override enabled:

```ts
test("widget settings disables appearance after global override is loaded enabled", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        isGlobalAppearanceOverrideEnabled: true,
    });

    assert.match(markup, /Some settings are disabled/);
    assert.match(markup, /Color Settings/);
});
```

Global settings ready and override disabled:

```ts
test("widget settings renders normally after global override is loaded disabled", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        isGlobalAppearanceOverrideEnabled: false,
    });

    assert.doesNotMatch(markup, /Some settings are disabled/);
    assert.match(markup, /Color Settings/);
});
```

Global refresh must not wait for widget refresh:

This historical test-debt pointer was retired with the old agent backlog. Do
not export hook internals or add a one-off testing framework only for this
assertion.

```ts
test("global settings update is applied without waiting for widget settings refresh", async () => {
    const client = createDeferredSettingsClient();

    render(<App client={client} />);

    client.resolveConnectionInfo();
    client.resolveGlobalSettingsWithAppearanceOverride();

    assertScreenShowsGlobalOverrideState();

    client.resolveWidgetSettingsRefresh();
});
```

Runtime options pending:

```ts
test("disk volume options show loading before disk volume options arrive", () => {
    assert.deepEqual(buildDiskVolumeOptions("pending", []), [
        { value: "", label: "Loading volumes...", disabled: true },
    ]);
});
```

Runtime options ready but empty:

```ts
test("disk volume options show empty state only after disk volume options arrive empty", () => {
    assert.deepEqual(buildDiskVolumeOptions("ready", []), [
        { value: "", label: "No detected volumes", disabled: true },
    ]);
});
```

## Anti-Patterns To Avoid

Do not create a fake state object for one derived boolean:

```ts
type GlobalAppearanceOverrideState =
    | { readonly status: "pending" }
    | { readonly status: "failed" }
    | { readonly status: "ready"; readonly isEnabled: boolean };
```

Do not derive final UI state without readiness:

```ts
const isGlobalAppearanceOverrideEnabled =
    resolvedGlobalSettings.appearanceOverride !== undefined;
```

Do not use resolved defaults as proof that external settings are loaded:

```ts
rawGlobalSettings: writeStoredGlobalSettings(defaultGlobalSettings)
```

Do not let one slow source block another source:

```ts
const [widgetSettings, globalSettings] = await Promise.allSettled([
    client.getSettings(),
    client.getGlobalSettings(),
]);
commitBothTogether(widgetSettings, globalSettings);
```

Do not keep parallel user-visible error fields:

```ts
widgetSettingsNotice: SettingsNotice | null;
widgetLoadError: string | null;
```

Use one notice field per settings scope.

## Completion Criteria

- `usePropertyInspectorSettings` exposes `widgetSettingsStatus` and
  `globalSettingsStatus`.
- `widgetLoadError` and `pluginLoadError` are removed.
- Widget and global settings refresh independently.
- Widget tab does not render final controls while global settings are pending.
- Runtime option lists distinguish pending from loaded empty.
- No generated settings proto leaks outside `settings/storage`.
- No duplicated Property Inspector settings model is introduced.
- No resolved defaults are persisted as part of readiness handling.
- Unit tests cover global pending, global ready override on/off, independent
  global refresh, and disk option pending vs ready-empty.
