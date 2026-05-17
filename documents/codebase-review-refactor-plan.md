# Codebase Review Refactor Plan

Date: 2026-05-17

This document records the accepted and rejected items from the code review discussion, with the execution plan adjusted for the follow-up review. It is an implementation plan, not a request to change the settings architecture.

## Boundary Invariants

These changes may touch:

- Action lifecycle, scheduler subscription, runtime cache, and Property Inspector IPC boundaries.
- The metric view runner queue and render dispatch state boundary.
- The Property Inspector settings sync boundary.
- Runtime metric record ownership inside `MetricStore`.

These changes must not change:

- Persisted settings ownership. Persisted settings remain owned by `settings/storage/*` and the protobuf contract.
- Runtime defaults ownership. Runtime defaults remain owned by the storage resolver.
- Property Inspector settings ownership. PI panels write typed sparse patches; they must not own a duplicate settings model.
- Renderer contract ownership. Renderer code must not import generated storage schema.
- Compatibility policy. Do not add a legacy string compatibility path.

Before each implementation PR, restate the touched invariant in the PR notes.

## Current Follow-Up: Metric Key Identity Resolver Ownership

Decision: accept the small helper consolidation; do not introduce a new
`MetricKeyPlan` model.

Touched invariant: aggregate vs per-instance metric key identity is owned by
the runtime metric-key modules. Action subscription code, action runtime
maximum code, and view builders must not each inline this decision.

Implementation plan:

- Move the three network copies into `runtime/network-metric-keys.ts` as:

```ts
export function resolveNetworkMetricKey(
    direction: Exclude<NetworkDirection, "both">,
    interfaceId: string | undefined,
): string;
```

- This explicitly normalizes the view-builder-local `getNetworkMetricKey` name
  to `resolveNetworkMetricKey`.
- Move the two disk usage copies into `runtime/disk-metric-keys.ts` as:

```ts
export function resolveDiskUsageMetricKey(
    metric: DiskUsageMetric,
    volumeId: string | undefined,
): string;
```

- Callers should pass `target.interfaceId` / `target.volumeId` directly. The
  owner helper handles empty and missing ids.
- Add owner-side unit tests next to the runtime metric-key modules for both
  empty-id aggregate/default keys and explicit-id per-instance keys.
- Keep existing subscription/display invariant tests; they guard against future
  drift between read plans and display reads.

Follow-up guardrail:

- Metric key identity decisions (aggregate/default vs per-instance) should go
  through `runtime/<domain>-metric-keys.ts` `resolve*MetricKey` helpers. Do not
  inline aggregate/per-instance branching in action classes or view builders.
  Keep the atomic key builders public for source adapters and low-level tests.

## Accepted Items

### 1. Classify `metric-view-runner/runner.ts` Into `DisplayUpdateRunner`

Decision: accept.

Current issue: `runner.ts` owns module-level mutable singleton state:

- display action states
- update queue
- active update count
- queue drain scheduling flag

Target: move that mutable state into an instance. Production still exports the same top-level functions, but tests can create isolated runner instances.

Sample target shape:

```ts
export interface DisplayUpdateRunnerOptions {
    readonly maxConcurrentDisplayUpdates?: number;
}

export class DisplayUpdateRunner {
    private readonly displayActionStates = new Map<string, DisplayActionState>();
    private readonly displayActionQueue = new DisplayUpdateQueue();
    private activeDisplayUpdateCount = 0;
    private isDisplayQueueDrainScheduled = false;

    constructor(private readonly options: DisplayUpdateRunnerOptions = {}) {}

    setMetricDisplay(options: MetricDisplayOptions): void {
        const displayActionState = this.getOrCreateDisplayActionState(options.event.action.id);

        this.recordDisplayUpdate(displayActionState, options);
        displayActionState.pendingOptions = options;
        this.enqueueDisplayAction(displayActionState);
    }

    clearMetricDisplayState(actionId: string): void {
        const displayActionState = this.displayActionStates.get(actionId);
        if (!displayActionState) {
            return;
        }

        displayActionState.active = false;
        displayActionState.isQueued = false;
        displayActionState.pendingOptions = null;
        displayActionState.pendingUpdateTimestampMilliseconds = null;
        displayActionState.pendingUpdateReason = "metric-tick";
        displayActionState.pendingSettingsSignature = null;
        displayActionState.touchStripMetricLayoutState.layoutPromise = null;
        displayActionState.touchStripMetricLayoutState.layoutPath = null;

        this.displayActionQueue.remove(actionId);
        this.displayActionStates.delete(actionId);
    }

    private drainDisplayQueue(): void {
        const maximumActiveUpdateCount = this.options.maxConcurrentDisplayUpdates ?? 1;

        while (
            this.activeDisplayUpdateCount < maximumActiveUpdateCount
            && this.displayActionQueue.length > 0
        ) {
            const actionId = this.displayActionQueue.dequeue();
            if (!actionId) {
                continue;
            }

            const displayActionState = this.displayActionStates.get(actionId);
            if (!displayActionState) {
                continue;
            }

            displayActionState.isQueued = false;

            if (
                !displayActionState.active
                || displayActionState.isRenderInFlight
                || !displayActionState.pendingOptions
            ) {
                continue;
            }

            this.runMetricDisplayUpdate(displayActionState, displayActionState.pendingOptions);
        }
    }
}

export const displayUpdateRunner = new DisplayUpdateRunner();

export function setMetricDisplay(options: MetricDisplayOptions): void {
    displayUpdateRunner.setMetricDisplay(options);
}

export function clearMetricDisplayState(actionId: string): void {
    displayUpdateRunner.clearMetricDisplayState(actionId);
}
```

