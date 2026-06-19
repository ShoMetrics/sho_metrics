# HID Battery Experiment Report

Date: 2026-06-19

This report summarizes local experiments for reading battery telemetry from
ASUS ROG keyboards and Logitech mice through user-space HID from the Hub
process. The goal was to determine whether ShoMetrics can collect peripheral
battery data without the Windows helper, admin privileges, extra executables, or
kernel drivers.

## Scope

Tested path:

- Windows user-space HID access through `node-hid@3.3.0`.
- Native addon loading through the package's `.node` prebuild.
- Read-only vendor-defined HID collections.
- ASUS ROG keyboard battery reports.
- Logitech HID++ battery and Easy-Switch host reports.

Out of scope:

- Firmware update, pairing, RGB, keymap, macro, polling-rate, or profile writes.
- Standard keyboard and mouse input collections.
- HID opcode fuzzing.
- Final production packaging, signing, and release-channel decisions.

## Native Dependency Assessment

`node-hid@3.3.0` was inspected before device probing.

Observed package facts:

- License: `(MIT OR X11)`.
- Runtime dependency path uses `pkg-prebuilds` to load local prebuilt binaries.
- Install script verifies a prebuild and falls back to `node-gyp rebuild`.
- The Windows x64 prebuild hash observed locally:
  `C1781ADCE3FBF61A4D7ADDD8AEA052A6CC162DA6BBC48E476086A9E2B4EA43F8`.
- The Windows prebuild is not Authenticode signed.
- VirusTotal result supplied by the user: 0/70 engines flagged the file.
- `npm install node-hid@3.3.0 --save-exact --ignore-scripts` completed with
  no reported vulnerabilities in the temporary audit directory.

Observed native behavior:

- The Windows native layer uses HID and SetupAPI calls such as `CreateFileW`,
  `ReadFile`, `WriteFile`, `HidD_GetFeature`, `HidD_SetFeature`,
  `HidD_SetOutputReport`, and `DeviceIoControl`.
- No driver install, service install, registry startup persistence, or extra
  executable release path was found during source inspection.
- Sandboxie probing loaded `node-hid` and enumerated devices without suspicious
  file, driver, service, or startup registry writes in the sandbox.

Security posture:

- Suitable for continued experimental use when installed with scripts disabled
  during audit and when the shipped binary hash is pinned or otherwise
  controlled.
- Static VirusTotal and Sandboxie checks are not sufficient to prove production
  runtime safety. Runtime AV/EDR behavior remains a release gate because the
  process will open HID device paths and issue HID reads/writes that can look
  similar to keyboard or mouse monitoring to heuristic engines.
- The production packaging question remains separate: native addon
  distribution, signing, SmartScreen/Gateway behavior, and Defender/Kaspersky/
  Malwarebytes runtime behavior still need a release decision.

ABI posture:

- The observed Windows binary is a Node-API prebuild (`node-napi-v4.node`), not
  a classic V8 ABI binary tied only to `NODE_MODULE_VERSION`.
- Stream Deck 7.1 Node sideloading allows a plugin manifest to request the Node
  runtime version it needs. Production packaging should still pin the supported
  Stream Deck Node version, include the matching native addon, and treat addon
  load failure as source no-data.
- A Stream Deck runtime smoke test must load the packaged addon in the actual
  sideloaded Node runtime before enabling the source.

## Common HID Safety Policy

The experiments only opened vendor-defined HID collections. Standard keyboard
and mouse input collections must remain excluded.

Required implementation policy:

- Open only vendor-defined collections used by the target protocol.
- Do not open paths ending in `\KBD` or standard keyboard collections
  (`usagePage=0x0001`, `usage=0x0006`).
- Do not issue SET, pairing, firmware, RGB, profile, macro, or polling-rate
  commands from the battery source.
- Use short open-write-read-close transactions rather than long-lived handles.
- Poll at low frequency. Default polling intervals:
  - Built-in system battery sources may expose user-visible choices down to
    `60s` because no peripheral HID transaction is needed.
  - Peripheral battery sources, including Bluetooth, USB, wired, dongle, and
    receiver-backed sources, default to `60min` because peripheral battery
    changes slowly and manufacturer software conflicts are the main operational
    risk.
