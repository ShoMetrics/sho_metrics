In this section you will learn how to get information about detected audio devices or interfaces. Results might differ on different platforms as not everything is available/detectable on each platform:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Detected Audio Devices

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.audio(cb) | \[{...}\] | X |  | X | X |  | audio informatiom |
|  | \[0\].id | X |  | X | X |  | internal ID |
|  | \[0\].name | X |  | X | X |  | audio name |
|  | \[0\].manufacturer | X |  | X | X |  | manufacturer |
|  | \[0\].revision | X |  |  |  |  | revision |
|  | \[0\].driver | X |  |  |  |  | driver |
|  | \[0\].default |  |  | X |  |  | is default |
|  | \[0\].channel | X |  | X |  |  | channel e.g. Build-In, HDMI, USB, ... |
|  | \[0\].type | X |  | X | X |  | type e.g. Speaker |
|  | \[0\].in |  |  | X |  |  | is input channel |
|  | \[0\].out |  |  | X |  |  | is output channel |
|  | \[0\].status | X |  | X |  |  | status |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.audio().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    id: 0,
    name: 'MacBook Microphone',
    manufacturer: 'Apple Inc.',
    revision: null,
    driver: null,
    default: true,
    channel: 'Built-In',
    type: 'Microphone',
    in: true,
    out: false,
    status: 'online'
  },
  {
    id: 1,
    name: 'MacBook Speaker',
    manufacturer: 'Apple Inc.',
    revision: null,
    driver: null,
    default: true,
    channel: 'Built-In',
    type: 'Speaker',
    in: false,
    out: true,
    status: 'online'
  }
]
```

 |