Do not remove the queue in this PR. Queue removal requires measurement because render/rasterize/update is a hot path.

Required characterization tests before the refactor:

- Repeated updates for the same action keep the latest pending options.
- `clearMetricDisplayState()` removes queued work and prevents dispatch for inactive actions.
- An update submitted while render is in flight is coalesced and rendered after the in-flight update finishes.
- A pending `settings-change` priority is not overwritten by a normal metric tick.

Required tests after the class is introduced:

- Two `DisplayUpdateRunner` instances do not share state.

Regression guard:

- Keep `setMetricDisplay()` and `clearMetricDisplayState()` exports unchanged for callers.
- Run `npm.cmd run test:unit`.
- Run `npm.cmd run build`.

### 2. Slim `MetricAction` In Phases

Decision: accept, but do not jump directly to a full `MetricActionSession` hierarchy.

Current issue: `MetricAction` owns too many responsibilities:

- Stream Deck lifecycle routing
- raw/resolved settings state
- scheduler subscription and resubscription
- runtime cache mutation
- PI runtime cache publication
- metric reader facade caching

Target: make `MetricAction` a lifecycle router while keeping action subclass APIs stable during the first phase.

Do not introduce `MetricActionSettingsState`. It would only wrap two pure functions and hold `actionKind` plus runtime cache, which is class-itis. Resolve settings directly with functions and explicit context.

Sample context shape:

```ts
interface ActionSettingsResolveContext {
    readonly actionKind: ActionKind;
    readonly runtimeCache: WidgetRuntimeCache;
}

function resolveInitialMetricActionSettings(
    rawSettings: unknown,
    context: ActionSettingsResolveContext,
): ResolvedInitialActionSettings {
    return resolveInitialActionSettings(
        rawSettings,
        context.actionKind,
        context.runtimeCache,
    );
}

function resolveMetricActionSettings(
    rawSettings: unknown,
    context: ActionSettingsResolveContext,
): ResolvedWidgetSettings {
    return resolveActionSettings(rawSettings, context.runtimeCache);
}
```

First real collaborator: `SchedulerBinding`. This object owns subscription lifecycle because it has real mutable state.

```ts
export interface SchedulerBindingRefreshOptions {
    readonly readPlan: MetricReadPlan;
    readonly pollingIntervalMilliseconds: number;
    readonly onTick: () => void;
}

export class SchedulerBinding {
    private cleanup: (() => void) | null = null;
    private readPlanSignature: string | null = null;
    private pollingIntervalMilliseconds: number | null = null;

    refresh(options: SchedulerBindingRefreshOptions): void {
        const nextReadPlanSignature = buildMetricReadPlanKey(options.readPlan);
        if (
            this.readPlanSignature === nextReadPlanSignature
            && this.pollingIntervalMilliseconds === options.pollingIntervalMilliseconds
        ) {
            return;
        }

        this.cleanup?.();
        this.cleanup = scheduler.subscribe(options.onTick, {
            readPlan: options.readPlan,
            pollingIntervalMilliseconds: options.pollingIntervalMilliseconds,
        });
        this.readPlanSignature = nextReadPlanSignature;
        this.pollingIntervalMilliseconds = options.pollingIntervalMilliseconds;
    }

    dispose(): void {
        this.cleanup?.();
        this.cleanup = null;
        this.readPlanSignature = null;
        this.pollingIntervalMilliseconds = null;
    }
}
```

`MetricAction` target shape:

```ts
interface MetricActionRuntimeState {
    readonly event: WillAppearEvent;
    rawSettings: unknown;
    resolvedSettings: ResolvedWidgetSettings;
    runtimeCache: WidgetRuntimeCache;
}

export abstract class MetricAction extends SingletonAction {
    private readonly actionStates = new Map<string, MetricActionRuntimeState>();
    private readonly schedulerBindings = new Map<string, SchedulerBinding>();

    protected abstract readonly actionKind: ActionKind;

    override onWillAppear(event: WillAppearEvent): void {
        const initialSettings = resolveInitialMetricActionSettings(
            event.payload.settings,
            {
                actionKind: this.actionKind,
                runtimeCache: emptyWidgetRuntimeCache,
            },
        );
        const actionState: MetricActionRuntimeState = {
            event,
            rawSettings: initialSettings.rawSettings,
            resolvedSettings: initialSettings.resolvedSettings,
            runtimeCache: { ...emptyWidgetRuntimeCache },
        };

        this.actionStates.set(event.action.id, actionState);
        this.refreshSubscription(actionState);
        this.persistQuickStartSettings(event, initialSettings.settingsJsonToPersist);
        this.onMetricsUpdate(event);
    }

    override onWillDisappear(event: WillDisappearEvent): void {
        this.schedulerBindings.get(event.action.id)?.dispose();
        this.schedulerBindings.delete(event.action.id);
        this.actionStates.delete(event.action.id);
        clearMetricDisplayState(event.action.id);
    }

    protected getMetricReader(event: WillAppearEvent): MetricStoreReader {
        return metricStore.forScope(this.resolveMetricReadPlan(event).sourceScopeId);
    }
}
```

