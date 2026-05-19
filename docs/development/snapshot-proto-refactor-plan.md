# Snapshot Proto Refactor Plan

This plan replaces the first-day `snapshot.proto` shape with a clean metric snapshot contract before the source API is treated as stable. Breaking changes are allowed. Do not add compatibility layers for the old fields.

The target is to support nearly all LibreHardwareMonitor values as metric data, not only the first curated UI aliases. Stable aliases remain important for built-in widgets, but dynamic descriptors must make raw LHM sensors discoverable without leaking LHM parsing rules into Node runtime code.

## Decision

Keep `contracts/proto/shometrics/v1/snapshot.proto` as a separate proto file.

Reason:

- `snapshot.proto` owns the source-agnostic metric snapshot payload.
- `source_api.proto` owns request/response operations, warnings, errors, descriptors, and helper health.
- `source_ipc.proto` owns local IPC routing and correlation.
- Future remote gRPC and local IPC should share the metric snapshot payload without inheriting named-pipe envelope fields.

The file must stay narrow. It must not grow source selection, fallback, helper health, runtime source scope, rendering progress, or UI formatting policy. Metric descriptors live in this file because descriptors are part of the metric catalog, not a specific request/response operation.

Do not rename `snapshot.proto` in this refactor. `metric_snapshot.proto` is a possible future rename, but it is outside this plan. Do not merge `snapshot.proto` into `source_api.proto`; keep this dependency direction:

```txt
source_ipc.proto -> source_api.proto -> snapshot.proto
```

## Current Problems

Current `MetricSnapshot`:

```proto
message MetricSnapshot {
  string source_id = 1;
  uint64 timestamp_ms = 2;
  map<string, MetricValue> metrics = 3;
}

message MetricValue {
  oneof data {
    double scalar = 1;
    string text = 2;
  }
  string unit = 3;
  double progress = 4;
}
```

Problems:

- `source_id` is not snapshot data. Node already owns source scope and source client identity. A snapshot may be assembled through fallback from multiple source candidates, so source identity belongs outside the snapshot.
- `timestamp_ms` should be `google.protobuf.Timestamp` for a shared API/data contract.
- `unit` is a free string. The code already produced multiple unit vocabularies such as `"bytes_per_second"` in raw dumps and `"B/s"` in canonical snapshots.
- `progress` is a rendering hint. It caused source/service code to infer UI progress from metric/unit semantics. Progress must be computed in Node from metric values plus widget settings.
- `oneof data` is named too generically. Use `oneof value`.

## LHM Data Shape Observed

Two sources were inspected:

- `LibreHardwareMonitor.Report.txt`, exported by LHM 0.9.6.
- `ShoMetrics.Source.Windows.Helper dump`, run from the current C# helper after allowing diagnostic JSON to preserve `Infinity` values.
- Local LibreHardwareMonitor checkout source, especially `LibreHardwareMonitorLib/Hardware/ISensor.cs` for the complete `SensorType` enum and `LibreHardwareMonitor.Windows.Forms/Utilities/HttpServer.cs` for LHM's own OpenMetrics unit conversions.

Report parse from `LibreHardwareMonitor.Report.txt` found 348 sensor rows:

| Sensor path type | Count |
|---|---:|
| `load` | 78 |
| `temperature` | 73 |
| `voltage` | 41 |
| `data` | 32 |
| `timing` | 28 |
| `clock` | 28 |
| `throughput` | 20 |
| `control` | 9 |
| `fan` | 9 |
| `factor` | 8 |
| `level` | 8 |
| `smalldata` | 8 |
| `power` | 6 |

Current helper dump found 358 sensor rows on the same machine:

| Sensor type | Count | Current raw unit label |
|---|---:|---|
| `Load` | 101 | `percent` |
| `Data` | 80 | `gb` |
| `Throughput` | 78 | `bytes_per_second` |
| `Temperature` | 53 | `celsius` |
| `Clock` | 27 | `raw` |
| `SmallData` | 8 | `raw` |
| `Power` | 6 | `watts` |
| `Fan` | 2 | `raw` |
| `Control` | 2 | `raw` |
| `Voltage` | 1 | `raw` |

Hardware count from the helper dump:

| Hardware type | Count |
|---|---:|
| `Network` | 190 |
| `Cpu` | 105 |
| `GpuNvidia` | 40 |
| `GpuIntel` | 17 |
| `Memory` | 6 |

Observations:

- LHM exposes many dynamic sensors. Per-core CPU load, per-core temperature, NIC counters, SMART data, DIMM timings, and per-device throughput cannot be maintained as hand-written stable aliases only.
- LHM sensor ids are source-owned hierarchical paths, often with URL-encoded device ids. Node must treat them as opaque.
- LHM report includes current/min/max columns, but ShoMetrics must not import LHM's historical min/max. Node owns history in `MetricStore`.
- Some raw diagnostic values can be `Infinity` or otherwise non-finite. Canonical snapshots must omit invalid values and report warnings; diagnostic dumps may preserve source oddities.
- Raw LHM unit labels are not canonical units. Stable aliases must normalize values before they reach `MetricSnapshot`.
- Multiple raw sensors may aggregate into one canonical metric, such as network up/down, disk throughput, and derived RAM total.

LibreHardwareMonitor 0.9.6 defines this full `SensorType` set in `LibreHardwareMonitorLib/Hardware/ISensor.cs`:

| LHM sensor type | LHM source unit | Canonical unit |
|---|---|---|
| `Voltage` | V | `METRIC_UNIT_VOLTS` |
| `Current` | A | `METRIC_UNIT_AMPERES` |
| `Power` | W | `METRIC_UNIT_WATTS` |
| `Clock` | MHz | `METRIC_UNIT_HERTZ` after multiplying by 1,000,000 |
| `Temperature` | C | `METRIC_UNIT_CELSIUS` |
| `Load` | % | `METRIC_UNIT_PERCENT` |
| `Frequency` | Hz | `METRIC_UNIT_HERTZ` |
| `Fan` | RPM | `METRIC_UNIT_REVOLUTIONS_PER_MINUTE` |
| `Flow` | L/h | `METRIC_UNIT_LITERS_PER_HOUR` |
| `Control` | % | `METRIC_UNIT_PERCENT` |
| `Level` | % | `METRIC_UNIT_PERCENT` |
| `Factor` | 1 | `METRIC_UNIT_UNITLESS` |
| `Data` | GiB | `METRIC_UNIT_BYTES` after multiplying by 2^30 |
| `SmallData` | MiB | `METRIC_UNIT_BYTES` after multiplying by 2^20 |
| `Throughput` | B/s | `METRIC_UNIT_BYTES_PER_SECOND` |
| `TimeSpan` | seconds | `METRIC_UNIT_SECONDS` |
| `Timing` | ns | `METRIC_UNIT_SECONDS` after multiplying by 1e-9 |
| `Energy` | mWh | `METRIC_UNIT_WATT_HOURS` after multiplying by 0.001 |
| `Noise` | dBA | `METRIC_UNIT_DECIBELS_A_WEIGHTED` |
| `Conductivity` | uS/cm | `METRIC_UNIT_SIEMENS_PER_CENTIMETER` after multiplying by 1e-6 |
| `Humidity` | % | `METRIC_UNIT_PERCENT` |

This table is the minimum unit coverage required for the Windows LHM helper. If a future LHM version adds a new sensor type, add a unit mapping before exposing that sensor as a scalar value.

The LHM source code has one notable unit inconsistency: `ISensor.cs` documents `Data` as GiB, while LHM's OpenMetrics HTTP exporter converts generic `Data` by decimal gigabytes. ShoMetrics treats the sensor enum comments as the adapter contract and converts LHM `Data` with 2^30 unless a specific sensor family proves otherwise in tests. If a source family needs decimal units, that source adapter must make the conversion before emitting `METRIC_UNIT_BYTES`; do not encode decimal-vs-binary semantics into Node.

## Linux/macOS Deep Sensor Research

This refactor is not Windows-only. The target contract must also fit future Linux and macOS advanced helpers.

Reference anchors:

- Linux `hwmon` sysfs interface: https://android.googlesource.com/kernel/common/+/6b863d1d3239eff0f45c2e6e672f5b56db828db0/Documentation/hwmon/sysfs-interface
- `lm-sensors` / `libsensors`: https://github.com/lm-sensors/lm-sensors
- NVIDIA NVML: https://developer.nvidia.com/management-library-nvml
- AMD SMI: https://rocm.docs.amd.com/projects/amdsmi/en/latest/
- Linux powercap/RAPL: https://www.kernel.org/doc/html/latest/power/powercap/powercap.html
- macOS `powermetrics`: https://keith.github.io/xcode-man-pages/powermetrics.1.html
- macOS SMC/iSMC reference implementation: https://github.com/dkorunic/iSMC

Observed shape:

| Platform/source | Data shape | Units/categories | Contract impact |
|---|---|---|---|
| Linux `hwmon` | sysfs device/channel files such as `temp*_input`, `fan*_input`, `power*_input`, labels, alarms, and faults | millidegree Celsius, RPM, millivolt/milliamp, microwatt, microjoule, booleans | Fits descriptor-backed scalar values. Source adapter must normalize micro/milli units before protobuf. Fault/alarm files become warnings or future status metrics, not `MetricValue` flags in this refactor. |
| Linux `lm-sensors` / `libsensors` | user-space labels and scaling over kernel sysfs sensors | same physical quantities, but board-specific labels/conversions | Confirms `source_sensor_id` must stay opaque and descriptors must carry human labels. Node must not assume stable Linux hwmon indexes. |
| NVIDIA NVML | device API fields for identification, utilization, memory, temperature, fan speed, power, clocks, P-state, processes, ECC | percent, bytes, Celsius, RPM, watts/milliwatts, hertz/MHz, counts, state strings | Fits canonical `MetricUnit` plus source-owned diagnostic strings. Process/ECC/state fields may need future value kinds or count units, but do not require LHM-specific proto fields. |
| AMD SMI / ROCm SMI | GPU/device metrics with table/JSON/CSV CLI and C/C++/Python APIs | utilization %, memory usage, power W, temperature C, clock MHz/Hz, voltage, fan, PCIe, ECC counts | Same unit families as LHM/NVML. Confirms `MetricUnit` must include count/rate-like additions when those metrics are exposed, not source-native enums. |
| Linux powercap/RAPL | zones/subzones with `energy_uj`, power limits, names, constraints | microjoules, microwatts, microseconds | Confirms energy and power units are required and conversion belongs in helper. Constraints are management data and are out of scope for `MetricSnapshot`. |
| macOS `powermetrics` | sampler output, including machine-readable plist format, CPU/GPU/ANE power, frequency, thermal pressure, disk/network deltas, SMC sampler on supported platforms | watts/estimated power, MHz, thermal state/pressure, fan speed, temperatures, activity deltas | Fits snapshots plus descriptors. Some values are estimates or pressure states; descriptors/warnings must carry source caveats. |
| macOS SMC/HID sensor tools | SMC keys or Apple Silicon HID sensor names with decoded type/value/description | temperature, power, current, voltage, fan, battery | Fits source-owned `source_sensor_id` and descriptor labels. SMC keys must not become ShoMetrics enum values. |

Conclusion:

- The future Linux/macOS helper contract is still `MetricSnapshot` + `MetricDescriptor`.
- The proto must model canonical measurement units and opaque source metadata, not LHM, hwmon, NVML, AMD SMI, powermetrics, or SMC native type systems.
- The unit enum should be allowed to grow for new physical units such as counts, errors, PCIe throughput, or pressure states when those metrics are intentionally exposed.
- Future helpers must keep OS/library-specific decoding inside their source adapters and emit the same stable aliases for built-in widgets where the semantics match.

## Dynamic Metric ID Policy

Stable aliases and dynamic sensor ids are different products:

| Kind | Example | Owner | Use |
|---|---|---|---|
| Stable alias | `cpu.usage_percent`, `gpu.temp`, `ram.used`, `net.down` | ShoMetrics canonical catalog | Built-in widgets, cross-source fallback, remote/local parity. |
| Dynamic raw sensor id | `lhm.sensor:/intelcpu/0/temperature/26` | Source adapter | Advanced discovery and future custom sensor picker. |

Rules:

- Stable aliases are hand-maintained and source-agnostic. A Windows, Linux, macOS, or remote helper that can provide the same semantic metric must emit the same stable alias.
- Dynamic metric ids use this format:

```txt
<source_family>.sensor:<source_sensor_id>
```

