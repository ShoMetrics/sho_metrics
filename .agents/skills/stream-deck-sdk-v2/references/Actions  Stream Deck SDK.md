Actions represent the core functionality provided by your plugin, and are fundamental to all Stream Deck plugins. All interactive physical elements found on a Stream Deck device, for example keys, dials, pedals, etc. are all associated with actions, allowing users to execute your plugin's functionality.

Examples of actions include:

-   Volume control - Wave Link, Volume Controller, Discord, etc.
-   Turning a light on/off - Control Center, Hue, Govee, etc.
-   Controlling music playback - Spotify, Sound Deck, etc.

## Types of Actions[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#types-of-actions "Direct link to Types of Actions")

There are two Stream Deck action types, also referred to as "controllers", these are:

-   Key - Includes standard Stream Deck keys (buttons), pedals, G-Keys, etc.
-   Dial - A dial and a portion of the touchscreen, found on Stream Deck +.

![A screenshot of Stream Deck software displaying the canvas of a Stream Deck +, highlighting the top-right key, and a dial that is comprised of a dial and one quarter of the touchscreen](https://docs.elgato.com/img/streamdeck/sdk/controllers.png)

Supporting action controllers

Your plugin can specify which controllers are supported by each action as part of the [action's metadata](https://docs.elgato.com/streamdeck/sdk/guides/actions/#metadata), allowing the user to assign the action to either a key and/or a dial (aka an encoder).

## Action Identifiers[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#action-identifiers "Direct link to Action Identifiers")

Actions are uniquely identified by their UUID, which is a reverse DNS formatted string that is defined by you, the plugin's author. The UUID of an action must be prefixed by your plugin's UUID. For example:

> If your plugin's UUID is `com.elgato.hello-world`, and your plugin has a "Counter" action, your action's UUID would be `com.elgato.hello-world.counter`.

Similar to your plugin's UUID, action UUIDs must only contain lowercase alphanumeric characters (`a-z`, `0-9`), hyphens (`-`), and periods (`.`).

Do not change UUIDs

Once defined and published, UUIDs must never change. Actions on a Stream Deck canvas are identified by the plugin and action UUIDs at the time of the user adding the action to the canvas. Changing either of these UUIDs will result in the action(s) being removed from the user's configuration which can cause confusion and frustration.

## Registering Actions[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#registering-actions "Direct link to Registering Actions")

Actions provided by your plugin are registered in two parts:

1.  The metadata; stored in your plugin's manifest JSON file.
2.  The implementation; registered in the application-layer.

### Metadata[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#metadata "Direct link to Metadata")

The metadata of your action tells Stream Deck about your action, including:

-   The action's name, description, etc.
-   Which types of controllers are supported (for example keys and/or dials).
-   How your action is displayed to the user in the actions list.

Metadata associated with your plugin's actions are stored within your plugin's manifest as entries within the `Actions` property. Below is an example of a "Counter" action's metadata in a manifest.

Example of "Actions" within the manifest JSON file

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

Hiding actions

Actions defined within the manifest will be visible to the user in the actions list in the Stream Deck app. You can hide specific actions from the user by setting `VisibleInActionsList` to `false` in the manifest. Your plugin can utilize its own hidden (or visible) actions as part of pre-configured [profiles](https://docs.elgato.com/streamdeck/sdk/guides/profiles) bundled with your plugin. Hiding actions is also useful for deprecating older actions, without completely removing them.

### Implementation[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#implementation "Direct link to Implementation")

With your action's metadata defined within the manifest, it is then the responsibility of your plugin's application-layer to provide the implementation, i.e. what your action does when a user interacts with Stream Deck

Actions are represented as single-instance classes that inherit from a `SingletonAction`. Your action's class then overrides methods to handle events from Stream Deck, for example:

Action class demonstrating the key down event

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>action</span><span>, </span><span>type</span><span> KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * An action that logs a Stream Deck key press.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.log"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> LogKeyPressAction</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Handles the user pressing a Stream Deck key (pedal, G-key, etc).</span></span>
<span><span> * </span><span>@param</span><span> ev</span><span> Information about the event.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>): </span><span>void</span><span> | </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>`Key pressed!`</span><span>);</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

Once implemented, your plugin must register the action in the entry file of the application-layer:

Registering actions within the plugin

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>import</span><span> { </span><span>LogKeyPressAction</span><span> } </span><span>from</span><span> "./actions/log-key-press"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>actions</span><span>.</span><span>registerAction</span><span>(</span><span>new</span><span> LogKeyPressAction</span><span>());</span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

Order of execution

It is important to register all of your plugin's actions before connecting to Stream Deck. As a general rule of thumb, it is recommended to call `streamDeck.connect()` last in the entry file of your plugin.

User interfaces

In addition to an action's Node.js implementation, actions can also have a user interface. More commonly referred to as property inspectors, these user interfaces can allow users to configure the settings associated with your action directly within Stream Deck. Learn more about the [architecture of plugins](https://docs.elgato.com/streamdeck/sdk/introduction/plugin-environment#javascript-runtimes), [settings](https://docs.elgato.com/streamdeck/sdk/guides/settings), and [property inspectors](https://docs.elgato.com/streamdeck/sdk/guides/ui).

## Handling Events[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#handling-events "Direct link to Handling Events")

Events are used extensively throughout the Stream Deck SDK, and allow your plugin to react to user interaction on both a hardware and software level.

The diagram below provides an overview of events relating to actions, and their order of invocation. The events emitted are based loosely on how your action is configured, for example property inspector (UI) events will not be emitted for an action that does not have a property inspector associated with it; these events are highlighted with a dashed border.

![A diagram that shows the events that can occur for a Stream Deck action, as part of the Stream Deck SDK](https://docs.elgato.com/img/streamdeck/sdk/action-lifecycle.svg)

The `SingletonAction` class, that your actions inherit from, contains virtual methods that your class should implement to handle events from Stream Deck, for example `onKeyDown`, `onDialRotate`, `onWillAppear`, etc.

When an event handler is invoked on your action, the event information is supplied as a parameter to provide context, for example:

Callback functions are provided with an event parameter

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>action</span><span>, </span><span>type</span><span> KeyDownEvent</span><span>, </span><span>SingletonAction</span><span>, </span><span>type</span><span> WillAppearEvent</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * An action that logs a key press.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.log"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> LogKeyPressAction</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Handles the action appearing on the canvas.</span></span>
<span><span> * </span><span>@param</span><span> ev</span><span> Information about the event.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onWillAppear</span><span>(</span><span>ev</span><span>: </span><span>WillAppearEvent</span><span>): </span><span>void</span><span> | </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>ev</span><span>.</span><span>action</span><span>; </span><span>// instance of the action the event is for.</span></span>
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>device</span><span>; </span><span>// device information.</span></span>
<span><span>ev</span><span>.</span><span>payload</span><span>.</span><span>controller</span><span>; </span><span>// type of the action, i.e. key, or dial &amp; touchscreen.</span></span>
<span></span>
<span><span>// etc.</span></span>
<span><span>}</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Handles the user pressing a Stream Deck key (pedal, G-key, etc).</span></span>
<span><span> * </span><span>@param</span><span> ev</span><span> Information about the event.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>): </span><span>void</span><span> | </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>`Key pressed!`</span><span>);</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

