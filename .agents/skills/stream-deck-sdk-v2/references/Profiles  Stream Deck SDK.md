Stream Deck Profiles are shareable layouts, specific to a Stream Deck device, that can include pre-defined actions, icons, and settings. Bundling Stream Deck profiles into your plugin can be useful in scenarios such as streamlining the users set up experience, or providing additional functionality utilizing the full Stream Deck canvas.

![The Stream Deck preferences window, displaying the profiles tab](https://docs.elgato.com/img/streamdeck/sdk/default-profile.png)

## Creating a Profile[](https://docs.elgato.com/streamdeck/sdk/guides/profiles/#creating-a-profile "Direct link to Creating a Profile")

Profiles are configured by dragging your plugin's actions from the Steam Deck app's action list onto the canvas. Once your profile includes the actions you need, navigate to the profiles tab in the Stream Deck preferences, right-click the profile you wish to export, and select "Export". This will save you profile as a `.streamDeckProfile` file.

![The Stream Deck preferences window, displaying the profiles tab](https://docs.elgato.com/img/streamdeck/sdk/preferences-profiles-tab.png)

## Bundling[](https://docs.elgato.com/streamdeck/sdk/guides/profiles/#bundling "Direct link to Bundling")

Once you have your `.streamDeckProfile` file, you can utilize it in your plugin by adding it to the `*.sdPlugin` directory, and registering it in the `Profiles` array in the plugin's manifest.

Example of "Profiles" within the manifest JSON file

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

Exclude file extension

The `Name` in the manifest should be the path to the `.streamDeckProfile` file, relative to the manifest, **without** the extension.

Automatic installation

By default, users are prompted to install bundled Stream Deck profiles when the plugin is first installed. To disable this, you can setting `AutoInstall` to `false` in the manifest. The user will instead then be prompted to install the bundled profile the next time your plugin attempts to switch to it.

## Switching to a Profile[](https://docs.elgato.com/streamdeck/sdk/guides/profiles/#switching-to-a-profile "Direct link to Switching to a Profile")

Now that you've created a profile for your target device, your plugin can switch to it using its name as the identifier.

Switch profile on key down

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>action</span><span>, </span><span>KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.example.action"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>&lt;</span><span>CounterSettings</span><span>&gt;): </span><span>void</span><span> | </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>streamDeck</span><span>.</span><span>profiles</span><span>.</span><span>switchToProfile</span><span>(</span><span>ev</span><span>.</span><span>action</span><span>.</span><span>device</span><span>.</span><span>id</span><span>, </span><span>"My Cool Profile"</span><span>); </span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>type</span><span> CounterSettings</span><span> = {</span></span>
<span><span>count</span><span>: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
```

User profiles

Plugins do not have access to user-defined profiles, and therefore cannot switch to them. Plugins can only switch to profiles distributed with the plugin.