- `source_family` is a lower-case source adapter family such as `lhm`, `linux.hwmon`, `linux.nvml`, `linux.amd-smi`, `linux.powercap`, `mac.smc`, or `mac.powermetrics`.
- `.sensor:` is a reserved metric-id namespace marker for source-owned raw sensor ids. It leaves room for future source-owned sub-categories, but generic Node code must not branch on those sub-categories for behavior.
- `source_sensor_id` is the source-owned opaque identifier. It may be an LHM path, Linux sysfs path plus channel, NVML field name plus PCI bus id, AMD SMI field path, SMC key, or powermetrics sampler field path.
- Do not include machine/profile identity in the metric id. Source scope already separates local vs remote machines.
- Generic Node runtime, rendering, and Property Inspector code must not parse the dynamic id after the `source_family` prefix. Display names, units, value kind, and source diagnostics come from `MetricDescriptor`.
- A raw sensor may be emitted twice: once as a stable alias and once as a dynamic metric id. This is intentional. Stable aliases serve built-in UI/fallback; dynamic ids serve exact sensor discovery.
- `ListMetricDescriptorsRequest` with empty `metric_ids` returns all available descriptors for discovery. Runtime 1Hz polling must request explicit metric ids and must not pull all dynamic sensors by default.
- Descriptor discovery must expose every current source sensor that has a canonical unit mapping and a finite value shape. A sensor with no `MetricUnit` mapping is skipped and reported as a discovery warning; do not emit `METRIC_UNIT_UNSPECIFIED` for committed scalar mappings.

Example dynamic sensor paths:

| Source | `source_sensor_id` example | Dynamic `metric_id` example | Notes |
|---|---|---|---|
| LHM CPU core temperature | `/intelcpu/0/temperature/26` | `lhm.sensor:/intelcpu/0/temperature/26` | Keep the LHM path verbatim. Do not parse `temperature/26` in Node. |
| LHM GPU power | `/gpu-nvidia/0/power/0` | `lhm.sensor:/gpu-nvidia/0/power/0` | Stable alias `gpu.power` may point to the same raw sensor. |
| LHM network throughput | `/nic/{encoded-device-id}/throughput/8` | `lhm.sensor:/nic/{encoded-device-id}/throughput/8` | Device ids may be encoded or contain source-specific punctuation. Treat as opaque. |
| Linux hwmon temperature | `/sys/class/hwmon/hwmon3/temp1_input` | `linux.hwmon.sensor:/sys/class/hwmon/hwmon3/temp1_input` | The helper may use a more stable source id internally if available, but Node still treats it as opaque. |
| NVIDIA NVML GPU temperature | `pci:0000:01:00.0/temperature.gpu` | `linux.nvml.sensor:pci:0000:01:00.0/temperature.gpu` | PCI id and field name are source-owned metadata, not a Node contract. |
| macOS SMC fan speed | `F0Ac` | `mac.smc.sensor:F0Ac` | SMC keys are source-owned ids, not ShoMetrics metric taxonomy. |
| macOS powermetrics CPU package power | `sampler:cpu_power/package_watts` | `mac.powermetrics.sensor:sampler:cpu_power/package_watts` | Sampler names are diagnostic source metadata. |

Handling rules for paths:

- Preserve `source_sensor_id` exactly as provided by the helper, except for trimming impossible transport artifacts such as trailing NUL characters before descriptor creation.
- Do not URL-decode, split, normalize separators, or infer metric semantics from `source_sensor_id` in Node, rendering, or PI.
- Source adapters may parse their own native path internally to create descriptors and stable aliases.
- Descriptor display must prefer `hardware_name` + `sensor_name`; show `source_sensor_id` only in advanced/debug UI.
- Metric id strings may contain `/`, `:`, `{}`, spaces, or encoded characters after the `.sensor:` separator. Store and compare them as ordinary opaque strings.
- If a source path is longer than expected, do not hash it for the metric id in Phase 1. Keep the raw path so diagnostics are explainable. Revisit hashing only if real path length causes IPC/settings/storage issues.

This does not violate the "do not pack structured data into a string" rule:

- `source_sensor_id` is an external identifier owned by the source adapter, like a resource name or OS device path. ShoMetrics stores and echoes it, but generic runtime code does not parse it into fields.
- The structured data that ShoMetrics needs is modeled explicitly in `MetricDescriptor`: `hardware_id`, `hardware_name`, `hardware_type`, `sensor_name`, `source_sensor_type`, `value_kind`, `unit`, and `metric_id_kind`.
- The only code allowed to parse a source-owned path is the source adapter that minted it.
- If Node or PI needs a field for behavior or display, add a descriptor field instead of parsing `metric_id` or `source_sensor_id`.

LHM descriptor mapping:

| Descriptor field | LHM source |
|---|---|
| `source_sensor_id` | `sensor.Identifier.ToString()` |
| `hardware_id` | `hardware.Identifier.ToString()` |
| `hardware_name` | `hardware.Name` |
| `hardware_type` | `hardware.HardwareType.ToString()` |
| `sensor_name` | `sensor.Name` |
| `source_sensor_type` | `sensor.SensorType.ToString()` |

