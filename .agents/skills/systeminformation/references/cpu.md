In this section you will learn how to get CPU data including current speed and temperature:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## CPU Data

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.cpu(cb) | {...} | X | X | X | X |  | CPU information object |
|  | manufacturer | X | X | X | X |  | e.g. 'Intel(R)' |
|  | brand | X | X | X | X |  | e.g. 'Core(TM)2 Duo' |
|  | speed | X | X | X | X |  | in GHz e.g. 3.4 |
|  | speedMin | X |  | X | X |  | in GHz e.g. 0.8 |
|  | speedMax | X | X | X | X |  | in GHz e.g. 3.9 |
|  | governor | X |  |  |  |  | e.g. 'powersave' |
|  | cores | X | X | X | X |  | \# cores |
|  | physicalCores | X | X | X | X |  | \# physical cores |
|  | performanceCores | X |  | X |  |  | \# performance cores |
|  | efficiencyCores | X |  | X |  |  | \# efficiency cores |
|  | processors | X | X | X | X |  | \# processors |
|  | socket | X | X |  | X |  | socket type e.g. "LGA1356" |
|  | vendor | X | X | X | X |  | vendor ID |
|  | family | X | X | X | X |  | processor family |
|  | model | X | X | X | X |  | processor model |
|  | stepping | X | X | X | X |  | processor stepping |
|  | revision | X |  | X | X |  | revision |
|  | voltage |  | X |  |  |  | voltage |
|  | flags | X | X | X | X |  | CPU flags |
|  | virtualization | X | X | X | X |  | supports virtualization |
|  | cache | X | X | X | X |  | cache in bytes (object) |
|  | cache.l1d | X | X | X | X |  | L1D (data) size in bytes |
|  | cache.l1i | X | X | X | X |  | L1I (instruction) size in bytes |
|  | cache.l2 | X | X | X | X |  | L2 size in bytes |
|  | cache.l3 | X | X | X | X |  | L3 size in bytes |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.cpu().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
    manufacturer: 'Intel®',
    brand: 'Core™ i9-9900',
    vendor: 'GenuineIntel',
    family: '6',
    model: '158',
    stepping: '13',
    revision: '',
    voltage: '',
    speed: 3.1,
    speedMin: 0.8,
    speedMax: 5,
    governor: 'powersave',
    cores: 16,
    physicalCores: 8,
    processors: 1,
    socket: 'LGA1151',
    flags: 'fpu vme de pse ...',
    virtualization: true,
    cache: { l1d: 262144, l1i: 262144, l2: 2097152, l3: 16777216 }
}
```

 |
| si.cpuFlags(cb) | : string | X | X | X | X |  | CPU flags |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.cpuFlags().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge
```

 |
| si.cpuCache(cb) | {...} | X | X | X | X |  | CPU cache sizes object |
|  | l1d | X | X | X | X |  | L1D size in bytes |
|  | l1i | X | X | X | X |  | L1I size in bytes |
|  | l2 | X | X | X | X |  | L2 size in bytes |
|  | l3 | X | X | X | X |  | L3 size in bytes |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.cpuCache().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{ l1d: 262144, l1i: 262144, l2: 2097152, l3: 16777216 }
```

 |
| si.cpuCurrentSpeed(cb) | {...} | X | X | X | X | X | current CPU speed (GHz) object |
|  | avg | X | X | X | X | X | avg CPU speed (all cores) |
|  | min | X | X | X | X | X | min CPU speed (all cores) |
|  | max | X | X | X | X | X | max CPU speed (all cores) |
|  | cores | X | X | X | X | X | CPU speed per core (array) |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.cpuCurrentSpeed().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  min: 0.86,
  max: 1.77,
  avg: 1.49,
  cores: [
    1.59, 1.71, 1.62, 1.57,
    1.66, 1.77, 1.74, 1.75,
    1.49, 1.51, 1.52, 1.59,
    1.56, 1.03, 0.86, 0.86
  ]
}
```

 |
| si.cpuTemperature(cb) | {...} | X | X | X\* | X |  | CPU temperature in Celsius  
(if supported) |
|  | main | X | X | X | X |  | main temperature (avg) |
|  | cores | X | X | X | X |  | array of temperatures |
|  | max | X | X | X | X |  | max temperature |
|  | socket | X |  |  |  |  | array socket temperatures |
|  | chipset | X |  |  |  |  | chipset temperature |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.cpuTemperature().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  main: 34,
  cores: [
    34, 35, 33, 32,
    37, 32, 35, 33
  ],
  max: 37,
  socket: [ 16.8, 27.8 ],
  chipset: 49
}
```

 |

## Known issues

#### macOS - Temperature

To be able to measure temperature on macOS I created twu little additional packages. Due to some difficulties in NPM with optionalDependencies I unfortunately was getting unexpected warnings on other platforms. So I decided to drop this optional dependency for macOS - so by default, you will not get correct values.

But if you need to detect macOS temperature just run the following additional installation command. Wether you have Intel or Apple Silicon machines, install one of the following packages:

```
$ npm install osx-temperature-sensor      # deprecated - for intel based machines
```

```
$ npm install macos-temperature-sensor    # for apple silicon machines
```

systeminformation will then detect this additional library and return the temperature when calling systeminformations standard function cpuTemperature()

#### Windows Temperature

get-WmiObject - which is used to determine battery sometimes needs to be run with admin privileges. So if you do not get any values, try to run it again with according privileges. If you still do not get any values, your system might not support this feature.
