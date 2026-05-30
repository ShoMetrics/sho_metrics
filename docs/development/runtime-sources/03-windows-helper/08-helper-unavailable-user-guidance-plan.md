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
- `readHelperBackedWidgetData(...)` currently maps helper-backed no-data to a
  small set of widget strings: `Helper required`, `Helper error`, or
  `No sensor data`.
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
| Full dedicated error SVG | Do not use a full-screen, theme-breaking error SVG by default. | A sudden error page is visually jarring and can make transient source states feel worse. Keep the user's selected theme/view frame and show compact unavailable copy inside it. |
| Error-body exercise | Keep one UX exercise for compact unavailable body rendering. | Some current views cannot fit `No sensor data` cleanly. The preferred improvement is a small theme-aware unavailable body, not a full replacement frame. |
| ShoMetrics Control Panel naming | Use `ShoMetrics Control Panel` in user-facing guidance. Use `Open` only when the nearby UI already names the destination. | Bare `Control Panel` can be confused with Windows Control Panel. The product-owned name keeps support guidance unambiguous. |
| ShoMetrics Control Panel process privilege | Run ShoMetrics Control Panel as normal user by default. Use UAC only for explicit privileged actions. | Reading helper status is safe as a normal user. Service install/start/stop, driver install/repair, or kernel-adjacent configuration changes must be separate, explicit elevated actions. |
| `Open` action lifecycle | Treat `Open ShoMetrics Control Panel` as a fire-and-forget Windows Shell launch/focus request. | Opening from the PI should behave like the user opening the same installed app from Start Menu. Hub must not own, monitor, restart, or kill the ShoMetrics Control Panel process. |
| Driver status source | Keep driver/sensor details in ShoMetrics Control Panel, DEBUG, and support text until a machine consumer needs structured decisions. | The key only needs to tell the user to check ShoMetrics. Do not build a typed health-diagnostic contract just to display human-readable details. |
| Render truth source | Node/Hub data-path state remains authoritative for widget rendering; helper health is supporting diagnosis. | A helper can report "available" while a metric still has no value. Widgets must be driven by actual metric values/unavailable reports, with helper health used to choose better guidance copy. |
| Health diagnostic contract | Defer the `kind`/`severity`/`scope` health diagnostic contract. Keep `SourceWarning` as the support/log surface for now. | Structured diagnostics are justified only when Hub or ShoMetrics Control Panel performs different machine actions based on the diagnostic kind. |
| Version mismatch UX | Treat helper/Hub protocol mismatch as `versionMismatch`, not generic `helperError`. | The user action is specific: update or repair the ShoMetrics install so Hub and helper use matching protocol versions. |
| Descriptor catalog state | Treat descriptor catalog pending/failure as "catalog not ready", not "metric does not exist". | Until the source catalog is available, Hub cannot prove that a selected metric is truly absent. |
| Freshness owner | Do not introduce a second Hub-owned source freshness system. Hub consumes source/runtime freshness and unavailable reports, while sources own retained-value semantics. | The Windows helper already owns retained sample freshness and age. Duplicating stale logic in Hub would create conflicting truth sources. |
| i18n scope | Define copy keys and English/Japanese/Chinese target text in this plan, but render English only until the Hub has a real i18n layer. | The repo does not currently have a general i18n layer. This plan prevents hard-coded copy drift without pretending localization is implemented. |

## Implementation Slices

Do not implement this whole document as one change. The first slice should fix
the concrete cache/user-copy bug without pulling in ShoMetrics Control Panel
settings or installer work.

| Slice | Scope | Why first or later |
| --- | --- | --- |
| 1. Pending refresh semantics | C# per-group missing snapshot handling, proto/runtime unavailable reason, widget/PI copy for `sensorPending`, tests. | Directly fixes the `ReadPollingGroup` fallback confusion and is small enough to review alone. |
| 2. Helper setup guidance | Advanced Sensor action OS gate, PI descriptor-load guidance for missing/stopped helper, helper status copy tests. | Improves first-run UX without changing driver health contracts. |
| 3. Runtime unavailable body | Shared compact unavailable body for tight themes/views. | Solves layout overflow after copy semantics are stable. |
| 4. Support diagnostics surface | ShoMetrics Control Panel warning display, diagnostic copy, optional component labels for support text. | Keep this human/support-facing until a real machine decision requires a typed health diagnostic contract. |
| 5. Privileged ShoMetrics Control Panel actions | Installer/service/driver repair entry points with explicit UAC. | Separate security design and release packaging work. |

## User-Facing State Model