- User-visible peripheral polling choices should be limited to `10min`,
  `20min`, `30min`, and `60min`. Shorter intervals are diagnostic-only.
- Use one in-flight transaction per physical device or receiver.
- Do not burst retry after timeout or malformed responses; publish no-data and
  try again on the next normal polling tick.
- Treat unknown or malformed responses as no data.
- Any parsed battery percentage must be within `0-100` (`0x00-0x64`);
  out-of-range values are no-data.
- Do not follow devices into bootloader or firmware-update PIDs.

Primary risks are stale/no data, wrong parsing on unknown devices, or temporary
manufacturer software conflicts. Hardware damage risk is low for the read-only
GET paths tested here.

## ASUS ROG Keyboard Findings

ASUS keyboards expose battery data through vendor-defined HID collections. They
do not require admin privileges in the tested Windows setup.

### Protocol Families

Omni receiver keyboard path:

```text
VID/PID:      0x0B05 / 0x1ACE
Collection:   MI_02&Col02
Usage page:   0xFF00
Request:      02 12 01 + zero padding to 64 bytes
Response:     02 12 01 ...
Battery:      response[6]
Charging:     response[9], with known values only
No data:      02 FF AA ...
```

Device-PID wired-style keyboard path:

```text
VID:          0x0B05
Collection:   MI_01
Usage page:   0xFF00
Request:      12 01 + zero padding
Response:     12 01 ...
Battery:      response[5]
Charging:     response[8], with known values only
No data:      FF AA 00 00 FF ...
```

`0x12` is best understood as an ASUS GET family marker. The full operation is
the subcommand, for example `12 01` for the tested keyboards. Other ASUS device
families use different subcommands such as ROG mice on `12 07`.

ASUS parsing policy:

- Omni success must match `02 12 01` and the minimum response length before
  reading `response[6]` or `response[9]`.
- Wired-style success must match `12 01` and the minimum response length before
  reading `response[5]` or `response[8]`.
- Known no-data responses are no-data, not errors.
- All other reports, including `12 03`, `12 08`, `12 12`, `12 14`, `12 16`,
  `22 01`, `25 01`, and `7D 20`, must be discarded as unrelated traffic.
- Charging status must use a whitelist. Observed values: `0x00` not charging,
  `0x01` charging. Unknown status values should be preserved for diagnostics
  but not displayed as a boolean.
- Parsed battery percentages outside `0-100` are no-data even when the response
  prefix and length match.

### Verified ASUS Devices

ROG Strix Scope II 96 RX:

- Omni receiver mode: verified.
- Wired mode: verified.
- Example Omni response: `02 12 01 00 00 00 2F 02 01 01 ...`.
- Example wired response: `12 01 00 00 00 2F 02 01 01 ...`.
- Battery: `0x2F = 47%`.
- Charging: true.

ROG Falchion RX Low Profile:

- Omni receiver mode: verified.
- Wired mode: verified.
- Example Omni response: `02 12 01 00 00 00 5C 02 01 00 ...`.
- Example wired response: `12 01 00 00 00 5C 02 01 01 ...`.
- Battery: `0x5C = 92%`.
- Charging: false on dongle sample, true on wired sample.

ROG Azoth Wireless Mechanical Gaming Keyboard:

- Device-PID wireless mode: verified.
- Wired mode: verified.
- Wireless PID observed: `0x1A85`.
- Wired PID observed: `0x1A83`.
- Example wireless response: `12 01 00 00 00 4B 00 01 00 ...`.
- Example wired response: `12 01 00 00 00 4B 00 01 01 ...`.
- Battery: `0x4B = 75%`.
- Charging: false on wireless sample, true on wired sample.

### ASUS Reference Value

OpenRGB is GPL-2.0-or-later and is license-compatible with ShoMetrics GPLv3.
For this report it was used for PID and interface discovery. Copying or
adapting OpenRGB code is allowed only after checking the specific file header,
keeping the derived code in clearly attributed file(s), and preserving required
notices. Keyboard battery parsing does not currently need OpenRGB
implementation logic.

Observed OpenRGB value:

- Confirms ASUS keyboard PIDs such as Azoth `0x1A83` and `0x1A85`.
- Confirms many ASUS keyboard detectors on `interface 1`, `usagePage 0xFF00`.
- Does not implement keyboard battery queries or response parsing.

Trusted ASUS battery facts in this report come from local probes against RX96,
Falchion RX Low Profile, and Azoth hardware.

### ASUS Product Commitment

Safe product wording:

```text
Experimental ASUS ROG keyboard battery support for verified keyboard PIDs.
```

Do not claim all ROG peripherals or unknown ASUS protocol compatibility. Unknown
ASUS devices should be no-data by default. Do not actively probe unknown ASUS
PIDs unless the user explicitly enables a diagnostic mode.

### ASUS Contention And Stress Results

High-frequency stress tests used the RX96 battery query at approximately `20ms`
intervals. This is a diagnostic stress rate, not a production behavior.

Worst observed Armoury Crate contention:

- RX96 Omni query, 60s: `1911` writes, `1900` successes, `5` timeouts, `6`
  unexpected responses.
- Armoury Crate then got stuck on device connection. ASUS logs showed repeated
  `GetConnectionStatus == FALSE` and SDK calls returning false until the
  receiver/device was replugged.
- This proves high-frequency ASUS vendor HID reads can interfere with Armoury
  Crate state. It does not prove production low-frequency reads are unsafe, but
  it is enough to forbid high-frequency production polling and burst retries.

Repeated RX96 Omni stress while Armoury Crate was active:

- Runs observed about `1850/1910` successes with `2-3` timeouts and `57-58`
  unexpected responses.
- Unexpected responses were unrelated ASUS SDK reports on the same vendor queue,
  including `12 03`, `12 08`, `12 12`, `12 14`, `12 16`, `22 01`, `25 01`, and
  `7D 20`. One response contained the keyboard serial text, confirming response
  queue sharing with manufacturer software.

RX96 wired-only stress while Armoury Crate was opened frequently:

- `1906` writes, `1866` successes, `0` timeouts, `40` unexpected responses,
  `0` errors.
- Armoury Crate stayed usable and reported the same `52%` charging state, but
  unrelated SDK reports still appeared in our read queue.

Implementation consequence:

- Prefer the active path instead of polling all visible paths. If wired succeeds,
  do not also poll Omni for the same physical keyboard.
- Strict parsing is mandatory because manufacturer software can interleave unrelated
  responses.
- Armoury Crate contention is the main ASUS operational risk. The input
  collection itself was not observed to fail during low-level keyboard tests.

## Logitech HID++ Findings

Logitech support is cleaner than ASUS because HID++ feature tables describe the
available battery and host-switch capabilities.

Tested receiver families:

- Logi Bolt receiver: `0x046D / 0xC548`.
- Logitech Unifying receiver: `0x046D / 0xC52B`.

Both expose a vendor HID management interface under `MI_02` with `usagePage
0xFF00`. Standard keyboard collections from the receivers must be ignored.

### HID++ Feature Discovery

All tested Logitech reads used HID++ root feature lookup:

```text
Root.getFeature request:
10 <device slot> 00 01 <feature high> <feature low> 00

Feature index response:
11 <device slot> 00 01 <feature index> ...
```

The device slot here is the receiver paired-device slot, not the mouse
Easy-Switch host slot.

### MX Master 4 on Bolt

Observed identity:

```text
Receiver:        Bolt 0x046D/0xC548
Receiver slot:   0x02
Mouse features:  SmartShift Enhanced, ThumbWheel, Adjustable DPI
```

Battery:

```text
Feature:   UNIFIED_BATTERY 0x1004
Index:     0x09
Request:   10 02 09 10 00 00 00
Response:  11 02 09 10 5A 08 00 ...
Battery:   90%
Status:    0x00, discharging
```

Easy-Switch current host:

```text
Feature:            CHANGE_HOST 0x1814
Index:              0x0E
Read request:       10 02 0E 00 00 00 00
Response:           11 02 0E 00 03 00 ...
Host count:         3
Current host index: 0
Easy-Switch slot:   1
```

