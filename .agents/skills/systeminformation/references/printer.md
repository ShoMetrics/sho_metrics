In this section you will learn how to get information about detected printers:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Detected Printers

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.printer(cb) | \[{...}\] | X |  | X | X |  | printer informatiom |
|  | \[0\].id | X |  | X | X |  | internal ID |
|  | \[0\].name | X |  | X | X |  | printer name |
|  | \[0\].model | X |  | X | X |  | printer model |
|  | \[0\].uri | X |  | X |  |  | printer URI |
|  | \[0\].uuid | X |  |  |  |  | printer UUID |
|  | \[0\].status | X |  | X | X |  | printer status (e.g. idle) |
|  | \[0\].local | X |  | X | X |  | is local printer |
|  | \[0\].default |  |  | X | X |  | is default printer |
|  | \[0\].shared | X |  | X | X |  | is shared printer |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.printer().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    id: 0,
    name: 'HP Color LaserJet CP2025 PS',
    model: 'HP_Color_LaserJet_CP2025',
    uri: 'http://192.168.1.1:631/printers/HP_Color_LaserJet_CP2025',
    uuid: null,
    local: true,
    status: 'idle',
    default: false,
    shared: false
  },
  {
    id: 1,
    name: 'HP Color LaserJet CP2025 PS',
    model: 'null',
    uri: 'file:///dev/null',
    uuid: null,
    local: true,
    status: 'idle',
    default: true,
    shared: true
  }
]
```

 |
