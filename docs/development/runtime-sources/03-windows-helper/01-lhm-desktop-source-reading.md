# LibreHardwareMonitor Desktop Source Reading

This document records a source-reading pass over LibreHardwareMonitor as a
desktop application, not just as a DLL. The goal is to learn what the desktop
EXE does beyond "call the library and display numbers", and decide what
ShoMetrics should adopt, reject, or test.

## Target

| Field | Value |
| --- | --- |
| Reference project | `LibreHardwareMonitor/LibreHardwareMonitor` |
| Target revision | `v0.9.6-56-gabfc4f5` |
| Commit | `abfc4f5705419d62cd6000f45a92563415c165fc` |
| Commit date | 2026-05-15 |
| Commit message | `Update README to remove WinGet installation section` |
| Commit count at target | 1497 |

Credit and license note:

- LibreHardwareMonitor is valuable prior art for ShoMetrics' Windows helper.
- The referenced project is licensed under MPL-2.0 at the target source tree.
- This document records observations and design decisions; it does not copy
  LibreHardwareMonitor source code.

This reading is against the repository HEAD above, not the `v0.9.6` tag.
Historical commits are used only to explain why the current code looks the way
it does. Every production conclusion must still be checked against current HEAD.

## Scope

Included:

- Windows Forms EXE lifecycle.
- Core hardware traversal, sensor values, history, settings, and null behavior.
- UI display surfaces: tree, tray, gadget, plot.
- HTTP JSON and Prometheus export.
- CPU, GPU, storage, and network hardware update paths.

Excluded:

- Minified JavaScript, image resources, installer files, and cosmetic layout.
- LiteMonitor as a primary source. LiteMonitor may be used only as a cross-check.

## Method

For each block, read current HEAD code first, then compare relevant historical
commits when a behavior looks intentional or surprising.

The source-reading sections are organized by runtime code path. Search was used
only to locate entry points and to screen commit messages; it is not the
evidence by itself.

Each block records:

- files read;
- code paths read;
- non-obvious behavior;
- evidence;
- why the behavior likely exists;
- ShoMetrics impact;
- confidence;
- experiment needed.

Status: source-reading pass complete for the requested scope. This pass covers
lifecycle, value/history, settings, CPU/GPU, storage/network, HTTP/export,
motherboard/LPC/SuperIO/EC, controller, memory, battery, and PSU source paths.
It also includes a narrow LiteMonitor cross-check as prior art, kept separate
from the LHM conclusions. Remaining work is implementation validation:
hardware diagnostics on the specific machines ShoMetrics will support first.

## Historical Commit Screening

The full commit history is not treated as ground truth by itself. It is a map of
intent. Current HEAD code remains the authority.

Screening pass:

- Started from all 1497 commits reachable at `v0.9.6-56-gabfc4f5`.
- Searched commit messages for behavior terms around sensor values, history,
  null/NaN/invalid values, update loops, background work, retry, delay, timeout,
  CPU/GPU/storage/network, controller, SuperIO, embedded controller, and export.
- Ignored dependency bumps, project-file churn, README-only changes, cosmetic
  UI layout changes, and board-name additions unless the diff changed runtime
  behavior.
- For every row below, inspected the historical diff and then checked current
  HEAD code before recording a ShoMetrics interpretation.

High-signal commits found during message screening:

| Commit | Message | Current-head relevance | Status |
| --- | --- | --- | --- |
| `fc74039` | `Fluid UI by updating sensors in a background thread. (#626)` | Explains why the EXE separates UI redraw from hardware update. Current `MainForm` still uses a `BackgroundWorker` for `_computer.Accept(_updateVisitor)`. | Adopt the lesson, not the exact WinForms mechanism. |
| `5a075e6` | `Add ability to set sensor values time window (#81)` | Sensor history retention is a first-class LHM concept. Current `Sensor.ValuesTimeWindow` defaults to one day and can be set to zero. | ShoMetrics should usually disable LHM history and keep history in `MetricStore`. |
| `77f3de2` | `Sensor Statistic NaN Fix (#1549)` | Current `Sensor.Value` ignores NaN/Infinity for min/max. | Adopt validation before statistics/history. |
| `330e93e` | `Added support for saving/restoring sensor history last 24h` | Current `Sensor` restores values from settings and appends a NaN gap marker. | Reject for ShoMetrics helper; the hub owns history. |
| `06ed474` | `Individual Sensor Requests (#1504)` | Current HTTP path supports individual sensor get/reset/set. | Reject writable/control semantics for ShoMetrics helper v1. |
| `07791a4` | `Added query parameters to the /metrics endpoint (#2151)` | Current Prometheus path has `archivelength`, `timestamps`, and `lastvalue`. | Learn export semantics only; do not copy into helper IPC. |
| `e624437` | `Fix ADL PMLog sensor, ignore invalid values (#1329)` | Current AMD GPU PMLog loop stops at an invalid sentinel. | Hardware-specific invalid-value handling matters. |
| `0f1c0e3` | Sensor gadget null-value crash fix. | Current gadget checks `sensor.Value.HasValue` before formatting/progress drawing and formats null as `"-"`. | UI must tolerate null current values. |
| `fb67ee3` | Intel package temperature reading-valid bit. | Current `IntelCpu` checks the package thermal-status valid bit before writing package temperature. | CPU temp null can be a valid hardware-read outcome. |
| `9b985d3` | `Removed forced update interval for storage devices (#1698) (#1699)` | Superseded by later storage changes. | Historical clue only. |
| `bdafcd9` | `Implemented storage update interval at the UI side (#1706)` | Current storage devices have a throttle interval, but later code still updates performance sensors when metadata does not change. | Adopt the split between metadata cadence and throughput cadence. |
| `47b46c7` | `Solve the problem of long delays in data updates for mechanical disk read/write speeds. (#2301)` | Current storage update path updates performance sensors even when device metadata does not change. | Likely adopt the principle for disk throughput. |
| `44c1ceb` | NetworkInformationException in interface update. | Current `NetworkGroup.GetNetworkInterfaces` retries enumeration and skips interfaces that disappear during construction. | Network inventory can change while reading it. |
| `1ce2d63` | Per-storage-device `_lastUpdate`. | Current `StorageDevice` has instance-level `_lastUpdate` plus static throttle. | Do not let one disk's throttle suppress another disk's update. |
| `a0392ad` | `StorageDevice.ForceWakeup`. | Current storage device can optionally wake sleeping drives before refresh. | Keep sleeping-drive behavior explicit; do not wake disks accidentally. |
| `2423b1b` | ASUS Z170 EC zero temperature fix. | Current `EmbeddedControllerSource` supports blank sentinel values that become null. | Board-specific sentinel values must be source-owned. |
| `824e400` | Newer Zen temperature-offset calculation. | Current `Amd17Cpu` still checks both `RANGE_SEL` and `TJ_SEL` before applying the 49 C adjustment. | CPU temperature aliases must be source-owned; the hub must not reproduce CPU-family offset rules. |
| `035a878` | NVIDIA GPU load-index reservation. | Current NVIDIA code creates source load sensors in a deliberately managed order and creates GPU Memory load separately from NVAPI utilization loads. | Do not hard-code LHM sensor indexes in the hub; descriptor fingerprints must cover source-owned ordering. |
| `8dc7d17` | NetworkGroup thread safety. | Current network group locks interface rebuilds because OS network-change events can overlap. | Network inventory mutation is source-owned and concurrent with sampling; metadata invalidation must tolerate this. |
| `06b714a` / `cc9b897` | MemoryGroup retry and collection-modified fixes. | Current memory group starts a short retry task for DIMM thermal discovery and uses list replacement when adding DIMMs. | Sensor catalogs can become more complete after startup; helper descriptors should support preload plus later invalidation. |
| `5dfad04` | NVIDIA temporary zero values polluting min/plot history. | Current NVIDIA code still has sensor-specific zero checks, but not a universal zero rule. | Treat zero as invalid only when the source path can justify it. |
| `1a5a11b` | NVIDIA driver restart handling. | Current `NvidiaGroup` re-enumerates GPU handles and forces NVML re-init when the driver comes back. | Hardware graph change should trigger metadata invalidation. |
| `993dadd` | WMI timeouts. | Current storage implementation has changed, but the commit remains a warning about blocking management APIs. | Avoid hot-path WMI and keep source reads timed. |

## 1. Application Lifecycle

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `LibreHardwareMonitor.Windows.Forms/Program.cs`; `LibreHardwareMonitor.Windows.Forms/UI/MainForm.cs`; `LibreHardwareMonitor.Windows.Forms/UI/UpdateVisitor.cs`; `LibreHardwareMonitorLib/Hardware/Computer.cs`; `LibreHardwareMonitorLib/Hardware/IVisitor.cs`; `LibreHardwareMonitorLib/Hardware/SensorVisitor.cs` |
| Code paths read | `Program.Main`; `MainForm` constructor; `_computer.Open`; `timer.Enabled`; `Timer_Tick`; `BackgroundUpdater_DoWork`; `_computer.Accept(_updateVisitor)`; `Computer.Open`; `Computer.Close`; `Computer.Reset`; `Computer.Traverse`; `UpdateVisitor.VisitHardware` |
| Non-obvious behavior | The UI timer does not directly update hardware. It redraws UI surfaces, then starts a background update only if the previous update is not still running. |
| Evidence | `MainForm.cs:186` opens the computer; `MainForm.cs:219-220` wires `backgroundUpdater` and enables the timer; `MainForm.cs:573-575` runs `_computer.Accept(_updateVisitor)` in the background worker; `MainForm.cs:943-950` redraws then starts the background worker if it is not busy. |
| Why it exists | Inference: slow hardware updates must not block WinForms redraw. The EXE favors stale-but-responsive display over UI stalls. |
| ShoMetrics impact | The helper should keep hardware traversal off the Node event loop and should not make UI/render freshness wait for a complete traversal. This agrees with the existing ShoMetrics runner/store boundary. |
| Confidence | High for lifecycle shape. |
| Experiment needed | Measure whether ShoMetrics helper traversal still creates per-hardware delivery stalls after group caching. |