Also remove `metricReaderBySourceScopeId`. `metricStore.forScope()` creates a lightweight reader facade; caching that object in `MetricAction` does not buy meaningful performance and adds another state owner.

Required tests, added before the refactor:

- `onWillAppear` persists quick-start settings only when needed.
- `onWillAppear` does not persist resolved defaults.
- `onDidReceiveSettings` updates raw and resolved settings.
- settings changes that do not change read plan or polling interval do not resubscribe.
- polling interval changes resubscribe exactly once and cleanup the old subscription.
- source policy changes resubscribe exactly once and cleanup the old subscription.
- global settings changes re-resolve settings, resubscribe active actions, and trigger an immediate update.
- `onWillDisappear` cleans subscription state, action state, and display runner state.
- PI open sends runtime cache only for the active PI action.

Execution order:

1. PR 1: add `metric-action.test.ts` characterization coverage only. No implementation changes.
2. PR 2: introduce `SchedulerBinding`; tests must remain green.
3. PR 3: introduce runtime cache ownership cleanup; tests must remain green.
4. PR 4: remove `metricReaderBySourceScopeId`; tests must remain green.

Regression guard:

- Do not change action subclass public/protected API in the first PR.
- Run `npm.cmd run test:unit` after each PR.
- Run `npm.cmd run build` after each PR that changes exported TypeScript shape.

### 3. Move Runtime Cache Mutation Into A Dedicated Owner

Decision: accept, with a concrete equality policy.

Current issue: `MetricAction` currently merges runtime cache, compares patches, re-resolves settings, and sends PI messages. Those are related, but they are not the action lifecycle itself.

Target: runtime cache mutation gets a small owner. The owner can be a class because it owns mutable cache state.

Runtime cache equality decision:

- Do not keep `node:util.isDeepStrictEqual`; it is Node-only and blocks reuse from browser-safe code.
- Do not use a vague shallow compare; option arrays contain objects.
- Use domain-specific equality for this closed runtime cache shape. Compare scalar maxima directly, and compare `NetworkInterfaceOption[]` / `DiskVolumeOption[]` by explicit field equality.
- Do not add `fast-deep-equal` in the first pass. A general deep-equality dependency can be reconsidered only if more runtime cache object fields are added and domain equality becomes noisy.

PI publication decision:

- `WidgetRuntimeCacheStore` owns only runtime cache state and equality.
- `MetricAction` remains responsible for PI publication after `WidgetRuntimeCacheStore.update(patch)` returns `true`.
- Do not pass a PI callback into the store. That would couple runtime state mutation to Stream Deck UI IPC.
- After this PR, active action state should hold a `runtimeCacheStore` instead of a bare `runtimeCache` field.

Sample target shape:

```ts
export class WidgetRuntimeCacheStore {
    private runtimeCache: WidgetRuntimeCache = { ...emptyWidgetRuntimeCache };

    current(): WidgetRuntimeCache {
        return this.runtimeCache;
    }

    update(patch: WidgetRuntimeCachePatch): boolean {
        if (isWidgetRuntimeCachePatchUnchanged(this.runtimeCache, patch)) {
            return false;
        }

        this.runtimeCache = mergeWidgetRuntimeCache(this.runtimeCache, patch);
        return true;
    }
}

protected updateRuntimeCache(
    event: WillAppearEvent | PropertyInspectorDidAppearEvent,
    patch: WidgetRuntimeCachePatch,
): Promise<void> {
    const activeActionState = this.resolveActiveActionState(event);
    const changed = activeActionState.runtimeCacheStore.update(patch);
    if (!changed) {
        return Promise.resolve();
    }

    activeActionState.resolvedSettings = resolveMetricActionSettings(
        activeActionState.rawSettings,
        {
            actionKind: this.actionKind,
            runtimeCache: activeActionState.runtimeCacheStore.current(),
        },
    );

    return this.sendRuntimeCachePatchToPropertyInspector(event, patch);
}

function isWidgetRuntimeCachePatchUnchanged(
    runtimeCache: WidgetRuntimeCache,
    patch: WidgetRuntimeCachePatch,
): boolean {
    if (
        patch.runtimeMaximumDownloadSpeedMbps !== undefined
        && runtimeCache.runtimeMaximumDownloadSpeedMbps !== patch.runtimeMaximumDownloadSpeedMbps
    ) {
        return false;
    }

    if (
        patch.runtimeMaximumUploadSpeedMbps !== undefined
        && runtimeCache.runtimeMaximumUploadSpeedMbps !== patch.runtimeMaximumUploadSpeedMbps
    ) {
        return false;
    }

    if (
        patch.availableNetworkInterfaces !== undefined
        && !areNetworkInterfaceOptionsEqual(
            runtimeCache.availableNetworkInterfaces,
            patch.availableNetworkInterfaces,
        )
    ) {
        return false;
    }

    if (
        patch.availableDiskVolumes !== undefined
        && !areDiskVolumeOptionsEqual(runtimeCache.availableDiskVolumes, patch.availableDiskVolumes)
    ) {
        return false;
    }

    return true;
}

function areNetworkInterfaceOptionsEqual(
    firstOptions: readonly NetworkInterfaceOption[],
    secondOptions: readonly NetworkInterfaceOption[],
): boolean {
    return firstOptions.length === secondOptions.length
        && firstOptions.every((firstOption, index) => {
            const secondOption = secondOptions[index];
            return secondOption !== undefined
                && firstOption.id === secondOption.id
                && firstOption.name === secondOption.name
                && firstOption.type === secondOption.type
                && firstOption.isDefault === secondOption.isDefault
                && firstOption.speedMegabitsPerSecond === secondOption.speedMegabitsPerSecond;
        });
}

function areDiskVolumeOptionsEqual(
    firstOptions: readonly DiskVolumeOption[],
    secondOptions: readonly DiskVolumeOption[],
): boolean {
    return firstOptions.length === secondOptions.length
        && firstOptions.every((firstOption, index) => {
            const secondOption = secondOptions[index];
            return secondOption !== undefined
                && firstOption.id === secondOption.id
                && firstOption.fs === secondOption.fs
                && firstOption.mount === secondOption.mount
                && firstOption.sizeBytes === secondOption.sizeBytes
                && firstOption.usedBytes === secondOption.usedBytes
                && firstOption.availableBytes === secondOption.availableBytes
                && firstOption.storageKind === secondOption.storageKind
                && firstOption.diskName === secondOption.diskName
                && firstOption.volumeLabel === secondOption.volumeLabel;
        });
}
```

Required tests:

- unchanged scalar field does not publish a PI patch.
- changed scalar field publishes a PI patch.
- equal network interface option arrays do not publish a PI patch.
- changed network interface field publishes a PI patch.
- equal disk volume option arrays do not publish a PI patch.
- changed disk volume field publishes a PI patch.
- cache update re-resolves settings when runtime maxima affect resolved settings.
- runtime cache never reaches `setSettings()`.

Regression guard:

- Keep runtime facts runtime-only.
- Do not write option lists, discovered devices, or resolved defaults to persisted settings.

### 4. Fix `MetricStore.recordText` Record Shape

Decision: accept.

Current issue: text metrics create a `RingBuffer<number>` even though text metrics do not use numeric history. That means the data structure is lying.

Target: use a discriminated union.

Scalar/text overwrite decision:

- If the same metric key changes type, fully replace the old record.
- Do not throw. Runtime source data is external enough that a throw could break rendering.
- Do not keep the old record. Keeping old scalar history after a text sample, or old text after a scalar sample, is stale state.
- Add a low-frequency `warn` only if this is observed to matter in source debugging. The first refactor should define the behavior through tests without adding noisy logs.

Sample target shape:

```ts
type SourceMetricStore = Map<string, MetricRecord>;

type MetricRecord = ScalarMetricRecord | TextMetricRecord;

interface ScalarMetricRecord {
    readonly kind: "scalar";
    readonly buffer: RingBuffer<number>;
    timestampMilliseconds: number;
}

interface TextMetricRecord {
    readonly kind: "text";
    text: string;
    timestampMilliseconds: number;
}

private record(
    sourceStore: SourceMetricStore,
    metricKey: string,
    value: number,
    timestampMilliseconds: number,
): void {
    const existingRecord = sourceStore.get(metricKey);
    const metricRecord: ScalarMetricRecord = existingRecord?.kind === "scalar"
        ? existingRecord
        : {
            kind: "scalar",
            buffer: new RingBuffer<number>(MetricStore.HISTORY_SIZE),
            timestampMilliseconds,
        };

    metricRecord.buffer.push(value);
    metricRecord.timestampMilliseconds = timestampMilliseconds;
    sourceStore.set(metricKey, metricRecord);
}

private recordText(
    sourceStore: SourceMetricStore,
    metricKey: string,
    value: string,
    timestampMilliseconds: number,
): void {
    sourceStore.set(metricKey, {
        kind: "text",
        text: value,
        timestampMilliseconds,
    });
}

private readWidgetData(
    sourceScopeId: string,
    metricKey: string,
    label: string,
    unit: string,
    maxValue = 100,
): WidgetData {
    const metricRecord = this.readRecord(sourceScopeId, metricKey);
    const current = metricRecord?.kind === "scalar" ? metricRecord.buffer.latest : 0;

    return {
        current,
        progress: Math.min(Math.max(current / maxValue, 0), 1),
        history: metricRecord?.kind === "scalar" ? metricRecord.buffer.toArray() : [],
        unit,
        label,
        sampleTimestampMilliseconds: metricRecord?.timestampMilliseconds,
    };
}

private readTextValue(sourceScopeId: string, metricKey: string): string | undefined {
    const metricRecord = this.readRecord(sourceScopeId, metricKey);
    return metricRecord?.kind === "text" ? metricRecord.text : undefined;
}
```

