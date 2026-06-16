Property inspectors are HTML web views that provide users with an interface to adjust plugin settings.

Work in progress

The property inspector and its documentation are still in development. The information provided here is subject to change.

## Getting Started[](https://docs.elgato.com/streamdeck/sdk/guides/ui/#getting-started "Direct link to Getting Started")

Start by creating an HTML file in your `ui` directory within `*.sdPlugin`.

Plugin file structure

```
<span><span>.</span></span>
<span><span>├── *.sdPlugin/</span></span>
<span><span>│   ├── bin/</span></span>
<span><span>│   ├── imgs/</span></span>
<span><span>│   ├── logs/</span></span>
<span><span>│   ├── ui/</span></span>
<span><span>│   │   └── increment-counter.html</span></span>
<span><span>│   └── manifest.json</span></span>
<span><span>├── src/</span></span>
<span><span>│   ├── actions/</span></span>
<span><span>│   │   └── increment-counter.ts</span></span>
<span><span>│   └── plugin.ts</span></span>
<span><span>├── package.json</span></span>
<span><span>├── rollup.config.mjs</span></span>
<span><span>└── tsconfig.json</span></span>
```

Add the path to your property inspector HTML file in the action's `PropertyInspectorPath` property of your manifest file.

Manifest with a property inspector at the action level

```
<span><span>{</span></span>
<span><span>    "$schema"</span><span>: </span><span>"https://schemas.elgato.com/streamdeck/plugins/manifest.json"</span><span>,</span></span>
<span><span>    "Name"</span><span>: </span><span>"Counter"</span><span>,</span></span>
<span><span>    "Version"</span><span>: </span><span>"1.0.0.0"</span><span>,</span></span>
<span><span>    "Actions"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Name"</span><span>: </span><span>"Counter"</span><span>,</span></span>
<span><span>            "UUID"</span><span>: </span><span>"com.elgato.hello-world.increment"</span><span>,</span></span>
<span><span>            "PropertyInspectorPath"</span><span>: </span><span>"ui/increment-counter.html"</span></span>
<span><span>            // ...</span></span>
<span><span>        }</span></span>
<span><span>    ]</span></span>
<span><span>    // ...</span></span>
<span><span>}</span></span>
```

There can also be a property inspector declared at the plugin level that will appear for any actions that do not explicitly declare a `PropertyInspectorPath`.

Manifest with a property inspector at the plugin level

```
<span><span>{</span></span>
<span><span>    "$schema"</span><span>: </span><span>"https://schemas.elgato.com/streamdeck/plugins/manifest.json"</span><span>,</span></span>
<span><span>    "Name"</span><span>: </span><span>"Counter"</span><span>,</span></span>
<span><span>    "Version"</span><span>: </span><span>"1.0.0.0"</span><span>,</span></span>
<span><span>    "PropertyInspectorPath"</span><span>: </span><span>"increment-counter.html"</span><span>, </span></span>
<span><span>    "Actions"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Name"</span><span>: </span><span>"Counter"</span><span>,</span></span>
<span><span>            "UUID"</span><span>: </span><span>"ui/com.elgato.hello-world.increment"</span></span>
<span><span>            // ...</span></span>
<span><span>        }</span></span>
<span><span>    ]</span></span>
<span><span>    // ...</span></span>
<span><span>}</span></span>
```

## UI Library[](https://docs.elgato.com/streamdeck/sdk/guides/ui/#ui-library "Direct link to UI Library")

The Stream Deck UI library, called sdpi-components (Stream Deck Property Inspector Components), is designed to streamline building property inspectors. The UI library enables communication with your plugin from the property inspector, as well as providing a collection of web components for building consistent and user-friendly interfaces.

To use the UI library, you will need to reference it in one of the following ways.

-   Local (recommended)
-   Remote

Referencing the UI library locally ensures a consistent and predictable experience for users, and where applicable allows your plugin to work without an internet connection.