### First-Frame Timeline

Current EXE startup shape:

1. `Program.Main` validates required files, enables WinForms visuals, creates
   `MainForm`, hooks `FormClosed`, and enters `Application.Run`.
2. `MainForm` constructs the `Computer`, loads settings and UI objects, then
   calls `_computer.Open()`.
3. `Computer.Open()` creates SMBIOS state, calls `OpCode.Open()`, adds enabled
   hardware groups, then marks itself open.
4. `MainForm` wires `backgroundUpdater.DoWork` and enables the UI timer.
5. On each timer tick, the UI is invalidated/redrawn immediately.
6. If no previous background update is running, `RunWorkerAsync()` starts a new
   traversal.
7. `BackgroundUpdater_DoWork` calls `_computer.Accept(_updateVisitor)`.
8. `UpdateVisitor.VisitComputer` calls `computer.Traverse(this)`.
9. `UpdateVisitor.VisitHardware` calls `hardware.Update()` then recursively
   visits sub-hardware.

This means LHM does not guarantee that first visible UI already has fresh sensor
values. It tolerates first-frame empty/stale values and refreshes afterward.

### Warmup, Resume, And Cleanup

- Session end and form close both call `_computer.Close()` and save
  configuration (`MainForm.cs:546-554`, `MainForm.cs:1045-1053`).
- Power resume calls `_computer.Reset()` (`MainForm.cs:586-590`).
- `Computer.Reset()` removes and re-adds groups (`Computer.cs:677-683`).
- `Computer.Traverse()` uses a `for` loop under a lock with a comment saying it
  avoids collection-modified exceptions after sleep (`Computer.cs:411-421`).

### What LHM Does Beyond Basic Read/Display

- Runs hardware updates on a background worker.
- Allows the UI to redraw independently from hardware update completion.
- Resets the hardware graph after power resume.
- Traverses hardware through visitors rather than direct UI-owned loops.
- Locks group traversal and avoids `foreach` because hardware collections can
  change after sleep.

### What ShoMetrics Should Learn

- Treat hardware traversal as a slow, failure-prone producer, not as the display
  loop.
- Keep source health and render fallback in the hub/runtime layer.
- Recreate or invalidate helper hardware state after suspend/resume.
- Avoid assuming the hardware collection is stable across updates.

### What ShoMetrics Should Not Copy

- Do not copy WinForms `BackgroundWorker`; ShoMetrics already has runner/source
  boundaries.
- Do not put UI redraw logic inside the helper.
- Do not make `Computer.Traverse` itself the public source contract.

### Open Questions

- Does the ShoMetrics helper currently reset the LHM `Computer` after Windows
  resume?
- Does helper group caching reduce user-visible stalls enough, or do some
  hardware groups still need independent cadence?

## 2. Hardware Graph And Update Pass

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `LibreHardwareMonitorLib/Hardware/Computer.cs`; `Hardware.cs`; `IVisitor.cs`; `LibreHardwareMonitor.Windows.Forms/UI/UpdateVisitor.cs`; `MainForm.cs` |
| Code paths read | `Computer.AddGroups`; `Computer.Traverse`; `Hardware.Accept`; `Hardware.ActivateSensor`; `Hardware.DeactivateSensor`; `UpdateVisitor.VisitComputer`; `UpdateVisitor.VisitHardware`; hardware add/remove UI paths |
| Non-obvious behavior | One update pass is a serial hardware traversal. `hardware.Update()` runs before sub-hardware traversal. A slow hardware update blocks later hardware in the same pass, but not the UI redraw timer. |
| Evidence | `Computer.cs:525-574` adds groups in fixed order; `Computer.cs:411-423` traverses groups and hardware under a lock using indexed loops; `UpdateVisitor.cs:18-23` calls `hardware.Update()` then visits each sub-hardware; `Hardware.cs:110-121` raises sensor added/removed events when active sensor membership changes; `MainForm.cs:943-950` redraws UI and starts a background update only when the previous one is not busy. |
| Why it exists | Inference: LHM has one mutable hardware graph shared by UI/export surfaces. The background worker protects UI responsiveness, while the graph traversal preserves a deterministic update order and handles runtime sensor/hardware changes. |
| ShoMetrics impact | The helper must treat a traversal pass as a source-owned data-plane operation. Group caching can improve publication timing, but one slow `hardware.Update()` can still delay later hardware unless scheduling is split by hardware owner. |
| Confidence | High. |
| Experiment needed | Measure per-hardware update timing inside ShoMetrics helper on target machines to decide whether any hardware needs independent cadence. |

### Group Order

`Computer.AddGroups` adds hardware groups in this order when enabled:

1. Motherboard
2. CPU
3. Memory
4. AMD GPU
5. NVIDIA GPU
6. Intel GPU, only when CPU is enabled
7. Power monitor
8. Controllers
9. Storage
10. Network
11. PSU
12. Battery

This order matters because the update visitor is serial. A slow motherboard,
controller, or GPU update can delay groups later in the pass.

### Update Pass Shape

The update pass is:

```text
Computer.Accept(visitor)
  -> visitor.VisitComputer(computer)
  -> computer.Traverse(visitor)
  -> for each group
  -> for each hardware
  -> hardware.Accept(visitor)
  -> visitor.VisitHardware(hardware)
  -> hardware.Update()
  -> for each subHardware
  -> subHardware.Accept(visitor)
```

`Computer.Traverse` uses indexed loops under a lock to avoid collection
modified exceptions after sleep. That is direct evidence that LHM expects the
hardware graph to mutate while the application is running.

### Sensor And Hardware Mutation

`Hardware.ActivateSensor` and `DeactivateSensor` mutate the active sensor set
and fire events. `HardwareNode` listens for those events and updates the UI tree
without requiring the user to restart the app. `MainForm` also handles hardware
added/removed events and rebuilds the tree.

This is important for ShoMetrics: descriptor/capability invalidation is not an
optional nicety. It mirrors the fact that LHM hardware and sensor membership can
change at runtime.

### What LHM Does Beyond Basic Read/Display

- Keeps a mutable hardware graph with hardware and sensor events.
- Traverses groups and hardware serially in deterministic order.
- Calls parent hardware update before sub-hardware update.
- Lets active sensors appear or disappear during runtime.
- Redraws UI even when the previous update pass is still running.

### What ShoMetrics Should Learn

- Planning metadata must be invalidated when source-owned descriptors change.
- Sample freshness must remain separate from descriptor existence.
- One slow hardware update can affect other values in the same traversal pass.
- Runtime sensor membership changes are normal, not exceptional.

### What ShoMetrics Should Not Copy

- Do not make one central hub owner traverse source-native hardware objects.
- Do not expose LHM hardware graph objects through IPC.
- Do not assume stable catalog membership for the whole helper process lifetime.

### Open Questions

- Should ShoMetrics helper split LHM traversal by hardware class, or is current
  group caching enough after production measurements?
- Should helper descriptors include a source-owned "temporarily inactive"
  state for sensors that are known but deactivated this pass?

## 3. Sensor Current Value, History, And Null Semantics

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `LibreHardwareMonitorLib/Hardware/Sensor.cs`; `LibreHardwareMonitor.Windows.Forms/UI/SensorNode.cs`; `LibreHardwareMonitor.Windows.Forms/UI/SensorNotifyIcon.cs`; `LibreHardwareMonitor.Windows.Forms/UI/SensorGadget.cs`; `LibreHardwareMonitor.Windows.Forms/UI/PlotPanel.cs`; `LibreHardwareMonitor.Windows.Forms/Utilities/HttpServer.cs` |
| Code paths read | `Sensor.Value`; `Sensor.ValuesTimeWindow`; `GetSensorValuesFromSettings`; `AppendValue`; `SensorNode.ValueToString`; tray icon formatting; gadget formatting; plot data source; HTTP JSON sensor output; Prometheus output |
| Non-obvious behavior | `Sensor.Value` is not just a field. Setting it updates current value, min/max, and optionally history. History stores one averaged point per four valid samples and compresses repeated values. |
| Evidence | `Sensor.cs:107-134` implements `Value`; `Sensor.cs:118-126` accumulates four valid samples before `AppendValue`; `Sensor.cs:134` excludes null, NaN, and infinity from min/max; `Sensor.cs:151-158` clears history when `ValuesTimeWindow` is zero; `Sensor.cs:266-270` compresses duplicate values. |
| Why it exists | Inference: LHM is a desktop monitor with plotting and persisted history. It needs bounded history, reduced plot churn, and robust min/max statistics even when hardware reports invalid values. |
| ShoMetrics impact | ShoMetrics should not use transient null as proof the sensor does not exist. It should disable LHM history in the helper because ShoMetrics already owns history in `MetricStore`. It should validate values before stable alias selection and history ingestion. |
| Confidence | High for `Sensor` behavior and display null formatting. Medium for Prometheus semantics until the full HTTP path is read end-to-end. |
| Experiment needed | Confirm whether disabling `ValuesTimeWindow` affects current `Value` stability. It should not, based on code, but hardware-specific interactions should be measured. |

### Current Value vs History

`Sensor.Value` owns several side effects:

- It stores `_currentValue` every time, including `null`.
- If `ValuesTimeWindow` is not zero, it prunes old history points.
- Only non-null values participate in the four-sample average.
- Every fourth non-null value appends an averaged `SensorValue`.
- Min/max update only for non-null finite values.