Use short copy on the key. Put action guidance in the Property Inspector. Put
system status and repair actions in ShoMetrics Control Panel.

| State key | Deck copy | PI guidance | ShoMetrics Control Panel guidance |
| --- | --- | --- | --- |
| `setupRequired` | `Setup required` | `Install ShoMetrics Helper to use advanced sensors.` | Show service not installed. Offer install/repair once installer UX exists. |
| `helperStopped` | `Helper stopped` | `Start ShoMetrics Helper from ShoMetrics Control Panel.` | Show service installed but not running. Offer Start with UAC if needed. |
| `helperStarting` | `Waiting...` | `Waiting for ShoMetrics Helper to start.` | Show service start-pending or pipe missing inside a short startup window. |
| `versionMismatch` | `Check ShoMetrics` | `Update ShoMetrics Helper and Hub to matching versions.` | Show Hub version, helper version, and protocol version. |
| `helperError` | `Check ShoMetrics` | `Open ShoMetrics Control Panel for helper diagnostics.` | Show connection, protocol, health, and warning details. |
| `driverIssue` | `Check ShoMetrics` | `Open ShoMetrics Control Panel to check sensor driver status.` | Show driver/sensor-path warning details and next action. |
| `descriptorCatalogPending` | `Waiting...` | `Waiting for the helper metric catalog.` | Show descriptor request status and helper health. |
| `descriptorCatalogUnavailable` | `Check ShoMetrics` | `The helper metric catalog is not available yet.` | Show descriptor failure details and helper health. |
| `sensorPending` | `Waiting...` | `Waiting for this sensor group to refresh.` | No user action required unless it persists. |
| `noSensor` | `No data` | `This metric is not available on this hardware.` | Show descriptor count, source warnings, and sensor availability details. |
| `invalidSensorValue` | `No data` | `The sensor exists but is not returning a valid value.` | Show source warning and raw sensor identity when available. |
| `expiredSensorValue` | `No data` | `The last valid value expired.` | Show last value age and source warning. |
| `unsupportedPlatform` | `Windows only` | `This sensor requires the Windows helper.` | N/A |

Keep Deck copy short enough for tight views. The PI can use longer copy because
it has layout space and can show buttons/links. Key copy is intentionally
coarser than the internal state model:

- `Waiting...` covers expected transient startup, descriptor, and sensor-group
  warmup states.
- `No data` covers metric-level absence, invalid values, and expired retained
  values.
- `Check ShoMetrics` covers helper errors, driver/sensor-path issues, protocol
  mismatch, and descriptor catalog failures. The PI and ShoMetrics Control
  Panel provide the specific next action.

### State Resolution Priority

When multiple facts are available, resolve visible state in this order:

1. Unsupported platform: show `unsupportedPlatform` for already-placed keys on
   non-Windows systems. Action-list visibility alone does not cover synced or
   imported profiles.
2. Fresh value: show the metric value. Do not replace a fresh value with helper
   health warning copy.
3. Helper transport/setup failure: show `setupRequired`, `helperStopped`,
   `helperStarting`, `versionMismatch`, or `helperError`.
4. Driver/sensor-path warnings may refine PI and ShoMetrics Control Panel
   guidance, but the key uses the shared `Check ShoMetrics` action state.
5. Metric unavailable reason: show `sensorPending`/`descriptorCatalogPending`
   as `Waiting...`, or metric no-value states as `No data`.
6. Unknown no-data state: show `helperError` in PI and conservative `No data` on
   the key.

This preserves existing values during transient warning states but still lets a
hard helper outage override stale or missing data.

### Transient Deadlines

Transient states must not wait forever.

| State | Initial copy | Deadline | Upgrade |
| --- | --- | --- | --- |
| `helperStarting` | `Waiting...` | Service-status start-pending window or 15 seconds, whichever is longer once measured. | `helperError` with PI guidance to open ShoMetrics Control Panel. |
| `sensorPending` | `Waiting...` | Three requested poll intervals plus a small grace window, capped by a fixed upper bound. | `helperError` if no refresh attempt is observed; `No data` if the group refreshes but the metric is absent. |
| descriptor load `pending` | `Loading metrics...` in PI | Descriptor request timeout plus retry cooldown. | setup/stopped/error guidance from helper status. |

Slice 1 may implement only `sensorPending` for known single-group reads, but it
must define how the state exits.

## Localized Copy Table

These strings are product copy targets, not a framework requirement. If an i18n
layer is added later, use these as initial keys.