`HOSTS_INFO 0x1815` is present on this device and can be used later for host
names through read-only functions.

### MX Master 3 on Unifying

Observed identity:

```text
Receiver:        Unifying 0x046D/0xC52B
Receiver slot:   0x01
Mouse features:  SmartShift, ThumbWheel, Adjustable DPI
```

Battery:

```text
Feature:       BATTERY_STATUS 0x1000
Index:         0x08
Request:       10 01 08 00 00 00 00
Response:      11 01 08 00 14 05 00 ...
Battery:       20%
Next level:    5%
Status:        0x00, discharging
```

Easy-Switch current host:

```text
Feature:            CHANGE_HOST 0x1814
Index:              0x0A
Read request:       10 01 0A 00 00 00 00
Response:           11 01 0A 00 03 02 ...
Host count:         3
Current host index: 2
Easy-Switch slot:   3
```

`HOSTS_INFO 0x1815` was not present on the tested MX Master 3 path, so current
host names should not be expected for this device.

### Logitech Battery Parsers

HID++ battery features should be attempted by feature table, not hard-coded by
receiver type alone.

Permissive HID++ cross-check:

- OpenLogi's `openlogi-hidpp` crate is licensed under BSD Zero Clause and
  implements `UnifiedBattery 0x1004`, `BatteryStatus 0x1000`,
  `BatteryVoltage 0x1001`, `ChangeHost 0x1814`, Bolt, Unifying, wired, and
  Bluetooth-direct support.
- Mouser is MIT licensed and independently uses `0x1004` as the preferred
  Logitech battery feature, `0x1000` as fallback, and a low-frequency battery
  poller. Treat it as practical corroboration, not as the primary protocol
  source.

`UNIFIED_BATTERY 0x1004`:

```text
Read function: 0x10
Payload:       charging percentage, approximate level, status, ...
Percent:       charging percentage when the feature capability says percentage
               reporting is supported
```

Known approximate level values, cross-checked against OpenLogi:

```text
0x01 -> critical
0x02 -> low
0x04 -> good
0x08 -> full
```

Do not map approximate levels to invented percentages in v1. If a device does
not report a true percentage, publish a coarse battery state or no-data until a
tested source or local device test confirms a percentage mapping.

`BATTERY_STATUS 0x1000`:

```text
Read function: 0x00
Payload:       level, next level, status
Percent:       level when non-zero
```

Parsed percentages outside `0-100` are no-data. Approximate/coarse battery
levels are not percentages and must not be forced through this range gate.

Known status values, cross-checked against OpenLogi:

```text
0x00 -> discharging
0x01 -> charging
0x02 -> charging slowly
0x03 -> full
0x04 -> error
```

`BATTERY_VOLTAGE 0x1001`:

```text
Read function: 0x00
Payload:       voltage and flags
Percent:       no percentage in v1 unless a tested conversion exists
```

### Logitech Easy-Switch Parser

`CHANGE_HOST 0x1814` has both read and write functions. Only the read function
belongs in the battery source.

Read-only query:

```text
Read function: 0x00
Payload:       host count, current host index, ...
Display slot:  current host index + 1
```

Do not call:

```text
Function 0x10
```

That function switches the active host and can disconnect the device from the
current computer.

`HOSTS_INFO 0x1815` can provide host names when present:

```text
Function 0x00 -> capability flags, host count, current host
Function 0x10 -> host metadata
Function 0x30 -> host-name chunks
Function 0x40 -> write host name; must not be used by ShoMetrics battery reads
```

### Logitech Product Commitment

Safe product wording:

```text
Experimental Logitech HID++ battery support for Bolt and Unifying receivers,
including current Easy-Switch slot when CHANGE_HOST read support is available.
```

The implementation can be credible without more physical devices for the first
version because the behavior is feature-table driven and locally verified on
both Bolt and Unifying. More hardware is still useful for expanding the
compatibility matrix.

Logitech product-line boundary:

- Logitech office/productivity devices and Logitech G devices should use the
  same feature-driven path when they expose HID++ battery features.
- G HUB is not an implementation dependency and should not be treated as a
  separate API path for v1.
