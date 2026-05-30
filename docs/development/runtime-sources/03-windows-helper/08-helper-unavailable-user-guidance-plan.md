# Windows Helper Unavailable User Guidance Plan

This plan defines how helper-backed widgets guide users when the Windows helper,
driver path, selected sensor, or polling-group cache is unavailable.

The problem is broader than one C# cache fallback. Today several different
states can collapse into the same key text:

```text
helper never installed
helper installed but stopped
helper reachable but sensor driver path unhealthy
helper reachable but selected metric is still waiting for first group refresh
helper reachable but the selected metric truly has no matching sensor
```

All of these can surface as `No sensor data`. That is too vague for first-use
guidance and too imprecise for support.

## Current Facts

- `MetricSnapshotCache.ReadPollingGroup(...)` currently falls back to the global
  latest snapshot when a per-group snapshot is missing. This can turn "this
  polling group has not refreshed yet" into a source-reported `NoSensor`.
- Hub has more diagnostic state than the widget body currently uses:
  - `SourceClientStatus` can distinguish `helperNotInstalled`, `helperStopped`,
    `pipeMissing`, `timeout`, `sourceError`, and `protocolMismatch`.
  - `MetricUnavailableReport` can distinguish `noSensorData`, `invalidValue`,
    and `expired`.
  - `MetricSourceDiagnostic` exposes some of this in DEBUG.
- `readHelperBackedWidgetData(...)` historically mapped helper-backed no-data
  to several key strings such as `Helper required`, `Helper error`, or
  `No sensor data`. The simplified policy is to reserve custom key copy for
  helper installation (`Install helper`), explicit Advanced Sensor selection
  onboarding (`Choose metric`), and first group refresh (`...`) only; other
  no-data states render the normal `N/A` placeholder and put details in
  PI/diagnostics.
- `SourceWarning` is structured as `{ code, message, metric_id?,
  source_sensor_id? }`, but PawnIO driver status in ShoMetrics Control Panel is
  currently inferred from warning text containing `PawnIO` or `MSR`. The source
  API does not expose an explicit driver status contract yet.
- ShoMetrics Control Panel currently reads service status and helper health as a
  normal user-facing status tool. It does not directly perform privileged
  driver probing or mutate helper/service configuration.
- ShoMetrics Control Panel uses two status paths today:
  - Windows service installed/running status is read with the Win32 Service
    Control Manager API.
  - Helper health, descriptor count, and sample status are read through
    `MetricSourceService` gRPC over the same Windows named pipe used by the
    Hub, not by direct Core calls.
- The Stream Deck manifest supports per-action `OS`; `Advanced Sensor` can be
  hidden on non-Windows without changing its UUID. The official Stream Deck
  manifest reference documents `Action.OS` as the operating systems an action
  supports.

## Product Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Non-Windows Advanced Sensor | Hide the action from non-Windows action lists with action-level `OS: ["windows"]`. | The current feature is Windows-helper-backed. Showing it on macOS creates a dead-end first-use experience. This can be changed later when a macOS helper or catalog source exists; unlike action UUIDs, action OS visibility is not the persisted identity. |
| Non-Windows metric options | Do not list metrics or source choices that are unsupported on the current platform. | Hiding the action list entry is not enough: synced profiles, existing widgets, and PI dropdowns must not invite users to select Windows-helper-only metrics on macOS. |
| Dedicated unavailable SVG/body | Do not use a dedicated unavailable body for ordinary no-data states. | Users chose Circle/Text/Bar/Line; ordinary helper, sensor, and driver states should keep that view and render `N/A`. |
| Notice surface | Use a dedicated notice body for static key guidance such as `Install helper` and Advanced Sensor `Choose metric`. | These are action guidance states, not metric values. They must not be rendered through the selected Circle/Text/Bar/Line primitive or handled by generic no-data rendering. |
| No ambiguous setup copy | Never use `Setup required` as user-facing key copy. | It does not say whether the user must install the helper or choose a metric. Use the specific next action instead. |
| Helper install key copy | Allow `Install helper` only for static helper-required surfaces when the helper service is confirmed not installed. | A never-installed helper is an activation funnel problem for Advanced Sensor and helper-only built-ins such as CPU temperature/power. Helper-preferred fallback metrics such as GPU telemetry stay `N/A` until a value arrives so cold-start fallback warmup does not flash the wrong install guidance. |
| Metric selection key copy | Use `Choose metric` when Advanced Sensor is usable but no metric is selected. | Once the helper/catalog path is usable, the next action is choosing a metric, not installing or repairing helper state. |
| First-refresh key copy | Allow `...` for `sensorPending` in non-minimal views. | It explains the short first-refresh wait without introducing a dedicated loading layout. Minimal circle stays icon-first. |
| ShoMetrics Control Panel naming | Use `ShoMetrics Control Panel` in user-facing guidance. Use `Open` only when the nearby UI already names the destination. | Bare `Control Panel` can be confused with Windows Control Panel. The product-owned name keeps support guidance unambiguous. |
| ShoMetrics Control Panel process privilege | Run ShoMetrics Control Panel as normal user by default. Use UAC only for explicit privileged actions. | Reading helper status is safe as a normal user. Service install/start/stop, driver install/repair, or kernel-adjacent configuration changes must be separate, explicit elevated actions. |
| `Open` action lifecycle | Treat `Open ShoMetrics Control Panel` as a fire-and-forget Windows Shell launch/focus request. | Opening from the PI should behave like the user opening the same installed app from Start Menu. Hub must not own, monitor, restart, or kill the ShoMetrics Control Panel process. |
| Driver status source | Keep driver/sensor details in ShoMetrics Control Panel, DEBUG, and support text until a machine consumer needs structured decisions. | The key stays `N/A` for ordinary no-data states. Do not build a typed health-diagnostic contract just to display human-readable details. |
| Render truth source | Node/Hub data-path state remains authoritative for widget rendering; helper health is supporting diagnosis. | A helper can report "available" while a metric still has no value. Widgets must be driven by actual metric values/unavailable reports, with helper health used to choose better guidance copy. |
| Health diagnostic contract | Defer the `kind`/`severity`/`scope` health diagnostic contract. Keep `SourceWarning` as the support/log surface for now. | Structured diagnostics are justified only when Hub or ShoMetrics Control Panel performs different machine actions based on the diagnostic kind. |
| Version mismatch UX | Treat helper/Hub protocol mismatch as `versionMismatch`, not generic `helperError`. | The user action is specific: update or repair the ShoMetrics install so Hub and helper use matching protocol versions. |
| Descriptor catalog state | Treat descriptor catalog pending/failure as "catalog not ready", not "metric does not exist". | Until the source catalog is available, Hub cannot prove that a selected metric is truly absent. |
| Freshness owner | Do not introduce a second Hub-owned source freshness system. Hub consumes source/runtime freshness and unavailable reports, while sources own retained-value semantics. | The Windows helper already owns retained sample freshness and age. Duplicating stale logic in Hub would create conflicting truth sources. |
| Hub retained-value limitation | Treat Hub's current 7s timestamp freshness gate as a known follow-up, not part of onboarding copy. | Helper-retained values may still render `N/A` until Hub consumes source-reported freshness/retained attribution. This must not turn into `Install helper` copy. |
| i18n scope | Define copy keys and English/Japanese/Chinese target text in this plan, but render English only until the Hub has a real i18n layer. | The repo does not currently have a general i18n layer. This plan prevents hard-coded copy drift without pretending localization is implemented. |