This is anti-intuitive for ShoMetrics: a sensor can have a valid current value
path while its history intentionally updates more slowly. Conversely, a sensor
can currently be null without deleting old history points.

### Null Display Strategy

LHM generally displays null as a placeholder, not as a hard error:

- The tree value formatter returns `"-"` when the nullable value is absent
  (`SensorNode.cs:186-255`).
- The tray icon string returns `"-"` when `Sensor.Value` has no value
  (`SensorNotifyIcon.cs:157-160`).
- The gadget formats `"-"` when the sensor has no value
  (`SensorGadget.cs:1168-1283`).
- The HTTP JSON output exposes raw nullable values rather than synthesizing a
  replacement (`HttpServer.cs:809-811`).

### Persisted History And Gap Markers

Current `Sensor` restores history from settings and then appends a NaN gap
marker when restored values exist (`Sensor.cs:214-260`). This lets the plot
avoid visually connecting a previous process run to the current run.

ShoMetrics should reject this pattern in the helper. The hub already owns
session history and should decide how to represent gaps.

### What LHM Does Beyond Basic Read/Display

- Maintains per-sensor one-day history by default.
- Allows history to be disabled per sensor constructor or by setting
  `ValuesTimeWindow` to zero.
- Averages one history point per four non-null samples.
- Compresses repeated history values.
- Persists and restores history values.
- Marks restored history gaps with NaN.
- Keeps current null separate from historical samples.
- Formats null as `"-"` in user-facing surfaces.

### What ShoMetrics Should Learn

- Do not erase a known sensor or descriptor because one sample is null.
- Keep stable alias selection separate from per-tick value availability.
- Validate finite values before writing min/max-like state or stable alias
  readings.
- Use source/hub history, not LHM `Sensor.Values`, for Stream Deck widgets.

### What ShoMetrics Should Not Copy

- Do not persist helper-side sensor history.
- Do not average every four samples inside the source helper; the hub's history
  and renderer should own smoothing decisions if any.
- Do not silently turn null into zero.

### Open Questions

- Which specific hardware classes set `Value = null` transiently after a failed
  low-level read?
- Which sensor types use `disableHistory = true` in constructors?
- Does LHM's GUI ever debounce current values outside `Sensor.Value`, or is all
  debounce/history behavior in `Sensor` and plot/export surfaces?

## 4. UI Display Layer

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `LibreHardwareMonitor.Windows.Forms/UI/SensorNode.cs`; `SensorNotifyIcon.cs`; `SensorGadget.cs`; `PlotPanel.cs`; `TreeModel.cs`; `Node.cs`; `HardwareNode.cs`; `SystemTray.cs`; `MainForm.cs` context-menu paths |
| Code paths read | tree value/min/max formatting; tray icon rendering; gadget rendering; plot series generation; hidden/visible filtering; sensor add/remove tree updates; show-in-tray and show-in-gadget selection |
| Non-obvious behavior | The main tree, tray, and gadget display current values directly. Plot is the display surface that reads history. Null current values are shown as `"-"`, not as a source error. |
| Evidence | `SensorNode.cs:181-255` formats `Sensor.Value` and returns `"-"` for null; `SensorNotifyIcon.cs:157-193` returns `"-"` for null tray values; `SensorGadget.cs:1165-1284` formats current value or `"-"` and only draws progress bars when value exists; `PlotPanel.cs:336-345` builds plot series from `sensor.Values`; `TreeModel.cs:58-64` filters hidden nodes unless `ForceVisible` is enabled; `HardwareNode.cs:128-136` inserts sensor nodes sorted by `Sensor.Index`. |
| Why it exists | Inference: the desktop UI needs readable current values, optional plotting, stable ordering, and per-sensor visibility without treating transient hardware nulls as failures. |
| ShoMetrics impact | ShoMetrics widgets should read current/latest samples, not LHM history. A missing current value should map to no-data UI, not helper/source failure by default. Source descriptors and PI debug can explain missing data separately. |
| Confidence | High. |
| Experiment needed | None for display semantics; user-copy wording still needs ShoMetrics-specific UX testing. |

### Current Display vs Plot History

The tree value path is current-value oriented:

- `SensorNode.Value` returns `ValueToString(Sensor.Value)`.
- `SensorNode.Min` and `SensorNode.Max` format `Sensor.Min` and `Sensor.Max`.
- `ValueToString` handles units and returns `"-"` when the value is null.

The tray and gadget are also current-value oriented:

- `SensorNotifyIcon.GetString` returns `"-"` when `Sensor.Value` is null.
- `SensorGadget` formats the current value or `"-"` and draws progress bars
  only for load/control/level/humidity sensors with a current value.

The plot is different:

- `PlotPanel.SetSensors` creates each line series from `sensor.Values`.
- It converts temperature history points to Fahrenheit when the UI setting
  requires it.

Therefore, LHM GUI does not use history to fill current-value holes in the tree
or tray. It preserves history for plots and export surfaces.

### Formatting And Units

Formatting happens near each display surface:

- `SensorNode` assigns a default format per `SensorType`.
- Temperature can display Fahrenheit by converting from Celsius.
- Throughput uses special formatting: connection speed is shown as bps/Kbps/
  Mbps/Gbps, while other throughput is shown as KB/s or MB/s.
- `SensorGadget` duplicates much of this formatting for its own drawing path.
- `SensorNotifyIcon` uses a compact format that omits units.

ShoMetrics should not copy this duplication. It should keep source units
canonical and do display formatting in the action/rendering owner.

### Visibility, Ordering, Tray, And Gadget

LHM has several per-sensor UI choices:

- `SensorNode` persists hidden state under the sensor identifier plus
  `"hidden"`.
- `TreeModel.GetChildren` filters invisible nodes unless `ForceVisible` is on.
- `HardwareNode` groups sensors by `SensorType`, inserts type nodes by enum
  order, and inserts sensors by `Sensor.Index`.
- Context menus can add sensors to the tray or gadget; those choices are also
  persisted per sensor.

These are desktop-app features. ShoMetrics should keep the simple-widget path
first-class and reserve arbitrary per-sensor selection for future advanced
catalog widgets.

### What LHM Does Beyond Basic Read/Display

- Formats values per display surface and sensor type.
- Converts temperature units at display time.
- Shows current null as `"-"` in tree, tray, and gadget.
- Uses `Sensor.Values` history only for plot/export-like surfaces.
- Persists hidden, plot, tray, gadget, and color choices per sensor.
- Maintains stable UI ordering by sensor type and sensor index.

### What ShoMetrics Should Learn

- Keep raw source units separate from display formatting.
- Do not backfill current widget values from LHM history without an explicit
  product decision.
- Keep advanced per-sensor selection separate from simple first-class widgets.
- Stable ordering belongs in descriptors/catalog display, not in metric ids.

### What ShoMetrics Should Not Copy

- Do not duplicate formatting logic in multiple UI surfaces.
- Do not persist source-native sensor UI state inside the helper.
- Do not expose every LHM tray/gadget/plot affordance in first-class widgets.

### Open Questions

- Should future advanced catalog widgets show hidden/default-hidden sensors by
  default, or require an "advanced/show hidden" toggle?
- Should ShoMetrics use `"-"` or a product-specific no-data string for custom
  catalog metrics with a known descriptor but no current value?

## 5. Settings, Visibility, And User Options

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `LibreHardwareMonitor.Windows.Forms/Utilities/PersistentSettings.cs`; `LibreHardwareMonitorLib/Hardware/ISettings.cs`; `Parameter.cs`; `IParameter.cs`; `Sensor.cs`; `LibreHardwareMonitor.Windows.Forms/UI/ParameterForm.cs`; `UserOption.cs`; `UserRadioGroup.cs`; `MainForm.cs`; `TreeModel.cs`; `HardwareNode.cs` |
| Code paths read | XML settings load/save; sensor parameter construction and persistence; parameter editor apply; boolean and radio menu option persistence; hidden sensor visibility; storage/network enable toggles; update interval; storage throttle; sensor values time window; sensor add/remove tree update |
| Non-obvious behavior | The EXE applies user options immediately through callbacks. Adding a `Changed` handler on `UserOption` invokes the handler immediately, so persisted settings become active during construction, not later on first click. |
| Evidence | `UserOption.cs:52-57` immediately invokes `_changed` when a handler is added; `MainForm.cs:277` maps the HDD option to `_computer.IsStorageEnabled`; `MainForm.cs:280` maps NIC to `_computer.IsNetworkEnabled`; `MainForm.cs:445-457` maps storage throttling to `StorageDevice.ThrottleInterval`; `MainForm.cs:481-521` maps the sensor history window to every sensor with `SensorVisitor`. |
| Why it exists | Inference: the desktop app has many view-level knobs and needs persisted UI state to become live without a separate apply step. |
| ShoMetrics impact | Keep helper settings minimal. Persist widget/user choices in Stream Deck settings, not in the helper. If the helper does expose hardware behavior toggles, apply them at the helper owner boundary, not through UI-owned state. |
| Confidence | High for settings and immediate option side effects. |
| Experiment needed | None for ShoMetrics routing. Storage throttle impact still needs hardware measurement if considered. |

### Not Just Display Preferences

Several options affect hardware behavior, not only UI visibility:

- Storage sensor reads can be enabled or disabled from the UI
  (`MainForm.cs:277`).
- Network sensor reads can be enabled or disabled from the UI
  (`MainForm.cs:280`).
- Storage update throttling changes the static
  `StorageDevice.ThrottleInterval` (`MainForm.cs:445-457`).
- Sensor history window changes every current sensor's
  `ValuesTimeWindow` (`MainForm.cs:481-521`).

This is not a pattern ShoMetrics should copy blindly. In ShoMetrics, the helper
should own hardware access policy, and Stream Deck settings should own widget
preferences. A UI control may request a source preference, but it should not
mutate helper-global hardware behavior through an implicit callback chain.