- The parser is transport-agnostic after a readable HID++ device is discovered.
  The discovery matrix is narrower than the parser.
- v1 verified discovery covers Bolt and Unifying. Direct Bluetooth, wired HID++,
  and G-series paths should be best-effort when they expose known HID++ vendor
  collections.
- LIGHTSPEED and other receiver families are not verified yet; add them to the
  compatibility matrix only after enumeration and at least one device test.
- v1 should support any discovered Logitech device, including G-series devices,
  that exposes a recognized HID++ battery feature and returns a strict,
  parseable response.
- If a Logitech device does not expose `0x1004`, `0x1000`, or another supported
  battery feature over the transport we can read, return no-data until that
  transport or feature is independently tested.
- Product copy should say "Logitech HID++ battery support" rather than "all
  Logitech mice" or "all Logitech G devices".

### Logitech Contention And Stress Results

High-frequency Logitech stress used one read-only battery query per receiver at
approximately `20ms` intervals.

MX Master 4 on Bolt, with Logi Options+ opened frequently:

- `1831` writes, `1830` successes, `1` timeout, `0` unexpected responses,
  `0` errors.
- Battery stayed `90%`.

Unifying slot 1, with Logi Options+ opened frequently:

- `1831` writes, `1791` successes, `16` timeouts, `24` unexpected responses,
  `0` errors.
- Battery stayed `20%`.
- Unexpected responses included device-name and other HID++ feature responses
  from the same receiver queue.

Same test with Logi Options+ UI closed:

- Bolt: `1886` writes, `1877` successes, `1` timeout, `8` unexpected responses,
  `0` errors.
- Unifying slot 1: `1886` writes, `1866` successes, `9` timeouts, `11`
  unexpected responses, `0` errors.

Repeat test:

- Bolt: `1799` writes, `1798` successes, `0` timeouts, `1` unexpected response,
  `0` errors.
- Unifying slot 1: `1799` writes, `1790` successes, `9` timeouts, `0`
  unexpected responses, `0` errors.

Implementation consequence:

- Logitech is cleaner than ASUS, especially Bolt, but shared receiver queues
  still exist.
- Match `receiver slot + feature index + function id` before parsing battery
  bytes.
- Treat timeout or unrelated HID++ responses as transient no-data for that tick.
- Keep `CHANGE_HOST 0x1814` strictly read-only.

## Input Latency Smoke Tests

The battery source must not measurably degrade keyboard or mouse input. These
tests are not perfect hardware latency tests, but they provide local evidence
for stress and production-risk decisions.

Mouse browser test:

- Tool: `https://mousetester.io/`.
- Manual fast movement without the Logitech stress script: browser-observed
  polling rate was roughly `100-135Hz`.
- Manual fast movement during the `20ms` Logitech stress script: roughly
  `80-100Hz`.
- Browser click latency test showed no clear change, staying around
  `120-150ms`.
- Interpretation: the browser-observed mouse-move sample rate may drop under
  aggressive stress polling, but the test is mediated by browser event handling
  and cannot prove hardware-level polling latency. It supports the low-frequency
  production policy.

Keyboard Raw Input test:

- Tool: local `.node-hid-audit/keyboard-raw-input-logger.ps1`, which listens to
  Windows Raw Input keyboard events and records event deltas.
- RX96 wired battery stress ran at approximately `20ms` intervals while rapid
  manual key input was recorded.
- Trusted baseline and stress runs showed no repeatable degradation in average,
  p95, or p99 event gaps.
- Baseline examples: p95 `54.27-62.10ms`, p99 `74.21-77.16ms`.
- Stress examples: p95 `54.97-66.23ms`, p99 `67.18-86.19ms`.
- The post-stress control had a worse max gap (`169.65ms`) than most stress
  samples, indicating the max value is dominated by manual input rhythm and
  system scheduling.
- Keydown and keyup counts stayed roughly balanced. No repeatable dropped,
  stuck, or delayed-key pattern was observed.

Interpretation:

- The keyboard input side did not show a reproducible regression under the
  aggressive RX96 wired stress test.
- The mouse browser result is a weaker signal that aggressive stress polling can
  affect observed input sampling.
