##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.usb().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    bus: 1,
    deviceId: 2,
    id: '8087:8001',
    name: '',
    type: 'Hub',
    removable: null,
    vendor: 'Intel Corp.',
    manufacturer: '',
    maxPower: '0mA',
    serialNumber: null
  },
  {
    bus: 1,
    deviceId: 1,
    id: '1d6b:0002',
    name: '2.0 root hub',
    type: 'Hub',
    removable: null,
    vendor: 'Linux Foundation',
    manufacturer: 'Linux 4.4.0-169-generic ehci_hcd',
    maxPower: '0mA',
    serialNumber: null
  },
  {
    bus: 2,
    deviceId: 4,
    id: '04f2:0402',
    name: 'Genius LuxeMate i200 Keyboard',
    type: 'Keyboard',
    removable: null,
    vendor: 'Chicony Electronics Co., Ltd',
    manufacturer: 'Chicony',
    maxPower: '100mA',
    serialNumber: null
  },
  {
    bus: 2,
    deviceId: 3,
    id: '093a:2510',
    name: 'Optical Mouse',
    type: 'Mouse',
    removable: null,
    vendor: 'Pixart Imaging, Inc.',
    manufacturer: 'PIXART',
    maxPower: '100mA',
    serialNumber: null }
]
```