## Implementation Slices

Do not implement this whole document as one change. The first slice should fix
the concrete cache/user-copy bug without pulling in ShoMetrics Control Panel
settings or installer work.

| Slice | Scope | Why first or later |
| --- | --- | --- |
| 1. Pending refresh semantics | C# per-group missing snapshot handling, proto/runtime unavailable reason, widget/PI copy for `sensorPending`, tests. | Directly fixes the `ReadPollingGroup` fallback confusion and is small enough to review alone. |
| 2. Helper install and selection guidance | Advanced Sensor action OS gate, PI descriptor-load guidance for missing/stopped helper, helper status copy tests. | Improves first-run UX without changing driver health contracts. |
| 3. Key no-data simplification | Render ordinary no-data states as `N/A`; render `Install helper` only through action-owned notice bodies when helper install is the next action; render `Choose metric` only through the Advanced Sensor no-selection notice body; keep `...` as the first-refresh key exception. | Avoids long-copy layout work while preserving first-run helper install, metric selection, and first-refresh guidance. |
| 4. Support diagnostics surface | ShoMetrics Control Panel warning display, diagnostic copy, optional component labels for support text. | Keep this human/support-facing until a real machine decision requires a typed health diagnostic contract. |
| 5. Privileged ShoMetrics Control Panel actions | Installer/service/driver repair entry points with explicit UAC. | Separate security design and release packaging work. |
| 6. Platform metric filtering | Filter PI dropdown options and already-placed unsupported keys by current platform. | Prevents macOS users from selecting Windows-helper-only metrics and keeps synced Windows profiles from turning into install-helper dead ends. |

## User-Facing State Model

Use short copy on the key. Put action guidance in the Property Inspector. Put
system status and repair actions in ShoMetrics Control Panel.

| State key | Deck copy | PI guidance | ShoMetrics Control Panel guidance |
| --- | --- | --- | --- |
| `helperInstallRequired` | `Install helper` | `Install ShoMetrics Helper to use advanced sensors.` | Show service not installed. Offer install/repair once installer UX exists. |
| `metricSelectionRequired` | `Choose metric` | `Choose an advanced sensor metric.` | N/A |
| `helperStopped` | `N/A` | `Start ShoMetrics Helper from ShoMetrics Control Panel.` | Show service installed but not running. Offer Start with UAC if needed. |
| `helperStarting` | `N/A` | `Waiting for ShoMetrics Helper to start.` | Show service start-pending or pipe missing inside a short startup window. |
| `versionMismatch` | `N/A` | `Update ShoMetrics Helper and Hub to matching versions.` | Show Hub version, helper version, and protocol version. |
| `helperError` | `N/A` | `Open ShoMetrics Control Panel for helper diagnostics.` | Show connection, protocol, health, and warning details. |
| `driverIssue` | `N/A` | `Open ShoMetrics Control Panel to check sensor driver status.` | Show driver/sensor-path warning details and next action. |
| `descriptorCatalogPending` | `N/A` | `Waiting for the helper metric catalog.` | Show descriptor request status and helper health. |
| `descriptorCatalogUnavailable` | `N/A` | `The helper metric catalog is not available yet.` | Show descriptor failure details and helper health. |
| `sensorPending` | `...` | `Waiting for this sensor group to refresh.` | No user action required unless it persists. |
| `noSensor` | `N/A` | `This metric is not available on this hardware.` | Show descriptor count, source warnings, and sensor availability details. |
| `invalidSensorValue` | `N/A` | `The sensor exists but is not returning a valid value.` | Show source warning and raw sensor identity when available. |
| `expiredSensorValue` | `N/A` | `The last valid value expired.` | Show last value age and source warning. |
| `unsupportedPlatform` | `N/A` | `This sensor requires the Windows helper.` | N/A |

Keep Deck copy short enough for every view. The PI can use longer copy because
it has layout space and can show buttons/links. Key copy is intentionally much
coarser than the internal state model: confirmed missing helper on static
helper-required surfaces gets `Install helper`, usable Advanced Sensor with no
selected metric gets `Choose metric`, first group refresh gets `...`, and
ordinary helper, driver, unsupported, fallback warmup, and metric no-value
states render `N/A`.
`Install helper` and `Choose metric` are rendered by action-owned notice bodies,
not by selected metric primitives. The PI and ShoMetrics Control Panel provide
the specific next action.