### Sensor Parameters

LHM sensors can have user-editable parameters:

- `Sensor` builds `Parameter` objects from `ParameterDescription` during sensor
  construction (`Sensor.cs:52-59`).
- `Parameter` stores values under the sensor identifier plus
  `parameter/<name>` and removes the setting when reset to default
  (`Parameter.cs:42-57`, `Parameter.cs:68-76`).
- `ParameterForm` edits these rows and writes either `IsDefault = true` or a
  custom `Value` only when OK is clicked (`ParameterForm.cs:119-127`).
- CPU and SuperIO use parameters for temperature offsets and voltage formulas,
  such as Intel `TjMax`/`TSlope` and SuperIO voltage divider values.

This is source-native calibration state. ShoMetrics should not expose or persist
these parameters in first-class widgets. If advanced catalog widgets eventually
need calibration, it must be a helper/source-owned advanced feature with clear
support boundaries.

### What LHM Does Beyond Basic Read/Display

- Persists UI and sensor settings in an XML key-value store.
- Restores options during startup and applies them immediately.
- Lets users change global polling interval from 250 ms to 10 seconds.
- Lets users change history retention from 30 seconds to 24 hours.
- Lets users toggle storage/network groups and storage throttling.
- Persists per-sensor calibration parameters.
- Preserves hidden sensor state and can force hidden sensors visible in the
  tree.

### What ShoMetrics Should Learn

- Some hardware toggles are real source behavior, not cosmetic UI state.
- History retention and update cadence are user-facing concepts in LHM because
  LHM owns its own plot and history. ShoMetrics should keep those concerns in
  the hub unless a source-specific setting is clearly necessary.
- Immediate option application is useful, but the owner must be explicit.

### What ShoMetrics Should Not Copy

- Do not add helper-side persistent settings for widget-level choices.
- Do not make the Property Inspector mutate global helper behavior through
  side-effect callbacks.
- Do not mirror LHM's sensor history retention UI until ShoMetrics has a real
  product need.
- Do not expose LHM sensor parameter editing in simple widgets.

### Open Questions

- Should ShoMetrics expose any helper-wide "wake sleeping storage" or
  "storage throttle" setting later, or keep that out of scope?

## 6. CPU Update Model

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `LibreHardwareMonitorLib/Hardware/Cpu/IntelCpu.cs`; `Amd17Cpu.cs`; `Amd10Cpu.cs`; `Amd0FCpu.cs`; `GenericCpu.cs`; `CpuLoad.cs` |
| Code paths read | Intel package/core temperature; Intel RAPL power; AMD Zen Tctl/Tdie and CCD temperatures; AMD package power; older AMD temperature activation; generic CPU load; Windows CPU load sampling |
| Non-obvious behavior | CPU values are often gated by validity bits or delta state. A missing current value is frequently a deliberate hardware-read result, not a missing sensor descriptor. |
| Evidence | `IntelCpu.cs:587-605` checks the IA32 thermal-status valid bit and sets core temperature and distance-to-TjMax sensors to null when invalid; `IntelCpu.cs:620-630` does the same for package temperature; `IntelCpu.cs:701-708` skips power updates if MSR read fails or delta time is too small; `Amd17Cpu.cs:241-270` needs a previous energy sample before package power can be emitted; `CpuLoad.cs:172-177` returns without updating if the CPU time delta is too small. |
| Why it exists | Inference: low-level CPU telemetry is sampled from counters and MSRs. Some values are invalid for a tick, and some metrics require two samples to compute a rate or power. |
| ShoMetrics impact | Stable CPU temperature/power aliases must treat null/current-missing as "no sample this tick", not as unsupported. Widget copy should distinguish warmup/no sample from helper missing/error. |
| Confidence | High for Intel and AMD Zen paths; medium for older AMD and unusual CPU families. |
| Experiment needed | Run a short helper diagnostic on this machine logging every CPU temperature/power candidate for several minutes to see which sensors flicker and whether ranked fallback stabilizes display. |

### Intel CPU

Intel temperature is guarded by hardware validity:

- Per-core temperature reads `IA32_THERM_STATUS_MSR` and requires bit
  `0x80000000` (`IntelCpu.cs:587-589`).
- Invalid core reads explicitly set the core temperature and distance-to-TjMax
  sensors to null (`IntelCpu.cs:602-605`).
- Package temperature reads `IA32_PACKAGE_THERM_STATUS` with the same valid-bit
  check (`IntelCpu.cs:617-630`).

Intel power is counter-based:

- Power sensors are created for package/cores/graphics/memory/platform only if
  RAPL units and energy MSRs are readable.
- During update, failed MSR reads are skipped rather than converted to a new
  value (`IntelCpu.cs:701-702`).
- Samples with less than 10 ms of delta time are skipped (`IntelCpu.cs:704-708`).

This explains why a stable alias such as `cpu.temp` can intermittently have no
current value even though its descriptor exists.

### AMD CPU

AMD Zen behavior is source-specific:

- Package power needs a previous energy counter and timestamp. The first sample
  initializes state and does not emit power (`Amd17Cpu.cs:240-270`).
- Tctl/Tdie naming depends on offset rules and CPU model strings
  (`Amd17Cpu.cs:273-308`).
- Newer Zen temperature offset handling checks both `RANGE_SEL` and `TJ_SEL`
  bits before applying the 49 C adjustment (`Amd17Cpu.cs:273-293`). This is
  copied from Linux `k10temp` knowledge, not derivable from a generic metric
  key.
- Per-CCD temperature sensors are activated dynamically only when raw values are
  present and plausible (`Amd17Cpu.cs:310-365`).

Older AMD code can deactivate sensors on failure rather than leaving active
sensors with null values. ShoMetrics should avoid deriving one universal
"sensor disappeared" rule from a single CPU family.

### CPU Load

LHM CPU load is not WMI. On Windows, `CpuLoad` calls
`NtQuerySystemInformation(SystemProcessorPerformanceInformation)` and computes
loads from tick deltas (`CpuLoad.cs:52-101`, `CpuLoad.cs:167-210`). It also
rejects too-small sample windows (`CpuLoad.cs:172-177`).

This matches ShoMetrics' current conclusion that aggregate CPU usage should not
come from LHM. Node/native OS counters are the right owner for CPU usage, while
LHM owns deep sensor metrics.

### What LHM Does Beyond Basic Read/Display

- Checks hardware validity bits before accepting Intel temperatures.
- Uses first-sample warmup for counter-derived CPU power.
- Applies AMD temperature offset rules from Linux `k10temp` knowledge.
- Dynamically activates CCD sensors only when plausible values exist.
- Debounces CPU load by requiring enough tick delta.

### What ShoMetrics Should Learn

- Stable CPU aliases need a ranking policy plus per-sample validity handling.
- CPU power should tolerate first-sample warmup.
- CPU temperature should not be marked unsupported because one ranked sensor is
  null for a tick.
- CPU-family offset and naming rules belong in the helper/source alias layer,
  not in Hub routing, PI, or render code.
- CPU usage remains an OS aggregate metric, not an LHM stable alias.

### What ShoMetrics Should Not Copy

- Do not route aggregate CPU usage through LHM.
- Do not expose AMD Tctl/Tdie/CCD distinctions in the simple CPU widget.
  Catalog/custom widgets can expose raw sensor descriptors later.
- Do not hide all CPU sensor nulls by unconditionally reusing last-good values
  without an explicit staleness policy.

### Open Questions

- Should `cpu.temp` fallback within a tick from package/Tctl to core max or
  average when the preferred sensor is null?
- Should `cpu.power` hold the last good value for a short window, or show no
  sample until the next valid counter-derived value?

## 7. GPU Update Model

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `LibreHardwareMonitorLib/Hardware/Gpu/NvidiaGroup.cs`; `NvidiaGpu.cs`; `AmdGpu.cs`; `IntelIntegratedGpu.cs`; `IntelDiscreteGpu.cs` |
| Code paths read | NVIDIA driver/GPU enumeration; NVIDIA thermal, load, memory, power, NVML fallback; AMD ADL/Overdrive/PMLog; Intel GCL telemetry, energy counters, activity counters, D3D memory, fan/bandwidth sensors |
| Non-obvious behavior | GPU paths combine several APIs and treat invalid values differently by vendor and metric. Some failures set current value to null, some skip update and preserve the previous value, and some activate sensors only after a successful read. |
| Evidence | `NvidiaGroup.cs:127-145` re-enumerates GPUs and forces NVML re-init when the driver returns; `NvidiaGpu.cs:556-557` documents that thermal settings can return count zero at high polling intervals; `NvidiaGpu.cs:598-599` sets hotspot/memory junction temperatures to null when thermal sensors are unavailable; `AmdGpu.cs:476-532` resets ADL PMLog sensors to null when unsupported or not found; `AmdGpu.cs:623-640` rejects impossible ODN temperatures; `IntelDiscreteGpu.cs:459-481` sets power to null until a previous energy reading and delta time exist. |
| Why it exists | Inference: GPU telemetry is a patchwork of vendor APIs, Windows D3D counters, NVAPI, NVML, ADL, and Intel GCL. Each API has different invalid-value semantics. |
| ShoMetrics impact | GPU stable aliases should remain helper-first with built-in SMI fallback where available. Helper values need per-sample validity checks and should not turn API quirks into descriptor deletion. |
| Confidence | High for code-path behavior read so far. Medium for exact vendor edge cases without hardware-specific experiments. |
| Experiment needed | Run helper diagnostics on NVIDIA, AMD, and Intel GPU systems separately. This machine cannot prove all vendor paths. |

### NVIDIA

LHM has explicit NVIDIA driver recovery:

- `NvidiaGroup` calls `TryEnumerateGpus` each update pass and removes/creates
  GPU hardware based on the current handle set.
