## Getting correct stats values

In fsStats(), disksIO(), currentLoad() and networkStats() the results / sec. values (rx\_sec, IOPS, ...) are calculated correctly beginning with the **second** call of the function. It is determined by calculating the difference of transferred bytes / IOs divided by the time between two calls of the function.

The first time you are calling one of this functions, you will get null for transfer rates. The second time, you should then get statistics based on the time between the two calls ...

So basically, if you e.g. need a values for network stats every second, your code should look like this:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);

setInterval(<span><span>function</span>(<span></span>) </span>{
    si.networkStats().then(<span><span>data</span> =&gt;</span> {
        <span>console</span>.log(data);
    })
}, <span>1000</span>)
```

Beginning with the second call, you get network transfer values per second.

## Observe System Parameters

systeminformation now allows you to easily observe system parameters: First you define a result object of system parameters you want to observe (see also decription of the [si.get() function here](https://systeminformation.io/general.html)):

Then you just call an si.observe() function with three parameters: your result object, the polling interval (in milliseconds) and a callback function. systeminformation will now observe the result object. Every time the result changes, your callback function is called. This callback function also gets the current value the observed system parameters object.

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.observe(valueObject,interval,cb) | \- | X | X | X | X | X | Observe the defined value object,  
call callback on changes: |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);

<span>// define all values, you want to get back</span>
valueObject = {
  <span>battery</span>: <span>'acconnected'</span>
}

<span><span>function</span> <span>usersCallback</span>(<span>data</span>) </span>{
  <span>console</span>.log(<span>'Power usage now: '</span> + (data.battery.acconnected ? <span>'AC'</span> : <span>'battery'</span>));
}

<span>// now define the observer function</span>
<span>let</span> observer = si.observe(valueObject, <span>1000</span>, usersCallback);

<span>// In this example we stop our observer function after 30 seconds</span>
setTimeout(<span><span>()</span> =&gt;</span> {
  clearInterval(observer)
}, <span>30000</span>);
```

 |

The key names of the valueObject must be exactly the same as the representing function in systeminformation.
