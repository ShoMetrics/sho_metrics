In this section you will learn how to get detailed information about available wifi networks, interfaces and connections:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Wifi Networks

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.wifiNetworks(cb) | \[{...}\] | X | X | (X) | X | X | array of available wifi networks  
since macOS Sonoma 14.4 not available |
|  | \[0\].ssid | X |  | (X) | X |  | Wifi network SSID |
|  | \[0\].bssid | X |  | (X) | X |  | BSSID (mac) |
|  | \[0\].mode | X |  |  |  |  | mode |
|  | \[0\].channel | X |  | (X) | X |  | channel |
|  | \[0\].frequency | X |  | (X) | X |  | frequency in MHz |
|  | \[0\].signalLevel | X |  | (X) | X |  | signal level in dB |
|  | \[0\].quality | X |  | (X) | X |  | quality in % |
|  | \[0\].security | X |  | (X) | X |  | array e.g. WPA, WPA-2 |
|  | \[0\].wpaFlags | X |  | (X) | X |  | array of WPA flags |
|  | \[0\].rsnFlags | X |  |  |  |  | array of RDN flags |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.wifiNetworks().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    ssid: 'INTERNAL-WIFI',
    bssid: 'ab:01:14:4f:d3:82',
    mode: '',
    channel: 44,
    frequency: 5220,
    signalLevel: -68,
    quality: 64,
    security: [ 'WPA', 'WPA2' ],
    wpaFlags: [ 'PSK/TKIP/TKIP', 'PSK/AES/TKIP' ],
    rsnFlags: []
  },
  {
    ssid: 'FREE Wifi',
    bssid: 'aa:14:e5:16:97:f3',
    mode: '',
    channel: 44,
    frequency: 5220,
    signalLevel: -50,
    quality: 100,
    security: [ 'WPA', 'WPA2' ],
    wpaFlags: [ 'PSK/TKIP/TKIP', 'PSK/AES/TKIP' ],
    rsnFlags: []
  },
  ...
]
```

 |

## Wifi Interfaces

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.wifiInterfaces(cb) | \[{...}\] | X |  | X | X |  | array of detected wifi interfaces |
|  | \[0\].id | X |  | X | X |  | Wifi ID |
|  | \[0\].iface | X |  | X | X |  | interface |
|  | \[0\].model | X |  | X | X |  | model |
|  | \[0\].vendor | X |  | X | X |  | vendor |
|  | \[0\].mac | X |  | X | X |  | interface MAC |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.wifiInterfaces().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    id: 'Wi-Fi',
    iface: 'en0',
    model: 'AirPort',
    vendor: '',
    mac: 'a0:b1:c2:d3:e4:f5'
  },
  ...
]
```

 |

## Wifi Connections

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.wifiConnections(cb) | \[{...}\] | X |  | X | X |  | array of active wifi connections |
|  | \[0\].id | X |  | X | X |  | Wifi ID |
|  | \[0\].iface | X |  | X | X |  | interface |
|  | \[0\].model | X |  | X | X |  | model |
|  | \[0\].ssid | X |  | X | X |  | Wifi network SSID |
|  | \[0\].bssid | X |  | (X) | X |  | BSSID (mac) - macOS only on older os versions |
|  | \[0\].channel | X |  | X | X |  | channel |
|  | \[0\].frequency | X |  | X | X |  | frequency |
|  | \[0\].type | X |  | X | X |  | WiFi type |
|  | \[0\].security | X |  | X | X |  | WiFi security |
|  | \[0\].signalLevel | X |  | X | X |  | signal level in dB |
|  | \[0\].quality | X |  | X | X |  | signal level quality in % |
|  | \[0\].txRate | X |  | X | X |  | transfer rate Mbit/s |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.wifiConnections().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    id: 'Wi-Fi',
    iface: 'en0',
    name: 'AirPort',
    model: 'AirPort',
    ssid: 'my-own-internet',
    bssid: '01:23:45:67:89:0a',  // no longer supported on newer macOS versions
    channel: 36,
    frequency: 5180,
    type: '802.11',
    security: 'wpa2-psk',
    signalLevel: 46,
    txRate: '405'
  },
  ...
]
```

 |