- If the driver was unavailable and comes back, it forces NVML re-init
  (`NvidiaGroup.cs:127-145`).

NVIDIA sensor reads are mixed:

- Thermal settings can return `Count == 0`; the current code comments that this
  can happen at high polling intervals (`NvidiaGpu.cs:553-557`).
- Hotspot and memory junction temperatures become null when the thermal sensor
  mask is unavailable (`NvidiaGpu.cs:596-599`).
- Some sensors only update on success and otherwise keep the previous current
  value, such as memory values after successful NVAPI calls and NVML power.

This means ShoMetrics should not model "NVIDIA sensor failed" as a single
state. It can be a missing descriptor, a null current value, a skipped update,
or a hardware graph change.

### AMD GPU

AMD GPU code has several invalid-value guards:

- ADL PMLog support is checked before reading values.
- PMLog iteration stops at the `ADL_SENSOR_MAXTYPES` sentinel
  (`AmdGpu.cs:502-507`).
- Missing PMLog/OD8 values can reset a sensor to null
  (`AmdGpu.cs:476-532`).
- ODN temperatures reject impossible values, including the comment that some
  cards report `54000` degrees C for unavailable sensors
  (`AmdGpu.cs:621-640`).

This is a strong signal that source-owned stable aliases must validate raw
hardware values before emitting samples.

### Intel GPU

Intel discrete GPU telemetry has many first-sample and unsupported paths:

- `UpdateTelemetry` must succeed before any sensors update
  (`IntelDiscreteGpu.cs:296-318`).
- Power from energy counters needs a previous energy reading and positive delta
  time; otherwise the power sensor is set to null
  (`IntelDiscreteGpu.cs:459-481`).
- Activity and bandwidth counters also set null on unsupported or invalid
  deltas (`IntelDiscreteGpu.cs:484-513`, `IntelDiscreteGpu.cs:570-606`).

Intel integrated GPU telemetry similarly sets temperature/clock/voltage to
null when telemetry cannot be read.

### What LHM Does Beyond Basic Read/Display

- Re-enumerates NVIDIA GPUs and handles driver restart.
- Uses D3D for some GPU memory/load data.
- Uses vendor-specific fallback APIs within a single GPU class.
- Rejects impossible hardware values and sentinel entries.
- Treats first-sample energy/activity counters as not yet displayable.

### What ShoMetrics Should Learn

- Keep GPU source attribution visible because fallback between helper and SMI
  is legitimate.
- Do not collapse all helper GPU failures into one error string.
- Validate impossible values before writing stable aliases.
- Treat hardware add/remove/restart as metadata invalidation, not as sample
  freshness.

### What ShoMetrics Should Not Copy

- Do not copy every vendor sensor into simple widgets. Keep raw paths for future
  catalog/custom widgets.
- Do not route non-NVIDIA GPU through `nvidia-smi`; helper/native GPU paths own
  those sensors.
- Do not use one global last-good cache for all GPU values without source- and
  metric-level staleness.

### Open Questions

- Should ShoMetrics stable GPU aliases include short last-good retention for
  null ticks, and if so should it be per metric domain?
- Should helper metadata invalidation fire on NVIDIA driver restart / GPU
  handle set changes even when stable alias ids do not change?

## 8. Storage And Network Update Model

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `LibreHardwareMonitorLib/Hardware/Storage/StorageDevice.cs`; `LibreHardwareMonitorLib/Hardware/Network/Network.cs`; `NetworkGroup.cs` |
| Code paths read | storage throttle; device wakeup; storage metadata refresh; disk performance sensors; space sensors; network interface enumeration; network change events; throughput from byte deltas |
| Non-obvious behavior | LHM intentionally separates storage metadata from storage performance. Even if device metadata has no changes, it still updates performance sensors to avoid stale throughput. |
| Evidence | `StorageDevice.cs:78-80` returns early under `ThrottleInterval`; `StorageDevice.cs:100-110` updates performance sensors even when metadata has no changes; `StorageDevice.cs:420-431` computes read/write throughput from byte deltas and elapsed `Stopwatch` time; `NetworkGroup.cs:118-139` retries interface enumeration up to five times and filters loopback/tunnel/unknown; `Network.cs:66-73` detects counter reset and resets prior byte baselines. |
| Why it exists | Inference: disk device metadata and performance counters have different freshness needs. Network interfaces can appear/disappear and counters can reset after sleep. |
| ShoMetrics impact | Disk throughput should not be routed through generic full LHM traversal. Windows helper/native disk throughput should have a dedicated provider/cadence. Network aggregate routing must be validated for adapter filtering and duplicate-instance behavior before production use. |
| Confidence | High for LHM code behavior. Medium for ShoMetrics production choice until helper/native implementation is measured. |
| Experiment needed | Validate production helper/native disk throughput against a read/write workload. Re-run network validation only after explicit adapter filtering. |

### Storage

Storage has a throttle but still keeps throughput fresh when enabled:

- The UI can set `StorageDevice.ThrottleInterval` to 30 seconds or zero
  (`MainForm.cs:445-457`).
- `StorageDevice.Update` can return early when inside the throttle window
  (`StorageDevice.cs:76-80`).
- `StorageDevice.ForceWakeup` exists but wakeup is explicitly gated; sleeping
  drives are not woken unless the option is enabled (`StorageDevice.cs:72`,
  `StorageDevice.cs:83-89`).
- If the device has no metadata changes and is already initialized, it still
  calls `UpdatePerformanceSensors()` (`StorageDevice.cs:100-110`).
- Throughput uses `IOCTL_DISK_PERFORMANCE`, byte deltas, and `Stopwatch`
  elapsed time (`StorageDevice.cs:385-435`).

This supports ShoMetrics' current direction: disk throughput needs a
purpose-built Windows source path, not "ask LHM full traversal and hope".

### Network

Network is per-interface, not a validated total aggregate:

- `NetworkGroup` filters loopback, tunnel, and unknown adapters
  (`NetworkGroup.cs:146-157`).
- It responds to network address/availability changes and rebuilds the
  interface hardware list (`NetworkGroup.cs:28-30`, `NetworkGroup.cs:141-143`).
- Interface rebuild is protected by `_updateLock` because OS network-change
  events can overlap and mutate non-thread-safe state (`NetworkGroup.cs:64-70`).
- Interface enumeration is retried up to five times because IPv4 changes can
  throw "The pipe is being closed" (`NetworkGroup.cs:118-139`).
- `Network` computes throughput from interface byte deltas and elapsed time,
  resets baselines if counters reset, and clamps utilization (`Network.cs:56-98`).

This does not contradict ShoMetrics' network decision. Our earlier experiments
showed naive helper/native aggregation can overcount. LHM's per-interface model
is useful for a future catalog/custom path, but a built-in "network total"
needs its own adapter filtering and validation.

### What LHM Does Beyond Basic Read/Display

- Separates disk metadata refresh from disk performance refresh.
- Supports optional wakeup for sleeping storage.
- Throttles storage reads when the user chooses.
- Rebuilds network hardware on OS network change events.
- Retries network interface enumeration after transient OS errors.
- Handles network counter resets after sleep.

### What ShoMetrics Should Learn

- Disk throughput should have its own cadence and should not be blocked by slow
  metadata refresh.
- Sleeping-drive wakeup must remain explicit. A widget read should not wake a
  disk merely because the helper is available.
- Network totals require adapter filtering, not naive summing.
- Counter reset handling is necessary for sleep/resume and interface changes.

### What ShoMetrics Should Not Copy

- Do not expose every network interface behavior in simple widgets.
- Do not route built-in network throughput to LHM until value validity is proven.
- Do not let storage metadata throttling suppress throughput updates.

### Open Questions

- Should ShoMetrics helper use `IOCTL_DISK_PERFORMANCE`, PDH
  `PhysicalDisk(_Total)`, or another native path for v1 disk throughput?
- Should future advanced widgets expose per-interface LHM network descriptors?

## 9. HTTP, JSON, And Prometheus Export

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `LibreHardwareMonitor.Windows.Forms/Utilities/HttpServer.cs` |
| Code paths read | `/Sensor` GET/POST handler; JSON tree generation; Prometheus generation; query parameter handling |
| Non-obvious behavior | The EXE's HTTP surface is not just "current snapshot". JSON exposes formatted and raw current values; Prometheus can export recent LHM history and skip NaN gap markers. |
| Evidence | `HttpServer.cs:287-289` returns current `Value`, `Min`, and `Max` for individual sensor GET; `HttpServer.cs:801-812` includes formatted `Value` and raw nullable `RawValue`; `HttpServer.cs:674-691` iterates `Sensor.Values.Reverse()` and skips NaN; `HttpServer.cs:707-763` implements `archivelength`, `timestamps`, and `lastvalue`. |
| Why it exists | Inference: the desktop app exposes both human-readable JSON and monitoring-system export. Prometheus export reuses LHM history, not a separate telemetry store. |
| ShoMetrics impact | ShoMetrics helper IPC should stay source snapshot/descriptor oriented. Do not import LHM's HTTP export semantics into helper protocol. |
| Confidence | High for current HTTP behavior. |
| Experiment needed | None for current helper design. |

### Individual Sensor Requests

The `/Sensor` path supports getting a sensor's value/min/max/format, resetting
min/max, and setting controllable sensors (`HttpServer.cs:260-293`). This is
interactive desktop-app behavior. It should not leak into ShoMetrics helper
Core, which should remain read-only for current sensor metrics.

### JSON Tree

The JSON export includes both display values and raw values:

- `Value`/`Min`/`Max` are formatted through UI nodes.
- `RawValue`/`RawMin`/`RawMax` expose nullable raw sensor values.