### State Resolution Priority

When multiple facts are available, resolve visible state in this order:

1. Unsupported platform: show `unsupportedPlatform` for already-placed keys on
   non-Windows systems. Action-list visibility alone does not cover synced or
   imported profiles.
2. Fresh value: show the metric value. Do not replace a fresh value with helper
   health warning copy.
3. No selected metric: show `helperInstallRequired` only when Advanced Sensor
   cannot load its catalog because `helperNotInstalled` is confirmed. Show
   `metricSelectionRequired` when the catalog path is usable but no metric has
   been selected. If the helper is installed but stopped, keep key copy as
   `N/A` and show start-helper guidance in PI.
4. Helper not installed for a static helper-required selected metric or
   helper-only built-in: show `helperInstallRequired`. This covers CPU
   temperature/power and selected Advanced Sensor metrics.
5. Helper transport failure for an already selected metric: keep key copy as
   `N/A` and show `helperStopped`, `helperStarting`, `versionMismatch`, or
   `helperError` in PI.
6. Helper-preferred fallback metrics such as GPU telemetry keep key copy as
   `N/A` while fallback is warming up or unavailable. Do not infer
   `Install helper` from a momentary lack of fallback samples.
7. Driver/sensor-path warnings may refine PI and ShoMetrics Control Panel
   guidance, but the key stays `N/A`.
8. Metric unavailable reason: show `sensorPending` as `...` in non-minimal
   views; otherwise keep the key as `N/A` and show metric no-value details in PI.
9. Unknown no-data state: show `helperError` in PI and conservative `N/A` on the
   key.

This preserves existing values during transient warning states but still lets a
hard helper outage override stale or missing data.

### Transient Deadlines

Transient states must not wait forever.

| State | Key copy | Deadline | Upgrade |
| --- | --- | --- | --- |
| `helperStarting` | `N/A` | Service-status start-pending window or 15 seconds, whichever is longer once measured. | `helperError` with PI guidance to open ShoMetrics Control Panel. |
| `sensorPending` | `...` | Three requested poll intervals plus a small grace window, capped by a fixed upper bound. | `helperError` if no refresh attempt is observed; `noSensor` PI guidance if the group refreshes but the metric is absent. |
| descriptor load `pending` | `Loading metrics...` in PI | Descriptor request timeout plus retry cooldown. | install/start/error guidance from helper status. |

Slice 1 may implement only `sensorPending` for known single-group reads, but it
must define how the state exits.

## Localized Copy Table

These strings are product copy targets, not a framework requirement. If an i18n
layer is added later, use these as initial keys.

| Key | English | Japanese | Chinese |
| --- | --- | --- | --- |
| `helperInstallRequired` | `Install helper` | `ヘルパーをインストール` | `安装 Helper` |
| `metricSelectionRequired` | `Choose metric` | `メトリックを選択` | `选择指标` |
| `helperStopped` | `N/A` | `N/A` | `N/A` |
| `helperStarting` | `N/A` | `N/A` | `N/A` |
| `versionMismatch` | `N/A` | `N/A` | `N/A` |
| `helperError` | `N/A` | `N/A` | `N/A` |
| `driverIssue` | `N/A` | `N/A` | `N/A` |
| `descriptorCatalogPending` | `N/A` | `N/A` | `N/A` |
| `descriptorCatalogUnavailable` | `N/A` | `N/A` | `N/A` |
| `sensorPending` | `...` | `...` | `...` |
| `noSensor` | `N/A` | `N/A` | `N/A` |
| `invalidSensorValue` | `N/A` | `N/A` | `N/A` |
| `expiredSensorValue` | `N/A` | `N/A` | `N/A` |
| `unsupportedPlatform` | `N/A` | `N/A` | `N/A` |
| `openControlPanel` | `Open ShoMetrics Control Panel` | `ShoMetrics コントロールパネルを開く` | `打开 ShoMetrics 控制面板` |
| `installHelper` | `Install ShoMetrics Helper to use advanced sensors.` | `高度なセンサーを使うには ShoMetrics Helper をインストールしてください。` | `安装 ShoMetrics Helper 后才能使用高级传感器。` |
| `startHelper` | `Start ShoMetrics Helper from ShoMetrics Control Panel.` | `ShoMetrics コントロールパネルから ShoMetrics Helper を起動してください。` | `请从 ShoMetrics 控制面板启动 ShoMetrics Helper。` |
| `checkDriver` | `Open ShoMetrics Control Panel to check sensor driver status.` | `ShoMetrics コントロールパネルでセンサードライバーの状態を確認してください。` | `打开 ShoMetrics 控制面板检查传感器驱动状态。` |
| `updateShoMetrics` | `Update ShoMetrics Helper and Hub to matching versions.` | `ShoMetrics Helper と Hub を対応するバージョンに更新してください。` | `请将 ShoMetrics Helper 和 Hub 更新到匹配版本。` |

The short Deck copy intentionally avoids long words such as "unavailable". It
uses `N/A` for ordinary no-data states because the key is not the right surface
for detailed guidance. `Install helper`, `Choose metric`, and `...` are the
only exceptions: helper installation and metric selection are onboarding
actions, and pending refresh is a short expected wait. Do not use
`Setup required`; it is ambiguous.

## Critical User Journeys

### CUJ 1: Non-Windows User Browses Actions

User is on macOS or another non-Windows platform.

Expected behavior:

- `Advanced Sensor` is not shown in the Stream Deck action list.
- Existing cross-platform widgets continue to appear.
- No key should render helper install copy for a widget the user could not add.
- PI dropdowns do not list Windows-helper-only metrics or source choices on
  non-Windows platforms.
- If a profile created on Windows already contains an Advanced Sensor key and
  then syncs to macOS, the key shows `N/A` and PI explains Windows-only support.

Implementation:

- Add `OS: ["windows"]` to the `Advanced Sensor` action entry in
  `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`.
