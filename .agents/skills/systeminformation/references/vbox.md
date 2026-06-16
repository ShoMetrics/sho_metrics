In this section you will learn how to get information about virtual box VMs:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## VMs

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.vboxInfo(cb) | \[{...}\] | X | X | X | X | X | returns array of detailed info about all VMs |
|  | \[0\].id | X | X | X | X | X | virtual box ID |
|  | \[0\].name | X | X | X | X | X | name |
|  | \[0\].running | X | X | X | X | X | vbox is running |
|  | \[0\].started | X | X | X | X | X | started date time |
|  | \[0\].runningSince | X | X | X | X | X | running since (secs) |
|  | \[0\].stopped | X | X | X | X | X | stopped date time |
|  | \[0\].stoppedSince | X | X | X | X | X | stopped since (secs) |
|  | \[0\].guestOS | X | X | X | X | X | Guest OS |
|  | \[0\].hardwareUUID | X | X | X | X | X | Hardware UUID |
|  | \[0\].memory | X | X | X | X | X | Memory in MB |
|  | \[0\].vram | X | X | X | X | X | VRAM in MB |
|  | \[0\].cpus | X | X | X | X | X | CPUs |
|  | \[0\].cpuExepCap | X | X | X | X | X | CPU exec cap |
|  | \[0\].cpuProfile | X | X | X | X | X | CPU profile |
|  | \[0\].chipset | X | X | X | X | X | chipset |
|  | \[0\].firmware | X | X | X | X | X | firmware |
|  | \[0\].pageFusion | X | X | X | X | X | page fusion |
|  | \[0\].configFile | X | X | X | X | X | config file |
|  | \[0\].snapshotFolder | X | X | X | X | X | snapshot folder |
|  | \[0\].logFolder | X | X | X | X | X | log folder path |
|  | \[0\].hpet | X | X | X | X | X | HPET |
|  | \[0\].pae | X | X | X | X | X | PAE |
|  | \[0\].longMode | X | X | X | X | X | long mode |
|  | \[0\].tripleFaultReset | X | X | X | X | X | triple fault reset |
|  | \[0\].apic | X | X | X | X | X | APIC |
|  | \[0\].x2Apic | X | X | X | X | X | X2APIC |
|  | \[0\].acpi | X | X | X | X | X | ACPI |
|  | \[0\].ioApic | X | X | X | X | X | IOAPIC |
|  | \[0\].biosApicMode | X | X | X | X | X | BIOS APIC mode |
|  | \[0\].bootMenuMode | X | X | X | X | X | boot menu Mode |
|  | \[0\].bootDevice1 | X | X | X | X | X | bootDevice1 |
|  | \[0\].bootDevice2 | X | X | X | X | X | bootDevice2 |
|  | \[0\].bootDevice3 | X | X | X | X | X | bootDevice3 |
|  | \[0\].bootDevice4 | X | X | X | X | X | bootDevice4 |
|  | \[0\].timeOffset | X | X | X | X | X | time Offset |
|  | \[0\].rtc | X | X | X | X | X | RTC |