This is useful as prior art: user-facing display and source-native raw values
are separate surfaces. ShoMetrics already has the same conceptual split between
`WidgetData` display formatting and metric snapshots.

### Prometheus

Prometheus export can return:

- last value only;
- archived values up to a capped length;
- timestamps when archived values are requested;
- no NaN history points.

ShoMetrics should not copy this into helper IPC because the hub owns history.
If ShoMetrics later adds external export, it should export from the hub's
`MetricStore`, not from LHM `Sensor.Values`.

### What LHM Does Beyond Basic Read/Display

- Offers individual sensor read/control endpoints.
- Exports formatted and raw JSON tree values.
- Exports history-aware Prometheus output.
- Skips NaN history markers in Prometheus.

### What ShoMetrics Should Learn

- Keep raw telemetry and display formatting separate.
- Treat history/export as a hub/runtime concern unless the source is truly
  external.

### What ShoMetrics Should Not Copy

- Do not add writable sensor controls to the helper.
- Do not use LHM `Sensor.Values` as a source for Stream Deck history.
- Do not add HTTP server semantics to named-pipe helper IPC.

### Open Questions

- If ShoMetrics later exposes an external metrics endpoint, should it use
  current values only or hub history?

## 10. Motherboard, Controllers, Memory, Battery, And PSU

This section reads the source paths that most often contain "extra" behavior
beyond simple value display. It does not attempt to validate every register map
against hardware. The goal is to identify the categories of source-owned quirks
that ShoMetrics must respect.

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `MotherboardGroup.cs`; `Motherboard.cs`; `LpcIO.cs`; `LpcPort.cs`; `Mutexes.cs`; `ISuperIO.cs`; `SuperIOHardware.cs`; `Nct677X.cs`; `IT87XX.cs`; `W836XX.cs`; `F718XX.cs`; `EmbeddedController.cs`; `WindowsEmbeddedControllerIO.cs`; representative controller files including Arctic, Heatmaster, MSI, Razer, and NZXT; `MemoryWindows.cs`; `MemoryGroup.cs`; `DimmMemory.cs`; `SpdThermalSensor.cs`; `Battery.cs`; `BatteryGroup.cs`; `CorsairPsu.cs`; `MsiPsu.cs` |
| Code paths read | Motherboard construction; LPC detection; global bus mutexes; SuperIO sensor creation/update; Nuvoton/ITE/Winbond/Fintek value validation; embedded controller source sorting, bank switching, retry loops, and sentinel handling; controller HID/serial retry loops; Windows memory aggregate update; DIMM SPD thermal retry; battery status update; Corsair/MSI PSU sensor update |
| Non-obvious behavior | This area is where LHM contains the most board/device-specific hardware-driver logic: global mutexes, sleeps, retries, address verification, bank switching, blank sentinel values, active-sensor toggles, per-controller background loops, and composite sensors. |
| Evidence | `LpcIO.cs:13-25` locks the ISA bus before chip detection; `LpcIO.cs:405-471` verifies SuperIO base addresses and disables a Nuvoton I/O-space lock for some chips; `SuperIOHardware.cs:6107-6172` updates sensors only when read delegates return values and contains a board-specific fallback for `Model.X570_MS7C35`; `Nct677X.cs:736-997`, `IT87XX.cs:441-548`, `W836XX.cs:298-402`, and `F718XX.cs:112-207` each implement different null/sentinel/range rules; `EmbeddedController.cs:506-531` sorts register sources for optimized EC access, and `EmbeddedController.cs:564-588` converts blank sentinel values to null; `WindowsEmbeddedControllerIO.cs:75-185` performs bank switching, waits, retries, and an ASUS OBF/IBF workaround; `MemoryGroup.cs:125-142` retries DIMM detection up to five times with 2.5 second delays; `Battery.cs:128-134` activates/deactivates sensors based on whether current values are null; `CorsairPsu.cs:154-162` builds a composite total-output sensor from rail power sensors. |
| Why it exists | Inference: motherboard and controller telemetry is not a uniform API. LHM is partly a database of board/controller quirks plus low-level bus access discipline. |
| ShoMetrics impact | Do not promote raw motherboard/controller sensors to first-class simple widgets without strong alias rules and diagnostics. Treat them as catalog/advanced metrics first. Stable aliases such as CPU temperature or CPU package power must be source-owned and allowed to use ranked fallback when a preferred sensor exists but has no current value. |
| Confidence | High for source-path behavior. Medium for exact vendor-specific register semantics without hardware-specific experiments. |
| Experiment needed | SuperIO and EC timing/value tests on the user's board; DIMM SPD retry behavior; controller behavior only if ShoMetrics decides to expose those devices. |

### Motherboard And LPC Detection

Motherboard hardware is a container for source-native subhardware, not a sensor
owner itself:

- `MotherboardGroup` creates one `Motherboard` (`MotherboardGroup.cs:9-15`).
- `Motherboard` identifies manufacturer/model through SMBIOS and then creates
  `LpcIO` or Unix `LMSensors` (`Motherboard.cs:37-77`).
- `Motherboard` creates `SuperIOHardware` for each detected SuperIO chip and an
  `EmbeddedController` when the board table says one exists
  (`Motherboard.cs:79-91`).
- `Motherboard.Update()` is intentionally empty; `UpdateVisitor` updates the
  subhardware after the parent (`Motherboard.cs:154-166`).

LPC detection is guarded and conservative:

- `LpcIO` waits on the global ISA bus mutex before detection and releases it
  after detection (`LpcIO.cs:13-25`).
- `Mutexes.Open()` creates global named mutexes for ISA, PCI, EC, Razer, and
  USB sensors; abandoned mutexes are treated as acquired
  (`Mutexes.cs:13-111`).
- `LpcIO` probes only known register/value port pairs and closes ports that did
  not identify a supported chip (`LpcIO.cs:37-50`).
- Winbond/Nuvoton/Fintek detection verifies base address stability with a
  second read after `Thread.Sleep(1)` and rejects invalid addresses
  (`LpcIO.cs:405-471`).
- Some Nuvoton chips have an I/O-space lock disabled before use
  (`LpcIO.cs:423-431`; `LpcPort.cs:51-60`).
- ITE detection avoids entering secondary IT8792 config mode when it already
  looks active because that can produce a bogus chip ID (`LpcIO.cs:495-504`).

ShoMetrics implication: motherboard sensor discovery is source-owned hardware
probing. Node should not infer stable metrics by parsing motherboard names or
raw sensor paths.

### SuperIO

SuperIO reads are board-specific:

- `ISuperIO` exposes nullable arrays for voltages, temperatures, fans, and
  controls. It also owns fan-control writes and GPIO (`ISuperIO.cs:9-32`).
- `SuperIOHardware` creates sensors from board-specific configuration selected
  by chip, manufacturer, model, and sometimes revision.
- It reads values through delegates such as `_readVoltage`, `_readTemperature`,
  and `_readFan`.
- If a read has no value, most sensors simply keep no new value; one MSI X570
  model has a special temperature fallback derived from voltage
  (`SuperIOHardware.cs:6131-6152`).
- It activates voltage/temperature/fan sensors only when a value is read this
  update; control sensors are assigned directly (`SuperIOHardware.cs:6111-6172`).

SuperIO chip implementations differ substantially:

- `Nct677X.Update()` returns immediately if the Nuvoton vendor ID was not valid
  or the ISA bus mutex cannot be acquired (`Nct677X.cs:736-742`).
- Nuvoton voltage, temperature, fan, and control values each have separate
  range/sentinel rules. Temperature values outside `-55..125` become null, and
  alternate registers with `<= 0` or `> 125` become null
  (`Nct677X.cs:776-915`).
- Nuvoton fan count rules distinguish "no fan or 0 RPM", too-low counts, max
  count, and 13-bit versus 16-bit register layouts (`Nct677X.cs:917-981`).
- `IT87XX.Update()` explicitly reselects bank zero on every update for affected
  chips because sleep/hibernation invalidates bank select
  (`IT87XX.cs:441-449`).
- ITE reads validate register echo, skip invalid reads, reject non-positive or
  max sentinel temperatures, and treat automatic fan control as unreadable
  (`IT87XX.cs:450-548`; `IT87XX.cs:557-565`).
- `W836XX.Update()` handles VBAT validity, rejects PECI temperature paths for
  display, adjusts fan divisors, and writes updated divisors back
  (`W836XX.cs:298-402`).
- `F718XX.Update()` has chip-specific temperature decoding and sentinel values
  such as `0xbb` and `0xcc` for one temperature mode (`F718XX.cs:112-207`).

ShoMetrics implication: "fallback to another temperature sensor" cannot be a
hub-side string rule. The source must rank and validate candidates after it
has applied chip-specific rules.

### Embedded Controller

Embedded Controller reads are more table-driven:

- Known board families map named sensors to registers, sizes, factors, offsets,
  and blank sentinel values.
- Sources are sorted by register address to optimize EC access
  (`EmbeddedController.cs:506-531`).
- Update reads register data and maps blank sentinel values to null
  (`EmbeddedController.cs:564-588`).
- `WindowsEmbeddedControllerIO` switches EC banks, reads registers in sorted
  order, and restores the previous bank (`WindowsEmbeddedControllerIO.cs:45-65`).
- EC read/write operations have retry loops and 1 ms waits
  (`WindowsEmbeddedControllerIO.cs:75-130`).
- The Windows EC path contains an ASUS workaround: if waiting for output buffer
  full fails, it waits for input buffer clear instead
  (`WindowsEmbeddedControllerIO.cs:132-164`).
- EC access is explicitly described as unsafe because firmware can race with
  userspace EC reads/writes (`WindowsEmbeddedControllerIO.cs:9-16`).

This is exactly the kind of knowledge ShoMetrics should not flatten into
built-in "CPU temperature" or "motherboard temperature" without source-owned
alias rules.

