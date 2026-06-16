In this section you will learn how to get general systeminformation data. We will also cover the "get" and "get-all" functions to get partial or all data with one single call.

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Lib-Version and Time/Timezone

The first two functions just give back systeminformation library version number and time/timezone information of your machine. These are the only two functions not returning a promise (so they are not async functions):

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.version() | : string | X | X | X | X | X | lib version (no callback/promise) |
| si.time() | {...} | X | X | X | X | X | object (no callback/promise) with: |
|  | current | X | X | X | X | X | local (server) time |
|  | uptime | X | X | X | X | X | uptime in number of seconds |
|  | timezone | X | X | X | X | X | e.g. GMT+0200 |
|  | timezoneName | X | X | X | X | X | e.g. CEST |

Keep in mind, that there is another function si.versions() that will return versions of other system libraries and software packages

## Get Defined Result Object

Normally you would call each of the functions (where you want to get detailed system information) seperately. The docs pages contain a full reference (with examples) for each available function. But there is also another really handy way to get a self-defined result object in one single call:

The si.get() function is an alternative, where you can obtain several system information data in one call. You can define a json object which represents the data structure you are expecting and the si.get() call will then return all of the requested data in a single result object

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.get(valueObject,cb) | {...} | X | X | X | X | X | get partial data at once  
Specify return object for all  
values that should be returned: |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);

<span>// define all values, you want to get back</span>
valueObject = {
  <span>cpu</span>: <span>'*'</span>,
  <span>osInfo</span>: <span>'platform, release'</span>,
  <span>system</span>: <span>'model, manufacturer'</span>
}

si.get(valueObject).then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  cpu: {
    manufacturer: 'Intel®',
    brand: 'Core™ i7-8569U',
    vendor: 'GenuineIntel',
    family: '6',
    model: '142',
    stepping: '10',
    revision: '',
    voltage: '',
    speed: 2.8,
    speedMin: 2.8,
    speedMax: 2.80,
    governor: '',
    cores: 8,
    physicalCores: 4,
    processors: 1,
    socket: '',
    flags: 'fpu vme de ...',
    virtualization: true,
    cache: { l1d: 32768, l1i: 32768, l2: 262144, l3: 8388608 }
  },
  osInfo: {
    platform: 'darwin',
    release: '10.15.4'
  },
  system: {
    model: 'MacBookPro15,2',
    manufacturer: 'Apple Inc.'
  }
}
```

 |

The key names of the valueObject must be exactly the same as the representing function within systeminformation.

### Providing parameters to the get() function

Now you can also provide parameters to get() functions (where needed). Just pass the parameters in parentheses right after the wanted keys: have a look at the following example:

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.get(valueObject,cb) | {...} | X | X | X | X | X | example with parameters:  
value in paretheses goes as parameter  
to the given function: |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);

<span>// define all values, you want to get back</span>
<span>// here the value in paretheses goes as a parameter</span>
<span>// to the processLoad function</span>

valueObject = {
  <span>processLoad</span>: <span>'(postgres) pids, cpu'</span>
}
si.get(valueObject).then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  processLoad: {
  pids: [
    640, 643, 654,
    655, 656, 657,
    658, 659
  ],
    cpu: 0.63
  }
}
```

 |

### Filter results in get() function

You can get even further: if the desired result object is an array, you can filter the object to get only the wanted array item: have a look at the following example:

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.get(valueObject,cb) | {...} | X | X | X | X | X | example with filter:  
add a pipe symbol with the filter definition  
to the given function: |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);

<span>// define all values, you want to get back</span>
<span>// here after the keys we define a filter (pipe symbol after the keys)</span>
<span>// to get only one specific item of the result array</span>

valueObject = {
  <span>networkInterfaces</span>: <span>'iface, ip4 | iface:en0'</span>
}
si.get(valueObject).then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  networkInterfaces: [
    {
      iface: 'en0',
      ip4: '192.168.0.10'
    }
  ]
}
              
```

 |

## Get All At Once

The following three functions si.getStaticData(), si.getDynamicData() and si.getAllData() will return most of the available data in a single result object:

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.getStaticData(cb) | {...} | X | X | X | X | X | all static data at once |
| si.getDynamicData(srv,iface,cb) | {...} | X | X | X | X | X | all dynamic data at once  
Specify services and interfaces to monitor  
Defaults to first external network interface  
Pass "\*" for ALL services (linux/win only)  
Pass "\*" for ALL network interfaces |
| si.getAllData(srv,iface,cb) | {...} | X | X | X | X | X | all data at once  
Specify services and interfaces to monitor  
Defaults to first external network interface  
Pass "\*" for ALL services (linux/win only)  
Pass "\*" for ALL network interfaces |

**Static data** is all hardware related (or more or less constant) data like system, baseboard, bios, OS, versions, cpu, network interfces, memory and disk layout

**Dynamic data** will return user, cpu-speed, load, processes, services, temperature, file system, network and disk stats, ...

As not all funtions are supported in each operating system the result object might be different in each OS.

**ATTENTION**: Use this only if you really need ALL information. Especially on Windows this can take really long (up to 20 seconds) because the underlying get-WmiObject command is very slow when using it the first time.