Required tests:

- text metric `getTextValue()` returns text.
- text metric `getWidgetData()` returns `current: 0`, `progress: 0`, and empty history.
- scalar metric replaces text metric completely.
- text metric replaces scalar metric completely.
- source scopes remain isolated.

Regression guard:

- Placeholder rendering still depends on `sampleTimestampMilliseconds`.
- Existing scalar history behavior remains unchanged for scalar-only metrics.

### 5. Avoid Double Decode In Property Inspector Context

Decision: accept, but keep the storage boundary explicit.

Current issue: `buildPropertyInspectorContext()` calls `resolveQuickStartStoredWidgetSettings()`, then decodes `quickStartSettings.rawSettings` again with `readStoredWidgetSettings()`.

Target: let quick-start resolution return the already-read stored settings. PI context can pass that to the resolver without decoding the same raw JSON twice.

The branch behavior must stay exact:

- If there is no quick-start target for the action kind, return the original raw settings and no settings to persist.
- If stored settings already have a metric target, return readable ProtoJSON as raw settings, no settings to persist, and the decoded stored settings.
- If stored settings need a quick-start target, return the quick-start ProtoJSON as raw settings, the same JSON as `settingsJsonToPersist`, and the decoded stored settings with the target applied.

Sample target shape:

```ts
export interface QuickStartStoredWidgetSettings {
    readonly rawSettings: unknown;
    readonly settingsJsonToPersist: StoredSettingsJsonObject | null;
    readonly readWarning: StoredSettingsReadWarning | null;
    readonly storedSettings: StoredWidgetSettings;
}

export function resolveQuickStartStoredWidgetSettings(
    rawSettings: unknown,
    actionKind: ActionKind,
): QuickStartStoredWidgetSettings {
    const quickStartTarget = buildQuickStartMetricTarget(actionKind);
    const readResult = readStoredWidgetSettings(rawSettings);
    const storedSettings = readResult.settings;
    const readableSettingsJson = writeStoredWidgetSettings(storedSettings);

    if (!quickStartTarget) {
        return {
            rawSettings,
            settingsJsonToPersist: null,
            readWarning: readResult.warning,
            storedSettings,
        };
    }

    if (hasStoredMetricTarget(storedSettings)) {
        return {
            rawSettings: readableSettingsJson,
            settingsJsonToPersist: null,
            readWarning: readResult.warning,
            storedSettings,
        };
    }

    const settingsJson = writeQuickStartStoredWidgetSettings(storedSettings, quickStartTarget);
    return {
        rawSettings: settingsJson,
        settingsJsonToPersist: settingsJson,
        readWarning: readResult.warning,
        storedSettings,
    };
}
```

Then PI context can use the decoded stored settings:

```ts
export function buildPropertyInspectorContext(options: {
    rawSettings: unknown;
    rawGlobalSettings: unknown;
    runtimeCache: WidgetRuntimeCache;
    runtimeCacheStatus: PropertyInspectorRuntimeCacheStatus;
    actionKind: ActionKind;
    isWindows: boolean;
}): VisibilityContext {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(
        options.rawSettings,
        options.actionKind,
    );

    return {
        actionKind: options.actionKind,
        isWindows: options.isWindows,
        runtimeCache: options.runtimeCache,
        runtimeCacheStatus: options.runtimeCacheStatus,
        resolved: resolveStoredWidgetSettings({
            storedWidgetSettings: quickStartSettings.storedSettings,
            storedGlobalSettings: readStoredGlobalSettings(options.rawGlobalSettings).settings,
            runtime: {
                isWindows: options.isWindows,
                runtimeMaximumDownloadSpeedMegabitsPerSecond:
                    options.runtimeCache.runtimeMaximumDownloadSpeedMbps,
                runtimeMaximumUploadSpeedMegabitsPerSecond:
                    options.runtimeCache.runtimeMaximumUploadSpeedMbps,
                runtimeMaximumDiskReadThroughputMebibytesPerSecond:
                    options.runtimeCache.runtimeMaximumDiskReadThroughputMebibytesPerSecond,
                runtimeMaximumDiskWriteThroughputMebibytesPerSecond:
                    options.runtimeCache.runtimeMaximumDiskWriteThroughputMebibytesPerSecond,
                runtimeMaximumGpuPowerWatts: options.runtimeCache.runtimeMaximumGpuPowerWatts,
            },
        }),
    };
}
```

Required tests:

- unknown action kind preserves raw settings and does not request persistence.
- missing target creates the action-specific quick-start target.
- existing target does not request persistence.
- invalid raw settings still produces a warning notice.
- context resolved output stays the same as before.

Regression guard:

