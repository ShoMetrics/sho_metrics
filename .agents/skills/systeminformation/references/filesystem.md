[Documentation](https://systeminformation.io/#docs)

-   [Getting Started](https://systeminformation.io/gettingstarted.html)
-   [General](https://systeminformation.io/general.html)
-   [System](https://systeminformation.io/system.html)
-   [CPU](https://systeminformation.io/cpu.html)
-   [Memory](https://systeminformation.io/memory.html)
-   [Battery](https://systeminformation.io/battery.html)
-   [Graphics](https://systeminformation.io/graphics.html)
-   [OS](https://systeminformation.io/os.html)
-   [Processes / Services](https://systeminformation.io/processes.html)
-   [Disks / FS](https://systeminformation.io/filesystem.html)
-   [USB](https://systeminformation.io/usb.html)
-   [Printer](https://systeminformation.io/printer.html)
-   [Audio](https://systeminformation.io/audio.html)
-   [Network](https://systeminformation.io/network.html)
-   [Wifi](https://systeminformation.io/wifi.html)
-   [Bluetooth](https://systeminformation.io/bluetooth.html)
-   [Docker](https://systeminformation.io/docker.html)
-   [Virtual Box](https://systeminformation.io/vbox.html)
-   [Observers / Stats](https://systeminformation.io/statsfunctions.html)

More

-   [Security Advisories](https://systeminformation.io/security.html)
-   [Known Issues](https://systeminformation.io/issues.html)
-   [Version 5 Changes](https://systeminformation.io/changes.html)
-   [Version 4 Docs](https://systeminformation.io/v4/index.html)
-   [Version History](https://systeminformation.io/history.html)
-   [Testing](https://systeminformation.io/tests.html)
-   [Copyright & License](https://systeminformation.io/copyright.html)
-   [Contributors](https://systeminformation.io/contributors.html)
-   [Trademarks](https://systeminformation.io/trademarks.html)

Disks and File System

In this section you will learn how to get disks information, file system information, disk I/O stats and file system stats:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Disk Layout, Block Devices and Disks IO

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.diskLayout(cb) | \[{...}\] | X |  | X | X |  | physical disk layout (array) |
|  | \[0\].device | X |  | X |  |  | e.g. /dev/sda |
|  | \[0\].type | X |  | X | X |  | HD, SSD, NVMe |
|  | \[0\].name | X |  | X | X |  | disk name |
|  | \[0\].vendor | X |  |  | X |  | vendor/producer |
|  | \[0\].size | X |  | X | X |  | size in bytes |
|  | \[0\].totalCylinders |  |  |  | X |  | total cylinders |
|  | \[0\].totalHeads |  |  |  | X |  | total heads |
|  | \[0\].totalTracks |  |  |  | X |  | total tracks |
|  | \[0\].totalSectors |  |  |  | X |  | total sectors |
|  | \[0\].tracksPerCylinder |  |  |  | X |  | tracks per cylinder |
|  | \[0\].sectorsPerTrack |  |  |  | X |  | sectors per track |
|  | \[0\].bytesPerSector |  |  |  | X |  | bytes per sector |
|  | \[0\].firmwareRevision | X |  | X | X |  | firmware revision |
|  | \[0\].serialNum | X |  | X | X |  | serial number |
|  | \[0\].interfaceType | X |  | X | X |  | SATA, PCIe, ... |
|  | \[0\].smartStatus | X |  | X | X |  | S.M.A.R.T Status (see Known Issues) |
|  | \[0\].temperature | X |  |  |  |  | S.M.A.R.T temperature (if available) |
|  | \[0\].smartData | X |  |  | X |  | full S.M.A.R.T data from smartctl  
requires at least smartmontools 7.0  
(see Known Issues) |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.diskLayout().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    device: '/dev/nvme0n1',
    type: 'NVMe',
    name: 'SAMSUNG xxxxxxxxxxxx-xxxx',
    vendor: 'Samsung',
    size: 1024209543168,
    bytesPerSector: null,
    totalCylinders: null,
    totalHeads: null,
    totalSectors: null,
    totalTracks: null,
    tracksPerCylinder: null,
    sectorsPerTrack: null,
    firmwareRevision: '',
    serialNum: '...serial....',
    interfaceType: 'PCIe',
    smartStatus: 'unknown',
    smartData: {
      json_format_version: [Array],
      smartctl: [Object],
      device: [Object],
      model_name: 'SAMSUNG xxxxxxxxxxxx-xxxx',
      serial_number: '...serial....',             // full structure
      ...                                         // see index.d.ts
    }
  },
  {
    ...
  }
]
```

 |
| si.blockDevices(cb) | \[{...}\] | X |  | X | X |  | returns array of disks, partitions,  
raids and roms |
|  | \[0\].name | X |  | X | X |  | name |
|  | \[0\].type | X |  | X | X |  | type |
|  | \[0\].fsType | X |  | X | X |  | file system type (e.g. ext4) |
|  | \[0\].mount | X |  | X | X |  | mount point |
|  | \[0\].size | X |  | X | X |  | size in bytes |
|  | \[0\].physical | X |  | X | X |  | physical type (HDD, SSD, CD/DVD) |
|  | \[0\].uuid | X |  | X | X |  | UUID |
|  | \[0\].label | X |  | X | X |  | label |
|  | \[0\].model | X |  | X |  |  | model |
|  | \[0\].serial | X |  |  | X |  | serial |
|  | \[0\].removable | X |  | X | X |  | serial |
|  | \[0\].protocol | X |  | X |  |  | protocol (SATA, PCI-Express, ...) |
|  | \[0\].group | X |  |  |  |  | Raid group member (e.g. md1) |
|  | \[1\].device | X |  | X | X |  | Physical device mapped to (e.g. /dev/sda) |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.blockDevices().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    name: 'nvme0n1',
    type: 'disk',
    fsType: '',
    mount: '',
    size: 1024209543168,
    physical: 'SSD',
    uuid: '',
    label: '',
    model: 'SAMSUNG xxxxxxxxxxxx-xxxx',
    serial: '... serial ...',
    removable: false,
    protocol: 'nvme',
    group: '',
    device: 'nvme0n1'
  },
  {
    ...
  }
]
```

 |
| si.disksIO(cb) | {...} | X |  | X |  |  | current transfer stats |
|  | rIO | X |  | X |  |  | read IOs on all mounted drives |
|  | wIO | X |  | X |  |  | write IOs on all mounted drives |
|  | tIO | X |  | X |  |  | write IOs on all mounted drives |
|  | rIO\_sec | X |  | X |  |  | read IO per sec (\* see notes) |
|  | wIO\_sec | X |  | X |  |  | write IO per sec (\* see notes) |
|  | tIO\_sec | X |  | X |  |  | total IO per sec (\* see notes) |
|  | rWaitTime | X |  |  |  |  | read IO request time |
|  | wWaitTime | X |  |  |  |  | write IO request time |
|  | tWaitTime | X |  |  |  |  | total IO request time |
|  | rWaitPercent | X |  |  |  |  | read IO request time percent |
|  | wWaitPercent | X |  |  |  |  | write IO request time percent |
|  | tWaitPercent | X |  |  |  |  | total IO request time percent |
|  | ms | X |  | X |  |  | interval length (for per second values) |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
setInterval(<span><span>function</span>(<span></span>) </span>{
  si.disksIO().then(<span><span>data</span> =&gt;</span> {
    <span>console</span>.log(data);
  })
}, <span>1000</span>)
```

```
{                           // first call
  rIO: 899825,
  wIO: 932331,
  tIO: 1832156,
  rIO_sec: null,
  wIO_sec: null,
  tIO_sec: null,
  ms: 0
}
{                           // second call
  rIO: 899863,
  wIO: 932331,
  tIO: 1832194,
  rIO_sec: 38.5395537525355,
  wIO_sec: 0,
  tIO_sec: 38.5395537525355,
  ms: 986
}...
```

 |

## File System and File System Stats

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.fsSize(drive, cb) | \[{...}\] | X | X | X | X |  | returns array of mounted file systems  
drive parameter is optional |
|  | \[0\].fs | X | X | X | X |  | name of file system |
|  | \[0\].type | X | X | X | X |  | type of file system |
|  | \[0\].size | X | X | X | X |  | sizes in bytes |
|  | \[0\].used | X | X | X | X |  | used in bytes |
|  | \[0\].available | X | X | X | X |  | available in bytes |
|  | \[0\].use | X | X | X | X |  | used in % |
|  | \[0\].mount | X | X | X | X |  | mount point |
|  | \[0\].rw | X | X | X | X |  | Read/Write (false if read only) |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.fsSize().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    fs: '/dev/md2',
    type: 'ext4',
    size: 972577361920,
    used: 59142635520,
    available: 913434726400,
    use: 6.08,
    mount: '/',
    rw: true
  },
  {
    ...
  }
]
```

 |
| si.fsOpenFiles(cb) | {...} | X | X | X |  |  | count max/allocated file descriptors |
|  | max | X | X | X |  |  | count max |
|  | allocated | X | X | X |  |  | count allocated |
|  | available | X | X | X |  |  | count available |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.fsOpenFiles().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  max: 6566555,
  allocated: 1856,
  available: 0
}
```

 |
| si.fsStats(cb) | {...} | X |  | X |  |  | current transfer stats |
|  | rx | X |  | X |  |  | bytes read since startup |
|  | wx | X |  | X |  |  | bytes written since startup |
|  | tx | X |  | X |  |  | total bytes read + written since startup |
|  | rx\_sec | X |  | X |  |  | bytes read / second (\* see notes) |
|  | wx\_sec | X |  | X |  |  | bytes written / second (\* see notes) |
|  | tx\_sec | X |  | X |  |  | total bytes reads + written / second |
|  | ms | X |  | X |  |  | interval length (for per second values) |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
setInterval(<span><span>function</span>(<span></span>) </span>{
  si.fsStats().then(<span><span>data</span> =&gt;</span> {
    <span>console</span>.log(data);
  })
}, <span>1000</span>)
```

```
{                             // first call
  rx: 14015849472,
  wx: 15316003328,
  tx: 29331852800,
  rx_sec: null,
  wx_sec: null,
  tx_sec: null,
  ms: 0
}
{                             // second call
  rx: 14015849472,
  wx: 15316007424,
  tx: 29331856896,
  rx_sec: 0,
  wx_sec: 4083.748753738784,
  tx_sec: 4083.748753738784,
  ms: 1003
}...
```

 |

#### Getting correct stats values

In disksIO() and fsStats() the results / sec. values (rx\_sec, IOPS, ...) are calculated correctly beginning with the **second** call of the function. It is determined by calculating the difference of transferred bytes / IOs divided by the time between two calls of the function.

The first time you are calling one of this functions, you will get \-1 for transfer rates. The second time, you should then get statistics based on the time between the two calls ...

So basically, if you e.g. need a values for filesystem stats stats every second, your code should look like this:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);

setInterval(<span><span>function</span>(<span></span>) </span>{
    si.fsStats().then(<span><span>data</span> =&gt;</span> {
        <span>console</span>.log(data);
    })
}, <span>1000</span>)
```

Beginning with the second call, you get file system transfer values per second.