- Keep the action UUID unchanged: `com.ez.sho-metrics.catalog-metric`.
- If a future macOS helper/catalog source is added, remove or widen this action
  OS gate in the manifest.
- Do not treat action-list visibility as a complete platform guard. Runtime
  render logic must still handle already-placed unsupported keys.
- Treat PI option filtering as a separate platform guard. Existing unsupported
  selections may remain stored for profile portability, but they should render
  as selected-unavailable rather than as selectable current-platform choices.

### CUJ 2: Windows User Drags Advanced Sensor Before Installing Helper

User sees the action, drags it to a key, and opens the PI.

Expected behavior:

- Key: `Install helper` once the source client confirms
  `helperNotInstalled`. It may temporarily show `N/A` before service probing
  completes.
- PI Metric section: explains that ShoMetrics Helper must be installed before
  advanced sensors can be selected, instead of only saying
  `Metrics unavailable`.
- DEBUG may show missing pipe or service not installed, but ordinary PI copy
  should use install-helper language.

Implementation:

- `CatalogMetricDescriptorStatusNote` must consider runtime helper status, not
  only descriptor load state.
- `WindowsHelperSourceClient` already refines pipe-missing status to
  `helperNotInstalled` when service probing confirms it.
- PI should map `helperNotInstalled` to `helperInstallRequired`.
- Action rendering should show `Install helper` through an action-owned notice
  body. Do not emit install copy as a shared helper-backed
  `unavailableDisplayValue` or from generic no-data rendering.

### CUJ 2A: Windows User Drags Advanced Sensor After Helper Is Usable

User sees the action, drags it to a key, and the helper/catalog path is usable,
but no metric has been selected yet.

Expected behavior:

- Key: `Choose metric`.
- PI: show the metric picker.
- ShoMetrics Control Panel: no action required.

Implementation:

- The no-selected-metric path owns `Choose metric`.
- `Choose metric` uses the Advanced Sensor no-selection notice body; it is not
  drawn by the selected metric primitive.
- Do not show `Install helper` when the helper is installed/running or when
  the catalog is already usable.

### CUJ 3: Helper Installed But Service Is Not Running

User installed the helper earlier, but the service is stopped.

Expected behavior:

- Key after metric selection: `N/A`.
- PI: `Start ShoMetrics Helper from ShoMetrics Control Panel.`
- ShoMetrics Control Panel: service installed, runtime not running.

Implementation:

- Keep service probing in the helper source client and ShoMetrics Control Panel.
- Map `SourceClientStatus.reason === "helperStopped"` to `helperStopped`.
- Do not show `Install helper`; the service exists and the user action is start
  or repair, surfaced in PI/ShoMetrics Control Panel.

### CUJ 4: Helper Running But Driver/Sensor Path Is Unhealthy

Examples:

- PawnIO/MSR path is unavailable for CPU temperature/power.
- LHM reports thermal status invalid.
- GPU driver APIs are present but the selected telemetry path returns no valid
  value.

Expected behavior:

- Key: `N/A` when the selected metric has no fresh value and helper
  warnings/status point to a driver or sensor-path issue.
- PI: explain that ShoMetrics Control Panel can show the driver status.
- ShoMetrics Control Panel: show driver/sensor-path warnings and support
  details without forcing the key to expose every diagnostic kind.

Implementation:

- Keep `SourceWarning` as the current support/log surface. It may carry stable
  codes, human-readable messages, and optional metric/source-sensor/component
  hints.
- Do not add a typed `SourceHealthDiagnosticKind` contract in Slice 1. Add one
  only when Hub or ShoMetrics Control Panel has a real machine decision that
  depends on the diagnostic kind.
- If warning component hints are added, keep them small and support-facing:

| Prefix | Meaning | Generic fallback |
| --- | --- | --- |
| `driver:` | Driver or privileged sensor access path. | `N/A` key copy plus PI driver guidance. |
| `sensor:` | Hardware sensor family. | `N/A` key copy plus PI sensor guidance. |
| `lhm` | LibreHardwareMonitor session/catalog path. | `N/A` key copy plus descriptor-load guidance. |
| `service:` | Helper service/runtime path. | install/start/transport guidance. |

The string after a known component prefix is source-owned and display/debug only.
Hub may branch on the prefix, not on arbitrary suffixes.

Node must not treat helper self-reported health as the only render truth. It
should use data-path state first, then use warnings/status only to improve PI
guidance and ShoMetrics Control Panel support details.

### CUJ 4A: Helper And Hub Protocol Versions Do Not Match

User has installed ShoMetrics, but the helper and Hub speak incompatible
protocol versions.

Expected behavior:

- Key: `N/A`.
- PI: `Update ShoMetrics Helper and Hub to matching versions.`
- ShoMetrics Control Panel: show Hub version, helper version, and protocol
  version.

Implementation:

- Map `SourceClientStatus.reason === "protocolMismatch"` to
  `versionMismatch`.
- Do not collapse protocol mismatch into generic helper error copy.
- Keep version-skew wire handling safe for development and partial upgrades.

### CUJ 5: Intel/AMD GPU User Drags GPU Widget

User has an Intel or AMD GPU and chooses a GPU metric.

Expected behavior:

- If helper/LHM exposes the metric, render it normally.
- If Node/NVIDIA fallback provides a fresh value, render it normally.
- If the helper is not installed and fallback cannot provide a value, key:
  `N/A`; PI may explain that installing the helper can enable broader GPU
  telemetry.
- If the specific GPU metric is unsupported, resolve to `noSensor` and show
  `N/A` key copy when the helper is installed/reachable enough to prove the
  metric is not available.
- PI explains that this metric is not available on this hardware.

Implementation:

- Continue to use metric unavailable reports from the read path.
- Do not infer "NVIDIA tool failed" for non-NVIDIA hardware.
- Do not infer `Install helper` from momentary fallback no-sample states.
- If GPU source routing tries a NVIDIA-specific path in the future, it must be
  gated by source/hardware identity before surfacing user copy.

