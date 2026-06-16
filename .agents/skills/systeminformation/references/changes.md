## Major Changes - Version 5

#### New Functions

-   audio() detailed audio information
-   bluetoothDevices() detailed information detected bluetooth devices
-   printers() detailed printer information
-   usb() detailed USB information
-   wifiInterfaces() detected Wi-Fi interfaces
-   wifiConnections() active Wi-Fi connections

#### Breaking Changes

Be aware, that the new version 5.x is NOT fully backward compatible to version 4.x ...

We had to make several interface changes to keep systeminformation as consistent as possible. We highly recommend to go through the complete list and adapt your own code to be again compatible to the new version 5:

| Function | Old | New (V5) | Comments |
| --- | --- | --- | --- |
| unsupported values | \-1 | null | values which are unknown or unsupported  
on platform |
| battery() | hasbattery  
cyclecount  
ischarging  
designedcapacity  
maxcapacity  
acconnected  
timeremaining | hasBattery  
cycleCount  
isCharging  
designedCapacity  
maxCapacity  
acConnected  
timeRemaining | pascalCase conformity |
| blockDevices() | fstype | fsType | pascalCase conformity |
| cpu() | speedmin  
speedmax | speedMin  
speedMax | pascalCase conformity |
| cpu().speed  
cpu().speedMin  
cpu().speedMax | string values | now returning  
numerical values | better value handling |
| cpuCurrentspeed() |  | cpuCurrentSpeed() | function name changed  
pascalCase conformity |
| currentLoad() | avgload  
currentload  
currentload\_user  
currentload\_system  
currentload\_nice  
currentload\_idle  
currentload\_irq  
raw\_currentload | avgLoad  
currentLoad  
currentLoadUser  
currentLoadSystem  
currentLoadNice  
currentLoadIdle  
currentLoadIrq  
rawCurrentLoad | pascalCase conformity |
| dockerContainerStats() | mem\_usage  
mem\_limit  
mem\_percent  
cpu\_percent  
cpu\_stats  
precpu\_stats  
memory\_stats | memUsage  
memLimit  
memPercent  
cpuPercent  
cpuStats  
precpuStats  
memoryStats | pascalCase conformity |
| dockerContainerProcesses() | pid\_host | pidHost | pascalCase conformity |
| graphics().display | pixeldepth  
resolutionx  
resolutiony  
sizex  
sizey | pixelDepth  
resolutionX  
resolutionY  
sizeX  
sizeY | pascalCase conformity |
| networkConnections() | localaddress  
localport  
peeraddress  
peerport | localAddress  
localPort  
peerAddress  
peerPort | pascalCase conformity |
| networkInterfaces() | carrier\_changes | carrierChanges | pascalCase conformity |
| processes() | mem\_vsz  
mem\_rss  
pcpu  
pcpuu  
pcpus  
pmem | memVsz  
memRss  
cpu  
cpuu  
cpus  
mem | pascalCase conformity  
renamed attributes |
| processLoad() | result as object | result as array of objects | function now allows to provide more than  
one process (as a comma separated list) |
| services() | pcpu  
pmem | cpu  
mem | renamed attributes |
| vbox() | HPET  
PAE  
APIC  
X2APIC  
ACPI  
IOAPIC  
biosAPICmode  
TRC | hpet  
pae  
apic  
x2Apic  
acpi  
ioApic  
biosApicMode  
rtc | pascalCase conformity |

I know, these are a lot of changes, but for the sake of a consistent interface and to be future proof, we think that this was necessary. Thank you for your understanding.

#### Other Improvements and Changes

-   baseboard(): added memMax, memSlots
-   bios(): added language and features (linux)
-   cpu(): extended AMD processor list
-   cpu(): extended socket list (win)
-   cpu(): added virtualization if cpu supports virtualization
-   cpu(): now flags are part of this function
-   cpuTemperature(): added socket and chipset temperature (linux)
-   currentLoad(): added steal and guest time (linux)
-   disksIO(): added waitTime, waitPercent (linux)
-   fsSize(): added optional drive parameter
-   fsSize(): added available
-   fsSize(): improved calculation of used
-   getData(): support for passing parameters and filters (see [section General / getData](https://systeminformation.io/general.html))
-   graphics(): extended properties linux
-   graphics(): extended properties macOS
-   graphics(): extended nvidia-smi parsing
-   networkInterfaces(): type detection improved (win - wireless)
-   mem(): added writeback and dirty (linux)
-   memLayout(): extended manufacturer list (decoding)
-   memLayout(): added ECC flag
-   osInfo(): better fqdn (win)
-   osinfo(): added hypervizor if hyper-v is enabled (win only)
-   system(): better Raspberry PI detection
-   system(): added virtual and virtualHost (if system is virtual instance)
-   uuid(): better value support
-   uuid(): added MACs
-   uuid(): better Raspberry Pi hardware ID
-   versions(): added bash, zsh, fish, powershell, dotnet
-   Apple M1 Silicon extended support
-   updated TypeScript definitions

#### Test Full Version 5 Functionality

If you want to see all function results on your machine, please [head over to Testing section](https://systeminformation.io/tests.html). We implemented a tiny test suite where you can easily go through all functions and test resuls on your machine without coding.

## Major Changes - Version 4

#### New Functions

-   chassis() chassis information
-   vboxInfo() detailed virtualBox VM information
-   wifiNetworks() detailed information about available wifi networks

#### Breaking Changes

-   networkStats(): will provide an **array** of stats for all given interfaces. In previous versions only one interface was provided as a parameter. Pass '\*' for all interfaces
-   networkStats(): rx and tx changed to rx\_bytes and tx\_bytes
-   dockerContainerStats() will provide an **array** of stats for all given docker containers. In previous versions only one interface was provided as a parameter. Pass '\*' for all docker containers

#### Other Changes

-   system(): optimized system detection (e.g. new Raspberry Pi models, ...)
-   system(), bios(), baseboard(): information also as non-root (linux)
-   graphics(): added pip, pip3, virtualBox,
-   versions(): better controller and display detection, fixes
-   networkInterfaces(): optimization, fixes
-   networkStats() added operstate, type, duplex, mtu, speed, carrierChanges
-   added TypeScript definitions

**Be aware**, that the new version 4.x is **NOT fully backward compatible** to version 3.x ...

## Major Changes - Version 3

-   works only with node.js v4.0.0 and above (using now internal ES6 promise function, arrow functions, ...)
-   **Promises**. As you can see in the documentation, you can now also use it in a promise oriented way. But callbacks are still supported.
-   **Async/Await**. Due to the promises support, systeminformation also works perfectly with the \`async/await\` pattern (available in node.js **v7.6.0** and above). See example in the docs.

  

## Full Version History

Full version histrory (every single release version from version 1.x.x to 5.x.x) can be [viewed here](https://systeminformation.io/history.html)