- Do not persist resolved defaults.
- Do not introduce a PI settings-shaped mirror.
- Keep generated storage schema out of ordinary UI panels and rendering code.
- Enforce the generated schema import boundary with ESLint `no-restricted-imports` or an equivalent CI grep script. Generated `settings_pb` imports should be limited to storage/wire boundaries such as `settings/storage/**`, contract tests, and runtime source protocol code; PI panels and renderer code must not import it.

### 6. Simplify `ColorSettings.tsx` Wrapper Components

Decision: accept as a local cleanup.

Current issue: several components only hard-code a channel string and heading.

Target: replace one-line wrappers with typed channel section data. Do not introduce a schema registry or field registry.

Sample target shape:

```tsx
const networkColorChannels = [
    { channel: "download", heading: "Color - Download" },
    { channel: "upload", heading: "Color - Upload" },
] as const;

const diskThroughputColorChannels = [
    { channel: "diskRead", heading: "Read" },
    { channel: "diskWrite", heading: "Write" },
] as const;

function ChannelColorSection({
    channel,
    heading,
    ...props
}: WidgetSettingsPanelProps & {
    readonly channel: Exclude<MetricChannelKey, "usage">;
    readonly heading: string;
}): React.JSX.Element {
    return (
        <>
            <SectionHeading text={heading} />
            <ChannelColorFields {...props} channel={channel} />
        </>
    );
}
```

Usage:

```tsx
{networkColorChannels.map(channelSettings => (
    <ChannelColorSection
        key={channelSettings.channel}
        {...props}
        channel={channelSettings.channel}
        heading={channelSettings.heading}
    />
))}
```

Required tests:

- network download/upload color controls still render.
- disk read/write color controls still render.
- black-white mode hides channel color fields.
- terminal theme shows no color settings.
- color-filled theme uses color-filled controls instead of channel controls.

Regression guard:

- Keep PI composition explicit.
- Do not restore schema-driven UI, binding registry, or flat PI settings mirror.

### 7. Refactor `usePropertyInspectorSettings` State Handling

Decision: accept, with a narrower cancellation policy.

Current issue:

- `stateRef + setState` duplicates state ownership.
- `commitState()` returns a value that is discarded with `void nextState`.
- State transitions are not enumerated.

Target: use a reducer so state transitions are explicit and testable.

Do not replace `isDisposed()` with `AbortController` in the first pass. The Stream Deck client methods do not accept `AbortSignal`, so `AbortController` would still require manual checks after each await. A closure-scoped cancellation flag is sufficient unless a real cancellable API is introduced.

Sample target shape:

```ts
type SettingsSyncAction =
    | {
        readonly type: "connectionLoaded";
        readonly actionKind: ActionKind;
        readonly isWindows: boolean;
        readonly widgetSettingsRead: InspectorWidgetSettingsRead;
    }
    | {
        readonly type: "widgetSettingsRead";
        readonly read: InspectorWidgetSettingsRead;
    }
    | {
        readonly type: "pluginSettingsRead";
        readonly read: InspectorPluginSettingsRead;
    }
    | {
        readonly type: "runtimeCachePatch";
        readonly patch: WidgetRuntimeCachePatch;
    }
    | {
        readonly type: "widgetLoadFailed";
    }
    | {
        readonly type: "pluginLoadFailed";
    }
    | {
        readonly type: "widgetSaveFailed";
        readonly errorMessage: string;
    }
    | {
        readonly type: "pluginSaveFailed";
        readonly errorMessage: string;
    };

function settingsSyncReducer(
    state: SettingsSyncState,
    action: SettingsSyncAction,
): SettingsSyncState {
    switch (action.type) {
        case "connectionLoaded":
            return {
                ...state,
                actionKind: action.actionKind,
                isWindows: action.isWindows,
                rawSettings: action.widgetSettingsRead.rawSettings,
                widgetSettingsStatus: "ready",
                widgetSettingsNotice: action.widgetSettingsRead.notice,
            };
        case "widgetSettingsRead":
            return {
                ...state,
                rawSettings: action.read.rawSettings,
                widgetSettingsStatus: "ready",
                widgetSettingsNotice: action.read.notice,
            };
        case "pluginSettingsRead":
            return {
                ...state,
                rawGlobalSettings: action.read.rawGlobalSettings,
                globalSettingsStatus: "ready",
                pluginSettingsNotice: action.read.notice,
            };
        case "runtimeCachePatch":
            return {
                ...state,
                runtimeCache: mergeWidgetRuntimeCache(state.runtimeCache, action.patch),
                runtimeCacheStatus: {
                    diskVolumeOptionsStatus: "availableDiskVolumes" in action.patch
                        ? "ready"
                        : state.runtimeCacheStatus.diskVolumeOptionsStatus,
                },
            };
        case "widgetLoadFailed":
            return {
                ...state,
                widgetSettingsStatus: "failed",
                widgetSettingsNotice: settingsLoadFailureNotice("widget"),
            };
        case "pluginLoadFailed":
            return {
                ...state,
                globalSettingsStatus: "failed",
                pluginSettingsNotice: settingsLoadFailureNotice("plugin"),
            };
        case "widgetSaveFailed":
            return {
                ...state,
                widgetSettingsNotice: {
                    kind: "warning",
                    text: `Failed to save widget settings: ${action.errorMessage}`,
                },
            };
        case "pluginSaveFailed":
            return {
                ...state,
                pluginSettingsNotice: {
                    kind: "warning",
                    text: `Failed to save plugin settings: ${action.errorMessage}`,
                },
            };
        default:
            return assertNever(action);
    }
}

function assertNever(value: never): never {
    throw new Error(`Unhandled settings sync action: ${String(value)}`);
}
```

