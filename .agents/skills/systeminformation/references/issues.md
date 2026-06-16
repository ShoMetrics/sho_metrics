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

#### Windows Temperature, Battery, ...

get-WmiObject - which is used to determine temperature and battery sometimes needs to be run with admin privileges. So if you do not get any values, try to run it again with according privileges. If you still do not get any values, your system might not support this feature. In some cases we also discovered that get-WmiObject returned incorrect temperature values.

#### Linux Temperature

In some cases you need to install the linux sensors package to be able to measure temperature e.g. on DEBIAN based systems by running

```
$ sudo apt-get install lm-sensors
```

#### Windows, macOS - CPU Speed

node.js and get-WmiObject are not able to determine correct CPU current speed on windows and macOS. This means, you will have constant values here on both platforms for all processor cores in cpuCurrentSpeed().

#### Linux, Windows, macOS - S.M.A.R.T. Status

To be able to detect S.M.A.R.T. status on macOS, Windows and Linux you need to install smartmontools.

On DEBIAN based linux distributions you can install it by running:

```
$ sudo apt-get install smartmontools
```

On macOS you can install it using brew:

```
$ brew install smartmontools
```

On windows you can download it from [https://www.smartmontools.org/](https://www.smartmontools.org/)

If you have smartmontools version >= 7.0 then you will get also full smart data in diskLayout()

#### Stats Functions

To get correct values with fsStats(), disksIO() and networkStats() please check [this guide](https://systeminformation.io/statsfunctions.html)

#### Empty / incorrect values

If you discover empty or incorrect values, please keep in mind that some underlying commands need to be run under admin privileges. So if you run your scripts as normal users, not all system information values can be determined. For linux this is e.g. the case for \`memLayout()\`, advances \`system()\`, \`bios()\`, \`baseboard()\`, \`cpu()\`information, S.M.A.R.T. status and others...

#### Encoding issues - Windows

I now reimplemented all windows functions to avoid encoding problems (special chacarters). And as Windows 11 also dropped wmic support, I had to move completely to powershell. Be sure that powershell version 5+ is installed on your machine. On older Windows versions (7, 8) you might still see encoding problems due to the old powershell version.

#### Finding New Issues

If you still have problems, please feel free to open an issue on our [github page](https://github.com/sebhildebrandt/systeminformation/issues)