LHM itself reports hardware and sensor names separately from identifiers. Its report tree prints hardware as `hardware.Name (hardware.Identifier)` and sensors as `sensor.Name (...) (sensor.Identifier)`. ShoMetrics must follow that model: identifiers route requests and support diagnostics; names and descriptor fields drive user-facing display.

Future dynamic sensor picker display rule:

```txt
Primary label:   <hardware_name> - <sensor_name>
Secondary text:  <hardware_type> / <source_sensor_type> / <canonical unit label>
Debug details:   source_sensor_id
```

`hardware_type` and `source_sensor_type` are source-native diagnostic strings, so they may be raw values such as `GpuNvidia`, `GpuIntel`, `Cpu`, `Temperature`, or `SmallData`. Node may cosmetically prettify them for display, for example `GpuNvidia` -> `GPU NVIDIA`, but that prettifier must be display-only and centralized. Do not use prettified strings for behavior, persistence, grouping, or metric selection.

If a helper cannot provide non-empty `hardware_name` and `sensor_name` for a dynamic descriptor, it should not expose that descriptor as a normal picker option. It may expose it only through an advanced debug view with a warning.

## Node And Property Inspector Impact

These types do not all map into Node or the Property Inspector as source-native concepts.

Node maps only ShoMetrics contract concepts:

- `MetricUnit` -> formatting/display helpers.
- `MetricValueKind` -> scalar vs text handling.
- `MetricSnapshot.captured_at` -> `MetricStore` timestamp.
- `MetricDescriptor` -> runtime discovery/debug data.

Node must not map or switch on:

- LHM `SensorType`.
- Linux `hwmon` file prefixes.
- NVML field enums.
- AMD SMI enum names.
- macOS SMC key classes.
- `source_sensor_type` or `hardware_type` strings, except for display and support logs.

Property Inspector policy:

- Current built-in widgets continue to use stable metric aliases.
- Future dynamic sensor picker reads descriptors from runtime source clients and persists only the selected `metric_id`.
- Do not persist descriptor lists, source health, helper availability, or discovered sensors into Stream Deck settings.
- Do not import generated source API messages into ordinary React panels. Convert generated descriptors at the runtime/source boundary before exposing a PI-facing model.
- If PI displays source-native strings, label them as diagnostic/source metadata and do not use them for behavior.

## Target Contract

Replace `snapshot.proto` with metric snapshot payloads and descriptors:

```proto
syntax = "proto3";

package shometrics.v1;

import "google/protobuf/timestamp.proto";

option csharp_namespace = "ShoMetrics.Contracts.V1";

// Source-agnostic metric values captured at one point in time.
message MetricSnapshot {
  google.protobuf.Timestamp captured_at = 1;

  // Keyed by ShoMetrics metric id. Metric ids are opaque to generic runtime code.
  map<string, MetricValue> metrics = 2;
}

message MetricValue {
  oneof value {
    double scalar = 1;

    // Plain text metric value for source-derived logical metrics such as
    // hardware model names. Raw hardware sensors are scalar unless a source
    // exposes a real text-valued reading.
    string text = 2;
  }

  // Canonical unit for scalar values. Text values use METRIC_UNIT_UNSPECIFIED.
  MetricUnit unit = 3;
}

message MetricDescriptor {
  // ShoMetrics metric id used as the key in MetricSnapshot.metrics.
  string metric_id = 1;

  // Source-owned opaque sensor id. Node must not parse this value.
  string source_sensor_id = 2;

  // Source-owned opaque hardware id. Node must not parse this value.
  string hardware_id = 3;
  string hardware_name = 4;
  string hardware_type = 5;
  string sensor_name = 6;

  // Source-owned diagnostic sensor type. Generic Node runtime must not parse it.
  string source_sensor_type = 7;

  MetricValueKind value_kind = 8;
  MetricUnit unit = 9;
  MetricIdKind metric_id_kind = 10;
}

enum MetricValueKind {
  METRIC_VALUE_KIND_UNSPECIFIED = 0;
  METRIC_VALUE_KIND_SCALAR = 1;
  METRIC_VALUE_KIND_TEXT = 2;
}

enum MetricIdKind {
  METRIC_ID_KIND_UNSPECIFIED = 0;

  // ShoMetrics-owned stable alias such as cpu.usage_percent.
  METRIC_ID_KIND_STABLE_ALIAS = 1;

  // Source-owned raw sensor id such as lhm.sensor:/intelcpu/0/temperature/26.
  METRIC_ID_KIND_SOURCE_SENSOR = 2;
}

enum MetricUnit {
  METRIC_UNIT_UNSPECIFIED = 0;
  METRIC_UNIT_PERCENT = 1;
  METRIC_UNIT_CELSIUS = 2;
  METRIC_UNIT_VOLTS = 3;
  METRIC_UNIT_AMPERES = 4;
  METRIC_UNIT_WATTS = 5;
  METRIC_UNIT_HERTZ = 6;
  METRIC_UNIT_BYTES = 7;
  METRIC_UNIT_BYTES_PER_SECOND = 8;
  METRIC_UNIT_REVOLUTIONS_PER_MINUTE = 9;
  METRIC_UNIT_LITERS_PER_HOUR = 10;
  METRIC_UNIT_UNITLESS = 11;
  METRIC_UNIT_SECONDS = 12;
  METRIC_UNIT_WATT_HOURS = 13;
  METRIC_UNIT_DECIBELS_A_WEIGHTED = 14;
  METRIC_UNIT_SIEMENS_PER_CENTIMETER = 15;

  // Add new units here only when a source intentionally exposes a physical
  // quantity that cannot be represented by the existing canonical units.
}
```