To reference the UI library locally, download [sdpi-components.js](https://sdpi-components.dev/releases/v4/sdpi-components.js) alongside your local HTML file, and reference the file within your property inspector.

Property inspector HTML

```
<span><span>&lt;!</span><span>doctype</span><span> html</span><span>&gt;</span></span>
<span><span>&lt;</span><span>html</span><span>&gt;</span></span>
<span></span>
<span><span>&lt;</span><span>head</span><span> lang</span><span>=</span><span>"en"</span><span>&gt;</span></span>
<span><span>    &lt;</span><span>meta</span><span> charset</span><span>=</span><span>"utf-8"</span><span> /&gt;</span></span>

<span><span>    &lt;</span><span>script</span><span> src</span><span>=</span><span>"sdpi-components.js"</span><span>&gt;&lt;/</span><span>script</span><span>&gt;</span></span>
<span><span>&lt;/</span><span>head</span><span>&gt;</span></span>
<span></span>
<span><span>&lt;</span><span>body</span><span>&gt;</span></span>
<span><span>    &lt;</span><span>sdpi-item</span><span> label</span><span>=</span><span>"Name"</span><span>&gt;</span></span>
<span><span>        &lt;</span><span>sdpi-textfield</span><span> setting</span><span>=</span><span>"name"</span><span>&gt;&lt;/</span><span>sdpi-textfield</span><span>&gt;</span></span>
<span><span>    &lt;/</span><span>sdpi-item</span><span>&gt;</span></span>
<span><span>&lt;/</span><span>body</span><span>&gt;</span></span>
<span></span>
<span><span>&lt;/</span><span>html</span><span>&gt;</span></span>
```

### Components[](https://docs.elgato.com/streamdeck/sdk/guides/ui/#components "Direct link to Components")

The following components are available as part of the sdpi-components UI library.

| Component | sdpi-component |
| --- | --- |
| [Button](https://sdpi-components.dev/docs/components/button) | `<sdpi-button>` |
| [Checkbox](https://sdpi-components.dev/docs/components/checkbox) | `<sdpi-checkbox>` |
| [Checkbox List](https://sdpi-components.dev/docs/components/checkbox-list) | `<sdpi-checkbox-list>` |
| [Color](https://sdpi-components.dev/docs/components/color) | `<sdpi-color>` |
| [Date](https://sdpi-components.dev/docs/components/calendar/date) | `<sdpi-calendar type="date">` |
| [Datetime (Local)](https://sdpi-components.dev/docs/components/calendar/datetime-local) | `<sdpi-calendar type="datetime-local">` |
| [Delegate](https://sdpi-components.dev/docs/components/delegate) | `<sdpi-delegate>` |
| [File](https://sdpi-components.dev/docs/components/file) | `<sdpi-file>` |
| [Month](https://sdpi-components.dev/docs/components/calendar/month) | `<sdpi-calendar type="month">` |
| [Password](https://sdpi-components.dev/docs/components/password) | `<sdpi-password>` |
| [Radio](https://sdpi-components.dev/docs/components/radio) | `<sdpi-radio>` |
| [Range](https://sdpi-components.dev/docs/components/range) | `<sdpi-range>` |
| [Select](https://sdpi-components.dev/docs/components/select) | `<sdpi-select>` |
| [Textarea](https://sdpi-components.dev/docs/components/textarea) | `<sdpi-textarea>` |
| [Textfield](https://sdpi-components.dev/docs/components/textfield) | `<sdpi-textfield>` |
| [Time](https://sdpi-components.dev/docs/components/calendar/time) | `<sdpi-calendar type="time">` |
| [Week](https://sdpi-components.dev/docs/components/calendar/week) | `<sdpi-calendar type="week">` |

### Stream Deck Client[](https://docs.elgato.com/streamdeck/sdk/guides/ui/#stream-deck-client "Direct link to Stream Deck Client")

The [Stream Deck Client](https://sdpi-components.dev/docs/helpers/stream-deck-client) allows the property inspector to communicate directly with the plugin. Once you've included the `sdpi-components.js` script tag in the property inspector's HTML file, you can reference `streamDeckClient` from the `SDPIComponents` namespace.

-   Local (recommended)
-   Remote

Property inspector HTML

```
<span><span>&lt;!</span><span>doctype</span><span> html</span><span>&gt;</span></span>
<span><span>&lt;</span><span>html</span><span>&gt;</span></span>
<span></span>
<span><span>&lt;</span><span>head</span><span> lang</span><span>=</span><span>"en"</span><span>&gt;</span></span>
<span><span>    &lt;</span><span>meta</span><span> charset</span><span>=</span><span>"utf-8"</span><span> /&gt;</span></span>

<span><span>    &lt;</span><span>script</span><span> src</span><span>=</span><span>"sdpi-components.js"</span><span>&gt;&lt;/</span><span>script</span><span>&gt;</span></span>
<span><span>&lt;/</span><span>head</span><span>&gt;</span></span>
<span></span>
<span><span>&lt;</span><span>body</span><span>&gt;</span></span>

<span><span>    &lt;</span><span>script</span><span>&gt;</span></span>
<span><span>        const</span><span> { </span><span>streamDeckClient</span><span> } </span><span>=</span><span> SDPIComponents</span><span>;</span></span>
<span></span>
<span><span>        streamDeckClient</span><span>.</span><span>setSettings</span><span>({</span></span>
<span><span>            name:</span><span> "John Doe"</span><span>,</span></span>
<span><span>            showName:</span><span> true</span><span>,</span></span>
<span><span>            favColor:</span><span> "green"</span><span>,</span></span>
<span><span>        });</span></span>
<span><span>    &lt;/</span><span>script</span><span>&gt;</span></span>
<span><span>&lt;/</span><span>body</span><span>&gt;</span></span>
<span></span>
<span><span>&lt;/</span><span>html</span><span>&gt;</span></span>
```

## Debugging[](https://docs.elgato.com/streamdeck/sdk/guides/ui/#debugging "Direct link to Debugging")

To debug the property inspector, [developer mode](https://docs.elgato.com/streamdeck/cli/commands/dev) must be enabled. Developer mode is enabled by default when the CLI tool's [`create`](https://docs.elgato.com/streamdeck/cli/commands/create) command runs, but can also be enabled directly with the [`dev`](https://docs.elgato.com/streamdeck/cli/commands/dev) command.

Once enabled, the remote debugger will be available at [`http://localhost:23654/`](http://localhost:23654/) with a list of available pages. Select the property inspector's page to debug using the browser's built-in web development tools. In most browsers these tools can be accessed by pressing `F12` or the `inspect` option in the context menu.

Open the property inspector

The property inspector must be visible within Stream Deck for the page to appear in the list of pages availabe for debug.

Utilizing the `didReceiveSettings` event within the plugin's action may also be useful for debugging settings and the property inspector.

Receive settings callback

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>action</span><span>, </span><span>type</span><span> DidReceiveSettingsEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>// Define the action's settings type.</span></span>
<span><span>type</span><span> Settings</span><span> = {</span></span>
<span><span>count</span><span>: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.counter"</span><span> })</span></span>
<span><span>class</span><span> Counter</span><span> extends</span><span> SingletonAction</span><span>&lt;</span><span>Settings</span><span>&gt; {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the application-layer receives the settings from the UI.</span></span>
<span><span> */</span></span>
<!-- -->
<span><span>override</span><span> onDidReceiveSettings</span><span>(</span><span>ev</span><span>: </span><span>DidReceiveSettingsEvent</span><span>&lt;</span><span>Settings</span><span>&gt;): </span><span>void</span><span> {</span></span>
<span><span>// Handle the settings changing in the property inspector (UI).</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>actions</span><span>.</span><span>registerAction</span><span>(</span><span>new</span><span> Counter</span><span>());</span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```