### Controllers

Controller devices use device-specific timing and retry loops:

- Arctic controller code has a background loop with a 500 ms sleep and HID
  locking (`ArcticFanController.cs:75-84`).
- It retries HID reads up to three times with short timeouts and 50 ms delays
  (`ArcticFanController.cs:194-231`).
- MSI cooler reads three HID packets before publishing values; if any packet is
  missing or has the wrong response id, no sensor update happens
  (`MsiCoreLiquidController.cs:38-43`, `MsiCoreLiquidController.cs:222-281`).
- MSI cooler writes fan control with a safety curve that forces 100% above high
  temperature points (`MsiCoreLiquidController.cs:145-170`).
- Razer controller retries busy device responses, tries to reopen after IO
  exceptions, and deactivates sensors on disconnect (`RazerFanController.cs:183-249`).
- NZXT Kraken devices re-send the desired pump/fan target when the device reports
  a different value, because the device can set itself to `0%` after a write
  (`KrakenV3.cs:207-242`).
- Heatmaster discovery opens serial ports, waits for bytes, and handles
  access denied, wrong revision, wrong start flag, and timeout states
  (`HeatmasterGroup.cs:29-115`).
- Heatmaster runtime update consumes already-buffered serial lines; it does not
  block waiting for a fresh line in `Update()` (`Heatmaster.cs:211-233`).

This confirms that controller telemetry is closer to hardware-driver code than
to simple metric collection. ShoMetrics should keep these as future
catalog/advanced metrics unless a specific first-class product use case exists.

### Memory

LHM separates aggregate RAM from DIMM/SPD sensors:

- Windows aggregate memory uses `GlobalMemoryStatusEx`
  (`MemoryWindows.cs:14-24`), matching ShoMetrics' conclusion that RAM used and
  total should stay on direct OS counters.
- DIMM thermal sensors are detected through an SPD/SMBus driver path.
- If DIMM detection fails, `MemoryGroup` starts a retry task with 2.5 second
  delays and up to five attempts (`MemoryGroup.cs:125-142`).
- `DimmMemory` creates a thermal sensor only when the SPD accessor both supports
  `IThermalSensor` and reports `HasThermalSensor` (`DimmMemory.cs:15-36`).
- SPD temperature update can fail without changing the current value
  (`SpdThermalSensor.cs:10-21`).
- DIMM timing/capacity values are static metadata sensors created from SPD data,
  not hot aggregate memory counters (`DimmMemory.cs:48-151`).

ShoMetrics should keep RAM usage/capacity separate from advanced DIMM
temperature/timing sensors.

### Battery

Battery code toggles sensor visibility based on current value:

- `ActivateSensorIfValueNotNull` activates or deactivates each sensor
  (`Battery.cs:128-134`).
- Unknown capacity, voltage, rate, remaining time, or temperature maps to null
  (`Battery.cs:150-240`).
- `BatteryGroup` enumerates `GUID_DEVICE_BATTERY`, opens each device, queries
  battery tag and information, and only creates hardware for system batteries
  (`BatteryGroup.cs:20-115`).
- Charge/discharge rate sign changes the sensor display name between charge,
  discharge, and neutral names (`Battery.cs:175-190`).
- Battery temperature is queried separately and can be missing while other
  battery metrics are available (`Battery.cs:222-238`).

This is another example where descriptor availability and current value
availability are not the same thing.

### PSU

PSU paths can expose composite sensors:

- Corsair PSU opens a HID stream each update and updates every sensor
  (`CorsairPsu.cs:51-55`).
- It creates rail sensors and a `Total Output` composite sensor from rail power
  values (`CorsairPsu.cs:145-162`).
- Corsair PSU sensors are built from optional-command and critical-limit
  metadata read during construction (`CorsairPsu.cs:24-44`).
- MSI PSU reads a full info array once per update and each sensor indexes into
  that array (`MsiPsu.cs:29-31`, `MsiPsu.cs:73-77`).

Composite sensors are useful prior art for future source-owned aliases, but
they should stay in the helper/source owner rather than the hub parsing raw
source-native sensor ids.

### What LHM Does Beyond Basic Read/Display

- Encodes board-specific SuperIO and EC sensor maps.
- Uses bus mutexes, sleeps, retries, and sentinel values for low-level hardware
  access.
- Verifies base addresses and register echo before trusting some chips.
- Keeps chip-specific null/range rules close to the chip implementation.
- Adds dynamic sensors only when hardware proves they exist.
- Retries DIMM thermal sensor detection asynchronously.
- Activates/deactivates some sensors based on current value availability.
- Builds composite sensors inside hardware-specific owners.
- Re-sends or restores control values for devices whose firmware can drift.

### What ShoMetrics Should Learn

- Advanced hardware sensors should be source-owned and descriptor-backed.
- Stable aliases should be created by the helper when the source can defend the
  alias mapping.
- Composite aliases should be computed near the source, not by parsing
  source-native ids in the hub.
- Helper startup may need retry windows for hardware discovery, not just IPC
  connection retry.
- A known descriptor can still have no current value for a tick because the
  source path intentionally skipped an invalid, stale, or missing hardware read.
- If ShoMetrics adds last-good smoothing, it should be a generic display/data
  policy with age limits, not a patch for one stable alias.

### What ShoMetrics Should Not Copy

- Do not add board/controller-specific maps into the Node hub.
- Do not expose low-level controller write/control surfaces through simple
  widgets.
- Do not assume a sensor list is complete immediately after helper startup.
- Do not treat a controller/PSU/battery composite as something the hub should
  reconstruct by parsing raw source-native ids.

### Open Questions

- Should helper descriptor preload report "partial discovery" versus
  "complete catalog" when some hardware classes are still retrying?
- Should catalog UI show dynamically activated/deactivated sensors as currently
  unavailable, or hide them until they emit a valid descriptor?
- Should first-class stable aliases expose their ranked source sensor in DEBUG
  attribution so support can distinguish "alias descriptor exists" from "current
  selected raw sensor has no value"?

## 11. Historical Diff Ledger

Historical commits explain why current code exists. They are not accepted as
evidence unless the same behavior exists at `v0.9.6-56-gabfc4f5`.

| Commit | Current-head check | ShoMetrics interpretation |
| --- | --- | --- |
| `fc74039` background sensor update | Current `MainForm` still redraws UI and starts `backgroundUpdater` only when not busy. | Adopt separation of render loop from hardware update loop. |
| `5a075e6` sensor values time window | Current `MainForm` still exposes sensor values time windows, and `Sensor.ValuesTimeWindow` still clears history when zero. | Disable helper-side history; keep history in hub. |
| `330e93e` persisted history and NaN gaps | Current `Sensor` still restores history and appends NaN gap markers. | Reject helper-side history persistence; useful export/plot lesson only. |
| `77f3de2` NaN min/max fix | Current `Sensor.Value` still avoids min/max updates for null/NaN/infinity. | Adopt finite-value validation before source-owned statistics or stable aliases. |
| `0f1c0e3` gadget null fix | Current gadget has explicit null checks before formatting and progress drawing. | Null current values are a normal UI state. |
| `fb67ee3` Intel package valid bit | Current Intel package temperature checks the hardware valid bit and writes null on invalid. | CPU package temp can flicker by design. |
| `06ed474` individual sensor requests | Current HTTP server still has individual `/Sensor` get/set/reset logic. | Reject control/write behavior for ShoMetrics helper v1. |
| `07791a4` Prometheus query params | Current Prometheus path still supports `archivelength`, `timestamps`, and `lastvalue`. | Export/history semantics belong in hub if ever needed. |
| `e624437` AMD PMLog invalid values | Current `AmdGpu` still stops at `ADL_SENSOR_MAXTYPES`. | Adopt hardware-specific sentinel rejection. |
| `44c1ceb` network inventory exception | Current network group retries interface enumeration and catches disappearing interfaces. | Treat source catalog changes as normal runtime behavior. |
| `8dc7d17` NetworkGroup thread safety | Current network group locks interface rebuilds around OS network-change events. | Network hardware inventory can mutate concurrently with sampling; source clients must serialize metadata publication. |
| `1ce2d63` per-storage-device last update | Current storage throttle state is per device, not global. | Per-device cadence matters if helper exposes per-disk metrics. |
| `a0392ad` force drive wakeup | Current storage code keeps drive wakeup as an explicit option. | Do not wake sleeping drives as an implicit side effect. |
| `2423b1b` EC zero temperature | Current EC source maps configured blank values to null. | Blank/sentinel values are board-specific source knowledge. |
| `824e400` newer Zen offset calculation | Current `Amd17Cpu` applies model/string and register-bit offset rules before publishing AMD Zen temperatures. | Keep CPU temperature aliases in helper/source code; Hub should not reproduce CPU-family tables. |
| `035a878` NVIDIA load-index reservation | Current NVIDIA code creates GPU Memory load as a distinct source-owned load sensor after NVAPI load sensors. | Treat LHM sensor indexes/order as descriptor data, not hub assumptions. |
| `06b714a` / `cc9b897` MemoryGroup retry/list fixes | Current memory group retries DIMM thermal discovery after startup and replaces the hardware list when adding DIMMs. | Catalog completeness can improve after helper startup; descriptor invalidation is necessary. |
| `47b46c7` disk read/write delay fix | Current `StorageDevice` updates performance sensors even when device metadata has no changes. | Adopt the principle: throughput freshness must not wait on metadata refresh. |
| `5dfad04` NVIDIA zero values | Current NVIDIA path avoids blindly writing every failed/zero-like read into every sensor, but some sensors still use zero as a meaningful check. | Treat impossible zeros per sensor type; do not make one generic zero rule. |
| `1a5a11b` NVIDIA driver restart | Current `NvidiaGroup` re-enumerates and forces NVML re-init when the driver returns. | Hardware graph changes should publish metadata invalidation; sample failures remain data-plane. |
| `993dadd` WMI timeouts | Current code has moved/changed since the old storage WMI path, but the lesson remains: OS management APIs can stall. | Keep helper reads timed and source-owned; avoid hot-path WMI for built-in metrics. |