Rules:

- Do not include `source_id` in `MetricSnapshot`.
- `captured_at` is the moment the source completed the read pass used to build this snapshot. Do not use the start of polling, helper process start time, or Node receive time for source-produced snapshots.
- Do not include `progress` in `MetricValue`.
- Do not encode units as strings in source API payloads.
- Do not encode LHM sensor paths into metric ids except for source-owned dynamic metric ids explicitly exposed by descriptors.
- Omit invalid or non-finite metric values from snapshots.
- Warnings stay in source API responses, not inside `MetricSnapshot`.
- Dynamic LHM sensors must be represented as descriptor-backed metric ids. Node may store, request, and display those ids, but generic runtime code must not derive behavior by parsing them.
- Text values are allowed for source-derived logical metrics such as model names. Do not keep `text` as a vague future field; any text metric must have a descriptor with `METRIC_VALUE_KIND_TEXT`.
- `metric_id_kind` is an enum instead of `bool is_dynamic` because descriptor origin is not safely binary. A missing bool would look like a stable alias, and future ids may be source-derived, custom formula, remote-exported, or another explicit kind. Do not add speculative enum values now; add a new value only when a concrete source needs it.

Stable alias ownership:

- Stable aliases are ShoMetrics-owned canonical ids, not helper-owned ids.
- This refactor does not create a generated stable-alias registry.
- Before adding a second non-Windows advanced helper, add either a shared stable-alias registry or contract tests that assert helper mappings match the canonical ShoMetrics aliases.
- Until that exists, updates to stable aliases must update Node constants, C# mappings, and this document together.

Stable alias canonical list for this refactor:

| Metric id | Kind | Unit | Notes |
|---|---|---|---|
| `cpu.usage_percent` | stable alias | `METRIC_UNIT_PERCENT` | CPU total load. |
| `gpu.usage_percent` | stable alias | `METRIC_UNIT_PERCENT` | GPU core load. |
| `gpu.temp` | stable alias | `METRIC_UNIT_CELSIUS` | GPU core temperature. |
| `gpu.power` | stable alias | `METRIC_UNIT_WATTS` | GPU package/core power, source chooses the best available package-like sensor. |
| `gpu.vram_used` | stable alias | `METRIC_UNIT_BYTES` | GPU memory used. |
| `gpu.vram_total` | stable alias | `METRIC_UNIT_BYTES` | GPU memory capacity when available. |
| `ram.used` | stable alias | `METRIC_UNIT_BYTES` | System memory used. |
| `ram.available` | internal stable alias | `METRIC_UNIT_BYTES` | Used to derive `ram.total`; not exposed as a default widget metric. |
| `ram.total` | derived stable alias | `METRIC_UNIT_BYTES` | Derived from used + available when both exist. |
| `net.down` | stable alias | `METRIC_UNIT_BYTES_PER_SECOND` | Aggregate download throughput. |
| `net.up` | stable alias | `METRIC_UNIT_BYTES_PER_SECOND` | Aggregate upload throughput. |
| `disk.throughput.read` | stable alias | `METRIC_UNIT_BYTES_PER_SECOND` | Aggregate disk read throughput. |
| `disk.throughput.write` | stable alias | `METRIC_UNIT_BYTES_PER_SECOND` | Aggregate disk write throughput. |
| `disk.throughput.total` | derived stable alias | `METRIC_UNIT_BYTES_PER_SECOND` | Derived from read + write throughput. |

