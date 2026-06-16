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

Network

In this section you will learn how to get detailed information about network interfaces, network connections and statistics as well as some internet related information (latency, check availability of site):

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Network Interfaces, Network Stats, Network Connections

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.networkInterfaces(cb) | \[{...}\] | X | X | X | X | X | array of network interfaces (objects) |
|  | \[0\].iface | X | X | X | X | X | interface |
|  | \[0\].ifaceName | X | X | X | X | X | interface name (differs on Windows) |
|  | \[0\].default | X | X | X | X | X | true if this is the default interface |
|  | \[0\].ip4 | X | X | X | X | X | ip4 address |
|  | \[0\].ip4subnet | X | X | X | X | X | ip4 subnet mask |
|  | \[0\].ip6 | X | X | X | X | X | ip6 address |
|  | \[0\].ip6subnet | X | X | X | X | X | ip6 subnet mask |
|  | \[0\].mac | X | X | X | X | X | MAC address |
|  | \[0\].internal | X | X | X | X | X | true if internal interface |
|  | \[0\].virtual | X | X | X | X | X | true if virtual interface |
|  | \[0\].operstate | X |  | X | X |  | up / down |
|  | \[0\].type | X |  | X | X |  | wireless / wired |
|  | \[0\].duplex | X |  | X |  |  | duplex (full/half) |
|  | \[0\].mtu | X |  | X |  |  | MTU maximum transmission unit |
|  | \[0\].speed | X |  | X | X |  | Speed in Mbit / s |
|  | \[0\].dhcp | X |  | X | X |  | IP address obtained by DHCP |
|  | \[0\].dnsSuffix | X |  |  | X |  | DNS suffix |
|  | \[0\].ieee8021xAuth | X |  |  | X |  | IEEE 802.1x Auth |
|  | \[0\].ieee8021xState | X |  | X | X |  | IEEE 802.1x State |
|  | \[0\].carrierChanges | X |  |  |  |  | \# changes up/down |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.networkInterfaces().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    iface: 'lo0',
    ifaceName: 'lo0',
    default: false,
    ip4: '127.0.0.1',
    ip4subnet: '255.0.0.0',
    ip6: '::1',
    ip6subnet: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    mac: '',
    internal: true,
    virtual: false,
    operstate: 'down',
    type: 'wired',
    duplex: 'full',
    mtu: 16384,
    speed: null,
    dhcp: false,
    dnsSuffix: '',
    ieee8021xAuth: '',
    ieee8021xState: '',
    carrierChanges: 0
  },
  {
    iface: 'en0',
    ifaceName: 'en0',
    default: true,
    ip4: '192.168.0.27',
    ip4subnet: '255.255.255.0',
    ip6: 'fe80::134a:1e43:abc5:d413',
    ip6subnet: 'ffff:ffff:ffff:ffff::',
    mac: 'xx:xx:xx:xx:xx:xx',
    internal: false,
    virtual: false,
    operstate: 'up',
    type: 'wired',
    duplex: 'full',
    mtu: 1500,
    speed: 1000,
    dhcp: true,
    dnsSuffix: '',
    ieee8021xAuth: '',
    ieee8021xState: '',
    carrierChanges: 0
  }, ...
]
```

##### Get Default Interface only

  With the 'default' parameter this function returns only the default interface

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.networkInterfaces(<span>'default'</span>).then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  iface: 'en0',
  ifaceName: 'en0',
  default: true,
  ip4: '192.168.0.27',
  ip4subnet: '255.255.255.0',
  ip6: 'fe80::134a:1e43:abc5:d413',
  ip6subnet: 'ffff:ffff:ffff:ffff::',
  mac: 'xx:xx:xx:xx:xx:xx',
  internal: false,
  virtual: false,
  operstate: 'up',
  type: 'wired',
  duplex: 'full',
  mtu: 1500,
  speed: 1000,
  dhcp: true,
  dnsSuffix: '',
  ieee8021xAuth: '',
  ieee8021xState: '',
  carrierChanges: 0
}
```

 |
| si.networkInterfaceDefault(cb) | : string | X | X | X | X | X | get name of default network interface |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.networkInterfaceDefault().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
eth0
```

 |
| si.networkGatewayDefault(cb) | : string | X | X | X | X | X | get default network gateway |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.networkGatewayDefault().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
192.168.0.1
```

 |
