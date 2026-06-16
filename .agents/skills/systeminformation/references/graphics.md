In this section you will learn how to get information about installed graphics conrollers and connected displays:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Graphics Controllers, Displays

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.graphics(cb) | {...} | X |  | X | X |  | arrays of graphics controllers and displays |
|  | controllers\[\] | X |  | X | X |  | graphics controllers array |
|  | ...\[0\].vendor | X |  | X | X |  | Chip manufacturer e.g. NVIDIA |
|  | ...\[0\].subVendor | X |  |  |  |  | Sub-Vendor e.g. Gigabyte |
|  | ...\[0\].model | X |  | X | X |  | graphics controller model |
|  | ...\[0\].bus | X |  | X | X |  | on which bus (e.g. PCIe) |
|  | ...\[0\].vram | X |  | X | X |  | VRAM size (in MB) |
|  | ...\[0\].vramDynamic | X |  | X | X |  | true if dynamically allocated ram |
|  | ...\[0\].deviceId |  |  | X |  |  | (macOS only) - device ID |
|  | ...\[0\].vendorId |  |  | X |  |  | (macOS only) - vendor ID |
|  | ...\[0\].external |  |  | X |  |  | (macOS only) - is external GPU |
|  | ...\[0\].cores |  |  | X |  |  | (Apple silicon only) - GPU cores |
|  | ...\[0\].metalVersion |  |  | X |  |  | (macOS only) - Metal Version |
|  | ...\[0\].subDeviceId | X |  |  | X |  | (optional nvidia-smi) - sub device ID |
|  | ...\[0\].driverVersion | X |  |  | X |  | (optional nvidia-smi) - driver version |
|  | ...\[0\].name | X |  |  | X |  | (optional nvidia-smi) - name |
|  | ...\[0\].pciBus | X |  |  | X |  | (optional nvidia-smi) - PCI bus ID |
|  | ...\[0\].fanSpeed | X |  |  | X |  | (optional nvidia-smi) - fan speed |
|  | ...\[0\].memoryTotal | X |  |  | X |  | (optional nvidia-smi) - memory total |
|  | ...\[0\].memoryUsed | X |  |  | X |  | (optional nvidia-smi) - memory used |
|  | ...\[0\].memoryFree | X |  |  | X |  | (optional nvidia-smi) - memory free |
|  | ...\[0\].utilizationGpu | X |  |  | X |  | (optional nvidia-smi) - utilization GPU |
|  | ...\[0\].utilizationMemory | X |  |  | X |  | (optional nvidia-smi) - utilization memory |
|  | ...\[0\].temperatureGpu | X |  |  | X |  | (optional nvidia-smi) - temperature GPU |
|  | ...\[0\].temperatureMemory | X |  |  | X |  | (optional nvidia-smi) - temperature memory |
|  | ...\[0\].powerDraw | X |  |  | X |  | (optional nvidia-smi) - power draw |
|  | ...\[0\].powerLimit | X |  |  | X |  | (optional nvidia-smi) - power limit |
|  | ...\[0\].clockCore | X |  |  | X |  | (optional nvidia-smi) - clock core |
|  | ...\[0\].clockMemory | X |  |  | X |  | (optional nvidia-smi) - clock memory |
|  | displays\[\] | X |  | X | X |  | monitor/display array |
|  | ...\[0\].vendor |  |  |  | X |  | monitor/display vendor |
|  | ...\[0\].vendorId |  |  | X |  |  | (macOS only) - monitor/display vendor ID |
|  | ...\[0\].deviceName |  |  |  | X |  | e.g. \\\\.\\DISPLAY1 |
|  | ...\[0\].model | X |  | X | X |  | monitor/display model |
|  | ...\[0\].productionYear |  |  | X |  |  | (macOS only) - production year |
|  | ...\[0\].serial |  |  | X |  |  | (macOS only) - serial number |
|  | ...\[0\].displayId |  |  | X |  |  | (macOS only) - display ID |
|  | ...\[0\].main | X |  | X | X |  | true if main monitor |
|  | ...\[0\].builtin | X |  | X |  |  | true if built-in monitor |
|  | ...\[0\].connection | X |  | X | X |  | e.g. DisplayPort, HDMI |
|  | ...\[0\].sizeX | X |  |  | X |  | size in mm horizontal |
|  | ...\[0\].sizeY | X |  |  | X |  | size in mm vertical |
|  | ...\[0\].pixelDepth | X |  | X | X |  | color depth in bits |
|  | ...\[0\].resolutionX | X |  | X | X |  | pixel horizontal |
|  | ...\[0\].resolutionY | X |  | X | X |  | pixel vertical |
|  | ...\[0\].currentResX | X |  | X | X |  | current pixel horizontal |
|  | ...\[0\].currentResY | X |  | X | X |  | current pixel vertical |
|  | ...\[0\].positionX |  |  |  | X |  | screen position X |
|  | ...\[0\].positionY |  |  |  | X |  | screen position Y |
|  | ...\[0\].currentRefreshRate | X |  |  | X |  | current screen refresh rate |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.graphics().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  controllers: [
    {
      vendor: 'Intel Corporation',
      subVendor: 'ASRock Incorporation',
      model: 'AlderLake-S GT1',
      bus: 'Onboard',
      busAddress: '00:02.0',
      vram: 256,
      vramDynamic: false,
      pciID: ''
    }
  ],
  displays: [
    {
      vendor: '',
      model: 'Color LCD',
      main: true,
      builtin: false,
      connection: 'Internal',
      sizeX: null,
      sizeY: null,
      pixelDepth: 24,
      resolutionX: 2560,
      resolutionY: 1600,
      currentResX: 2560,
      currentResY: 1600,
      positionX: 0,
      positionY: 0,
      currentRefreshRate: null
    }
  ]
}
```

 |
