# LibreHardwareMonitor Preliminary Audit

This preliminary audit records source-level facts from the local LibreHardwareMonitor checkout before ShoMetrics treats dynamic LHM sensor coverage as complete.

All paths below are relative to the LibreHardwareMonitor checkout root.

Audited checkout:

```txt
abfc4f5 Update README to remove WinGet installation section
```

## Boundary Decision

LibreHardwareMonitor owns native hardware identifiers, sensor identifiers, sensor names, hardware names, and sensor type names. ShoMetrics adapters may read those values to build descriptors and stable aliases, but generic Node runtime, rendering, and Property Inspector code must not parse LHM paths or LHM enum names for behavior.

ShoMetrics owns:

- stable alias metric ids such as `cpu.usage_percent` and `gpu.temp`
- dynamic metric id prefixing such as `lhm.sensor:<source_sensor_id>`
- canonical `MetricUnit` conversion
- Node-side history and rendering progress

## Sensor Type Units

Primary LHM file:

```txt
LibreHardwareMonitorLib/Hardware/ISensor.cs
```

Key code:

```csharp
public enum SensorType
{
    Voltage, // V
    Current, // A
    Power, // W
    Clock, // MHz
    Temperature, // °C
    Load, // %
    Frequency, // Hz
    Fan, // RPM
    Flow, // L/h
    Control, // %
    Level, // %
    Factor, // 1
    Data, // GB = 2^30 Bytes
    SmallData, // MB = 2^20 Bytes
    Throughput, // B/s
    TimeSpan, // Seconds
    Timing, // ns
    Energy, // milliwatt-hour (mWh)
    Noise, // dBA
    Conductivity, // µS/cm
    Humidity // %
}
```

Cross-check file:

```txt
LibreHardwareMonitor.Windows.Forms/Utilities/HttpServer.cs
```

Key code:

```csharp
{ SensorType.Clock, ("hertz", 1000000)},                           // originally megahertz
{ SensorType.Conductivity, ("seconds_per_centimeter", 0.000001) }, // originally microseconds per centimeter
{ SensorType.Data, ("bytes", 1000000000) },                        // originally GB
{ SensorType.Energy, ("watthour", 0.001) },
{ SensorType.SmallData, ("bytes", 1024*1024) },                    // originally MiB
{ SensorType.Timing, ("seconds", 0.000000001 ) },                  // originally nanoseconds
```

Display file:

```txt
LibreHardwareMonitor.Windows.Forms/UI/SensorNode.cs
```

Key code:

```csharp
case SensorType.Clock:
    Format = "{0:F1} MHz";
case SensorType.Data:
    Format = "{0:F1} GB";
case SensorType.SmallData:
    Format = "{0:F1} MB";
case SensorType.Timing:
    Format = "{0:F3} ns";
case SensorType.Energy:
    Format = "{0:F0} mWh";
case SensorType.Conductivity:
    Format = "{0:F1} µS/cm";
```

ShoMetrics decisions:

- Use `ISensor.cs` as the adapter contract for the LHM source unit vocabulary.
- Convert `Clock` MHz to hertz, `Timing` ns to seconds, `Energy` mWh to watt-hours, `Conductivity` µS/cm to siemens per centimeter, `Data` GiB to bytes, and `SmallData` MiB to bytes before writing protobuf.
- Do not copy LHM display strings into protobuf units.
- Treat the LHM HTTP/OpenMetrics exporter as a useful cross-check, not the ShoMetrics source of truth. It disagrees with `ISensor.cs` for generic `Data` by using decimal `1000000000`, and its `Conductivity` label says `seconds_per_centimeter` even though `ISensor.cs` and UI formatting say `µS/cm`.
- Treat the HTTP `Data` factor as an upstream exporter bug for ShoMetrics purposes, not as an alternate convention. LHM's in-process sensor contract and UI both present `Data` as GiB-scale values.

Follow-up required:

- Add tests around RAM, storage, and VRAM byte conversion using real LHM dump fixtures.
- Keep the current binary `Data` conversion unless a specific source family proves decimal units in tests.

## Identifiers And Dynamic Sensor Paths

Identifier file:

```txt
LibreHardwareMonitorLib/Hardware/Identifier.cs
```

Key code:

```csharp
/// Represents a unique ISensor/IHardware identifier in text format with a / separator.
private const char Separator = '/';
...
identifiers[i] = Uri.EscapeDataString(identifiers[i]);
...
_identifier = s.ToString();
```

Sensor identifier file:

```txt
LibreHardwareMonitorLib/Hardware/Sensor.cs
```

Key code:

```csharp
public Identifier Identifier => field ??= new Identifier(
    _hardware.Identifier,
    SensorType.ToString().ToLowerInvariant(),
    Index.ToString(CultureInfo.InvariantCulture));
```

Hardware identifier file:

```txt
LibreHardwareMonitorLib/Hardware/Hardware.cs
```

Key code:

```csharp
protected Hardware(string name, Identifier identifier, ISettings settings)
{
    Identifier = identifier;
    _customName = settings.GetValue(new Identifier(Identifier, "name").ToString(), name);
}
```

ShoMetrics decisions:

- `source_sensor_id` is LHM's `sensor.Identifier.ToString()`.
- `hardware_id` is LHM's `hardware.Identifier.ToString()`.
- Both are source-owned opaque strings. Node must not split on `/`, decode URI-escaped parts, infer indexes, or derive behavior from the path.
- Dynamic metric ids use `lhm.sensor:<source_sensor_id>` and are compared as opaque strings.

Risks:

- The sensor id includes the hardware id, lower-case LHM sensor type, and an index. It is stable only as long as LHM hardware enumeration and sensor indexing stay stable.
- Persisted dynamic sensor selections must tolerate the selected descriptor disappearing after driver changes, hardware changes, or LHM updates.

## Display Names

LHM UI tree file:

```txt
LibreHardwareMonitor.Windows.Forms/UI/HardwareNode.cs
```

Key code:

```csharp
public override string Text
{
    get { return Hardware.Name; }
    set { Hardware.Name = value; }
}
...
SensorNode sensorNode = new SensorNode(sensor, _settings, _unitManager);
```

LHM sensor display file:

```txt
LibreHardwareMonitor.Windows.Forms/UI/SensorNode.cs
```

Key code:

```csharp
public override string Text
{
    get { return Sensor.Name; }
    set { Sensor.Name = value; }
}
```

LHM JSON/HTTP file:

```txt
LibreHardwareMonitor.Windows.Forms/Utilities/HttpServer.cs
```

Key code:

```csharp
jsonNode["SensorId"] = sensorNode.Sensor.Identifier.ToString();
jsonNode["Type"] = sensorNode.Sensor.SensorType.ToString();
jsonNode["RawValue"] = sensorNode.Sensor.Value;
jsonNode["HardwareId"] = hardwareNode.Hardware.Identifier.ToString();
```

Prometheus labels in the same file:

```csharp
string valueHardwareName = node.Text;
string valueSensorName = sensor.Text.Replace("#", String.Empty);
string valueSensorId = sensor.Sensor.Identifier.ToString().Substring(valueHardwareId.Length);
string valueSensorAlias = $"{valueSensorName} ({valueSensorId})";
```

ShoMetrics decisions:

- Discovery UI should show `hardware_name` + `sensor_name` as the primary label.
- `source_sensor_id` and `hardware_id` are for advanced/debug display only.
- `hardware_type` and `source_sensor_type` may be prettified for display, but prettified strings must not affect storage, grouping, fallback, or rendering behavior.

## Value Validity And History

LHM sensor value file:

```txt
LibreHardwareMonitorLib/Hardware/Sensor.cs
```

Key code:

```csharp
public virtual float? Value
{
    get { return _currentValue; }
    set
    {
        if (value.HasValue)
        {
            _sum += value.Value;
            _count++;
            if (_count == 4)
            {
                AppendValue(_sum / _count, now);
            }
        }

        _currentValue = value;
        if (_trackMinMax)
        {
            if (value.HasValue && !float.IsNaN(value.Value) && !float.IsInfinity(value.Value))
            {
                if (!Min.HasValue || Min > value)
                    Min = value;

                if (!Max.HasValue || Max < value)
                    Max = value;
            }
        }
    }
}
```

LHM Prometheus export file:

```txt
LibreHardwareMonitor.Windows.Forms/Utilities/HttpServer.cs
```

Key code:

```csharp
if (float.IsNaN(val.Value))
{
    responseStr += $"# HELP {tagLine} has an invalid value and was skipped.\n";
}
else
{
    responseStr += $"{tagLine} {(val.Value * factor).ToString(CultureInfo.InvariantCulture)}\n";
}
```

ShoMetrics decisions:

- Do not import LHM `Min`, `Max`, or archived history. Node owns runtime history in `MetricStore`.
- Omit `null`, `NaN`, and `Infinity` snapshot values before protobuf serialization.
- Do not use LHM's current/min/max history behavior to infer rendering progress.
- Dynamic raw sensor validation must stay conservative until hardware-specific behavior is audited. It should avoid hiding abnormal but real readings.

## Stable Alias Audit

### CPU Usage

LHM file:

```txt
LibreHardwareMonitorLib/Hardware/Cpu/GenericCpu.cs
```

Key code:

```csharp
_totalLoad = _coreCount > 1 ? new Sensor("CPU Total", 0, SensorType.Load, this, settings) : null;
```

ShoMetrics mapping:

- `CPU Total` + `Load` maps to `cpu.usage_percent`.

Risk:

- LHM does not create `CPU Total` for single-core CPUs. ShoMetrics can accept this as an edge case for now, but a future robust mapper may need a fallback to the single core load.

### RAM Used And Total

LHM file:

```txt
LibreHardwareMonitorLib/Hardware/Memory/TotalMemory.cs
```

Key code:

```csharp
: base("Total Memory", new Identifier("ram"), settings)
PhysicalMemoryUsed = new Sensor("Memory Used", 0, SensorType.Data, this, settings);
PhysicalMemoryAvailable = new Sensor("Memory Available", 1, SensorType.Data, this, settings);
PhysicalMemoryLoad = new Sensor("Memory", 0, SensorType.Load, this, settings);
```

Related file:

```txt
LibreHardwareMonitorLib/Hardware/Memory/VirtualMemory.cs
```

Key code:

```csharp
: base("Virtual Memory", new Identifier("vram"), settings)
VirtualMemoryUsed = new Sensor("Memory Used", 2, SensorType.Data, this, settings);
VirtualMemoryAvailable = new Sensor("Memory Available", 3, SensorType.Data, this, settings);
VirtualMemoryLoad = new Sensor("Memory", 1, SensorType.Load, this, settings);
```

ShoMetrics mapping:

- `Memory Used` + `Data` on `Identifier("ram")` maps to `ram.used`.
- `Memory Available` + `Data` on `Identifier("ram")` is internal input for derived `ram.total`.
- `Data` converts from GiB to bytes.
- Stable RAM aliases should bind to `Total Memory` hardware (`Identifier("ram")`), not `Virtual Memory` hardware (`Identifier("vram")`).
- Implementation finding: `TotalMemory.cs` and `VirtualMemory.cs` use the same sensor names. Stable RAM aliases must match `hardware.Identifier`, not `hardware.Name` or sensor name alone, or virtual memory readings can masquerade as physical RAM.
- The audited upstream files do not show hardware named plain `Memory`. If ShoMetrics keeps a `hardware.Name == "Memory"` alternate, it needs a fixture or version note; otherwise remove it as a dead compatibility branch.

### GPU Temperature, Usage, Power, And VRAM