| si.networkStats(iface,cb) | \[{...}\] | X | X | X | X |  | current network stats of given interfaces,  
iface list: comma separated,  
iface parameter is optional,  
defaults to first external network interface,  
pass '\*' for all interfaces |
|  | \[0\].iface | X | X | X | X |  | interface |
|  | \[0\].operstate | X | X | X | X |  | up / down |
|  | \[0\].rx\_bytes | X | X | X | X |  | received bytes overall |
|  | \[0\].rx\_dropped | X | X | X | X |  | received dropped overall |
|  | \[0\].rx\_errors | X | X | X | X |  | received errors overall |
|  | \[0\].tx\_bytes | X | X | X | X |  | transferred bytes overall |
|  | \[0\].tx\_dropped | X | X | X | X |  | transferred dropped overall |
|  | \[0\].tx\_errors | X | X | X | X |  | transferred errors overall |
|  | \[0\].rx\_sec | X | X | X | X |  | received bytes / second (\* see notes) |
|  | \[0\].tx\_sec | X | X | X | X |  | transferred bytes per second (\* see notes) |
|  | \[0\].ms | X | X | X | X |  | interval length (for per second values) |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
setInterval(<span><span>function</span>(<span></span>) </span>{
  si.networkStats().then(<span><span>data</span> =&gt;</span> {
    <span>console</span>.log(data);
  })
}, <span>1000</span>)
```

```
[
  {                                 // first call
    iface: 'en0',
    operstate: 'up',
    rx_bytes: 1752866207,
    rx_dropped: 0,
    rx_errors: 0,
    tx_bytes: 180934681,
    tx_dropped: 0,
    tx_errors: 0,
    rx_sec: null,
    tx_sec: null,
    ms: 0
  }
]
[
  {                                 // second call
    iface: 'en0',
    operstate: 'up',
    rx_bytes: 1752866822,
    rx_dropped: 0,
    rx_errors: 0,
    tx_bytes: 180939820,
    tx_dropped: 0,
    tx_errors: 0,
    rx_sec: 624.3654822335026,
    tx_sec: 5217.258883248731,
    ms: 985
  }
]...
```

 |
| si.networkConnections(cb) | \[{...}\] | X | X | X | X |  | current network network connections  
returns an array of all connections |
|  | \[0\].protocol | X | X | X | X |  | tcp or udp |
|  | \[0\].localAddress | X | X | X | X |  | local address |
|  | \[0\].localPort | X | X | X | X |  | local port |
|  | \[0\].peerAddress | X | X | X | X |  | peer address |
|  | \[0\].peerPort | X | X | X | X |  | peer port |
|  | \[0\].state | X | X | X | X |  | like ESTABLISHED, TIME\_WAIT, ... |
|  | \[0\].pid | X | X | X | X |  | process ID |
|  | \[0\].process | X | X | X |  |  | process name |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.networkConnections().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    protocol: 'tcp4',
    localAddress: '192.168.0.27',
    localPort: '55788',
    peerAddress: '163.128.xxx.xxx',
    peerPort: '443',
    state: 'CLOSE_WAIT',
    pid: 702,
    process: ''
  },
  {
    protocol: 'tcp4',
    localAddress: '192.168.0.27',
    localPort: '55761',
    peerAddress: '148.253.xxx.xxx',
    peerPort: '22',
    state: 'ESTABLISHED',
    pid: 7267,
    process: ''
  },
  ...
]
```

 |

## Site availability, Internet Latency

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.inetChecksite(url, cb) | {...} | X | X | X | X | X | response-time (ms) to fetch given URL |
|  | url | X | X | X | X | X | given url |
|  | ok | X | X | X | X | X | status code OK (2xx, 3xx) |
|  | status | X | X | X | X | X | status code |
|  | ms | X | X | X | X | X | response time in ms |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.inetChecksite(<span>'google.com'</span>).then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  url: 'google.com',
  ok: true,
  status: 301,
  ms: 82
}
```

 |
| si.inetLatency(host, cb) | : number | X | X | X | X | X | response-time (ms) to external resource  
host parameter is optional (default 8.8.8.8) |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.inetLatency().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
13.484
```

```
<span>// Example with given host IP address</span>
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.inetLatency(<span>'216.58.207.142'</span>).then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
11.291
```

 |

#### Getting correct stats values

In networkStats() the results / sec. values (rx\_sec, tx\_sec, ...) are calculated correctly beginning with the **second** call of the function. It is determined by calculating the difference of transferred bytes / IOs divided by the time between two calls of the function.

The first time you are calling one of this functions, you will get \-1 for transfer rates. The second time, you should then get statistics based on the time between the two calls ...

So basically, if you e.g. need a values for filesystem stats stats every second, your code should look like this:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);

setInterval(<span><span>function</span>(<span></span>) </span>{
    si.networkStats().then(<span><span>data</span> =&gt;</span> {
        <span>console</span>.log(data);
    })
}, <span>1000</span>)
```

Beginning with the second call, you get network transfer values per second.
