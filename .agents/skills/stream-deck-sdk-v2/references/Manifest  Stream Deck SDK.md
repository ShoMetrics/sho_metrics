The manifest JSON file defines your plugin, and provides important metadata that determines how your plugin is executed, and rendered within Stream Deck; this includes:

-   Your plugin's entry point, aka [CodePath](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-codepath).
-   Your [actions](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-actions) metadata, such as the name, icon, states etc.
-   Minimum required version of [Stream Deck](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-software), and [Node.js](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-nodejs).
-   Supported [operating systems](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-os).

## Examples[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#examples "Direct link to Examples")

-   Basic
-   Dial support
-   Profiles
-   App monitoring

manifest.json

```
<span><span>{</span></span>
<span><span>    "$schema"</span><span>: </span><span>"https://schemas.elgato.com/streamdeck/plugins/manifest.json"</span><span>,</span></span>
<span><span>    "Actions"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Icon"</span><span>: </span><span>"action-icon"</span><span>,</span></span>
<span><span>            "Name"</span><span>: </span><span>"Action One"</span><span>,</span></span>
<span><span>            "States"</span><span>: [</span></span>
<span><span>                {</span></span>
<span><span>                    "Image"</span><span>: </span><span>"state-image"</span></span>
<span><span>                }</span></span>
<span><span>            ],</span></span>
<span><span>            "UUID"</span><span>: </span><span>"come.elgato.test.one"</span></span>
<span><span>        }</span></span>
<span><span>    ],</span></span>
<span><span>    "Author"</span><span>: </span><span>"Elgato"</span><span>,</span></span>
<span><span>    "CodePath"</span><span>: </span><span>"bin/plugin.js"</span><span>,</span></span>
<span><span>    "Description"</span><span>: </span><span>"Demo plugin with a minimal manifest."</span><span>,</span></span>
<span><span>    "Icon"</span><span>: </span><span>"plugin-icon"</span><span>,</span></span>
<span><span>    "Name"</span><span>: </span><span>"Test Plugin"</span><span>,</span></span>
<span><span>    "Nodejs"</span><span>: {</span></span>
<span><span>        "Version"</span><span>: </span><span>"20"</span></span>
<span><span>    },</span></span>
<span><span>    "OS"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Platform"</span><span>: </span><span>"mac"</span><span>,</span></span>
<span><span>            "MinimumVersion"</span><span>: </span><span>"13"</span></span>
<span><span>        },</span></span>
<span><span>        {</span></span>
<span><span>            "Platform"</span><span>: </span><span>"windows"</span><span>,</span></span>
<span><span>            "MinimumVersion"</span><span>: </span><span>"10"</span></span>
<span><span>        }</span></span>
<span><span>    ],</span></span>
<span><span>    "UUID"</span><span>: </span><span>"com.elgato.test"</span><span>,</span></span>
<span><span>    "Version"</span><span>: </span><span>"1.0.0.0"</span><span>,</span></span>
<span><span>    "SDKVersion"</span><span>: </span><span>2</span><span>,</span></span>
<span><span>    "Software"</span><span>: {</span></span>
<span><span>        "MinimumVersion"</span><span>: </span><span>"6.6"</span></span>
<span><span>    }</span></span>
<span><span>}</span></span>
```

## JSON Schema[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#json-schema "Direct link to JSON Schema")

A JSON schema is available for the manifest JSON file, providing intellisense and validation, and is available at the following URL:

JSON schema URL

```
<span><span>https://schemas.elgato.com/streamdeck/plugins/manifest.json</span></span>
```

You can reference this URL using the `$schema` property within your manifest:

Manifest JSON file

```
<span><span>{</span></span>
<span><span>"$schema"</span><span>: </span><span>"https://schemas.elgato.com/streamdeck/plugins/manifest.json"</span><span>,</span></span>
<span><span>"Author"</span><span>: </span><span>"Elgato"</span><span>,</span></span>
<span><span>"Name"</span><span>: </span><span>"Test Plugin"</span></span>
<span><span>// ...</span></span>
<span><span>}</span></span>
```

## TypeScript Declaration[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#typescript-declaration "Direct link to TypeScript Declaration")

Manifest TypeScript declaration

