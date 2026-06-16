In this section you will learn how to get information about detected bluetooth devices. Results might differ on different platforms as not everything is available/detectable on each platform:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Detected Bluetooth Devices

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.bluetoothDevices(cb) | \[{...}\] | X |  | X | X |  | bluetooth device informatiom |
|  | \[0\].device |  |  |  | X |  | device name |
|  | \[0\].name | X |  | X | X |  | name |
|  | \[0\].macDevice | X |  | X |  |  | MAC address device |
|  | \[0\].macHost | X |  | X |  |  | MAC address host |
|  | \[0\].batteryPercent |  |  | X |  |  | battery level percent |
|  | \[0\].manufacturer |  |  | X | X |  | manufacturer |
|  | \[0\].type | X |  | X | X |  | type of device |
|  | \[0\].connected | X |  | X |  |  | connected |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.bluetoothDevices().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    device: 'Magic Mouse 2',
    name: 'My Maus',
    manufacturer: 'Broadcom (0x5, 0x240C)',
    macDevice: '10-XX-XX-XX-XX-XX',
    macHost: '20-XX-XX-XX-XX-XX',
    batteryPercent: '74%',
    type: 'Mouse',
    connected: true
  },
  {
    device: 'Magic Keyboard with Numeric Keypad',
    name: 'My Keyboard',
    manufacturer: 'Broadcom (0x5, 0x240C)',
    macDevice: '10-XX-XX-XX-XX-XX',
    macHost: '20-XX-XX-XX-XX-XX',
    batteryPercent: '75%',
    type: 'Keyboard',
    connected: true
  },
]
```

 |