Effect cancellation:

```ts
useEffect(() => {
    let hasCancelled = false;
    const isCancelled = (): boolean => hasCancelled;
    const unsubscribe = subscribePropertyInspectorEvents(client, dispatch);

    loadPropertyInspectorSettings(client, dispatch, isCancelled).catch((error: Error) => {
        if (isCancelled()) {
            return;
        }

        dispatch({ type: "widgetLoadFailed" });
    });

    return () => {
        hasCancelled = true;
        unsubscribe();
    };
}, [client]);
```

Second step, only if needed: extract a `PropertyInspectorSettingsStore` and use `useSyncExternalStore`. Do this only if it creates a real owner and does not duplicate the settings model.

Required tests:

- initial payload paints first.
- async refresh updates state after first paint.
- unmount before async refresh prevents dispatch.
- `didReceiveSettings` updates widget state.
- `didReceiveGlobalSettings` updates plugin state.
- runtime cache IPC merges runtime state only.
- save failure sets notice without rolling back optimistic UI state.
- unknown runtime cache message is ignored.

Regression guard:

- Runtime cache remains runtime-only.
- PI still writes through typed sparse storage patches.
- No duplicate PI settings model.

### 8. Simplify `App.tsx` Tab Buttons

Decision: accept as a low-risk cleanup.

Target: replace duplicated button JSX with a typed tab list.

Sample target shape:

```tsx
const settingsTabs = [
    { id: "widget", label: "Widget" },
    { id: "plugin", label: "Plugin" },
] as const;

type SettingsTabId = typeof settingsTabs[number]["id"];

export function App({ client }: AppProps): React.JSX.Element {
    const [activeTab, setActiveTab] = useState<SettingsTabId>("widget");

    return (
        <div className="settings-tab-list" role="tablist" aria-label="Settings">
            {settingsTabs.map(tab => (
                <button
                    key={tab.id}
                    className="settings-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    data-selected={activeTab === tab.id ? "true" : "false"}
                    onClick={() => setActiveTab(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
```

Required tests:

- default active tab is widget.
- clicking plugin activates plugin tab.
- `aria-selected` and `data-selected` remain correct.
- active tab chooses the matching notice.

Regression guard:

- Keep visible behavior unchanged.

### 9. Cache Scheduler Group Keys

Decision: accept only as a low-priority cleanup.

Current issue: `Scheduler.getDueSubscriberGroups()` rebuilds the group key each tick.

Target: compute group key once at subscription time.

Sample target shape:

```ts
interface SubscriberRecord {
    readonly callback: MetricSubscriber;
    readonly readPlan: MetricReadPlan;
    readonly groupKey: string;
    readonly pollingIntervalMilliseconds: number;
}

subscribe(callback: MetricSubscriber, options: SubscriptionOptions): () => void {
    const pollingIntervalMilliseconds = Scheduler.normalizePollingIntervalMilliseconds(
        options.pollingIntervalMilliseconds,
    );
    const readPlan = normalizeMetricReadPlan(options.readPlan);
    const groupKey = Scheduler.buildGroupKey(pollingIntervalMilliseconds, readPlan);

    this.subscribers.set(callback, {
        callback,
        readPlan,
        groupKey,
        pollingIntervalMilliseconds,
    });
    this.nextPollTimestampByGroup.set(groupKey, 0);
    this.start();

    return () => {
        this.subscribers.delete(callback);

        if (this.subscribers.size === 0) {
            this.stop();
        }
    };
}
```

Required tests:

- same source and frequency with different metric keys performs one merged poll.
- different source scope performs separate polls.
- different polling interval performs separate polls.
- unsubscribe stops scheduler when no subscribers remain.
- in-flight group does not poll twice.

Regression guard:

- Do not change metric key merge semantics.
- Do not optimize polling internals unless the grouping behavior tests are in place first.

### 10. Consolidate Performance Stats Without Deleting Observability

Decision: accept.

Current issue: display performance and rasterizer performance have duplicate accumulator logic.

Target: extract shared duration accumulation helpers. Do not remove observability, do not replace with `console.time`, and do not reduce warning coverage.

Sample target shape:

```ts
export interface DurationAccumulator {
    count: number;
    totalMilliseconds: number;
    maximumMilliseconds: number | null;
}

export interface DurationSummary {
    readonly count: number;
    readonly averageMilliseconds: number | null;
    readonly maximumMilliseconds: number | null;
}

export function createDurationAccumulator(): DurationAccumulator {
    return {
        count: 0,
        totalMilliseconds: 0,
        maximumMilliseconds: null,
    };
}

export function addDurationSample(
    durationAccumulator: DurationAccumulator,
    durationMilliseconds: number | null,
): void {
    if (durationMilliseconds == null) {
        return;
    }

    durationAccumulator.count += 1;
    durationAccumulator.totalMilliseconds += durationMilliseconds;
    durationAccumulator.maximumMilliseconds = Math.max(
        durationAccumulator.maximumMilliseconds ?? durationMilliseconds,
        durationMilliseconds,
    );
}

export function summarizeDuration(durationAccumulator: DurationAccumulator): DurationSummary {
    return {
        count: durationAccumulator.count,
        averageMilliseconds: durationAccumulator.count > 0
            ? durationAccumulator.totalMilliseconds / durationAccumulator.count
            : null,
        maximumMilliseconds: durationAccumulator.maximumMilliseconds,
    };
}
```

Required tests:

- display performance summary fields stay unchanged.
- rasterizer performance summary fields stay unchanged.
- warning threshold behavior stays unchanged.
- null durations do not affect averages.
- summary interval rollover keeps current behavior.

Regression guard:

- Keep existing logs and warning thresholds.
- Keep hot-path logging aggregated or throttled.

## Rejected Items

### Do Not Replace Protobuf Settings Storage With Zod

Decision: reject.

Reason:

- The project deliberately uses protobuf, ProtoJSON, and protovalidate as a strong persisted settings contract.
- This is especially important for AI-assisted maintenance, where field identity and schema evolution need stronger pressure than a TypeScript object schema convention.
- The TDD already records Zod for persisted settings as rejected for now.

### Do Not Collapse Stored, Resolved, Override, And Patch Layers

Decision: reject.

Reason:

- Stored settings are sparse persisted data.
- Resolved settings are runtime-complete data.
- Override and patch types are sparse user intent.
- These are separate ownership layers, not accidental duplication.

Do not replace the hand-written override family with recursive `DeepPartial<Resolved*>` in this refactor. The explicit interfaces improve hover/error DX and force AI-maintained changes to touch the intended contract surface.

### Do Not Rename Full Unit Names Globally

Decision: reject.

Reason:

- The repo currently prefers explicit unit names such as `pollingIntervalMilliseconds`.
- Global churn from renaming to `pollIntervalMs` would create noise without changing behavior.

Local readability fixes are allowed when a specific expression becomes too hard to read, but no global naming migration belongs in this plan.

### Do Not Delete Performance Stats

Decision: reject.

Reason:

- Rendering and rasterization are performance-sensitive paths.
- The TDD has explicit performance budgets and observability requirements.
- Consolidation is acceptable; deletion is not.

### Do Not Remove The Display Queue Without Measurement

Decision: reject for now.

Reason:

- Queue removal changes hot-path behavior.
- The current safe step is state ownership cleanup through `DisplayUpdateRunner`.
- Any queue simplification needs timing evidence around compose, rasterize, SDK dispatch, queue length, and active action count.

## Nice-To-Have Items Not In Scope

These can be handled opportunistically only if they are in the same touched file and do not expand the PR:

- Delete `formatSettingValue` if nearby logging is already being edited.
- Inline `SettingsNoticeSlot` into `SettingsNoticeView` if `App.tsx` is already being touched.
- Revisit structured log fields later. Do not churn all `[...].join(" ")` logs in this plan.

## Execution Order

Use small PRs. Characterization tests land before refactors.

Runner and `MetricAction` are independent tracks as long as `setMetricDisplay()` and `clearMetricDisplayState()` wrapper exports stay unchanged. Do not interleave implementation PRs within one track.

Runner track:

1. Add runner characterization tests against the existing module exports only.
2. Introduce `DisplayUpdateRunner` as a mechanical state move; runner tests stay green.

`MetricAction` track:

1. Add `MetricAction` characterization tests only.
2. Introduce `SchedulerBinding`.
3. Introduce runtime cache ownership cleanup and domain-specific equality.
4. Remove `metricReaderBySourceScopeId`.

Remaining low-coupling work:

1. Fix `MetricStore` scalar/text record shape.
2. Avoid PI context double decode.
3. Clean up `ColorSettings.tsx` wrappers.
4. Refactor `usePropertyInspectorSettings` to reducer state.
5. Clean up `App.tsx` tab buttons.
6. Cache scheduler group keys if still worthwhile.
7. Consolidate performance duration accumulators.

## Verification

Before each refactor PR:

- Add characterization tests first when behavior is not already covered.
- State the architecture invariant touched by the PR.

For every implementation PR:

- Run `npm.cmd run test:unit`.
- Run `npm.cmd run build` when exported TypeScript shape changes.
- Run `npm.cmd run proto:lint` and `npm.cmd run proto:build` only when protobuf or generated contract workflow changes.
- Do not run visual tests unless SVG rendering, widget styles, Property Inspector visuals, or visual snapshots are changed.

Final architecture self-check for each PR:

- no duplicated PI settings model
- no resolved defaults persisted
- no renderer import of storage schema
- no legacy string compatibility path
- no broad option bag or pass-through wrapper added
- no defensive parser added for data already validated at the boundary
- tests assert the boundary invariant, not only implementation details