```
<span><span>type</span><span> Manifest</span><span> = {</span></span>
<span><span>    Actions</span><span>: {</span></span>
<span><span>        Controllers</span><span>?: [</span><span>"Encoder"</span><span> | </span><span>"Keypad"</span><span>, (</span><span>"Encoder"</span><span> | </span><span>"Keypad"</span><span>)?];</span></span>
<span><span>        DisableAutomaticStates</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>        DisableCaching</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>        Encoder</span><span>?: {</span></span>
<span><span>            background</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>            Icon</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>            layout</span><span>?: </span><span>`</span><span>${</span><span>string</span><span>}</span><span>.json`</span><span> | </span><span>"$A0"</span><span> | </span><span>"$A1"</span><span> | </span><span>"$B1"</span><span> | </span><span>"$B2"</span><span> | </span><span>"$C1"</span><span> | </span><span>"$X1"</span><span>;</span></span>
<span><span>            StackColor</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>            TriggerDescription</span><span>?: {</span></span>
<span><span>                LongTouch</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                Push</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                Rotate</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                Touch</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>            };</span></span>
<span><span>        };</span></span>
<span><span>        Icon</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        Name</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        OS</span><span>?: (</span><span>"mac"</span><span> | </span><span>"windows"</span><span>)[];</span></span>
<span><span>        PropertyInspectorPath</span><span>?: </span><span>`</span><span>${</span><span>string</span><span>}</span><span>.htm`</span><span> | </span><span>`</span><span>${</span><span>string</span><span>}</span><span>.html`</span><span>;</span></span>
<span><span>        States</span><span>: {</span></span>
<span><span>            FontFamily</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>            FontSize</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>            FontStyle</span><span>?: </span><span>""</span><span> | </span><span>"Bold Italic"</span><span> | </span><span>"Bold"</span><span> | </span><span>"Italic"</span><span> | </span><span>"Regular"</span><span>;</span></span>
<span><span>            FontUnderline</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>            Image</span><span>: </span><span>string</span><span>;</span></span>
<span><span>            MultiActionImage</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>            Name</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>            ShowTitle</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>            Title</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>            TitleAlignment</span><span>?: </span><span>"bottom"</span><span> | </span><span>"middle"</span><span> | </span><span>"top"</span><span>;</span></span>
<span><span>            TitleColor</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>        }[];</span></span>
<span><span>        SupportedInKeyLogicActions</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>        SupportedInMultiActions</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>        SupportURL</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>        Tooltip</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>        UserTitleEnabled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>        UUID</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        VisibleInActionsList</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>    }[];</span></span>
<span><span>    ApplicationsToMonitor</span><span>?: {</span></span>
<span><span>        mac</span><span>?: </span><span>string</span><span>[];</span></span>
<span><span>        windows</span><span>?: </span><span>string</span><span>[];</span></span>
<span><span>    };</span></span>
<span><span>    Author</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    Category</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    CategoryIcon</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    CodePath</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    CodePathMac</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    CodePathWin</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    DefaultWindowSize</span><span>?: [</span><span>number</span><span>, </span><span>number</span><span>];</span></span>
<span><span>    Description</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    Icon</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    Name</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    Nodejs</span><span>?: {</span></span>
<span><span>        Debug</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>        GenerateProfilerOutput</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>        Version</span><span>: </span><span>"20"</span><span> | </span><span>"24"</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>    OS</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            MinimumVersion</span><span>: </span><span>string</span><span>;</span></span>
<span><span>            Platform</span><span>: </span><span>"mac"</span><span> | </span><span>"windows"</span><span>;</span></span>
<span><span>        },</span></span>
<span><span>        {</span></span>
<span><span>            MinimumVersion</span><span>: </span><span>string</span><span>;</span></span>
<span><span>            Platform</span><span>: </span><span>"mac"</span><span> | </span><span>"windows"</span><span>;</span></span>
<span><span>        }?,</span></span>
<span><span>    ];</span></span>
<span><span>    Profiles</span><span>?: {</span></span>
<span><span>        AutoInstall</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>        DeviceType</span><span>: </span><span>0</span><span> | </span><span>1</span><span> | </span><span>2</span><span> | </span><span>3</span><span> | </span><span>4</span><span> | </span><span>5</span><span> | </span><span>6</span><span> | </span><span>7</span><span> | </span><span>8</span><span> | </span><span>9</span><span> | </span><span>10</span><span> | </span><span>11</span><span> | </span><span>12</span><span> | </span><span>13</span><span>;</span></span>
<span><span>        DontAutoSwitchWhenInstalled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>        Name</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        Readonly</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>    }[];</span></span>
<span><span>    PropertyInspectorPath</span><span>?: </span><span>`</span><span>${</span><span>string</span><span>}</span><span>.htm`</span><span> | </span><span>`</span><span>${</span><span>string</span><span>}</span><span>.html`</span><span>;</span></span>
<span><span>    SDKVersion</span><span>: </span><span>2</span><span> | </span><span>3</span><span>;</span></span>
<span><span>    Software</span><span>: {</span></span>
<span><span>        MinimumVersion</span><span>: </span><span>"6.4"</span><span> | </span><span>"6.5"</span><span> | </span><span>"6.6"</span><span> | </span><span>"6.7"</span><span> | </span><span>"6.8"</span><span> | </span><span>"6.9"</span><span> | </span><span>"7.0"</span><span> | </span><span>"7.1"</span><span> | </span><span>"7.2"</span><span> | </span><span>"7.3"</span><span> | </span><span>"7.4"</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>    SupportURL</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    URL</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    UUID</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    Version</span><span>: </span><span>string</span><span>;</span></span>
<span><span>};</span></span>
```