Settings

You can [persist settings on actions](https://docs.elgato.com/streamdeck/sdk/guides/settings); these settings are provided as part of event arguments and can be accessed via `ev.payload.settings`.

## Accessing Visible Actions[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#accessing-visible-actions "Direct link to Accessing Visible Actions")

Your plugin's actions visible on Stream Deck can also be accessed outside of events, allowing you to retrieve information about them and update their appearance. This can be useful, for example, when your plugin has processed a background task and needs to update the actions shown on Stream Deck asynchronously.

Accessing your plugin's visible actions can be achieved in the following ways:

Visible Actions

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>// Iterate over all of your plugin's visible actions.</span></span>
<!-- -->
<span><span>streamDeck</span><span>.</span><span>actions</span><span>.</span><span>forEach</span><span>((</span><span>action</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>action</span><span>.</span><span>setTitle</span><span>(</span><span>"Hello world"</span><span>);</span></span>
<span><span>});</span></span>
```

Visible Actions of Type

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Example of accessing the visible actions of a specific action type.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>) {</span></span>
<span><span>// Iterate over visible actions with the UUID "com.elgato.hello-world.increment".</span></span>
<!-- -->
<span><span>this</span><span>.</span><span>actions</span><span>.</span><span>forEach</span><span>((</span><span>action</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setTitle</span><span>(</span><span>"Hello world!"</span><span>);</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

info

Please note, it is not possible to access or control actions that are not owned by your plugin.

## Events[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#events "Direct link to Events")

The following events are found on the `SingletonAction` class, and apply to both keys and dials.

### onDidReceiveResources[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#ondidreceiveresources "Direct link to onDidReceiveResources")

### onDidReceiveSettings[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#ondidreceivesettings "Direct link to onDidReceiveSettings")

### onPropertyInspectorDidAppear[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#onpropertyinspectordidappear "Direct link to onPropertyInspectorDidAppear")

### onPropertyInspectorDidDisappear[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#onpropertyinspectordiddisappear "Direct link to onPropertyInspectorDidDisappear")

### onSendToPlugin[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#onsendtoplugin "Direct link to onSendToPlugin")

### onTitleParametersDidChange[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#ontitleparametersdidchange "Direct link to onTitleParametersDidChange")

### onWillAppear[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#onwillappear "Direct link to onWillAppear")

### onWillDisappear[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#onwilldisappear "Direct link to onWillDisappear")

## Commands[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#commands "Direct link to Commands")

The following commands are available to all actions.

### getResources[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#getresources "Direct link to getResources")

### getSettings[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#getsettings "Direct link to getSettings")

### isDial[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#isdial "Direct link to isDial")

### isKey[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#iskey "Direct link to isKey")

### setResources[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#setresources "Direct link to setResources")

### setSettings[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#setsettings "Direct link to setSettings")

### showAlert[](https://docs.elgato.com/streamdeck/sdk/guides/actions/#showalert "Direct link to showAlert")