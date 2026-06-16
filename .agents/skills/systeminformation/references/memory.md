In this section you will learn how to get overall memory information (usage by OS) and memory module layout:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## System Memory and Memory Layout

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.mem(cb) | {...} | X | X | X | X | X | Memory information (object) |
|  | total | X | X | X | X | X | total memory in bytes |
|  | free | X | X | X | X | X | not used in bytes |
|  | used | X | X | X | X | X | used (incl. buffers/cache) |
|  | active | X | X | X | X | X | used actively (excl. buffers/cache) |
|  | buffcache | X | X | X |  | X | used by buffers+cache |
|  | buffers | X |  |  |  |  | used by buffers |
|  | cached | X |  |  |  |  | used by cache |
|  | slab | X |  |  |  |  | used by slab |
|  | reclaimable | X |  | X |  |  | reclaimable |
|  | available | X | X | X | X | X | potentially available (total - active) |
|  | swaptotal | X | X | X | X | X |  |
|  | swapused | X | X | X | X | X |  |
|  | swapfree | X | X | X | X | X |  |
|  | writeback | X |  |  |  |  |  |
|  | dirty | X |  |  |  |  |  |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.mem().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  total: 67092135936,
  free: 65769291776,
  used: 1322844160,
  active: 1032495104,
  available: 66059640832,
  buffers: 63213568,
  cached: 800124928,
  slab: 268804096,
  buffcache: 1132142592,
  swaptotal: 8589930496,
  swapused: 0,
  swapfree: 8589930496,
  writeback: 0,
  dirty: 8192
}
```

 |
| si.memLayout(cb) | \[{...}\] | X | X | X | X |  | Memory Layout (array of objects) |
|  | \[0\].size | X | X | X | X |  | size in bytes |
|  | \[0\].bank | X | X |  | X |  | memory bank |
|  | \[0\].type | X | X | X | X |  | memory type |
|  | \[0\].ecc | X | X | X | X |  | ECC memory |
|  | \[0\].clockSpeed | X | X | X | X |  | clock speed |
|  | \[0\].formFactor | X | X |  | X |  | form factor |
|  | \[0\].manufacturer | X | X | X | X |  | manufacturer |
|  | \[0\].partNum | X | X | X | X |  | part number |
|  | \[0\].serialNum | X | X | X | X |  | serial number |
|  | \[0\].voltageConfigured | X | X |  | X |  | voltage conf. |
|  | \[0\].voltageMin | X | X |  | X |  | voltage min |
|  | \[0\].voltageMax | X | X |  | X |  | voltage max |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.memLayout().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    size: 34359738368,
    bank: 'BANK 0',
    type: 'DDR4',
    ecc: false,
    clockSpeed: 2667,
    formFactor: 'SODIMM',
    manufacturer: '029E',
    partNum: 'CMSX64.....',
    serialNum: '00000000',
    voltageConfigured: 1.2,
    voltageMin: 1.2,
    voltageMax: 1.2
  },
  {
    size: 34359738368,
    bank: 'BANK 2',
    type: 'DDR4',
    ecc: false,
    clockSpeed: 2667,
    formFactor: 'SODIMM',
    manufacturer: '029E',
    partNum: 'CMSX64.....',
    serialNum: '00000000',
    voltageConfigured: 1.2,
    voltageMin: 1.2,
    voltageMax: 1.2
  }
]
```

 |