- Production reads must remain low-frequency and non-bursting; the stress rate
  is diagnostic-only.

## Implementation Boundary Recommendations

This work belongs in a Hub runtime source adapter, not in the Windows helper.
The user-facing Stream Deck action should be the System action, with the visible
name `System & Battery`. Do not create a separate Battery action.

System & Battery should own:

- Built-in computer battery telemetry for Windows laptops and MacBooks.
- Computer battery charging or power-source visual state.
- Computer battery time remaining, cycle count, and health when available.
- Adapter wattage and whole-system thermal pressure when available.
- Supported peripheral battery telemetry for ASUS ROG and Logitech devices.

System & Battery must not absorb component-owned metrics. CPU temperature and
power stay in CPU, GPU temperature and power stay in GPU, and disk, RAM, and
network metrics stay in their existing domains.

Reasons:

- The goal is user-space HID access without admin or a helper process.
- `node-hid` is usable from the Stream Deck Node runtime.
- Battery reads are low-frequency and do not need privileged Windows sensors.
- Keeping the path in Hub avoids making the helper look like a keyboard or mouse
  monitor.
- Battery and power readings do not justify a standalone action, but they are a
  natural part of the System action.

Support scope:

- Built-in computer battery should be supported through standard OS/Node
  sources on Windows laptops and MacBooks.
- ASUS ROG keyboard support is constrained to verified keyboard protocol
  families and PID allowlists. The trusted keyboard evidence is local testing
  plus OpenRGB PID/interface discovery.
- ASUS ROG mouse support is feasible but currently theory-backed rather than
  locally verified. G-Helper is GPLv3 and license-compatible with ShoMetrics
  GPLv3. Use it as a protocol and compatibility reference for known model
  families, PIDs, endpoints, and read-only battery report shapes. If code is
  copied or adapted, check the specific file header, keep the derived code in
  clearly attributed file(s), and preserve required notices. The ShoMetrics
  reader still must use `node-hid`, strict parsers, and the no-data behavior
  defined here. Matched model families may publish
  experimental battery percentages before local mouse validation; unsupported
  or unmatched ASUS mouse models remain no-data.
- Logitech support should be feature-driven by HID++ discovery. The trusted
  references are local Bolt/Unifying tests plus OpenLogi and Mouser protocol
  cross-checks. Support any discovered Logitech device that exposes a recognized
  battery feature and passes strict parsing; do not limit product behavior to
  only the locally tested MX Master devices.

License posture:

- ShoMetrics is GPLv3. GPLv3 and GPL-2.0-or-later references can be used in the
  project when their notices and source obligations are preserved.
- Protocol facts, PIDs, endpoints, report ids, offsets, and observed behavior
  can be documented and reimplemented directly.
- Copying code is allowed when it is useful, but it should be narrow,
  intentional, and recorded with file-level source attribution. Do not blend
  derived code into unrelated files without attribution. Do not vendor large
  unrelated subsystems just to obtain a small read-only battery parser.

Recommended source behavior:

- Treat the native HID module as optional. Failure to load should produce source
  no-data, not crash the plugin.
- Enumerate only explicit vendor/product/interface candidates.
- Publish one sample per discovered peripheral identity.
- Keep receiver slot and Easy-Switch slot distinct in diagnostics.
- Cache feature indexes per device path for a plugin session.
- Invalidate cached feature indexes after device path changes or repeated
  protocol failures.
- Open handles only for a single transaction and close them promptly.
- Default peripheral battery polling to `60min`. User-visible peripheral
  battery choices should be `10min`, `20min`, `30min`, and `60min`; anything
  below `10min` is diagnostic-only.
- Built-in system battery polling may expose `60s`, `3min`, `5min`, `10min`,
  `20min`, `30min`, and `60min` choices.
- Use one in-flight transaction per device or receiver and do not retry
  immediately after timeout.

User-facing interval text:

- For vendor HID sources, show a small note when the selected polling interval
  is `10min` or longer:

```text
This device is checked infrequently to avoid conflicts with manufacturer
software.
```

- Mention specific examples only when they are relevant to the discovered
  device family or detected installation. For example, mention Armoury Crate
  for ASUS ROG devices and Logi Options+ for Logitech devices, but do not imply
  that the user has installed software that is not detected.