| Key | English | Japanese | Chinese |
| --- | --- | --- | --- |
| `setupRequired` | `Setup required` | `セットアップが必要` | `需要设置` |
| `helperStopped` | `Helper stopped` | `ヘルパー停止中` | `助手已停止` |
| `helperStarting` | `Waiting...` | `待機中...` | `等待中...` |
| `versionMismatch` | `Check ShoMetrics` | `ShoMetrics を確認` | `检查 ShoMetrics` |
| `helperError` | `Check ShoMetrics` | `ShoMetrics を確認` | `检查 ShoMetrics` |
| `driverIssue` | `Check ShoMetrics` | `ShoMetrics を確認` | `检查 ShoMetrics` |
| `descriptorCatalogPending` | `Waiting...` | `待機中...` | `等待中...` |
| `descriptorCatalogUnavailable` | `Check ShoMetrics` | `ShoMetrics を確認` | `检查 ShoMetrics` |
| `sensorPending` | `Waiting...` | `待機中...` | `等待中...` |
| `noSensor` | `No data` | `データなし` | `无数据` |
| `invalidSensorValue` | `No data` | `データなし` | `无数据` |
| `expiredSensorValue` | `No data` | `データなし` | `无数据` |
| `unsupportedPlatform` | `Windows only` | `Windows のみ` | `仅限 Windows` |
| `openControlPanel` | `Open ShoMetrics Control Panel` | `ShoMetrics コントロールパネルを開く` | `打开 ShoMetrics 控制面板` |
| `installHelper` | `Install ShoMetrics Helper to use advanced sensors.` | `高度なセンサーを使うには ShoMetrics Helper をインストールしてください。` | `安装 ShoMetrics Helper 后才能使用高级传感器。` |
| `startHelper` | `Start ShoMetrics Helper from ShoMetrics Control Panel.` | `ShoMetrics コントロールパネルから ShoMetrics Helper を起動してください。` | `请从 ShoMetrics 控制面板启动 ShoMetrics Helper。` |
| `checkDriver` | `Open ShoMetrics Control Panel to check sensor driver status.` | `ShoMetrics コントロールパネルでセンサードライバーの状態を確認してください。` | `打开 ShoMetrics 控制面板检查传感器驱动状态。` |
| `updateShoMetrics` | `Update ShoMetrics Helper and Hub to matching versions.` | `ShoMetrics Helper と Hub を対応するバージョンに更新してください。` | `请将 ShoMetrics Helper 和 Hub 更新到匹配版本。` |

The short Deck copy intentionally avoids long words such as "unavailable" where
possible. It also avoids "N/A" for setup and helper failures because those
states require user action.

## Critical User Journeys

### CUJ 1: Non-Windows User Browses Actions

User is on macOS or another non-Windows platform.

Expected behavior:

- `Advanced Sensor` is not shown in the Stream Deck action list.
- Existing cross-platform widgets continue to appear.
- No key should render helper setup copy for a widget the user could not add.
- If a profile created on Windows already contains an Advanced Sensor key and
  then syncs to macOS, the key shows `Windows only`.

Implementation:

- Add `OS: ["windows"]` to the `Advanced Sensor` action entry in
  `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json`.
- Keep the action UUID unchanged: `com.ez.sho-metrics.catalog-metric`.
- If a future macOS helper/catalog source is added, remove or widen this action
  OS gate in the manifest.
- Do not treat action-list visibility as a complete platform guard. Runtime
  render logic must still handle already-placed unsupported keys.

### CUJ 2: Windows User Drags Advanced Sensor Before Installing Helper

User sees the action, drags it to a key, and opens the PI.

Expected behavior:

- Key: `Choose metric` until a metric is selected.
- PI Metric section: explains helper setup is required instead of only saying
  `Metrics unavailable`.
- DEBUG may show missing pipe or service not installed, but ordinary PI copy
  should use setup language.

Implementation:

- `CatalogMetricDescriptorStatusNote` must consider runtime helper status, not
  only descriptor load state.
- `WindowsHelperSourceClient` already refines pipe-missing status to
  `helperNotInstalled` when service probing confirms it.
- PI should map `helperNotInstalled` to `setupRequired`.

### CUJ 3: Helper Installed But Service Is Not Running

User installed the helper earlier, but the service is stopped.

Expected behavior:

- Key after metric selection: `Helper stopped`.
- PI: `Start ShoMetrics Helper from ShoMetrics Control Panel.`
- ShoMetrics Control Panel: service installed, runtime not running.

Implementation:

- Keep service probing in the helper source client and ShoMetrics Control Panel.
- Map `SourceClientStatus.reason === "helperStopped"` to `helperStopped`.
- Do not show `Setup required`; the install already exists.