### CUJ 6: NVIDIA User Has GPU Widget But NVIDIA Telemetry Path Fails

User has NVIDIA hardware, but the selected telemetry path fails due to driver,
API, or helper issues.

Expected behavior:

- Key: normal value when Node/NVIDIA fallback provides fresh data.
- Key: `N/A` when the helper is not installed and the fallback path also cannot
  provide a fresh value.
- Key: `N/A` for driver/API or transport/helper failures that need user
  attention.
- Key: `N/A` with `noSensor` PI detail only when the source is healthy and
  the metric is genuinely not available.

Implementation:

- Keep source health, transport failure, and metric unavailable reason separate.
- Use `SourceClientStatus` for transport/helper status.
- Use `MetricUnavailableReport` for metric-level no-value status.
- Let fresh fallback data win over helper status copy.
- Keep helper-preferred GPU fallback metrics on `N/A` when no fallback value is
  fresh. Avoid cold-start flashes from `Install helper` to a later fallback
  value.
- Use source warnings/support details for driver/API path hints until a typed
  diagnostic contract is justified by a machine decision.

### CUJ 7: Selected Advanced Sensor Has Not Warmed Its Polling Group Yet

User selects a metric immediately after startup or after adding the widget. The
helper is running, but the requested polling group has not produced its first
snapshot.

Expected behavior:

- Key: `...` in non-minimal views; minimal circle may keep the muted icon
  placeholder.
- PI: `Waiting for this sensor group to refresh.`
- This should not resolve to `noSensor`.

Implementation:

- Stop falling back missing per-group snapshots to the global latest snapshot
  for read results that need metric-level unavailable semantics.
- Add a source unavailable reason for pending group refresh.

Suggested proto addition:

```proto
enum MetricUnavailableReason {
  METRIC_UNAVAILABLE_REASON_UNSPECIFIED = 0;
  METRIC_UNAVAILABLE_REASON_NO_SENSOR = 1;
  METRIC_UNAVAILABLE_REASON_INVALID_VALUE = 2;
  METRIC_UNAVAILABLE_REASON_EXPIRED = 3;
  METRIC_UNAVAILABLE_REASON_PENDING_REFRESH = 4;
}
```

C# behavior:

- `MetricSnapshotCache.ReadPollingGroup(...)` should expose whether the group
  snapshot exists.
- `ReadSnapshotAsync(metricIds)` should return `PENDING_REFRESH` for requested
  metrics whose known polling group has not published its first snapshot.
- Unknown metric ids remain `NO_SENSOR` or a separate validation error if the
  source can prove they are not in the descriptor catalog.

Node behavior:

- Map `pendingRefresh` to `sensorPending` and key copy `...`.
- Treat it as an expected transient state. Do not log it as an error.
- Deadline inputs must come from source-owned group refresh state, such as last
  refresh attempt, last success, last failure, descriptor generation, and the
  requested poll interval. Do not infer pending duration from widget render
  frequency.

### CUJ 8: Selected Advanced Sensor Truly Does Not Exist

User selected a metric before a hardware/driver change. Later the descriptor
disappears.

Expected behavior:

- Key: `N/A`
- PI preserves the old selected metric enough for the user to replace it.
- PI explains that the selected metric is unavailable on the current hardware.

Implementation:

- Keep persisted `metric_id` and detected fallback hints.
- The picker can resolve missing descriptors as a selected-but-unavailable
  state rather than pretending the user selected nothing.
- Do not silently clear the selected metric.

### CUJ 8A: Descriptor Catalog Is Not Ready

The helper is reachable, but the descriptor catalog has not loaded, failed to
load, or is known to be stale after a helper restart, Windows resume, or
hardware topology change.

Expected behavior:

- Key before metric selection: `N/A`.
- PI: show catalog loading or catalog unavailable guidance.
- Do not mark a selected metric as `No data` only because the catalog is not
  ready.

Implementation:

- Descriptor cache state belongs to the source client.
- Descriptor catalog not-ready is distinct from metric-level `NO_SENSOR`.
- Preserve selected metric settings while the catalog is unavailable.
- Invalidate or refresh descriptor state after helper restart, protocol change,
  Windows resume, or hardware topology change.

### CUJ 9: User Fixes The Helper While A Key Shows An Error

User sees `Install helper`, `Choose metric`, or `N/A` with PI guidance, then
installs the helper, starts the service, updates the helper/Hub pair, or repairs
the driver path.

Expected behavior:

- The key recovers automatically after the next successful helper read.
- PI updates from error guidance back to metric controls without requiring a
  Stream Deck restart.
- ShoMetrics Control Panel refresh shows the latest service/helper/driver
  status.

Implementation:

- Helper source retry/backoff must be shared per source client, not per widget.
- Fixing the helper should reset transient backoff after a successful health,
  descriptor, or snapshot request.
- Descriptor cache failures must not permanently clear selected metric settings.
- Add tests for error -> recovered transitions in Hub where possible.

### CUJ 10: Helper Fails While A Widget Was Showing Data

User had a working widget. The helper stops or starts returning errors.

Expected behavior:

- During the freshness window, the last good value may remain visible.
- Once the sample is stale, the key should show `Install helper` only for
  static helper-required surfaces when the helper service is now confirmed not
  installed. Helper-preferred fallback metrics and other stopped/error/runtime
  failures stay `N/A`.
- PI DEBUG shows last value age and helper status.

Implementation:

- Keep source status and stale-value logic separate.
- Do not append retained/stale placeholder values to metric history.
- Source status should override missing/stale data once the last good sample is
  outside the action freshness window.

### CUJ 11: Many Helper-Backed Widgets Fail At Once

User has several helper-backed widgets and the helper stops.

Expected behavior:

- All keys can show consistent short copy.
- Hub does not launch one service-status probe per widget.
- Logs remain throttled and low-cardinality.