AMD file:

```txt
LibreHardwareMonitorLib/Hardware/Gpu/AmdGpu.cs
```

Key code:

```csharp
_temperatureCore = new Sensor("GPU Core", 0, SensorType.Temperature, this, settings);
_coreLoad = new Sensor("GPU Core", 0, SensorType.Load, this, settings);
_powerTotal = new Sensor("GPU Package", 3, SensorType.Power, this, settings);
_memoryUsed = new Sensor("GPU Memory Used", 0, SensorType.SmallData, this, settings);
_memoryTotal = new Sensor("GPU Memory Total", 2, SensorType.SmallData, this, settings);
```

NVIDIA file:

```txt
LibreHardwareMonitorLib/Hardware/Gpu/NvidiaGpu.cs
```

Key code:

```csharp
NvApi.NvThermalTarget.Gpu => "GPU Core";
NvApi.NvPowerTopologyDomain.Gpu => "GPU Power";
_powers[i] = new Sensor(name, nextLoadIndex++, SensorType.Load, this, settings);
_powerUsage = new Sensor("GPU Package", 0, SensorType.Power, this, settings);
_memoryUsed = new Sensor("GPU Memory Used", 1, SensorType.SmallData, this, settings);
_memoryTotal = new Sensor("GPU Memory Total", 2, SensorType.SmallData, this, settings);
```

Intel discrete file:

```txt
LibreHardwareMonitorLib/Hardware/Gpu/IntelDiscreteGpu.cs
```

Key code:

```csharp
_temperatureGpuCore = new Sensor("GPU Core", 0, SensorType.Temperature, this, settings);
_powerGpu = new Sensor("GPU Package", 0, SensorType.Power, this, settings);
_loadGlobalActivity = new Sensor("GPU Core", 0, SensorType.Load, this, settings);
_memoryUsed = new Sensor("GPU Memory Used", 1, SensorType.SmallData, this, settings);
_memoryTotal = new Sensor("GPU Memory Total", 2, SensorType.SmallData, this, settings);
```

Intel integrated file:

```txt
LibreHardwareMonitorLib/Hardware/Gpu/IntelIntegratedGpu.cs
```

Key code:

```csharp
_gtCoresTemperature = new Sensor("GPU Core", 0, SensorType.Temperature, this, settings);
_powerSensor = new Sensor("GPU Power", 0, SensorType.Power, this, settings);
_dedicatedMemoryUsage = new Sensor("D3D Dedicated Memory Used", memorySensorIndex++, SensorType.SmallData, this, settings);
_sharedMemoryUsage = new Sensor("D3D Shared Memory Used", memorySensorIndex++, SensorType.SmallData, this, settings);
```

ShoMetrics mapping:

- `GPU Core` + `Temperature` maps to `gpu.temp`.
- `GPU Core` + `Load` maps to `gpu.usage_percent`.
- `GPU Package` or `GPU Power` + `Power` maps to `gpu.power`.
- `GPU Memory Used` + `SmallData` maps to `gpu.vram_used`.
- `GPU Memory Total` + `SmallData` maps to `gpu.vram_total`.

Implementation guard:

- ShoMetrics stable VRAM mapping must use `SensorType.SmallData`. Do not keep a `Data` fallback without a real LHM version fixture proving it exists.

Power alias rule:

- NVIDIA's `GPU Power` from power topology is `SensorType.Load`, so it must not feed the watts-valued stable alias `gpu.power`.
- NVIDIA's watts-valued package power is `GPU Package` + `SensorType.Power`.
- Intel integrated GPU exposes `GPU Power` + `SensorType.Power`; that can feed `gpu.power`.
- If a future LHM source exposes both `GPU Package` and `GPU Power` as `SensorType.Power` on the same hardware, prefer `GPU Package` for the stable alias because it represents package/total power more closely than a subdomain sensor. Do not aggregate power sensors into `gpu.power`.

Known gap:

- Intel integrated GPU exposes D3D memory sensors such as `D3D Dedicated Memory Used` and `D3D Shared Memory Used`, not `GPU Memory Used`. Stable `gpu.vram_used` for integrated GPUs needs a separate design before claiming full coverage.

### Network Throughput

LHM file:

```txt
LibreHardwareMonitorLib/Hardware/Network/Network.cs
```

Key code:

```csharp
: base(networkInterface.Name, new Identifier("nic", networkInterface.Id), settings)
_uploadSpeed = new Sensor("Upload Speed", 7, SensorType.Throughput, this, settings);
_downloadSpeed = new Sensor("Download Speed", 8, SensorType.Throughput, this, settings);
_uploadSpeed.Value = (float)(dBytesUploaded / dt);
_downloadSpeed.Value = (float)(dBytesDownloaded / dt);
```

ShoMetrics mapping:

- `Upload Speed` + `Throughput` maps to `net.up`.
- `Download Speed` + `Throughput` maps to `net.down`.
- `Throughput` is already bytes per second.
- LHM uses .NET `NetworkInterface.Id` inside the hardware id. ShoMetrics must treat it as opaque because the LHM code does not guarantee whether the value is user-readable, rename-stable, or GUID-like on every platform.

### Disk Throughput And Capacity

LHM file:

```txt
LibreHardwareMonitorLib/Hardware/Storage/StorageDevice.cs
```

Key code:

```csharp
AddSensor("Data Read", 21, false, SensorType.Data, s => s.HostReads.GetValueOrDefault());
AddSensor("Data Written", 22, false, SensorType.Data, s => s.HostWrites.GetValueOrDefault());
_usageSensor = new Sensor("Used Space", 30, SensorType.Load, this, _settings);
_freeSpaceSensor = new Sensor("Free Space", 31, SensorType.Data, this, _settings);
var totalSpaceSensor = new Sensor("Total Space", 32, SensorType.Data, this, _settings);
_sensorDiskReadRate = new Sensor("Read Rate", 54, SensorType.Throughput, this, _settings);
_sensorDiskWriteRate = new Sensor("Write Rate", 55, SensorType.Throughput, this, _settings);
```

ShoMetrics mapping:

- `Read Rate` + `Throughput` maps to `disk.throughput.read`.
- `Write Rate` + `Throughput` maps to `disk.throughput.write`.
- `Read + write` remains a ShoMetrics-derived metric.

Future alias option:

- LHM exposes storage `Used Space`, `Free Space`, and `Total Space`, but current built-in disk usage UI is backed by Node/system disk volume data. Do not introduce disk capacity fallback through LHM until volume identity semantics are designed.
- `Used Space` is `SensorType.Load`, so it is a percent value, not a byte count. A future disk-capacity alias must decide whether it wants percent used, bytes used derived from free/total, or both.

## Audit Findings To Apply

1. Done: Keep ShoMetrics VRAM stable aliases on LHM `SensorType.SmallData` for `GPU Memory Used` and `GPU Memory Total`; do not add `SensorType.Data` branches unless a real fixture requires them.
2. Done: Keep dynamic sensor values exposed only when the source value is present, finite, and has a canonical unit.
3. Done: Keep unsupported sensor types observable. When LHM adds a `SensorType` with no ShoMetrics `MetricUnit` mapping, skip the sensor and emit a discovery warning.
4. Done: Keep dynamic sensor ids opaque and tolerate missing descriptors after hardware/LHM changes.
5. Pending: Add fixture tests using LHM dumps for RAM GiB, VRAM MiB, network throughput B/s, and disk throughput B/s.
6. Pending: Revisit negative voltage/current/noise handling only with concrete LHM source examples.
7. Pending: Consider CPU single-core fallback only if it matters for supported hardware.
8. Done: Do not parse LHM `HardwareType`, `SensorType`, `source_sensor_id`, or `hardware_id` outside the Windows source adapter.