### CUJ 4: Helper Running But Driver/Sensor Path Is Unhealthy

Examples:

- PawnIO/MSR path is unavailable for CPU temperature/power.
- LHM reports thermal status invalid.
- GPU driver APIs are present but the selected telemetry path returns no valid
  value.

Expected behavior:

- Key: `Check ShoMetrics` when the selected metric has no fresh value and
  helper warnings/status point to a driver or sensor-path issue.
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
| `driver:` | Driver or privileged sensor access path. | `Check ShoMetrics` key copy plus PI driver guidance. |
| `sensor:` | Hardware sensor family. | `No data` key copy plus PI sensor guidance. |
| `lhm` | LibreHardwareMonitor session/catalog path. | `Check ShoMetrics` or descriptor-load guidance. |
| `service:` | Helper service/runtime path. | setup/transport guidance. |

The string after a known component prefix is source-owned and display/debug only.
Hub may branch on the prefix, not on arbitrary suffixes.

Node must not treat helper self-reported health as the only render truth. It
should use data-path state first, then use warnings/status only to improve PI
guidance and ShoMetrics Control Panel support details.

### CUJ 4A: Helper And Hub Protocol Versions Do Not Match

User has installed ShoMetrics, but the helper and Hub speak incompatible
protocol versions.

Expected behavior:

- Key: `Check ShoMetrics`
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
- If the specific GPU metric is unsupported, resolve to `noSensor` and show
  short `No data` key copy, not helper/check-ShoMetrics guidance.
- PI explains that this metric is not available on this hardware.

Implementation:

- Continue to use metric unavailable reports from the read path.
- Do not infer "NVIDIA tool failed" for non-NVIDIA hardware.
- If GPU source routing tries a NVIDIA-specific path in the future, it must be
  gated by source/hardware identity before surfacing user copy.

### CUJ 6: NVIDIA User Has GPU Widget But NVIDIA Telemetry Path Fails

User has NVIDIA hardware, but the selected telemetry path fails due to driver,
API, or helper issues.

Expected behavior:

- Key: `Check ShoMetrics` for driver/API or transport/helper failures that
  need user attention.
- Key: `No data` with `noSensor` PI detail only when the source is healthy and
  the metric is genuinely not available.

Implementation:

- Keep source health, transport failure, and metric unavailable reason separate.
- Use `SourceClientStatus` for transport/helper status.
- Use `MetricUnavailableReport` for metric-level no-value status.
- Use source warnings/support details for driver/API path hints until a typed
  diagnostic contract is justified by a machine decision.

### CUJ 7: Selected Advanced Sensor Has Not Warmed Its Polling Group Yet

User selects a metric immediately after startup or after adding the widget. The
helper is running, but the requested polling group has not produced its first
snapshot.

Expected behavior:

- Key: `Waiting...`
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

- Map `pendingRefresh` to `sensorPending`.
- Treat it as an expected transient state. Do not log it as an error.
- Deadline inputs must come from source-owned group refresh state, such as last
  refresh attempt, last success, last failure, descriptor generation, and the
  requested poll interval. Do not infer pending duration from widget render
  frequency.

### CUJ 8: Selected Advanced Sensor Truly Does Not Exist

User selected a metric before a hardware/driver change. Later the descriptor
disappears.

Expected behavior:

- Key: `No data`
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

- Key before metric selection: `Choose metric` or `Loading metrics...`,
  depending on whether the user has selected a metric.
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

User sees `Setup required`, `Helper stopped`, or `Check ShoMetrics`, then
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
- Once the sample is stale, the key should show helper/setup copy, not `No data`.
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

Do not implement a full dedicated error SVG as the default unavailable state.

Reasons:

- It breaks the user's selected theme/view in a visually abrupt way.
- It makes transient startup states look like major failures.
- It teaches the user to ignore the selected theme whenever data is missing.

Preferred improvement:

- Add a theme-aware compact unavailable body at the metric frame/body layer.
- Reuse the selected frame, colors, and icon placement where possible.
- Give tight layouts short copy from `User-Facing State Model`.
- Put long guidance in PI and ShoMetrics Control Panel.

Implementation options:

| Option | Recommendation | Notes |
| --- | --- | --- |
| Continue putting `unavailableDisplayValue` into every current primitive | Short-term only | Existing path; known to overflow in some views. |
| Add compact unavailable body in `metric-view-frame.ts` | Preferred | One shared render path for single-metric no-data states. |
| Full dedicated error SVG | Avoid for default states | Can remain a future UX exercise for severe setup flows, but not preferred now. |

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
  -> source status chooses helper setup/transport state
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