## Source API Updates

Move `MetricDescriptor` from `source_api.proto` into `snapshot.proto`, then import it from `source_api.proto`.

Do not make `source_sensor_type` or `hardware_type` ShoMetrics enums yet. They are source-owned diagnostic strings. LHM's `Load`, `Temperature`, `SmallData`, `GpuNvidia`, and similar names are useful for discovery UI and support logs, but generic runtime code must not parse them for behavior.

`ListMetricDescriptorsRequest` with an empty `metric_ids` list means "list all descriptors available from this source". This is required for dynamic LHM sensor discovery.

## Unit Policy

Canonical units are protocol units, not display labels:

| Source value | Canonical metric unit | Conversion owner |
|---|---|---|
| LHM `Load`, `Control`, `Level` percent values | `METRIC_UNIT_PERCENT` | Source adapter |
| LHM `Temperature` celsius | `METRIC_UNIT_CELSIUS` | Source adapter |
| LHM `Voltage` volts | `METRIC_UNIT_VOLTS` | Source adapter |
| LHM `Current` amperes | `METRIC_UNIT_AMPERES` | Source adapter |
| LHM `Power` watts | `METRIC_UNIT_WATTS` | Source adapter |
| LHM `Throughput` bytes/sec | `METRIC_UNIT_BYTES_PER_SECOND` | Source adapter |
| LHM RAM/VRAM data in GiB/MiB source units | `METRIC_UNIT_BYTES` | Source adapter |
| LHM `Clock` MHz | `METRIC_UNIT_HERTZ` after MHz to Hz conversion | Source adapter |
| LHM `Frequency` hertz | `METRIC_UNIT_HERTZ` | Source adapter |
| LHM fan speed | `METRIC_UNIT_REVOLUTIONS_PER_MINUTE` | Source adapter |
| LHM flow liters/hour | `METRIC_UNIT_LITERS_PER_HOUR` | Source adapter |
| LHM `Factor` values | `METRIC_UNIT_UNITLESS` | Source adapter |
| LHM `TimeSpan` seconds | `METRIC_UNIT_SECONDS` | Source adapter |
| LHM `Timing` nanoseconds | `METRIC_UNIT_SECONDS` after ns to seconds conversion | Source adapter |
| LHM `Energy` milliwatt-hours | `METRIC_UNIT_WATT_HOURS` after mWh to Wh conversion | Source adapter |
| LHM `Noise` dBA | `METRIC_UNIT_DECIBELS_A_WEIGHTED` | Source adapter |
| LHM `Conductivity` uS/cm | `METRIC_UNIT_SIEMENS_PER_CENTIMETER` after uS/cm to S/cm conversion | Source adapter |
| LHM `Humidity` percent | `METRIC_UNIT_PERCENT` | Source adapter |

Node owns human display formatting such as `%`, `°C`, `GB`, `MB/s`, and localized text.

## Progress Policy

Rendering progress is Node-owned:

| Metric kind | Progress source |
|---|---|
| CPU/GPU load percent | scalar / 100 |
| RAM/VRAM usage | used / total |
| Disk usage | used / total |
| Network throughput | scalar / widget maximum throughput setting |
| Disk throughput | scalar / widget maximum throughput setting |
| Temperature | scalar / widget temperature maximum setting |
| Power | scalar / metric-specific or widget power maximum setting |

C# helpers and remote agents must not set progress.

## Rejected Designs

| Design | Rejected because | Future reconsideration |
|---|---|---|
| Put `progress` in `MetricValue` | It is a rendering hint. It already forced C# service code to infer UI progress from unit strings. | Never for source snapshots. If needed, add Node-owned render metadata outside source contracts. |
| Keep `unit` as a free string | It produced multiple incompatible vocabularies and makes Node logic brittle. | Only reconsider for user-defined custom formulas with arbitrary unit labels, and keep that separate from source API metric snapshots. |
| Add LHM/Linux/macOS source-native enums to proto | Source-native type systems are open, platform-specific, and change independently. They would leak helper internals into Node/PI. | Do not add unless a source-native type becomes a ShoMetrics cross-source semantic concept. |
| Make Node parse dynamic metric ids | It would couple generic runtime to LHM/sysfs/SMC/NVML path formats. | Never for generic runtime. A source-specific debug view may parse via a source-owned adapter. |
| Persist descriptors in Stream Deck settings | Descriptor lists are runtime discovery data and can change with hardware, drivers, helper version, or remote source. | Persist only selected `metric_id` when dynamic picker exists. |
| Use `METRIC_UNIT_UNSPECIFIED` for unknown scalar units | Unknown units cannot be formatted or compared safely. | Temporarily allowed only with a warning while developing a new helper; not acceptable for committed source mappings. |