## Device Identity And Battery Coalescing

The practical target is stable matching across unplug/replug and normal USB
topology changes. This should be achievable for most users with a fallback
identity model. The implementation should not require one perfect device id.
Instead, store several stable identity signals and match by strongest available
evidence.

Most users do not keep multiple identical peripherals attached to the same
machine. When there is exactly one matching candidate, a model-level fallback is
acceptable. When there are multiple same-model candidates and no per-unit id,
the UI should show them separately or ask the user to choose instead of silently
merging them.

Identity data to collect:

- Vendor and product ids.
- Manufacturer, product name, and serial number from HID enumeration when
  present.
- Interface number, usage page, usage id, and collection role.
- Transport role such as Bluetooth, wired USB, receiver, Omni, Bolt, Unifying,
  or LIGHTSPEED.
- Vendor-specific stable ids from known read-only features.
- Receiver-local slot numbers and Easy-Switch slot numbers for diagnostics and
  route selection, not as primary identity.

Settings should store a peripheral binding identity made from these stable
signals. Runtime HID paths may be kept as diagnostics or session cache entries,
but they must not be the only persisted identity because they can change after
replugging or changing USB ports.

Recommended matching order:

1. Exact per-unit id match, such as HID serial number or a known vendor unit id.
2. Exact known model identity plus unique current candidate.
3. Verified vendor-family rule that links mutually exclusive paths for the same
   physical device, such as a known ROG wired PID and Omni PID pair.
4. Last selected model plus route evidence when it resolves to exactly one
   current candidate.
5. Otherwise keep candidates separate and mark the binding ambiguous.

Logitech identity policy:

- Prefer HID++ `DeviceInformation 0x0003` serial or unit id when available.
- Keep HID++ model information for display, matching, and asset lookup.
- Receiver slot is only a route to a paired device; it is not a cross-transport
  identity.
- Easy-Switch slot is a user-visible state, not device identity.
- If no per-unit id is available, match by model only when there is a single
  current candidate for that model.
- Coalescing should work across Logitech paths when the same per-unit id is
  observed through receiver, wired, or Bluetooth paths. If only model identity
  is available, coalesce only when there is a single candidate for that model.
- Receiver-backed battery and Bluetooth OS battery can represent the same
  physical device. Prefer Bluetooth OS telemetry for display when it is fresh,
  because it avoids vendor HID contention, but keep the receiver route for
  Easy-Switch slot diagnostics when available.

ASUS identity policy:

- Prefer enumeration serial number when present and unique.
- Use G-Helper mouse model/PID/endpoint knowledge and local keyboard tests as
  compatibility rules. They are not proof of per-unit identity or local mouse
  validation.
- Use OpenRGB PID/interface discovery evidence for keyboards. OpenRGB code may
  also be adapted when useful because it is GPL-compatible, but current keyboard
  battery parsing does not need it.
- For known keyboards, allow verified wired-vs-Omni coalescing rules by model
  family. Do not extend that rule to unknown ASUS devices.
- ASUS serial text observed from interleaved Armoury Crate traffic is not a
  reliable identity source.
- ROG mouse coalescing can use G-Helper-derived model/PID/endpoint families as
  a route compatibility map for theory-backed model families. It should still
  prefer HID enumeration serials when available and fall back to unique model
  matching when only one candidate exists.
- ROG keyboard coalescing can use verified wired/Omni PID pairs for the tested
  keyboard families. If a new ROG keyboard reports the same protocol but lacks
  a known family rule, show it as a separate candidate until tested.

Coalescing policy:

- Coalesce only when the fallback identity resolves to one physical device.
- Prefer Bluetooth OS battery telemetry when available because it avoids vendor
  HID contention.
- Prefer the active transport path over inactive duplicate paths.
- Keep source-path diagnostics even when displayed battery is coalesced.
- If two coalesced paths repeatedly report large conflicting values, split them
  back into separate displayed devices for that session.

## Implementation Risk Decisions