The Property Inspector uses these states for picker loading/setup guidance.
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
4. Update `CatalogMetricDescriptorStatusNote` to render setup/helper guidance
   when descriptor loading fails because helper is missing or stopped.
5. Add unsupported-platform fallback copy for already-placed Advanced Sensor
   keys on non-Windows systems.
6. Keep DEBUG details separate from user-facing copy.
7. Cache service-status and health probing in the source client. Action render
   paths must only read cached state.
8. Add `versionMismatch` PI guidance for protocol mismatch. Key copy may stay
   on the shared `Check ShoMetrics` action state.
9. Add descriptor catalog pending/unavailable handling in the PI picker path.
10. Use source-client-owned in-flight request dedupe for service status, health,
    and descriptor refreshes. Do not create a general singleflight framework.

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
| Stale/missing | `helperNotInstalled` | none | `setupRequired` |
| Stale/missing | `helperStopped` | none | `helperStopped` |
| Stale/missing | `pipeMissing` during short startup window | none | `Waiting...` via `helperStarting` |
| Stale/missing | `protocolMismatch` | none | `Check ShoMetrics` with version guidance |
| Stale/missing | `sourceError` / `timeout` | none | `Check ShoMetrics` |
| Missing while descriptor catalog is pending | `available` | none | `Waiting...` via `descriptorCatalogPending` |
| Missing while descriptor catalog failed | `available` | none | `Check ShoMetrics` |
| Missing with `pendingRefresh` | `available` | none | `Waiting...` via `sensorPending` until deadline |
| Missing with `noSensorData` | `available` | none | `No data` |
| Missing with `invalidValue` | `available` | driver/sensor warning | `Check ShoMetrics` in PI when warning applies; otherwise `No data` |
| Missing with unknown reason | `available` | none | generic `No data` |

`protocolMismatch` must resolve before generic helper errors. The generic row is
for source errors that have no more specific remediation.

## Test Matrix

| Area | Required coverage |
| --- | --- |
| C# Core | Known single-group pending, true unknown metric, old global latest ignored for known missing group, first group refresh replaces pending. |
| Proto/runtime mapping | `PENDING_REFRESH`, unknown unavailable enum values, old-helper/new-Hub fallback, protocol mismatch status. |
| Hub state resolver | State priority table, stale value versus source status, `versionMismatch`, warning-assisted PI guidance. |
| Property Inspector | Helper missing/stopped, protocol mismatch, descriptor catalog pending/unavailable, picker disabled/setup guidance. |
| Manifest/platform | Advanced Sensor OS gate and already-placed unsupported-platform fallback. |
| Rendering | Compact unavailable body in tight views, CJK width sanity for short copy, no full dedicated error SVG by default. |
| ShoMetrics Control Panel | Normal-user service status, gRPC health read, sanitized diagnostics copy, no privileged mutation in data-plane service. |
| Recovery | Helper install/start, protocol repair, driver repair, Windows resume/topology change, shared source-client retry/backoff reset. |

## Acceptance Criteria

- Advanced Sensor is not visible on non-Windows action lists.
- Already-placed Advanced Sensor keys on non-Windows show Windows-only copy
  instead of setup/helper copy.
- A never-installed helper produces setup guidance, not generic no-data.
- A stopped helper produces stopped guidance, not install guidance.
- A protocol mismatch produces update guidance, not generic helper error.
- A known metric waiting for first group refresh produces waiting guidance, not
  no-sensor guidance.
- Descriptor catalog pending/failure does not erase selected metrics or become
  no-sensor.
- Pending refresh has a documented deadline and upgrade state.
- A truly unavailable metric produces no-sensor guidance.
- Running widgets recover automatically after helper/service/driver recovery.
- Running widgets switch from stale value to helper/setup copy after the
  freshness window when the helper fails.
- Driver/sensor-path issues guide users through PI and ShoMetrics Control Panel
  without adding a typed health diagnostic contract in this slice.
- Deck unavailable copy stays short and theme-aware.
- PI gives the next action.
- ShoMetrics Control Panel can show detailed state as a normal-user app.
- Multiple helper-backed widgets share source status probing.
- Windows resume or topology change preserves selected metrics and recovers
  after descriptor plus snapshot refresh.
- No new privileged mutation is added to the read/data-plane metric source API.

## Non-Goals

- Do not add a general i18n framework in this batch.
- Do not implement installer/update flows in this batch.
- Do not add a full-screen dedicated error SVG as the default no-data rendering.
- Do not make Stream Deck or the Hub plugin run as administrator.
- Do not make ShoMetrics Control Panel elevated by default.