## 12. LiteMonitor Cross-Check

LiteMonitor is not a primary source for this reading. This section only records
where it adds behavior on top of LHM that is relevant to ShoMetrics design.
These observations do not override the LHM source-reading conclusions above.

### Evidence Table

| Field | Finding |
| --- | --- |
| Files read | `src/System/HardwareMonitor.cs`; `src/System/HardwareServices/HardwareValueProvider.cs`; `src/System/HardwareServices/SensorMap.cs`; `src/System/HardwareServices/SensorMatcher.cs`; `src/System/HardwareServices/NetworkManager.cs`; `src/System/HardwareServices/DiskManager.cs`; `src/System/HardwareServices/HardwareRules.cs`; `src/System/HardwareServices/ComponentProcessor.cs` |
| Code paths read | `HardwareMonitor.InitializeAsync`; `UpdateAll`; `UpdateTiming`; `ReloadComputerSafe`; `HardwareValueProvider.PreCacheAllSensors`; `OnUpdateTickStarted`; `GetStartupValue`; `GetValue`; `ReadMoboTemperature`; `SensorMap.EnsureFresh`; `Rebuild`; `SensorMatcher.Match`; `NetworkManager.ProcessUpdate`; `GetCurrentIP`; `GetBestValue`; `ReadNetworkSensor`; `AccumulateTraffic`; `DiskManager.ProcessUpdate`; `DiskManager.GetBestValue`; `SafeRead`; `ComponentProcessor.GetCpuTemp`; `GetCompositeValue` |
| Non-obvious behavior | LiteMonitor is not a simple "call LHM and show values" wrapper. It builds a metric-key facade over LHM sensors, adds manual sensor caches, tick caches, last-valid maps, Windows performance-counter startup fallbacks, source-specific hardware selection, and selective hardware update cadence. |
| Evidence | `HardwareMonitor.cs:36` owns `_lastValidMap`; `HardwareValueProvider.cs:20`, `:27`, and `:30` own last-valid, per-tick, and manual sensor caches; `HardwareValueProvider.cs:220-254` returns startup values from last-valid or performance counters; `HardwareValueProvider.cs:259-278` uses `Monitor.TryEnter` and falls back to last-valid data if the monitor is reloading; `HardwareValueProvider.cs:502-519` writes successful generic sensor reads to last-valid and tick caches; `SensorMap.cs:45-49` rebuilds periodically; `SensorMap.cs:89-93` builds a fresh map; `SensorMap.cs:179-205` handles conflicting metric-key mappings; `NetworkManager.cs:216-317` caches the selected network adapter and falls back to last-valid throughput; `DiskManager.cs:85-200` caches/chooses disk hardware and uses last-valid values; `DiskManager.cs:242-249` centralizes safe sensor read plus last-valid fallback. |
| Why it exists | Inference: the app appears optimized to keep a small fixed metric UI stable while LHM hardware discovery, sensor naming, and reads can be slow, missing, or temporarily inconsistent. The caches protect the UI from reloads and null ticks, while the metric-key facade hides raw LHM sensor names from normal users. |
| ShoMetrics impact | This strengthens the case for bounded last-good experiments and source-owned stable aliases. It does not justify moving LHM raw-name parsing, hardware priority rules, or global last-valid maps into the Node hub. |
| Confidence | Medium. The source evidence is concrete, but LiteMonitor's correctness is not established by tests here and several heuristics look product-specific. |
| Experiment needed | Compare ShoMetrics helper CPU temperature and CPU power with and without bounded last-good retention. The experiment must record source id, raw sensor id, sample age, and whether the shown value is current or retained. |

### What LiteMonitor Does Beyond Basic Read/Display

- Maintains a process-wide last-valid metric map and returns old values when a
  current sensor read is missing.
- Keeps a per-update tick cache so repeated reads of the same logical metric do
  not repeatedly walk sensor objects.
- Pre-caches selected sensors into a manual metric-key map.
- Uses Windows performance counters as startup/fallback sources for some
  aggregate metrics.
- Rebuilds its sensor map periodically and after settings changes.
- Applies metric-key heuristics such as `CPU.Temp`, `CPU.Power`, `GPU.Load`,
  `DISK.Read`, and `NET.Down` on top of raw LHM sensors.
- Uses selective cadence: target network/disk hardware can update more often
  than background hardware, while motherboard/SuperIO-style hardware is held to
  slower scan ticks.
- Avoids blocking UI reads during hardware reload by returning last-known data
  when it cannot acquire the monitor lock quickly.

### What ShoMetrics Should Learn

- Bounded last-good retention is worth testing as a generic display/data-plane
  policy. It should carry sample age and source attribution, not silently become
  "fresh" data.
- Source-owned stable aliases are the right place for raw sensor ranking and
  fallback. Normal widgets should not expose CPU package/Tctl/Tdie/core naming
  details to beginner users.
- Metric-key facades can improve UX, but the facade belongs at a clear boundary.
  In ShoMetrics that boundary is helper/source alias publication plus hub
  routing, not ad hoc Hub parsing of LHM paths.
- Selective hardware cadence may be useful, but it needs ShoMetrics-specific
  measurement before adoption.

### What ShoMetrics Should Not Copy

- Do not copy LiteMonitor's raw-name `SensorMatcher` approach into the Hub.
- Do not use a global last-valid map without metric source, raw sensor identity,
  freshness age, and retention limits.
- Do not copy hard-coded GPU or hardware-priority selection into generic Hub
  routing.
- Do not let widget/UI code own hardware update cadence.
- Do not use broad heuristic fallbacks as proof that LHM itself guarantees a
  stable first-class metric.

### Open Questions

- What bounded retention window hides harmless LHM null ticks without hiding a
  genuinely dead sensor?
- Should retention apply to all source-native catalog sensors, or only to
  stable aliases whose source ranking ShoMetrics owns?
- Should retained values render with a different DEBUG state so support can
  distinguish "fresh sample" from "last good sample"?
- Which LiteMonitor heuristics are real hardware lessons versus UI-specific
  guesses? Treat each as a hypothesis until a ShoMetrics diagnostic proves it.

## Preliminary ShoMetrics Decisions

These are draft decisions from the current source reading. Do not treat hardware
value ranking as final until machine-specific diagnostics are reviewed.

### Adopt Now

- Keep hardware traversal off the render/UI loop.
- Keep descriptor existence separate from per-sample value availability.
- Disable LHM sensor history in the ShoMetrics helper unless an experiment shows
  it changes current-value behavior.
- Validate `null`, NaN, infinity, and hardware-specific sentinels before stable
  alias output.
- Treat suspend/resume as a hardware graph invalidation event.
- Treat one missing current value as "no sample this tick", not as "sensor does
  not exist".
- Keep raw source values and user-facing formatted values as separate surfaces.
- For disk throughput, keep performance-counter freshness separate from device
  metadata refresh.
- For network totals, require adapter filtering and workload validation before
  routing built-in widgets through helper/native aggregate paths.
- Keep stable alias ownership in the helper/source. CPU temperature, CPU power,
  disk throughput, controller composites, and PSU totals should not be
  reconstructed in the Node hub from raw source-native ids.
- Treat source-specific invalid-value handling as source logic. The hub can
  apply generic freshness/fallback policy, but it should not know Nuvoton,
  ITE, EC, battery, or controller sentinel rules.

### Experiment Before Adopting

- Short retention of last good value for source-native catalog sensors. LHM's
  GUI does not show "no sensor data" for every null tick; it shows `"-"` while
  history and descriptors remain. The LiteMonitor cross-check also uses
  last-valid caches to reduce UI flicker. ShoMetrics needs an explicit policy
  with age/source attribution, not a per-alias patch.
- Hardware-specific update cadence for slow groups such as storage or SuperIO.
- Per-sensor current-value debounce or last-good display. Need to prove whether
  the GUI does this outside `Sensor.Value`.
- Ranked fallback inside stable aliases when the preferred sensor exists but is
  null for a tick, such as CPU package temperature falling back to core max or
  average.
- Driver/hardware graph invalidation events for NVIDIA driver restart and GPU
  handle set changes.
- Helper-native disk throughput path and cadence against read/write workloads.

### Reject

- Persisting helper-side history.
- Passing LHM `Sensor.Values` through IPC as widget history.
- Treating one null sample as unsupported.
- Copying WinForms UI timing mechanisms into the helper.
- Copying LHM's HTTP server or controllable sensor write endpoints into helper
  IPC.
- Routing aggregate CPU usage, RAM, or unvalidated network totals through LHM
  only because the helper is online.
- Adding helper-side persisted settings for Stream Deck widget choices.
- Hub-side parsing of LHM raw catalog paths to invent stable aliases.

## Remaining Reading Checklist

- Optionally inspect lower-signal historical diffs if a future bug points at a
  specific hardware class. The high-signal behavior rows above were checked
  against current HEAD before recording a ShoMetrics interpretation.
- Run machine-local diagnostics for CPU stable alias candidates, especially
  null/flicker behavior over several minutes.
- Run SuperIO/EC timing diagnostics on the user's board to decide whether any
  hardware-specific cadence is needed.
- Run GPU diagnostics per vendor class on machines that actually have NVIDIA,
  AMD, and Intel discrete GPUs.
- Run helper disk-throughput diagnostics against read/write workloads before
  enabling Windows disk throughput in first-class widgets.
- Cross-check ShoMetrics helper behavior after source-reading conclusions are
  reflected in helper diagnostics.