File path extensions

Some file path properties within the manifest must have their file extension omitted. For example [Icon](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-icon) and a profile's [Name](https://docs.elgato.com/streamdeck/sdk/references/manifest/#profile-name) are extension-less file paths, whereas properties such as [CodePath](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-codepath) and [PropertyInspectorPath](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-propertyinspectorpath) require an extension. For more information, please refer to the documentation of the property.

## Definitions[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#definitions "Direct link to Definitions")

### Manifest[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest "Direct link to Manifest")

Defines the plugin and available actions, and all information associated with them, including the plugin's entry point, all iconography, action default behavior, etc.

**Properties**

**Actions**: [Action](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action)\[\][](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-actions "Direct link to Actions")Required **ApplicationsToMonitor**: [ApplicationMonitoring](https://docs.elgato.com/streamdeck/sdk/references/manifest/#applicationmonitoring)[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-applicationstomonitor "Direct link to ApplicationsToMonitor") [](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-author "Direct link to Author")Required **Category**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-category "Direct link to Category") **CategoryIcon**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-categoryicon "Direct link to CategoryIcon") **CodePath**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-codepath "Direct link to CodePath")Required **CodePathMac**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-codepathmac "Direct link to CodePathMac") **CodePathWin**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-codepathwin "Direct link to CodePathWin") **DefaultWindowSize**: \[number, number\][](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-defaultwindowsize "Direct link to DefaultWindowSize") **Description**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-description "Direct link to Description")Required **Icon**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-icon "Direct link to Icon")Required **Name**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-name "Direct link to Name")Required **Nodejs**: [Nodejs](https://docs.elgato.com/streamdeck/sdk/references/manifest/#nodejs)[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-nodejs "Direct link to Nodejs") **OS**: \[[OS](https://docs.elgato.com/streamdeck/sdk/references/manifest/#os), [OS](https://docs.elgato.com/streamdeck/sdk/references/manifest/#os)?\][](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-os "Direct link to OS")Required **Profiles**: [Profile](https://docs.elgato.com/streamdeck/sdk/references/manifest/#profile)\[\][](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-profiles "Direct link to Profiles") **PropertyInspectorPath**: `${string}.htm`, `${string}.html`[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-propertyinspectorpath "Direct link to PropertyInspectorPath") **SDKVersion**: 2, 3[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-sdkversion "Direct link to SDKVersion")Required **Software**: [Software](https://docs.elgato.com/streamdeck/sdk/references/manifest/#software)[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-software "Direct link to Software")Required **SupportURL**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-supporturl "Direct link to SupportURL") **URL**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-url "Direct link to URL") **UUID**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-uuid "Direct link to UUID")Required **Version**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#manifest-version "Direct link to Version")Required

### Action[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action "Direct link to Action")

Provides information about an action provided by the plugin.

**Properties**

**Controllers**: \[("Encoder", "Keypad"), ("Encoder", "Keypad")?\][](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-controllers "Direct link to Controllers") **DisableAutomaticStates**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-disableautomaticstates "Direct link to DisableAutomaticStates") **DisableCaching**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-disablecaching "Direct link to DisableCaching") **Encoder**: [Encoder](https://docs.elgato.com/streamdeck/sdk/references/manifest/#encoder)[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-encoder "Direct link to Encoder") **Icon**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-icon "Direct link to Icon")Required **Name**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-name "Direct link to Name")Required **OS**: ("mac", "windows")\[\][](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-os "Direct link to OS") **PropertyInspectorPath**: `${string}.htm`, `${string}.html`[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-propertyinspectorpath "Direct link to PropertyInspectorPath") **States**: [State](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state)\[\][](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-states "Direct link to States")Required **SupportedInKeyLogicActions**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-supportedinkeylogicactions "Direct link to SupportedInKeyLogicActions") **SupportedInMultiActions**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-supportedinmultiactions "Direct link to SupportedInMultiActions") **SupportURL**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-supporturl "Direct link to SupportURL") **Tooltip**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-tooltip "Direct link to Tooltip") **UUID**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-uuid "Direct link to UUID")Required **UserTitleEnabled**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-usertitleenabled "Direct link to UserTitleEnabled") **VisibleInActionsList**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#action-visibleinactionslist "Direct link to VisibleInActionsList")

### ApplicationMonitoring[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#applicationmonitoring "Direct link to ApplicationMonitoring")

Applications to monitor on Mac and Windows; upon a monitored application being launched or terminated, Stream Deck will notify the plugin.

**Properties**

**mac**: string\[\][](https://docs.elgato.com/streamdeck/sdk/references/manifest/#applicationmonitoring-mac "Direct link to mac") **windows**: string\[\][](https://docs.elgato.com/streamdeck/sdk/references/manifest/#applicationmonitoring-windows "Direct link to windows")

### Encoder[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#encoder "Direct link to Encoder")

Provides information about how the action functions as part of an `Encoder` (dial / touchscreen).

**Properties**

**Icon**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#encoder-icon "Direct link to Icon") **StackColor**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#encoder-stackcolor "Direct link to StackColor") **TriggerDescription**: [TriggerDescriptions](https://docs.elgato.com/streamdeck/sdk/references/manifest/#triggerdescriptions)[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#encoder-triggerdescription "Direct link to TriggerDescription") **background**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#encoder-background "Direct link to background") **layout**: `${string}.json`, "$A0", "$A1", "$B1", "$B2", "$C1", "$X1"[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#encoder-layout "Direct link to layout")

### Nodejs[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#nodejs "Direct link to Nodejs")

Configuration options for Node.js based plugins.

**Properties**

**Debug**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#nodejs-debug "Direct link to Debug") **GenerateProfilerOutput**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#nodejs-generateprofileroutput "Direct link to GenerateProfilerOutput") **Version**: "20", "24"[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#nodejs-version "Direct link to Version")Required

### OS[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#os "Direct link to OS")

Operating system that the plugin supports, and the minimum required version needed to run the plugin.

**Properties**

**MinimumVersion**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#os-minimumversion "Direct link to MinimumVersion")Required **Platform**: "mac", "windows"[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#os-platform "Direct link to Platform")Required

### Profile[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#profile "Direct link to Profile")

Provides information for pre-defined profile distributed with this plugin.

**Properties**

**AutoInstall**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#profile-autoinstall "Direct link to AutoInstall") **DeviceType**: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#profile-devicetype "Direct link to DeviceType")Required **DontAutoSwitchWhenInstalled**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#profile-dontautoswitchwheninstalled "Direct link to DontAutoSwitchWhenInstalled") **Name**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#profile-name "Direct link to Name")Required **Readonly**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#profile-readonly "Direct link to Readonly")

### Software[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#software "Direct link to Software")

Determines the Stream Deck software requirements for this plugin.

**Properties**

**MinimumVersion**: "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "7.0", "7.1", "7.2", "7.3", "7.4"[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#software-minimumversion "Direct link to MinimumVersion")Required

### State[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state "Direct link to State")

States the action can be in. When two states are defined the action will act as a toggle, with users being able to select their preferred iconography for each state.

Note: Automatic toggling of the state on action activation can be disabled by setting `DisableAutomaticStates` to `true`.

**Properties**

**FontFamily**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-fontfamily "Direct link to FontFamily") **FontSize**: number[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-fontsize "Direct link to FontSize") **FontStyle**: "", "Bold Italic", "Bold", "Italic", "Regular"[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-fontstyle "Direct link to FontStyle") **FontUnderline**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-fontunderline "Direct link to FontUnderline") **Image**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-image "Direct link to Image")Required **MultiActionImage**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-multiactionimage "Direct link to MultiActionImage") **Name**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-name "Direct link to Name") **ShowTitle**: boolean[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-showtitle "Direct link to ShowTitle") **Title**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-title "Direct link to Title") **TitleAlignment**: "bottom", "middle", "top"[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-titlealignment "Direct link to TitleAlignment") **TitleColor**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#state-titlecolor "Direct link to TitleColor")

### TriggerDescriptions[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#triggerdescriptions "Direct link to TriggerDescriptions")

Descriptions that define the interaction of the action when it is associated with a dial / touchscreen on the Stream Deck +. This information is shown to the user.

**Examples:**

-   "Adjust volume"
-   "Play / Pause"

**Properties**

**LongTouch**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#triggerdescriptions-longtouch "Direct link to LongTouch") **Push**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#triggerdescriptions-push "Direct link to Push") **Rotate**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#triggerdescriptions-rotate "Direct link to Rotate") **Touch**: string[](https://docs.elgato.com/streamdeck/sdk/references/manifest/#triggerdescriptions-touch "Direct link to Touch")