AV/EDR runtime behavior is a release gate. Static package inspection, a
VirusTotal result, and Sandboxie probing are useful but do not prove that
Microsoft Defender, Kaspersky, or Malwarebytes will allow a packaged plugin that
performs HID reads. Default-on release requires signed and unsigned packaged
runtime tests while real HID reads are running.

Native addon packaging must be hardened:

- Pin `node-hid` and commit the lockfile.
- Disable install scripts during package assembly.
- Allow only target-arch `.node` binaries into the package.
- Verify SHA-256 before packaging.
- Use one native-addon resolver contract instead of scattering path logic.
- Run a packaged Stream Deck smoke test under the selected sideloaded Node
  runtime.

Manufacturer software conflicts are real and must shape production behavior:

- ASUS high-frequency reads can interfere with Armoury Crate. Production ASUS
  reads must be low-frequency, single-flight, strict-parser, and no-burst.
- Logitech receiver queues can interleave unrelated HID++ responses, especially
  on Unifying. Production Logitech parsing must match receiver slot, feature
  index, and function id before reading payload bytes.

Parser policy:

- ASUS support is allowlist-based because the tested protocol uses fixed vendor
  commands and fixed offsets.
- Logitech support is feature-driven because HID++ feature tables self-describe
  battery and host-switch features.
- Parsed battery percentages must be in the inclusive `0-100` range. Values
  outside that range publish no-data for the tick.
- Unknown status bytes must be preserved for diagnostics but not converted into
  user-facing booleans.
- Unknown or malformed reports publish no-data for that tick rather than
  falling back to guessed offsets.

## Decisions And Remaining Gates

Resolved decisions:

- Action: use the System action with visible name `System & Battery`. Battery
  does not get a standalone action.
- Built-in computer battery: support Windows laptops and MacBooks through
  standard OS/Node telemetry.
- Peripheral vendors: implement supported ASUS ROG and Logitech peripherals as
  System & Battery readings, not as separate actions.
- Logitech host names: out of scope for v1. Show Easy-Switch slot number only.
  Do not read or write host names in v1.
- Logitech implementation scope: do not hard-code only MX Master. Use HID++
  feature discovery and strict parsers for any discovered device with supported
  battery features.
- ASUS implementation scope: do not broadly probe unknown ASUS devices. Use
  allowlisted, read-only model families. For keyboards, rely on local tests plus
  OpenRGB PID/interface discovery. For ROG mice, use G-Helper as the protocol
  and compatibility reference, and copy or adapt GPL-compatible code only when
  it is useful, narrow, isolated in attributed file(s), and properly attributed.
  The runtime reader must still follow the ShoMetrics `node-hid`,
  strict-parser, and no-data policy. Mark the result as theory-backed until
  local mouse hardware is verified.
- Peripheral identity: use fallback matching rather than requiring one perfect
  id. Persist a stable identity bundle with multiple signals, prefer per-unit
  ids when present, allow model-level matching when it resolves to exactly one
  current candidate, and treat duplicate same-model devices without per-unit ids
  as ambiguous.

Remaining gates:

- Packaged native-addon hardening: pin `node-hid`, commit the lockfile, disable
  install scripts during package assembly, allow only target-arch `.node`
  binaries, verify SHA-256 before packaging, and run a packaged Stream Deck
  smoke test.
- AV/EDR runtime validation: test signed and unsigned packaged builds under
  Microsoft Defender, Kaspersky, and Malwarebytes while performing real HID
  reads.
- macOS vendor HID permission validation: verify that opening ASUS/Logitech
  vendor-defined `0xFF00` collections from the packaged plugin does not require
  Input Monitoring/TCC permission. If it does, macOS vendor HID must stay off by
  default until there is an explicit UX decision.
- Manifest/runtime target: choose the Stream Deck Node runtime version explicitly
  and keep native-addon resolution behind one narrow resolver contract.
- UX fixtures: design and test mocked states for verified device, unverified
  device, unsupported device, offline/stale device, high-latency polling notice,
  and coalescing conflict. Physical hardware is needed for data validity, not
  for every UI state.
- Descriptor/settings contract: add a peripheral identity bundle to the runtime
  descriptor and stored selection model. The bundle should include multiple
  match signals and support the fallback order defined above.
