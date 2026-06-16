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

OS

In this section you will learn how to get information about the installed operating system, versions of installed development specific software packages, shell and users online:

For function reference and examples we assume, that we imported systeminformation as follows:

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
```

## Operating System, Shell, Versions, Users

All functions in this section return a promise or can be called with a callback function (parameter cb in the function reference)

| Function | Result object | Linux | BSD | Mac | Win | Sun | Comments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| si.osInfo(cb) | {...} | X | X | X | X | X | OS information |
|  | platform | X | X | X | X | X | 'linux', 'darwin', 'Windows', ... |
|  | distro | X | X | X | X | X |  |
|  | release | X | X | X | X | X |  |
|  | codename | X |  | X | X |  |  |
|  | kernel | X | X | X | X | X | kernel release - same as os.release() |
|  | arch | X | X | X | X | X | same as os.arch() |
|  | hostname | X | X | X | X | X | same as os.hostname() |
|  | fqdn | X | X | X | X | X | fully qualfied domain name |
|  | codepage | X | X | X | X |  | OS build version |
|  | logofile | X | X | X | X | X | e.g. 'apple', 'debian', 'fedora', ... |
|  | serial | X | X | X | X |  | OS/Host serial number |
|  | build | X |  | X | X |  | OS build version |
|  | servicepack |  |  |  | X |  | service pack version |
|  | uefi | X | X | X | X |  | OS uses UEFI on startup |
|  | hypervizor |  |  |  | X |  | hyper-v detected (win only) |
|  | remoteSession |  |  |  | X |  | runs in remote session (win only) |
|  | 
##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.osInfo().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  platform: 'darwin',
  distro: 'Mac OS X',
  release: '10.15.3',
  codename: 'macOS Catalina',
  kernel: '19.3.0',
  arch: 'x64',
  hostname: 'hostname.local',
  fqdn: 'hostname.local',
  codepage: 'UTF-8',
  logofile: 'apple',
  serial: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
  build: '19D76',
  servicepack: '',
  uefi: true
}
```

 |
| si.shell(cb) | : string | X | X | X | X |  | standard shell |
| si.versions(apps, cb) | {...} | X | X | X | X | X | version information of  
node and dev software packages  
optional apps param (string,  
comma or space seperated)  
only those apps are detected |
|  | kernel | X | X | X | X | X | kernel version |
|  | apache | X | X | X | X | X | apache version |
|  | bash | X | X | X | X | X | bash version |
|  | bun | X | X | X | X | X | bun version |
|  | deno | X | X | X | X | X | deno version |
|  | docker | X | X | X | X | X | docker version |
|  | dotnet | X | X | X | X | X | dotnet version |
|  | fish | X | X | X | X | X | fish version |
|  | gcc | X | X | X | X | X | gcc version |
|  | git | X | X | X | X | X | git version |
|  | grunt | X | X | X | X | X | grunt version |
|  | gulp | X | X | X | X | X | gulp version |
|  | homebrew | X | X | X | X | X | homebrew version |
|  | java | X | X | X | X | X | java version |
|  | mongodb | X | X | X | X | X | mongodb version |
|  | mysql | X | X | X | X | X | mysql version |
|  | nginx | X | X | X | X | X | nginx version |
|  | node | X | X | X | X | X | node version |
|  | npm | X | X | X | X | X | npm version |
|  | openssl | X | X | X | X | X | openssl version |
|  | perl | X | X | X | X | X | perl version |
|  | php | X | X | X | X | X | php version |
|  | pip3 | X | X | X | X | X | pip3 version |
|  | pip | X | X | X | X | X | pip version |
|  | pm2 | X | X | X | X | X | pm2 version |
|  | postfix | X | X | X | X | X | postfix version |
|  | postgresql | X | X | X | X | X | postgresql version |
|  | powershell | X | X | X | X | X | powershell version |
|  | python3 | X | X | X | X | X | python3 version |
|  | python | X | X | X | X | X | python version |
|  | redis | X | X | X | X | X | redis version |
|  | systemOpenssl | X | X | X | X | X | systemOpenssl version |
|  | systemOpensslLib | X | X | X | X | X | systemOpensslLib version |
|  | tsc | X | X | X | X | X | tsc version |
|  | v8 | X | X | X | X | X | v8 version |
|  | virtualbox | X | X | X | X | X | virtualbox version |
|  | yarn | X | X | X | X | X | yarn version |
|  | zsh | X | X | X | X | X | zsh version |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.versions().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  kernel: '23.6.0',
  apache: '2.4.62',
  bash: '3.2.57',
  bun: '1.1.21',
  deno: '2.1.4',
  docker: '26.1.1',
  dotnet: '',
  fish: '',
  gcc: '15.0.0',
  git: '2.39.3',
  grunt: '',
  gulp: '',
  homebrew: '4.4.14',
  java: '17.0.2',
  mongodb: '',
  mysql: '9.0.1',
  nginx: '',
  node: '22.12.0',
  npm: '10.9.0',
  openssl: '3.0.15+quic',
  perl: '5.34.1',
  php: '8.3.6',
  pip3: '24.2',
  pip: '20.3.4',
  pm2: '5.1.2',
  postfix: '3.2.2',
  postgresql: '16.4',
  powershell: '',
  python3: '3.12.5',
  python: '',
  redis: '',
  systemOpenssl: '3.3.1',
  systemOpensslLib: 'OpenSSL',
  tsc: '5.2.2',
  v8: '12.4.254.21-node.21',
  virtualbox: '',
  yarn: '1.22.17',
  zsh: '5.9''
}
```

##### Example 2

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.versions(<span>'npm, php, postgresql'</span>).then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
{
  npm: '6.13.6',
  php: '7.3.11',
  postgresql: '12.1'
}
```

 |
| si.users(cb) | \[{...}\] | X | X | X | X | X | array of users online |
|  | \[0\].user | X | X | X | X | X | user name |
|  | \[0\].tty | X | X | X | X | X | terminal |
|  | \[0\].date | X | X | X | X | X | login date |
|  | \[0\].time | X | X | X | X | X | login time |
|  | \[0\].ip | X | X | X |  | X | ip address (remote login) |
|  | \[0\].command | X | X | X |  | X | last command or shell |
|  | 

##### Example

```
<span>const</span> si = <span>require</span>(<span>'systeminformation'</span>);
si.users().then(<span><span>data</span> =&gt;</span> <span>console</span>.log(data));
```

```
[
  {
    user: 'yourname',
    tty: 'ttys006',
    date: '2020-02-01',
    time: '21:20',
    ip: '',
    command: 'w -ih'
  },
  {
    user: 'othername',
    tty: 'ttys008',
    date: '2020-02-01',
    time: '21:20',
    ip: '',
    command: '-bash'
  }
]
```

 |