## Implementation Plan

Use the no-production-compatibility window. Break the old contract and fix call sites directly.

1. Rewrite `snapshot.proto` and update `source_api.proto`.
2. Run `npm.cmd run proto:format`, `npm.cmd run proto:lint`, and `npm.cmd run proto:build`.
3. Update TypeScript runtime source helpers:
   - replace `timestampMs` with `capturedAt`
   - replace `data` with `value`
   - remove all source-side `progress` construction
   - convert generated `MetricUnit` to a Node runtime unit model at the source adapter boundary
   - compute render progress in Node widget data builders
   - keep generated proto types out of rendering code and ordinary PI panels
4. Update Node sources:
   - `NodeSystemSource` emits canonical `MetricUnit`
   - `WindowsHelperSourceClient` converts protobuf timestamps to milliseconds for `MetricStore`
   - tests stop asserting source-provided progress
5. Update C# Core DTOs:
   - introduce a Core-owned unit enum
   - change `MetricReading.Unit` and `HardwareMetricDescriptor.Unit` from `string` to that enum
   - add value kind to descriptors
   - add hardware type to descriptors
   - keep Core free of generated protobuf types
6. Update C# source mapping:
   - map LHM sensor types/names into canonical units
   - convert RAM/VRAM values to bytes
   - convert clocks to hertz before exposing them
   - convert timing, energy, conductivity, and small-data values to canonical units
   - generate dynamic LHM metric ids with `lhm.sensor:<source_sensor_id>`
   - keep stable aliases and dynamic ids side by side where both are useful
   - omit null, non-finite, or source-unavailable values
   - skip sensors with no canonical unit and report a discovery warning
   - keep raw dynamic sensor validation conservative; defer source-specific range decisions to the LHM preliminary audit
7. Update `SourceProtocolMapper`:
   - Core unit enum -> protobuf `MetricUnit`
   - `DateTimeOffset` -> `google.protobuf.Timestamp`
   - remove progress mapping entirely
8. Update future helper notes:
   - Linux helpers must map hwmon/libsensors/NVML/AMD SMI/powercap data into the same canonical units and descriptor shape.
   - macOS helpers must map powermetrics/SMC/HID data into the same canonical units and descriptor shape.
   - No future helper may require Node to understand source-native sensor type enums.
9. Update docs:
   - `docs/development/archive/librehardwaremonitor-node-integration-plan.md`
   - `.agents/skills/technical-deisn-doc/references/TECHNICAL_DESIGN.md`
10. Verify:
   - `npm.cmd run proto:format`
   - `npm.cmd run proto:lint`
   - `npm.cmd run proto:build`
   - `npm.cmd run test:unit`
   - `dotnet build .\packages\source-windows\ShoMetrics.Source.Windows.slnx --no-restore`

## Non-Goals

- Do not implement dynamic metric picker UI in this refactor.
- Do not expose all raw LHM sensors as committed UI metrics in this refactor.
- Do not add a compatibility adapter for old `progress`, `unit`, `source_id`, or `timestamp_ms`.
- Do not make Node parse LHM sensor ids or LHM sensor type strings.
- Do not persist runtime descriptors or discovered sensor lists into Stream Deck settings.

## Follow-Up Audit

After this refactor closes and the repo is back to a buildable state, use [LibreHardwareMonitor Preliminary Audit](./archive/librehardwaremonitor-preliminary-audit.md) before treating dynamic sensor coverage as complete.

Audit questions:

- Whether `sensor.Identifier` is stable enough across boots, driver updates, and LHM versions for persisted dynamic sensor selections.
- Whether any `SensorType.Data` or `SensorType.SmallData` family needs decimal rather than binary byte conversion.
- Whether negative voltage, current, or noise readings are possible from real PC sensor sources and should be preserved.
- Whether hardware-specific sensor names require more stable alias variants.
- Which `NaN`, `Infinity`, null, or sentinel values LHM emits for unavailable sensors.

Do not block the current proto migration on this audit. The current dynamic mapping must stay conservative: normalize units, preserve opaque ids, expose descriptors, and avoid source-specific parsing in Node.