Implementation:

- Service-status and helper-health probes must be source-client-owned and
  cached.
- Widget render should read cached source status only.
- No action should call `sc.exe`, helper health, or ShoMetrics Control Panel
  APIs directly from the render path.

### CUJ 12: Windows Resumes Or Hardware Topology Changes

User resumes Windows from sleep, docks/undocks hardware, updates a driver, or
changes GPU/storage/network topology while widgets are active.

Expected behavior:

- Last good values may remain visible only inside the normal freshness window.
- Helper pipe/service status may temporarily show starting/error states.
- Descriptor catalog refresh may temporarily show catalog pending/unavailable.
- Selected metrics stay persisted; the user is not forced to reconfigure unless
  the metric is truly unavailable after refresh.
- Widgets recover after the next successful descriptor and snapshot refresh.

Implementation:

- Source-client caches must invalidate or refresh on helper restart, protocol
  change, Windows resume, and descriptor generation change.
- Do not add a general TTL framework in this slice. Model the concrete events
  needed by this CUJ.
- Multiple widgets should share the same in-flight service-status, health, and
  descriptor refresh work.

## Widget Rendering Policy

Do not implement a dedicated unavailable SVG/body as the default unavailable
state.

Reasons:

- It breaks the user's selected Circle/Text/Bar/Line view in a visually abrupt
  way.
- It makes transient startup states look like major failures.
- It teaches the user to ignore the selected theme whenever data is missing.

Preferred improvement:

- Keep ordinary no-data states inside the selected primitive and render `N/A`.
- Reserve `Install helper` for confirmed missing-helper states on static
  helper-required surfaces.
- Keep `Choose metric` for the no-selected-metric state when helper/catalog
  access is usable.
- Render `Install helper` and `Choose metric` with action-owned notice bodies.
  This notice body is a static guidance surface, not a shared unavailable/error
  SVG and not a selected-view primitive.
- Put long guidance in PI and ShoMetrics Control Panel.

Implementation options:

| Option | Recommendation | Notes |
| --- | --- | --- |
| Ordinary no-data states render `N/A` in the selected primitive | Preferred | Avoids long-copy fitting and preserves the selected view. |
| Action-owned notice body | Preferred static guidance exception | The only key surface allowed to render `Install helper` or `Choose metric`; it is action-owned and uses static, controlled copy. |
| `Install helper`/`Choose metric` inside ordinary primitives | Avoid | This leaks onboarding copy into every Circle/Text/Bar/Line layout and recreates long-text fitting work. |
| Shared compact body for all unavailable states | Avoid | This still feels like switching to a dedicated error/no-data layout. |
| Full dedicated error SVG | Avoid | Too visually abrupt for helper/source states. |

## ShoMetrics Control Panel Security And Privilege Model

ShoMetrics Control Panel should be a normal-user status and settings surface by
default. In this document, "ShoMetrics Control Panel" means the ShoMetrics
status/settings app, not Windows Control Panel.

Opening ShoMetrics Control Panel from Hub/Property Inspector must be equivalent
to launching the same installed app from Start Menu:

- Use a fire-and-forget Windows Shell launch/focus request.
- Hub must not retain a process handle as feature state.
- Hub must not wait for exit, restart, kill, or supervise the ShoMetrics
  Control Panel process.
- Single-instance and focus-existing-window behavior belong to ShoMetrics
  Control Panel.
- The launched app runs as the current interactive user unless the user chooses
  a separate action that explicitly requires elevation.

Communication model:

- ShoMetrics Control Panel reads Windows service installed/running state through
  the Win32 Service Control Manager API.
- ShoMetrics Control Panel reads helper health, descriptors, and snapshots
  through `MetricSourceService` gRPC over the local Windows named pipe.
- ShoMetrics Control Panel does not talk directly to Windows Core or
  `LibreHardwareMonitorSession`; Core stays behind the service boundary.

Allowed without elevation:

- Read Windows service status.
- Read helper health through the existing named pipe.
- Show descriptor/sample counts.
- Show warnings, support diagnostics, and logs path.
- Copy diagnostics.
- Open log folder.
- Change user-level UI preferences when those preferences live in the user's
  profile.

Require explicit elevation or installer/service broker:

- Install, repair, or uninstall helper service.
- Start/stop service if Windows policy requires admin.
- Install, repair, or remove drivers.
- Change service account, service SID, or machine-wide service config.
- Change kernel-adjacent helper behavior.
- Change machine-wide auto-start/update policy.

Do not run the entire ShoMetrics Control Panel elevated just because one button
may need elevation. Use a separate elevated process, installer flow, or
service-control operation when the user chooses a privileged action.

If future settings include auto-update, start-at-login, start-minimized, or
helper telemetry options:

- User-profile settings can be edited as normal user.
- Machine/service settings need explicit privileged apply.
- Core/helper must expose a separate control API for writes. The current
  `MetricSourceService` is intentionally read/data-plane focused and should not
  grow privileged mutation calls casually.

### IPC Trust Boundary

The named pipe is a privileged-service boundary. Reading status and metrics is
allowed only because the read API is designed to be side-effect-light and safe
for normal local users.

Requirements:

- Keep helper metric/source RPCs read-only except for bounded refresh-demand
  control.
- Do not add install, driver, service-control, arbitrary command, file-read, or
  DLL-load behavior to `MetricSourceService`.
- Document pipe ACL principals in the IPC/packaging plan before release.
- Treat every pipe caller as untrusted local input. Validate message size,
  strings, counts, intervals, and enum values at the service boundary.
- Keep logs and diagnostics bounded. Do not dump raw hardware names or sensor ids
  in production user-facing exports unless the user explicitly chooses a
  diagnostics export.

### Diagnostics Sanitization

ShoMetrics Control Panel's "Copy diagnostics" path must have a privacy
boundary:

- Include status codes, counts, timestamps, versions, and high-level component
  names by default.
