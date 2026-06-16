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

Processes and Services

In this section you will learn how to get information about current load, running processes and installed services:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Current Load, Processes, Services

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.currentLoad(cb) | {...} | X |  | X | X | X | CPU-Load |
|  | avgLoad | X |  | X |  | X | average load |
|  | currentLoad | X |  | X | X | X | CPU load in % |
|  | currentLoadUser | X |  | X | X | X | CPU load user in % |
|  | currentLoadSystem | X |  | X | X | X | CPU load system in % |
|  | currentLoadNice | X |  | X | X | X | CPU load nice in % |
|  | currentLoadIdle | X |  | X | X | X | CPU load idle in % |
|  | currentLoadIrq | X |  | X | X | X | CPU load hardware interrupts in % |
|  | currentLoadSteal | X |  |  |  |  | Time stolen by other OS running in VMs in % |
|  | currentLoadGuest | X |  |  |  |  | Time spent for running virtual CPU in % |
|  | rawCurrentLoad... | X |  | X | X | X | CPU load raw values (ticks) |
|  | cpus\[\] | X |  | X | X | X | current loads per CPU in % + raw ticks |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.currentLoad().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  avgLoad: 0.23,
  currentLoad: 4.326328800988875,
  currentLoadUser: 2.595797280593325,
  currentLoadSystem: 1.73053152039555,
  currentLoadNice: 0,
  currentLoadIdle: 95.67367119901112,
  currentLoadIrq: 0,
  rawCurrentLoad: 350,
  rawCurrentLoadUser: 210,
  rawCurrentLoadSystem: 140,
  rawCurrentLoadNice: 0,
  rawCurrentLoadIdle: 7740,
  rawCurrentLoadIrq: 0,
  rawCurrentLoadSteal: 0,
  rawCurrentLoadGuest: 0,
  cpus: [
    {
      load: 13.725490196078432,
      loadUser: 7.8431372549019605,
      loadSystem: 5.88235294117647,
      loadNice: 0,
      loadIdle: 86.27450980392157,
      loadIrq: 0,
      loadSteal: 0,
      loadGuest: 0,
      rawLoad: 140,
      rawLoadUser: 80,
      rawLoadSystem: 60,
      rawLoadNice: 0,
      rawLoadIdle: 880,
      rawLoadIrq: 0
      rawLoadSteal: 0
      rawLoadGuest: 0
    },
    ...
  ]
}
```

 |
| si.fullLoad(cb) | : integer | X |  | X | X |  | CPU full load since bootup in % |
| si.processes(cb) | {...} | X | X | X | X | X | \# running processes |
|  | all | X | X | X | X | X | \# of all processes |
|  | running | X | X | X |  | X | \# of all processes running |
|  | blocked | X | X | X |  | X | \# of all processes blocked |
|  | sleeping | X | X | X |  | X | \# of all processes sleeping |
|  | unknown |  |  |  | X |  | \# of all processes unknown status |
|  | list\[\] | X | X | X | X | X | list of all processes incl. details |
|  | ...\[0\].pid | X | X | X | X | X | process PID |
|  | ...\[0\].parentPid | X | X | X | X | X | parent process PID |
|  | ...\[0\].name | X | X | X | X | X | process name |
|  | ...\[0\].cpu | X | X | X | X | X | process % CPU usage |
|  | ...\[0\].cpuu | X | X |  | X |  | process % CPU usage (user) |
|  | ...\[0\].cpus | X | X |  | X |  | process % CPU usage (system) |
|  | ...\[0\].mem | X | X | X | X | X | process memory % |
|  | ...\[0\].priority | X | X | X | X | X | process priority |
|  | ...\[0\].memVsz | X | X | X | X | X | process virtual memory size |
|  | ...\[0\].memRss | X | X | X | X | X | process mem resident set size |
|  | ...\[0\].nice | X | X | X |  | X | process nice value |
|  | ...\[0\].started | X | X | X | X | X | process start time |
|  | ...\[0\].state | X | X | X | X | X | process state (e.g. sleeping) |
|  | ...\[0\].tty | X | X | X |  | X | tty from which process was started |
|  | ...\[0\].user | X | X | X |  | X | user who started process |
|  | ...\[0\].command | X | X | X | X | X | process starting command |
|  | ...\[0\].params | X | X | X |  | X | process params |
|  | ...\[0\].path | X | X | X | X | X | process path |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.processes().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  all: 258,
  running: 1,
  blocked: 0,
  sleeping: 157,
  unknown: 0,
  list: [
    {
      pid: 1,
      parentPid: 0,
      name: 'init',
      cpu: 0.04504576931569955,
      cpuu: 0.04084113255431208,
      cpus: 0.00420463676138747,
      mem: 0,
      priority: 19,
      memVsz: 166144,
      memRss: 10684,
      nice: 0,
      started: '2020-02-08 10:18:15',
      state: 'sleeping',
      tty: '',
      user: 'root',
      command: 'init',
      params: '',
      path: '/sbin'
    },
    ...
  ]
}
```

 |
