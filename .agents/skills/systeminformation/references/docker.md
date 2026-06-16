In this section you will learn how to get information about docker, images, containers, container stats and processes inside a docker container:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Container, Stats, Processes

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.dockerInfo(cb) | {...} | X | X | X | X | X | returns general docker info |
|  | id | X | X | X | X | X | Docker ID |
|  | containers | X | X | X | X | X | number of containers |
|  | containersRunning | X | X | X | X | X | number of running containers |
|  | containersPaused | X | X | X | X | X | number of paused containers |
|  | containersStopped | X | X | X | X | X | number of stopped containers |
|  | images | X | X | X | X | X | number of images |
|  | driver | X | X | X | X | X | driver (e.g. 'devicemapper', 'overlay2') |
|  | memoryLimit | X | X | X | X | X | has memory limit |
|  | SwapLimit | X | X | X | X | X | has swap limit |
|  | kernelMemory | X | X | X | X | X | has kernel memory |
|  | cpuCfsPeriod | X | X | X | X | X | has CpuCfsPeriod |
|  | cpuCfsQuota | X | X | X | X | X | has CpuCfsQuota |
|  | cpuShares | X | X | X | X | X | has CPUShares |
|  | cpuSet | X | X | X | X | X | has CPUShares |
|  | ipv4Forwarding | X | X | X | X | X | has IPv4Forwarding |
|  | bridgeNfIptables | X | X | X | X | X | has BridgeNfIptables |
|  | bridgeNfIp6tables | X | X | X | X | X | has BridgeNfIp6tables |
|  | debug | X | X | X | X | X | Debug on |
|  | nfd | X | X | X | X | X | named data networking forwarding daemon |
|  | oomKillDisable | X | X | X | X | X | out-of-memory kill disabled |
|  | ngoroutines | X | X | X | X | X | number NGoroutines |
|  | systemTime | X | X | X | X | X | docker SystemTime |
|  | loggingDriver | X | X | X | X | X | logging driver e.g. 'json-file' |
|  | cgroupDriver | X | X | X | X | X | cgroup driver e.g. 'cgroupfs' |
|  | nEventsListener | X | X | X | X | X | number NEventsListeners |
|  | kernelVersion | X | X | X | X | X | docker kernel version |
|  | operatingSystem | X | X | X | X | X | docker OS e.g. 'Docker for Mac' |
|  | osType | X | X | X | X | X | OSType e.g. 'linux' |
|  | architecture | X | X | X | X | X | architecture e.g. x86\_64 |
|  | ncpu | X | X | X | X | X | number of CPUs |
|  | memTotal | X | X | X | X | X | memory total |
|  | dockerRootDir | X | X | X | X | X | docker root directory |
|  | httpProxy | X | X | X | X | X | http proxy |
|  | httpsProxy | X | X | X | X | X | https proxy |
|  | noProxy | X | X | X | X | X | NoProxy |
|  | name | X | X | X | X | X | Name |
|  | labels | X | X | X | X | X | array of labels |
|  | experimentalBuild | X | X | X | X | X | is experimental build |
|  | serverVersion | X | X | X | X | X | server version |
|  | clusterStore | X | X | X | X | X | cluster store |
|  | clusterAdvertise | X | X | X | X | X | cluster advertise |
|  | defaultRuntime | X | X | X | X | X | default runtime e.g. 'runc' |
|  | liveRestoreEnabled | X | X | X | X | X | live store enabled |
|  | isolation | X | X | X | X | X | isolation |
|  | initBinary | X | X | X | X | X | init binary |
|  | productLicense | X | X | X | X | X | product license |
| si.dockerImages(all, cb) | \[{...}\] | X | X | X | X | X | returns array of top level/all docker images |
|  | \[0\].id | X | X | X | X | X | image ID |
|  | \[0\].container | X | X | X | X | X | container ID |
|  | \[0\].comment | X | X | X | X | X | comment |
|  | \[0\].os | X | X | X | X | X | OS |
|  | \[0\].architecture | X | X | X | X | X | architecture |
|  | \[0\].parent | X | X | X | X | X | parent ID |
|  | \[0\].dockerVersion | X | X | X | X | X | docker version |
|  | \[0\].size | X | X | X | X | X | image size |
|  | \[0\].sharedSize | X | X | X | X | X | shared size |
|  | \[0\].virtualSize | X | X | X | X | X | virtual size |
|  | \[0\].author | X | X | X | X | X | author |
|  | \[0\].created | X | X | X | X | X | created date / time |
|  | \[0\].containerConfig | X | X | X | X | X | container config object |
|  | \[0\].graphDriver | X | X | X | X | X | graph driver object |
|  | \[0\].repoDigests | X | X | X | X | X | repo digests array |
|  | \[0\].repoTags | X | X | X | X | X | repo tags array |
|  | \[0\].config | X | X | X | X | X | config object |
|  | \[0\].rootFS | X | X | X | X | X | root fs object |
| si.dockerContainers(all, cb) | \[{...}\] | X | X | X | X | X | returns array of active/all docker containers |
|  | \[0\].id | X | X | X | X | X | ID of container |
|  | \[0\].name | X | X | X | X | X | name of container |
|  | \[0\].image | X | X | X | X | X | name of image |
|  | \[0\].imageID | X | X | X | X | X | ID of image |
|  | \[0\].command | X | X | X | X | X | command |
|  | \[0\].created | X | X | X | X | X | creation time (unix time) |
|  | \[0\].started | X | X | X | X | X | started time (unix time) |
|  | \[0\].finished | X | X | X | X | X | finished time (unix time) |
|  | \[0\].createdAt | X | X | X | X | X | creation date time string |
|  | \[0\].startedAt | X | X | X | X | X | creation date time string |
|  | \[0\].finishedAt | X | X | X | X | X | creation date time string |
|  | \[0\].state | X | X | X | X | X | created, running, exited |
|  | \[0\].restartCount | X | X | X | X | X | restart count |
|  | \[0\].platform | X | X | X | X | X | e.g. linux |
|  | \[0\].driver | X | X | X | X | X | e.g. overlay2 or devicemapper |
|  | \[0\].ports | X | X | X | X | X | array of ports |
|  | \[0\].mounts | X | X | X | X | X | array of mounts |
| si.dockerContainerStats(ids, cb) | \[{...}\] | X | X | X | X | X | statistics for specific containers  
container IDs: space or comma separated,  
pass '\*' for all containers |
|  | \[0\].id | X | X | X | X | X | Container ID |
|  | \[0\].memUsage | X | X | X | X | X | memory usage in bytes |
|  | \[0\].memLimit | X | X | X | X | X | memory limit (max mem) in bytes |
|  | \[0\].memPercent | X | X | X | X | X | memory usage in percent |
|  | \[0\].cpuPercent | X | X | X | X | X | cpu usage in percent |
|  | \[0\].pids | X | X | X | X | X | number of processes |
|  | \[0\].netIO.rx | X | X | X | X | X | received bytes via network |
|  | \[0\].netIO.wx | X | X | X | X | X | sent bytes via network |
|  | \[0\].blockIO.r | X | X | X | X | X | bytes read from BlockIO |
|  | \[0\].blockIO.w | X | X | X | X | X | bytes written to BlockIO |
|  | \[0\].restartCount | X | X | X | X | X | restart count |
|  | \[0\].cpuStats | X | X | X | X | X | detailed cpu stats |
|  | \[0\].precpuStats | X | X | X | X | X | cpu statistic of previous read |
|  | \[0\].memoryStats | X | X | X | X | X | detailed memory stats |
|  | \[0\].networks | X | X | X | X | X | detailed network stats per interface |
| si.dockerContainerProcesses(id, cb) | \[{...}\] | X | X | X | X | X | array of processes inside a container |
|  | \[0\].pidHost | X | X | X | X | X | process ID (host) |
|  | \[0\].ppid | X | X | X | X | X | parent process ID |
|  | \[0\].pgid | X | X | X | X | X | process group ID |
|  | \[0\].user | X | X | X | X | X | effective user name |
|  | \[0\].ruser | X | X | X | X | X | real user name |
|  | \[0\].group | X | X | X | X | X | effective group name |
|  | \[0\].rgroup | X | X | X | X | X | real group name |
|  | \[0\].stat | X | X | X | X | X | process state |
|  | \[0\].time | X | X | X | X | X | accumulated CPU time |
|  | \[0\].elapsed | X | X | X | X | X | elapsed running time |
|  | \[0\].nice | X | X | X | X | X | nice value |
|  | \[0\].rss | X | X | X | X | X | resident set size |
|  | \[0\].vsz | X | X | X | X | X | virtual size in Kbytes |
|  | \[0\].command | X | X | X | X | X | command and arguments |
| si.dockerVolumes(cb) | \[{...}\] | X | X | X | X | X | returns array of docker volumes |
|  | \[0\].name | X | X | X | X | X | volume name |
|  | \[0\].driver | X | X | X | X | X | driver |
|  | \[0\].labels | X | X | X | X | X | labels object |
|  | \[0\].mountpoint | X | X | X | X | X | mountpoint |
|  | \[0\].options | X | X | X | X | X | options |
|  | \[0\].scope | X | X | X | X | X | scope |
|  | \[0\].created | X | X | X | X | X | created at |
| si.dockerAll(cb) | {...} | X | X | X | X | X | list of all containers including their stats  
and processes in one single array |