- Include raw hardware/sensor identity only in an explicit advanced diagnostics
  export.
- Do not include full paths, user names, arbitrary exception dumps, or raw
  hardware tree dumps in the default clipboard text.

### Elevated Actions

Future elevated actions must not trust mutable user-writable paths:

- Launch only installed, signed, expected binaries for repair/update flows.
- Prefer installer-owned repair/update operations for service and driver changes.
- Keep UAC prompts tied to the specific user action that needs elevation.

## Source API Changes

### Add Pending Refresh Reason

Add `METRIC_UNAVAILABLE_REASON_PENDING_REFRESH` to distinguish "known metric,
known group, first group snapshot not ready" from "no matching sensor".

This directly addresses the `ReadPollingGroup` missing-group fallback.

Version-skew handling:

- New Hub + old helper cannot receive `PENDING_REFRESH`; it will keep old
  helper behavior until helper is updated.
- Old Hub + new helper must treat unknown unavailable reasons as `unknown` for
  DEBUG/support and generic no-data for widget copy, not crash.
- Helper and Hub are expected to ship together for user-facing releases, but the
  wire mapping must still degrade safely during local dev and partial upgrades.

### Defer Structured Health Diagnostics

Do not add a typed health diagnostic contract in the pending-refresh slice.

Current rule:

- `SourceClientStatus` remains structured because it drives different PI
  actions such as install, start, retry, and version repair.
- `MetricUnavailableReason` remains structured because it drives source/runtime
  correctness, especially `PENDING_REFRESH` versus `NO_SENSOR`.
- Driver/sensor-path detail remains support-facing `SourceWarning` text/code
  until a real machine consumer needs different behavior per diagnostic kind.

If a future slice needs machine decisions such as "driver repair button" versus
"sensor unsupported", add the smallest structured contract needed at that time.
That future contract must define scope so an unrelated GPU, CPU, driver, or LHM
warning cannot change copy for the wrong widget.

Node should consume diagnostics as supporting evidence:

```text
data path says no value
  -> metric unavailable reason chooses metric state
  -> source status chooses helper install/start/transport state
  -> warnings/support details refine PI and ShoMetrics Control Panel guidance
```

### Add Descriptor Catalog State

Descriptor catalog availability is source-client state, not a metric-level
sensor result. The Hub must not convert catalog pending/failure into
`NO_SENSOR`.

Minimum runtime states:

- descriptor catalog pending
- descriptor catalog ready
- descriptor catalog failed or unavailable

The Property Inspector uses these states for picker loading/install guidance.
Action rendering uses them only when the selected metric cannot be resolved and
no fresher metric value exists.

## Hub Runtime Changes

1. Extend runtime source mapping for new unavailable reason:
   - proto `PENDING_REFRESH`
   - runtime `pendingRefresh`
   - displayed metric reason `pendingRefresh`
2. Update `MetricSourceDiagnostic` to show the new reason.
3. Update `readHelperBackedWidgetData(...)` to use metric unavailable reason in
   addition to helper status.
4. Update `CatalogMetricDescriptorStatusNote` to render install/start/helper guidance
   when descriptor loading fails because helper is missing or stopped.
5. Add unsupported-platform fallback copy for already-placed Advanced Sensor
   keys on non-Windows systems.
6. Keep DEBUG details separate from user-facing copy.
7. Cache service-status and health probing in the source client. Action render
   paths must only read cached state.
8. Add `versionMismatch` PI guidance for protocol mismatch. Key copy stays
   `N/A`.
9. Add descriptor catalog pending/unavailable handling in the PI picker path.
10. Use source-client-owned in-flight request dedupe for service status, health,
    and descriptor refreshes. Do not create a general singleflight framework.
11. Do not emit `Install helper` from `readHelperBackedWidgetData(...)` as an
    unavailable display value. Shared helper-backed readers may expose a small
    install-notice resolver, but action view builders own whether that notice is
    passed to rendering because they know selection and fallback context.
12. For built-in stable metrics, derive helper-required install notice
    eligibility from the static source-routing classification in
    `metric-source-preferences.ts`. Do not hard-code per-action booleans and do
    not infer helper requirement from sample freshness.
13. On non-Windows platforms, filter PI metric/source dropdowns so
    Windows-helper-only metrics are not offered as selectable options. Already
    stored unsupported selections should be preserved but shown as unavailable.

## C# Core Changes

1. Replace `ReadPollingGroup` fallback semantics for known single-group reads:
   - all requested metric ids are known and belong to one polling group, and the
     group snapshot exists: return the group snapshot.
   - all requested metric ids are known and belong to one polling group, but the
     group snapshot is missing: return unavailable reports with
     `PENDING_REFRESH`.
   - any requested metric id is unknown: return `NO_SENSOR` for that metric.
2. Keep the read path direct. A small `TryResolveKnownSinglePollingGroupId(...)`
   helper is enough:
   - empty request uses latest.
   - known single group reads that group's snapshot or returns pending refresh.
   - unknown or known multi-group reads keep the current conservative latest
     path unless a production caller needs per-metric pending semantics.
3. Slice 1 may leave known multi-group reads on the current conservative latest
   path if no production caller needs per-metric pending semantics. If a
   multi-group caller needs this state later, add per-metric resolution instead
   of guessing from one global snapshot.
4. Add tests for startup race:
   - known selected metric before first group refresh returns pending refresh.
   - first real group refresh replaces pending with value.
   - true missing metric remains no sensor.
   - old global latest data does not turn a known pending group into no sensor.
5. Keep full latest reads for full-refresh diagnostics separate from per-group
   reads.

Do not make `ReadPollingGroup` silently return a global snapshot for a known
group that has never published. That is the state collapse this plan fixes.

## Status Resolution Examples