| si.processLoad('nginx, ssl',cb) | \[{...}\] | X | X | X | X |  | detailed information about given processes  
pass comma separated list or  
'\*' for all processes |
|  | \[0\].proc | X | X | X | X |  | process name |
|  | \[0\].pid | X | X | X | X |  | PID |
|  | \[0\].pids | X | X | X | X |  | additional pids |
|  | \[0\].cpu | X | X | X | X |  | process % CPU |
|  | \[0\].mem | X | X | X | X |  | process % MEM |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.processLoad(<span>'nginx, postgres'</span>).then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
{
  proc: 'nginx',
  pid: 11267,
  pids: [
    11251, 11252, 11253,
    11254, 11255, 11256,
    11257, 11258, 11259,
    11260, 11261, 11262,
    11263, 11264, 11265,
    11266, 11267
  ],
  cpu: 0.01,
  mem: 0
},
  {
    proc: 'postgres',
    pid: 1435,
    pids: [
      1435, 1513, 1545,
      1546, 1547, 1548,
      1549, 1550
    ],
    cpu: 0.01,
    mem: 0
  },
]
```

 |
| si.services('mysql, apache2', cb) | \[{...}\] | X | X | X | X |  | pass comma separated string of services  
pass "\*" for ALL services (linux/win only) |
|  | \[0\].name | X | X | X | X |  | name of service |
|  | \[0\].running | X | X | X | X |  | true / false |
|  | \[0\].startmode |  |  |  | X |  | manual, automatic, ... |
|  | \[0\].pids | X | X | X |  |  | pids |
|  | \[0\].cpu | X | X | X |  |  | process % CPU |
|  | \[0\].mem | X | X | X |  |  | process % MEM |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.services(<span>'mysql, postgres'</span>).then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    name: 'mysql',
    running: true,
    startmode: '',
    pids: [ 152 ],
    cpu: 0.3,
    mem: 0
  },
  {
    name: 'postgres',
    running: true,
    startmode: '',
    pids: [ 1087, 1873 ],
    cpu: 0,
    mem: 0
  },
]
```

 |

#### Getting correct stats values

In currentLoad() the results are calculated correctly beginning with the **second** call of the function. It is determined by calculating the difference of cpu ticks between two calls of the function.

The first time you are calling one of this functions, you will get the load since cpu uptime. The second time, you should then get statistics based on cpu ticks between the two calls ...

So basically, your code should look like this:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);

              setInterval(<span><span>function</span>(<span></span>) </span>{
                  si.currentLoad().then(<span><span>data</span> =&gt;</span> {
                      <span>console</span>.log(data);
                  })
              }, <span>1000</span>)
```

Beginning with the second call, you get precise load values between the two calls.
