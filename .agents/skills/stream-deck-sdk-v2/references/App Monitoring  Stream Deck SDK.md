The Stream Deck SDK can notify your plugin when an application starts (launches) or stops (terminates), allowing it to monitor pre-registered apps. This can be particularly useful if your plugin relies or interacts with a local application, for example via IPC.

## Registering Apps[](https://docs.elgato.com/streamdeck/sdk/guides/app-monitoring/#registering-apps "Direct link to Registering Apps")

To monitor an application, the name of the application must be registered in the manifest JSON file using the `ApplicationsToMonitor` property.

Example of "ApplicationsToMonitor" within the manifest JSON file

```
<span><span>{</span></span>
<span><span>    "$schema"</span><span>: </span><span>"https://schemas.elgato.com/streamdeck/plugins/manifest.json"</span><span>,</span></span>
<span><span>    "UUID"</span><span>: </span><span>"com.elgato.hello-world"</span><span>,</span></span>
<span><span>    "Name"</span><span>: </span><span>"Hello World"</span><span>,</span></span>
<span><span>    "Version"</span><span>: </span><span>"0.1.0.0"</span><span>,</span></span>
<span><span>    "Author"</span><span>: </span><span>"Elgato"</span><span>,</span></span>
<span><span>    "Actions"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Name"</span><span>: </span><span>"Counter"</span><span>,</span></span>
<span><span>            "UUID"</span><span>: </span><span>"com.elgato.hello-world.increment"</span><span>,</span></span>
<span><span>            "Icon"</span><span>: </span><span>"static/imgs/actions/counter/icon"</span><span>,</span></span>
<span><span>            "Tooltip"</span><span>: </span><span>"Displays a count, which increments by one on press."</span><span>,</span></span>
<span><span>            "Controllers"</span><span>: [</span><span>"Keypad"</span><span>],</span></span>
<span><span>            "States"</span><span>: [</span></span>
<span><span>                {</span></span>
<span><span>                    "Image"</span><span>: </span><span>"static/imgs/actions/counter/key"</span><span>,</span></span>
<span><span>                    "TitleAlignment"</span><span>: </span><span>"middle"</span></span>
<span><span>                }</span></span>
<span><span>            ]</span></span>
<span><span>        }</span></span>
<span><span>    ],</span></span>
<span><span>    "Category"</span><span>: </span><span>"Hello World"</span><span>,</span></span>
<span><span>    "CategoryIcon"</span><span>: </span><span>"static/imgs/plugin/category-icon"</span><span>,</span></span>
<span><span>    "CodePath"</span><span>: </span><span>"bin/plugin.js"</span><span>,</span></span>
<span><span>    "Description"</span><span>: </span><span>"."</span><span>,</span></span>
<span><span>    "Icon"</span><span>: </span><span>"static/imgs/plugin/marketplace"</span><span>,</span></span>
<span><span>    "SDKVersion"</span><span>: </span><span>2</span><span>,</span></span>
<span><span>    "Software"</span><span>: {</span></span>
<span><span>        "MinimumVersion"</span><span>: </span><span>"6.6"</span></span>
<span><span>    },</span></span>
<span><span>    "OS"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Platform"</span><span>: </span><span>"mac"</span><span>,</span></span>
<span><span>            "MinimumVersion"</span><span>: </span><span>"10.15"</span></span>
<span><span>        },</span></span>
<span><span>        {</span></span>
<span><span>            "Platform"</span><span>: </span><span>"windows"</span><span>,</span></span>
<span><span>            "MinimumVersion"</span><span>: </span><span>"10"</span></span>
<span><span>        }</span></span>
<span><span>    ],</span></span>
<span><span>    "Nodejs"</span><span>: {</span></span>
<span><span>        "Version"</span><span>: </span><span>"20"</span><span>,</span></span>
<span><span>        "Debug"</span><span>: </span><span>"enabled"</span></span>
<span><span>    },</span></span>
<span><span>    "ApplicationsToMonitor"</span><span>: {</span></span>
<span><span>        "mac"</span><span>: [</span><span>"com.elgato.WaveLink"</span><span>],</span></span>
<span><span>        "windows"</span><span>: [</span><span>"Elgato Wave Link.exe"</span><span>]</span></span>
<span><span>    },</span></span>
<span><span>    "Profiles"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Name"</span><span>: </span><span>"My Cool Profile"</span><span>,</span></span>
<span><span>            "DeviceType"</span><span>: </span><span>0</span><span>,</span></span>
<span><span>            "Readonly"</span><span>: </span><span>false</span><span>,</span></span>
<span><span>            "DontAutoSwitchWhenInstalled"</span><span>: </span><span>false</span><span>,</span></span>
<span><span>            "AutoInstall"</span><span>: </span><span>true</span></span>
<span><span>        }</span></span>
<span><span>    ]</span></span>
<span><span>}</span></span>
```

Finding the name / identifier of the of application depends on the operating system.

-   Windows
-   macOS

For Windows apps, Stream Deck uses the app's executable name. This information is available in the details tab of Windows Task manager. You can also navigate to the file directly in Windows explorer, or right-click on the apps shortcut and select properties to find the target `exe` file.

![StreamDeck.exe](https://docs.elgato.com/img/streamdeck/sdk/windows-task-manager.png)

## Apps Launching[](https://docs.elgato.com/streamdeck/sdk/guides/app-monitoring/#apps-launching "Direct link to Apps Launching")

To listen for a registered application launching, your plugin can subscribe to the `onApplicationDidLaunch` event.

Application launch event callback

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>ApplicationDidLaunchEvent</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>system</span><span>.</span><span>onApplicationDidLaunch</span><span>((</span><span>ev</span><span>: </span><span>ApplicationDidLaunchEvent</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>// Handle a registered application launching</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>ev</span><span>.</span><span>application</span><span>); </span><span>// e.g. "Elgato Wave Link.exe"</span></span>
<span><span>});</span></span>
```

## Apps Terminating[](https://docs.elgato.com/streamdeck/sdk/guides/app-monitoring/#apps-terminating "Direct link to Apps Terminating")

To listen for a registered application terminating, your plugin can subscribe to the `onApplicationDidTerminate` event.

Application terminate event callback

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>ApplicationDidTerminateEvent</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>system</span><span>.</span><span>onApplicationDidTerminate</span><span>((</span><span>ev</span><span>: </span><span>ApplicationDidTerminateEvent</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>// Handle a registered application terminating.</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>ev</span><span>.</span><span>application</span><span>); </span><span>// e.g. "Elgato Wave Link.exe"</span></span>
<span><span>});</span></span>
```