| Data path | Source status | Warnings/support details | Key state |
| --- | --- | --- | --- |
| Fresh value | any non-fatal warning | any warning | normal metric value |
| No selected Advanced Sensor metric | `helperNotInstalled` | none | `Install helper` |
| No selected Advanced Sensor metric | `available` | none | `Choose metric` |
| No selected Advanced Sensor metric | `helperStopped` | none | `N/A` with start-helper PI guidance |
| Advanced Sensor selected metric | `helperNotInstalled` | none | `Install helper` |
| Helper-only built-in metric, such as CPU temperature/power | `helperNotInstalled` | none | `Install helper` |
| Helper-preferred fallback metric, such as GPU telemetry | `helperNotInstalled` | none | `N/A` until fallback produces a value |
| Stale/missing | `helperStopped` | none | `N/A` with `helperStopped` PI guidance |
| Stale/missing | `pipeMissing` during short startup window | none | `N/A` with `helperStarting` PI guidance |
| Stale/missing | `protocolMismatch` | none | `N/A` with version guidance |
| Stale/missing | `sourceError` / `timeout` | none | `N/A` with helper error PI guidance |
| Missing while descriptor catalog is pending | `available` | none | `N/A` with `descriptorCatalogPending` PI guidance |
| Missing while descriptor catalog failed | `available` | none | `N/A` with catalog failure PI guidance |
| Missing with `pendingRefresh` | `available` | none | `...` with `sensorPending` PI guidance until deadline |
| Missing with `noSensorData` | `available` | none | `N/A` with no-sensor PI guidance |
| Missing with `invalidValue` | `available` | driver/sensor warning | `N/A` with warning-assisted PI guidance |
| Missing with unknown reason | `available` | none | generic `N/A` |

`protocolMismatch` must resolve before generic helper errors. The generic row is
for source errors that have no more specific remediation.

## Test Matrix

| Area | Required coverage |
| --- | --- |
| C# Core | Known single-group pending, true unknown metric, old global latest ignored for known missing group, first group refresh replaces pending. |
| Proto/runtime mapping | `PENDING_REFRESH`, unknown unavailable enum values, old-helper/new-Hub fallback, protocol mismatch status. |
| Hub state resolver | State priority table, stale value versus source status, `versionMismatch`, warning-assisted PI guidance. |
| Property Inspector | Helper missing/stopped, protocol mismatch, descriptor catalog pending/unavailable, picker disabled/install guidance. |
| Manifest/platform | Advanced Sensor OS gate, PI dropdown filtering for unsupported metrics/source choices, and already-placed unsupported-platform fallback. |
| Rendering | Ordinary no-data states render `N/A` in selected views; static helper-required missing-helper states render `Install helper` through action-owned notice bodies; helper-preferred fallback metrics do not infer `Install helper` from momentary no-sample states; no-selected Advanced Sensor renders `Choose metric` through the action-owned notice body; `sensorPending` renders `...` outside minimal circle; no full dedicated error SVG/body by default. |
| ShoMetrics Control Panel | Normal-user service status, gRPC health read, sanitized diagnostics copy, no privileged mutation in data-plane service. |
| Recovery | Helper install/start, protocol repair, driver repair, Windows resume/topology change, shared source-client retry/backoff reset. |

## Acceptance Criteria

- Advanced Sensor is not visible on non-Windows action lists.
- Already-placed Advanced Sensor keys on non-Windows show `N/A` on the key and
  Windows-only guidance in PI instead of helper install copy.
- Non-Windows PI dropdowns do not offer Windows-helper-only metrics or source
  choices; existing unsupported selections are preserved as unavailable.
- A never-installed helper produces key-level `Install helper` for Advanced
  Sensor onboarding/selection and static helper-only built-ins such as CPU
  temperature/power.
- Built-in helper-backed widgets never show `Choose metric`; that copy belongs
  only to Advanced Sensor no-selection.
- A usable Advanced Sensor with no selected metric produces `Choose metric`.
- `Install helper` and `Choose metric` render through action-owned notice
  bodies, not through Circle/Text/Bar/Line primitives.
- No user-facing key copy uses `Setup required`.
- A stopped helper produces `N/A` on the key and stopped guidance in PI, not
  install guidance.
- A protocol mismatch produces update guidance, not generic helper error.
- A known metric waiting for first group refresh produces `...` on non-minimal
  keys and waiting guidance in PI, not no-sensor guidance.
- Descriptor catalog pending/failure does not erase selected metrics or become
  no-sensor.
- Pending refresh has a documented deadline and upgrade state.
- A truly unavailable metric produces no-sensor guidance.
- Running widgets recover automatically after helper/service/driver recovery.
- Running widgets switch from stale value to `N/A` with PI guidance when helper
  install/start/runtime state fails.
- Helper-preferred stable aliases that can fall back to Node/NVIDIA telemetry
  show fallback values when they are fresh and otherwise stay `N/A`; they do
  not flash `Install helper` while fallback data is warming up or unavailable.
- Helper-retained values may still show `N/A` while Hub uses its temporary 7s
  timestamp freshness gate; the follow-up fix is to consume source-reported
  freshness/retained attribution.
- Driver/sensor-path issues guide users through PI and ShoMetrics Control Panel
  without adding a typed health diagnostic contract in this slice.
- Deck unavailable copy stays short: `Install helper` for confirmed missing
  helper on static helper-required surfaces, `Choose metric` for Advanced
  Sensor metric selection, `...` for first refresh, and `N/A` for ordinary
  no-data states.
- PI gives the next action.
- ShoMetrics Control Panel can show detailed state as a normal-user app.
- Multiple helper-backed widgets share source status probing.
- Windows resume or topology change preserves selected metrics and recovers
  after descriptor plus snapshot refresh.
- No new privileged mutation is added to the read/data-plane metric source API.

## Non-Goals

- Do not add a general i18n framework in this batch.
- Do not implement installer/update flows in this batch.
- Do not add a dedicated error/unavailable SVG body as the default no-data
  rendering.
- Do not make Stream Deck or the Hub plugin run as administrator.
- Do not make ShoMetrics Control Panel elevated by default.
